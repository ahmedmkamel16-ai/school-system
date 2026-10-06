import { WEEKDAY_LABELS, WEEKDAYS, PERIODS } from '@/lib/constants'
import type { ClassRoom } from '@/api/classrooms'
import type { TimetableSlot } from '@/api/timetable'

export function printMasterTimetable(classrooms: ClassRoom[], slots: TimetableSlot[]) {
  const printWindow = window.open('', '_blank', 'width=1000,height=700')
  if (!printWindow) return

  const findSlot = (classroomId: number, day: string, period: number) =>
    slots.find(
      (s) => s.classroom_id === classroomId && s.day === day && s.period_number === period,
    )

  const rows = WEEKDAYS.flatMap((day) =>
    PERIODS.map((period) => {
      const cells = classrooms
        .map((classroom) => {
          const slot = findSlot(classroom.id, day, period)
          return `<td>${slot ? `${slot.subject_name ?? ''}<br><span class="teacher">${slot.teacher_name ?? ''}</span>` : ''}</td>`
        })
        .join('')
      return `<tr><td class="day">${WEEKDAY_LABELS[day]}</td><td class="period">${period}</td>${cells}</tr>`
    }),
  ).join('')

  printWindow.document.write(`
    <!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>الجدول الكلي للمدرسة</title>
        <style>
          * { box-sizing: border-box; }
          body { font-family: Tahoma, Arial, sans-serif; margin: 20px; }
          h1 { text-align: center; font-size: 18px; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th, td { border: 1px solid #999; padding: 4px 6px; text-align: center; }
          th { background: #f3f4f6; }
          td.day, td.period { font-weight: bold; background: #fafafa; white-space: nowrap; }
          .teacher { color: #6b7280; font-size: 10px; }
          @media print {
            @page { size: landscape; margin: 10mm; }
          }
        </style>
      </head>
      <body>
        <h1>الجدول الأسبوعي الكلي للمدرسة</h1>
        <table>
          <thead>
            <tr>
              <th>اليوم</th>
              <th>الحصة</th>
              ${classrooms.map((c) => `<th>${c.name}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <script>window.onload = () => window.print()</script>
      </body>
    </html>
  `)
  printWindow.document.close()
}
