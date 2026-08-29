import { api } from './index'
import type { AgentProvider } from '@/lib/agentProviders'

export type { AgentProvider } from '@/lib/agentProviders'

export interface AgentResource {
  id: string; name: string; description?: string; avatarUrl?: string; provider: AgentProvider; model?: string
  systemPrompt?: string; enabled: boolean; maxTurns: number; timeoutSeconds: number
  authMode?: string; hasApiKey: boolean; hasOAuthToken: boolean; reasoningEffort?: string
  sandboxMode?: string; approvalPolicy?: string; permissionMode?: string; endpointUrl?: string
  protocol?: string; headersJson?: string; mcpServerIds: string[]; skillIds: string[]
}

export interface McpResource {
  id: string; name: string; description?: string; transport: 'http' | 'stdio'; endpointUrl?: string
  command?: string; argumentsJson?: string; authType?: string; hasCredential: boolean
  headersJson?: string; enabled: boolean
}

export interface SkillResource {
  id: string; name: string; description?: string; version: string; instructions: string; enabled: boolean
}

export type AgentInput = Omit<AgentResource, 'id' | 'hasApiKey' | 'hasOAuthToken'> & { apiKey?: string; oauthToken?: string; hasApiKey?: boolean; hasOAuthToken?: boolean }
export type McpInput = Omit<McpResource, 'id' | 'hasCredential'> & { credential?: string }
export type SkillInput = Omit<SkillResource, 'id'>

const base = (workspaceId: string) => `/api/workspaces/${workspaceId}`
export const agentResourcesApi = {
  listAgents: (w: string) => api.get<AgentResource[]>(`${base(w)}/agents`).then(r => r.data),
  saveAgent: (w: string, value: AgentInput, id?: string) =>
    (id ? api.put<AgentResource>(`${base(w)}/agents/${id}`, value) : api.post<AgentResource>(`${base(w)}/agents`, value)).then(r => r.data),
  deleteAgent: (w: string, id: string) => api.delete(`${base(w)}/agents/${id}`),
  uploadAgentAvatar: (w: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<{ url: string }>(`${base(w)}/agents/avatar`, form).then(r => r.data.url)
  },
  listMcps: (w: string) => api.get<McpResource[]>(`${base(w)}/mcp-servers`).then(r => r.data),
  saveMcp: (w: string, value: McpInput, id?: string) =>
    (id ? api.put<McpResource>(`${base(w)}/mcp-servers/${id}`, value) : api.post<McpResource>(`${base(w)}/mcp-servers`, value)).then(r => r.data),
  deleteMcp: (w: string, id: string) => api.delete(`${base(w)}/mcp-servers/${id}`),
  listSkills: (w: string) => api.get<SkillResource[]>(`${base(w)}/skills`).then(r => r.data),
  saveSkill: (w: string, value: SkillInput, id?: string) =>
    (id ? api.put<SkillResource>(`${base(w)}/skills/${id}`, value) : api.post<SkillResource>(`${base(w)}/skills`, value)).then(r => r.data),
  deleteSkill: (w: string, id: string) => api.delete(`${base(w)}/skills/${id}`),
}
