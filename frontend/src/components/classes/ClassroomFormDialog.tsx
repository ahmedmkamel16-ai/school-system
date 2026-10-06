import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
import { GRADE_LEVELS } from '@/lib/constants'
import { useTeachers } from '@/api/teachers'
import {
  useCreateClassroom,
  useUpdateClassroom,
  type ClassRoom,
  type ClassRoomInput,
} from '@/api/classrooms'

const emptyForm: ClassRoomInput = {
  name: '',
  grade_level: '',
  academic_year: '',
  homeroom_teacher_id: null,
}

export function ClassroomFormDialog({
  classroom,
  trigger,
}: {
  classroom?: ClassRoom
  trigger: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<ClassRoomInput>(emptyForm)
  const { data: teachers } = useTeachers()
  const createClassroom = useCreateClassroom()
  const updateClassroom = useUpdateClassroom()
  const isEditing = Boolean(classroom)
  const isPending = createClassroom.isPending || updateClassroom.isPending

  useEffect(() => {
    if (open) {
      setForm(
        classroom
          ? {
              name: classroom.name,
              grade_level: classroom.grade_level,
              academic_year: classroom.academic_year,
              homeroom_teacher_id: classroom.homeroom_teacher_id,
            }
          : emptyForm,
      )
    }
  }, [open, classroom])

  const onSubmit = async () => {
    try {
      if (isEditing && classroom) {
        await updateClassroom.mutateAsync({ id: classroom.id, ...form })
        toast.success('تم تحديث بيانات الشعبة')
      } else {
        await createClassroom.mutateAsync(form)
        toast.success('تمت إضافة الشعبة بنجاح')
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
          <DialogTitle>{isEditing ? 'تعديل بيانات الشعبة' : 'إضافة شعبة دراسية جديدة'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="c_name">اسم الشعبة</Label>
            <Input
              id="c_name"
              placeholder="مثال: السادس أ"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>الصف الدراسي</Label>
            <Select
              value={form.grade_level}
              onValueChange={(value) => setForm({ ...form, grade_level: value })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="اختر الصف" />
              </SelectTrigger>
              <SelectContent>
                {GRADE_LEVELS.map((grade) => (
                  <SelectItem key={grade} value={grade}>
                    {grade}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="c_year">العام الدراسي</Label>
            <Input
              id="c_year"
              placeholder="مثال: 2026-2027"
              value={form.academic_year}
              onChange={(e) => setForm({ ...form, academic_year: e.target.value })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>معلم الشعبة (اختياري)</Label>
            <Select
              value={
                form.homeroom_teacher_id ? String(form.homeroom_teacher_id) : ''
              }
              onValueChange={(value) =>
                setForm({ ...form, homeroom_teacher_id: Number(value) })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="بدون معلم محدد" />
              </SelectTrigger>
              <SelectContent>
                {teachers?.map((teacher) => (
                  <SelectItem key={teacher.id} value={String(teacher.id)}>
                    {teacher.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
