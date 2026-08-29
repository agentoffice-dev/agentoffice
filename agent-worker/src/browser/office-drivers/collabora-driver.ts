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

const DOCUMENT_SELECTORS = ['#document-container', '.leaflet-layer', 'canvas']
/** Collabora marks each painted tile, so the first one means the document rendered. */
const RENDERED_SIGNAL = '.leaflet-tile-loaded'

/**
 * Collabora drives LibreOffice through UNO commands, and its own toolbar sends
 * exactly the ones below. Going through them keeps a font or a colour to one
 * call instead of a walk through a palette popup.
 */
type UnoArgument = { type: string; value: string | number | boolean }
type CollaboraWindow = Window & {
  app?: {
    map?: {
      sendUnoCommand(command: string, args?: Record<string, UnoArgument>): void
      /** Leaflet's own focus call: gives the map the keys back without a click. */
      focus?(): void
    }
  }
}

/** Collabora Online (Writer/Calc/Impress) rendered inside the WOPI iframe. */
export class CollaboraDriver implements OfficeDriver {
  readonly kind = 'collabora'

  editorFrame(page: Page, timeoutMs = 60_000): Promise<Frame> {
    return waitForNamedFrame(page, 'wopi-frame', timeoutMs)
  }

  async waitForReady(page: Page, timeoutMs = 60_000): Promise<void> {
    const frame = await this.editorFrame(page, timeoutMs)
    await waitForAnySelector(frame, DOCUMENT_SELECTORS, timeoutMs)
    // The canvas appears before the first tile render finishes.
    await settleOnReadySignal(frame, RENDERED_SIGNAL, config.readySettleMs)
  }

  async focusDocument(page: Page): Promise<void> {
    const frame = await this.editorFrame(page)
    const selector = await waitForAnySelector(frame, DOCUMENT_SELECTORS, 15_000)
    // Near the top-left of the text area, past the ruler and page margin.
    await clickInsideFrameElement(page, frame, selector, { x: 120, y: 120 })
  }

  async restoreKeyboardFocus(page: Page): Promise<boolean> {
    const frame = await this.editorFrame(page)
    return await frame.evaluate(() => {
      const map = (window as CollaboraWindow).app?.map
      if (!map || typeof map.focus !== 'function') return false
      map.focus()
      return true
    }).catch(() => false)
  }

  /**
   * `.uno:ExecuteSearch` is the command Collabora's own search bar sends, and the
   * editor selects whatever it lands on. It reports the result asynchronously
   * over the websocket, so the selected text cannot be read back here.
   */
  async findText(page: Page, find: FindQuery): Promise<FindResult> {
    const frame = await this.editorFrame(page)
    const sent = await frame.evaluate((query: FindQuery) => {
      const map = (window as CollaboraWindow).app?.map
      if (!map || typeof map.sendUnoCommand !== 'function') return false
      map.sendUnoCommand('.uno:ExecuteSearch', {
        'SearchItem.SearchString': { type: 'string', value: query.query },
        'SearchItem.Backward': { type: 'boolean', value: false },
      })
      return true
    }, find)
    if (!sent) throw new Error('the Collabora document API is not available on this page')

    await page.waitForTimeout(config.writeSettleMs)
    return { outcome: 'dispatched' }
  }

  async applyFormatting(page: Page, format: TextFormat): Promise<void> {
    const frame = await this.editorFrame(page)
    const rgb = format.color ? parseColor(format.color) : undefined
    const problems = await frame.evaluate(([spec, color]: [TextFormat, Rgb | undefined]) => {
      const map = (window as CollaboraWindow).app?.map
      if (!map || typeof map.sendUnoCommand !== 'function')
        return ['the Collabora document API is not available on this page']

      const found: string[] = []
      const attempt = (label: string, command: string, args: Record<string, UnoArgument>) => {
        try {
          map.sendUnoCommand(command, args)
        } catch (error) {
          found.push(`${label} failed: ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      // As in every LibreOffice UI, the paragraph style goes on first and the
      // explicit character properties below override what it carried with it.
      if (spec.paragraphStyle) attempt(`paragraph style "${spec.paragraphStyle}"`, '.uno:StyleApply', {
        'Style': { type: 'string', value: spec.paragraphStyle },
        'FamilyName': { type: 'string', value: 'ParagraphStyles' },
      })
      if (spec.fontName) attempt(`font "${spec.fontName}"`, '.uno:CharFontName', {
        'CharFontName.FamilyName': { type: 'string', value: spec.fontName },
      })
      if (spec.fontSize) attempt(`font size ${spec.fontSize}`, '.uno:FontHeight', {
        'FontHeight.Height': { type: 'float', value: spec.fontSize },
      })
      // LibreOffice takes the colour as a single 0xRRGGBB integer.
      if (color) attempt('text colour', '.uno:FontColor', {
        'FontColor': { type: 'long', value: (color.r << 16) + (color.g << 8) + color.b },
      })
      return found
    }, [format, rgb] as [TextFormat, Rgb | undefined])

    await page.waitForTimeout(config.writeSettleMs)
    reportFormattingProblems(problems)
  }

  async save(page: Page): Promise<void> {
    await page.keyboard.press('Control+S')
    // Only a beat for the editor to start the round trip: the save_document tool
    // confirms the result by watching for a new document version.
    await page.waitForTimeout(300)
  }
}
