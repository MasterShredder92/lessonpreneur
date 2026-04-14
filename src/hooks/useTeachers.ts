import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Teacher, TeacherAvailability, Student } from '../lib/types'
import { usePermissions } from './usePermissions'
import { useAuthContext } from '../app/AuthContext'
import { qk } from '../lib/queryKeys'
import { logQueryPerf } from '../lib/performance/metrics'

// Columns that studio directors must never see
const COMPENSATION_FIELDS = ['pay_rate_per_half_hour', 'rate_per_block', 'needs_1099'] as const

function stripCompensation(teacher: any): any {
  const stripped = { ...teacher }
  for (const field of COMPENSATION_FIELDS) {
    delete stripped[field]
  }
  return stripped
}

export function useTeachers() {
  const { canViewTeacherCompensation, canViewTeacherDocuments } = usePermissions()
  const { tenantId } = useAuthContext()
  return useQuery({
    queryKey: qk.teachers.list(tenantId, canViewTeacherCompensation),
    enabled: !!tenantId,
    staleTime: 2 * 60 * 1000, // 2-minute cache — teachers don't change every second
    queryFn: async () => {
      const _t0 = performance.now()
      // Pre-compute week boundaries before firing queries
      const today = new Date()
      const dayOfWeek = today.getDay()
      const monday = new Date(today)
      monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      const mondayStr = monday.toISOString().split('T')[0]
      const sundayStr = sunday.toISOString().split('T')[0]

      // All 5 queries in parallel — eliminates 4 sequential round trips
      const [teachersRes, locationsRes, studentsRes, blocksRes, teacherLocsRes] = await Promise.all([
        supabase
          .from('teachers')
          .select(`
            *,
            profile:profiles!teachers_profile_id_fkey(id, first_name, last_name, email, phone, is_active)
          `)
          .eq('tenant_id', tenantId!)
          .order('first_name')
          .order('last_name'),

        supabase
          .from('locations')
          .select('id, name')
          .eq('tenant_id', tenantId!),

        supabase
          .from('students')
          .select('teacher_id')
          .eq('tenant_id', tenantId!)
          .eq('status', 'active'),

        supabase
          .from('schedule_blocks')
          .select('teacher_id')
          .eq('tenant_id', tenantId!)
          .eq('status', 'booked')
          .not('student_id', 'is', null)
          .gte('block_date', mondayStr)
          .lte('block_date', sundayStr),

        supabase.rpc('get_teacher_locations_for_tenant', { p_tenant_id: tenantId! }),
      ])

      const { data: teachers, error } = teachersRes
      if (error) throw error

      const locMap = new Map(locationsRes.data?.map((l) => [l.id, l.name]) ?? [])

      const studentCounts = new Map<string, number>()
      studentsRes.data?.forEach((s: any) => {
        if (s.teacher_id) {
          studentCounts.set(s.teacher_id, (studentCounts.get(s.teacher_id) ?? 0) + 1)
        }
      })

      const blockCounts = new Map<string, number>()
      blocksRes.data?.forEach((b: any) => {
        blockCounts.set(b.teacher_id, (blockCounts.get(b.teacher_id) ?? 0) + 1)
      })

      const teacherIdSet = new Set(teachers.map((t: any) => t.id))
      const locsByTeacher = new Map<string, Set<string>>()
      teacherLocsRes.data?.filter((tl: any) => teacherIdSet.has(tl.teacher_id)).forEach((tl: any) => {
        if (!locsByTeacher.has(tl.teacher_id)) locsByTeacher.set(tl.teacher_id, new Set())
        locsByTeacher.get(tl.teacher_id)!.add(tl.location_id)
      })

      const result = teachers.map((t: any) => {
        // Prefer direct first_name/last_name on teachers table, fallback to profile
        const profile = t.profile ?? {}
        if (!t.first_name && profile.first_name) t.first_name = profile.first_name
        if (!t.last_name && profile.last_name) t.last_name = profile.last_name
        if (!t.email && profile.email) t.email = profile.email
        if (!t.phone && profile.phone) t.phone = profile.phone

        const tLocIds = [...(locsByTeacher.get(t.id) ?? [])]

        const base = {
          ...t,
          location_ids: tLocIds,
          location_names: tLocIds.map((id: string) => locMap.get(id) ?? 'Unknown'),
          student_count: studentCounts.get(t.id) ?? 0,
          blocks_this_week: blockCounts.get(t.id) ?? 0,
        }

        // Strip compensation + compliance fields for studio directors
        if (!canViewTeacherCompensation) {
          return stripCompensation({ ...base, w9_status: undefined, w9_completed_at: undefined, contract_status: undefined, contract_signed_at: undefined, contract_pdf_url: undefined })
        }
        return base
      }) as (Teacher & { location_names: string[] })[]
      logQueryPerf(tenantId!, 'teachers.list', performance.now() - _t0, { tableName: 'teachers' })
      return result
    },
  })
}

