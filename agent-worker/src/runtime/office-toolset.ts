import { readFile } from 'node:fs/promises'
import type { Page } from 'playwright'
import { z } from 'zod'
import { workerApi } from '../api-client.js'
import type { PlaywrightBrowserTool } from '../browser/playwright-browser-tool.js'

export const OFFICE_SERVER_NAME = 'office'

export type ToolContext = {
  browser: PlaywrightBrowserTool
  page: Page
  taskId: string
}

export type ToolResultContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }

export type ToolResult = { content: ToolResultContent[]; isError?: boolean }

/**
 * One office operation, described the way every provider needs it: a name, a
 * description the model reads, a Zod shape for the arguments, and a handler.
 * A runtime adapts this into whatever its SDK expects — `office-tools-pi.ts`
 * turns each one into a pi `AgentTool`.
 */
export type OfficeTool = {
  name: string
  description: string
  inputSchema: z.ZodRawShape
  handler: (args: Record<string, unknown>) => Promise<ToolResult>
}

function define<Shape extends z.ZodRawShape>(
  name: string,
  description: string,
  inputSchema: Shape,
  handler: (args: z.infer<z.ZodObject<Shape>>) => Promise<ToolResult>,
): OfficeTool {
  return { name, description, inputSchema, handler: handler as OfficeTool['handler'] }
}

function text(value: string): ToolResult {
  return { content: [{ type: 'text', text: value }] }
}

function failure(error: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: `操作失敗：${error instanceof Error ? error.message : String(error)}` }],
    isError: true,
  }
}

/** Screenshots are JPEG by default but the format is a knob, so read it off the file. */
function imageMimeType(filePath: string): string {
  return filePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
}

/**
 * Resolves the editor frame so the generic UI tools cannot reach the surrounding
 * application shell — an agent may drive the editor, not the workspace app. The
 * driver owns this lookup because the frame that holds the editor UI is not the
 * same one for every editor: OnlyOffice nests its own frame inside the WOPI
 * iframe, so resolving `wopi-frame` by name here would hand back a wrapper whose
 * DOM holds no toolbar, no menu and no dialog at all.
 */
function editorFrame(context: ToolContext) {
  return context.browser.editorFrame(context.page)
}

