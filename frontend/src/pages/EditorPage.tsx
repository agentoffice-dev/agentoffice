import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { HardDrive, Loader2 } from 'lucide-react'
import { documentsApi } from '../api/documents'
import WopiEditor, { type WopiEditorProps } from '../components/editors/WopiEditor'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import ChatDock from '@/components/chat/ChatDock'
import { useTranslation } from 'react-i18next'

function buildActionUrl(rawUrl: string, wopiSrc: string): string {
  const encodedSrc = encodeURIComponent(wopiSrc)
  if (rawUrl.includes('{WOPISrc}')) {
    return rawUrl.replace('{WOPISrc}', encodedSrc)
  }
  const sep = rawUrl.includes('?') ? '&' : '?'
  return `${rawUrl}${sep}WOPISrc=${encodedSrc}`
}

export default function EditorPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [wopiProps, setWopiProps] = useState<WopiEditorProps | null>(null)
  const [workspaceId, setWorkspaceId] = useState<string>()

  useEffect(() => {
    if (!id) return

    const init = async () => {
      setLoading(true)
      setError(null)
      try {
        const [tokenInfo, doc] = await Promise.all([
          documentsApi.getWopiToken(id),
          documentsApi.get(id),
        ])

        const ext = doc.fileName.split('.').pop() ?? 'docx'
        setWorkspaceId(doc.workspaceId ?? undefined)
        const { url: rawUrl } = await documentsApi.getWopiActionUrl(ext)
        const actionUrl = buildActionUrl(rawUrl, tokenInfo.wopi_src)

        console.debug('[WOPI] rawUrl:', rawUrl)
        console.debug('[WOPI] wopi_src:', tokenInfo.wopi_src)
        console.debug('[WOPI] actionUrl:', actionUrl)

        setWopiProps({
          actionUrl,
          accessToken: tokenInfo.access_token,
          accessTokenTtl: tokenInfo.access_token_ttl,
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : t('document.loadFailed')
        setError(msg)
        toast.error(msg)
      } finally {
        setLoading(false)
      }
    }

    void init()
  }, [id, t])

  const backUrl =
    searchParams.get('back') ?? (workspaceId ? `/workspaces/${workspaceId}` : '/')

  return (
    <div className="fixed inset-0 flex bg-muted">
      {/* Left rail */}
      <div className="flex w-12 flex-shrink-0 flex-col items-center gap-1 border-r bg-background py-2">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to={backUrl}
                aria-label={t('nav.backDrive')}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <HardDrive className="h-5 w-5" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{t('nav.drive')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
      {loading && (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm">{t('document.loadEditor')}</p>
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <p className="text-destructive font-medium">{t('document.loadFailed')}</p>
          <p className="text-sm text-muted-foreground max-w-sm text-center">{error}</p>
          <Link to={backUrl} className={cn(buttonVariants({ size: 'sm' }))}>
            {t('nav.backDrive')}
          </Link>
        </div>
      )}

      {!loading && !error && wopiProps && (
        <WopiEditor {...wopiProps} />
      )}
      </div>
      <ChatDock workspaceId={workspaceId} documentId={id} />
    </div>
  )
}
