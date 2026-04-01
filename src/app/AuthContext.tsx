import { createContext, useContext, type ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'
import type { Profile, UserRole } from '../lib/types'

interface AuthContextValue {
  user: { id: string; email: string } | null
  profile: Profile | null
  role: UserRole | null
  tenantId: string | null
  locationIds: string[]
  isLoading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()

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
