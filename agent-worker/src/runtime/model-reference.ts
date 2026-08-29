import { config } from '../config.js'
import type { AgentTaskContext } from '../types.js'

/** pi is the runtime; persisted providers are the LLM vendors it drives. */
export type ModelVendor = string
export type ModelRef = { vendor: ModelVendor; id: string }

/** Resolves the provider and its unqualified model id from the agent schema. */
export function modelRefForAgent(context: AgentTaskContext): ModelRef {
  const vendor = context.agent?.provider?.trim().toLowerCase()
  if (!vendor) throw new Error(`Unsupported model provider "${context.agent?.provider ?? ''}"`)

  const [configuredVendor, ...configuredModelParts] = config.piModel.split(':')
  const configuredModel = configuredModelParts.join(':')
  const fallback = configuredVendor === vendor && configuredModel ? configuredModel : ''
  const id = context.agent?.model?.trim() || fallback
  if (!id) throw new Error(`A model id is required for provider "${vendor}"`)
  return { vendor, id }
}

export function formatModelRef(ref: ModelRef): string {
  return `${ref.vendor}:${ref.id}`
}

/** The workspace credential wins over the matching worker-level fallback. */
export function resolveVendorKey(vendor: ModelVendor, context: AgentTaskContext): string {
  const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, '')
  const fallback = ({
    anthropic: config.anthropicApiKey,
    openai: config.openaiApiKey,
    google: config.googleApiKey,
  } as Record<string, string | undefined>)[vendor]
  const agentKey = clean(context.agent?.apiKey)
  const workerKey = clean(fallback)
  if (vendor !== 'anthropic') {
    const agentToken = clean(context.agent?.oauthToken)
    return context.agent?.authMode === 'oauth_token' ? agentToken : agentKey || workerKey
  }

  const agentToken = clean(context.agent?.oauthToken)
  const workerToken = clean(config.claudeOAuthToken)
  const candidates = context.agent?.authMode === 'oauth_token'
    ? [agentToken, workerToken]
    : [agentKey, workerKey]
  return candidates.find(Boolean) ?? ''
}

export function isClaudeOAuthToken(credential: string): boolean {
  return credential.includes('sk-ant-oat')
}
