import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'

export type TeacherStatus = 'active' | 'on_leave' | 'inactive'

export interface Teacher {
  id: number
  full_name: string
  email: string
  phone: string
  status: TeacherStatus
  max_periods_per_week: number
  subject_ids: number[]
  grade_levels: string[]
}

export interface TeacherFilters {
  status?: TeacherStatus
  search?: string
}

export interface TeacherInput {
  full_name: string
  email: string
  phone: string
  subject_ids: number[]
  grade_levels: string[]
  max_periods_per_week: number
}

export function useTeachers(
  filters: TeacherFilters = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ['teachers', filters],
    queryFn: async () => {
      const { data } = await apiClient.get<Teacher[]>('/teachers', {
        params: filters,
      })
      return data
    },
    enabled: options.enabled,
  })
}

export function useCreateTeacher() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: TeacherInput) => {
      const { data } = await apiClient.post<Teacher>('/teachers', input)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] })
    },
  })
}

export function useUpdateTeacher() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: Partial<TeacherInput> & { id: number; status?: TeacherStatus }) => {
      const { data } = await apiClient.patch<Teacher>(`/teachers/${id}`, input)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] })
    },
  })
}

export function useDeleteTeacher() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/teachers/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] })
    },
  })
}
