import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'
import type { ExamStatus, ExamType, OverallResult, ResultStatus, Term } from '@/lib/grading'

// الأرقام العشرية تصل من الخادم كنصوص ("50.00") للحفاظ على الدقة.
export interface Exam {
  id: string
  title: string
  exam_type: ExamType
  term: Term
  academic_year: string
  exam_date: string
  max_score: string
  weight_percent: string
  status: ExamStatus
  subject_id: number
  classroom_id: number
  classroom_name: string | null
  subject_name: string | null
  students_count: number
  graded_count: number
}

export interface GradebookRow {
  student_id: number
  student_name: string
  result_id: string | null
  status: ResultStatus | null
  score: string | null
  teacher_note: string | null
  internal_note: string | null
}

export interface ExamDetail extends Exam {
  rows: GradebookRow[]
}

export interface ExamAssignment {
  classroom_id: number
  classroom_name: string
  grade_level: string
  academic_year: string
  subject_id: number
  subject_name: string
}

export interface ExamFilters {
  class_id?: number
  subject_id?: number
  status?: ExamStatus
  term?: Term
  academic_year?: string
}

export interface ExamInput {
  title: string
  exam_type: ExamType
  term: Term
  academic_year: string
  exam_date: string
  max_score: string
  weight_percent: string
  subject_id: number
  classroom_id: number
}

export interface ResultInput {
  student_id: number
  status: ResultStatus
  score: string | null
  teacher_note: string | null
  internal_note: string | null
}

export interface ReportCardEntry {
  subject_id: number
  subject_name: string | null
  weighted_percentage: string
  notes: string[]
}

export interface ReportCard {
  id: string
  student_name: string | null
  classroom_name: string | null
  term: Term
  academic_year: string
  overall_percentage: string | null
  overall_result: OverallResult
  published_at: string | null
  entries: ReportCardEntry[]
  // يوجد في مسار الطاقم فقط:
  status?: 'draft' | 'published'
}

export interface ReportCardQuery {
  studentId: number | null
  term: Term
  academicYear: string
}

export function useExams(filters: ExamFilters = {}, enabled = true) {
  return useQuery({
    queryKey: ['exams', filters],
    queryFn: async () => {
      const { data } = await apiClient.get<Exam[]>('/exams', { params: filters })
      return data
    },
    enabled,
  })
}

export function useExam(id: string | null) {
  return useQuery({
    queryKey: ['exam', id],
    queryFn: async () => {
      const { data } = await apiClient.get<ExamDetail>(`/exams/${id}`)
      return data
    },
    enabled: Boolean(id),
  })
}

export function useExamAssignments(enabled = true) {
  return useQuery({
    queryKey: ['exam-assignments'],
    queryFn: async () => {
      const { data } = await apiClient.get<ExamAssignment[]>('/exams/assignments')
      return data
    },
    enabled,
  })
}

export function useCreateExam() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ExamInput) => {
      const { data } = await apiClient.post<Exam>('/exams', input)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exams'] }),
  })
}

export function useChangeExamStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ExamStatus }) => {
      const { data } = await apiClient.patch<Exam>(`/exams/${id}/status`, { status })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams'] })
      queryClient.invalidateQueries({ queryKey: ['exam'] })
    },
  })
}

export function useSaveResults(examId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (results: ResultInput[]) => {
      await apiClient.post(`/exams/${examId}/results/bulk`, { results })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exam', examId] })
      queryClient.invalidateQueries({ queryKey: ['exams'] })
      queryClient.invalidateQueries({ queryKey: ['report-card'] })
    },
  })
}

export function useReportCard({ studentId, term, academicYear }: ReportCardQuery, guardian: boolean) {
  return useQuery({
    queryKey: ['report-card', guardian ? 'guardian' : 'staff', studentId, term, academicYear],
    queryFn: async () => {
      const base = guardian ? '/guardian/students' : '/students'
      const { data } = await apiClient.get<ReportCard>(`${base}/${studentId}/report-card`, {
        params: { term, academic_year: academicYear },
      })
      return data
    },
    enabled: studentId !== null,
    retry: false,
  })
}

export function usePublishReportCard() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ studentId, term, academicYear }: ReportCardQuery) => {
      const { data } = await apiClient.post<ReportCard>(
        `/students/${studentId}/report-card/publish`,
        null,
        { params: { term, academic_year: academicYear } },
      )
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['report-card'] }),
  })
}
