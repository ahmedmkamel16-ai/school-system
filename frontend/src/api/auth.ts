import { useQuery } from '@tanstack/react-query'
import { apiClient } from './client'

export type UserRole = 'admin' | 'teacher' | 'accountant' | 'parent'

export interface CurrentUser {
  id: number
  email: string
  full_name: string
  role: UserRole
  is_active: boolean
  can_manage_users: boolean
  teacher_id: number | null
}

export function useCurrentUser(enabled: boolean) {
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const { data } = await apiClient.get<CurrentUser>('/auth/me')
      return data
    },
    enabled,
    retry: false,
  })
}
