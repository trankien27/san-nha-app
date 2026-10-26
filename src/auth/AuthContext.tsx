import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { refreshSession, setAccessToken, setAuthExpiredHandler } from '@/lib/api'
import * as api from '@/lib/endpoints'
import type { AppRole, UserSession } from '@/lib/types'

interface AuthState {
  user: UserSession | null
  /** Đang thử khôi phục phiên đăng nhập cũ bằng refresh cookie khi mở app. */
  restoring: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  updateUser: (user: UserSession) => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null)
  const [restoring, setRestoring] = useState(true)

  useEffect(() => {
    setAuthExpiredHandler(() => { setAccessToken(null); setUser(null) })
    refreshSession().then((result) => setUser(result.user)).catch(() => setUser(null)).finally(() => setRestoring(false))
    return () => setAuthExpiredHandler(null)
  }, [])

  const login = useCallback(async (email: string, password: string) => setUser(await api.login(email, password)), [])
  const logout = useCallback(async () => {
    try { await api.logout() } finally { setUser(null) }
  }, [])

  const value = useMemo(() => ({ user, restoring, login, logout, updateUser: setUser }), [user, restoring, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth phải nằm trong AuthProvider.')
  return context
}

/** Quyền theo vai trò, khớp với phân quyền phía server. */
export function usePermissions() {
  const roles = useAuth().user?.roles ?? []
  const has = (...wanted: AppRole[]) => wanted.some((role) => roles.includes(role))
  return {
    canManage: has('ADMIN', 'ORGANIZER'),
    canBill: has('ADMIN', 'TREASURER'),
    isPlayerOnly: roles.length > 0 && roles.every((role) => role === 'PLAYER'),
  }
}

export const roleLabels: Record<AppRole, string> = { ADMIN: 'Quản trị', ORGANIZER: 'Hỗ trợ', TREASURER: 'Kế toán', PLAYER: 'Người chơi' }
