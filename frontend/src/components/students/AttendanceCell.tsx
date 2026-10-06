import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { ATTENDANCE_STATUS_LABELS } from '@/lib/constants'
import {
  useUpsertAttendance,
  type AttendanceRecord,
  type AttendanceStatus,
} from '@/api/attendance'
import type { Student } from '@/api/students'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

const STATUS_DOT_CLASS: Record<AttendanceStatus, string> = {
  present: 'bg-emerald-500',
  absent: 'bg-destructive',
  late: 'bg-amber-500',
  left_early: 'bg-blue-500',
}

const STATUS_TRIGGER_CLASS: Record<AttendanceStatus, string> = {
  present: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  absent: 'border-destructive/40 bg-destructive/10 text-destructive',
  late: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  left_early: 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400',
}

export function AttendanceCell({
  student,
  record,
  canEdit,
}: {
  student: Student
  record: AttendanceRecord | undefined
  canEdit: boolean
}) {
  const upsertAttendance = useUpsertAttendance()

  const onChangeStatus = async (status: AttendanceStatus) => {
    try {
      await upsertAttendance.mutateAsync({
        student_id: student.id,
        attendance_date: todayISO(),
        status,
      })
      toast.success('تم تسجيل الحضور')
    } catch {
      toast.error('تعذّر تسجيل الحضور')
    }
  }

  return (
    <Select
      value={record?.status ?? ''}
      disabled={!canEdit}
      onValueChange={(value) => onChangeStatus(value as AttendanceStatus)}
    >
      <SelectTrigger
        className={cn(
          'w-36',
          record ? STATUS_TRIGGER_CLASS[record.status] : 'text-muted-foreground',
        )}
      >
        <SelectValue>
          <span
            className={cn(
              'inline-block size-2 shrink-0 rounded-full',
              record ? STATUS_DOT_CLASS[record.status] : 'bg-muted-foreground/40',
            )}
          />
          {record ? ATTENDANCE_STATUS_LABELS[record.status] : 'لم يسجل'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {Object.entries(ATTENDANCE_STATUS_LABELS).map(([status, label]) => (
          <SelectItem key={status} value={status}>
            <span
              className={cn(
                'inline-block size-2 shrink-0 rounded-full',
                STATUS_DOT_CLASS[status as AttendanceStatus],
              )}
            />
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
