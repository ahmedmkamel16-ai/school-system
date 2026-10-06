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
import { useDeleteClassroom, type ClassRoom } from '@/api/classrooms'

export function DeleteClassroomDialog({ classroom }: { classroom: ClassRoom }) {
  const deleteClassroom = useDeleteClassroom()

  const onConfirm = async () => {
    try {
      await deleteClassroom.mutateAsync(classroom.id)
      toast.success('تم حذف الشعبة')
    } catch {
      toast.error('تعذّر حذف الشعبة')
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
          <AlertDialogTitle>تأكيد حذف الشعبة</AlertDialogTitle>
          <AlertDialogDescription>
            هل أنت متأكد من حذف الشعبة "{classroom.name}"؟ لا يمكن التراجع عن هذا
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
