import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
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
import {
  useMarkTeacherAttendance,
  useTeacherAttendance,
  type TeacherAttendanceStatus,
} from '@/api/teacherAttendance'

const STATUS_LABELS: Record<TeacherAttendanceStatus, string> = {
  present: 'حاضر',
  absent: 'غائب',
  leave: 'إجازة',
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export function TeacherAttendanceDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  const attendanceDate = todayIso()
  const { data: records, isLoading } = useTeacherAttendance(attendanceDate, open)
  const markAttendance = useMarkTeacherAttendance()

  const onChangeStatus = async (teacherId: number, status: TeacherAttendanceStatus) => {
    try {
      await markAttendance.mutateAsync({ teacher_id: teacherId, attendance_date: attendanceDate, status })
      toast.success('تم تحديث الحضور')
    } catch {
      toast.error('تعذّر تحديث الحضور')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>تسجيل حضور المعلمين اليوم</DialogTitle>
        </DialogHeader>
        <div className="max-h-96 space-y-1 overflow-y-auto">
          {isLoading && <p className="text-sm text-muted-foreground">جاري التحميل...</p>}
          {records?.map((record) => (
            <div
              key={record.teacher_id}
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
            >
              <span className="font-medium">{record.teacher_name}</span>
              <Select
                value={record.status}
                onValueChange={(value) => onChangeStatus(record.teacher_id, value as TeacherAttendanceStatus)}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
