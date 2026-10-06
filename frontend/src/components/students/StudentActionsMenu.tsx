import { useState } from 'react'
import { MoreHorizontal, IdCard, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { printStudentCard } from '@/lib/printStudentCard'
import { StudentProfileSheet } from './StudentProfileSheet'
import type { Student } from '@/api/students'

export function StudentActionsMenu({ student }: { student: Student }) {
  const [profileOpen, setProfileOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setProfileOpen(true)}>
            <UserRound className="size-4" />
            عرض الملف الشخصي
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => printStudentCard(student)}>
            <IdCard className="size-4" />
            طباعة بطاقة الطالب
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <StudentProfileSheet
        student={student}
        open={profileOpen}
        onOpenChange={setProfileOpen}
      />
    </>
  )
}
