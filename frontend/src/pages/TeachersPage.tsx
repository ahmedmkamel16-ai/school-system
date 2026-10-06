import { useState } from 'react'
import {
  Plus,
  Pencil,
  MessageCircle,
  Users,
  UserCheck,
  UserX,
  CalendarDays,
} from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TEACHER_STATUS_LABELS } from '@/lib/constants'
import { buildWhatsAppLink } from '@/lib/whatsapp'
import { useAuth } from '@/lib/auth'
import { useTeachers, type TeacherFilters } from '@/api/teachers'
import { useSubjects } from '@/api/subjects'
import { useAllTimetableSlots } from '@/api/timetable'
import { TeacherFormDialog } from '@/components/teachers/TeacherFormDialog'
import { DeleteTeacherDialog } from '@/components/teachers/DeleteTeacherDialog'
import { TeacherScheduleDialog } from '@/components/teachers/TeacherScheduleDialog'

export function TeachersPage() {
  const [filters, setFilters] = useState<TeacherFilters>({})
  const { data: teachers, isLoading, isError } = useTeachers(filters)
  const { canManageUsers } = useAuth()
  const { data: allSlots } = useAllTimetableSlots(canManageUsers)
  const { data: subjects } = useSubjects()
  const columnCount = canManageUsers ? 9 : 6

  const total = teachers?.length ?? 0
  const activeCount = teachers?.filter((t) => t.status === 'active').length ?? 0
  const onLeaveCount = teachers?.filter((t) => t.status === 'on_leave').length ?? 0

  const subjectNamesFor = (subjectIds: number[]) =>
    subjectIds
      .map((id) => subjects?.find((s) => s.id === id)?.name)
      .filter(Boolean)
      .join('، ')

  const periodsAssignedFor = (teacherId: number) =>
    allSlots?.filter((slot) => slot.teacher_id === teacherId).length ?? 0

  const assignmentsFor = (teacherId: number) => {
    const bySubject = new Map<string, Set<string>>()
    allSlots
      ?.filter((slot) => slot.teacher_id === teacherId)
      .forEach((slot) => {
        const subject = slot.subject_name ?? '—'
        const classroom = slot.classroom_name ?? '—'
        if (!bySubject.has(subject)) bySubject.set(subject, new Set())
        bySubject.get(subject)?.add(classroom)
      })
    return Array.from(bySubject.entries()).map(
      ([subject, classrooms]) => `${subject}: ${[...classrooms].join('، ')}`,
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">المعلمون</h1>
        {canManageUsers && (
          <TeacherFormDialog
            trigger={
              <Button>
                <Plus className="size-4" />
                إضافة معلم
              </Button>
            }
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              إجمالي المعلمين
            </CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">نشطون</CardTitle>
            <UserCheck className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">في إجازة</CardTitle>
            <UserX className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{onLeaveCount}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="بحث بالاسم أو البريد الإلكتروني..."
          className="max-w-xs"
          value={filters.search ?? ''}
          onChange={(e) =>
            setFilters({ ...filters, search: e.target.value || undefined })
          }
        />
        <Select
          value={filters.status ?? 'all'}
          onValueChange={(value) =>
            setFilters({
              ...filters,
              status: value === 'all' ? undefined : (value as TeacherFilters['status']),
            })
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="كل الحالات" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            {Object.entries(TEACHER_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الاسم الكامل</TableHead>
              <TableHead>البريد الإلكتروني</TableHead>
              <TableHead>الهاتف</TableHead>
              <TableHead>المواد التي يدرّسها</TableHead>
              <TableHead>الصفوف</TableHead>
              {canManageUsers && <TableHead>الحصص الموزّعة</TableHead>}
              {canManageUsers && <TableHead>المواد والشعب</TableHead>}
              <TableHead>الحالة</TableHead>
              {canManageUsers && <TableHead>إجراءات</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={columnCount} className="text-center text-muted-foreground">
                  جاري التحميل...
                </TableCell>
              </TableRow>
            )}
            {isError && (
              <TableRow>
                <TableCell colSpan={columnCount} className="text-center text-destructive">
                  تعذّر الاتصال بالخادم.
                </TableCell>
              </TableRow>
            )}
            {teachers?.length === 0 && (
              <TableRow>
                <TableCell colSpan={columnCount} className="text-center text-muted-foreground">
                  لا يوجد معلمون مطابقون.
                </TableCell>
              </TableRow>
            )}
            {teachers?.map((teacher) => (
              <TableRow key={teacher.id}>
                <TableCell className="font-medium">{teacher.full_name}</TableCell>
                <TableCell>{teacher.email}</TableCell>
                <TableCell>
                  <button
                    className="flex items-center gap-1 text-green-600 hover:underline"
                    onClick={() =>
                      window.open(
                        buildWhatsAppLink(
                          teacher.phone,
                          `مرحبًا ${teacher.full_name}، هذه رسالة من إدارة المدرسة.`,
                        ),
                        '_blank',
                      )
                    }
                  >
                    <MessageCircle className="size-4" />
                    {teacher.phone}
                  </button>
                </TableCell>
                <TableCell>{subjectNamesFor(teacher.subject_ids) || '—'}</TableCell>
                <TableCell>
                  {teacher.grade_levels.length === 0 ? (
                    <Badge
                      variant="outline"
                      className="border-yellow-600/50 text-xs text-yellow-600"
                    >
                      بلا تقييد صفوف
                    </Badge>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {teacher.grade_levels.map((grade) => (
                        <Badge key={grade} variant="outline" className="text-xs">
                          {grade}
                        </Badge>
                      ))}
                    </div>
                  )}
                </TableCell>
                {canManageUsers && (
                  <TableCell>
                    <span
                      className={
                        periodsAssignedFor(teacher.id) >= teacher.max_periods_per_week
                          ? 'font-medium text-destructive'
                          : ''
                      }
                    >
                      {periodsAssignedFor(teacher.id)} / {teacher.max_periods_per_week}
                    </span>
                  </TableCell>
                )}
                {canManageUsers && (
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {assignmentsFor(teacher.id).length === 0 && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                      {assignmentsFor(teacher.id).map((label) => (
                        <Badge key={label} variant="outline" className="text-xs">
                          {label}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                )}
                <TableCell>
                  <Badge variant={teacher.status === 'active' ? 'default' : 'secondary'}>
                    {TEACHER_STATUS_LABELS[teacher.status] ?? teacher.status}
                  </Badge>
                </TableCell>
                {canManageUsers && (
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <TeacherFormDialog
                        teacher={teacher}
                        trigger={
                          <Button variant="ghost" size="icon">
                            <Pencil className="size-4" />
                          </Button>
                        }
                      />
                      <DeleteTeacherDialog teacher={teacher} />
                      <TeacherScheduleDialog
                        teacherId={teacher.id}
                        teacherName={teacher.full_name}
                        trigger={
                          <Button variant="ghost" size="icon" title="الجدول الأسبوعي">
                            <CalendarDays className="size-4" />
                          </Button>
                        }
                      />
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
