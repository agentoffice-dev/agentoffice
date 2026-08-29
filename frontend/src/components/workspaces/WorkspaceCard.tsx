import { useState, useRef, useEffect } from 'react'
import { Users, Trash2, Pencil, Check, X } from 'lucide-react'
import type { Workspace } from '@/types'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from 'react-i18next'

interface Props {
  workspace: Workspace
  currentUserId: string
  onClick: () => void
  onDelete: (id: string) => void
  onRename: (id: string, name: string) => Promise<void>
}

const COLORS = [
  'bg-violet-100 text-violet-700',
  'bg-sky-100 text-sky-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-indigo-100 text-indigo-700',
]

function workspaceColor(id: string) {
  const idx = id.charCodeAt(0) % COLORS.length
  return COLORS[idx]
}

function workspaceInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()
}

export default function WorkspaceCard({ workspace, currentUserId, onClick, onDelete, onRename }: Props) {
  const { t } = useTranslation()
  const isOwner = workspace.members.some(m => m.userId === currentUserId && m.role === 'Owner')
  const color = workspaceColor(workspace.id)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(workspace.name)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const handleSave = async () => {
    const trimmed = editName.trim()
    if (!trimmed || trimmed === workspace.name) { handleCancel(); return }
    setSaving(true)
    try {
      await onRename(workspace.id, trimmed)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditName(workspace.name)
    setEditing(false)
  }

  return (
    <div
      onClick={editing ? undefined : onClick}
      className={cn(
        'group relative bg-card border rounded-lg p-5 cursor-pointer',
        'hover:border-primary/40 hover:shadow-sm transition-all duration-150',
        editing && 'border-primary/40',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={cn('w-9 h-9 rounded-md flex items-center justify-center text-sm font-bold shrink-0', color)}>
            {workspaceInitials(workspace.name)}
          </div>
          <div className="min-w-0 pt-0.5 flex-1">
            {editing ? (
              <input
                ref={inputRef}
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void handleSave()
                  if (e.key === 'Escape') handleCancel()
                }}
                onClick={e => e.stopPropagation()}
                disabled={saving}
                className="w-full text-sm font-semibold bg-transparent border border-primary rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            ) : (
              <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                {workspace.name}
              </p>
            )}
            {workspace.description && !editing && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{workspace.description}</p>
            )}
          </div>
        </div>

        {isOwner && !editing && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={e => { e.stopPropagation(); setEditing(true) }}
              className="p-1.5 rounded-md text-muted-foreground/50 hover:text-primary hover:bg-accent transition-colors"
              title={t('common.rename')}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete(workspace.id) }}
              className="p-1.5 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
              title={t('common.delete')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {editing && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={e => { e.stopPropagation(); void handleSave() }}
              disabled={saving || !editName.trim()}
              className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-40"
              title={t('common.save')}
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={e => { e.stopPropagation(); handleCancel() }}
              disabled={saving}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-muted transition-colors"
              title={t('common.cancel')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="w-3.5 h-3.5" />
          <span>{workspace.members.length} {t('settings.members')}</span>
        </div>
        {isOwner && !editing && (
          <Badge variant="accent" className="text-[10px] px-1.5 py-0">{t('common.owner')}</Badge>
        )}
      </div>
    </div>
  )
}
