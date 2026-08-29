import { api } from './index'
import type { AgentProvider } from './agentResources'

export type AgentTask = {
  id: string
  workspaceId: string
  documentId?: string | null
  requestedById: string
  prompt: string
  /** The tagged agent. Older tasks carry none and ran on the workspace default. */
  agentId?: string | null
  agentName?: string | null
  agentAvatarUrl?: string | null
  agentProvider?: AgentProvider | null
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  workerId?: string
  error?: string
  createdAt: string
  updatedAt: string
}

export type AgentTaskEvent = {
  id: string
  agentTaskId: string
  type: string
  payloadJson: string
  createdAt: string
}

export const agentTasksApi = {
  list: (workspaceId: string, take = 20) =>
    api.get<AgentTask[]>(`/api/workspaces/${workspaceId}/agent-tasks`, { params: { take } }).then(response => response.data),
  create: (workspaceId: string, documentId: string | null, prompt: string, agentId?: string) =>
    api.post<AgentTask>(`/api/workspaces/${workspaceId}/agent-tasks`, { documentId, prompt, agentId }).then(response => response.data),
}
