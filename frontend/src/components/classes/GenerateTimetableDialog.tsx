import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useGenerateTimetable } from '@/api/timetable'

export function GenerateTimetableDialog() {
  const generate = useGenerateTimetable()

  const onConfirm = async () => {
    try {
      const result = await generate.mutateAsync()
      if (result.created === 0 && result.warnings.length === 0) {
        toast.info('الجدول مكتمل بالفعل، لا توجد حصص جديدة لإضافتها')
      } else if (result.warnings.length === 0) {
        toast.success(`تم توليد ${result.created} حصة جديدة بنجاح`)
      } else {
        toast.warning(`تم توليد ${result.created} حصة جديدة، مع ${result.warnings.length} تنبيه`, {
          description: result.warnings.join(' — '),
          duration: 10000,
        })
      }
    } catch {
      toast.error('تعذّر توليد الجدول')
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          <Sparkles className="size-4" />
          توليد الجدول تلقائيًا
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>توليد الجدول الأسبوعي تلقائيًا</AlertDialogTitle>
          <AlertDialogDescription>
            سيقوم النظام بملء الحصص الفارغة في جميع الشعب اعتمادًا على المنهج المحدد لكل صف
            والمواد التي يدرّسها كل معلم، دون التأثير على أي حصص تم ضبطها يدويًا من قبل. يمكنك
            تعديل أي حصة بعد التوليد بالنقر عليها كالمعتاد.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={generate.isPending}>
            {generate.isPending ? 'جاري التوليد...' : 'توليد الآن'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
