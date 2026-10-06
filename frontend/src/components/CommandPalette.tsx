import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  UserRound,
  School,
  ShieldCheck,
  ScrollText,
  Plus,
} from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { useAuth } from '@/lib/auth'
import { useStudents } from '@/api/students'
import { useTeachers } from '@/api/teachers'

export function useCommandPaletteState() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return { open, setOpen }
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const { isParent, canManageUsers, isAdmin } = useAuth()
  const { data: students } = useStudents({ page_size: 50 })
  const { data: teachers } = useTeachers()

  const go = (path: string) => {
    navigate(path)
    onOpenChange(false)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="البحث السريع"
      description="ابحث عن طالب أو معلم أو انتقل لأي صفحة"
    >
      <CommandInput placeholder="اكتب للبحث أو التنقل..." />
      <CommandList>
        <CommandEmpty>لا توجد نتائج.</CommandEmpty>
        <CommandGroup heading="إجراءات سريعة">
          {!isParent && (
            <CommandItem onSelect={() => go('/students')}>
              <Plus />
              إضافة طالب جديد
            </CommandItem>
          )}
        </CommandGroup>
        <CommandGroup heading="التنقل">
          <CommandItem onSelect={() => go('/')}>
            <LayoutDashboard />
            لوحة التحكم
          </CommandItem>
          <CommandItem onSelect={() => go('/students')}>
            <Users />
            {isParent ? 'أبنائي' : 'الطلاب'}
          </CommandItem>
          {!isParent && (
            <CommandItem onSelect={() => go('/teachers')}>
              <UserRound />
              المعلمون
            </CommandItem>
          )}
          {!isParent && (
            <CommandItem onSelect={() => go('/classes')}>
              <School />
              الشعب الدراسية
            </CommandItem>
          )}
          {canManageUsers && (
            <CommandItem onSelect={() => go('/users')}>
              <ShieldCheck />
              المستخدمون
            </CommandItem>
          )}
          {(isAdmin || canManageUsers) && (
            <CommandItem onSelect={() => go('/audit-log')}>
              <ScrollText />
              سجل النشاطات
            </CommandItem>
          )}
        </CommandGroup>
        {students?.items && students.items.length > 0 && (
          <CommandGroup heading="الطلاب">
            {students.items.map((student) => (
              <CommandItem key={student.id} onSelect={() => go('/students')}>
                <Users />
                {student.full_name} — {student.grade_level}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {!isParent && teachers && teachers.length > 0 && (
          <CommandGroup heading="المعلمون">
            {teachers.map((teacher) => (
              <CommandItem key={teacher.id} onSelect={() => go('/teachers')}>
                <UserRound />
                {teacher.full_name} — {teacher.email}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
