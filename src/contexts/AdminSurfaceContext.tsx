import { createContext, useContext } from 'react'
import type { ZiroOperatingSurfaceKey } from '../lib/ziro/pageSurfaceRegistry'

export type AdminSurfaceKey = Exclude<ZiroOperatingSurfaceKey, 'unknown'>

export type AdminSurfaceContextValue = {
  surface: AdminSurfaceKey
  setSurface: (s: AdminSurfaceKey) => void
  /** Synthetic pathname used by legacy surface/agent resolvers. */
  virtualPathname: string
}

const AdminSurfaceCtx = createContext<AdminSurfaceContextValue | null>(null)

export function AdminSurfaceProvider(props: { value: AdminSurfaceContextValue; children: React.ReactNode }) {
  return <AdminSurfaceCtx.Provider value={props.value}>{props.children}</AdminSurfaceCtx.Provider>
}

export function useAdminSurface(): AdminSurfaceContextValue {
  const ctx = useContext(AdminSurfaceCtx)
  if (!ctx) throw new Error('useAdminSurface must be used within AdminSurfaceProvider')
  return ctx
}

export function surfaceToVirtualPathname(surface: AdminSurfaceKey): string {
  if (surface === 'dashboard') return '/admin'
  if (surface === 'ziro_insights') return '/admin/ziro-insights'
  if (surface === 'skills_standalone') return '/admin/skills'
  return `/admin/${surface}`
}

export function adminPathToSurface(pathname: string): AdminSurfaceKey | null {
  if (!pathname.startsWith('/admin')) return null
  const cleaned = pathname.replace(/\/+$/, '')
  if (cleaned === '/admin' || cleaned === '/admin/dashboard') return 'dashboard'
  const seg = cleaned.replace(/^\/admin\/?/, '').split('/')[0] || ''
  if (!seg) return 'dashboard'
  if (seg === 'ziro-insights') return 'ziro_insights'
  if (seg === 'skills') return 'skills_standalone'
  // Accept any known keys used elsewhere; unknown strings fall back to dashboard.
  return seg as AdminSurfaceKey
}

