import type { AgentProvider } from '@/api/agentResources'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { providerInfo } from '@/lib/agentProviders'
import { cn } from '@/lib/utils'

const SIMPLE_ICONS = 'https://cdn.jsdelivr.net/npm/simple-icons@latest/icons'

/** Only providers with a known brand asset are listed; all others use a letter. */
const providerLogoSlugs: Partial<Record<AgentProvider, string>> = {
  'amazon-bedrock': 'amazonwebservices',
  anthropic: 'anthropic',
  'azure-openai-responses': 'microsoftazure',
  baseten: 'baseten',
  cerebras: 'cerebras',
  'cloudflare-ai-gateway': 'cloudflare',
  'cloudflare-workers-ai': 'cloudflare',
  deepseek: 'deepseek',
  fireworks: 'fireworks',
  'github-copilot': 'githubcopilot',
  google: 'google',
  'google-vertex': 'googlecloud',
  groq: 'groq',
  huggingface: 'huggingface',
  minimax: 'minimax',
  'minimax-cn': 'minimax',
  mistral: 'mistralai',
  nvidia: 'nvidia',
  openai: 'openai',
  'openai-codex': 'openai',
  openrouter: 'openrouter',
  together: 'together',
  'vercel-ai-gateway': 'vercel',
  xai: 'x',
  xiaomi: 'xiaomi',
  'xiaomi-token-plan-ams': 'xiaomi',
  'xiaomi-token-plan-cn': 'xiaomi',
  'xiaomi-token-plan-sgp': 'xiaomi',
}

export function agentAvatarDefault(provider: AgentProvider) {
  const label = providerInfo(provider).name
  const slug = providerLogoSlugs[provider]
  return {
    label,
    logoUrl: slug ? `${SIMPLE_ICONS}/${slug}.svg` : undefined,
    initial: label.trim().charAt(0).toUpperCase() || '?',
  }
}

/** Uploaded avatars are stored as an API path, which only resolves against the API origin. */
export function resolveAvatarUrl(avatarUrl?: string) {
  if (!avatarUrl) return undefined
  return avatarUrl.startsWith('/') ? `${(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')}${avatarUrl}` : avatarUrl
}

type AgentAvatarProps = {
  provider: AgentProvider
  avatarUrl?: string
  name?: string
  className?: string
  /** Retained for call-site compatibility; provider logos scale to the avatar. */
  iconClassName?: string
}

export default function AgentAvatar({ provider, avatarUrl, name, className }: AgentAvatarProps) {
  const fallback = agentAvatarDefault(provider)
  const imageUrl = resolveAvatarUrl(avatarUrl) ?? fallback.logoUrl
  return (
    <Avatar className={cn('size-8 border bg-white', className)}>
      {imageUrl ? <AvatarImage className={avatarUrl ? 'object-cover' : 'object-contain p-[18%]'} src={imageUrl} alt={name || fallback.label} /> : null}
      <AvatarFallback className="bg-slate-700 text-white" title={name || fallback.label}>
        {fallback.initial}
      </AvatarFallback>
    </Avatar>
  )
}
