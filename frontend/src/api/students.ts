import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'

export type StudentStatus = 'active' | 'listener' | 'suspended' | 'transferred'

export interface Student {
  id: number
  full_name: string
  national_id: string
  birth_date: string
  grade_level: string
  address: string | null
  guardian_name: string
  guardian_phone: string
  status: StudentStatus
  classroom_id: number | null
  guardian_user_id: number | null
  created_at: string
  class_name: string | null
}

export interface StudentListResponse {
  items: Student[]
  total: number
}

export interface StudentFilters {
  grade_level?: string
  classroom_id?: number
  status?: StudentStatus
  search?: string
  page?: number
  page_size?: number
}

export interface StudentInput {
  full_name: string
  national_id: string
  birth_date: string
  grade_level: string
  address: string | null
  guardian_name: string
  guardian_phone: string
  classroom_id: number | null
  guardian_user_id: number | null
}

export function useStudents(filters: StudentFilters = {}) {
  return useQuery({
    queryKey: ['students', filters],
    queryFn: async () => {
      const { data } = await apiClient.get<StudentListResponse>('/students', {
        params: filters,
      })
      return data
    },
  })
}

export function useCreateStudent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: StudentInput) => {
      const { data } = await apiClient.post<Student>('/students', input)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] })
    },
  })
}

export function useUpdateStudent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: Partial<StudentInput> & { id: number; status?: StudentStatus }) => {
      const { data } = await apiClient.patch<Student>(`/students/${id}`, input)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] })
    },
  })
}

export function useDeleteStudent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/students/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] })
    },
  })
}

export function useBulkMoveStudents() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      student_ids: number[]
      classroom_id?: number | null
      grade_level?: string | null
    }) => {
      const { data } = await apiClient.post<{ updated: number }>(
        '/students/bulk-move',
        payload,
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] })
    },
  })
}

export function useImportStudents() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await apiClient.post<{ created: number; errors: string[] }>(
        '/students/import',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] })
    },
  })
}

export function exportStudentsUrl(filters: StudentFilters = {}): string {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && key !== 'page' && key !== 'page_size') {
      params.set(key, String(value))
    }
  })
  const query = params.toString()
  return `/students/export${query ? `?${query}` : ''}`
}
