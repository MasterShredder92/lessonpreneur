import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Fetches the tenant ID dynamically for public-facing pages
 * (landing pages, enrollment forms, pay invoice) that don't have auth context.
 */
export function usePublicTenantId(): string | null {
  const [tenantId, setTenantId] = useState<string | null>(null)
  useEffect(() => {
    supabase.from('tenants').select('id').limit(1).single().then(({ data }) => {
      if (data) setTenantId(data.id)
    })
  }, [])
  return tenantId
}
