import { api } from './index'
import type { AgentTask } from './agentTasks'

export type ScheduleUnit = 'minutes' | 'hours' | 'days' | 'weeks'
export interface AgentSchedule {
  id: string; workspaceId: string; createdById: string; name: string; prompt: string
  agentId?: string | null; agentName?: string | null; documentId?: string | null; documentName?: string | null
  interval: number; unit: ScheduleUnit; enabled: boolean; nextRunAt: string
  lastRunAt?: string | null; lastTaskId?: string | null; createdAt: string; updatedAt: string
}
export type AgentScheduleInput = Pick<AgentSchedule, 'name' | 'prompt' | 'agentId' | 'documentId' | 'interval' | 'unit' | 'enabled' | 'nextRunAt'>
const base = (workspaceId: string) => `/api/workspaces/${workspaceId}/agent-schedules`
export const agentSchedulesApi = {
  list: (workspaceId: string) => api.get<AgentSchedule[]>(base(workspaceId)).then(r => r.data),
  create: (workspaceId: string, value: AgentScheduleInput) => api.post<AgentSchedule>(base(workspaceId), value).then(r => r.data),
  update: (workspaceId: string, id: string, value: AgentScheduleInput) => api.put<AgentSchedule>(`${base(workspaceId)}/${id}`, value).then(r => r.data),
  delete: (workspaceId: string, id: string) => api.delete(`${base(workspaceId)}/${id}`),
  run: (workspaceId: string, id: string) => api.post<AgentTask>(`${base(workspaceId)}/${id}/run`).then(r => r.data),
}
