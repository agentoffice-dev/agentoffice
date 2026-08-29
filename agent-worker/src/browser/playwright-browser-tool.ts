import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium, type Browser, type BrowserContext, type Frame, type Page } from 'playwright'
import { workerApi } from '../api-client.js'
import { config } from '../config.js'
import type { BrowserObservation } from '../types.js'
import type { BrowserSession, BrowserTool } from './browser-tool.js'
import { CollaboraDriver } from './office-drivers/collabora-driver.js'
import type { FindQuery, FindResult, OfficeDriver, TextFormat } from './office-drivers/office-driver.js'
import { OnlyOfficeDriver } from './office-drivers/onlyoffice-driver.js'

function resolveDriver(kind: string): OfficeDriver {
  return kind === 'onlyoffice' ? new OnlyOfficeDriver() : new CollaboraDriver()
}

/** An editor page that outlived its task and is waiting for the next one. */
type CachedSession = {
  documentId: string
  context: BrowserContext
  page: Page
  idleTimer?: NodeJS.Timeout
}

export class PlaywrightBrowserTool implements BrowserTool {
  private browser?: Browser
  private readonly driver: OfficeDriver
  // Focusing means clicking, and a click moves the caret. Do it once per
  // session and only again after something else took the focus away.
  private readonly focused = new WeakSet<Page>()
  // Pages that have already been clicked into once. Their caret is where the
  // agent put it, so focus is handed back without clicking again.
  private readonly clicked = new WeakSet<Page>()
  // Loading an Office document costs seconds of wall clock, so a page is kept
  // open after its task ends. Insertion order into this map is LRU order.
  private readonly sessions = new Map<string, CachedSession>()
  // Tracing is armed once per context and then sliced per task, so only the
  // contexts that really have a recording running are asked for chunks.
  private readonly tracing = new WeakSet<BrowserContext>()

  constructor(driver: OfficeDriver = resolveDriver(config.editorKind)) {
    this.driver = driver
  }

