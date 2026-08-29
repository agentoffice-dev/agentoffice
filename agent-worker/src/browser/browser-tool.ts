import type { BrowserContext, Frame, Page } from 'playwright'
import type { BrowserObservation } from '../types.js'
import type { FindQuery, FindResult, TextFormat } from './office-drivers/office-driver.js'

export type BrowserSession = {
  context: BrowserContext
  page: Page
  observation: BrowserObservation
}

/**
 * The whole surface an agent runtime is allowed to touch. Runtimes never see the
 * browser instance, the worker credential, or the WOPI token — they call these
 * bounded operations and read back observations.
 */
export interface BrowserTool {
  start(): Promise<void>
  stop(): Promise<void>
  openDocument(taskId: string, documentId: string): Promise<BrowserSession>
  /**
   * Hands a session back when its task ends. A session that finished cleanly is
   * kept open for the next task on the same document; a failed one is closed,
   * because its page is in an unknown state.
   */
  releaseSession(taskId: string, documentId: string, session: BrowserSession, failed: boolean): Promise<void>
  observe(taskId: string, page: Page, options?: { includeText?: boolean }): Promise<BrowserObservation>

  /* Generic page interaction */
  click(page: Page, selector: string): Promise<void>
  type(page: Page, selector: string, text: string): Promise<void>
  press(page: Page, keys: string): Promise<void>

  /* Office document operations, delegated to the editor driver */
  /** The frame that holds the document and the editor's own UI. */
  editorFrame(page: Page): Promise<Frame>
  focusDocument(page: Page): Promise<void>
  writeText(page: Page, text: string): Promise<void>
  pressInDocument(page: Page, keys: string[]): Promise<void>
  readDocumentText(page: Page): Promise<string>
  applyFormatting(page: Page, format: TextFormat): Promise<void>
  findText(page: Page, find: FindQuery): Promise<FindResult>
  save(page: Page): Promise<void>
}
