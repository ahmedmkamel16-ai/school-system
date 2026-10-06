import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Banknote, Download, FilePlus2, Layers, MessageCircle, Printer, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuth } from '@/lib/auth'
import { downloadFile, useDefaulters, useFinancialSummary, useReceipts, type Receipt } from '@/api/financials'
import { PAYMENT_METHOD_LABELS, RECEIPT_KIND_LABELS, formatMoney, todayIso } from '@/lib/finance'
import { toNumber } from '@/lib/grading'
import { PaymentModal } from '@/components/financials/PaymentModal'
import { ReceiptVoucherDialog } from '@/components/financials/ReceiptVoucher'
import { ReverseReceiptDialog } from '@/components/financials/ReverseReceiptDialog'
import { FeeStructureDialog, PlanDialog } from '@/components/financials/FeeSetupDialogs'

async function exportFile(path: string, params: Record<string, string>, filename: string) {
  try {
    await downloadFile(path, params, filename)
    toast.success('تم تنزيل الملف')
  } catch {
    toast.error('تعذّر تصدير الملف')
  }
}

/** الصفحة الرئيسية للمحاسب: مقبوضات اليوم، المتأخرات، وإحصائيات تحصيل الرسوم. */
export function FinancialDashboard() {
  const { canManageUsers } = useAuth()
  const [date, setDate] = useState(todayIso())
  const [payingFor, setPayingFor] = useState<{ open: boolean; studentId: number | null }>({ open: false, studentId: null })
  const [voucher, setVoucher] = useState<Receipt | null>(null)
  const [reversing, setReversing] = useState<Receipt | null>(null)
  const { data: summary, isLoading: loadingSummary } = useFinancialSummary()
  const { data: receipts, isLoading: loadingReceipts } = useReceipts(date)
  const { data: defaulters, isLoading: loadingDefaulters } = useDefaulters()

  const rate = Math.min(100, toNumber(summary?.collection_rate) ?? 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">الحسابات والتحصيل</h1>
        <div className="flex flex-wrap items-center gap-2">
          {canManageUsers && (
            <FeeStructureDialog
              trigger={<Button variant="outline"><FilePlus2 className="size-4" />رسم مقرر</Button>}
            />
          )}
          <PlanDialog trigger={<Button variant="outline"><Layers className="size-4" />تعيين أقساط</Button>} />
          <Button onClick={() => setPayingFor({ open: true, studentId: null })}>
            <Banknote className="size-4" />
            تسجيل دفعة
          </Button>
        </div>
      </div>

      {loadingSummary || !summary ? (
        <Skeleton className="h-28 w-full" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="مقبوضات اليوم" value={formatMoney(summary.today_collected)} hint={`${summary.today_receipts} سند`} testId="stat-today" />
            <StatCard label="مقبوضات الشهر" value={formatMoney(summary.month_collected)} testId="stat-month" />
            <StatCard
              label="المتأخرات"
              value={formatMoney(summary.overdue_amount)}
              hint={`${summary.overdue_students} طالب — ${summary.held_students} محجوب`}
              tone={(toNumber(summary.overdue_amount) ?? 0) > 0 ? 'danger' : undefined}
              testId="stat-overdue"
            />
            <StatCard label="المتبقي على الطلاب" value={formatMoney(summary.remaining_total)} testId="stat-remaining" />
          </div>
          <Card>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center justify-between text-sm">
                <span>نسبة تحصيل الرسوم</span>
                <b data-testid="stat-rate">{rate.toFixed(1)}%</b>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={rate} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${rate}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">
                المحصَّل {formatMoney(summary.paid_total)} من أصل {formatMoney(summary.net_total)}
                {summary.by_method_today.length > 0 && (
                  <> — اليوم: {summary.by_method_today.map((m) => `${PAYMENT_METHOD_LABELS[m.method]} ${formatMoney(m.total)}`).join('، ')}</>
                )}
              </p>
            </CardContent>
          </Card>
        </>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">المقبوضات</h2>
          <div className="flex items-center gap-2">
            <Input type="date" className="w-44" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value || todayIso())} aria-label="تاريخ المقبوضات" />
            <Button
              variant="outline"
              onClick={() => exportFile('/financials/receipts/export', { date_from: date, date_to: date }, `receipts-${date}.xlsx`)}
            >
              <Download className="size-4" />
              تصدير Excel
            </Button>
          </div>
        </div>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رقم السند</TableHead>
                <TableHead>الطالب</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>الطريقة</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>المحصِّل</TableHead>
                <TableHead>إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingReceipts && <TableRow><TableCell colSpan={7}><Skeleton className="h-6 w-full" /></TableCell></TableRow>}
              {receipts?.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">لا توجد سندات في هذا اليوم</TableCell></TableRow>
              )}
              {receipts?.map((r) => (
                <TableRow key={r.id} className={r.is_reversed ? 'text-muted-foreground' : ''}>
                  <TableCell className="font-mono text-xs" dir="ltr">{r.receipt_number}</TableCell>
                  <TableCell>
                    <Link className="hover:underline" to={`/financials/students/${r.student_id}`}>{r.student_name}</Link>
                  </TableCell>
                  <TableCell>
                    {r.kind === 'reversal' ? <Badge variant="destructive">{RECEIPT_KIND_LABELS.reversal}</Badge> : RECEIPT_KIND_LABELS.payment}
                    {r.is_reversed && <Badge variant="outline" className="mr-1">معكوس</Badge>}
                  </TableCell>
                  <TableCell>{PAYMENT_METHOD_LABELS[r.method]}</TableCell>
                  <TableCell className={r.kind === 'reversal' ? 'text-destructive' : ''}>
                    {r.kind === 'reversal' ? '−' : ''}{formatMoney(r.amount)}
                  </TableCell>
                  <TableCell>{r.collected_by_name}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setVoucher(r)}><Printer className="size-4" />السند</Button>
                      {canManageUsers && r.kind === 'payment' && !r.is_reversed && (
                        <Button size="sm" variant="ghost" onClick={() => setReversing(r)}><Undo2 className="size-4" />عكس</Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">المتأخرون عن الدفع</h2>
          <Button variant="outline" onClick={() => exportFile('/financials/defaulters/export', {}, `defaulters-${todayIso()}.xlsx`)}>
            <Download className="size-4" />
            تصدير Excel
          </Button>
        </div>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الطالب</TableHead>
                <TableHead>الشعبة</TableHead>
                <TableHead>ولي الأمر</TableHead>
                <TableHead>المتأخر</TableHead>
                <TableHead>أقدم استحقاق</TableHead>
                <TableHead>الحجب</TableHead>
                <TableHead>إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingDefaulters && <TableRow><TableCell colSpan={7}><Skeleton className="h-6 w-full" /></TableCell></TableRow>}
              {defaulters?.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">لا يوجد متأخرون 🎉</TableCell></TableRow>
              )}
              {defaulters?.map((d) => (
                <TableRow key={d.student_id}>
                  <TableCell className="font-medium">{d.student_name}</TableCell>
                  <TableCell>{d.classroom_name ?? '—'}</TableCell>
                  <TableCell>
                    <p>{d.guardian_name}</p>
                    <a className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline" dir="ltr" href={`tel:${d.guardian_phone}`}>
                      <MessageCircle className="size-3" />{d.guardian_phone}
                    </a>
                  </TableCell>
                  <TableCell className="text-destructive">
                    <b>{formatMoney(d.overdue_amount)}</b>
                    <p className="text-xs">{d.overdue_installments} قسط</p>
                  </TableCell>
                  <TableCell>{d.oldest_due_date}<p className="text-xs text-muted-foreground">منذ {d.days_overdue} يوم</p></TableCell>
                  <TableCell>{d.hold_exempt ? <Badge variant="secondary">مستثنى</Badge> : d.financial_hold ? <Badge variant="destructive">شهادة محجوبة</Badge> : <Badge variant="outline">—</Badge>}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" asChild>
                        <Link to={`/financials/students/${d.student_id}`}>كشف الحساب</Link>
                      </Button>
                      <Button size="sm" onClick={() => setPayingFor({ open: true, studentId: d.student_id })}>
                        <Banknote className="size-4" />دفعة
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <PaymentModal open={payingFor.open} studentId={payingFor.studentId} onClose={() => setPayingFor({ open: false, studentId: null })} />
      <ReceiptVoucherDialog receipt={voucher} onClose={() => setVoucher(null)} />
      <ReverseReceiptDialog receipt={reversing} onClose={() => setReversing(null)} />
    </div>
  )
}

function StatCard({ label, value, hint, tone, testId }: { label: string; value: string; hint?: string; tone?: 'danger'; testId: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`text-xl font-bold ${tone === 'danger' ? 'text-destructive' : ''}`} data-testid={testId}>{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}
