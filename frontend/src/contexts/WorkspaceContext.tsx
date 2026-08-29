import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { workspacesApi } from '../api/workspaces'
import type { Workspace } from '../types'

interface WorkspaceContextValue {
  workspaces: Workspace[]
  loading: boolean
  reload: () => Promise<void>
  addWorkspace: (w: Workspace) => void
  removeWorkspace: (id: string) => void
  renameWorkspace: (id: string, name: string) => void
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const data = await workspacesApi.list()
      setWorkspaces(data)
    } catch {
      toast.error(t('error.loadWorkspaces'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { void reload() }, [reload])

  return (
    <WorkspaceContext.Provider value={{
      workspaces,
      loading,
      reload,
      addWorkspace: (w) => setWorkspaces(prev => [w, ...prev]),
      removeWorkspace: (id) => setWorkspaces(prev => prev.filter(w => w.id !== id)),
      renameWorkspace: (id, name) => setWorkspaces(prev => prev.map(w => w.id === id ? { ...w, name } : w)),
    }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspaces() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspaces must be used within WorkspaceProvider')
  return ctx
}
