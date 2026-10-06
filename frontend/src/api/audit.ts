import { useQuery } from '@tanstack/react-query'
import { apiClient } from './client'

export interface AuditLogEntry {
  id: number
  user_id: number | null
  actor_name: string
  action: string
  entity_type: string
  entity_id: number | null
  description: string
  created_at: string
}

export function useAuditLog(limit = 100) {
  return useQuery({
    queryKey: ['audit-log', limit],
    queryFn: async () => {
      const { data } = await apiClient.get<AuditLogEntry[]>('/audit-log', {
        params: { limit },
      })
      return data
    },
  })
}