/** The complete, provider-neutral tool surface an agent runtime may expose. */
export function createOfficeToolset(context: ToolContext): OfficeTool[] {
  const { browser, page, taskId } = context

  return [
    define(
      'observe',
      'Take a screenshot of the open Office document and report page state. Call this before and after every edit to verify what actually happened.',
      { includeText: z.boolean().optional().describe('Also copy the document text out of the editor (this moves the caret).') },
      async args => {
        try {
          const observation = await browser.observe(taskId, page, { includeText: args.includeText === true })
          const screenshot = await readFile(observation.screenshotPath)
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  url: observation.url,
                  title: observation.title,
                  documentText: observation.documentText,
                }, null, 2),
              },
              {
                type: 'image',
                data: screenshot.toString('base64'),
                mimeType: imageMimeType(observation.screenshotPath),
              },
            ],
          }
        } catch (error) {
          return failure(error)
        }
      },
    ),

    define(
      'read_document',
      'Read the full text of the open document by selecting all and copying it. Use it to check content before and after an edit.',
      {},
      async () => {
        try {
          return text(await browser.readDocumentText(page))
        } catch (error) {
          return failure(error)
        }
      },
    ),

    define(
      'write_text',
      'Type text into the document at the current caret position. Position the caret first with press_keys.',
      { content: z.string().min(1).describe('Text to type. Newlines start a new paragraph.') },
      async args => {
        try {
          await browser.writeText(page, args.content)
          return text(`已輸入 ${args.content.length} 個字元。`)
        } catch (error) {
          return failure(error)
        }
      },
    ),

    define(
      'press_keys',
      'Send keyboard shortcuts to the document, for example ["Control+Home"], ["Control+A"], ["Shift+ArrowDown"], ["Delete"] or ["Control+B"].',
      { keys: z.array(z.string().min(1)).min(1).max(20).describe('Playwright key names, pressed in order.') },
      async args => {
        try {
          await browser.pressInDocument(page, args.keys)
          return text(`已送出按鍵：${args.keys.join(' → ')}`)
        } catch (error) {
          return failure(error)
        }
      },
    ),

    define(
      'click_editor_ui',
      'Click a control in the editor UI (toolbar button, menu entry, dialog button) by CSS selector. Call inspect_editor_ui first to find a selector that exists.',
      { selector: z.string().min(1).describe('CSS selector inside the editor frame.') },
      async args => {
        try {
          const frame = await editorFrame(context)
          await frame.locator(args.selector).first().click({ timeout: 15_000 })
          browser.releaseDocumentFocus(page)
          await page.waitForTimeout(500)
          return text(`已點擊 ${args.selector}`)
        } catch (error) {
          return failure(error)
        }
      },
    ),

    define(
      'fill_editor_ui',
      'Fill a text input in the editor UI, for example a Find and Replace field, by CSS selector.',
      {
        selector: z.string().min(1).describe('CSS selector of an input inside the editor frame.'),
        value: z.string().describe('Value to place in the field.'),
      },
      async args => {
        try {
          const frame = await editorFrame(context)
          await frame.locator(args.selector).first().fill(args.value, { timeout: 15_000 })
          browser.releaseDocumentFocus(page)
          return text(`已填入 ${args.selector}`)
        } catch (error) {
          return failure(error)
        }
      },
    ),

    define(
      'inspect_editor_ui',
      'List the visible interactive elements of the editor UI with their selectors, so that a click or fill targets a control that really exists.',
      { filter: z.string().optional().describe('Only return elements whose id, label, title or text contains this text.') },
      async args => {
        try {
          const frame = await editorFrame(context)
          const elements = await frame.evaluate((needle: string | null) => {
            const nodes = Array.from(document.querySelectorAll<HTMLElement>(
              'button, [role="button"], [role="menuitem"], a[href], input, select, textarea, [id]',
            ))
            return nodes
              // An editor ships its icons as an inline SVG sprite whose every
              // symbol carries an id. Those are not controls, and there are
              // hundreds of them — enough to crowd out the real ones below.
              .filter(node => !(node instanceof SVGElement))
              .filter(node => node.offsetParent !== null || node.getClientRects().length > 0)
              .map(node => ({
                tag: node.tagName.toLowerCase(),
                id: node.id || undefined,
                role: node.getAttribute('role') ?? undefined,
                label: node.getAttribute('aria-label') ?? node.getAttribute('title') ?? undefined,
                text: (node.innerText ?? '').trim().slice(0, 60) || undefined,
              }))
              .filter(item => item.id || item.label || item.text)
              .filter(item => !needle || JSON.stringify(item).toLowerCase().includes(needle.toLowerCase()))
              .slice(0, 120)
          }, args.filter ?? null)
          return text(JSON.stringify(elements, null, 2))
        } catch (error) {
          return failure(error)
        }
      },
    ),

    define(
      'find_text',
      'Find text anywhere in the document and leave it selected, scrolling to it — then format_text, '
      + 'write_text or press_keys act on that selection. Call it again with the same query to step to the '
      + 'next match. Use this to reach a heading or a phrase on a later page: it beats Control+F, which '
      + 'types into the document, and beats counting arrow keys.',
      {
        query: z.string().min(1).describe('Exact text to look for, for example a heading like 西遊記的故事.'),
        matchCase: z.boolean().optional().describe('Match upper and lower case exactly. Default false.'),
        wholeWords: z.boolean().optional().describe('Match whole words only. Default false.'),
      },
      async args => {
        try {
          const found = await browser.findText(page, {
            query: args.query,
            matchCase: args.matchCase,
            wholeWords: args.wholeWords,
          })
          switch (found.outcome) {
            case 'selected':
              return text(`已選取「${found.text.trim()}」，接下來的 format_text 或編輯會作用在這段文字上。`)
            case 'not-found':
              return {
                content: [{ type: 'text', text: `找不到「${args.query}」，文件中沒有相符的文字。` }],
                isError: true,
              }
            default:
              return text(`已送出搜尋「${args.query}」，請用 observe 確認選取的位置。`)
          }
        } catch (error) {
          return failure(error)
        }
      },
    ),

    define(
      'format_text',
      'Set font, size, colour or paragraph style on the current selection. Select the text first with '
      + 'find_text, or with press_keys (for example ["Home", "Shift+End"]); with nothing selected the '
      + 'settings apply to text typed next. '
      + 'Use this instead of hunting for a toolbar control — the editor has no keyboard shortcut for a font or a colour.',
      {
        fontName: z.string().min(1).optional().describe('Font family exactly as the editor names it, for example "Times New Roman" or "標楷體".'),
        fontSize: z.number().min(1).max(400).optional().describe('Font size in points, for example 12.'),
        color: z.string().min(1).optional().describe('Text colour as #RRGGBB, for example #FF0000, or a common name such as red.'),
        paragraphStyle: z.string().min(1).optional().describe('Paragraph style name, for example "Heading 1", "Heading 2" or "Normal".'),
      },
      async args => {
        const format = {
          fontName: args.fontName,
          fontSize: args.fontSize,
          color: args.color,
          paragraphStyle: args.paragraphStyle,
        }
        const applied = Object.entries(format)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => `${key}=${value}`)
        if (applied.length === 0) return failure(new Error('No formatting was requested.'))
        try {
          await browser.applyFormatting(page, format)
          return text(`已套用格式：${applied.join('、')}。用 observe 確認結果。`)
        } catch (error) {
          return failure(error)
        }
      },
    ),

    define(
      'save_document',
      'Save the document and verify that the WOPI host stored a new version. Always call this once the requested edit is complete.',
      {},
      async () => {
        try {
          const before = await workerApi.context(taskId)
          if (!before?.document) return failure(new Error('No document is open for this task.'))
          await browser.save(page)
          // The editor hands the file to the document server, which converts it
          // and only then puts it back to the WOPI host; twenty seconds for that
          // round trip is normal, so the wait has room above it.
          const deadline = Date.now() + 60_000
          while (Date.now() < deadline) {
            const after = await workerApi.context(taskId)
            if (after?.document && after.document.version !== before.document.version)
              return text(`已儲存，文件版本由 ${before.document.version} 更新為 ${after.document.version}。`)
            await page.waitForTimeout(400)
          }
          return {
            content: [{
              type: 'text',
              text: '已送出儲存指令，但 60 秒內沒有偵測到新的文件版本，請用 observe 確認編輯器狀態。',
            }],
            isError: true,
          }
        } catch (error) {
          return failure(error)
        }
      },
    ),

    define(
      'create_document',
      'Create a new blank Office document in the current workspace. The file name is optional; omit it to use an automatic name. This creates a separate document and does not replace the currently open document.',
      {
        kind: z.enum(['word', 'excel', 'powerpoint']).describe('The type of Office document to create.'),
        fileName: z.string().min(1).max(255).optional().describe('Optional file name. The correct .docx, .xlsx, or .pptx extension is added automatically.'),
      },
      async args => {
        try {
          const document = await workerApi.createDocument(taskId, args.kind, args.fileName)
          if (!document) return failure(new Error('The API returned no document.'))
          return text(JSON.stringify({
            id: document.id,
            fileName: document.fileName,
            contentType: document.contentType,
            workspaceId: document.workspaceId,
          }, null, 2))
        } catch (error) {
          return failure(error)
        }
      },
    ),

    define(
      'say',
      'Post a short message into the workspace chat room so the people who asked can follow along. Use it for progress notes and for the final summary.',
      { message: z.string().min(1).max(2000).describe('Message text, written in the language the requester used.') },
      async args => {
        try {
          await workerApi.say(taskId, args.message)
          return text('已送出訊息到聊天室。')
        } catch (error) {
          return failure(error)
        }
      },
    ),
  ]
}

