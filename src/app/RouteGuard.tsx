import { Navigate } from 'react-router-dom'
import MusicLoader from '../components/shared/MusicLoader'
import { useAuthContext } from './AuthContext'
import { ROLE_DEFAULT_ROUTES } from '../lib/constants'
import type { UserRole } from '../lib/types'

interface RouteGuardProps {
  allowedRoles: UserRole[]
  children: React.ReactNode
}

export function RouteGuard({ allowedRoles, children }: RouteGuardProps) {
  const { user, role, isLoading } = useAuthContext()

  if (isLoading) {
    return (
      <div className="loading-screen">
        <MusicLoader />
      </div>
    )
  }

  if (!user || !role) {
    return <Navigate to="/login" replace />
  }

  if (!allowedRoles.includes(role)) {
    return <Navigate to={ROLE_DEFAULT_ROUTES[role] ?? '/login'} replace />
  }

  return <>{children}</>
}
