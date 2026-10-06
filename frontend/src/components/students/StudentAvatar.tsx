import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getInitials } from '@/lib/initials'

export function StudentAvatar({ fullName }: { fullName: string }) {
  return (
    <Avatar className="size-8">
      <AvatarFallback className="text-xs">{getInitials(fullName)}</AvatarFallback>
    </Avatar>
  )
}
