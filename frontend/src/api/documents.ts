import { api } from './index'
import type { Document, WopiTokenInfo } from '../types'

export const documentsApi = {
  list: () => api.get<Document[]>('/api/documents').then(r => r.data),

  get: (id: string) => api.get<Document>(`/api/documents/${id}`).then(r => r.data),

  upload: (file: File, onProgress?: (pct: number) => void) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<Document>('/api/documents', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: e => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
      },
    }).then(r => r.data)
  },

  delete: (id: string) => api.delete(`/api/documents/${id}`),

  move: (id: string, folderId: string | null) =>
    api.patch<Document>(`/api/documents/${id}/move`, { folderId }).then(r => r.data),

  downloadUrl: (id: string) => `${import.meta.env.VITE_API_URL ?? ''}/api/documents/${id}/download`,

  getBlob: (id: string) =>
    api.get(`/api/documents/${id}/download`, { responseType: 'blob' })
      .then(r => r.data as Blob),

  getWopiToken: (id: string) =>
    api.get<WopiTokenInfo>(`/api/documents/${id}/wopi-token`).then(r => r.data),

  getWopiActionUrl: (ext: string) =>
    api.get<{ url: string }>('/api/editors/action', { params: { ext } }).then(r => r.data),

  clone: (id: string, fileName?: string, folderId?: string | null) =>
    api.post<Document>(`/api/documents/${id}/clone`, { fileName: fileName ?? null, folderId: folderId ?? null }).then(r => r.data),

  rename: (id: string, fileName: string) =>
    api.patch<Document>(`/api/documents/${id}/rename`, { fileName }).then(r => r.data),
}
