import { api } from './index'
import type { Workspace, Document } from '../types'

export const workspacesApi = {
  list: () => api.get<Workspace[]>('/api/workspaces').then(r => r.data),

  get: (id: string) => api.get<Workspace>(`/api/workspaces/${id}`).then(r => r.data),

  create: (name: string, description?: string) =>
    api.post<Workspace>('/api/workspaces', { name, description }).then(r => r.data),

  rename: (id: string, name: string) =>
    api.patch<Workspace>(`/api/workspaces/${id}`, { name }).then(r => r.data),

  delete: (id: string) => api.delete(`/api/workspaces/${id}`),

  listDocuments: (id: string) =>
    api.get<Document[]>(`/api/workspaces/${id}/documents`).then(r => r.data),

  uploadDocument: (id: string, file: File, onProgress?: (pct: number) => void) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<Document>(`/api/workspaces/${id}/documents`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: e => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
      },
    }).then(r => r.data)
  },

  createDocument: (id: string, kind: 'word' | 'excel' | 'powerpoint', fileName: string, folderId?: string | null) =>
    api.post<Document>(`/api/workspaces/${id}/documents/create`, {
      kind, fileName, folderId: folderId ?? null,
    }).then(r => r.data),

  addMember: (id: string, usernameOrEmail: string) =>
    api.post(`/api/workspaces/${id}/members`, { usernameOrEmail }),

  removeMember: (id: string, userId: string) =>
    api.delete(`/api/workspaces/${id}/members/${userId}`),
}
