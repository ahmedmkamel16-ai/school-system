import { useQuery } from '@tanstack/react-query'
import { apiClient } from './client'

export interface DailyAttendancePoint {
  date: string
  label: string
  rate: number
  present_count: number
  total_count: number
}

export interface CoverageSlot {
  day: string
  period_number: number
  classroom_name: string
  subject_name: string
}

export interface TeacherAbsenceInfo {
  teacher_id: number
  teacher_name: string
  status: string
  periods_needing_coverage: CoverageSlot[]
}

export interface ScheduleHealth {
  classrooms_with_incomplete_schedule: number
  teachers_without_grade_scope: number
  subjects_without_teacher: number
}

export interface RecentActivityItem {
  actor_name: string
  description: string
  created_at: string
}

export interface DashboardSummary {
  total_students: number
  total_teachers: number
  total_classrooms: number
  today_attendance_rate: number
  today_present_count: number
  today_total_students: number
  new_students_this_month: number
  weekly_attendance: DailyAttendancePoint[]
  teachers_absent_today: TeacherAbsenceInfo[]
  schedule_health: ScheduleHealth
  recent_activity: RecentActivityItem[]
}

export function useDashboardSummary(enabled = true) {
  return useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: async () => {
      const { data } = await apiClient.get<DashboardSummary>('/dashboard/summary')
      return data
    },
    enabled,
  })
}
