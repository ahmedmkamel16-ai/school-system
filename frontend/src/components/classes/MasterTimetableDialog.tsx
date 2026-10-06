import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { FileSpreadsheet, Printer } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { WEEKDAYS, WEEKDAY_LABELS, PERIODS } from '@/lib/constants'
import { useClassrooms } from '@/api/classrooms'
import { useAllTimetableSlots, exportTimetableUrl } from '@/api/timetable'
import { apiClient } from '@/api/client'
import { printMasterTimetable } from '@/lib/printMasterTimetable'

export function MasterTimetableDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  const { data: classrooms } = useClassrooms({}, { enabled: open })
  const { data: slots } = useAllTimetableSlots(open)

  const findSlot = (classroomId: number, day: string, period: number) =>
    slots?.find(
      (s) => s.classroom_id === classroomId && s.day === day && s.period_number === period,
    )

  const onExportExcel = async () => {
    try {
      const response = await apiClient.get(exportTimetableUrl(), { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.download = 'school_timetable.xlsx'
      link.click()
      window.URL.revokeObjectURL(url)
    } catch {
      toast.error('تعذّر تصدير الملف')
    }
  }

  const onPrint = () => {
    if (!classrooms || !slots) return
    printMasterTimetable(classrooms, slots)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-6xl">
        <DialogHeader className="flex-row items-center justify-between gap-2 sm:items-center">
          <DialogTitle>الجدول الأسبوعي الكلي للمدرسة</DialogTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onExportExcel}>
              <FileSpreadsheet className="size-4" />
              تصدير Excel
            </Button>
            <Button variant="outline" size="sm" onClick={onPrint}>
              <Printer className="size-4" />
              طباعة / PDF
            </Button>
          </div>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-background">
              <tr>
                <th className="border p-2 text-muted-foreground">اليوم</th>
                <th className="border p-2 text-muted-foreground">الحصة</th>
                {classrooms?.map((classroom) => (
                  <th key={classroom.id} className="border p-2">
                    {classroom.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {WEEKDAYS.flatMap((day) =>
                PERIODS.map((period) => (
                  <tr key={`${day}-${period}`}>
                    <td className="border p-2 text-center font-medium text-muted-foreground">
                      {WEEKDAY_LABELS[day]}
                    </td>
                    <td className="border p-2 text-center font-medium text-muted-foreground">
                      {period}
                    </td>
                    {classrooms?.map((classroom) => {
                      const slot = findSlot(classroom.id, day, period)
                      return (
                        <td key={classroom.id} className="border p-2 text-center">
                          {slot ? (
                            <div>
                              <div className="font-medium">{slot.subject_name}</div>
                              <div className="text-xs text-muted-foreground">
                                {slot.teacher_name}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  )
}
