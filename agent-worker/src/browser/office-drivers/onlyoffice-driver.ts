import type { Frame, Page } from 'playwright'
import { config } from '../../config.js'
import {
  clickInsideFrameElement,
  type FindQuery,
  type FindResult,
  type OfficeDriver,
  parseColor,
  reportFormattingProblems,
  type Rgb,
  settleOnReadySignal,
  type TextFormat,
  waitForAnySelector,
  waitForNamedFrame,
} from './office-driver.js'

const DOCUMENT_SELECTORS = ['#id_target_cursor', '#editor_sdk canvas', '#editor_sdk']
/** OnlyOffice only creates the caret element once the editor accepts input. */
const RENDERED_SIGNAL = '#id_target_cursor'

/**
 * The slice of OnlyOffice's editor API this driver uses. It is the same object
 * the editor's own toolbar drives, reached inside the editor frame; the toolbar
 * DOM is a poor substitute, because a colour or a font sits several clicks deep
 * in a palette and every one of those clicks can miss.
 */
type OnlyOfficeApi = {
  put_Style(name: string): void
  put_TextPrFontName(name: string): void
  put_TextPrFontSize(points: number): void
  put_TextColor(color: unknown): void
  asc_Save(): void
  asc_setIsForceSaveOnUserSave?(force: boolean): void
  /** What the editor calls itself when a dialog closes and the text takes the keys again. */
  asc_enableKeyEvents?(enable: boolean): void
  /** Runs a search from the caret, wrapping, and selects the match it lands on. */
  asc_findText(settings: unknown, forward: boolean): number
  asc_GetSelectedText(): string
}

type OnlyOfficeWindow = Window & {
  /** The search settings object lives in the common namespace, not in `Asc`. */
  AscCommon?: {
    CSearchSettings?: new () => {
      put_Text(text: string): void
      put_MatchCase(match: boolean): void
      put_WholeWords(whole: boolean): void
    }
  }
  Asc?: {
    editor?: OnlyOfficeApi
    asc_CColor?: new () => {
      put_type(type: number): void
      put_r(value: number): void
      put_g(value: number): void
      put_b(value: number): void
      put_auto(auto: boolean): void
    }
    c_oAscColor?: { COLOR_TYPE_SRGB: number }
  }
}

/** OnlyOffice Document Server, which nests its own editor frame inside the WOPI iframe. */
export class OnlyOfficeDriver implements OfficeDriver {
  readonly kind = 'onlyoffice'

