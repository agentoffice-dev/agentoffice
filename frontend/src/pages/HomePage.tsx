import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Folder } from 'lucide-react'
import { useWorkspaces } from '../contexts/WorkspaceContext'
import { useTranslation } from 'react-i18next'

export default function HomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { workspaces, loading } = useWorkspaces()

  useEffect(() => {
    if (!loading && workspaces.length > 0) {
      navigate(`/workspaces/${workspaces[0].id}`, { replace: true })
    }
  }, [loading, workspaces, navigate])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
      <div className="p-5 bg-muted rounded-full mb-4">
        <Folder className="w-12 h-12 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold">{t('workspace.empty')}</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-xs">
        {t('workspace.emptyHint')}
      </p>
    </div>
  )
}
