import { useState } from 'react'
import { AlertTriangle, Banknote, Printer, Receipt as ReceiptIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { isStaffReceipt, type Statement } from '@/api/financials'
import {
  INSTALLMENT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  RECEIPT_KIND_LABELS,
  formatMoney,
} from '@/lib/finance'
import { TERM_LABELS, toNumber } from '@/lib/grading'
import { PaymentModal } from './PaymentModal'
import { ReceiptVoucherDialog } from './ReceiptVoucher'
import type { Receipt } from '@/api/financials'

const STATUS_STYLE = {
  paid: 'bg-emerald-100 text-emerald-800',
  overdue: 'bg-red-100 text-red-800',
  upcoming: 'bg-sky-100 text-sky-800',
} as const

/** كشف حساب الطالب: للمحاسب (مع تسجيل دفعة وإعادة طباعة السندات) ولولي الأمر (للقراءة فقط). */
export function StatementView({
  statement,
  studentId,
  staff,
}: {
  statement: Statement
  studentId: number
  staff: boolean
}) {
  const [paying, setPaying] = useState(false)
  const [voucher, setVoucher] = useState<Receipt | null>(null)
  const totals = statement.totals
  const hasDebt = (toNumber(totals.remaining_total) ?? 0) > 0

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">{statement.student_name}</h2>
          <p className="text-sm text-muted-foreground">{statement.classroom_name ?? ''}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" />
            طباعة الكشف
          </Button>
          {staff && hasDebt && (
            <Button onClick={() => setPaying(true)}>
              <Banknote className="size-4" />
              تسجيل دفعة
            </Button>
          )}
        </div>
      </div>

      {statement.financial_hold && (
        <div className="no-print flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            {staff
              ? 'الشهادة محجوبة عن ولي الأمر بسبب أقساط متأخرة تتجاوز الحد المسموح (حجب مالي).'
              : (statement.hold_message ?? 'يرجى مراجعة الحسابات')}
          </p>
        </div>
      )}

      <div className="print-area space-y-5 bg-background" dir="rtl">
        <h2 className="hidden text-center text-lg font-bold print:block">كشف حساب: {statement.student_name}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ['الصافي', totals.net_total, ''],
            ['المدفوع', totals.paid_total, ''],
            ['المتبقي', totals.remaining_total, ''],
            ['المتأخر', totals.overdue_amount, (toNumber(totals.overdue_amount) ?? 0) > 0 ? 'text-destructive' : ''],
          ].map(([label, value, cls]) => (
            <Card key={label}>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-lg font-bold ${cls}`} data-testid={`st-${label}`}>{formatMoney(value)}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {statement.fees.length === 0 && (
          <p className="rounded-md border p-4 text-center text-muted-foreground">لا توجد رسوم مسجّلة لهذا الطالب.</p>
        )}
        {statement.fees.map((fee) => (
          <section key={fee.id} className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-bold">
                {fee.fee_name}
                <span className="mr-2 text-xs font-normal text-muted-foreground">
                  <bdi dir="ltr">{fee.academic_year}</bdi>{fee.term ? ` — ${TERM_LABELS[fee.term]}` : ''}
                </span>
              </h3>
              <p className="text-sm text-muted-foreground">
                المستحق {formatMoney(fee.amount_due)}
                {(toNumber(fee.discount_amount) ?? 0) > 0 && <> − خصم {formatMoney(fee.discount_amount)} ({fee.discount_percent}%)</>}
                {' '}= <b className="text-foreground">{formatMoney(fee.net_amount)}</b>
              </p>
            </div>
            {fee.discount_reason && <p className="text-xs text-muted-foreground">سبب الخصم: {fee.discount_reason}</p>}
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>القسط</TableHead>
                    <TableHead>الاستحقاق</TableHead>
                    <TableHead>القيمة</TableHead>
                    <TableHead>المدفوع</TableHead>
                    <TableHead>المتبقي</TableHead>
                    <TableHead>الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fee.installments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">لا أقساط (مسدّد بالكامل أو بدون جدول)</TableCell>
                    </TableRow>
                  )}
                  {fee.installments.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>{i.installment_no}</TableCell>
                      <TableCell>{i.due_date}</TableCell>
                      <TableCell>{formatMoney(i.amount)}</TableCell>
                      <TableCell>{formatMoney(i.paid_amount)}</TableCell>
                      <TableCell>{formatMoney(i.remaining)}</TableCell>
                      <TableCell>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[i.status]}`}>
                          {INSTALLMENT_STATUS_LABELS[i.status]}
                          {i.status === 'overdue' && ` (${i.days_overdue} يوم)`}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        ))}

        <section className="space-y-2">
          <h3 className="font-bold">السندات</h3>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>رقم السند</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>الطريقة</TableHead>
                  <TableHead>المبلغ</TableHead>
                  {staff && <TableHead className="no-print">إجراءات</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {statement.receipts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={staff ? 6 : 5} className="text-center text-muted-foreground">لا توجد سندات</TableCell>
                  </TableRow>
                )}
                {statement.receipts.map((r) => (
                  <TableRow key={r.receipt_number} className={r.is_reversed ? 'text-muted-foreground line-through' : ''}>
                    <TableCell className="font-mono text-xs" dir="ltr">{r.receipt_number}</TableCell>
                    <TableCell>{r.paid_at}</TableCell>
                    <TableCell>
                      {r.kind === 'reversal' ? <Badge variant="destructive">{RECEIPT_KIND_LABELS.reversal}</Badge> : RECEIPT_KIND_LABELS.payment}
                      {r.is_reversed && <span className="mr-1 text-xs">(معكوس)</span>}
                    </TableCell>
                    <TableCell>{PAYMENT_METHOD_LABELS[r.method]}</TableCell>
                    <TableCell>{r.kind === 'reversal' ? '−' : ''}{formatMoney(r.amount)}</TableCell>
                    {staff && isStaffReceipt(r) && (
                      <TableCell className="no-print">
                        <Button size="sm" variant="ghost" onClick={() => setVoucher(r)}>
                          <ReceiptIcon className="size-4" />
                          السند
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>

      {staff && <PaymentModal open={paying} studentId={studentId} onClose={() => setPaying(false)} />}
      <ReceiptVoucherDialog receipt={voucher} onClose={() => setVoucher(null)} />
    </div>
  )
}
