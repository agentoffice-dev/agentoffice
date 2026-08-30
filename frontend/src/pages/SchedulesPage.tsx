import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CalendarClock, Pencil, Play, Plus, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { agentSchedulesApi, type AgentSchedule, type AgentScheduleInput, type ScheduleUnit } from '../api/agentSchedules'
import { agentResourcesApi, type AgentResource } from '../api/agentResources'
import { documentsApi } from '../api/documents'
import type { Document } from '../types'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

const inputClass = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm'
const localTime = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date(Date.now() + 3600_000)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
const blank = (): AgentScheduleInput => ({ name: '', prompt: '', agentId: null, documentId: null, interval: 1, unit: 'days', enabled: true, nextRunAt: localTime() })

export default function SchedulesPage() {
  const { id: workspaceId = '' } = useParams()
  const [items, setItems] = useState<AgentSchedule[]>([])
  const [agents, setAgents] = useState<AgentResource[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [editing, setEditing] = useState<AgentSchedule | null | undefined>(undefined)
  const [form, setForm] = useState<AgentScheduleInput>(blank())
  const [saving, setSaving] = useState(false)

  const reload = async () => {
    try {
      const [s, a, d] = await Promise.all([agentSchedulesApi.list(workspaceId), agentResourcesApi.listAgents(workspaceId), documentsApi.list()])
      setItems(s); setAgents(a.filter(x => x.enabled)); setDocuments(d.filter(x => x.workspaceId === workspaceId))
    } catch { toast.error('無法載入排程資料') }
  }
  useEffect(() => { void reload() }, [workspaceId])

  const open = (item?: AgentSchedule) => {
    setEditing(item ?? null)
    setForm(item ? { name: item.name, prompt: item.prompt, agentId: item.agentId, documentId: item.documentId, interval: item.interval, unit: item.unit, enabled: item.enabled, nextRunAt: localTime(item.nextRunAt) } : blank())
  }
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!form.name.trim() || !form.prompt.trim()) return
    setSaving(true)
    try {
      const value = { ...form, nextRunAt: new Date(form.nextRunAt).toISOString() }
      if (editing) await agentSchedulesApi.update(workspaceId, editing.id, value)
      else await agentSchedulesApi.create(workspaceId, value)
      toast.success('排程已儲存'); setEditing(undefined); await reload()
    } catch { toast.error('排程儲存失敗') } finally { setSaving(false) }
  }
  const remove = async (item: AgentSchedule) => {
    if (!confirm(`刪除排程「${item.name}」？`)) return
    try { await agentSchedulesApi.delete(workspaceId, item.id); await reload(); toast.success('排程已刪除') } catch { toast.error('刪除失敗') }
  }
  const run = async (item: AgentSchedule) => {
    try { await agentSchedulesApi.run(workspaceId, item.id); toast.success('已加入 agent 工作佇列') } catch { toast.error('無法啟動工作') }
  }

  return <div className="mx-auto max-w-6xl space-y-6 p-8">
    <div className="flex items-start justify-between"><div><h1 className="text-2xl font-bold">Agent 排程</h1><p className="mt-1 text-sm text-muted-foreground">定期用 prompt 指派 Office tool 或 MCP 工作給指定 agent。</p></div><Button onClick={() => open()}><Plus />新增排程</Button></div>
    {!items.length ? <div className="rounded-xl border border-dashed py-20 text-center text-muted-foreground"><CalendarClock className="mx-auto mb-3 h-10 w-10" /><p>尚未建立排程</p></div> :
      <div className="grid gap-4 md:grid-cols-2">{items.map(item => <Card key={item.id} className={!item.enabled ? 'opacity-60' : ''}><CardHeader className="pb-3"><div className="flex items-start justify-between"><div><CardTitle>{item.name}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{item.enabled ? `下次：${new Date(item.nextRunAt).toLocaleString()}` : '已停用'}</p></div><span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">每 {item.interval} {unitLabel[item.unit]}</span></div></CardHeader><CardContent><p className="line-clamp-3 whitespace-pre-wrap text-sm">{item.prompt}</p><div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground"><span>Agent：{item.agentName ?? '工作區預設'}</span><span>文件：{item.documentName ?? '由 prompt 決定／建立新檔'}</span></div><div className="mt-4 flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => void run(item)}><Play />立即執行</Button><Button size="icon" variant="ghost" onClick={() => open(item)}><Pencil /></Button><Button size="icon" variant="ghost" onClick={() => void remove(item)}><Trash2 className="text-destructive" /></Button></div></CardContent></Card>)}</div>}
    {editing !== undefined && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><form onSubmit={e => void save(e)} className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-xl bg-background p-6 shadow-xl"><div className="flex justify-between"><h2 className="text-lg font-semibold">{editing ? '編輯排程' : '新增排程'}</h2><button type="button" onClick={() => setEditing(undefined)}><X /></button></div><div><Label>名稱</Label><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例如：每週更新銷售報表" /></div><div><Label>Prompt</Label><Textarea required rows={7} value={form.prompt} onChange={e => setForm({ ...form, prompt: e.target.value })} placeholder="例如：呼叫 read_document 讀取指定 Excel，整理本週數字後呼叫 write_text 更新摘要工作表並儲存。或呼叫 sales MCP 取得資料，建立 Excel 檔案並寫入結果。" /></div><div className="grid gap-4 sm:grid-cols-2"><div><Label>Agent</Label><select className={inputClass} value={form.agentId ?? ''} onChange={e => setForm({ ...form, agentId: e.target.value || null })}><option value="">工作區預設 Agent</option>{agents.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div><div><Label>指定 Office 文件（選填）</Label><select className={inputClass} value={form.documentId ?? ''} onChange={e => setForm({ ...form, documentId: e.target.value || null })}><option value="">不指定／由 agent 建立</option>{documents.map(x => <option key={x.id} value={x.id}>{x.fileName}</option>)}</select></div></div><div className="grid grid-cols-3 gap-4"><div><Label>每隔</Label><Input type="number" min={1} required value={form.interval} onChange={e => setForm({ ...form, interval: +e.target.value })} /></div><div><Label>單位</Label><select className={inputClass} value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value as ScheduleUnit })}>{Object.entries(unitLabel).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></div><div><Label>首次／下次執行</Label><Input type="datetime-local" required value={form.nextRunAt} onChange={e => setForm({ ...form, nextRunAt: e.target.value })} /></div></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} />啟用此排程</label><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditing(undefined)}>取消</Button><Button disabled={saving}>{saving ? '儲存中…' : '儲存'}</Button></div></form></div>}
  </div>
}
const unitLabel: Record<ScheduleUnit, string> = { minutes: '分鐘', hours: '小時', days: '天', weeks: '週' }
