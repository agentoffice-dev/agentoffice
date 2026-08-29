import { api } from './index'

export type ChatMessage = {
  id: string
  workspaceId: string
  senderId: string
  senderName: string
  content: string
  createdAt: string
  documentId?: string | null
  agentTaskId?: string | null
}

export const chatApi = {
  history: (workspaceId: string, take = 50) =>
    api.get<ChatMessage[]>(`/api/workspaces/${workspaceId}/messages`, { params: { take } }).then(response => response.data),

  /** documentId travels with the message so the server can dispatch /agent to the open document. */
  send: (workspaceId: string, content: string, documentId?: string) =>
    api.post<ChatMessage>(`/api/workspaces/${workspaceId}/messages`, { content, documentId })
      .then(response => response.data),
}
