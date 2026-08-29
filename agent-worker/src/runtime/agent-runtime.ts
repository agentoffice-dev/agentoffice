import type { Page } from 'playwright'
import type { AgentTask, AgentTaskContext, BrowserObservation } from '../types.js'

export type RuntimeEvent = { type: string; payload: unknown }

export type RuntimeInput = {
  task: AgentTask
  context: AgentTaskContext
  page?: Page
  observation?: BrowserObservation
}

export interface AgentRuntime {
  run(input: RuntimeInput): AsyncIterable<RuntimeEvent>
}

// Fallback runtime: proves the browser/WOPI lifecycle without a model. Used when
// no agent credential is configured, so the vertical slice still runs offline.
export class BrowserReadyRuntime implements AgentRuntime {
  async *run(input: RuntimeInput): AsyncIterable<RuntimeEvent> {
    input.context.document ??= { id: '', fileName: 'workspace', contentType: '', version: '' }
    if (input.observation) yield { type: 'browser.ready', payload: input.observation }
    yield {
      type: 'agent.message',
      payload: {
        text: input.context.agent
          ? `已開啟文件「${input.context.document.fileName}」，但工作區代理「${input.context.agent.name}」`
            + `的憑證是空的（驗證方式：${input.context.agent.authMode ?? '未設定'}），因此不會執行：${input.task.prompt}`
          : `已開啟文件「${input.context.document.fileName}」，但這個工作區沒有設定 AI 代理，因此不會執行：${input.task.prompt}`,
      },
    }
  }
}
