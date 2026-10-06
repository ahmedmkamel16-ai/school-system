import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'

export type TeacherAttendanceStatus = 'present' | 'absent' | 'leave'

export interface TeacherAttendanceRecord {
  teacher_id: number
  teacher_name: string
  attendance_date: string
  status: TeacherAttendanceStatus
  note: string | null
}

export interface TeacherAttendanceInput {
  teacher_id: number
  attendance_date: string
  status: TeacherAttendanceStatus
  note?: string | null
}

export function useTeacherAttendance(attendanceDate: string, enabled = true) {
  return useQuery({
    queryKey: ['teacher-attendance', attendanceDate],
    queryFn: async () => {
      const { data } = await apiClient.get<TeacherAttendanceRecord[]>('/teacher-attendance', {
        params: { date: attendanceDate },
      })
      return data
    },
    enabled,
  })
}

export function useMarkTeacherAttendance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: TeacherAttendanceInput) => {
      const { data } = await apiClient.post<TeacherAttendanceRecord>('/teacher-attendance', input)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teacher-attendance'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
