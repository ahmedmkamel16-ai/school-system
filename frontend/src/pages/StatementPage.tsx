import { Link, useParams } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/lib/auth'
import { useStatement } from '@/api/financials'
import { StatementView } from '@/components/financials/StatementView'

/** كشف حساب طالب: للمحاسب/المدير، ولولي الأمر عن أبنائه فقط (الخادم يفرض ذلك). */
export function StatementPage() {
  const { studentId } = useParams()
  const id = Number(studentId)
  const { isParent } = useAuth()
  const { data, isLoading, isError } = useStatement(Number.isInteger(id) && id > 0 ? id : null)

  return (
    <div className="space-y-4">
      <Button variant="ghost" asChild className="no-print">
        <Link to="/financials"><ArrowRight className="size-4" />الحسابات</Link>
      </Button>
      {isLoading && <Skeleton className="h-64 w-full" />}
      {isError && <p className="rounded-md border p-6 text-center text-destructive">تعذّر عرض كشف الحساب (غير موجود أو غير مصرّح)</p>}
      {data && <StatementView statement={data} studentId={id} staff={!isParent} />}
    </div>
  )
}
