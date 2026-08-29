import type { Frame, Page } from 'playwright'

/**
 * Character and paragraph formatting that has no keyboard shortcut, so it can
 * only be applied through the editor itself. Every field is optional; the ones
 * that are set are applied to the current selection.
 */
export type TextFormat = {
  fontName?: string
  /** Point size, the way the editor's own font-size box states it. */
  fontSize?: number
  /** `#RRGGBB`, or one of the common colour names. */
  color?: string
  /** Paragraph style name, for example `Heading 1` or `Normal`. */
  paragraphStyle?: string
}

export type Rgb = { r: number; g: number; b: number }

/** One text search, run by the editor itself so the match ends up selected. */
export type FindQuery = {
  query: string
  matchCase?: boolean
  wholeWords?: boolean
}

/**
 * What a search did. `dispatched` is its own answer rather than a synonym for
 * success: some editors run the search over their websocket and cannot say, in
 * the same breath, whether anything matched.
 */
export type FindResult =
  | { outcome: 'selected'; text: string }
  | { outcome: 'not-found' }
  | { outcome: 'dispatched' }

/**
 * Editor-specific knowledge. Everything above this layer speaks in document
 * operations ("write text", "save"); only a driver knows which frame, selector,
 * or shortcut a particular WOPI editor uses.
 */
export interface OfficeDriver {
  readonly kind: string
  /** Frame that actually renders the document — and, with it, the editor's own UI. */
  editorFrame(page: Page, timeoutMs?: number): Promise<Frame>
  /** Resolves once the document is loaded and accepts input. */
  waitForReady(page: Page, timeoutMs?: number): Promise<void>
  /** Puts the caret in the document body so keyboard input reaches the text. */
  focusDocument(page: Page): Promise<void>
  /**
   * Hands keyboard input back to the document *without clicking*, and returns
   * whether it worked. Clicking is the destructive way to do this: it moves the
   * caret, drops whatever was selected, and can land on a panel that happens to
   * float over the text. Drivers that cannot do it silently return false and the
   * caller falls back to a click.
   */
  restoreKeyboardFocus(page: Page): Promise<boolean>
  /**
   * Finds text and leaves the match selected, ready for the next edit. Repeated
   * calls walk to the following match.
   */
  findText(page: Page, find: FindQuery): Promise<FindResult>
  /**
   * Applies formatting to the current selection. Must not click into the
   * document: a click would collapse the very selection being formatted.
   */
  applyFormatting(page: Page, format: TextFormat): Promise<void>
  /** Triggers the editor's own save command. */
  save(page: Page): Promise<void>
}

/** The colour names a requester is most likely to use by name rather than by hex. */
const NAMED_COLORS: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff',
  yellow: '#ffff00', orange: '#ffa500', purple: '#800080', pink: '#ffc0cb', brown: '#a52a2a',
  grey: '#808080', gray: '#808080', cyan: '#00ffff', magenta: '#ff00ff',
}

/** Accepts `#RRGGBB`, `RRGGBB`, `#RGB` and the names above. */
export function parseColor(value: string): Rgb {
  const input = value.trim().toLowerCase()
  const hex = (NAMED_COLORS[input] ?? input).replace(/^#/, '')
  const full = hex.length === 3 ? hex.split('').map(digit => digit + digit).join('') : hex
  if (!/^[0-9a-f]{6}$/.test(full))
    throw new Error(`"${value}" is not a colour: use #RRGGBB (for example #FF0000) or a name such as red.`)
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

/**
 * Every driver applies formatting field by field, so one unsupported property
 * does not hide the ones that did land. This turns those partial failures into
 * a single error the agent can act on.
 */
export function reportFormattingProblems(problems: string[]): void {
  if (problems.length > 0) throw new Error(problems.join('; '))
}

export async function waitForNamedFrame(page: Page, name: string, timeoutMs: number): Promise<Frame> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const frame = page.frames().find(candidate => candidate.name() === name)
    if (frame && frame.url() && frame.url() !== 'about:blank') return frame
    await page.waitForTimeout(250)
  }
  throw new Error(`Editor frame "${name}" did not load within ${timeoutMs}ms`)
}

export async function waitForAnySelector(frame: Frame, selectors: string[], timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      try {
        if (await frame.locator(selector).first().isVisible()) return selector
      } catch (error) {
        lastError = error
      }
    }
    await frame.page().waitForTimeout(250)
  }
  throw new Error(`None of [${selectors.join(', ')}] became visible within ${timeoutMs}ms (${String(lastError ?? 'no match')})`)
}

/**
 * The document container exists before the editor has painted anything into it.
 * Rather than sleeping for the worst case every time, wait for a signal that the
 * editor really rendered — a tile, a caret — and cap that wait at the sleep we
 * would otherwise have taken unconditionally, so this can only be faster.
 */
export async function settleOnReadySignal(
  frame: Frame,
  selector: string,
  capMs: number,
  floorMs = 200,
): Promise<void> {
  const deadline = Date.now() + capMs
  while (Date.now() < deadline) {
    try {
      if (await frame.locator(selector).first().count() > 0) break
    } catch {
      /* The frame may still be swapping documents; try again. */
    }
    await frame.page().waitForTimeout(100)
  }
  // The signal only says the editor painted; a short beat lets it wire up input.
  await frame.page().waitForTimeout(floorMs)
}

/**
 * Clicks inside the document area the way a person does: at real page
 * coordinates, so whichever canvas layer is on top receives the event.
 * A `locator.click()` on the container is intercepted by the editor's own
 * overlay panes and never lands.
 */
export async function clickInsideFrameElement(
  page: Page,
  frame: Frame,
  selector: string,
  offset: { x: number; y: number },
): Promise<void> {
  const frameElement = await frame.frameElement()
  const frameBox = await frameElement.boundingBox()
  const targetBox = await frame.locator(selector).first().boundingBox()
  if (!frameBox || !targetBox) throw new Error(`Could not locate the document area (${selector})`)

  const x = frameBox.x + targetBox.x + Math.min(offset.x, Math.max(targetBox.width / 2, 1))
  const y = frameBox.y + targetBox.y + Math.min(offset.y, Math.max(targetBox.height / 2, 1))
  await page.mouse.click(x, y)
  await page.waitForTimeout(120)
}
