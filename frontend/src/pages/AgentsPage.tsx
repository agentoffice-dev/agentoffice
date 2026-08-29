import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Bot, ImagePlus, Plus, Save, Sparkles, Trash2, Wrench, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { agentResourcesApi, type AgentInput, type AgentProvider, type AgentResource, type McpInput, type McpResource, type SkillInput, type SkillResource } from '@/api/agentResources'
import AgentAvatar, { agentAvatarDefault } from '@/components/agents/AgentAvatar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { AGENT_PROVIDERS, providerInfo } from '@/lib/agentProviders'
import { useTranslation } from 'react-i18next'

type Tab = 'agents' | 'mcp' | 'skills'
const field = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
/** Must stay in step with the API's MaxAvatarBytes. */
const MAX_AVATAR_BYTES = 2 * 1024 * 1024
const AVATAR_TYPES = 'image/png,image/jpeg,image/webp,image/gif'
const emptyAgent = (): AgentInput => ({ name: '', provider: 'anthropic', description: '', avatarUrl: '', model: '', systemPrompt: '', enabled: true, maxTurns: 20, timeoutSeconds: 900, authMode: 'api_key', endpointUrl: '', headersJson: '', mcpServerIds: [], skillIds: [] })
const emptyMcp = (): McpInput => ({ name: '', description: '', transport: 'http', endpointUrl: '', command: '', argumentsJson: '[]', authType: 'none', headersJson: '{}', enabled: true })
const emptySkill = (): SkillInput => ({ name: '', description: '', version: '1.0.0', instructions: '', enabled: true })

function SectionTitle({ children }: { children: React.ReactNode }) { return <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2">{children}</h3> }
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) { const { t } = useTranslation(); return <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />{label ?? t('common.enabled')}</label> }

