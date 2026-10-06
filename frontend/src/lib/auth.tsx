import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useCurrentUser, type CurrentUser } from '@/api/auth'

interface AuthContextValue {
  token: string | null
  user: CurrentUser | undefined
  isLoadingUser: boolean
  login: (token: string) => void
  logout: () => void
  isAdmin: boolean
  canManageUsers: boolean
  isTeacher: boolean
  isParent: boolean
  isAccountant: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('access_token'),
  )
  const queryClient = useQueryClient()
  const { data: user, isLoading: isLoadingUser, isError } = useCurrentUser(Boolean(token))

  useEffect(() => {
    if (isError && token) {
      localStorage.removeItem('access_token')
      setToken(null)
    }
  }, [isError, token])

  const login = (newToken: string) => {
    localStorage.setItem('access_token', newToken)
    setToken(newToken)
  }

  const logout = () => {
    localStorage.removeItem('access_token')
    setToken(null)
    queryClient.clear()
  }

  const isAdmin = user?.role === 'admin'
  const canManageUsers = isAdmin || Boolean(user?.can_manage_users)

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isLoadingUser,
        login,
        logout,
        isAdmin,
        canManageUsers,
        isTeacher: user?.role === 'teacher',
        isParent: user?.role === 'parent',
        isAccountant: user?.role === 'accountant',
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
