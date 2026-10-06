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
import { Trash2 } from 'lucide-react'
import { useDeleteTeacher, type Teacher } from '@/api/teachers'

export function DeleteTeacherDialog({ teacher }: { teacher: Teacher }) {
  const deleteTeacher = useDeleteTeacher()

  const onConfirm = async () => {
    try {
      await deleteTeacher.mutateAsync(teacher.id)
      toast.success('تم حذف المعلم')
    } catch {
      toast.error('تعذّر حذف المعلم')
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-destructive">
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>تأكيد حذف المعلم</AlertDialogTitle>
          <AlertDialogDescription>
            هل أنت متأكد من حذف المعلم "{teacher.full_name}"؟ لا يمكن التراجع عن هذا
            الإجراء.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>حذف</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
