import { useQuery } from '@tanstack/react-query'
import { useAuthContext } from '../app/AuthContext'
import { usePreviewMode } from './usePreviewMode'
import { supabase } from '../lib/supabase'
import { qk } from '../lib/queryKeys'

// Role hierarchy — higher number = more access
const ROLE_LEVEL: Record<string, number> = {
  owner: 100,
  admin: 80, // treated as company_director
  company_director: 80,
  studio_director: 60,
  teacher: 20,
  parent: 10,
  student: 5,
}

export function usePermissions() {
  const { role: actualRole, profile, tenantId, locationIds } = useAuthContext()
  const { preview } = usePreviewMode()

  // When preview is active, use the preview role for all checks
  const effectiveRole = (preview.active && preview.role) ? preview.role : actualRole

  const { data: permissionData } = useQuery({
    queryKey: [...qk.permissions.all, tenantId, profile?.id],
    enabled: !!tenantId && !!profile?.id,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    queryFn: async () => {
      // 1. Get all permission definitions
      const { data: defs } = await supabase
        .from('permission_definitions')
        .select('*')
        .eq('tenant_id', tenantId!)

      // 2. Get role-level grants
      const { data: grants } = await supabase
        .from('permission_set_grants')
        .select('*')
        .eq('tenant_id', tenantId!)

      // 3. Get individual overrides for this user
      const { data: overrides } = await supabase
        .from('profile_permission_overrides')
        .select('*')
        .eq('profile_id', profile!.id)

      return { defs: defs ?? [], grants: grants ?? [], overrides: overrides ?? [] }
    },
  })

  // Resolve a single permission
  const canDo = (key: string): boolean => {
    // Owner (real role) always has full access when NOT previewing
    if (effectiveRole === 'owner') return true

    if (!permissionData) return false
    const { defs, grants, overrides } = permissionData

    // When previewing, skip individual overrides — simulate the role cleanly
    if (!preview.active) {
      // 1. Check individual override (highest priority)
      const override = overrides.find((o: any) => o.permission_key === key)
      if (override) return override.is_granted
    }

    // 2. Check role-level grant
    const roleForGrant = effectiveRole === 'admin' ? 'company_director' : effectiveRole
    const grant = grants.find((g: any) => g.role === roleForGrant && g.permission_key === key)
    if (grant) return grant.is_granted

    // 3. Fall back to definition defaults
    const def = defs.find((d: any) => d.key === key)
    if (def) {
      switch (roleForGrant) {
        case 'company_director': return def.company_director_default ?? false
        case 'studio_director': return def.studio_director_default ?? false
        case 'teacher': return def.teacher_default ?? false
        case 'parent': return def.parent_default ?? false
        default: return false
      }
    }

    // 4. Deny by default
    return false
  }

  // Check if effective role level is at or above a threshold
  const isAtLeast = (minRole: string): boolean => {
    const userLevel = ROLE_LEVEL[effectiveRole ?? ''] ?? 0
    const minLevel = ROLE_LEVEL[minRole] ?? 100
    return userLevel >= minLevel
  }

  // Location scoping — in preview mode, scope to the preview location
  const isLocationScoped = effectiveRole === 'studio_director'
  const previewLocationIds = preview.active && preview.locationId ? [preview.locationId] : null
  const effectiveLocationIds = previewLocationIds ?? locationIds ?? []
  const canAccessLocation = (locationId: string) => {
    if (!isLocationScoped) return true // owner/company_director see all
    return effectiveLocationIds.includes(locationId)
  }

  // Convenience role checks — all based on effectiveRole
  const isOwner = effectiveRole === 'owner'
  const isCompanyDirector = effectiveRole === 'company_director' || effectiveRole === 'admin'
  const isStudioDirector = effectiveRole === 'studio_director'
  const isTeacher = effectiveRole === 'teacher'
  const isParent = effectiveRole === 'parent'

  // Teacher compensation + documents — owner, company_director, admin only
  const canViewTeacherCompensation = isOwner || isCompanyDirector
  const canViewTeacherDocuments = isOwner || isCompanyDirector

  return {
    canDo, isAtLeast,
    role: effectiveRole, // exposed role is always the effective one
    actualRole,          // real auth role for things like RouteGuard
    permissionsLoaded: !!permissionData,
    locationIds: effectiveLocationIds,
    isLocationScoped,
    canAccessLocation,
    isOwner, isCompanyDirector, isStudioDirector, isTeacher, isParent,
    isPreviewActive: preview.active,
    canViewTeacherCompensation,
    canViewTeacherDocuments,
  }
}

// Simple hook for a single permission check
export function usePermission(key: string): boolean {
  const { canDo } = usePermissions()
  return canDo(key)
}
