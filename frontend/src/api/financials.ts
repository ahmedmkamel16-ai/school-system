import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'
import type { Term } from '@/lib/grading'
import type { InstallmentStatus, PaymentMethod, ReceiptKind } from '@/lib/finance'

// المبالغ تصل نصوصًا ("1500.00") للحفاظ على الدقة.
export interface FeeStructure {
  id: string
  name: string
  grade_level: string
  academic_year: string
  term: Term | null
  total_amount: string
  max_discount_percent: string
  is_active: boolean
}

export interface FeeStructureInput {
  name: string
  grade_level: string
  academic_year: string
  term: Term | null
  total_amount: string
  max_discount_percent: string
}

export interface Installment {
  id: string
  installment_no: number
  due_date: string
  amount: string
  paid_amount: string
  remaining: string
  status: InstallmentStatus
  days_overdue: number
}

export interface StudentFee {
  id: string
  fee_structure_id: string
  fee_name: string
  academic_year: string
  term: Term | null
  amount_due: string
  discount_percent: string
  discount_amount: string
  discount_reason: string | null
  net_amount: string
  paid_amount: string
  remaining_amount: string
  installments: Installment[]
}

export interface Receipt {
  id: string
  receipt_number: string
  kind: ReceiptKind
  student_fee_id: string
  student_id: number
  student_name: string | null
  fee_name: string | null
  amount: string
  method: PaymentMethod
  reference: string | null
  paid_at: string
  note: string | null
  reversal_of_id: string | null
  reversal_reason: string | null
  is_reversed: boolean
  collected_by_name: string | null
  created_at: string
  verification_code: string
  allocations: { installment_id: string; installment_no: number | null; amount: string }[]
}

export interface GuardianReceipt {
  receipt_number: string
  kind: ReceiptKind
  amount: string
  method: PaymentMethod
  paid_at: string
  is_reversed: boolean
  fee_name: string | null
}

export interface StatementTotals {
  net_total: string
  paid_total: string
  remaining_total: string
  overdue_amount: string
  overdue_count: number
}

// نسخة الطاقم تحوي student_id والسندات الكاملة؛ نسخة ولي الأمر مقيّدة (hold_message فقط عنده).
export interface Statement {
  student_name: string
  classroom_name: string | null
  fees: StudentFee[]
  receipts: (Receipt | GuardianReceipt)[]
  totals: StatementTotals
  financial_hold: boolean
  hold_message?: string | null
}

export interface Defaulter {
  student_id: number
  student_name: string
  classroom_name: string | null
  guardian_name: string
  guardian_phone: string
  overdue_amount: string
  overdue_installments: number
  oldest_due_date: string
  days_overdue: number
  remaining_total: string
  financial_hold: boolean
}

export interface FinancialSummary {
  as_of: string
  today_collected: string
  today_receipts: number
  month_collected: string
  net_total: string
  paid_total: string
  remaining_total: string
  collection_rate: string
  overdue_amount: string
  overdue_students: number
  held_students: number
  by_method_today: { method: PaymentMethod; total: string; count: number }[]
}

export interface PlanInput {
  fee_structure_id: string
  student_id?: number
  classroom_id?: number
  discount_percent: string
  discount_reason: string | null
  schedule: { count: number; first_due_date: string; interval_months: number }
}

export interface ReceiptInput {
  student_fee_id: string
  amount: string
  method: PaymentMethod
  reference: string | null
  paid_at: string
  installment_id: string | null
  note: string | null
  idempotency_key: string
}

export interface ReceiptVerification {
  valid: boolean
  receipt_number: string | null
  kind: ReceiptKind | null
  amount: string | null
  paid_at: string | null
  reversed: boolean | null
}

export function isStaffReceipt(r: Receipt | GuardianReceipt): r is Receipt {
  return 'id' in r
}

export function useFinancialSummary() {
  return useQuery({
    queryKey: ['financials', 'summary'],
    queryFn: async () => (await apiClient.get<FinancialSummary>('/financials/summary')).data,
  })
}

export function useDefaulters() {
  return useQuery({
    queryKey: ['financials', 'defaulters'],
    queryFn: async () => (await apiClient.get<Defaulter[]>('/financials/defaulters')).data,
  })
}

export function useReceipts(date: string) {
  return useQuery({
    queryKey: ['financials', 'receipts', date],
    queryFn: async () =>
      (await apiClient.get<Receipt[]>('/financials/receipts', { params: { date_from: date, date_to: date } })).data,
  })
}

export function useStatement(studentId: number | null) {
  return useQuery({
    queryKey: ['financials', 'statement', studentId],
    queryFn: async () => (await apiClient.get<Statement>(`/financials/students/${studentId}/statement`)).data,
    enabled: studentId !== null,
  })
}

export function useFeeStructures(enabled = true) {
  return useQuery({
    queryKey: ['financials', 'fee-structures'],
    queryFn: async () => (await apiClient.get<FeeStructure[]>('/financials/fee-structures')).data,
    enabled,
  })
}

function useFinanceMutation<TInput, TOutput>(fn: (input: TInput) => Promise<TOutput>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financials'] })
      queryClient.invalidateQueries({ queryKey: ['report-card'] }) // الحجب المالي يتأثر بالسداد والعكس
    },
  })
}

export const useCreateFeeStructure = () =>
  useFinanceMutation(async (input: FeeStructureInput) => (await apiClient.post<FeeStructure>('/financials/fee-structures', input)).data)

export const useCreatePlan = () =>
  useFinanceMutation(
    async (input: PlanInput) =>
      (await apiClient.post<{ created_student_ids: number[]; skipped_student_ids: number[] }>('/financials/plans', input)).data,
  )

export const useCreateReceipt = () =>
  useFinanceMutation(async (input: ReceiptInput) => (await apiClient.post<Receipt>('/financials/receipts', input)).data)

export const useReverseReceipt = () =>
  useFinanceMutation(
    async ({ id, reason }: { id: string; reason: string }) =>
      (await apiClient.post<Receipt>(`/financials/receipts/${id}/reverse`, { reason })).data,
  )

export async function verifyReceipt(number: string, code: string) {
  const { data } = await apiClient.get<ReceiptVerification>('/financials/receipts/verify', { params: { number, code } })
  return data
}
