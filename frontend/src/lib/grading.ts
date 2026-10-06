export type ExamType = 'quiz' | 'assignment' | 'oral' | 'practical' | 'midterm' | 'final'
export type Term = 'first' | 'second'
export type ExamStatus = 'draft' | 'published' | 'locked'
export type ResultStatus = 'graded' | 'absent' | 'excused'
export type OverallResult = 'passed' | 'failed' | 'incomplete'

export const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  quiz: 'اختبار قصير',
  assignment: 'واجب / نشاط',
  oral: 'شفهي',
  practical: 'عملي',
  midterm: 'نصفي',
  final: 'نهائي',
}

export const TERM_LABELS: Record<Term, string> = {
  first: 'الفصل الأول',
  second: 'الفصل الثاني',
}

export const EXAM_STATUS_LABELS: Record<ExamStatus, string> = {
  draft: 'مسودة',
  published: 'منشور',
  locked: 'مغلق',
}

export const RESULT_STATUS_LABELS: Record<ResultStatus, string> = {
  graded: 'حاضر',
  absent: 'غائب',
  excused: 'معفى',
}

export const OVERALL_RESULT_LABELS: Record<OverallResult, string> = {
  passed: 'ناجح',
  failed: 'راسب',
  incomplete: 'غير مكتمل',
}

/** سلم التقدير (بالكلمات) وGPA من 4.0 للعرض فقط؛ النجاح والنسب تُحسب في الخادم. عدّل الحدود هنا إن لزم. */
export const GRADE_SCALE = [
  { min: 90, label: 'ممتاز', points: 4 },
  { min: 80, label: 'جيد جدًا', points: 3.5 },
  { min: 70, label: 'جيد', points: 3 },
  { min: 60, label: 'متوسط', points: 2.5 },
  { min: 50, label: 'مقبول', points: 2 },
  { min: 0, label: 'راسب', points: 0 },
] as const

export function gradeFor(percentage: number) {
  return GRADE_SCALE.find((g) => percentage >= g.min) ?? GRADE_SCALE[GRADE_SCALE.length - 1]
}

export function computeGpa(percentages: number[]): number | null {
  if (percentages.length === 0) return null
  const total = percentages.reduce((sum, p) => sum + gradeFor(p).points, 0)
  return total / percentages.length
}

/** العام الدراسي الحالي بصيغة 2025-2026 (يبدأ العام في سبتمبر). */
export function currentAcademicYear(now = new Date()): string {
  const year = now.getFullYear()
  const start = now.getMonth() >= 8 ? year : year - 1
  return `${start}-${start + 1}`
}

export function normalizeAcademicYear(value: string): string {
  return value.trim().replace('/', '-')
}

export function isValidAcademicYear(value: string): boolean {
  const match = /^(\d{4})-(\d{4})$/.exec(normalizeAcademicYear(value))
  return Boolean(match) && Number(match![2]) === Number(match![1]) + 1
}

export function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function formatNumber(value: number, digits = 2): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(digits).replace(/\.?0+$/, '')
}

/** يستخرج رسالة مقروءة من أخطاء FastAPI (نص، كائن {code,message}، قائمة نصوص، أو أخطاء pydantic). */
export function apiErrorMessage(error: unknown, fallback = 'حدث خطأ، حاول مرة أخرى'): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object' && !Array.isArray(detail) && 'message' in detail) {
    return String((detail as { message: unknown }).message)
  }
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0]
    if (typeof first === 'string') {
      return detail.length > 1 ? `${first} (+${detail.length - 1} أخطاء أخرى)` : first
    }
    if (first && typeof first === 'object' && 'msg' in first) return String((first as { msg: unknown }).msg)
  }
  return fallback
}

/** رمز الخطأ المنظَّم إن وُجد (مثل financial_hold). */
export function apiErrorCode(error: unknown): string | null {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (detail && typeof detail === 'object' && !Array.isArray(detail) && 'code' in detail) {
    return String((detail as { code: unknown }).code)
  }
  return null
}
