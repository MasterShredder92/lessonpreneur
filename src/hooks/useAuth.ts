import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile, AuthState } from '../lib/types'

interface MinimalSession {
  user: { id: string; email?: string }
}

export function useAuth(): AuthState & {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
} {
  const [session, setSession] = useState<MinimalSession | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [locationIds, setLocationIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadProfile = useCallback(async (userId: string) => {
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (profileData) {
        setProfile(profileData as Profile)

        const { data: locData } = await supabase
          .from('profile_locations')
          .select('location_id')
          .eq('profile_id', userId)

        setLocationIds(locData?.map((l) => l.location_id) ?? [])
      }
    } catch (err) {
      console.error('Failed to load profile:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    // Single source of truth: onAuthStateChange handles everything
    // including the INITIAL_SESSION event on first load
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) return
        setSession(session)
        if (session?.user) {
          await loadProfile(session.user.id)
        } else {
          setProfile(null)
          setLocationIds([])
          setIsLoading(false)
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
    setLocationIds([])
    // Clear SW cache so next login gets fresh assets
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' })
    }
  }

  return {
    user: session?.user ? { id: session.user.id, email: session.user.email ?? '' } : null,
    profile,
    locationIds,
    isLoading,
    signIn,
    signOut,
  }
}