export function useTeacher(id: string | undefined) {
  const { canViewTeacherCompensation } = usePermissions()
  return useQuery({
    queryKey: qk.teachers.record(id, canViewTeacherCompensation),
    enabled: !!id,
    queryFn: async () => {
      const { data: teacher, error } = await supabase
        .from('teachers')
        .select(`
          *,
          profile:profiles!teachers_profile_id_fkey(id, first_name, last_name, email, phone, is_active)
        `)
        .eq('id', id!)
        .single()

      if (error) throw error

      // Strip compensation fields for studio directors
      if (!canViewTeacherCompensation) {
        return stripCompensation({ ...teacher, w9_status: undefined, w9_completed_at: undefined, contract_status: undefined, contract_signed_at: undefined, contract_pdf_url: undefined }) as Teacher & { profile: any }
      }
      return teacher as Teacher & { profile: any }
    },
  })
}

export interface AvailabilityByLocation {
  location_id: string
  location_name: string
  days: TeacherAvailability[]
}

export function useTeacherAvailability(teacherId: string | undefined) {
  return useQuery({
    queryKey: qk.teachers.availability(teacherId),
    enabled: !!teacherId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teacher_availability')
        .select('*')
        .eq('teacher_id', teacherId!)
        .eq('is_active', true)
        .order('day_of_week')
        .order('start_time')

      if (error) throw error

      // Fetch location names
      const locIds = [...new Set((data ?? []).map((r) => r.location_id))]
      const { data: locs } = locIds.length > 0
        ? await supabase.from('locations').select('id, name').in('id', locIds)
        : { data: [] }
      const locMap = new Map((locs ?? []).map((l: any) => [l.id, l.name as string]))

      // Group by location
      const grouped = new Map<string, AvailabilityByLocation>()
      for (const row of (data ?? [])) {
        const locId = row.location_id
        if (!grouped.has(locId)) {
          grouped.set(locId, {
            location_id: locId,
            location_name: locMap.get(locId) ?? 'Unknown',
            days: [],
          })
        }
        grouped.get(locId)!.days.push(row as TeacherAvailability)
      }

      return {
        flat: (data ?? []) as TeacherAvailability[],
        byLocation: Array.from(grouped.values()),
      }
    },
  })
}

export function useTeacherStudents(teacherId: string | undefined) {
  return useQuery({
    queryKey: qk.teachers.students(teacherId),
    enabled: !!teacherId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select('id, first_name, last_name, instrument, status, location_id')
        .eq('teacher_id', teacherId!)
        .order('status')
        .order('last_name')

      if (error) throw error
      return data as Student[]
    },
  })
}

