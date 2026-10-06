import { Link } from 'react-router-dom'
import {
  Users,
  UserRound,
  School,
  TrendingUp,
  UserPlus,
  AlertTriangle,
  History,
  CalendarCheck,
  ChevronLeft,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useStudents } from '@/api/students'
import { useTeachers } from '@/api/teachers'
import { useClassrooms } from '@/api/classrooms'
import { useDashboardSummary } from '@/api/dashboard'
import { useAuth } from '@/lib/auth'
import { WeeklyAttendanceChart } from '@/components/dashboard/WeeklyAttendanceChart'
import { TeacherAttendanceDialog } from '@/components/dashboard/TeacherAttendanceDialog'

function attendanceColor(rate: number) {
  if (rate >= 90) return 'bg-emerald-500'
  if (rate >= 75) return 'bg-yellow-500'
  return 'bg-destructive'
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'الآن'
  if (minutes < 60) return `منذ ${minutes} دقيقة`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `منذ ${hours} ساعة`
  const days = Math.floor(hours / 24)
  return `منذ ${days} يوم`
}

export function DashboardPage() {
  const { user, isParent } = useAuth()
  const canSeeStaffStats = Boolean(user) && !isParent
  const { data: students, isLoading: studentsLoading } = useStudents()
  const { data: teachers, isLoading: teachersLoading } = useTeachers(
    {},
    { enabled: canSeeStaffStats },
  )
  const { data: classrooms, isLoading: classroomsLoading } = useClassrooms(
    {},
    { enabled: canSeeStaffStats },
  )
  const { data: summary, isLoading: summaryLoading } = useDashboardSummary(canSeeStaffStats)

  const baseStats = [
    {
      label: isParent ? 'أبنائي المسجلون' : 'إجمالي الطلاب',
      value: students?.total,
      isLoading: studentsLoading,
      icon: Users,
    },
    ...(isParent
      ? []
      : [
          {
            label: 'المعلمون',
            value: teachers?.length,
            isLoading: teachersLoading,
            icon: UserRound,
          },
          {
            label: 'الشعب الدراسية',
            value: classrooms?.length,
            isLoading: classroomsLoading,
            icon: School,
          },
        ]),
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">لوحة التحكم</h1>
        {canSeeStaffStats && (
          <TeacherAttendanceDialog
            trigger={
              <Button variant="outline">
                <CalendarCheck className="size-4" />
                تسجيل حضور المعلمين
              </Button>
            }
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {baseStats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stat.isLoading ? '...' : (stat.value ?? 0)}
              </div>
            </CardContent>
          </Card>
        ))}

        {canSeeStaffStats && (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  نسبة الحضور اليومي
                </CardTitle>
                <TrendingUp className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {summaryLoading ? '...' : `${summary?.today_attendance_rate ?? 0}%`}
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${attendanceColor(summary?.today_attendance_rate ?? 0)}`}
                    style={{ width: `${Math.min(summary?.today_attendance_rate ?? 0, 100)}%` }}
                  />
                </div>
                {summary && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {summary.today_present_count} من {summary.today_total_students} طالب
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  طلاب جدد هذا الشهر
                </CardTitle>
                <UserPlus className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {summaryLoading ? '...' : (summary?.new_students_this_month ?? 0)}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {canSeeStaffStats && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">الحضور خلال الأسبوع</CardTitle>
            </CardHeader>
            <CardContent>
              {summaryLoading ? (
                <p className="text-sm text-muted-foreground">جاري التحميل...</p>
              ) : (
                <WeeklyAttendanceChart data={summary?.weekly_attendance ?? []} />
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="size-4 text-yellow-600" />
                  أحداث اليوم السريعة
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {summaryLoading && <p className="text-sm text-muted-foreground">جاري التحميل...</p>}
                {!summaryLoading && summary?.teachers_absent_today.length === 0 && (
                  <p className="text-sm text-muted-foreground">لا يوجد معلمون غائبون اليوم.</p>
                )}
                {summary?.teachers_absent_today.map((absence) => (
                  <div key={absence.teacher_id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{absence.teacher_name}</span>
                      <Badge variant={absence.status === 'absent' ? 'destructive' : 'secondary'}>
                        {absence.status === 'absent' ? 'غائب' : 'إجازة'}
                      </Badge>
                    </div>
                    {absence.periods_needing_coverage.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {absence.periods_needing_coverage.map((slot, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {slot.classroom_name} — حصة {slot.period_number} ({slot.subject_name})
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">لا حصص له اليوم.</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="size-4 text-yellow-600" />
                  صحة الجدول الدراسي
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {summaryLoading && <p className="text-sm text-muted-foreground">جاري التحميل...</p>}
                {summary && (
                  <>
                    <Link
                      to="/classes"
                      className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-muted"
                    >
                      <span>شعب بجدول غير مكتمل</span>
                      <span className="flex items-center gap-1">
                        <Badge
                          variant={
                            summary.schedule_health.classrooms_with_incomplete_schedule > 0
                              ? 'destructive'
                              : 'secondary'
                          }
                        >
                          {summary.schedule_health.classrooms_with_incomplete_schedule}
                        </Badge>
                        <ChevronLeft className="size-4 text-muted-foreground" />
                      </span>
                    </Link>
                    <Link
                      to="/teachers"
                      className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-muted"
                    >
                      <span>معلمون بلا تقييد صفوف</span>
                      <span className="flex items-center gap-1">
                        <Badge variant="secondary">
                          {summary.schedule_health.teachers_without_grade_scope}
                        </Badge>
                        <ChevronLeft className="size-4 text-muted-foreground" />
                      </span>
                    </Link>
                    <Link
                      to="/classes"
                      className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-muted"
                    >
                      <span>مواد بلا معلم مؤهَّل</span>
                      <span className="flex items-center gap-1">
                        <Badge
                          variant={
                            summary.schedule_health.subjects_without_teacher > 0
                              ? 'destructive'
                              : 'secondary'
                          }
                        >
                          {summary.schedule_health.subjects_without_teacher}
                        </Badge>
                        <ChevronLeft className="size-4 text-muted-foreground" />
                      </span>
                    </Link>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="size-4 text-muted-foreground" />
                آخر الأنشطة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {summaryLoading && <p className="text-sm text-muted-foreground">جاري التحميل...</p>}
              {!summaryLoading && summary?.recent_activity.length === 0 && (
                <p className="text-sm text-muted-foreground">لا توجد أنشطة بعد.</p>
              )}
              {summary?.recent_activity.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span>
                    <span className="font-medium">{item.actor_name}</span> — {item.description}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {timeAgo(item.created_at)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
