/**
 * useTeacherOverview — lightweight teacher list hook.
 *
 * Replaces the heavy useTeachers() on the overview page. Fetches only the
 * fields needed for a card view (no bio, no compensation, no compliance docs).
 * All sub-queries run in parallel via Promise.all to eliminate sequential
 * waterfall latency. Overview data is cached for 2 minutes.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { qk } from '../lib/queryKeys'

export interface TeacherOverview {
  id: string
  first_name: string
  last_name: string
  email: string | null
  photo_url: string | null
  is_active: boolean
  status: string
  instruments: string[]
  teacher_role: string | null
  is_sub_available: boolean
  student_count: number
  blocks_this_week: number
  location_ids: string[]
  location_names: string[]
  location_colors: string[]
  instruments_need_review: boolean
}

export function useTeacherOverview(options?: { enabled?: boolean }) {
  const { tenantId } = useAuthContext()
  const extraEnabled = options?.enabled !== false

  return useQuery({
    queryKey: qk.teachers.overview(tenantId),
    enabled: !!tenantId && extraEnabled,
    staleTime: 2 * 60 * 1000, // 2-minute cache — teachers don't change every second
    queryFn: async () => {
      // Bounded week range for schedule query
      const today = new Date()
      const dayOfWeek = today.getDay()
      const monday = new Date(today)
      monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      const mondayStr = monday.toISOString().split('T')[0]
      const sundayStr = sunday.toISOString().split('T')[0]

      // All sub-queries run in parallel — no waterfall.
      // `ai_context` is excluded from the main row (can be large JSON); instrument-review flags
      // come from a tiny id-only query so PostgREST payloads stay small.
      const [teachersRes, studentsRes, blocksRes, locsRpcRes, locationRes, needReviewRes] =
        await Promise.all([
          // Minimal teacher select — no bio, no compensation, no compliance, no ai_context blob
          supabase
            .from('teachers')
            .select(`
              id, first_name, last_name, photo_url, is_active, status,
              instruments, teacher_role, is_sub_available,
              profile:profiles!teachers_profile_id_fkey(first_name, last_name, email)
            `)
            .eq('tenant_id', tenantId!)
            .order('last_name')
            .order('first_name'),

          // Active student count per teacher (just teacher_id)
          supabase
            .from('students')
            .select('teacher_id')
            .eq('tenant_id', tenantId!)
            .eq('status', 'active'),

          // Booked sessions this week per teacher (date-bounded, never open-ended)
          supabase
            .from('schedule_blocks')
            .select('teacher_id')
            .eq('tenant_id', tenantId!)
            .eq('status', 'booked')
            .not('student_id', 'is', null)
            .gte('block_date', mondayStr)
            .lte('block_date', sundayStr),

          // Teacher→location mapping via RPC — sole source of truth for display
          // (avoids oversized .in() URL with 60+ UUIDs)
          supabase.rpc('get_teacher_locations_for_tenant', { p_tenant_id: tenantId! }),

          // Location names + brand colors
          supabase
            .from('locations')
            .select('id, name, color, is_active')
            .eq('tenant_id', tenantId!),

          // Teachers flagged for instrument assignment (id only — avoids shipping full ai_context)
          supabase
            .from('teachers')
            .select('id')
            .eq('tenant_id', tenantId!)
            .contains('ai_context', { instruments_need_review: true }),
        ])

      if (teachersRes.error) throw teachersRes.error

      const teachers = teachersRes.data ?? []
      const needReviewIds = new Set(
        (needReviewRes.error ? [] : (needReviewRes.data ?? [])).map((r: { id: string }) => r.id),
      )

      // Location lookup map: id → { name, color }
      const locMap = new Map(
        (locationRes.data ?? []).map((l: any) => [
          l.id,
          { name: (l.name as string).replace(' Music Lessons', ''), color: l.color ?? '#D4226A' },
        ]),
      )

      // Student count per teacher
      const studentCounts = new Map<string, number>()
      studentsRes.data?.forEach((s: any) => {
        if (s.teacher_id)
          studentCounts.set(s.teacher_id, (studentCounts.get(s.teacher_id) ?? 0) + 1)
      })

      // Block count per teacher (this week)
      const blockCounts = new Map<string, number>()
      blocksRes.data?.forEach((b: any) => {
        blockCounts.set(b.teacher_id, (blockCounts.get(b.teacher_id) ?? 0) + 1)
      })

      // Build location map per teacher from teacher_locations (sole source of truth)
      const teacherIdSet = new Set(teachers.map((t: any) => t.id))
      const locsByTeacher = new Map<string, Set<string>>()

      locsRpcRes.data
        ?.filter((tl: any) => teacherIdSet.has(tl.teacher_id))
        .forEach((tl: any) => {
          if (!locsByTeacher.has(tl.teacher_id)) locsByTeacher.set(tl.teacher_id, new Set())
          locsByTeacher.get(tl.teacher_id)!.add(tl.location_id)
        })

      return teachers.map((t: any): TeacherOverview => {
        const profile = t.profile ?? {}
        const tLocIds = [...(locsByTeacher.get(t.id) ?? [])]

        return {
          id: t.id,
          first_name: t.first_name || profile.first_name || '',
          last_name: t.last_name || profile.last_name || '',
          email: t.email || profile.email || null,
          photo_url: t.photo_url ?? null,
          is_active: t.is_active ?? true,
          status: t.status ?? (t.is_active ? 'active' : 'inactive'),
          instruments: t.instruments ?? [],
          teacher_role: t.teacher_role ?? null,
          is_sub_available: t.is_sub_available ?? false,
          student_count: studentCounts.get(t.id) ?? 0,
          blocks_this_week: blockCounts.get(t.id) ?? 0,
          location_ids: tLocIds,
          location_names: tLocIds.map((id) => locMap.get(id)?.name ?? 'Unknown'),
          location_colors: tLocIds.map((id) => locMap.get(id)?.color ?? '#D4226A'),
          instruments_need_review: needReviewIds.has(t.id),
        }
      })
    },
  })
}
