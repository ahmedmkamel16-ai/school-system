import { useState, type ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PERIODS, WEEKDAYS, WEEKDAY_LABELS } from '@/lib/constants'
import { useTimetable } from '@/api/timetable'

export function TeacherScheduleDialog({
  teacherId,
  teacherName,
  trigger,
}: {
  teacherId: number
  teacherName: string
  trigger: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const { data: slots } = useTimetable({ teacher_id: teacherId }, open)

  const findSlot = (day: string, period: number) =>
    slots?.find((s) => s.day === day && s.period_number === period)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>الجدول الأسبوعي — {teacherName}</DialogTitle>
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
                      <td key={day} className="border p-2 text-center">
                        {slot ? (
                          <div>
                            <div className="font-medium">{slot.subject_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {slot.classroom_name}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
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
  )
}
