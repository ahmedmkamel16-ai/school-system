import { Plus, Pencil } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ROLE_LABELS } from '@/lib/constants'
import { useAuth } from '@/lib/auth'
import { useUsers, useUpdateUser } from '@/api/users'
import { useTeachers } from '@/api/teachers'
import { UserFormDialog } from '@/components/users/UserFormDialog'

export function UsersPage() {
  const { data: users, isLoading, isError } = useUsers()
  const { data: teachers } = useTeachers()
  const { isAdmin, user: currentUser } = useAuth()
  const updateUser = useUpdateUser()
  const columnCount = isAdmin ? 7 : 6

  const teacherName = (teacherId: number | null) =>
    teachers?.find((teacher) => teacher.id === teacherId)?.full_name ?? '—'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">المستخدمون</h1>
        <UserFormDialog
          trigger={
            <Button>
              <Plus className="size-4" />
              إضافة مستخدم
            </Button>
          }
        />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الاسم الكامل</TableHead>
              <TableHead>البريد الإلكتروني</TableHead>
              <TableHead>الدور</TableHead>
              <TableHead>ملف المعلم المرتبط</TableHead>
              <TableHead>نشط</TableHead>
              {isAdmin && <TableHead>يدير المستخدمين</TableHead>}
              <TableHead>إجراءات</TableHead>
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
            {users?.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.full_name}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{ROLE_LABELS[u.role] ?? u.role}</Badge>
                </TableCell>
                <TableCell>
                  {u.role === 'teacher' ? teacherName(u.teacher_id) : '—'}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={u.is_active}
                    disabled={u.id === currentUser?.id}
                    onCheckedChange={(checked) =>
                      updateUser.mutate({ id: u.id, is_active: checked })
                    }
                  />
                </TableCell>
                {isAdmin && (
                  <TableCell>
                    <Switch
                      checked={u.can_manage_users}
                      disabled={u.role === 'admin'}
                      onCheckedChange={(checked) =>
                        updateUser.mutate({ id: u.id, can_manage_users: checked })
                      }
                    />
                  </TableCell>
                )}
                <TableCell>
                  <UserFormDialog
                    user={u}
                    trigger={
                      <Button variant="ghost" size="icon">
                        <Pencil className="size-4" />
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
