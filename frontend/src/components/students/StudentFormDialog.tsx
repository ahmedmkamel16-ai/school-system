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
import { useClassrooms } from '@/api/classrooms'
import { useUsers } from '@/api/users'
import {
  useCreateStudent,
  useUpdateStudent,
  type Student,
  type StudentInput,
} from '@/api/students'

const emptyForm: StudentInput = {
  full_name: '',
  national_id: '',
  birth_date: '',
  grade_level: '',
  address: null,
  guardian_name: '',
  guardian_phone: '',
  classroom_id: null,
  guardian_user_id: null,
}

export function StudentFormDialog({
  student,
  trigger,
}: {
  student?: Student
  trigger: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<StudentInput>(emptyForm)
  const { data: classrooms } = useClassrooms(
    form.grade_level ? { grade_level: form.grade_level } : {},
  )
  const { data: users } = useUsers()
  const parents = users?.filter((u) => u.role === 'parent')
  const createStudent = useCreateStudent()
  const updateStudent = useUpdateStudent()
  const isEditing = Boolean(student)
  const isPending = createStudent.isPending || updateStudent.isPending

  useEffect(() => {
    if (open) {
      setForm(
        student
          ? {
              full_name: student.full_name,
              national_id: student.national_id,
              birth_date: student.birth_date,
              grade_level: student.grade_level,
              address: student.address,
              guardian_name: student.guardian_name,
              guardian_phone: student.guardian_phone,
              classroom_id: student.classroom_id,
              guardian_user_id: student.guardian_user_id,
            }
          : emptyForm,
      )
    }
  }, [open, student])

  const onSubmit = async () => {
    try {
      if (isEditing && student) {
        await updateStudent.mutateAsync({ id: student.id, ...form })
        toast.success('تم تحديث بيانات الطالب')
      } else {
        await createStudent.mutateAsync(form)
        toast.success('تمت إضافة الطالب بنجاح')
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
          <DialogTitle>{isEditing ? 'تعديل بيانات الطالب' : 'إضافة طالب جديد'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="full_name">الاسم الكامل</Label>
            <Input
              id="full_name"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="national_id">الرقم الوطني</Label>
            <Input
              id="national_id"
              value={form.national_id}
              disabled={isEditing}
              onChange={(e) => setForm({ ...form, national_id: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="birth_date">تاريخ الميلاد</Label>
            <Input
              id="birth_date"
              type="date"
              value={form.birth_date}
              onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>الصف الدراسي</Label>
            <Select
              value={form.grade_level}
              onValueChange={(value) =>
                setForm({ ...form, grade_level: value, classroom_id: null })
              }
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
            <Label>الشعبة</Label>
            <Select
              value={form.classroom_id ? String(form.classroom_id) : ''}
              disabled={!form.grade_level}
              onValueChange={(value) =>
                setForm({ ...form, classroom_id: Number(value) })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={form.grade_level ? 'بدون شعبة محددة' : 'اختر الصف أولاً'}
                />
              </SelectTrigger>
              <SelectContent>
                {classrooms?.map((classroom) => (
                  <SelectItem key={classroom.id} value={String(classroom.id)}>
                    {classroom.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="address">العنوان</Label>
            <Input
              id="address"
              value={form.address ?? ''}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="guardian_name">اسم ولي الأمر</Label>
            <Input
              id="guardian_name"
              value={form.guardian_name}
              onChange={(e) => setForm({ ...form, guardian_name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="guardian_phone">هاتف ولي الأمر</Label>
            <Input
              id="guardian_phone"
              value={form.guardian_phone}
              onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>ربط بحساب ولي الأمر (اختياري)</Label>
            <Select
              value={form.guardian_user_id ? String(form.guardian_user_id) : ''}
              onValueChange={(value) =>
                setForm({ ...form, guardian_user_id: Number(value) })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="بدون ربط بحساب" />
              </SelectTrigger>
              <SelectContent>
                {parents?.map((parent) => (
                  <SelectItem key={parent.id} value={String(parent.id)}>
                    {parent.full_name} ({parent.email})
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
