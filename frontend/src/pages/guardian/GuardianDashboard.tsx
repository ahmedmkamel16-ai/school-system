import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarDays, FileText, GraduationCap, Wallet } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useStudents, type Student } from '@/api/students'
import { useAttendance, type AttendanceStatus } from '@/api/attendance'
import { useTimetable } from '@/api/timetable'
import { useGuardianReportCards, useStatement } from '@/api/financials'
import { StatementView } from '@/components/financials/StatementView'
import { ReportCardDialog } from '@/components/grades/ReportCardDialog'
import { ATTENDANCE_STATUS_LABELS, PERIODS, WEEKDAYS, WEEKDAY_LABELS } from '@/lib/constants'
import { TERM_LABELS, type Term } from '@/lib/grading'
import { formatMoney } from '@/lib/finance'

const ATTENDANCE_STYLE: Record<AttendanceStatus, string> = {
  present: 'bg-emerald-100 text-emerald-800',
  absent: 'bg-red-100 text-red-800',
  late: 'bg-amber-100 text-amber-800',
  left_early: 'bg-sky-100 text-sky-800',
}

const isoDaysAgo = (days: number) => new Date(Date.now() - days * 864e5).toISOString().slice(0, 10)
const todayWeekday = () => (['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const)[new Date().getDay()]

/** صفحة ولي الأمر المتكاملة: اختيار الابن ثم الحضور والجدول والشهادات والحساب المالي. */
export function GuardianDashboard() {
  const { data, isLoading } = useStudents({ page_size: 50 })
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const children = data?.items ?? []
  const child = children.find((c) => c.id === selectedId) ?? children[0] ?? null

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!child) return <p className="text-muted-foreground">لا يوجد أبناء مرتبطون بحسابك. تواصل مع إدارة المدرسة.</p>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">متابعة أبنائي</h1>
        {children.length > 1 && (
          <div className="flex gap-2" role="tablist" aria-label="الأبناء">
            {children.map((c) => (
              <Button
                key={c.id}
                role="tab"
                aria-selected={c.id === child.id}
                variant={c.id === child.id ? 'default' : 'outline'}
                onClick={() => setSelectedId(c.id)}
              >
                <GraduationCap className="size-4" />
                {c.full_name}
              </Button>
            ))}
          </div>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
          <div>
            <p className="text-lg font-bold" data-testid="child-name">{child.full_name}</p>
            <p className="text-sm text-muted-foreground">{child.class_name ?? child.grade_level}</p>
          </div>
          <ChildFinanceBadge studentId={child.id} />
        </CardContent>
      </Card>

      {/* key يعيد تهيئة الأقسام عند تبديل الابن فلا تظهر بيانات ابن بجانب آخر */}
      <div key={child.id} className="space-y-6">
        <AttendanceSection student={child} />
        <TimetableSection student={child} />
        <ReportCardsSection student={child} />
        <FinanceSection student={child} />
      </div>
    </div>
  )
}

function ChildFinanceBadge({ studentId }: { studentId: number }) {
  const { data } = useStatement(studentId)
  if (!data) return null
  return data.financial_hold ? (
    <Badge variant="destructive">يرجى مراجعة الحسابات</Badge>
  ) : (
    <Badge variant="outline">المتبقي {formatMoney(data.totals.remaining_total)}</Badge>
  )
}

// ---------------------------------------------------------------- الحضور والغياب

function AttendanceSection({ student }: { student: Student }) {
  const [days, setDays] = useState('30')
  const { data: records, isLoading } = useAttendance({ student_id: student.id, date_from: isoDaysAgo(Number(days)) })

  const stats = useMemo(() => {
    const counts: Record<AttendanceStatus, number> = { present: 0, absent: 0, late: 0, left_early: 0 }
    records?.forEach((r) => (counts[r.status] += 1))
    const total = records?.length ?? 0
    // الحضور = كل يوم لم يُسجَّل غيابًا (حاضر/متأخر/انصراف مبكر)
    const attended = total - counts.absent
    return { counts, total, rate: total ? (attended / total) * 100 : null }
  }, [records])
  const recent = [...(records ?? [])].sort((a, b) => b.attendance_date.localeCompare(a.attendance_date)).slice(0, 14)

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="size-4" />الحضور والغياب</CardTitle>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-40" aria-label="فترة الحضور"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="30">آخر 30 يومًا</SelectItem>
            <SelectItem value="90">آخر 90 يومًا</SelectItem>
            <SelectItem value="365">آخر سنة</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? <Skeleton className="h-16 w-full" /> : stats.total === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد سجلات حضور في هذه الفترة.</p>
        ) : (
          <>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>نسبة الحضور</span>
                <b data-testid="attendance-rate">{stats.rate!.toFixed(0)}%</b>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(stats.rate!)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-emerald-600" style={{ width: `${stats.rate}%` }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(stats.counts) as AttendanceStatus[]).map((status) => (
                <div key={status} className={`rounded-md p-2 text-center ${ATTENDANCE_STYLE[status]}`}>
                  <p className="text-xl font-bold" data-testid={`att-${status}`}>{stats.counts[status]}</p>
                  <p className="text-xs">{ATTENDANCE_STATUS_LABELS[status]}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">آخر السجلات</p>
              <div className="flex flex-wrap gap-1">
                {recent.map((r) => (
                  <span key={r.id} className={`rounded-md px-2 py-1 text-xs ${ATTENDANCE_STYLE[r.status]}`} title={r.note ?? undefined}>
                    {r.attendance_date.slice(5)} — {ATTENDANCE_STATUS_LABELS[r.status]}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------- جدول الحصص

function TimetableSection({ student }: { student: Student }) {
  const { data: slots, isLoading } = useTimetable({ classroom_id: student.classroom_id ?? undefined }, student.classroom_id !== null)
  const today = todayWeekday()
  const cell = (day: string, period: number) => slots?.find((s) => s.day === day && s.period_number === period)

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">جدول الحصص</CardTitle></CardHeader>
      <CardContent>
        {student.classroom_id === null ? (
          <p className="text-sm text-muted-foreground">لم يُسجَّل الطالب في شعبة بعد.</p>
        ) : isLoading ? <Skeleton className="h-40 w-full" /> : (slots?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">لم يُعدّ جدول الحصص لهذه الشعبة بعد.</p>
        ) : (
          <div className="overflow-auto rounded-lg border">
            <table className="w-full min-w-[640px] border-collapse text-sm" data-testid="timetable">
              <thead>
                <tr className="bg-muted/50">
                  <th className="border-b p-2 text-right">الحصة</th>
                  {WEEKDAYS.map((d) => (
                    <th key={d} className={`border-b p-2 ${d === today ? 'bg-primary/10 font-bold' : ''}`}>{WEEKDAY_LABELS[d]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERIODS.map((p) => (
                  <tr key={p}>
                    <td className="border-b p-2 text-muted-foreground">{p}</td>
                    {WEEKDAYS.map((d) => {
                      const slot = cell(d, p)
                      return (
                        <td key={d} className={`border-b p-2 text-center ${d === today ? 'bg-primary/5' : ''}`}>
                          {slot ? (
                            <>
                              <p className="font-medium">{slot.subject_name}</p>
                              <p className="text-xs text-muted-foreground">{slot.teacher_name}</p>
                            </>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------- الشهادات

function ReportCardsSection({ student }: { student: Student }) {
  const { data, isLoading } = useGuardianReportCards(student.id)
  const [open, setOpen] = useState<{ term: Term; year: string } | null>(null)

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileText className="size-4" />الشهادات</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <Skeleton className="h-10 w-full" /> : data?.financial_hold ? (
          <div className="space-y-2 rounded-md border border-red-300 bg-red-50 p-4 text-center text-red-800" role="alert" data-testid="guardian-hold">
            <AlertTriangle className="mx-auto size-6" />
            <p className="font-bold">{data.hold_message ?? 'يرجى مراجعة الحسابات'}</p>
            <p className="text-sm">الشهادات محجوبة مؤقتًا بسبب أقساط متأخرة. يمكنك مراجعة كشف الحساب أدناه.</p>
          </div>
        ) : data?.cards.length === 0 ? (
          <p className="text-sm text-muted-foreground">لم تُنشر أي شهادة بعد.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data?.cards.map((c) => (
              <Button key={`${c.academic_year}-${c.term}`} variant="outline" onClick={() => setOpen({ term: c.term, year: c.academic_year })}>
                <FileText className="size-4" />
                {TERM_LABELS[c.term]} — <bdi dir="ltr">{c.academic_year}</bdi>
              </Button>
            ))}
          </div>
        )}
      </CardContent>
      <ReportCardDialog
        student={open ? student : null}
        term={open?.term ?? 'first'}
        academicYear={open?.year ?? ''}
        onClose={() => setOpen(null)}
      />
    </Card>
  )
}

// ---------------------------------------------------------------- الحساب المالي

function FinanceSection({ student }: { student: Student }) {
  const { data, isLoading } = useStatement(student.id)
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base"><Wallet className="size-4" />الحساب المالي</CardTitle>
        <Button asChild variant="ghost" size="sm"><Link to={`/financials/students/${student.id}`}>صفحة كاملة</Link></Button>
      </CardHeader>
      <CardContent>
        {isLoading && <Skeleton className="h-32 w-full" />}
        {data && <StatementView statement={data} studentId={student.id} staff={false} />}
      </CardContent>
    </Card>
  )
}