export default function AgentsPage() {
  const { t } = useTranslation()
  const { id: workspaceId } = useParams<{ id: string }>()
  const [tab, setTab] = useState<Tab>('agents')
  const [agents, setAgents] = useState<AgentResource[]>([]), [mcps, setMcps] = useState<McpResource[]>([]), [skills, setSkills] = useState<SkillResource[]>([])
  const [agent, setAgent] = useState<AgentInput>(emptyAgent), [agentId, setAgentId] = useState<string>()
  const [mcp, setMcp] = useState<McpInput>(emptyMcp), [mcpId, setMcpId] = useState<string>()
  const [skill, setSkill] = useState<SkillInput>(emptySkill), [skillId, setSkillId] = useState<string>()
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false)

  const load = useCallback(async () => { if (!workspaceId) return; setLoading(true); try { const [a, m, s] = await Promise.all([agentResourcesApi.listAgents(workspaceId), agentResourcesApi.listMcps(workspaceId), agentResourcesApi.listSkills(workspaceId)]); setAgents(a); setMcps(m); setSkills(s) } catch { toast.error(t('agents.loadFailed')) } finally { setLoading(false) } }, [workspaceId, t])
  useEffect(() => { void load() }, [load])

  const editAgent = (x: AgentResource) => { setAgentId(x.id); setAgent({ ...x, apiKey: '', oauthToken: '' }); setTab('agents') }
  const editMcp = (x: McpResource) => { setMcpId(x.id); setMcp({ ...x, credential: '' }); setTab('mcp') }
  const editSkill = (x: SkillResource) => { setSkillId(x.id); setSkill({ ...x }); setTab('skills') }
  const save = async () => { if (!workspaceId) return; setSaving(true); try { if (tab === 'agents') { if (!agent.name.trim() || !agent.model?.trim()) return toast.error(t('agents.requiredAgent')); await agentResourcesApi.saveAgent(workspaceId, agent, agentId) } else if (tab === 'mcp') { if (!mcp.name.trim()) return toast.error(t('agents.requiredMcp')); await agentResourcesApi.saveMcp(workspaceId, mcp, mcpId) } else { if (!skill.name.trim() || !skill.instructions.trim()) return toast.error(t('agents.requiredSkill')); await agentResourcesApi.saveSkill(workspaceId, skill, skillId) }; toast.success(t('common.save')); await load() } catch { toast.error(t('agents.saveFailed')) } finally { setSaving(false) } }
  const remove = async () => { if (!workspaceId || !confirm(t('agents.deleteConfirm'))) return; try { if (tab === 'agents' && agentId) await agentResourcesApi.deleteAgent(workspaceId, agentId); else if (tab === 'mcp' && mcpId) await agentResourcesApi.deleteMcp(workspaceId, mcpId); else if (tab === 'skills' && skillId) await agentResourcesApi.deleteSkill(workspaceId, skillId); else return; fresh(); await load(); toast.success(t('common.deleted')) } catch { toast.error(t('workspace.deleteFailed')) } }
  const fresh = () => { if (tab === 'agents') { setAgentId(undefined); setAgent(emptyAgent()) } else if (tab === 'mcp') { setMcpId(undefined); setMcp(emptyMcp()) } else { setSkillId(undefined); setSkill(emptySkill()) } }
  const items = tab === 'agents' ? agents : tab === 'mcp' ? mcps : skills

  return <div className="flex h-full min-w-0 flex-col bg-background">
    <header className="flex items-center justify-between border-b px-6 py-3"><div><h1 className="font-semibold">{t('nav.agents')}</h1><p className="text-xs text-muted-foreground">{t('agents.subtitle')}</p></div><button onClick={fresh} className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"><Plus className="h-4 w-4" />{tab === 'agents' ? t('agents.newAgent') : tab === 'mcp' ? t('agents.newMcp') : t('agents.newSkill')}</button></header>
    <div className="flex border-b px-6">{([['agents', Bot, t('nav.agents')], ['mcp', Wrench, 'MCP'], ['skills', Sparkles, t('agents.skills')]] as const).map(([key, Icon, label]) => <button key={key} onClick={() => setTab(key)} className={cn('flex items-center gap-2 border-b-2 px-4 py-3 text-sm', tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground')}><Icon className="h-4 w-4" />{label}</button>)}</div>
    <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)]">
      <aside className="overflow-y-auto border-r p-3">{loading ? <p className="p-3 text-sm text-muted-foreground">{t('common.loading')}</p> : items.length === 0 ? <p className="p-3 text-sm text-muted-foreground">{t('agents.empty')}</p> : items.map(x => <button key={x.id} onClick={() => tab === 'agents' ? editAgent(x as AgentResource) : tab === 'mcp' ? editMcp(x as McpResource) : editSkill(x as SkillResource)} className={cn('mb-1 w-full rounded-lg px-3 py-2 text-left hover:bg-muted', (agentId === x.id || mcpId === x.id || skillId === x.id) && 'bg-muted')}><div className="flex items-center gap-2">{'provider' in x && <AgentAvatar provider={x.provider} avatarUrl={x.avatarUrl} name={x.name} className="size-7" iconClassName="size-3.5" />}<div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{x.name}</div><div className="truncate text-xs text-muted-foreground">{'provider' in x ? x.provider : 'transport' in x ? x.transport : x.version}</div></div></div></button>)}</aside>
      <main className="overflow-y-auto p-6"><div className="mx-auto max-w-3xl space-y-4">
        {tab === 'agents' && <AgentForm value={agent} set={setAgent} mcps={mcps} skills={skills} workspaceId={workspaceId} />}
        {tab === 'mcp' && <McpForm value={mcp} set={setMcp} />}
        {tab === 'skills' && <SkillForm value={skill} set={setSkill} />}
        <div className="flex justify-between border-t pt-4">{(agentId || mcpId || skillId) ? <button onClick={() => void remove()} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" />{t('common.delete')}</button> : <span />}<button disabled={saving} onClick={() => void save()} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"><Save className="h-4 w-4" />{saving ? t('common.saving') : t('common.save')}</button></div>
      </div></main>
    </div>
  </div>
}

const MODEL_PLACEHOLDERS: Partial<Record<AgentProvider, string>> = {
  anthropic: 'claude-opus-5',
  openai: 'gpt-5',
  google: 'gemini-2.5-pro',
}

function AgentForm({ value: v, set, mcps, skills, workspaceId }: { value: AgentInput; set: React.Dispatch<React.SetStateAction<AgentInput>>; mcps: McpResource[]; skills: SkillResource[]; workspaceId?: string }) {
  const { t } = useTranslation()
  const p = (patch: Partial<AgentInput>) => set(x => ({ ...x, ...patch }))
  const info = providerInfo(v.provider)
  const changeProvider = (provider: AgentProvider) => {
    const next = providerInfo(provider)
    set(x => ({ ...x, provider, model: '', authMode: next.apiKeyName ? 'api_key' : 'oauth_token', apiKey: '', oauthToken: '' }))
  }
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const upload = async (file?: File) => {
    if (!file) return
    if (!workspaceId) return toast.error(t('agents.avatarWorkspace'))
    if (file.size > MAX_AVATAR_BYTES) return toast.error(t('agents.avatarSize'))
    setUploading(true)
    try { p({ avatarUrl: await agentResourcesApi.uploadAgentAvatar(workspaceId, file) }); toast.success(t('agents.avatarUploaded')) }
    catch { toast.error(t('agents.avatarFailed')) }
    // Clearing the input lets the same file be picked again after a failure.
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }
  const selectId = (key: 'mcpServerIds' | 'skillIds', id: string, checked: boolean) => p({ [key]: checked ? [...v[key], id] : v[key].filter(x => x !== id) })
  return <><div className="grid grid-cols-2 gap-4"><div><Label>{t('common.name')}</Label><Input value={v.name} onChange={e => p({ name: e.target.value })} /></div><div><Label>{t('agents.provider')}</Label><select className={field} value={v.provider} onChange={e => changeProvider(e.target.value as AgentProvider)}>{AGENT_PROVIDERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>
    <div><Label>{t('common.description')}</Label><Input value={v.description ?? ''} onChange={e => p({ description: e.target.value })} /></div>
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <AgentAvatar provider={v.provider} avatarUrl={v.avatarUrl} name={v.name} className="size-12" iconClassName="size-6" />
      <div className="min-w-0 flex-1"><Label>{t('agents.avatar')}</Label><Input placeholder={t('agents.avatarFallback', { provider: agentAvatarDefault(v.provider).label })} value={v.avatarUrl ?? ''} onChange={e => p({ avatarUrl: e.target.value })} /></div>
      <div className="flex shrink-0 items-center gap-2 pt-5">
        <input ref={fileRef} type="file" accept={AVATAR_TYPES} className="hidden" onChange={e => void upload(e.target.files?.[0])} />
        <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"><ImagePlus className="h-4 w-4" />{uploading ? t('common.uploading') : t('common.upload')}</button>
        {v.avatarUrl && <button type="button" onClick={() => p({ avatarUrl: '' })} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted" title={t('agents.providerDefault')}><X className="h-4 w-4" /></button>}
      </div>
    </div>
    <div className="grid grid-cols-3 gap-4"><div className="col-span-2"><Label>{t('agents.model')}</Label><Input placeholder={MODEL_PLACEHOLDERS[v.provider] ?? t('agents.modelIdentifier')} value={v.model ?? ''} onChange={e => p({ model: e.target.value })} /></div><div className="pt-6"><Toggle checked={v.enabled} onChange={enabled => p({ enabled })} /></div></div>
    <div><Label>{t('agents.systemPrompt')}</Label><Textarea rows={6} value={v.systemPrompt ?? ''} onChange={e => p({ systemPrompt: e.target.value })} /></div>
    <SectionTitle>{t('common.authentication')}</SectionTitle><div className="grid grid-cols-2 gap-4"><div className="col-span-2"><p className="text-xs text-muted-foreground">{t('agents.authHelp', { provider: info.name })}</p></div><div><Label>{t('common.authentication')}</Label><select className={field} value={v.authMode ?? (info.apiKeyName ? 'api_key' : 'oauth_token')} onChange={e => p({ authMode: e.target.value })}>{info.apiKeyName && <option value="api_key">{info.apiKeyName}</option>}{info.hasOAuth && <option value="oauth_token">{t('agents.oauthOption', { provider: info.name })}</option>}</select></div>{v.authMode === 'oauth_token' ? <div><Label>{t('agents.oauthToken', { provider: info.name })}</Label><Input type="password" placeholder={v.hasOAuthToken ? t('agents.savedToken') : t('agents.pasteToken')} onChange={e => p({ oauthToken: e.target.value })} /></div> : <div><Label>{info.apiKeyName ?? t('agents.credential')}</Label><Input type="password" placeholder={v.hasApiKey ? t('agents.savedCredential') : t('agents.pasteCredential')} onChange={e => p({ apiKey: e.target.value })} /></div>}</div>
    <div className="grid grid-cols-2 gap-4"><div><Label>{t('agents.maxTurns')}</Label><Input type="number" value={v.maxTurns} onChange={e => p({ maxTurns: +e.target.value })} /></div><div><Label>{t('agents.timeout')}</Label><Input type="number" value={v.timeoutSeconds} onChange={e => p({ timeoutSeconds: +e.target.value })} /></div></div>
    <SectionTitle>{t('agents.capabilities')}</SectionTitle><div className="grid grid-cols-2 gap-4"><ChoiceList title={t('agents.mcpServers')} items={mcps} selected={v.mcpServerIds} toggle={(id,c) => selectId('mcpServerIds',id,c)} /><ChoiceList title={t('agents.skills')} items={skills} selected={v.skillIds} toggle={(id,c) => selectId('skillIds',id,c)} /></div></>
}

function ChoiceList({ title, items, selected, toggle }: { title: string; items: { id: string; name: string }[]; selected: string[]; toggle: (id: string, checked: boolean) => void }) { const { t } = useTranslation(); return <div className="rounded-lg border p-3"><Label>{title}</Label><div className="mt-2 max-h-36 space-y-2 overflow-y-auto">{items.length ? items.map(x => <label key={x.id} className="flex gap-2 text-sm"><input type="checkbox" checked={selected.includes(x.id)} onChange={e => toggle(x.id, e.target.checked)} />{x.name}</label>) : <p className="text-xs text-muted-foreground">{t('agents.empty')}</p>}</div></div> }
function McpForm({ value: v, set }: { value: McpInput; set: React.Dispatch<React.SetStateAction<McpInput>> }) { const { t } = useTranslation(); const p = (x: Partial<McpInput>) => set(y => ({ ...y, ...x })); return <><div className="grid grid-cols-2 gap-4"><div><Label>{t('common.name')}</Label><Input value={v.name} onChange={e => p({ name: e.target.value })} /></div><div><Label>{t('agents.transport')}</Label><select className={field} value={v.transport} onChange={e => p({ transport: e.target.value as 'http'|'stdio' })}><option value="http">HTTP / SSE</option><option value="stdio">stdio</option></select></div></div><div><Label>{t('common.description')}</Label><Input value={v.description ?? ''} onChange={e => p({ description: e.target.value })} /></div>{v.transport === 'http' ? <div><Label>{t('agents.endpoint')}</Label><Input value={v.endpointUrl ?? ''} onChange={e => p({ endpointUrl: e.target.value })} /></div> : <div className="grid grid-cols-2 gap-4"><div><Label>{t('agents.command')}</Label><Input value={v.command ?? ''} onChange={e => p({ command: e.target.value })} /></div><div><Label>{t('agents.arguments')}</Label><Input value={v.argumentsJson ?? ''} onChange={e => p({ argumentsJson: e.target.value })} /></div></div>}<div className="grid grid-cols-2 gap-4"><div><Label>{t('common.authentication')}</Label><select className={field} value={v.authType} onChange={e => p({ authType: e.target.value })}>{['none','bearer','api-key','oauth'].map(x => <option key={x}>{x}</option>)}</select></div><div><Label>{t('agents.credential')}</Label><Input type="password" placeholder={t('agents.blankSecret')} onChange={e => p({ credential: e.target.value })} /></div></div><div><Label>{t('agents.headers')}</Label><Textarea value={v.headersJson ?? ''} onChange={e => p({ headersJson: e.target.value })} /></div><Toggle checked={v.enabled} onChange={enabled => p({ enabled })} /></> }
function SkillForm({ value: v, set }: { value: SkillInput; set: React.Dispatch<React.SetStateAction<SkillInput>> }) { const { t } = useTranslation(); const p = (x: Partial<SkillInput>) => set(y => ({ ...y, ...x })); return <><div className="grid grid-cols-2 gap-4"><div><Label>{t('common.name')}</Label><Input value={v.name} onChange={e => p({ name: e.target.value })} /></div><div><Label>{t('agents.version')}</Label><Input value={v.version} onChange={e => p({ version: e.target.value })} /></div></div><div><Label>{t('common.description')}</Label><Input value={v.description ?? ''} onChange={e => p({ description: e.target.value })} /></div><div><Label>{t('agents.instructions')}</Label><Textarea className="font-mono" rows={16} placeholder={t('agents.instructionsPlaceholder')} value={v.instructions} onChange={e => p({ instructions: e.target.value })} /></div><Toggle checked={v.enabled} onChange={enabled => p({ enabled })} /></> }
