import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom'
import { createPortal } from 'react-dom'
import {
  FileText, ChevronDown, Plus, Check, LogOut,
  Folder, Trash2, X, HardDrive, Settings, Bot,
  Languages, CalendarClock,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { useWorkspaces } from '../../contexts/WorkspaceContext'
import { workspacesApi } from '../../api/workspaces'
import type { Workspace } from '../../types'

function CreateWorkspaceModal({ onClose, onCreated }: {
  onClose: () => void
  onCreated: (w: Workspace) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      const workspace = await workspacesApi.create(name.trim(), description.trim() || undefined)
      onCreated(workspace)
    } catch {
      toast.error(t('workspace.createFailed'))
    } finally {
      setLoading(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{t('workspace.new')}</h2>
          <button onClick={onClose} disabled={loading} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={e => void handleSubmit(e)} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('workspace.name')}</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('workspace.namePlaceholder')}
              required
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('workspace.description')} <span className="text-gray-400 font-normal">({t('common.optional')})</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t('workspace.descriptionPlaceholder')}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
            />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} disabled={loading}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={!name.trim() || loading}
              className="px-4 py-2 rounded-lg text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? t('common.creating') : t('common.create')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}

export default function Sidebar() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { id: currentId } = useParams<{ id: string }>()
  const { user, logout } = useAuth()
  const { workspaces, loading, addWorkspace, removeWorkspace } = useWorkspaces()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const currentWorkspace = workspaces.find(w => w.id === currentId)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (id: string) => {
    setDropdownOpen(false)
    navigate(`/workspaces/${id}`)
  }

  const handleDelete = async (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(t('workspace.deleteConfirm', { name }))) return
    try {
      await workspacesApi.delete(id)
      removeWorkspace(id)
      toast.success(t('workspace.deleted'))
      if (currentId === id) navigate('/')
    } catch {
      toast.error(t('workspace.deleteFailed'))
    }
  }

  return (
    <>
      <aside className="w-60 h-full flex flex-col bg-[#f6f8fc] border-r border-gray-200 flex-shrink-0 select-none">
        {/* Logo */}
        <div className="h-16 flex items-center px-4 gap-2 flex-shrink-0">
          <FileText className="w-6 h-6 text-primary-600" />
          <span className="text-lg font-bold text-gray-900 tracking-tight">AgentOffice</span>
        </div>

        {/* Workspace switcher */}
        <div className="px-3 pb-3 flex-shrink-0 relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(o => !o)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 transition-colors text-left shadow-sm"
          >
            <Folder className="w-4 h-4 text-primary-500 flex-shrink-0" />
            <span className="flex-1 text-sm font-medium text-gray-800 truncate min-w-0">
              {loading ? t('common.loading') : (currentWorkspace?.name ?? t('workspace.select'))}
            </span>
            <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-150 ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {dropdownOpen && (
            <div className="absolute left-3 right-3 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden z-50">
              <div className="max-h-64 overflow-y-auto">
                {workspaces.length === 0 ? (
                  <p className="px-4 py-4 text-xs text-gray-400 text-center">{t('workspace.empty')}</p>
                ) : (
                  workspaces.map(ws => (
                    <button
                      key={ws.id}
                      onClick={() => handleSelect(ws.id)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left group"
                    >
                      <Folder className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="flex-1 text-sm text-gray-700 truncate">{ws.name}</span>
                      {ws.id === currentId && (
                        <Check className="w-3.5 h-3.5 text-primary-500 flex-shrink-0" />
                      )}
                      <button
                        onClick={e => void handleDelete(ws.id, ws.name, e)}
                        className="p-0.5 rounded text-transparent group-hover:text-gray-300 hover:!text-red-500 transition-colors flex-shrink-0"
                        title={t('workspace.deleteTitle')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </button>
                  ))
                )}
              </div>
              <div className="border-t border-gray-100">
                <button
                  onClick={() => { setDropdownOpen(false); setShowCreate(true) }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-primary-50 transition-colors text-sm text-primary-600 font-medium"
                >
                  <Plus className="w-4 h-4" />
                  {t('workspace.newAction')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
          {currentWorkspace && (
            <>
              <Link
                to={`/workspaces/${currentWorkspace.id}/agents`}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  location.pathname === `/workspaces/${currentWorkspace.id}/agents`
                    ? 'bg-gray-200/80 text-gray-900 font-medium'
                    : 'text-gray-700 hover:bg-gray-200/60'
                }`}
              >
                <Bot className="w-4 h-4 text-gray-500" />
                {t('nav.agents')}
              </Link>
              <Link
                to={`/workspaces/${currentWorkspace.id}/schedules`}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  location.pathname === `/workspaces/${currentWorkspace.id}/schedules`
                    ? 'bg-gray-200/80 text-gray-900 font-medium'
                    : 'text-gray-700 hover:bg-gray-200/60'
                }`}
              >
                <CalendarClock className="w-4 h-4 text-gray-500" />
                Agent 排程
              </Link>
              <Link
                to={`/workspaces/${currentWorkspace.id}`}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  location.pathname === `/workspaces/${currentWorkspace.id}`
                    ? 'bg-gray-200/80 text-gray-900 font-medium'
                    : 'text-gray-700 hover:bg-gray-200/60'
                }`}
              >
                <HardDrive className="w-4 h-4 text-gray-500" />
                {t('nav.drive')}
              </Link>
              <Link
                to={`/workspaces/${currentWorkspace.id}/settings`}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  location.pathname === `/workspaces/${currentWorkspace.id}/settings`
                    ? 'bg-gray-200/80 text-gray-900 font-medium'
                    : 'text-gray-700 hover:bg-gray-200/60'
                }`}
              >
                <Settings className="w-4 h-4 text-gray-500" />
                {t('nav.settings')}
              </Link>
            </>
          )}
        </nav>

        {/* User info */}
        <div className="px-3 py-3 border-t border-gray-200 flex-shrink-0">
          <label className="mb-3 flex items-center gap-2 text-gray-500" title={t('language.label')}>
            <Languages className="h-4 w-4 flex-shrink-0" />
            <select
              value={i18n.resolvedLanguage === 'zh-TW' ? 'zh-TW' : 'en'}
              onChange={e => void i18n.changeLanguage(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:ring-2 focus:ring-primary-500"
              aria-label={t('language.label')}
            >
              <option value="en">{t('language.en')}</option>
              <option value="zh-TW">{t('language.zhTW')}</option>
            </select>
          </label>
          {user && (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-bold text-primary-700 uppercase">
                  {user.username.charAt(0)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{user.username}</p>
                <p className="text-xs text-gray-400 truncate">{user.email}</p>
              </div>
              <button
                onClick={logout}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors flex-shrink-0"
                title={t('nav.signOut')}
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {showCreate && (
        <CreateWorkspaceModal
          onClose={() => setShowCreate(false)}
          onCreated={ws => {
            addWorkspace(ws)
            setShowCreate(false)
            navigate(`/workspaces/${ws.id}`)
            toast.success(t('workspace.created', { name: ws.name }))
          }}
        />
      )}
    </>
  )
}
