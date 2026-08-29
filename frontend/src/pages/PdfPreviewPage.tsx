import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { documentsApi } from '../api/documents'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'

export default function PdfPreviewPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const backUrl = searchParams.get('back') ?? '/'

  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let url: string | null = null

    const load = async () => {
      try {
        const [doc, blob] = await Promise.all([
          documentsApi.get(id),
          documentsApi.getBlob(id),
        ])
        setFileName(doc.fileName)
        url = URL.createObjectURL(blob)
        setBlobUrl(url)
      } catch {
        setError(t('document.loadFailed'))
      } finally {
        setLoading(false)
      }
    }

    void load()
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [id, t])

  return (
    <div className="fixed inset-0 flex flex-col bg-muted">
      <div className="flex items-center gap-3 px-4 h-12 bg-background border-b flex-shrink-0">
        <button
          onClick={() => navigate(backUrl)}
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-7 gap-1.5 text-sm')}
        >
          <ArrowLeft className="w-4 h-4" />
          {t('nav.back')}
        </button>
        <span className="text-border">|</span>
        <span className="text-sm font-medium truncate max-w-xs">{fileName}</span>
      </div>

      <div className="flex-1 overflow-hidden">
        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm">{t('document.loadPdf')}</p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <p className="text-destructive font-medium">{t('document.loadFailed')}</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <button
              onClick={() => navigate(backUrl)}
              className={cn(buttonVariants({ size: 'sm' }))}
            >
              {t('nav.back')}
            </button>
          </div>
        )}

        {blobUrl && (
          <iframe
            src={blobUrl}
            className="w-full h-full border-0"
            title={fileName}
          />
        )}
      </div>
    </div>
  )
}
