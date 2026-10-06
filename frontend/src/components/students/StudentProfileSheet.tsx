import type { ReactNode } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { StudentAvatar } from './StudentAvatar'
import { STUDENT_STATUS_LABELS, ATTENDANCE_STATUS_LABELS } from '@/lib/constants'
import { useAttendance } from '@/api/attendance'
import type { Student } from '@/api/students'

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

export function StudentProfileSheet({
  student,
  open,
  onOpenChange,
}: {
  student: Student
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: attendance } = useAttendance({ student_id: student.id })
  const recent = attendance
    ?.slice()
    .sort((a, b) => b.attendance_date.localeCompare(a.attendance_date))
    .slice(0, 10)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <div className="flex items-center gap-3">
            <StudentAvatar fullName={student.full_name} />
            <div>
              <SheetTitle>{student.full_name}</SheetTitle>
              <SheetDescription>{student.national_id}</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <div className="px-4 pb-4">
          <InfoRow label="الصف الدراسي" value={student.grade_level} />
          <InfoRow label="الشعبة" value={student.class_name ?? '—'} />
          <InfoRow label="تاريخ الميلاد" value={student.birth_date} />
          <InfoRow label="العنوان" value={student.address ?? '—'} />
          <InfoRow label="اسم ولي الأمر" value={student.guardian_name} />
          <InfoRow label="هاتف ولي الأمر" value={student.guardian_phone} />
          <InfoRow
            label="الحالة"
            value={
              <Badge variant="secondary">
                {STUDENT_STATUS_LABELS[student.status] ?? student.status}
              </Badge>
            }
          />
          <Separator className="my-4" />
          <h3 className="mb-2 text-sm font-semibold">آخر سجلات الحضور</h3>
          {!recent?.length && (
            <p className="text-sm text-muted-foreground">لا توجد سجلات حضور بعد.</p>
          )}
          <div className="space-y-1">
            {recent?.map((record) => (
              <div
                key={record.id}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-muted-foreground">{record.attendance_date}</span>
                <Badge variant="outline">
                  {ATTENDANCE_STATUS_LABELS[record.status] ?? record.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
