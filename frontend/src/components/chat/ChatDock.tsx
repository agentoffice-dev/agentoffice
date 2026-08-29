import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr'
import { AtSign, ChevronRight, MessageSquare, Send, Users } from 'lucide-react'
import { chatApi, type ChatMessage } from '@/api/chat'
import { agentResourcesApi, type AgentResource } from '@/api/agentResources'
import { agentTasksApi, type AgentTask, type AgentTaskEvent } from '@/api/agentTasks'
import { describeAgentEvent } from '@/components/chat/agentEvents'
import { applyMention, matchAgents, mentionDraftAt, splitMentions } from '@/components/chat/mentions'
import AgentAvatar from '@/components/agents/AgentAvatar'
import { useAuth } from '@/contexts/AuthContext'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { translateApiMessage } from '@/lib/apiErrors'

type ChatDockProps = { workspaceId?: string; documentId?: string }

/** One chat entry, whichever source it came from, so both sit on the same timeline. */
type TimelineItem =
  | { kind: 'message'; id: string; at: number; message: ChatMessage }
  | { kind: 'task'; id: string; at: number; task: AgentTask }

const STATUS_ICONS: Record<AgentTask['status'], string> = {
  queued: '🕒',
  running: '⏳',
  completed: '✅',
  failed: '⚠️',
  cancelled: '🚫',
}

function addUnique(messages: ChatMessage[], incoming: ChatMessage) {
  return messages.some(message => message.id === incoming.id) ? messages : [...messages, incoming]
}

function clockTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function ChatDock({ workspaceId, documentId }: ChatDockProps) {
  const { t } = useTranslation()
  const { user, token } = useAuth()
  const [open, setOpen] = useState(() => localStorage.getItem('agentoffice.chat.open') !== 'false')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [caret, setCaret] = useState(0)
  const [highlighted, setHighlighted] = useState(0)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string>()
  const [agents, setAgents] = useState<AgentResource[]>([])
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>([])
  const [agentEvents, setAgentEvents] = useState<AgentTaskEvent[]>([])
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Only an enabled agent can pick up a task, so only those are worth tagging.
  const mentionable = useMemo(() => agents.filter(agent => agent.enabled), [agents])
  const mentionDraft = useMemo(() => mentionDraftAt(draft, caret), [draft, caret])
  const suggestions = useMemo(
    () => (mentionDraft ? matchAgents(mentionable, mentionDraft.query) : []),
    [mentionDraft, mentionable])
  const picking = suggestions.length > 0

  // A task reads as the agent's own reply to the request that spawned it, so it
  // belongs in the message flow at the moment it started — not in a side list.
  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...messages.map(message => ({
        kind: 'message' as const, id: `message-${message.id}`, at: new Date(message.createdAt).getTime(), message,
      })),
      ...agentTasks.map(task => ({
        kind: 'task' as const, id: `task-${task.id}`, at: new Date(task.createdAt).getTime(), task,
      })),
    ]
    // A task shares its trigger message's timestamp; a stable sort keeps the request first.
    return items.sort((left, right) => left.at - right.at)
  }, [messages, agentTasks])

  const eventsByTask = useMemo(() => {
    const grouped = new Map<string, AgentTaskEvent[]>()
    for (const event of agentEvents) {
      const existing = grouped.get(event.agentTaskId)
      if (existing) existing.push(event)
      else grouped.set(event.agentTaskId, [event])
    }
    return grouped
  }, [agentEvents])

  useEffect(() => {
    localStorage.setItem('agentoffice.chat.open', String(open))
  }, [open])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [timeline, agentEvents])

  useEffect(() => setHighlighted(0), [mentionDraft?.query])

  useEffect(() => {
    if (!workspaceId) {
      setAgents([])
      return
    }
    let disposed = false
    // A missing roster only costs the tag picker, so a failure here stays silent.
    agentResourcesApi.listAgents(workspaceId)
      .then(result => { if (!disposed) setAgents(result) })
      .catch(() => { if (!disposed) setAgents([]) })
    return () => { disposed = true }
  }, [workspaceId])

  useEffect(() => {
    if (!workspaceId || !token) {
      setMessages([])
      setConnected(false)
      return
    }

    let disposed = false
    setLoading(true)
    setError(undefined)
    const baseUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
    const connection = new HubConnectionBuilder()
      .withUrl(`${baseUrl}/hubs/chat`, { accessTokenFactory: () => token })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build()

    connection.on('message.created', (message: ChatMessage) => {
      if (message.workspaceId === workspaceId) setMessages(current => addUnique(current, message))
    })
    connection.on('agent.task.created', (task: AgentTask) => {
      if (task.workspaceId === workspaceId) setAgentTasks(current => [task, ...current.filter(item => item.id !== task.id)])
    })
    connection.on('agent.task.updated', (task: AgentTask) => {
      if (task.workspaceId === workspaceId) setAgentTasks(current => [task, ...current.filter(item => item.id !== task.id)])
    })
    connection.on('agent.event.created', (event: AgentTaskEvent) => {
      setAgentEvents(current => [...current.filter(item => item.id !== event.id), event].slice(-50))
    })
    connection.onreconnecting(() => setConnected(false))
    connection.onreconnected(() => {
      void connection.invoke('JoinWorkspace', workspaceId)
      setConnected(true)
    })
    connection.onclose(() => setConnected(false))

    const connect = async () => {
      try {
        await connection.start()
        await connection.invoke('JoinWorkspace', workspaceId)
        if (disposed) return
        setConnected(true)
        const [history, taskHistory] = await Promise.all([
          chatApi.history(workspaceId),
          agentTasksApi.list(workspaceId),
        ])
        if (disposed) return
        setMessages(current => {
          const merged = current.reduce(addUnique, history)
          return merged.sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
        })
        setAgentTasks(taskHistory)
      } catch {
        if (!disposed) setError(t('chat.joinFailed'))
      } finally {
        if (!disposed) setLoading(false)
      }
    }
    void connect()

    return () => {
      disposed = true
      if (connection.state !== HubConnectionState.Disconnected) void connection.stop()
    }
  }, [workspaceId, token, t])

  const trackCaret = (element: HTMLTextAreaElement) => setCaret(element.selectionStart ?? element.value.length)

  const pick = (agent: AgentResource) => {
    if (!mentionDraft) return
    const next = applyMention(draft, mentionDraft, caret, agent.name)
    setDraft(next.value)
    setCaret(next.caret)
    // The caret only moves once React has written the new value into the textarea.
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(next.caret, next.caret)
    })
  }

  const send = async () => {
    const content = draft.trim()
    if (!workspaceId || !content || sending) return
    setDraft('')
    setCaret(0)
    setSending(true)
    setError(undefined)
    try {
      // The server reads the @tag and turns the message into that agent's task;
      // the client only reports which document it was sent from.
      const message = await chatApi.send(workspaceId, content, documentId)
      setMessages(current => addUnique(current, message))
    } catch {
      setDraft(content)
      setError(t('chat.sendFailed'))
    } finally {
      setSending(false)
    }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    void send()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (picking) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : suggestions.length - 1
        setHighlighted(current => (current + step) % suggestions.length)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        pick(suggestions[Math.min(highlighted, suggestions.length - 1)])
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        // Moving the caret past the tag closes the picker without touching the text.
        setCaret(draft.length)
        return
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send()
    }
  }

  const taskOf = (message: ChatMessage) =>
    message.agentTaskId ? agentTasks.find(task => task.id === message.agentTaskId) : undefined

  const renderMessage = (message: ChatMessage) => {
    const mine = message.senderId === user?.id
    const task = taskOf(message)
    return (
      <div className={cn('flex gap-2.5', mine && 'flex-row-reverse')}>
        {task ? (
          <AgentAvatar provider={task.agentProvider ?? 'anthropic'} avatarUrl={task.agentAvatarUrl ?? undefined}
            name={task.agentName ?? message.senderName} className="size-7" iconClassName="size-3.5" />
        ) : (
          <Avatar className="size-7"><AvatarFallback>{message.senderName.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar>
        )}
        <div className={cn('flex max-w-[82%] flex-col gap-1', mine && 'items-end')}>
          <div className="flex items-baseline gap-2 px-1">
            <span className="text-[11px] font-medium">{mine ? t('chat.you') : task?.agentName ?? message.senderName}</span>
            <time className="text-[10px] text-muted-foreground">{clockTime(message.createdAt)}</time>
          </div>
          <div className={cn('whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-6', mine ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
            {splitMentions(message.content, mentionable).map((segment, index) => segment.agent ? (
              <span key={index} className={cn('rounded px-1 font-medium', mine ? 'bg-primary-foreground/20' : 'bg-primary/10 text-primary')}>
                {segment.text}
              </span>
            ) : segment.text)}
          </div>
        </div>
      </div>
    )
  }

  /**
   * One bubble per task, shaped like any other message. Progress rewrites that same
   * bubble instead of stacking a log, so a run reads as one member talking.
   */
  const renderTask = (task: AgentTask) => {
    const steps = eventsByTask.get(task.id) ?? []
    let latest: ReturnType<typeof describeAgentEvent> = null
    for (const event of steps) latest = describeAgentEvent(event, t) ?? latest
    const failed = task.status === 'failed' || task.status === 'cancelled'
    // The task's own error is the authoritative reason; events only narrate the way there.
    const text = failed && task.error ? translateApiMessage(task.error, t) : latest?.text ?? t(`chat.status.${task.status}`)
    const icon = failed && task.error ? STATUS_ICONS[task.status] : latest?.icon ?? STATUS_ICONS[task.status]
    return (
      <div className="flex gap-2.5">
        <AgentAvatar provider={task.agentProvider ?? 'anthropic'} avatarUrl={task.agentAvatarUrl ?? undefined}
          name={task.agentName ?? undefined} className="size-7" iconClassName="size-3.5" />
        <div className="flex max-w-[82%] flex-col gap-1">
          <div className="flex items-baseline gap-2 px-1">
            <span className="text-[11px] font-medium">{task.agentName ?? t('chat.aiTask')}</span>
            <time className="text-[10px] text-muted-foreground">{clockTime(task.updatedAt)}</time>
          </div>
          <div className={cn(
            'flex gap-1.5 rounded-xl bg-muted px-3 py-2 text-sm leading-6',
            (failed || latest?.tone === 'error') && 'text-destructive',
          )}>
            <span aria-hidden>{icon}</span>
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
              {text}
              {(task.status === 'running' || task.status === 'queued') && (
                <span className="ml-1 inline-block size-1.5 animate-pulse rounded-full bg-current align-middle" />
              )}
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <aside aria-label={t('chat.label')} className={cn(
      'flex shrink-0 border-l bg-background transition-[width] duration-300 ease-out',
      open ? 'fixed inset-y-0 right-0 z-30 w-[min(92vw,380px)] md:relative md:inset-auto md:z-auto md:w-[360px]' : 'w-12',
    )}>
      {!open ? (
        <div className="flex w-full flex-col items-center gap-3 py-3">
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label={t('chat.open')}>
            <MessageSquare />
          </Button>
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground [writing-mode:vertical-rl]">{t('chat.label')}</span>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-3 px-3">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground"><Users className="size-4" /></div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{t('chat.title')}</p>
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className={cn('size-1.5 rounded-full', connected ? 'bg-emerald-500' : 'bg-muted-foreground')} />
                {workspaceId ? connected ? t('chat.live') : t('chat.connecting') : t('chat.noWorkspace')}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label={t('chat.collapse')}><ChevronRight /></Button>
          </header>
          <Separator />

          <div className="flex-1 overflow-y-auto px-4 py-5">
            {!workspaceId ? (
              <div className="flex min-h-full flex-col justify-center pb-12">
                <div className="mb-5 flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground"><Users className="size-5" /></div>
                <h2 className="text-lg font-semibold tracking-tight">{t('chat.chooseTitle')}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('chat.chooseHint')}</p>
              </div>
            ) : loading ? (
              <p className="text-sm text-muted-foreground">{t('chat.loading')}</p>
            ) : timeline.length === 0 ? (
              <div className="flex min-h-full flex-col justify-center pb-12">
                <div className="mb-5 flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground"><MessageSquare className="size-5" /></div>
                <h2 className="text-lg font-semibold tracking-tight">{t('chat.emptyTitle')}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('chat.emptyHint')}</p>
                {mentionable.length > 0 && (
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {t('chat.assignHint', { name: mentionable[0].name })}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {timeline.map(item => (
                  <div key={item.id}>
                    {item.kind === 'message' ? renderMessage(item.message) : renderTask(item.task)}
                  </div>
                ))}
                <div ref={endRef} />
              </div>
            )}
          </div>

          <div className="shrink-0 p-3 pt-0">
            {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
            <form onSubmit={handleSubmit} className="relative rounded-xl border bg-card p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring">
              {picking && (
                <ul role="listbox" aria-label={t('chat.chooseAgent')}
                  className="absolute inset-x-0 bottom-full z-10 mb-2 max-h-56 overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg">
                  {suggestions.map((agent, index) => (
                    <li key={agent.id}>
                      <button type="button" role="option" aria-selected={index === highlighted}
                        onMouseEnter={() => setHighlighted(index)}
                        // mousedown keeps focus in the textarea, so the caret survives the click.
                        onMouseDown={event => { event.preventDefault(); pick(agent) }}
                        className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left', index === highlighted && 'bg-accent')}>
                        <AgentAvatar provider={agent.provider} avatarUrl={agent.avatarUrl} name={agent.name} className="size-7" iconClassName="size-3.5" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{agent.name}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">{agent.description || agent.model || agent.provider}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Textarea ref={inputRef} value={draft}
                onChange={event => { setDraft(event.target.value); trackCaret(event.target) }}
                onKeyUp={event => trackCaret(event.currentTarget)}
                onClick={event => trackCaret(event.currentTarget)}
                onKeyDown={handleKeyDown}
                placeholder={workspaceId ? t('chat.placeholder') : t('chat.placeholderNoWorkspace')} rows={2}
                disabled={!workspaceId || sending} maxLength={4000}
                className="min-h-14 resize-none border-0 p-1 shadow-none focus-visible:ring-0" />
              <div className="mt-1 flex items-center justify-between pl-1">
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  {picking ? t('chat.picking') : (<><AtSign className="size-3" />{t('chat.composerHint')}</>)}
                </span>
                <Button type="submit" size="icon" disabled={!workspaceId || !draft.trim() || sending} aria-label={t('chat.send')}><Send /></Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  )
}
