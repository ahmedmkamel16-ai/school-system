import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'
import type { UserRole } from './auth'

export interface UserRecord {
  id: number
  email: string
  full_name: string
  role: UserRole
  is_active: boolean
  can_manage_users: boolean
  teacher_id: number | null
}

export interface UserCreateInput {
  email: string
  full_name: string
  password: string
  role: UserRole
  can_manage_users?: boolean
  teacher_id?: number | null
}

export interface UserUpdateInput {
  full_name?: string
  role?: UserRole
  is_active?: boolean
  can_manage_users?: boolean
  teacher_id?: number | null
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await apiClient.get<UserRecord[]>('/users')
      return data
    },
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UserCreateInput) => {
      const { data } = await apiClient.post<UserRecord>('/auth/register', input)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: UserUpdateInput & { id: number }) => {
      const { data } = await apiClient.patch<UserRecord>(`/users/${id}`, input)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async ({ id, password }: { id: number; password: string }) => {
      const { data } = await apiClient.post<UserRecord>(
        `/users/${id}/reset-password`,
        { password },
      )
      return data
    },
  })
}
