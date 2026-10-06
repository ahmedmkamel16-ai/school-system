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
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ROLE_LABELS } from '@/lib/constants'
import { useAuth } from '@/lib/auth'
import { useTeachers } from '@/api/teachers'
import {
  useCreateUser,
  useResetPassword,
  useUpdateUser,
  type UserCreateInput,
  type UserRecord,
} from '@/api/users'
import type { UserRole } from '@/api/auth'
import { PasswordField } from './PasswordField'

const emptyForm: UserCreateInput = {
  email: '',
  full_name: '',
  password: '',
  role: 'teacher',
  can_manage_users: false,
  teacher_id: null,
}

export function UserFormDialog({
  user,
  trigger,
}: {
  user?: UserRecord
  trigger: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<UserCreateInput>(emptyForm)
  const [resettingPassword, setResettingPassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const { isAdmin } = useAuth()
  const { data: teachers } = useTeachers()
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()
  const resetPassword = useResetPassword()
  const isEditing = Boolean(user)
  const isPending = createUser.isPending || updateUser.isPending || resetPassword.isPending

  useEffect(() => {
    if (open) {
      setResettingPassword(false)
      setNewPassword('')
      setForm(
        user
          ? {
              email: user.email,
              full_name: user.full_name,
              password: '',
              role: user.role,
              can_manage_users: user.can_manage_users,
              teacher_id: user.teacher_id,
            }
          : emptyForm,
      )
    }
  }, [open, user])

  const onSubmit = async () => {
    try {
      if (isEditing && user) {
        await updateUser.mutateAsync({
          id: user.id,
          full_name: form.full_name,
          role: form.role,
          teacher_id: form.role === 'teacher' ? form.teacher_id : null,
          ...(isAdmin ? { can_manage_users: form.can_manage_users } : {}),
        })
        if (resettingPassword && newPassword) {
          await resetPassword.mutateAsync({ id: user.id, password: newPassword })
        }
        toast.success('تم تحديث بيانات المستخدم')
      } else {
        await createUser.mutateAsync(form)
        toast.success('تم إنشاء الحساب بنجاح')
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
          <DialogTitle>{isEditing ? 'تعديل بيانات المستخدم' : 'إضافة حساب مستخدم جديد'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="u_full_name">الاسم الكامل</Label>
            <Input
              id="u_full_name"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>
          {!isEditing && (
            <>
              <div className="space-y-2">
                <Label htmlFor="u_email">البريد الإلكتروني</Label>
                <Input
                  id="u_email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <PasswordField
                id="u_password"
                label="كلمة المرور"
                value={form.password}
                onChange={(value) => setForm({ ...form, password: value })}
              />
            </>
          )}
          <div className="space-y-2">
            <Label>الدور</Label>
            <Select
              value={form.role}
              onValueChange={(value) =>
                setForm({ ...form, role: value as UserRole, teacher_id: null })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ROLE_LABELS)
                  .filter(([role]) => role !== 'admin' || isAdmin)
                  .map(([role, label]) => (
                    <SelectItem key={role} value={role}>
                      {label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {form.role === 'teacher' && (
            <div className="space-y-2">
              <Label>ربط بملف معلم</Label>
              <Select
                value={form.teacher_id ? String(form.teacher_id) : ''}
                onValueChange={(value) =>
                  setForm({ ...form, teacher_id: Number(value) })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="بدون ربط" />
                </SelectTrigger>
                <SelectContent>
                  {teachers?.map((teacher) => (
                    <SelectItem key={teacher.id} value={String(teacher.id)}>
                      {teacher.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                هذا الربط هو ما يحدد أي شعبة وطلاب يرى هذا المعلم — تأكد من اختيار ملف
                المعلم الصحيح.
              </p>
            </div>
          )}
          {isAdmin && (
            <div className="flex items-center justify-between gap-2 rounded-md border p-3 sm:col-span-2">
              <Label htmlFor="u_manage" className="cursor-pointer">
                صلاحية إدارة المستخدمين (إنشاء حسابات جديدة)
              </Label>
              <Switch
                id="u_manage"
                checked={form.can_manage_users}
                onCheckedChange={(checked) =>
                  setForm({ ...form, can_manage_users: checked })
                }
              />
            </div>
          )}
          {isEditing && (
            <div className="space-y-3 rounded-md border p-3 sm:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="u_reset" className="cursor-pointer">
                  إعادة تعيين كلمة المرور
                </Label>
                <Switch
                  id="u_reset"
                  checked={resettingPassword}
                  onCheckedChange={setResettingPassword}
                />
              </div>
              {resettingPassword && (
                <PasswordField
                  id="u_new_password"
                  label="كلمة المرور الجديدة"
                  value={newPassword}
                  onChange={setNewPassword}
                />
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={onSubmit}
            disabled={isPending || (resettingPassword && !newPassword)}
          >
            {isPending ? 'جاري الحفظ...' : isEditing ? 'حفظ التعديلات' : 'إضافة'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