  async start(): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: config.editorHostResolverRules ? [`--host-resolver-rules=${config.editorHostResolverRules}`] : [],
    })
    await mkdir(config.artifactDir, { recursive: true })
  }

  async stop(): Promise<void> {
    for (const documentId of [...this.sessions.keys()]) await this.closeSession(documentId)
    await this.browser?.close()
  }

  async openDocument(taskId: string, documentId: string): Promise<BrowserSession> {
    if (!this.browser) throw new Error('Browser tool has not been started')

    const reused = await this.takeReusableSession(documentId)
    if (reused) {
      console.log(`Reusing the editor session already open for document ${documentId} (task ${taskId})`)
      await this.startTrace(reused.context, taskId)
      // The caret is wherever the previous task left it, so make the next
      // document operation click the body again the way a fresh page does.
      this.resetDocumentFocus(reused.page)
      const observation = await this.observe(taskId, reused.page)
      return { context: reused.context, page: reused.page, observation }
    }

    return await this.openFreshSession(taskId, documentId)
  }

  private async openFreshSession(taskId: string, documentId: string): Promise<BrowserSession> {
    const auth = await workerApi.login()
    const context = await this.browser!.newContext({ viewport: { width: 1600, height: 1000 } })
    try {
      // Reading the document back relies on copying a selection out of the editor.
      await context.grantPermissions(['clipboard-read', 'clipboard-write'])
      await this.armTracing(context)
      await this.startTrace(context, taskId)
      await context.addInitScript(value => localStorage.setItem('auth', JSON.stringify(value)), auth)
      const page = await context.newPage()
      await page.goto(`${config.appBaseUrl}/editor/${documentId}`, { waitUntil: 'domcontentloaded' })
      const iframe = page.locator('iframe[name="wopi-frame"]')
      await iframe.waitFor({ state: 'visible', timeout: 60_000 })
      await this.driver.waitForReady(page)
      const observation = await this.observe(taskId, page)
      return { context, page, observation }
    } catch (error) {
      // The caller never received the context, so this is the only place that can
      // keep the trace of the failed load and close the context.
      await this.stopTrace(context, `${taskId}-failed`, config.traceMode !== 'off').catch(() => undefined)
      await context.close().catch(() => undefined)
      throw error
    }
  }

  /**
   * A cached session leaves the map while it is in use, so two tasks can never be
   * handed the same page; `releaseSession` puts it back.
   */
  private async takeReusableSession(documentId: string): Promise<CachedSession | undefined> {
    if (config.sessionMax < 1) return undefined
    const session = this.sessions.get(documentId)
    if (!session) return undefined
    this.sessions.delete(documentId)
    if (session.idleTimer) clearTimeout(session.idleTimer)
    if (await this.isReusable(session)) return session
    await this.destroy(session)
    return undefined
  }

  /**
   * A page whose editor died (crash, navigation, expired session) must be
   * reopened. `waitForReady` is the same check the fresh path makes and returns
   * almost immediately on a healthy page, so it is cheap enough to run here.
   */
  private async isReusable(session: CachedSession): Promise<boolean> {
    if (session.page.isClosed()) return false
    try {
      await this.driver.waitForReady(session.page, 5_000)
      return true
    } catch {
      return false
    }
  }

  async releaseSession(taskId: string, documentId: string, session: BrowserSession, failed: boolean): Promise<void> {
    const keepTrace = config.traceMode === 'always' || (config.traceMode === 'failures' && failed)
    await this.stopTrace(session.context, failed ? `${taskId}-failed` : taskId, keepTrace).catch(() => undefined)

    // A failed task can leave the editor mid-dialog or mid-selection; that page
    // must never become the starting point of the next task.
    if (failed || session.page.isClosed() || config.sessionMax < 1) {
      await this.destroy({ documentId, context: session.context, page: session.page })
      return
    }
    this.cache({ documentId, context: session.context, page: session.page })
  }

  private cache(session: CachedSession): void {
    this.sessions.delete(session.documentId)
    // An idle session still holds the document's WOPI lock, so it is not kept forever.
    session.idleTimer = setTimeout(() => { void this.closeSession(session.documentId) }, config.sessionIdleMs)
    session.idleTimer.unref()
    this.sessions.set(session.documentId, session)

    while (this.sessions.size > config.sessionMax) {
      const oldest = this.sessions.keys().next().value
      if (oldest === undefined) break
      void this.closeSession(oldest)
    }
  }

  private async closeSession(documentId: string): Promise<void> {
    const session = this.sessions.get(documentId)
    if (!session) return
    // Dropped from the map before the first await, so the eviction loop above and
    // a concurrent open both see the removal immediately.
    this.sessions.delete(documentId)
    await this.destroy(session)
  }

  private async destroy(session: CachedSession): Promise<void> {
    if (session.idleTimer) clearTimeout(session.idleTimer)
    await session.context.close().catch(() => undefined)
  }

  /*
   * Tracing: recording is armed once for the lifetime of the context and cut into
   * one chunk per task, because a reused context outlives the task that made it.
   */

  private async armTracing(context: BrowserContext): Promise<void> {
    if (config.traceMode === 'off') return
    await context.tracing.start({ screenshots: true, snapshots: true })
    this.tracing.add(context)
  }

  private async startTrace(context: BrowserContext, taskId: string): Promise<void> {
    if (!this.tracing.has(context)) return
    await context.tracing.startChunk({ title: taskId })
  }

  private async stopTrace(context: BrowserContext, name: string, keep: boolean): Promise<void> {
    if (!this.tracing.has(context)) return
    await context.tracing.stopChunk(keep ? { path: path.join(config.artifactDir, `${name}.zip`) } : {})
  }

  /**
   * Reading the document text moves the caret (it copies a select-all), so it is
   * opt-in rather than part of every observation.
   */
  async observe(taskId: string, page: Page, options: { includeText?: boolean } = {}): Promise<BrowserObservation> {
    // JPEG rather than PNG: this screenshot goes to the model on every turn, and a
    // lossy editor screenshot stays perfectly readable at a fraction of the bytes.
    const screenshotPath = path.join(config.artifactDir, `${taskId}-${Date.now()}.jpg`)
    await page.screenshot({
      path: screenshotPath,
      fullPage: false,
      type: 'jpeg',
      quality: config.screenshotQuality,
      scale: 'css',
    })
    let documentText: string | undefined
    if (options.includeText) {
      try {
        documentText = await this.readDocumentText(page)
      } catch {
        documentText = undefined
      }
    }
    return {
      url: page.url(),
      title: await page.title(),
      frames: page.frames().map(frame => ({ name: frame.name(), url: frame.url() })),
      screenshotPath,
      documentText,
    }
  }

  async click(page: Page, selector: string): Promise<void> {
    await page.locator(selector).click({ timeout: 15_000 })
  }

  async type(page: Page, selector: string, text: string): Promise<void> {
    await page.locator(selector).fill(text, { timeout: 15_000 })
  }

  async press(page: Page, keys: string): Promise<void> {
    await page.keyboard.press(keys)
  }

  /**
   * The frame the editor really lives in. OnlyOffice nests its own frame inside
   * the WOPI iframe, so a tool that reaches for `wopi-frame` by name finds an
   * empty wrapper and every selector it looks for is missing.
   */
  editorFrame(page: Page): Promise<Frame> {
    return this.driver.editorFrame(page)
  }

  async focusDocument(page: Page): Promise<void> {
    await this.driver.focusDocument(page)
    this.focused.add(page)
    this.clicked.add(page)
  }

  /** Call after any interaction that could move focus out of the document. */
  releaseDocumentFocus(page: Page): void {
    this.focused.delete(page)
  }

  /** A page starting a new task is treated as untouched, caret included. */
  private resetDocumentFocus(page: Page): void {
    this.focused.delete(page)
    this.clicked.delete(page)
  }

  /**
   * Once a page has been clicked into, focus comes back through the editor's own
   * API rather than through another click. A second click is what used to turn
   * "press Enter in the search bar" into "type Enter over the selected text":
   * it moved the caret, dropped the selection, and could land on a panel
   * floating above the page.
   */
  private async ensureDocumentFocus(page: Page): Promise<void> {
    if (this.focused.has(page)) return
    if (this.clicked.has(page) && await this.driver.restoreKeyboardFocus(page)) {
      this.focused.add(page)
      return
    }
    await this.focusDocument(page)
  }

  async writeText(page: Page, text: string): Promise<void> {
    await this.ensureDocumentFocus(page)
    // Typed one key at a time so the editor's input handler sees real keystrokes.
    await page.keyboard.type(text, { delay: config.typeDelayMs })
    await page.waitForTimeout(config.writeSettleMs)
  }

  async pressInDocument(page: Page, keys: string[]): Promise<void> {
    await this.ensureDocumentFocus(page)
    for (const key of keys) {
      await page.keyboard.press(key)
      await page.waitForTimeout(config.keyPressDelayMs)
    }
  }

  async readDocumentText(page: Page): Promise<string> {
    await this.ensureDocumentFocus(page)
    const frame = await this.driver.editorFrame(page)

    // Right after load the editor can swallow the first copy, so the select and
    // copy are retried before reporting the document as unreadable.
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await page.waitForTimeout(1000)
      // Emptying the clipboard first means whatever is read back belongs to this
      // copy, which is what makes polling for it safe.
      await this.clearClipboard(frame)
      await page.keyboard.press('Control+A')
      await page.keyboard.press('Control+C')
      const text = await this.awaitClipboard(page, frame)
      if (text.trim().length > 0) {
        // Leave the caret collapsed so a following edit does not overwrite everything.
        await page.keyboard.press('ArrowRight')
        return text
      }
    }

    await page.keyboard.press('ArrowRight')
    throw new Error('The editor did not return any selected text through the clipboard (the document may be empty)')
  }

  private async clearClipboard(frame: Frame): Promise<void> {
    await frame.evaluate(async () => {
      try {
        await navigator.clipboard.writeText('')
      } catch {
        /* The copy below is still worth attempting. */
      }
    }).catch(() => undefined)
  }

  /** Polls instead of guessing how long the editor takes to fill the clipboard. */
  private async awaitClipboard(page: Page, frame: Frame): Promise<string> {
    const deadline = Date.now() + 900
    let text = ''
    do {
      await page.waitForTimeout(150)
      text = await frame.evaluate(async () => {
        try {
          return await navigator.clipboard.readText()
        } catch {
          return ''
        }
      })
    } while (text.trim().length === 0 && Date.now() < deadline)
    return text
  }

  /**
   * Formatting applies to whatever is selected, so this deliberately skips
   * `ensureDocumentFocus`: focusing clicks into the page, and that click would
   * collapse the selection the caller just built.
   */
  async applyFormatting(page: Page, format: TextFormat): Promise<void> {
    await this.driver.applyFormatting(page, format)
  }

  /**
   * Searching leaves the match selected, which is what the next edit acts on, so
   * this must not touch the caret either.
   */
  findText(page: Page, find: FindQuery): Promise<FindResult> {
    return this.driver.findText(page, find)
  }

  async save(page: Page): Promise<void> {
    await this.ensureDocumentFocus(page)
    await this.driver.save(page)
  }
}
