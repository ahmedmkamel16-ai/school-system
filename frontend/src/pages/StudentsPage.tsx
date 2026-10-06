import { useMemo, useState } from 'react'
import {
  Plus,
  Pencil,
  Search,
  RotateCcw,
  Download,
  Upload,
  Users,
  CalendarCheck,
  UserPlus,
  ChevronRight,
  ChevronLeft,
  MessageCircle,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
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
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { GRADE_LEVELS, STUDENT_STATUS_LABELS } from '@/lib/constants'
import { useAuth } from '@/lib/auth'
import { useClassrooms } from '@/api/classrooms'
import {
  useStudents,
  exportStudentsUrl,
  type StudentFilters,
} from '@/api/students'
import { apiClient } from '@/api/client'
import { useAttendance } from '@/api/attendance'
import { StudentFormDialog } from '@/components/students/StudentFormDialog'
import { DeleteStudentDialog } from '@/components/students/DeleteStudentDialog'
import { AttendanceCell } from '@/components/students/AttendanceCell'
import { StudentAvatar } from '@/components/students/StudentAvatar'
import { StudentActionsMenu } from '@/components/students/StudentActionsMenu'
import { GuardianContact } from '@/components/students/GuardianContact'
import { BulkMoveDialog } from '@/components/students/BulkMoveDialog'
import { ImportStudentsDialog } from '@/components/students/ImportStudentsDialog'
import { AbsentGuardiansDialog } from '@/components/students/AbsentGuardiansDialog'
import { cn } from '@/lib/utils'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

const PAGE_SIZE_OPTIONS = [10, 25, 50]

type SortKey = 'name' | 'status' | 'attendance'

const ATTENDANCE_SORT_RANK: Record<string, number> = {
  absent: 0,
  late: 1,
  left_early: 2,
  present: 3,
}

function SortIcon({ active, dir }: { active: boolean; dir?: 'asc' | 'desc' }) {
  if (!active) return <ArrowUpDown className="size-3.5 opacity-40" />
  return dir === 'asc' ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />
}

export function StudentsPage() {
  const [filters, setFilters] = useState<StudentFilters>({ page: 1, page_size: 25 })
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null)
  const { data: studentsData, isLoading, isError } = useStudents(filters)
  const { data: classrooms } = useClassrooms(
    filters.grade_level ? { grade_level: filters.grade_level } : {},
  )
  const { data: todayAttendance } = useAttendance({
    date_from: todayISO(),
    date_to: todayISO(),
  })
  const { canManageUsers, isTeacher } = useAuth()
  const canManageStudents = canManageUsers
  const canEditAttendance = canManageUsers || isTeacher
  const columnCount = canManageStudents ? 9 : 7

  const students = studentsData?.items
  const total = studentsData?.total ?? 0
  const page = filters.page ?? 1
  const pageSize = filters.page_size ?? 25
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const attendanceByStudent = new Map(
    todayAttendance?.map((record) => [record.student_id, record]),
  )
  const presentToday = todayAttendance?.filter((r) => r.status === 'present').length ?? 0
  const absentTodayRecords = useMemo(
    () => todayAttendance?.filter((r) => r.status === 'absent') ?? [],
    [todayAttendance],
  )
  const sortedStudents = useMemo(() => {
    if (!students || !sort) return students
    const arr = [...students]
    arr.sort((a, b) => {
      let cmp = 0
      if (sort.key === 'name') {
        cmp = a.full_name.localeCompare(b.full_name, 'ar')
      } else if (sort.key === 'status') {
        cmp = a.status.localeCompare(b.status)
      } else {
        const aStatus = attendanceByStudent.get(a.id)?.status
        const bStatus = attendanceByStudent.get(b.id)?.status
        const aRank = aStatus ? ATTENDANCE_SORT_RANK[aStatus] : 4
        const bRank = bStatus ? ATTENDANCE_SORT_RANK[bStatus] : 4
        cmp = aRank - bRank
      }
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return arr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, sort, todayAttendance])

  const toggleSort = (key: SortKey) => {
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  const newThisMonth = useMemo(() => {
    const now = new Date()
    return (
      students?.filter((s) => {
        const created = new Date(s.created_at)
        return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth()
      }).length ?? 0
    )
  }, [students])

  const hasActiveFilters = Boolean(
    filters.search || filters.grade_level || filters.classroom_id || filters.status,
  )

  const resetFilters = () => {
    setFilters({ page: 1, page_size: pageSize })
  }

  const updateFilters = (patch: Partial<StudentFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch, page: 1 }))
  }

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(students?.map((s) => s.id) ?? []) : new Set())
  }

  const toggleSelect = (id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const onExport = async () => {
    const response = await apiClient.get(exportStudentsUrl(filters), {
      responseType: 'blob',
    })
    const url = window.URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.download = 'students.xlsx'
    link.click()
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">الطلاب</h1>
        {canManageStudents && (
          <div className="flex items-center gap-2">
            {absentTodayRecords.length > 0 && (
              <AbsentGuardiansDialog
                absentRecords={absentTodayRecords}
                trigger={
                  <Button
                    variant="outline"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <MessageCircle className="size-4" />
                    تنبيه الغائبين ({absentTodayRecords.length})
                  </Button>
                }
              />
            )}
            <Button variant="outline" onClick={onExport}>
              <Download className="size-4" />
              تصدير Excel
            </Button>
            <ImportStudentsDialog
              trigger={
                <Button variant="outline">
                  <Upload className="size-4" />
                  استيراد
                </Button>
              }
            />
            <StudentFormDialog
              trigger={
                <Button>
                  <Plus className="size-4" />
                  إضافة طالب
                </Button>
              }
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              إجمالي الطلاب
            </CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              الحاضرون اليوم
            </CardTitle>
            <CalendarCheck className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" dir="ltr">
              {presentToday} / {total || 0}
            </div>
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
            <div className="text-2xl font-bold">{newThisMonth}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="بحث بالاسم أو الرقم الوطني..."
          className="max-w-xs"
          value={filters.search ?? ''}
          onChange={(e) => updateFilters({ search: e.target.value || undefined })}
        />
        <Select
          value={filters.grade_level ?? 'all'}
          onValueChange={(value) =>
            updateFilters({
              grade_level: value === 'all' ? undefined : value,
              classroom_id: undefined,
            })
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="كل الصفوف" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الصفوف</SelectItem>
            {GRADE_LEVELS.map((grade) => (
              <SelectItem key={grade} value={grade}>
                {grade}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.classroom_id ? String(filters.classroom_id) : 'all'}
          onValueChange={(value) =>
            updateFilters({ classroom_id: value === 'all' ? undefined : Number(value) })
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue
              placeholder={filters.grade_level ? 'كل شعب هذا الصف' : 'كل الشعب'}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {filters.grade_level ? 'كل شعب هذا الصف' : 'كل الشعب'}
            </SelectItem>
            {classrooms?.map((classroom) => (
              <SelectItem key={classroom.id} value={String(classroom.id)}>
                {classroom.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.status ?? 'all'}
          onValueChange={(value) =>
            updateFilters({
              status: value === 'all' ? undefined : (value as StudentFilters['status']),
            })
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="كل الحالات" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            {Object.entries(STUDENT_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button variant="ghost" onClick={resetFilters}>
            <RotateCcw className="size-4" />
            إعادة ضبط الفلاتر
          </Button>
        )}
      </div>

      {canManageStudents && selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
          <span className="text-sm font-medium">تم تحديد {selectedIds.size} طالب</span>
          <BulkMoveDialog
            studentIds={[...selectedIds]}
            onDone={() => setSelectedIds(new Set())}
            trigger={<Button size="sm">نقل إلى صف/شعبة</Button>}
          />
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            إلغاء التحديد
          </Button>
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {canManageStudents && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      Boolean(students?.length) && selectedIds.size === students?.length
                    }
                    onCheckedChange={(checked) => toggleSelectAll(Boolean(checked))}
                  />
                </TableHead>
              )}
              <TableHead>
                <button
                  type="button"
                  onClick={() => toggleSort('name')}
                  className="flex items-center gap-1 hover:text-foreground/80"
                >
                  الاسم الكامل
                  <SortIcon active={sort?.key === 'name'} dir={sort?.key === 'name' ? sort.dir : undefined} />
                </button>
              </TableHead>
              <TableHead>الرقم الوطني</TableHead>
              <TableHead>الصف</TableHead>
              <TableHead>الشعبة</TableHead>
              <TableHead>هاتف ولي الأمر</TableHead>
              <TableHead>
                <button
                  type="button"
                  onClick={() => toggleSort('status')}
                  className="flex items-center gap-1 hover:text-foreground/80"
                >
                  الحالة
                  <SortIcon active={sort?.key === 'status'} dir={sort?.key === 'status' ? sort.dir : undefined} />
                </button>
              </TableHead>
              <TableHead>
                <button
                  type="button"
                  onClick={() => toggleSort('attendance')}
                  className="flex items-center gap-1 hover:text-foreground/80"
                >
                  الحضور اليوم
                  <SortIcon
                    active={sort?.key === 'attendance'}
                    dir={sort?.key === 'attendance' ? sort.dir : undefined}
                  />
                </button>
              </TableHead>
              {canManageStudents && <TableHead>إجراءات</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: columnCount }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {isError && (
              <TableRow>
                <TableCell colSpan={columnCount} className="text-center text-destructive">
                  تعذّر الاتصال بالخادم. تأكد من تشغيل الواجهة الخلفية (backend).
                </TableCell>
              </TableRow>
            )}
            {!isLoading && sortedStudents?.length === 0 && (
              <TableRow>
                <TableCell colSpan={columnCount}>
                  <div className="flex flex-col items-center gap-3 py-8 text-center">
                    <Search className="size-8 text-muted-foreground" />
                    <p className="text-muted-foreground">لا يوجد طلاب مطابقون.</p>
                    {hasActiveFilters && (
                      <Button variant="outline" size="sm" onClick={resetFilters}>
                        <RotateCcw className="size-4" />
                        إعادة ضبط الفلاتر
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
            {sortedStudents?.map((student) => {
              const attendanceStatus = attendanceByStudent.get(student.id)?.status
              return (
              <TableRow
                key={student.id}
                className={cn(
                  attendanceStatus === 'absent' && 'bg-destructive/5 hover:bg-destructive/10',
                  attendanceStatus === 'late' && 'bg-amber-500/5 hover:bg-amber-500/10',
                )}
              >
                {canManageStudents && (
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(student.id)}
                      onCheckedChange={(checked) =>
                        toggleSelect(student.id, Boolean(checked))
                      }
                    />
                  </TableCell>
                )}
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <StudentAvatar fullName={student.full_name} />
                    {student.full_name}
                  </div>
                </TableCell>
                <TableCell>{student.national_id}</TableCell>
                <TableCell>{student.grade_level}</TableCell>
                <TableCell>{student.class_name ?? '—'}</TableCell>
                <TableCell>
                  <GuardianContact student={student} record={attendanceByStudent.get(student.id)} />
                </TableCell>
                <TableCell>
                  <Badge variant={student.status === 'active' ? 'default' : 'secondary'}>
                    {STUDENT_STATUS_LABELS[student.status] ?? student.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <AttendanceCell
                    student={student}
                    record={attendanceByStudent.get(student.id)}
                    canEdit={canEditAttendance}
                  />
                </TableCell>
                {canManageStudents && (
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <StudentFormDialog
                        student={student}
                        trigger={
                          <Button variant="ghost" size="icon">
                            <Pencil className="size-4" />
                          </Button>
                        }
                      />
                      <DeleteStudentDialog student={student} />
                      <StudentActionsMenu student={student} />
                    </div>
                  </TableCell>
                )}
              </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {total > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>عرض</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) =>
                setFilters((prev) => ({ ...prev, page_size: Number(value), page: 1 }))
              }
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>
              من {total} طالب — صفحة {page} من {totalPages}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              disabled={page <= 1}
              onClick={() => setFilters((prev) => ({ ...prev, page: page - 1 }))}
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={page >= totalPages}
              onClick={() => setFilters((prev) => ({ ...prev, page: page + 1 }))}
            >
              <ChevronLeft className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
