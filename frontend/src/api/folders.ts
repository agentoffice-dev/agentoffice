import { api } from './index'
import type { Folder, Document } from '../types'

export const foldersApi = {
  list: (workspaceId: string) =>
    api.get<Folder[]>(`/api/workspaces/${workspaceId}/folders`).then(r => r.data),

  create: (workspaceId: string, name: string, parentFolderId?: string | null) =>
    api.post<Folder>(`/api/workspaces/${workspaceId}/folders`, { name, parentFolderId: parentFolderId ?? null }).then(r => r.data),

  rename: (workspaceId: string, folderId: string, name: string) =>
    api.put<Folder>(`/api/workspaces/${workspaceId}/folders/${folderId}`, { name }).then(r => r.data),

  delete: (workspaceId: string, folderId: string) =>
    api.delete(`/api/workspaces/${workspaceId}/folders/${folderId}`),

  listDocuments: (workspaceId: string, folderId: string) =>
    api.get<Document[]>(`/api/workspaces/${workspaceId}/folders/${folderId}/documents`).then(r => r.data),

  uploadDocument: (workspaceId: string, folderId: string, file: File, onProgress?: (pct: number) => void) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<Document>(`/api/workspaces/${workspaceId}/folders/${folderId}/documents`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: e => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
      },
    }).then(r => r.data)
  },
}
