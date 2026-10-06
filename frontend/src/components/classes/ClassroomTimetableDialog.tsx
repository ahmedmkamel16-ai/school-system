import { useState, type ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { PERIODS, WEEKDAYS, WEEKDAY_LABELS } from '@/lib/constants'
import {
  useClearClassroomTimetable,
  useTimetable,
  type TimetableSlot,
  type Weekday,
} from '@/api/timetable'
import { TimetableCellDialog } from './TimetableCellDialog'

export function ClassroomTimetableDialog({
  classroomId,
  classroomName,
  trigger,
}: {
  classroomId: number
  classroomName: string
  trigger: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [editingCell, setEditingCell] = useState<{ day: Weekday; period: number } | null>(
    null,
  )
  const { data: slots } = useTimetable({ classroom_id: classroomId }, open)
  const clearTimetable = useClearClassroomTimetable()

  const findSlot = (day: Weekday, period: number): TimetableSlot | undefined =>
    slots?.find((s) => s.day === day && s.period_number === period)

  const onClear = async () => {
    try {
      await clearTimetable.mutateAsync(classroomId)
      toast.success('تم مسح الجدول بالكامل')
    } catch {
      toast.error('تعذّر مسح الجدول')
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent className="max-w-4xl">
          <DialogHeader className="flex-row items-center justify-between gap-2 sm:items-center">
            <DialogTitle>الجدول الأسبوعي — {classroomName}</DialogTitle>
            {slots && slots.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-destructive">
                    <Trash2 className="size-4" />
                    مسح الجدول
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>تأكيد مسح الجدول بالكامل</AlertDialogTitle>
                    <AlertDialogDescription>
                      سيتم حذف كل حصص شعبة "{classroomName}" ({slots.length} حصة) نهائيًا. لا
                      يمكن التراجع عن هذا الإجراء. استخدم هذا قبل إعادة التوليد إذا عدّلت أعداد
                      حصص المنهج بعد توليد سابق.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                    <AlertDialogAction onClick={onClear}>مسح</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </DialogHeader>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border p-2 text-muted-foreground">الحصة</th>
                  {WEEKDAYS.map((day) => (
                    <th key={day} className="border p-2">
                      {WEEKDAY_LABELS[day]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERIODS.map((period) => (
                  <tr key={period}>
                    <td className="border p-2 text-center font-medium text-muted-foreground">
                      {period}
                    </td>
                    {WEEKDAYS.map((day) => {
                      const slot = findSlot(day, period)
                      return (
                        <td
                          key={day}
                          className="cursor-pointer border p-2 text-center hover:bg-muted/50"
                          onClick={() => setEditingCell({ day, period })}
                        >
                          {slot ? (
                            <div>
                              <div className="font-medium">{slot.subject_name}</div>
                              <div className="text-xs text-muted-foreground">
                                {slot.teacher_name}
                              </div>
                            </div>
                          ) : (
                            <Plus className="mx-auto size-4 text-muted-foreground/50" />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
      {editingCell && (
        <TimetableCellDialog
          open={Boolean(editingCell)}
          onOpenChange={(next) => !next && setEditingCell(null)}
          classroomId={classroomId}
          day={editingCell.day}
          periodNumber={editingCell.period}
          existingSlot={findSlot(editingCell.day, editingCell.period)}
        />
      )}
    </>
  )
}
