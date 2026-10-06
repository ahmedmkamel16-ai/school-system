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
import { FinancialDashboard } from '@/pages/FinancialDashboard'
import { MyFinancesPage } from '@/pages/MyFinancesPage'
import { StatementPage } from '@/pages/StatementPage'
import { VerifyReceiptPage } from '@/pages/VerifyReceiptPage'
import { GuardianDashboard } from '@/pages/guardian/GuardianDashboard'
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

function RequireFinance({ children }: { children: ReactNode }) {
  const { isLoadingUser, isTeacher, canManageUsers, isParent, isAccountant } = useAuth()
  if (isLoadingUser) return null
  if (!(canManageUsers || isAccountant || isParent) || (isTeacher && !canManageUsers)) return <Navigate to="/" replace />
  return <>{children}</>
}

function RequireParent({ children }: { children: ReactNode }) {
  const { isParent, isLoadingUser } = useAuth()
  if (isLoadingUser) return null
  if (!isParent) return <Navigate to="/" replace />
  return <>{children}</>
}

/** ولي الأمر يهبط على صفحته المتكاملة؛ بقية الأدوار على لوحة التحكم. */
function Home() {
  const { isParent, isLoadingUser } = useAuth()
  if (isLoadingUser) return null
  return isParent ? <Navigate to="/guardian" replace /> : <DashboardPage />
}

function FinancialsHome() {
  const { isParent } = useAuth()
  return isParent ? <MyFinancesPage /> : <FinancialDashboard />
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/verify-receipt" element={<VerifyReceiptPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Home />} />
        <Route
          path="/guardian"
          element={
            <RequireParent>
              <GuardianDashboard />
            </RequireParent>
          }
        />
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
          path="/financials"
          element={
            <RequireFinance>
              <FinancialsHome />
            </RequireFinance>
          }
        />
        <Route
          path="/financials/students/:studentId"
          element={
            <RequireFinance>
              <StatementPage />
            </RequireFinance>
          }
        />
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
