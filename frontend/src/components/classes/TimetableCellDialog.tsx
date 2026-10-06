import { useEffect, useState } from 'react'
import { isAxiosError } from 'axios'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { WEEKDAY_LABELS } from '@/lib/constants'
import { useSubjects } from '@/api/subjects'
import { useTeachers } from '@/api/teachers'
import {
  useDeleteTimetableSlot,
  useUpsertTimetableSlot,
  type TimetableSlot,
  type Weekday,
} from '@/api/timetable'

export function TimetableCellDialog({
  open,
  onOpenChange,
  classroomId,
  day,
  periodNumber,
  existingSlot,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  classroomId: number
  day: Weekday
  periodNumber: number
  existingSlot?: TimetableSlot
}) {
  const [subjectId, setSubjectId] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)
  const { data: subjects } = useSubjects()
  const { data: teachers } = useTeachers()
  const upsertSlot = useUpsertTimetableSlot()
  const deleteSlot = useDeleteTimetableSlot()

  useEffect(() => {
    if (open) {
      setSubjectId(existingSlot ? String(existingSlot.subject_id) : '')
      setTeacherId(existingSlot ? String(existingSlot.teacher_id) : '')
      setConflictMessage(null)
    }
  }, [open, existingSlot])

  const trySave = async (force: boolean) => {
    if (!subjectId || !teacherId) return
    try {
      await upsertSlot.mutateAsync({
        classroom_id: classroomId,
        day,
        period_number: periodNumber,
        subject_id: Number(subjectId),
        teacher_id: Number(teacherId),
        force,
      })
      toast.success('تم حفظ الحصة')
      onOpenChange(false)
    } catch (error) {
      if (!force && isAxiosError(error) && error.response?.status === 409) {
        setConflictMessage(error.response.data?.detail ?? 'يوجد تعارض في الجدول')
        return
      }
      toast.error('تعذّر حفظ الحصة')
    }
  }

  const onSave = () => trySave(false)
  const onSaveAnyway = () => trySave(true)

  const onDelete = async () => {
    if (!existingSlot) return
    try {
      await deleteSlot.mutateAsync(existingSlot.id)
      toast.success('تم حذف الحصة')
      onOpenChange(false)
    } catch {
      toast.error('تعذّر حذف الحصة')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {WEEKDAY_LABELS[day]} — الحصة {periodNumber}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">المادة</label>
            <Select
              value={subjectId}
              onValueChange={(value) => {
                setSubjectId(value)
                setConflictMessage(null)
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="اختر المادة" />
              </SelectTrigger>
              <SelectContent>
                {subjects?.map((subject) => (
                  <SelectItem key={subject.id} value={String(subject.id)}>
                    {subject.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">المعلم</label>
            <Select
              value={teacherId}
              onValueChange={(value) => {
                setTeacherId(value)
                setConflictMessage(null)
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="اختر المعلم" />
              </SelectTrigger>
              <SelectContent>
                {teachers?.map((teacher) => (
                  <SelectItem key={teacher.id} value={String(teacher.id)}>
                    {teacher.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {conflictMessage && (
            <div className="flex items-start gap-2 rounded-md border border-yellow-600/50 bg-yellow-600/10 p-3 text-sm text-yellow-600">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{conflictMessage}</span>
            </div>
          )}
        </div>
        <DialogFooter className="flex-row justify-between sm:justify-between">
          {existingSlot ? (
            <Button variant="ghost" className="text-destructive" onClick={onDelete}>
              حذف الحصة
            </Button>
          ) : (
            <span />
          )}
          {conflictMessage ? (
            <Button
              variant="outline"
              className="border-yellow-600/50 text-yellow-600 hover:text-yellow-600"
              onClick={onSaveAnyway}
              disabled={upsertSlot.isPending}
            >
              احفظ على أي حال
            </Button>
          ) : (
            <Button onClick={onSave} disabled={!subjectId || !teacherId || upsertSlot.isPending}>
              حفظ
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
