import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { GRADE_LEVELS, TEACHER_STATUS_LABELS } from '@/lib/constants'
import { useSubjects } from '@/api/subjects'
import {
  useCreateTeacher,
  useUpdateTeacher,
  type Teacher,
  type TeacherInput,
  type TeacherStatus,
} from '@/api/teachers'

const emptyForm: TeacherInput = {
  full_name: '',
  email: '',
  phone: '',
  subject_ids: [],
  grade_levels: [],
  max_periods_per_week: 24,
}

export function TeacherFormDialog({
  teacher,
  trigger,
}: {
  teacher?: Teacher
  trigger: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<TeacherInput>(emptyForm)
  const [teacherStatus, setTeacherStatus] = useState<TeacherStatus>('active')
  const { data: subjects } = useSubjects()
  const createTeacher = useCreateTeacher()
  const updateTeacher = useUpdateTeacher()
  const isEditing = Boolean(teacher)
  const isPending = createTeacher.isPending || updateTeacher.isPending

  useEffect(() => {
    if (open) {
      setForm(
        teacher
          ? {
              full_name: teacher.full_name,
              email: teacher.email,
              phone: teacher.phone,
              subject_ids: teacher.subject_ids,
              grade_levels: teacher.grade_levels,
              max_periods_per_week: teacher.max_periods_per_week,
            }
          : emptyForm,
      )
      setTeacherStatus(teacher?.status ?? 'active')
    }
  }, [open, teacher])

  const toggleSubject = (subjectId: number) => {
    setForm((prev) => ({
      ...prev,
      subject_ids: prev.subject_ids.includes(subjectId)
        ? prev.subject_ids.filter((id) => id !== subjectId)
        : [...prev.subject_ids, subjectId],
    }))
  }

  const toggleGrade = (gradeLevel: string) => {
    setForm((prev) => ({
      ...prev,
      grade_levels: prev.grade_levels.includes(gradeLevel)
        ? prev.grade_levels.filter((g) => g !== gradeLevel)
        : [...prev.grade_levels, gradeLevel],
    }))
  }

  const onSubmit = async () => {
    try {
      if (isEditing && teacher) {
        await updateTeacher.mutateAsync({
          id: teacher.id,
          ...form,
          status: teacherStatus,
        })
        toast.success('تم تحديث بيانات المعلم')
      } else {
        await createTeacher.mutateAsync(form)
        toast.success('تمت إضافة المعلم بنجاح')
      }
      setOpen(false)
    } catch {
      toast.error('حدث خطأ، تحقق من البيانات المدخلة')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'تعديل بيانات المعلم' : 'إضافة معلم جديد'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="t_full_name">الاسم الكامل</Label>
            <Input
              id="t_full_name"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="t_email">البريد الإلكتروني</Label>
            <Input
              id="t_email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="t_phone">الهاتف</Label>
            <Input
              id="t_phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>المواد التي يدرّسها</Label>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-3">
              {subjects?.length === 0 && (
                <p className="text-sm text-muted-foreground">لا توجد مواد بعد.</p>
              )}
              {subjects?.map((subject) => (
                <label
                  key={subject.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-normal hover:bg-muted"
                >
                  <Checkbox
                    checked={form.subject_ids.includes(subject.id)}
                    onCheckedChange={() => toggleSubject(subject.id)}
                  />
                  {subject.name}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>الصفوف التي يدرّسها</Label>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-3">
              {GRADE_LEVELS.map((grade) => (
                <label
                  key={grade}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-normal hover:bg-muted"
                >
                  <Checkbox
                    checked={form.grade_levels.includes(grade)}
                    onCheckedChange={() => toggleGrade(grade)}
                  />
                  {grade}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              اتركه فارغًا للسماح للمعلم بالتدريس في أي صف عند التوليد التلقائي.
            </p>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="t_max_load">الحد الأقصى للحصص الأسبوعية</Label>
            <Input
              id="t_max_load"
              type="number"
              min={1}
              max={35}
              value={form.max_periods_per_week}
              onChange={(e) =>
                setForm({ ...form, max_periods_per_week: Number(e.target.value) || 0 })
              }
            />
          </div>
          {isEditing && (
            <div className="space-y-2 sm:col-span-2">
              <Label>الحالة</Label>
              <Select
                value={teacherStatus}
                onValueChange={(value) => setTeacherStatus(value as TeacherStatus)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TEACHER_STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={onSubmit} disabled={isPending}>
            {isPending ? 'جاري الحفظ...' : isEditing ? 'حفظ التعديلات' : 'إضافة'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
