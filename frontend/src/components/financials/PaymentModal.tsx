import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useStudents, type Student } from '@/api/students'
import { useCreateReceipt, useStatement, type Receipt, type Statement } from '@/api/financials'
import { PAYMENT_METHOD_LABELS, formatMoney, todayIso, type PaymentMethod } from '@/lib/finance'
import { apiErrorMessage, toNumber } from '@/lib/grading'
import { ReceiptVoucherPanel } from './ReceiptVoucher'

const AUTO = 'auto'

/** نافذة تسجيل دفعة: اختيار الحساب/القسط والمبلغ، ثم سند القبض الجاهز للطباعة فور النجاح. */
export function PaymentModal({
  open,
  studentId,
  onClose,
}: {
  open: boolean
  studentId: number | null // null ⇒ يبحث المحاسب عن الطالب أولًا
  onClose: () => void
}) {
  const [picked, setPicked] = useState<Student | null>(null)
  const [search, setSearch] = useState('')
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const activeId = studentId ?? picked?.id ?? null

  useEffect(() => {
    if (!open) {
      setPicked(null)
      setSearch('')
      setReceipt(null)
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="no-print">
          <DialogTitle>{receipt ? 'تم تسجيل الدفعة' : 'تسجيل دفعة'}</DialogTitle>
          <DialogDescription>
            {receipt ? 'اطبع سند القبض وسلّمه لولي الأمر.' : 'اختر الحساب والمبلغ وطريقة الدفع.'}
          </DialogDescription>
        </DialogHeader>

        {receipt ? (
          <>
            <ReceiptVoucherPanel receipt={receipt} />
            <DialogFooter className="no-print">
              <Button variant="outline" onClick={() => setReceipt(null)}>دفعة أخرى</Button>
              <Button onClick={onClose}>إغلاق</Button>
            </DialogFooter>
          </>
        ) : activeId === null ? (
          <StudentPicker search={search} onSearch={setSearch} onPick={setPicked} />
        ) : (
          <PaymentForm studentId={activeId} onCancel={onClose} onDone={setReceipt} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function StudentPicker({
  search,
  onSearch,
  onPick,
}: {
  search: string
  onSearch: (v: string) => void
  onPick: (s: Student) => void
}) {
  const { data } = useStudents({ search: search || undefined, page_size: 8 })
  return (
    <div className="space-y-3">
      <Label htmlFor="pay_student_search">ابحث عن الطالب</Label>
      <Input
        id="pay_student_search"
        autoFocus
        placeholder="الاسم أو الرقم الوطني..."
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />
      <ul className="max-h-64 divide-y overflow-auto rounded-md border">
        {data?.items.map((s) => (
          <li key={s.id}>
            <button type="button" className="flex w-full items-center justify-between p-2 text-right hover:bg-accent" onClick={() => onPick(s)}>
              <span className="font-medium">{s.full_name}</span>
              <span className="text-xs text-muted-foreground">{s.class_name ?? s.grade_level}</span>
            </button>
          </li>
        ))}
        {data?.items.length === 0 && <li className="p-3 text-center text-sm text-muted-foreground">لا نتائج</li>}
      </ul>
    </div>
  )
}

function PaymentForm({
  studentId,
  onCancel,
  onDone,
}: {
  studentId: number
  onCancel: () => void
  onDone: (receipt: Receipt) => void
}) {
  const { data: statement, isLoading } = useStatement(studentId)
  const createReceipt = useCreateReceipt()
  const [feeId, setFeeId] = useState('')
  const [installmentId, setInstallmentId] = useState(AUTO)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [reference, setReference] = useState('')
  const [paidAt, setPaidAt] = useState(todayIso())
  const [note, setNote] = useState('')
  // مفتاح تكرار ثابت لكل محاولة: الضغط المزدوج أو إعادة الإرسال لا ينشئ سندين
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())

  const openFees = useMemo(
    () => (statement?.fees ?? []).filter((f) => (toNumber(f.remaining_amount) ?? 0) > 0),
    [statement],
  )
  const fee = openFees.find((f) => f.id === feeId)
  const unpaid = fee?.installments.filter((i) => (toNumber(i.remaining) ?? 0) > 0) ?? []
  const target = installmentId === AUTO ? null : unpaid.find((i) => i.id === installmentId)
  const maxAmount = toNumber(target ? target.remaining : fee?.remaining_amount) ?? 0

  // الحساب الأول المفتوح افتراضيًا، والمبلغ المقترح = أول قسط غير مسدد
  useEffect(() => {
    if (!feeId && openFees.length > 0) setFeeId(openFees[0].id)
  }, [openFees, feeId])
  useEffect(() => {
    if (!fee) return
    const first = fee.installments.find((i) => (toNumber(i.remaining) ?? 0) > 0)
    setInstallmentId(AUTO)
    setAmount(String(toNumber(first?.remaining ?? fee.remaining_amount) ?? ''))
  }, [feeId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (target) setAmount(String(toNumber(target.remaining) ?? ''))
  }, [installmentId]) // eslint-disable-line react-hooks/exhaustive-deps

  const value = toNumber(amount)
  const errors = {
    fee: fee ? null : 'لا توجد رسوم مستحقة على هذا الطالب',
    amount:
      value === null || value <= 0
        ? 'أدخل مبلغًا صحيحًا'
        : value > maxAmount + 1e-9
          ? `يتجاوز المتبقي (${formatMoney(maxAmount)})`
          : null,
    reference: method === 'transfer' && !reference.trim() ? 'رقم الحوالة مطلوب' : null,
    date: paidAt > todayIso() ? 'لا يجوز تاريخ مستقبلي' : null,
  }
  const invalid = Object.values(errors).some(Boolean)

  const submit = async () => {
    if (invalid || !fee) return
    try {
      const receipt = await createReceipt.mutateAsync({
        student_fee_id: fee.id,
        amount,
        method,
        reference: reference.trim() || null,
        paid_at: paidAt,
        installment_id: target?.id ?? null,
        note: note.trim() || null,
        idempotency_key: idempotencyKey,
      })
      setIdempotencyKey(crypto.randomUUID())
      toast.success(`تم تسجيل السند ${receipt.receipt_number}`)
      onDone(receipt)
    } catch (error) {
      toast.error(apiErrorMessage(error))
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">جارٍ التحميل...</p>
  if (!statement) return <p className="text-destructive">تعذّر تحميل حساب الطالب</p>

  return (
    <div className="space-y-4">
      <StatementSummary statement={statement} />
      {openFees.length === 0 ? (
        <p className="rounded-md border p-3 text-center text-sm text-muted-foreground">لا توجد مبالغ مستحقة على هذا الطالب.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>الحساب</Label>
            <Select value={feeId} onValueChange={setFeeId}>
              <SelectTrigger className="w-full" aria-label="الحساب">
                <SelectValue placeholder="اختر الحساب" />
              </SelectTrigger>
              <SelectContent>
                {openFees.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.fee_name} — المتبقي {formatMoney(f.remaining_amount)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {unpaid.length > 0 && (
            <div className="space-y-2 sm:col-span-2">
              <Label>القسط</Label>
              <Select value={installmentId} onValueChange={setInstallmentId}>
                <SelectTrigger className="w-full" aria-label="القسط">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO}>تلقائي (الأقدم أولًا)</SelectItem>
                  {unpaid.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      القسط {i.installment_no} — {i.due_date} — {formatMoney(i.remaining)}
                      {i.status === 'overdue' ? ' (متأخر)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="pay_amount">المبلغ</Label>
            <Input id="pay_amount" inputMode="decimal" dir="ltr" className="text-right" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={Boolean(errors.amount)} />
            {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
          </div>
          <div className="space-y-2">
            <Label>طريقة الدفع</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger className="w-full" aria-label="طريقة الدفع">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {method !== 'cash' && (
            <div className="space-y-2">
              <Label htmlFor="pay_ref">{method === 'transfer' ? 'رقم الحوالة' : 'رقم معاملة زين كاش'}</Label>
              <Input id="pay_ref" dir="ltr" className="text-right" value={reference} onChange={(e) => setReference(e.target.value)} />
              {errors.reference && <p className="text-xs text-destructive">{errors.reference}</p>}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="pay_date">تاريخ الدفع</Label>
            <Input id="pay_date" type="date" max={todayIso()} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            {errors.date && <p className="text-xs text-destructive">{errors.date}</p>}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pay_note">ملاحظة (اختياري)</Label>
            <Input id="pay_note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>إلغاء</Button>
        <Button onClick={submit} disabled={invalid || createReceipt.isPending}>
          {createReceipt.isPending ? 'جارٍ التسجيل...' : 'تسجيل الدفعة وإصدار السند'}
        </Button>
      </DialogFooter>
    </div>
  )
}

function StatementSummary({ statement }: { statement: Statement }) {
  return (
    <div className="rounded-md border bg-muted/40 p-3 text-sm">
      <p className="font-bold">{statement.student_name} <span className="font-normal text-muted-foreground">— {statement.classroom_name ?? ''}</span></p>
      <div className="mt-1 flex flex-wrap gap-4 text-muted-foreground">
        <span>الصافي: <b className="text-foreground">{formatMoney(statement.totals.net_total)}</b></span>
        <span>المدفوع: <b className="text-foreground">{formatMoney(statement.totals.paid_total)}</b></span>
        <span>المتبقي: <b className="text-foreground">{formatMoney(statement.totals.remaining_total)}</b></span>
        {(toNumber(statement.totals.overdue_amount) ?? 0) > 0 && (
          <span className="text-destructive">متأخر: <b>{formatMoney(statement.totals.overdue_amount)}</b></span>
        )}
      </div>
    </div>
  )
}

