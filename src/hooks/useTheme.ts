import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { useEffect } from 'react'

export interface ThemeData {
  primaryColor: string
  studioName: string
  logoUrl: string | null
}

const DEFAULT_THEME: ThemeData = {
  primaryColor: '#f59e0b',
  studioName: 'Lessonpreneur',
  logoUrl: null,
}

export function useTheme() {
  const { tenantId, locationIds, role } = useAuthContext()
  // Owners/admins see tenant-level branding; single-location users see their location's branding
  const isMultiLocation = role === 'owner' || role === 'admin' || role === 'company_director' || (locationIds?.length ?? 0) > 1
  const locationId = isMultiLocation ? null : (locationIds?.[0] ?? null)

  const { data: theme } = useQuery<ThemeData>({
    queryKey: ['theme', tenantId, locationId],
    enabled: !!tenantId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      // Try location-specific brand settings first (only for single-location users)
      let brand = null
      if (locationId) {
        const { data } = await supabase
          .from('brand_settings')
          .select('primary_color, studio_name, logo_circle_path')
          .eq('location_id', locationId)
          .single()
        brand = data
      }

      // Fallback: tenant-level brand settings
      if (!brand) {
        const { data } = await supabase
          .from('brand_settings')
          .select('primary_color, studio_name, logo_circle_path')
          .eq('tenant_id', tenantId!)
          .is('location_id', null)
          .limit(1)
          .single()
        brand = data
      }

      // Final fallback: any brand settings for the tenant
      if (!brand) {
        const { data } = await supabase
          .from('brand_settings')
          .select('primary_color, studio_name, logo_circle_path')
          .eq('tenant_id', tenantId!)
          .limit(1)
          .single()
        brand = data
      }

      if (!brand) {
        // No brand_settings at all — read tenant name directly
        const { data: tenant } = await supabase
          .from('tenants')
          .select('name, logo_url')
          .eq('id', tenantId!)
          .single()
        if (tenant) {
          return {
            primaryColor: DEFAULT_THEME.primaryColor,
            studioName: tenant.name ?? DEFAULT_THEME.studioName,
            logoUrl: tenant.logo_url ?? null,
          }
        }
        return DEFAULT_THEME
      }

      const logoUrl = brand.logo_circle_path
        ? supabase.storage.from('brand-assets').getPublicUrl(brand.logo_circle_path).data.publicUrl
        : null

      return {
        primaryColor: brand.primary_color ?? DEFAULT_THEME.primaryColor,
        studioName: brand.studio_name ?? DEFAULT_THEME.studioName,
        logoUrl,
      }
    },
  })

  // Apply CSS custom properties
  useEffect(() => {
    const t = theme ?? DEFAULT_THEME
    document.documentElement.style.setProperty('--brand-primary', t.primaryColor)
    document.documentElement.style.setProperty('--brand-primary-light', t.primaryColor + '20')
    document.documentElement.style.setProperty('--brand-primary-glow', t.primaryColor + '40')
  }, [theme])

  return theme ?? DEFAULT_THEME
}