export function useTeacherBlocks(teacherId: string | undefined) {
  return useQuery({
    queryKey: qk.teachers.blocks(teacherId),
    enabled: !!teacherId,
    queryFn: async () => {
      const today = new Date()
      const dayOfWeek = today.getDay()
      const monday = new Date(today)
      monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)

      const { data, error } = await supabase
        .from('schedule_blocks')
        .select(`
          id, block_date, start_time, end_time, status,
          student:students(first_name, last_name, instrument)
        `)
        .eq('teacher_id', teacherId!)
        .eq('status', 'booked')
        .not('student_id', 'is', null)
        .gte('block_date', monday.toISOString().split('T')[0])
        .lte('block_date', sunday.toISOString().split('T')[0])
        .order('block_date')
        .order('start_time')

      if (error) throw error
      return data as any[]
    },
  })
}

export function useCreateTeacher() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      tenant_id: string
      first_name: string
      last_name: string
      email: string
      phone: string
      instruments: string[]
      bio: string
      rate_per_block: number
      hire_date: string | null
      location_ids: string[]
      ai_context: Record<string, any>
    }) => {
      // Insert teacher directly — profile_id is nullable; profile is only
      // created later when admin sets up a login for this teacher.
      const { data: teacher, error: teacherErr } = await supabase
        .from('teachers')
        .insert({
          tenant_id: params.tenant_id,
          first_name: params.first_name,
          last_name: params.last_name,
          email: params.email || null,
          phone: params.phone || null,
          instruments: params.instruments,
          bio: params.bio || null,
          rate_per_block: params.rate_per_block,
          hire_date: params.hire_date || null,
          ai_context: params.ai_context,
          is_active: true,
          status: 'active',
        })
        .select()
        .single()

      if (teacherErr) throw teacherErr

      // Assign locations via teacher_locations
      if (params.location_ids.length > 0) {
        const { error: locErr } = await supabase
          .from('teacher_locations')
          .insert(params.location_ids.map((lid) => ({
            teacher_id: teacher.id,
            location_id: lid,
          })))

        if (locErr) throw locErr
      }

      return teacher
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.teachers.all })
      qc.invalidateQueries({ queryKey: qk.teachers.spreadsheet })
      qc.invalidateQueries({ queryKey: qk.teachers.locations })
    },
  })
}

export function useUpdateTeacher() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      id: string
      profile_id: string
      first_name?: string
      last_name?: string
      email?: string
      phone?: string
      instruments?: string[]
      bio?: string | null
      rate_per_block?: number
      is_active?: boolean
      is_sub_available?: boolean
      hire_date?: string | null
      termination_date?: string | null
      ai_context?: Record<string, any>
      location_ids?: string[]
    }) => {
      const { id, profile_id, first_name, last_name, email, phone, location_ids, ...teacherUpdates } = params

      // Update profile fields
      if (first_name || last_name || email !== undefined || phone !== undefined) {
        const profileUpdate: any = {}
        if (first_name) profileUpdate.first_name = first_name
        if (last_name) profileUpdate.last_name = last_name
        if (email !== undefined) profileUpdate.email = email
        if (phone !== undefined) profileUpdate.phone = phone || null

        const { error } = await supabase
          .from('profiles')
          .update(profileUpdate)
          .eq('id', profile_id)

        if (error) throw error
      }

      // Update teacher fields
      if (Object.keys(teacherUpdates).length > 0) {
        const { error } = await supabase
          .from('teachers')
          .update(teacherUpdates)
          .eq('id', id)

        if (error) throw error
      }

      // Update location assignments via teacher_locations
      if (location_ids !== undefined) {
        await supabase
          .from('teacher_locations')
          .delete()
          .eq('teacher_id', id)

        if (location_ids.length > 0) {
          const { error } = await supabase
            .from('teacher_locations')
            .insert(location_ids.map((lid) => ({
              teacher_id: id,
              location_id: lid,
            })))

          if (error) throw error
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.teachers.all })
      qc.invalidateQueries({ queryKey: qk.teachers.record })
      qc.invalidateQueries({ queryKey: qk.teachers.spreadsheet })
      qc.invalidateQueries({ queryKey: qk.payroll.entries })
    },
  })
}

