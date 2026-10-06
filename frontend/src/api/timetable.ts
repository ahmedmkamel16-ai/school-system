import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'

export type Weekday = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday'

export interface TimetableSlot {
  id: number
  classroom_id: number
  day: Weekday
  period_number: number
  subject_id: number
  teacher_id: number
  subject_name: string | null
  teacher_name: string | null
  classroom_name: string | null
}

export interface TimetableSlotInput {
  classroom_id: number
  day: Weekday
  period_number: number
  subject_id: number
  teacher_id: number
  force?: boolean
}

export function useTimetable(
  filters: { classroom_id?: number; teacher_id?: number },
  enabled = true,
) {
  return useQuery({
    queryKey: ['timetable', filters],
    queryFn: async () => {
      const { data } = await apiClient.get<TimetableSlot[]>('/timetable', {
        params: filters,
      })
      return data
    },
    enabled: Boolean(filters.classroom_id || filters.teacher_id) && enabled,
  })
}

export function exportTimetableUrl(): string {
  return '/timetable/export'
}

export function useAllTimetableSlots(enabled: boolean) {
  return useQuery({
    queryKey: ['timetable', 'all'],
    queryFn: async () => {
      const { data } = await apiClient.get<TimetableSlot[]>('/timetable')
      return data
    },
    enabled,
  })
}

export function useUpsertTimetableSlot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: TimetableSlotInput) => {
      const { data } = await apiClient.post<TimetableSlot>('/timetable', input)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timetable'] })
    },
  })
}

export interface TimetableGenerateResult {
  created: number
  warnings: string[]
}

export function useGenerateTimetable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<TimetableGenerateResult>('/timetable/generate')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timetable'] })
    },
  })
}

export function useDeleteTimetableSlot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/timetable/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timetable'] })
    },
  })
}

export function useClearClassroomTimetable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (classroomId: number) => {
      await apiClient.delete('/timetable', { params: { classroom_id: classroomId } })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timetable'] })
    },
  })
}