/** Tools available to a task started from the Drive chat, where no editor page exists. */
export function createDriveToolset(taskId: string): OfficeTool[] {
  return [
    define(
      'create_document',
      'Create a new blank Office document in the current workspace. The file name is optional; omit it to use an automatic name.',
      {
        kind: z.enum(['word', 'excel', 'powerpoint']).describe('The type of Office document to create.'),
        fileName: z.string().min(1).max(255).optional().describe('Optional file name. The correct extension is added automatically.'),
      },
      async args => {
        try {
          const document = await workerApi.createDocument(taskId, args.kind, args.fileName)
          if (!document) return failure(new Error('The API returned no document.'))
          return text(JSON.stringify(document, null, 2))
        } catch (error) {
          return failure(error)
        }
      },
    ),
    define(
      'say',
      'Post a short message into the workspace chat room so the people who asked can follow along.',
      { message: z.string().min(1).max(2000).describe('Message text, written in the language the requester used.') },
      async args => {
        try {
          await workerApi.say(taskId, args.message)
          return text('Message posted to the workspace chat.')
        } catch (error) {
          return failure(error)
        }
      },
    ),
  ]
}

/** The bare tool names, in call order-independent form. */
export const OFFICE_TOOL_BASE_NAMES = [
  'observe',
  'read_document',
  'write_text',
  'press_keys',
  'click_editor_ui',
  'fill_editor_ui',
  'inspect_editor_ui',
  'find_text',
  'format_text',
  'save_document',
  'create_document',
  'say',
] as const

/** The same names in the `mcp__office__*` form an MCP-based runtime would report. */
export const OFFICE_TOOL_NAMES: string[] =
  OFFICE_TOOL_BASE_NAMES.map(name => `mcp__${OFFICE_SERVER_NAME}__${name}`)

/**
 * A runtime may prefix tool names — `mcp__office__say` from an MCP-based one, a
 * bare `say` from pi's plain function tools. Strip the prefix before comparing a
 * name against `OFFICE_TOOL_BASE_NAMES`.
 */
export function officeToolBaseName(name: string): string {
  return name.split('__').pop() ?? name
}
