import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { DashboardPage } from '@/pages/DashboardPage'
import { StudentsPage } from '@/pages/StudentsPage'
import { TeachersPage } from '@/pages/TeachersPage'
import { ClassesPage } from '@/pages/ClassesPage'
import { UsersPage } from '@/pages/UsersPage'
import { AuditLogPage } from '@/pages/AuditLogPage'
import { GradesPage } from '@/pages/GradesPage'
import { LoginPage } from '@/pages/LoginPage'
import { useAuth } from '@/lib/auth'

function RequireAuth({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireManageUsers({ children }: { children: ReactNode }) {
  const { canManageUsers, isLoadingUser } = useAuth()
  if (isLoadingUser) return null
  if (!canManageUsers) return <Navigate to="/" replace />
  return <>{children}</>
}

function RequireNotParent({ children }: { children: ReactNode }) {
  const { isParent, isLoadingUser } = useAuth()
  if (isLoadingUser) return null
  if (isParent) return <Navigate to="/" replace />
  return <>{children}</>
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="/students" element={<StudentsPage />} />
        <Route
          path="/teachers"
          element={
            <RequireNotParent>
              <TeachersPage />
            </RequireNotParent>
          }
        />
        <Route
          path="/classes"
          element={
            <RequireNotParent>
              <ClassesPage />
            </RequireNotParent>
          }
        />
        <Route path="/grades" element={<GradesPage />} />
        <Route
          path="/users"
          element={
            <RequireManageUsers>
              <UsersPage />
            </RequireManageUsers>
          }
        />
        <Route
          path="/audit-log"
          element={
            <RequireManageUsers>
              <AuditLogPage />
            </RequireManageUsers>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
