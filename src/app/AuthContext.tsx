import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'
import { startPerformanceMonitoring } from '../lib/performance/monitor'
import type { Profile, Teacher, UserRole } from '../lib/types'

interface AuthContextValue {
  user: { id: string; email: string } | null
  profile: Profile | null
  teacherRecord: Teacher | null
  role: UserRole | null
  tenantId: string | null
  locationIds: string[]
  isLoading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const monitorStarted = useRef(false)

  // Start SPEED performance monitoring once tenant resolves
  useEffect(() => {
    const tenantId = auth.profile?.tenant_id
    if (tenantId && !monitorStarted.current) {
      monitorStarted.current = true
      startPerformanceMonitoring(tenantId)
    }
  }, [auth.profile?.tenant_id])

  return (
    <AuthContext.Provider
      value={{
        ...auth,
        role: auth.profile?.role ?? null,
        tenantId: auth.profile?.tenant_id ?? null,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider')
  return ctx
}
