import { NavLink, Outlet } from 'react-router-dom'
import { useTheme } from 'next-themes'
import {
  GraduationCap,
  LayoutDashboard,
  Users,
  UserRound,
  School,
  ShieldCheck,
  ScrollText,
  ClipboardList,
  Wallet,
  LogOut,
  Moon,
  Sun,
  Search,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { ROLE_LABELS } from '@/lib/constants'
import { useAuth } from '@/lib/auth'
import { CommandPalette, useCommandPaletteState } from '@/components/CommandPalette'

export function AppLayout() {
  const { user, logout, isParent, canManageUsers, isAdmin, isAccountant } = useAuth()
  const { theme, setTheme } = useTheme()
  const commandPalette = useCommandPaletteState()

  const navItems = [
    { to: '/', label: 'لوحة التحكم', icon: LayoutDashboard },
    { to: '/students', label: isParent ? 'أبنائي' : 'الطلاب', icon: Users },
    ...(isParent ? [] : [{ to: '/teachers', label: 'المعلمون', icon: UserRound }]),
    ...(isParent ? [] : [{ to: '/classes', label: 'الشعب الدراسية', icon: School }]),
    { to: '/grades', label: isParent ? 'درجات أبنائي' : 'الدرجات', icon: ClipboardList },
    ...(canManageUsers || isAccountant || isParent
      ? [{ to: '/financials', label: isParent ? 'حسابات أبنائي' : 'الحسابات', icon: Wallet }]
      : []),
    ...(canManageUsers
      ? [{ to: '/users', label: 'المستخدمون', icon: ShieldCheck }]
      : []),
    ...(isAdmin || canManageUsers
      ? [{ to: '/audit-log', label: 'سجل النشاطات', icon: ScrollText }]
      : []),
  ]

  return (
    <SidebarProvider>
      <Sidebar side="right" collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <GraduationCap className="size-6 shrink-0 text-primary" />
            <span className="font-bold group-data-[collapsible=icon]:hidden">
              نظام إدارة المدرسة
            </span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>القوائم</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => commandPalette.setOpen(true)}>
                    <Search />
                    <span>بحث سريع</span>
                    <span className="mr-auto text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                      Ctrl+K
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.to}
                        end={item.to === '/'}
                        className={({ isActive }) =>
                          isActive ? 'font-semibold text-primary' : ''
                        }
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          {user && (
            <div className="px-2 py-1.5 text-sm group-data-[collapsible=icon]:hidden">
              <p className="font-medium">{user.full_name}</p>
              <p className="text-xs text-muted-foreground">
                {ROLE_LABELS[user.role] ?? user.role}
              </p>
            </div>
          )}
          <Button
            variant="ghost"
            className="justify-start gap-2"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            <span className="group-data-[collapsible=icon]:hidden">
              {theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}
            </span>
          </Button>
          <Button variant="ghost" className="justify-start gap-2" onClick={logout}>
            <LogOut className="size-4" />
            <span className="group-data-[collapsible=icon]:hidden">تسجيل الخروج</span>
          </Button>
        </SidebarFooter>
      </Sidebar>
      <main className="flex-1">
        <header className="flex items-center gap-2 border-b p-3">
          <SidebarTrigger />
          <span className="text-sm text-muted-foreground">
            {user ? `مرحبًا، ${user.full_name}` : 'مرحبًا بك'}
          </span>
        </header>
        <div className="p-6">
          <Outlet />
        </div>
      </main>
      <CommandPalette open={commandPalette.open} onOpenChange={commandPalette.setOpen} />
    </SidebarProvider>
  )
}
