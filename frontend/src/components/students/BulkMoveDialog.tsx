import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { GRADE_LEVELS } from '@/lib/constants'
import { useClassrooms } from '@/api/classrooms'
import { useBulkMoveStudents } from '@/api/students'

export function BulkMoveDialog({
  studentIds,
  trigger,
  onDone,
}: {
  studentIds: number[]
  trigger: ReactNode
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [gradeLevel, setGradeLevel] = useState('')
  const [classroomId, setClassroomId] = useState('')
  const { data: classrooms } = useClassrooms(gradeLevel ? { grade_level: gradeLevel } : {})
  const bulkMove = useBulkMoveStudents()

  const onSubmit = async () => {
    try {
      const result = await bulkMove.mutateAsync({
        student_ids: studentIds,
        grade_level: gradeLevel || undefined,
        classroom_id: classroomId ? Number(classroomId) : undefined,
      })
      toast.success(`تم نقل ${result.updated} طالبًا بنجاح`)
      setOpen(false)
      onDone()
    } catch {
      toast.error('حدث خطأ أثناء النقل الجماعي')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>نقل {studentIds.length} طالبًا</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">الصف الدراسي الجديد (اختياري)</label>
            <Select value={gradeLevel} onValueChange={(v) => { setGradeLevel(v); setClassroomId('') }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="بدون تغيير" />
              </SelectTrigger>
              <SelectContent>
                {GRADE_LEVELS.map((grade) => (
                  <SelectItem key={grade} value={grade}>
                    {grade}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">الشعبة الجديدة (اختياري)</label>
            <Select value={classroomId} onValueChange={setClassroomId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="بدون تغيير" />
              </SelectTrigger>
              <SelectContent>
                {classrooms?.map((classroom) => (
                  <SelectItem key={classroom.id} value={String(classroom.id)}>
                    {classroom.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onSubmit} disabled={bulkMove.isPending || (!gradeLevel && !classroomId)}>
            {bulkMove.isPending ? 'جاري النقل...' : 'تأكيد النقل'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
