import { useState, useEffect, useCallback, useRef } from 'react'
import { HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr'
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Check, ChevronRight, Folder as FolderIcon, FolderPlus,
  MoreHorizontal, Pencil, Plus, RefreshCw, Search, Trash2, FileText, X,
  FileSpreadsheet, Presentation, Upload,
} from 'lucide-react'
import { workspacesApi } from '@/api/workspaces'
import { documentsApi } from '@/api/documents'
import { foldersApi } from '@/api/folders'
import type { Workspace, Document, Folder } from '@/types'
import DocumentCard from '@/components/documents/DocumentCard'
import UploadModal from '@/components/documents/UploadModal'
import FolderPickerButton from '@/components/documents/FolderPickerButton'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

function FolderCard({ folder, onOpen, onDelete, onRename }: {
  folder: Folder
  onOpen: () => void
  onDelete: () => void
  onRename: (name: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(folder.name)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const handleSave = async () => {
    const trimmed = editName.trim()
    if (!trimmed || trimmed === folder.name) { handleCancel(); return }
    setSaving(true)
    try {
      await onRename(trimmed)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditName(folder.name)
    setEditing(false)
  }

  return (
    <div
      onClick={editing ? undefined : onOpen}
      className={cn(
        'group bg-card border rounded-lg p-4 flex flex-col gap-2 cursor-pointer',
        'hover:border-primary/40 hover:shadow-sm transition-all duration-150',
        editing && 'border-primary/40',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-md bg-amber-50 flex items-center justify-center shrink-0">
          <FolderIcon className="w-5 h-5 text-amber-500" />
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          {editing ? (
            <input
              ref={inputRef}
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Enter') void handleSave()
                if (e.key === 'Escape') handleCancel()
              }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              disabled={saving}
              className="w-full text-sm font-medium bg-transparent border border-primary rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          ) : (
            <p className="text-sm font-medium truncate">{folder.name}</p>
          )}
          {!editing && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(folder.createdAt).toLocaleDateString()}
            </p>
          )}
        </div>

        {editing ? (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); void handleSave() }}
              disabled={saving || !editName.trim()}
              className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-40"
              title={t('common.save')}
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleCancel() }}
              disabled={saving}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-muted transition-colors"
              title={t('common.cancel')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity')}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={(e: React.MouseEvent) => { e.stopPropagation(); setEditing(true) }}>
                <Pencil className="w-4 h-4 mr-2" />
                {t('common.rename')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDelete() }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {t('common.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}

function CreateFolderDialog({ open, onClose, onCreated, workspaceId, parentFolderId }: {
  open: boolean
  onClose: () => void
  onCreated: () => void
  workspaceId: string
  parentFolderId?: string | null
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      await foldersApi.create(workspaceId, name.trim(), parentFolderId)
      toast.success(t('folder.created'))
      setName('')
      onCreated()
    } catch {
      toast.error(t('folder.createFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o && !loading) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('folder.new')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={e => void handleSubmit(e)}>
          <div className="px-6 py-4">
            <Label htmlFor="folder-name" className="mb-1.5 block">{t('folder.name')}</Label>
            <Input
              id="folder-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('folder.namePlaceholder')}
              autoFocus
              required
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className={cn(buttonVariants({ variant: 'outline' }))}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={!name.trim() || loading}
              className={cn(buttonVariants())}
            >
              {loading ? t('common.creating') : t('common.create')}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function MoveDocumentDialog({ doc, folders, open, onClose, onMoved }: {
  doc: Document | null
  folders: Folder[]
  open: boolean
  onClose: () => void
  onMoved: (updatedDoc: Document) => void
}) {
  const { t } = useTranslation()
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)

  useEffect(() => {
    if (doc) setSelectedFolderId(doc.folderId)
  }, [doc])

  const handleMove = async () => {
    if (!doc) return
    setMoving(true)
    try {
      const updated = await documentsApi.move(doc.id, selectedFolderId)
      toast.success(t('folder.moved', { name: folders.find(f => f.id === selectedFolderId)?.name ?? t('workspace.root') }))
      onMoved(updated)
    } catch {
      toast.error(t('folder.moveFailed'))
    } finally {
      setMoving(false)
    }
  }

  const unchanged = selectedFolderId === (doc?.folderId ?? null)

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!o && !moving) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('folder.move')}</DialogTitle>
        </DialogHeader>
        <div className="px-6 py-4">
          <FolderPickerButton
            folders={folders}
            value={selectedFolderId}
            onChange={setSelectedFolderId}
            disabled={moving}
          />
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={moving}
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={() => void handleMove()}
            disabled={moving || unchanged}
            className={cn(buttonVariants())}
          >
            {moving ? t('common.loading') : t('folder.move')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function WorkspacePage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [moveDoc, setMoveDoc] = useState<Document | null>(null)
  const [createKind, setCreateKind] = useState<'word' | 'excel' | 'powerpoint' | null>(null)
  const [newFileName, setNewFileName] = useState('')
  const [creatingFile, setCreatingFile] = useState(false)

  const activeFolderId = searchParams.get('folder') ?? null
  const activeFolder = activeFolderId ? (folders.find(f => f.id === activeFolderId) ?? null) : null

  const openFolder = (folder: Folder) => {
    setSearch('')
    setSearchParams({ folder: folder.id }, { replace: false })
  }
  const closeFolder = () => {
    setSearch('')
    setSearchParams({}, { replace: false })
  }

  const fetchData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const [ws, docs, folderList] = await Promise.all([
        workspacesApi.get(id),
        workspacesApi.listDocuments(id),
        foldersApi.list(id),
      ])
      setWorkspace(ws)
      setDocuments(docs)
      setFolders(folderList)
    } catch {
      toast.error(t('workspace.loadFailed'))
      navigate('/')
    } finally {
      setLoading(false)
    }
  }, [id, navigate, t])

  useEffect(() => {
    setSearch('')
    void fetchData()
  }, [id, fetchData])

  useEffect(() => {
    if (!id || !token) return
    const baseUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
    const connection = new HubConnectionBuilder()
      .withUrl(`${baseUrl}/hubs/chat`, { accessTokenFactory: () => token })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build()

    const upsertDocument = (document: Document) => {
      if (document.workspaceId !== id) return
      setDocuments(current => [document, ...current.filter(item => item.id !== document.id)])
    }
    connection.on('document.created', upsertDocument)
    connection.on('document.renamed', upsertDocument)
    connection.on('document.deleted', (event: { workspaceId: string; documentId: string }) => {
      if (event.workspaceId === id)
        setDocuments(current => current.filter(document => document.id !== event.documentId))
    })
    connection.onreconnected(async () => {
      await connection.invoke('JoinWorkspace', id)
      await fetchData()
    })

    const connect = async () => {
      try {
        await connection.start()
        await connection.invoke('JoinWorkspace', id)
      } catch {
        // REST loading and manual refresh remain available if realtime connectivity is unavailable.
      }
    }
    void connect()

    return () => {
      if (connection.state !== HubConnectionState.Disconnected) void connection.stop()
    }
  }, [id, token, fetchData])

  const handleUploaded = (doc: Document) => {
    toast.success(t('document.uploaded', { name: doc.fileName }))
    setShowUpload(false)
    setDocuments(prev => [doc, ...prev])
  }

  const handleDelete = async (docId: string) => {
    const doc = documents.find(d => d.id === docId)
    if (!confirm(t('document.deleteConfirm', { name: doc?.fileName }))) return
    try {
      await documentsApi.delete(docId)
      setDocuments(prev => prev.filter(d => d.id !== docId))
      toast.success(t('common.deleted'))
    } catch {
      toast.error(t('workspace.deleteFailed'))
    }
  }

  const handleDeleteFolder = async (folder: Folder) => {
    if (!confirm(t('folder.deleteConfirm', { name: folder.name }))) return
    try {
      await foldersApi.delete(id!, folder.id)
      const getAllDescendantIds = (folderId: string, all: Folder[]): string[] => {
        const children = all.filter(f => f.parentFolderId === folderId)
        return [folderId, ...children.flatMap(c => getAllDescendantIds(c.id, all))]
      }
      const deletedIds = new Set(getAllDescendantIds(folder.id, folders))
      setFolders(prev => prev.filter(f => !deletedIds.has(f.id)))
      setDocuments(prev => prev.map(d => deletedIds.has(d.folderId ?? '') ? { ...d, folderId: null } : d))
      if (activeFolder && deletedIds.has(activeFolder.id)) closeFolder()
      toast.success(t('folder.deleted'))
    } catch {
      toast.error(t('folder.deleteFailed'))
    }
  }

  const handleRenameDocument = (renamed: Document) => {
    setDocuments(prev => prev.map(d => d.id === renamed.id ? renamed : d))
    toast.success(t('common.renamed'))
  }

  const handleRenameFolder = async (folder: Folder, name: string) => {
    try {
      await foldersApi.rename(id!, folder.id, name)
      setFolders(prev => prev.map(f => f.id === folder.id ? { ...f, name } : f))
      toast.success(t('folder.renamed'))
    } catch {
      toast.error(t('document.renameFailed'))
      throw new Error('rename failed')
    }
  }

  const handleFolderCreated = async () => {
    setShowCreateFolder(false)
    if (!id) return
    setFolders(await foldersApi.list(id))
  }

  const openCreateDocument = (kind: 'word' | 'excel' | 'powerpoint') => {
    const defaults = { word: t('drive.untitledWord'), excel: t('drive.untitledExcel'), powerpoint: t('drive.untitledPowerpoint') }
    setNewFileName(defaults[kind])
    setCreateKind(kind)
  }

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id || !createKind || !newFileName.trim()) return
    setCreatingFile(true)
    try {
      const doc = await workspacesApi.createDocument(id, createKind, newFileName.trim(), activeFolder?.id)
      setDocuments(prev => [doc, ...prev])
      setCreateKind(null)
      toast.success(t('document.created', { name: doc.fileName }))
      navigate(`/editor/${doc.id}?back=${encodeURIComponent(location.pathname + location.search)}`)
    } catch {
      toast.error(t('document.createFailed'))
    } finally {
      setCreatingFile(false)
    }
  }

  const currentFolderId = activeFolder?.id ?? null
  const filteredFolders = folders
    .filter(f => (f.parentFolderId ?? null) === currentFolderId)
    .filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
  const filteredDocuments = documents
    .filter(d => d.folderId === currentFolderId)
    .filter(d => d.fileName.toLowerCase().includes(search.toLowerCase()))
  const isEmpty = filteredFolders.length === 0 && filteredDocuments.length === 0

  const folderBreadcrumb = (() => {
    if (!activeFolder) return []
    const path: Folder[] = []
    let current: Folder | undefined = activeFolder
    while (current) {
      path.unshift(current)
      current = current.parentFolderId ? folders.find(f => f.id === current!.parentFolderId) : undefined
    }
    return path
  })()

  const uploadFn = activeFolder && id
    ? (file: File, onProgress: (pct: number) => void) =>
        foldersApi.uploadDocument(id, activeFolder.id, file, onProgress)
    : id
      ? (file: File, onProgress: (pct: number) => void) =>
          workspacesApi.uploadDocument(id, file, onProgress)
      : undefined

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!workspace) return null

  return (
    <div className="flex flex-col h-full">
      {/* Top toolbar */}
      <div className="flex-shrink-0 border-b bg-background px-6 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold truncate">{workspace.name}</h1>
          {workspace.description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{workspace.description}</p>
          )}
        </div>

        <div className="relative hidden sm:block w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder={t('common.search')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-8"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => void fetchData()}
            title={t('common.refresh')}
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'h-8 w-8')}
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
          <button
            onClick={() => setShowCreateFolder(true)}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            <FolderPlus className="w-4 h-4" />
            <span className="hidden md:inline">{t('folder.new')}</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(buttonVariants({ size: 'sm' }))}>
                <Plus className="w-4 h-4" />
                {t('drive.new')}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => openCreateDocument('word')}>
                <FileText className="w-4 h-4 mr-2 text-blue-600" />
                {t('drive.word')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openCreateDocument('excel')}>
                <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-600" />
                {t('drive.excel')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openCreateDocument('powerpoint')}>
                <Presentation className="w-4 h-4 mr-2 text-orange-600" />
                {t('drive.powerpoint')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowUpload(true)}>
                <Upload className="w-4 h-4 mr-2" />
                {t('drive.uploadFile')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Mobile search */}
      <div className="sm:hidden flex-shrink-0 px-6 py-2 bg-background border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder={t('common.search')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {activeFolder && (
          <div className="flex items-center gap-1.5 text-sm mb-4 flex-wrap">
            <button
              onClick={closeFolder}
              className="text-primary hover:underline underline-offset-4 font-medium transition-colors"
            >
              {workspace.name}
            </button>
            {folderBreadcrumb.map((f, i) => (
              <span key={f.id} className="flex items-center gap-1.5">
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                {i < folderBreadcrumb.length - 1 ? (
                  <button
                    onClick={() => openFolder(f)}
                    className="text-primary hover:underline underline-offset-4 font-medium transition-colors"
                  >
                    {f.name}
                  </button>
                ) : (
                  <span className="font-medium">{f.name}</span>
                )}
              </span>
            ))}
          </div>
        )}

        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold">
              {search ? t('drive.noMatches') : activeFolder ? t('drive.folderEmpty') : t('drive.empty')}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {search ? t('drive.searchHint') : t('drive.emptyHint')}
            </p>
            {!search && (
              <button
                onClick={() => setShowUpload(true)}
                className={cn(buttonVariants({ size: 'sm' }), 'mt-5')}
              >
                <Plus className="w-4 h-4" />
                {t('document.upload')}
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredFolders.map(folder => (
              <FolderCard
                key={folder.id}
                folder={folder}
                onOpen={() => openFolder(folder)}
                onDelete={() => void handleDeleteFolder(folder)}
                onRename={name => handleRenameFolder(folder, name)}
              />
            ))}
            {filteredDocuments.map(doc => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                onDelete={handleDelete}
                onEdit={docId => navigate(`/editor/${docId}?back=${encodeURIComponent(location.pathname + location.search)}`)}
                onPreview={docId => navigate(`/pdf/${docId}?back=${encodeURIComponent(location.pathname + location.search)}`)}
                onMove={setMoveDoc}
                onRename={handleRenameDocument}
                folders={folders}
                currentFolderId={activeFolder?.id ?? null}
                onClone={cloned => {
                  setDocuments(prev => {
                    const idx = prev.findIndex(d => d.id === doc.id)
                    const next = [...prev]
                    next.splice(idx + 1, 0, cloned)
                    return next
                  })
                  toast.success(t('document.cloned', { name: cloned.fileName }))
                }}
              />
            ))}
          </div>
        )}
      </div>

      {showCreateFolder && id && (
        <CreateFolderDialog
          open={showCreateFolder}
          workspaceId={id}
          parentFolderId={activeFolder?.id}
          onClose={() => setShowCreateFolder(false)}
          onCreated={() => void handleFolderCreated()}
        />
      )}

      {showUpload && uploadFn && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={handleUploaded}
          uploadFn={uploadFn}
        />
      )}

      <Dialog open={createKind !== null} onOpenChange={open => { if (!open && !creatingFile) setCreateKind(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {t('drive.new')} {createKind === 'word' ? t('drive.word') : createKind === 'excel' ? t('drive.excel') : t('drive.powerpoint')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={e => void handleCreateDocument(e)}>
            <div className="px-6 py-4">
              <Label htmlFor="new-file-name" className="mb-1.5 block">{t('document.fileName')}</Label>
              <Input
                id="new-file-name"
                value={newFileName}
                onChange={e => setNewFileName(e.target.value)}
                autoFocus
                required
              />
              <p className="text-xs text-muted-foreground mt-2">{t('document.extensionHint')}</p>
            </div>
            <DialogFooter>
              <button type="button" onClick={() => setCreateKind(null)} disabled={creatingFile} className={cn(buttonVariants({ variant: 'outline' }))}>
                {t('common.cancel')}
              </button>
              <button type="submit" disabled={creatingFile || !newFileName.trim()} className={cn(buttonVariants())}>
                {creatingFile ? t('common.creating') : t('drive.createAndEdit')}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <MoveDocumentDialog
        doc={moveDoc}
        folders={folders}
        open={moveDoc !== null}
        onClose={() => setMoveDoc(null)}
        onMoved={updated => {
          setDocuments(prev => prev.map(d => d.id === updated.id ? updated : d))
          setMoveDoc(null)
        }}
      />
    </div>
  )
}
