import { useState, useCallback } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { translateApiMessage } from '@/lib/apiErrors'
import { AlertCircle, Upload, File, X } from 'lucide-react'
import type { Document } from '@/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

interface Props {
  onClose: () => void
  onUploaded: (doc: Document) => void
  uploadFn: (file: File, onProgress: (pct: number) => void) => Promise<Document>
}

// Extensions are listed alongside the MIME types on purpose: Windows only
// reports a MIME type for an extension that some installed application has
// registered, so a MIME-only filter hides .docx/.odt in the file picker on
// machines without Office or LibreOffice.
const ACCEPTED = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp', '.txt',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  'text/plain',
].join(',')

/** Must stay in step with nginx client_max_body_size and the API RequestSizeLimit. */
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function describeUploadError(error: unknown, t: TFunction): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return t('upload.unreachable')
    const status = error.response.status
    // nginx rejects an oversized body itself, so the response is HTML, not our JSON error.
    if (status === 413) return t('upload.limit', { limit: formatSize(MAX_UPLOAD_BYTES) })
    if (status === 401) return t('upload.expired')
    if (status === 403) return t('upload.forbidden')
    if (status === 404) return t('upload.missing')
    const data: unknown = error.response.data
    if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') return translateApiMessage(data.error, t)
    return t('upload.http', { status })
  }
  return error instanceof Error ? error.message : t('upload.failed')
}

export default function UploadModal({ onClose, onUploaded, uploadFn }: Props) {
  const { t } = useTranslation()
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string>()

  const handleFile = (f: File) => {
    setError(undefined)
    setFile(f)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [])

  const handleSubmit = async () => {
    if (!file) return
    if (file.size === 0) {
      setError(t('upload.empty'))
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(t('upload.tooLarge', { size: formatSize(file.size), limit: formatSize(MAX_UPLOAD_BYTES) }))
      return
    }

    setUploading(true)
    setProgress(0)
    setError(undefined)
    try {
      const doc = await uploadFn(file, pct => setProgress(pct))
      onUploaded(doc)
    } catch (uploadError) {
      // Without this the dialog silently returned to idle and the upload looked ignored.
      const message = describeUploadError(uploadError, t)
      setError(message)
      toast.error(message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !uploading) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('document.upload')}</DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4 space-y-4">
          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => document.getElementById('upload-file-input')?.click()}
            className={cn(
              'border-2 border-dashed rounded-lg p-8 flex flex-col items-center gap-3 cursor-pointer transition-colors',
              dragOver
                ? 'border-primary bg-accent'
                : 'border-border hover:border-primary/50 hover:bg-accent/50',
            )}
          >
            <div className={cn('w-12 h-12 rounded-full flex items-center justify-center', dragOver ? 'bg-primary/20' : 'bg-muted')}>
              <Upload className={cn('w-5 h-5', dragOver ? 'text-primary' : 'text-muted-foreground')} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">{t('document.drop')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('document.formats')}</p>
            </div>
            <input
              id="upload-file-input"
              type="file"
              accept={ACCEPTED}
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
          </div>

          {file && (
            <div className="flex items-center gap-3 bg-accent rounded-lg px-4 py-3">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <File className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
              </div>
              {!uploading && (
                <button
                  onClick={() => setFile(null)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 flex-1">{error}</span>
            </div>
          )}

          {uploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{t('common.uploading')}</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={uploading}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={!file || uploading}>
            {uploading ? t('common.uploading') : t('common.upload')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