/** Invalidate all availability-related cache keys */
function invalidateAvailabilityKeys(qc: ReturnType<typeof useQueryClient>, teacherId: string) {
  qc.invalidateQueries({ queryKey: qk.teachers.availability(teacherId) })
  qc.invalidateQueries({ queryKey: qk.schedule.all })
  qc.invalidateQueries({ queryKey: qk.schedule.intelligence })
  qc.invalidateQueries({ queryKey: ['teacher-avail-schedule'] })
  qc.invalidateQueries({ queryKey: qk.teachers.all })
  qc.invalidateQueries({ queryKey: qk.teachers.spreadsheet })
  qc.invalidateQueries({ queryKey: qk.teachers.spreadsheetAvailability })
}

export function useUpsertAvailability() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      teacher_id: string
      tenant_id: string
      performed_by?: string | null
      slots: { location_id: string; day_of_week: string; start_time: string; end_time: string }[]
    }) => {
      // Deactivate all existing availability for this teacher
      await supabase
        .from('teacher_availability')
        .update({ is_active: false })
        .eq('teacher_id', params.teacher_id)

      // Insert new slots
      if (params.slots.length > 0) {
        const { error } = await supabase
          .from('teacher_availability')
          .insert(params.slots.map((s) => ({
            tenant_id: params.tenant_id,
            teacher_id: params.teacher_id,
            location_id: s.location_id,
            day_of_week: s.day_of_week,
            start_time: s.start_time,
            end_time: s.end_time,
            is_active: true,
          })))

        if (error) throw error
      }

      // Audit log — fire and forget
      supabase.from('activity_log').insert({
        tenant_id: params.tenant_id,
        entity_type: 'teacher_availability',
        entity_id: params.teacher_id,
        action: 'AVAILABILITY_UPDATED',
        description: `Availability updated: ${params.slots.length} slot(s) saved`,
        performed_by: params.performed_by ?? null,
      }).then(() => {})
    },
    onSuccess: (_d, vars) => {
      invalidateAvailabilityKeys(qc, vars.teacher_id)
    },
  })
}

export function useRemoveAvailabilityDay() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      teacher_id: string
      tenant_id: string
      location_id: string
      day_of_week: string
      performed_by?: string | null
    }) => {
      const { error } = await supabase
        .from('teacher_availability')
        .update({ is_active: false })
        .eq('teacher_id', params.teacher_id)
        .eq('location_id', params.location_id)
        .eq('day_of_week', params.day_of_week)

      if (error) throw error

      // Audit log — fire and forget
      supabase.from('activity_log').insert({
        tenant_id: params.tenant_id,
        entity_type: 'teacher_availability',
        entity_id: params.teacher_id,
        action: 'AVAILABILITY_REMOVED',
        description: `Removed ${params.day_of_week} at location ${params.location_id}`,
        performed_by: params.performed_by ?? null,
      }).then(() => {})
    },
    onSuccess: (_d, vars) => {
      invalidateAvailabilityKeys(qc, vars.teacher_id)
    },
  })
}

export function useToggleLocationAvailability() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      teacher_id: string
      tenant_id: string
      location_id: string
      is_active: boolean
      performed_by?: string | null
    }) => {
      const { error } = await supabase
        .from('teacher_availability')
        .update({ is_active: params.is_active })
        .eq('teacher_id', params.teacher_id)
        .eq('location_id', params.location_id)

      if (error) throw error

      // Audit log — fire and forget
      supabase.from('activity_log').insert({
        tenant_id: params.tenant_id,
        entity_type: 'teacher_availability',
        entity_id: params.teacher_id,
        action: params.is_active ? 'AVAILABILITY_UPDATED' : 'AVAILABILITY_REMOVED',
        description: `Location ${params.location_id} availability ${params.is_active ? 'enabled' : 'disabled'}`,
        performed_by: params.performed_by ?? null,
      }).then(() => {})
    },
    onSuccess: (_d, vars) => {
      invalidateAvailabilityKeys(qc, vars.teacher_id)
    },
  })
}
