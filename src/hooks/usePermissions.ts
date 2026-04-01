import { useQuery } from '@tanstack/react-query'
import { useAuthContext } from '../app/AuthContext'
import { supabase } from '../lib/supabase'

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
  const { role, profile, tenantId } = useAuthContext()

  const { data: permissionData } = useQuery({
    queryKey: ['permissions', tenantId, profile?.id],
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
    // Owner always has full access
    if (role === 'owner') return true

    if (!permissionData) return false
    const { defs, grants, overrides } = permissionData

    // 1. Check individual override (highest priority)
    const override = overrides.find((o: any) => o.permission_key === key)
    if (override) return override.is_granted

    // 2. Check role-level grant
    const effectiveRole = role === 'admin' ? 'company_director' : role
    const grant = grants.find((g: any) => g.role === effectiveRole && g.permission_key === key)
    if (grant) return grant.is_granted

    // 3. Fall back to definition defaults
    const def = defs.find((d: any) => d.key === key)
    if (def) {
      switch (effectiveRole) {
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

  // Check if user's role level is at or above a threshold
  const isAtLeast = (minRole: string): boolean => {
    const userLevel = ROLE_LEVEL[role ?? ''] ?? 0
    const minLevel = ROLE_LEVEL[minRole] ?? 100
    return userLevel >= minLevel
  }

  return { canDo, isAtLeast, role, permissionsLoaded: !!permissionData }
}

// Simple hook for a single permission check
export function usePermission(key: string): boolean {
  const { canDo } = usePermissions()
  return canDo(key)
}
