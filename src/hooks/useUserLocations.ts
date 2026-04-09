import { useQuery } from '@tanstack/react-query'
import { useAuthContext } from '../app/AuthContext'
import { supabase } from '../lib/supabase'
import { qk } from '../lib/queryKeys'

/**
 * Returns the location IDs the current user has access to.
 * - Owner/admin: returns null (means "all locations")
 * - Director with limited locations: returns their location IDs
 */
export function useUserLocations() {
  const { profile, role } = useAuthContext()

  return useQuery({
    queryKey: [...qk.locations.user, profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      // Owners and admins always see everything
      if (role === 'owner' || role === 'admin') return null

      const { data } = await supabase
        .from('profile_locations')
        .select('location_id')
        .eq('profile_id', profile!.id)

      if (!data || data.length === 0) return null // no restrictions if no entries
      if (data.length >= 4) return null // all 4 locations = treat as owner

      return data.map((d: any) => d.location_id as string)
    },
    staleTime: 1000 * 60 * 5,
  })
}
