import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Save, UserMinus, UserPlus } from 'lucide-react'
import { workspacesApi } from '@/api/workspaces'
import type { Workspace } from '@/types'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspaces } from '@/contexts/WorkspaceContext'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'

export default function SettingsPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { renameWorkspace } = useWorkspaces()
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [workspaceName, setWorkspaceName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [memberInput, setMemberInput] = useState('')
  const [addingMember, setAddingMember] = useState(false)

  const fetchWorkspace = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const ws = await workspacesApi.get(id)
      setWorkspace(ws)
      setWorkspaceName(ws.name)
    } catch {
      toast.error(t('workspace.loadFailed'))
      navigate('/')
    } finally {
      setLoading(false)
    }
  }, [id, navigate, t])

  useEffect(() => { void fetchWorkspace() }, [fetchWorkspace])

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = workspaceName.trim()
    if (!trimmed || !workspace || trimmed === workspace.name) return
    setRenaming(true)
    try {
      await workspacesApi.rename(workspace.id, trimmed)
      renameWorkspace(workspace.id, trimmed)
      setWorkspace(prev => prev ? { ...prev, name: trimmed } : prev)
      toast.success(t('settings.renamed'))
    } catch {
      toast.error(t('settings.renameFailed'))
    } finally {
      setRenaming(false)
    }
  }

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!memberInput.trim() || !workspace) return
    setAddingMember(true)
    try {
      await workspacesApi.addMember(workspace.id, memberInput.trim())
      toast.success(t('settings.memberAdded'))
      setMemberInput('')
      void fetchWorkspace()
    } catch {
      toast.error(t('settings.memberAddFailed'))
    } finally {
      setAddingMember(false)
    }
  }

  const handleRemoveMember = async (userId: string, username: string) => {
    if (!workspace) return
    if (!confirm(t('settings.removeConfirm', { name: username }))) return
    try {
      await workspacesApi.removeMember(workspace.id, userId)
      toast.success(t('settings.memberRemoved'))
      void fetchWorkspace()
    } catch {
      toast.error(t('settings.memberRemoveFailed'))
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!workspace) return null

  const isOwner = workspace.members.some(m => m.userId === user?.id && m.role === 'Owner')
  const nameChanged = workspaceName.trim() !== workspace.name && workspaceName.trim() !== ''

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 border-b bg-background px-6 py-3 flex items-center gap-3">
        <h1 className="text-base font-semibold">{t('settings.title')}</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-2xl space-y-0">
          {/* General */}
          <section>
            <h2 className="text-sm font-semibold text-foreground mb-4">{t('settings.general')}</h2>
            <form onSubmit={e => void handleRename(e)} className="space-y-3">
              <div>
                <Label htmlFor="workspace-name" className="mb-1.5 block">{t('settings.workspaceName')}</Label>
                <div className="flex gap-2">
                  <Input
                    id="workspace-name"
                    value={workspaceName}
                    onChange={e => setWorkspaceName(e.target.value)}
                    disabled={!isOwner || renaming}
                    className="flex-1"
                  />
                  {isOwner && (
                    <button
                      type="submit"
                      disabled={!nameChanged || renaming}
                      className={cn(buttonVariants({ size: 'sm' }))}
                    >
                      <Save className="w-4 h-4" />
                      {renaming ? t('common.saving') : t('common.save')}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </section>

          <Separator className="my-6" />

          {/* Members */}
          <section>
            <h2 className="text-sm font-semibold text-foreground mb-4">
              {t('settings.members')}{' '}
              <span className="text-muted-foreground font-normal">({workspace.members.length})</span>
            </h2>
            <ul className="space-y-1 mb-4">
              {workspace.members.map(m => (
                <li key={m.userId} className="flex items-center gap-3 py-2">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="text-xs">
                      {m.username.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-none">{m.username}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={cn(
                      'text-xs px-2 py-0.5 rounded-full font-medium',
                      m.role === 'Owner'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-secondary text-secondary-foreground',
                    )}>
                      {m.role === 'Owner' ? t('common.owner') : m.role}
                    </span>
                    {((isOwner && m.userId !== user?.id) || (m.userId === user?.id && m.role !== 'Owner')) && (
                      <button
                        onClick={() => void handleRemoveMember(m.userId, m.username)}
                        className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title={m.userId === user?.id ? t('settings.leaveWorkspace') : t('settings.removeMember')}
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {isOwner && (
              <form onSubmit={e => void handleAddMember(e)} className="flex gap-2">
                <Input
                  value={memberInput}
                  onChange={e => setMemberInput(e.target.value)}
                  placeholder={t('settings.memberPlaceholder')}
                  className="flex-1"
                />
                <button
                  type="submit"
                  disabled={!memberInput.trim() || addingMember}
                  className={cn(buttonVariants({ size: 'sm' }))}
                >
                  <UserPlus className="w-4 h-4" />
                  {addingMember ? t('common.adding') : t('common.add')}
                </button>
              </form>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
