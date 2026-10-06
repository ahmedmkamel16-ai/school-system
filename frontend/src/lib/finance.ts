import { toNumber } from '@/lib/grading'

export type PaymentMethod = 'cash' | 'transfer' | 'zain_cash'
export type ReceiptKind = 'payment' | 'reversal'
export type InstallmentStatus = 'paid' | 'overdue' | 'upcoming'

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'نقدي',
  transfer: 'حوالة',
  zain_cash: 'زين كاش',
}

export const RECEIPT_KIND_LABELS: Record<ReceiptKind, string> = {
  payment: 'سند قبض',
  reversal: 'سند عكس',
}

export const INSTALLMENT_STATUS_LABELS: Record<InstallmentStatus, string> = {
  paid: 'مدفوع',
  overdue: 'متأخر',
  upcoming: 'قادم',
}

export const CURRENCY = 'د.ع'

/** مبلغ بالدينار العراقي بفواصل الآلاف (الكسور تظهر فقط إن وُجدت). */
export function formatMoney(value: string | number | null | undefined): string {
  const n = toNumber(value) ?? 0
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${CURRENCY}`
}

export const todayIso = () => new Date().toISOString().slice(0, 10)

/** رابط التحقق العام الذي يُرمَّز في QR؛ الرمز HMAC من الخادم فلا يمكن تزويره. */
export function verifyUrl(receipt: { receipt_number: string; verification_code: string }): string {
  const params = new URLSearchParams({ number: receipt.receipt_number, code: receipt.verification_code })
  return `${window.location.origin}/verify-receipt?${params}`
}
