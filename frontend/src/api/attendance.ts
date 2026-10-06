import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'left_early'

export interface AttendanceRecord {
  id: number
  student_id: number
  attendance_date: string
  status: AttendanceStatus
  note: string | null
  recorded_by_user_id: number | null
}

export interface AttendanceFilters {
  student_id?: number
  date_from?: string
  date_to?: string
}

export function useAttendance(filters: AttendanceFilters = {}) {
  return useQuery({
    queryKey: ['attendance', filters],
    queryFn: async () => {
      const { data } = await apiClient.get<AttendanceRecord[]>('/attendance', {
        params: filters,
      })
      return data
    },
  })
}

export function useUpsertAttendance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      student_id: number
      attendance_date: string
      status: AttendanceStatus
      note?: string
    }) => {
      const { data } = await apiClient.post<AttendanceRecord>('/attendance', input)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
    },
  })
}
