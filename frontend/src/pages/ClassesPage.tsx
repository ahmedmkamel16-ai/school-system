import { useState } from 'react'
import { Plus, Pencil, CalendarDays, BookOpen, GraduationCap, Table2 } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { GRADE_LEVELS } from '@/lib/constants'
import { useAuth } from '@/lib/auth'
import { useClassrooms, type ClassRoomFilters } from '@/api/classrooms'
import { useTeachers } from '@/api/teachers'
import { ClassroomFormDialog } from '@/components/classes/ClassroomFormDialog'
import { DeleteClassroomDialog } from '@/components/classes/DeleteClassroomDialog'
import { ClassroomTimetableDialog } from '@/components/classes/ClassroomTimetableDialog'
import { SubjectsManagerDialog } from '@/components/classes/SubjectsManagerDialog'
import { CurriculumManagerDialog } from '@/components/classes/CurriculumManagerDialog'
import { GenerateTimetableDialog } from '@/components/classes/GenerateTimetableDialog'
import { MasterTimetableDialog } from '@/components/classes/MasterTimetableDialog'

export function ClassesPage() {
  const [filters, setFilters] = useState<ClassRoomFilters>({})
  const { data: classrooms, isLoading, isError } = useClassrooms(filters)
  const { data: teachers } = useTeachers()
  const { canManageUsers } = useAuth()
  const columnCount = canManageUsers ? 5 : 4

  const teacherName = (id: number | null) =>
    teachers?.find((teacher) => teacher.id === id)?.full_name ?? '—'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">الشعب الدراسية</h1>
        {canManageUsers && (
          <div className="flex items-center gap-2">
            <SubjectsManagerDialog
              trigger={
                <Button variant="outline">
                  <BookOpen className="size-4" />
                  إدارة المواد
                </Button>
              }
            />
            <CurriculumManagerDialog
              trigger={
                <Button variant="outline">
                  <GraduationCap className="size-4" />
                  إدارة المنهج
                </Button>
              }
            />
            <GenerateTimetableDialog />
            <MasterTimetableDialog
              trigger={
                <Button variant="outline">
                  <Table2 className="size-4" />
                  الجدول الكلي
                </Button>
              }
            />
            <ClassroomFormDialog
              trigger={
                <Button>
                  <Plus className="size-4" />
                  إضافة شعبة
                </Button>
              }
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="بحث باسم الشعبة..."
          className="max-w-xs"
          value={filters.search ?? ''}
          onChange={(e) =>
            setFilters({ ...filters, search: e.target.value || undefined })
          }
        />
        <Select
          value={filters.grade_level ?? 'all'}
          onValueChange={(value) =>
            setFilters({
              ...filters,
              grade_level: value === 'all' ? undefined : value,
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
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>اسم الشعبة</TableHead>
              <TableHead>الصف الدراسي</TableHead>
              <TableHead>العام الدراسي</TableHead>
              <TableHead>معلم الشعبة</TableHead>
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
            {classrooms?.length === 0 && (
              <TableRow>
                <TableCell colSpan={columnCount} className="text-center text-muted-foreground">
                  لا توجد شعب دراسية مطابقة.
                </TableCell>
              </TableRow>
            )}
            {classrooms?.map((classroom) => (
              <TableRow key={classroom.id}>
                <TableCell className="font-medium">{classroom.name}</TableCell>
                <TableCell>{classroom.grade_level}</TableCell>
                <TableCell>{classroom.academic_year}</TableCell>
                <TableCell>{teacherName(classroom.homeroom_teacher_id)}</TableCell>
                {canManageUsers && (
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <ClassroomFormDialog
                        classroom={classroom}
                        trigger={
                          <Button variant="ghost" size="icon">
                            <Pencil className="size-4" />
                          </Button>
                        }
                      />
                      <DeleteClassroomDialog classroom={classroom} />
                      <ClassroomTimetableDialog
                        classroomId={classroom.id}
                        classroomName={classroom.name}
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
