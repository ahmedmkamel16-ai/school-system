import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'

export interface ClassRoom {
  id: number
  name: string
  grade_level: string
  academic_year: string
  homeroom_teacher_id: number | null
}

export interface ClassRoomFilters {
  grade_level?: string
  search?: string
}

export interface ClassRoomInput {
  name: string
  grade_level: string
  academic_year: string
  homeroom_teacher_id: number | null
}

export function useClassrooms(
  filters: ClassRoomFilters = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ['classrooms', filters],
    queryFn: async () => {
      const { data } = await apiClient.get<ClassRoom[]>('/classes', {
        params: filters,
      })
      return data
    },
    enabled: options.enabled,
  })
}

export function useCreateClassroom() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ClassRoomInput) => {
      const { data } = await apiClient.post<ClassRoom>('/classes', input)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classrooms'] })
    },
  })
}

export function useUpdateClassroom() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: Partial<ClassRoomInput> & { id: number }) => {
      const { data } = await apiClient.patch<ClassRoom>(`/classes/${id}`, input)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classrooms'] })
    },
  })
}

export function useDeleteClassroom() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/classes/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classrooms'] })
    },
  })
}