  async editorFrame(page: Page, timeoutMs = 60_000): Promise<Frame> {
    const wopiFrame = await waitForNamedFrame(page, 'wopi-frame', timeoutMs)
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const inner = wopiFrame.childFrames().find(frame => frame.name().startsWith('frameEditor'))
      if (inner && inner.url() !== 'about:blank') return inner
      await page.waitForTimeout(250)
    }
    return wopiFrame
  }

  async waitForReady(page: Page, timeoutMs = 60_000): Promise<void> {
    const frame = await this.editorFrame(page, timeoutMs)
    await waitForAnySelector(frame, DOCUMENT_SELECTORS, timeoutMs)
    await settleOnReadySignal(frame, RENDERED_SIGNAL, config.readySettleMs)
  }

  async focusDocument(page: Page): Promise<void> {
    const frame = await this.editorFrame(page)
    const selector = await waitForAnySelector(frame, DOCUMENT_SELECTORS, 15_000)
    await clickInsideFrameElement(page, frame, selector, { x: 120, y: 120 })
  }

  /**
   * `asc_enableKeyEvents(true)` is the editor's own "the text has the keyboard
   * again" call, and `#area_id` is the hidden textarea it reads keystrokes from.
   * Together they restore input without touching the caret or the selection.
   */
  async restoreKeyboardFocus(page: Page): Promise<boolean> {
    const frame = await this.editorFrame(page)
    return await frame.evaluate(() => {
      const api = (window as OnlyOfficeWindow).Asc?.editor
      if (!api || typeof api.asc_enableKeyEvents !== 'function') return false
      api.asc_enableKeyEvents(true)
      document.getElementById('area_id')?.focus()
      return true
    }).catch(() => false)
  }

  async findText(page: Page, find: FindQuery): Promise<FindResult> {
    const frame = await this.editorFrame(page)
    const found = await frame.evaluate((query: FindQuery) => {
      const scope = window as OnlyOfficeWindow
      const api = scope.Asc?.editor
      const Settings = scope.AscCommon?.CSearchSettings
      if (!api || !Settings) throw new Error('the OnlyOffice search API is not available on this page')

      const settings = new Settings()
      settings.put_Text(query.query)
      settings.put_MatchCase(query.matchCase === true)
      settings.put_WholeWords(query.wholeWords === true)
      // A non-zero result is the 1-based index of the match it selected.
      return api.asc_findText(settings, true) > 0 ? api.asc_GetSelectedText() : null
    }, find)

    await page.waitForTimeout(config.writeSettleMs)
    return found === null ? { outcome: 'not-found' } : { outcome: 'selected', text: found }
  }

  async applyFormatting(page: Page, format: TextFormat): Promise<void> {
    const frame = await this.editorFrame(page)
    const rgb = format.color ? parseColor(format.color) : undefined
    const problems = await frame.evaluate(([spec, color]: [TextFormat, Rgb | undefined]) => {
      const asc = (window as OnlyOfficeWindow).Asc
      const api = asc?.editor
      if (!api) return ['the OnlyOffice editor API is not available on this page']

      const found: string[] = []
      const attempt = (label: string, apply: () => void) => {
        try {
          apply()
        } catch (error) {
          found.push(`${label} failed: ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      // A paragraph style carries its own font and colour, so it is applied first
      // and the explicit properties below overwrite what it brought with it.
      if (spec.paragraphStyle) attempt(`paragraph style "${spec.paragraphStyle}"`, () => api.put_Style(spec.paragraphStyle!))
      if (spec.fontName) attempt(`font "${spec.fontName}"`, () => api.put_TextPrFontName(spec.fontName!))
      if (spec.fontSize) attempt(`font size ${spec.fontSize}`, () => api.put_TextPrFontSize(spec.fontSize!))
      if (color) attempt('text colour', () => {
        if (!asc?.asc_CColor || !asc.c_oAscColor) throw new Error('the editor exposes no colour type')
        const value = new asc.asc_CColor()
        value.put_type(asc.c_oAscColor.COLOR_TYPE_SRGB)
        value.put_r(color.r)
        value.put_g(color.g)
        value.put_b(color.b)
        value.put_auto(false)
        api.put_TextColor(value)
      })
      return found
    }, [format, rgb] as [TextFormat, Rgb | undefined])

    await page.waitForTimeout(config.writeSettleMs)
    reportFormattingProblems(problems)
  }

  /**
   * Ctrl+S only marks the document saved inside the editor; the document server
   * then decides for itself when to push the file back to the WOPI host, which
   * can be minutes later. A forced save makes that round trip happen now, so
   * `save_document` can observe the new version it waits for.
   */
  async save(page: Page): Promise<void> {
    const frame = await this.editorFrame(page)
    const forced = await frame.evaluate(() => {
      const api = (window as OnlyOfficeWindow).Asc?.editor
      if (!api || typeof api.asc_Save !== 'function') return false
      // Older builds have no force-save switch and still save on their own schedule.
      try {
        api.asc_setIsForceSaveOnUserSave?.(true)
      } catch {
        /* Fall through: an unforced save is still better than none. */
      }
      api.asc_Save()
      return true
    }).catch(() => false)

    if (!forced) await page.keyboard.press('Control+S')
    // Only a beat for the editor to start the round trip: the save_document tool
    // confirms the result by watching for a new document version.
    await page.waitForTimeout(300)
  }
}
