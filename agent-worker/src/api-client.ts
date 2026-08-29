import { config } from './config.js'
import type { AgentTask, AgentTaskContext, AuthResponse, CreatedDocument } from './types.js'

async function request<T>(path: string, init: RequestInit = {}): Promise<T | undefined> {
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-agent-worker-key': config.workerApiKey,
      ...init.headers,
    },
  })
  if (response.status === 204) return undefined
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} failed: ${response.status} ${await response.text()}`)
  return await response.json() as T
}

const DEFAULT_TOKEN_LIFETIME_MS = 10 * 60_000

/**
 * The JWT carries its own expiry, so the cached session can be held for exactly
 * as long as it is valid instead of being guessed at.
 */
function expiryOf(token: string): number {
  const payload = token.split('.')[1]
  if (!payload) return Date.now() + DEFAULT_TOKEN_LIFETIME_MS
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: number }
    return typeof claims.exp === 'number' ? claims.exp * 1000 : Date.now() + DEFAULT_TOKEN_LIFETIME_MS
  } catch {
    return Date.now() + DEFAULT_TOKEN_LIFETIME_MS
  }
}

let cachedAuth: { value: AuthResponse; expiresAt: number } | undefined

export const workerApi = {
  claim: () => request<AgentTask>('/internal/agent-tasks/claim', {
    method: 'POST', body: JSON.stringify({ workerId: config.workerId }),
  }),
  context: (taskId: string) => request<AgentTaskContext>(`/internal/agent-tasks/${taskId}/context`),
  say: (taskId: string, content: string) =>
    request(`/internal/agent-tasks/${taskId}/messages`, {
      method: 'POST', body: JSON.stringify({ content }),
    }),
  createDocument: (taskId: string, kind: 'word' | 'excel' | 'powerpoint', fileName?: string) =>
    request<CreatedDocument>(`/internal/agent-tasks/${taskId}/documents`, {
      method: 'POST', body: JSON.stringify({ kind, fileName }),
    }),
  event: (taskId: string, type: string, payload: unknown) =>
    request(`/internal/agent-tasks/${taskId}/events`, {
      method: 'POST', body: JSON.stringify({ type, payloadJson: JSON.stringify(payload) }),
    }),
  finish: (taskId: string, succeeded: boolean, error?: string) =>
    request(`/internal/agent-tasks/${taskId}/finish`, {
      method: 'POST', body: JSON.stringify({ succeeded, error }),
    }),
  /**
   * Every task signs in as the same agent user, so the session is kept until it
   * is about to expire. Pass `force` to discard a session the app rejected.
   */
  login: async (force = false): Promise<AuthResponse> => {
    if (!force && cachedAuth && Date.now() < cachedAuth.expiresAt) return cachedAuth.value
    const response = await fetch(`${config.apiBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: config.agentEmail, password: config.agentPassword }),
    })
    if (!response.ok) throw new Error(`Agent login failed: ${response.status} ${await response.text()}`)
    const auth = await response.json() as AuthResponse
    // A minute of headroom so a token never expires between here and the page load.
    cachedAuth = { value: auth, expiresAt: expiryOf(auth.token) - 60_000 }
    return auth
  },
}
