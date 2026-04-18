import type { AdminSurfaceKey } from '../../contexts/AdminSurfaceContext'
import { surfaceToVirtualPathname } from '../../contexts/AdminSurfaceContext'

type Listener = (surface: AdminSurfaceKey) => void

let current: AdminSurfaceKey = 'dashboard'
const listeners = new Set<Listener>()

export function getAdminSurface(): AdminSurfaceKey {
  return current
}

export function getAdminVirtualPathname(): string {
  return surfaceToVirtualPathname(current)
}

export function setAdminSurface(surface: AdminSurfaceKey): void {
  if (surface === current) return
  current = surface
  for (const l of listeners) l(surface)
}

export function subscribeAdminSurface(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

