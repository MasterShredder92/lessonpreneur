import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile, Teacher, AuthState } from '../lib/types'

interface MinimalSession {
  user: { id: string; email?: string }
}

export function useAuth(): AuthState & {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
} {
  const [session, setSession] = useState<MinimalSession | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [teacherRecord, setTeacherRecord] = useState<Teacher | null>(null)
  const [locationIds, setLocationIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadProfile = useCallback(async (userId: string) => {
    const MAX_RETRIES = 1
    const RETRY_DELAY = 1500

    try {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single()

          if (profileError) throw profileError

          if (profileData) {
            setProfile(profileData as Profile)

            // Fetch profile_locations and teacher record in parallel — eliminates
            // 2 sequential round trips on every login/auth refresh
            const [locResult, teacherResult] = await Promise.all([
              supabase
                .from('profile_locations')
                .select('location_id')
                .eq('profile_id', userId),
              supabase
                .from('teachers')
                .select('*')
                .eq('profile_id', userId)
                .eq('tenant_id', (profileData as Profile).tenant_id)
                .limit(1)
                .maybeSingle(),
            ])

            setLocationIds(locResult.data?.map((l) => l.location_id) ?? [])
            setTeacherRecord((teacherResult.data as Teacher) ?? null)
            return // Success — exit the retry loop
          }
        } catch (err) {
          if (attempt < MAX_RETRIES) {
            console.warn(`[Auth] Profile load attempt ${attempt + 1} failed, retrying...`, err)
            await new Promise(r => setTimeout(r, RETRY_DELAY))
          } else {
            console.error('[Auth] Profile load failed after retries:', err)
          }
        }
      }
      // All retries exhausted — profile stays null, isLoading will be set false by finally
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
          setTeacherRecord(null)
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

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id)
  }, [session, loadProfile])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Sign out failed:', error)
      // Still attempt cleanup and redirect — never leave user stuck
    }

    // Clear React state
    setProfile(null)
    setTeacherRecord(null)
    setLocationIds([])

    // Clear LP-prefixed keys from localStorage + sessionStorage
    try {
      const clearLpKeys = (storage: Storage) => {
        const toRemove: string[] = []
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i)
          if (k && /^lp[-_]/i.test(k)) toRemove.push(k)
        }
        toRemove.forEach(k => storage.removeItem(k))
      }
      clearLpKeys(localStorage)
      clearLpKeys(sessionStorage)
    } catch (err) {
      console.error('signOut storage cleanup failed:', err)
    }

    // Clear SW cache so next login gets fresh assets
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' })
      }
    } catch (_) { /* ignore */ }

    // Hard redirect to /login — resets all in-memory React state
    window.location.href = '/login'
  }

  return {
    user: session?.user ? { id: session.user.id, email: session.user.email ?? '' } : null,
    profile,
    teacherRecord,
    locationIds,
    isLoading,
    signIn,
    signOut,
    refreshProfile,
  }
}
