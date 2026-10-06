import { Link } from 'react-router-dom'
import { AlertTriangle, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/lib/auth'
import { usePublishReportCard, useReportCard } from '@/api/grades'
import { ReportCardView } from '@/components/grades/ReportCardView'
import { TERM_LABELS, apiErrorCode, apiErrorMessage, type Term } from '@/lib/grading'

/** عرض كشف درجات طالب في حوار: للطاقم (مع النشر للمدير) ولولي الأمر (مع رسالة الحجب المالي). */
export function ReportCardDialog({
  student,
  term,
  academicYear,
  onClose,
}: {
  student: { id: number; full_name: string } | null
  term: Term
  academicYear: string
  onClose: () => void
}) {
  const { isParent, canManageUsers } = useAuth()
  const query = { studentId: student?.id ?? null, term, academicYear }
  const { data: card, isLoading, isError, error } = useReportCard(query, isParent)
  const publish = usePublishReportCard()

  const onPublish = async () => {
    try {
      await publish.mutateAsync(query)
      toast.success('تم نشر الكشف لولي الأمر')
    } catch (e) {
      toast.error(apiErrorMessage(e))
    }
  }

  return (
    <Dialog open={student !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader className="no-print">
          <DialogTitle>كشف درجات {student?.full_name}</DialogTitle>
          <DialogDescription>
            {TERM_LABELS[term]} — <bdi dir="ltr">{academicYear}</bdi>
          </DialogDescription>
        </DialogHeader>
        {isLoading && <Skeleton className="h-64 w-full" />}
        {isError && apiErrorCode(error) === 'financial_hold' && (
          <div className="no-print space-y-3 rounded-md border border-red-300 bg-red-50 p-4 text-center text-red-800" role="alert" data-testid="financial-hold">
            <AlertTriangle className="mx-auto size-8" />
            <p className="font-bold">{apiErrorMessage(error)}</p>
            <p className="text-sm">الشهادة محجوبة مؤقتًا بسبب أقساط متأخرة.</p>
            {student && (
              <Button asChild variant="outline">
                <Link to={`/financials/students/${student.id}`}>عرض كشف الحساب</Link>
              </Button>
            )}
          </div>
        )}
        {isError && apiErrorCode(error) !== 'financial_hold' && (
          <p className="no-print rounded-md border p-4 text-center text-muted-foreground">
            {isParent
              ? 'لم يُنشر كشف الدرجات لهذا الفصل بعد.'
              : apiErrorMessage(error, 'تعذّر تحميل الكشف')}
          </p>
        )}
        {card && (
          <>
            <ReportCardView card={card} />
            {canManageUsers && (
              <div className="no-print flex justify-end">
                <Button onClick={onPublish} disabled={publish.isPending}>
                  <Send className="size-4" />
                  {card.status === 'published' ? 'تحديث الكشف المنشور' : 'نشر الكشف لولي الأمر'}
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
