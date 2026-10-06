import { useState, type ReactNode } from 'react'
import { MessageCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { buildWhatsAppLink } from '@/lib/whatsapp'
import { useStudents } from '@/api/students'
import type { AttendanceRecord } from '@/api/attendance'

export function AbsentGuardiansDialog({
  absentRecords,
  trigger,
}: {
  absentRecords: AttendanceRecord[]
  trigger: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [sentIds, setSentIds] = useState<Set<number>>(new Set())
  const { data: studentsData, isLoading } = useStudents(
    open ? { page: 1, page_size: 200 } : { page: 1, page_size: 1 },
  )

  const absentStudentIds = new Set(absentRecords.map((r) => r.student_id))
  const absentStudents = (studentsData?.items ?? []).filter((s) => absentStudentIds.has(s.id))

  const onSend = (studentId: number, guardianName: string, guardianPhone: string, studentName: string) => {
    const message = `عزيزي ولي الأمر ${guardianName}، نود إعلامكم بأن الطالب ${studentName} غائب اليوم عن المدرسة. نرجو التواصل مع الإدارة في حال وجود عذر.`
    window.open(buildWhatsAppLink(guardianPhone, message), '_blank')
    setSentIds((prev) => new Set(prev).add(studentId))
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>تنبيه أولياء أمور الطلاب الغائبين اليوم</DialogTitle>
        </DialogHeader>
        <div className="max-h-96 space-y-1 overflow-y-auto">
          {isLoading && <p className="text-sm text-muted-foreground">جاري التحميل...</p>}
          {!isLoading && absentStudents.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              لا يوجد طلاب غائبون اليوم.
            </p>
          )}
          {absentStudents.map((student) => (
            <div
              key={student.id}
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{student.full_name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {student.guardian_name} — {student.guardian_phone}
                </div>
              </div>
              <Button
                size="sm"
                variant={sentIds.has(student.id) ? 'secondary' : 'default'}
                className="shrink-0"
                onClick={() =>
                  onSend(student.id, student.guardian_name, student.guardian_phone, student.full_name)
                }
              >
                {sentIds.has(student.id) ? (
                  <>
                    <CheckCircle2 className="size-4" />
                    أُرسل
                  </>
                ) : (
                  <>
                    <MessageCircle className="size-4" />
                    إرسال
                  </>
                )}
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
