export type AgentTask = {
  id: string
  workspaceId: string
  documentId?: string | null
  requestedById: string
  prompt: string
  status: string
  workerId?: string
  error?: string
  createdAt: string
  updatedAt: string
}

export type AuthResponse = {
  token: string
  user: { id: string; username: string; email: string }
}

export type AgentProfile = {
  id: string
  name: string
  provider: string
  model?: string | null
  systemPrompt?: string | null
  maxTurns: number
  timeoutSeconds: number
  /** Which credential the agent was set up to use first: 'api_key' or 'oauth_token'. */
  authMode?: string | null
  apiKey?: string | null
  /** Claude subscription token from `claude setup-token`. */
  oauthToken?: string | null
}

export type AgentSkill = {
  id: string
  name: string
  description?: string | null
  version: string
  instructions: string
}

export type AgentChatTurn = {
  senderName: string
  content: string
  createdAt: string
}

export type AgentTaskContext = {
  task: AgentTask
  document?: { id: string; fileName: string; contentType: string; version: string } | null
  agent: AgentProfile | null
  skills: AgentSkill[]
  recentMessages: AgentChatTurn[]
}

export type BrowserObservation = {
  url: string
  title: string
  frames: Array<{ name: string; url: string }>
  screenshotPath: string
  /** Plain text of the open document, when the editor could provide it. */
  documentText?: string
  /** Editor-reported modified/saved state, when the editor exposes it. */
  saved?: boolean
}

export type CreatedDocument = {
  id: string
  fileName: string
  contentType: string
  size: number
  workspaceId: string
  folderId?: string | null
}
