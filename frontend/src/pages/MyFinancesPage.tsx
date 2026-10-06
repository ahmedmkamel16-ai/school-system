import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useStudents, type Student } from '@/api/students'
import { useStatement } from '@/api/financials'
import { formatMoney } from '@/lib/finance'
import { toNumber } from '@/lib/grading'

/** حسابات أبناء ولي الأمر: ملخص لكل ابن ورابط لكشف الحساب الكامل. */
export function MyFinancesPage() {
  const { data, isLoading } = useStudents({ page_size: 50 })
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">حسابات أبنائي</h1>
      {isLoading && <Skeleton className="h-28 w-full" />}
      {data?.items.length === 0 && <p className="text-muted-foreground">لا يوجد أبناء مرتبطون بحسابك.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {data?.items.map((s) => <ChildCard key={s.id} student={s} />)}
      </div>
    </div>
  )
}

function ChildCard({ student }: { student: Student }) {
  const { data } = useStatement(student.id)
  const overdue = toNumber(data?.totals.overdue_amount) ?? 0
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-bold">{student.full_name}</p>
            <p className="text-sm text-muted-foreground">{student.class_name ?? student.grade_level}</p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to={`/financials/students/${student.id}`}>كشف الحساب</Link>
          </Button>
        </div>
        {!data ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div><p className="text-xs text-muted-foreground">الصافي</p><b>{formatMoney(data.totals.net_total)}</b></div>
              <div><p className="text-xs text-muted-foreground">المدفوع</p><b>{formatMoney(data.totals.paid_total)}</b></div>
              <div><p className="text-xs text-muted-foreground">المتبقي</p><b>{formatMoney(data.totals.remaining_total)}</b></div>
            </div>
            {data.financial_hold && (
              <p className="flex items-start gap-2 rounded-md bg-red-50 p-2 text-sm text-red-800" role="alert">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {data.hold_message ?? 'يرجى مراجعة الحسابات'}
              </p>
            )}
            {!data.financial_hold && overdue > 0 && (
              <p className="text-sm text-destructive">يوجد متأخر: {formatMoney(overdue)}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
