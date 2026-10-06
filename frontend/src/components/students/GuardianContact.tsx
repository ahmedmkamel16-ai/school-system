import { Phone, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buildWhatsAppLink } from '@/lib/whatsapp'
import { ATTENDANCE_STATUS_LABELS } from '@/lib/constants'
import type { AttendanceRecord } from '@/api/attendance'
import type { Student } from '@/api/students'

export function GuardianContact({
  student,
  record,
}: {
  student: Student
  record?: AttendanceRecord
}) {
  const onCall = () => {
    window.location.href = `tel:${student.guardian_phone}`
  }

  const onWhatsApp = () => {
    const message =
      record && (record.status === 'absent' || record.status === 'late')
        ? `ولي الأمر: ${student.guardian_name}\nالطالب: ${student.full_name}\nالحالة: ${ATTENDANCE_STATUS_LABELS[record.status]} اليوم${record.note ? `\nملاحظة: ${record.note}` : ''}`
        : `مرحبًا ${student.guardian_name}، هذه رسالة من إدارة المدرسة بخصوص الطالب ${student.full_name}.`
    window.open(buildWhatsAppLink(student.guardian_phone, message), '_blank')
  }

  return (
    <div className="flex items-center gap-1">
      <span dir="ltr" className="text-sm">
        {student.guardian_phone}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 text-blue-600 hover:text-blue-700"
        title="اتصال بولي الأمر"
        onClick={onCall}
      >
        <Phone className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 text-green-600 hover:text-green-700"
        title="تواصل عبر واتساب"
        onClick={onWhatsApp}
      >
        <MessageCircle className="size-3.5" />
      </Button>
    </div>
  )
}
