import { useQuery, useMutation, useQueryClient, keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { LESSON_LOOKBACK_DAYS } from '../lib/constants'
import { useAuthContext } from '../app/AuthContext'
import { qk } from '../lib/queryKeys'

export interface StudentRow {
  id: string
  tenant_id: string
  family_id: string
  location_id: string
  teacher_id: string | null
  first_name: string
  last_name: string
  instrument: string
  status: 'active' | 'paused' | 'inactive' | 'former'
  date_of_birth: string | null
  start_date: string | null
  end_date: string | null
  blocks_per_week: number
  rate_per_session: number
  notes: string | null
  tags: string[] | null
  exit_reason?: string | null
  exit_notes?: string | null
  may_return?: string | null
  reactivation_date?: string | null
  total_fifth_weeks?: number
  total_callouts?: number
  /** When false, excluded from multi-student / family tier counts until duplicate review is resolved. */
  counts_toward_family_tier?: boolean | null
  // Joined
  family_name?: string
  family_email?: string | null
  family_phone?: string | null
  family_contact?: string | null
  teacher_name?: string
  location_name?: string
  next_lesson_date?: string | null
  next_lesson_time?: string | null
  sessions_per_month?: number
  scheduled_teachers?: { teacherId: string; teacherName: string; locationName: string; instrument?: string }[]
  has_enrollment_agreement?: boolean
  family_rate_tier?: number
}

export interface FamilyRow {
  id: string
  tenant_id: string
  name: string
  primary_contact_name: string | null
  primary_email: string | null
  primary_phone: string | null
  billing_notes: string | null
  is_military: boolean
  student_count?: number
  students?: StudentRow[]
}

/** Tab counts via parallel count queries — no row data fetched. */
export function useStudentTabCounts() {
  const { tenantId } = useAuthContext()
  return useQuery({
    queryKey: qk.students.tabCounts(tenantId),
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async () => {
      const [activeResult, formerResult, allResult] = await Promise.all([
        supabase.from('students').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId!).eq('status', 'active'),
        supabase.from('students').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId!).in('status', ['former', 'inactive']),
        supabase.from('students').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId!),
      ])
      return {
        active: activeResult.count ?? 0,
        former: formerResult.count ?? 0,
        all: allResult.count ?? 0,
      }
    },
  })
}

export function useStudents(filters?: { status?: string; locationId?: string; teacherId?: string }, opts?: { enabled?: boolean }) {
  const { tenantId } = useAuthContext()
  return useQuery({
    queryKey: qk.students.list(tenantId, filters?.status, filters?.locationId, filters?.teacherId),
    enabled: (opts?.enabled !== false) && !!tenantId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase
        .from('students')
        .select('*')
        .eq('tenant_id', tenantId!)
        .order('first_name')
        .order('last_name')

      if (filters?.status && filters.status !== 'all') {
        if (filters.status === 'former') query = query.in('status', ['former', 'inactive'])
        else query = query.eq('status', filters.status)
      }
      if (filters?.locationId) {
        query = query.eq('location_id', filters.locationId)
      }
      if (filters?.teacherId) {
        query = query.eq('teacher_id', filters.teacherId)
      }

      const { data: students, error } = await query
      if (error) throw error

      // Pre-compute ID sets
      const familyIds = [...new Set(students.map((s: any) => s.family_id).filter(Boolean))]
      const teacherIds = [...new Set(students.filter((s: any) => s.teacher_id).map((s: any) => s.teacher_id))]
      const locIds = [...new Set(students.map((s: any) => s.location_id).filter(Boolean))]
      const studentIds = students.map((s: any) => s.id)
      const today = new Date().toISOString().split('T')[0]
      const lookAhead = new Date(); lookAhead.setDate(lookAhead.getDate() + LESSON_LOOKBACK_DAYS)
      const lookAheadStr = lookAhead.toISOString().split('T')[0]

      // Run all enrichment queries in parallel
      const [familiesResult, teachersResult, locationsResult, nextBlocksResult] = await Promise.all([
        familyIds.length > 0
          ? supabase.from('families').select('id, name, primary_email, primary_phone, primary_contact_name, parent_name, parent_first_name, parent_last_name').eq('tenant_id', tenantId!).in('id', familyIds)
          : Promise.resolve({ data: [] as any[] }),
        teacherIds.length > 0
          ? supabase.from('teachers').select('id, first_name, last_name, instruments, profile:profiles!teachers_profile_id_fkey(first_name, last_name)').eq('tenant_id', tenantId!).in('id', teacherIds)
          : Promise.resolve({ data: [] as any[] }),
        locIds.length > 0
          ? supabase.from('locations').select('id, name').eq('tenant_id', tenantId!).in('id', locIds)
          : Promise.resolve({ data: [] as any[] }),
        studentIds.length > 0
          ? supabase.from('schedule_blocks').select('student_id, teacher_id, block_date, start_time, location_id').eq('tenant_id', tenantId!).in('student_id', studentIds).gte('block_date', today).lte('block_date', lookAheadStr).eq('status', 'booked').order('block_date').order('start_time')
          : Promise.resolve({ data: [] as any[] }),
      ])

      const famMap = new Map((familiesResult.data ?? []).map((f: any) => {
        const parentDisplay = f.parent_first_name ? `${f.parent_first_name} ${f.parent_last_name ?? ''}`.trim() : f.parent_name ?? null
        return [f.id, { name: f.name, email: f.primary_email, phone: f.primary_phone, contact: parentDisplay }]
      }))

      const teacherMap = new Map<string, string>()
      const teacherInstrumentsMap = new Map<string, string[]>()
      ;(teachersResult.data ?? []).forEach((t: any) => {
        teacherMap.set(t.id, `${t.first_name ?? t.profile?.first_name ?? ''} ${t.last_name ?? t.profile?.last_name ?? ''}`.trim())
        teacherInstrumentsMap.set(t.id, t.instruments ?? [])
      })

      const locMap = new Map((locationsResult.data ?? []).map((l: any) => [l.id, l.name]))

      const nextBlocks = nextBlocksResult.data ?? []

      // Build per-student: next lesson + all unique teacher/location combos
      const nextLessonMap = new Map<string, { date: string; time: string }>()
      const studentTeachersMap = new Map<string, { teacherId: string; teacherName: string; locationName: string }[]>()
      nextBlocks?.forEach((b: any) => {
        if (!nextLessonMap.has(b.student_id)) {
          nextLessonMap.set(b.student_id, { date: b.block_date, time: b.start_time })
        }
        const list = studentTeachersMap.get(b.student_id) ?? []
        const tName = teacherMap.get(b.teacher_id) ?? '—'
        const lName = locMap.get(b.location_id)?.replace(' Music Lessons', '') ?? '—'
        const tInstruments = teacherInstrumentsMap.get(b.teacher_id) ?? []
        // Get the student's instrument — for the first teacher use that, for others use teacher's primary
        const student = students.find((s: any) => s.id === b.student_id)
        const instrument = list.length === 0
          ? (student?.instrument ?? tInstruments[0] ?? '—')
          : (tInstruments.find((i: string) => i !== student?.instrument) ?? tInstruments[0] ?? '—')
        if (!list.some((x) => x.teacherId === b.teacher_id)) {
          list.push({ teacherId: b.teacher_id, teacherName: tName, locationName: lName, instrument })
        }
        studentTeachersMap.set(b.student_id, list)
      })

      return students.map((s: any) => {
        const fam = famMap.get(s.family_id) ?? { name: 'Unknown', email: null, phone: null, contact: null }
        const next = nextLessonMap.get(s.id)
        return {
          ...s,
          family_name: fam.name,
          family_email: fam.email,
          family_phone: fam.phone,
          family_contact: fam.contact,
          teacher_name: s.teacher_id ? teacherMap.get(s.teacher_id) ?? '—' : '—',
          location_name: locMap.get(s.location_id)?.replace(' Music Lessons', '') ?? '—',
          next_lesson_date: next?.date ?? null,
          next_lesson_time: next?.time ?? null,
          scheduled_teachers: studentTeachersMap.get(s.id) ?? [],
        }
      }) as StudentRow[]
    },
  })
}

export const STUDENTS_ROSTER_PAGE = 50

export type StudentsRosterSort = 'az_first' | 'za_first' | 'az_last' | 'za_last' | 'newest' | 'oldest'

export function useStudentsRosterInfinite(params: {
  status: string
  locationId?: string
  teacherId?: string
  instrumentFilter: string
  search: string
  sortBy: StudentsRosterSort
  enabled: boolean
}) {
  const { tenantId } = useAuthContext()
  const { status, locationId, teacherId, instrumentFilter, search, sortBy, enabled } = params

  return useInfiniteQuery({
    queryKey: ['students_roster', tenantId, status, locationId, teacherId, instrumentFilter, search, sortBy],
    enabled: !!tenantId && enabled,
    initialPageParam: 0,
    staleTime: 45_000,
    queryFn: async ({ pageParam: offset }) => {
      const PAGE = STUDENTS_ROSTER_PAGE
      const qtrim = search.trim()
      let familyIdsFromSearch: string[] = []
      if (qtrim) {
        // Escape PostgREST filter special characters
        const esc = qtrim.replace(/[%_\\(),."']/g, (c) => `\\${c}`)
        const t = `%${esc}%`
        const { data: famHits } = await supabase
          .from('families')
          .select('id')
          .eq('tenant_id', tenantId!)
          .or(`name.ilike.${t},primary_email.ilike.${t},primary_phone.ilike.${t}`)
          .limit(400)
        familyIdsFromSearch = (famHits ?? []).map((f: any) => f.id)
      }

      let q = supabase
        .from('students')
        .select(
          `
          id, tenant_id, family_id, location_id, teacher_id, first_name, last_name, instrument, status,
          blocks_per_week, rate_per_session, start_date, overdue_amount, sessions_per_month,
          families ( id, name, primary_email, primary_phone, parent_name, parent_first_name, parent_last_name, card_brand, card_last_four, rate_tier )
        `,
        )
        .eq('tenant_id', tenantId!)

      if (status && status !== 'all') {
        if (status === 'former') q = q.in('status', ['former', 'inactive'])
        else q = q.eq('status', status)
      }
      if (locationId) q = q.eq('location_id', locationId)
      if (teacherId) q = q.eq('teacher_id', teacherId)
      if (instrumentFilter) q = q.eq('instrument', instrumentFilter)

      if (qtrim) {
        const esc = qtrim.replace(/[%_\\(),."']/g, (c) => `\\${c}`)
        const t = `%${esc}%`
        const ors = [`first_name.ilike.${t}`, `last_name.ilike.${t}`]
        if (familyIdsFromSearch.length > 0) {
          ors.push(`family_id.in.(${familyIdsFromSearch.join(',')})`)
        }
        q = q.or(ors.join(','))
      }

      if (sortBy === 'az_first') q = q.order('first_name', { ascending: true }).order('last_name', { ascending: true })
      else if (sortBy === 'za_first') q = q.order('first_name', { ascending: false }).order('last_name', { ascending: false })
      else if (sortBy === 'az_last') q = q.order('last_name', { ascending: true }).order('first_name', { ascending: true })
      else if (sortBy === 'za_last') q = q.order('last_name', { ascending: false }).order('first_name', { ascending: false })
      else if (sortBy === 'newest') q = q.order('start_date', { ascending: false, nullsFirst: false })
      else q = q.order('start_date', { ascending: true, nullsFirst: false })

      q = q.range(offset, offset + PAGE - 1)
      const { data: rows, error } = await q
      if (error) throw error
      const students = rows ?? []

      // Pre-compute ID sets for parallel queries
      const teacherIds = [...new Set(students.filter((s: any) => s.teacher_id).map((s: any) => s.teacher_id))]
      const locIds = [...new Set(students.map((s: any) => s.location_id).filter(Boolean))]
      const famIds = [...new Set(students.map((s: any) => s.family_id).filter(Boolean))]
      const studentIds = students.map((s: any) => s.id)
      const today = new Date().toISOString().split('T')[0]
      const lookAhead = new Date()
      lookAhead.setDate(lookAhead.getDate() + LESSON_LOOKBACK_DAYS)
      const lookAheadStr = lookAhead.toISOString().split('T')[0]

      // Run all enrichment queries in parallel
      const [teachersResult, locsResult, agrResult, nextBlocksResult] = await Promise.all([
        teacherIds.length > 0
          ? supabase.from('teachers').select('id, first_name, last_name, profile:profiles!teachers_profile_id_fkey(first_name, last_name)').eq('tenant_id', tenantId!).in('id', teacherIds)
          : Promise.resolve({ data: [] as any[] }),
        locIds.length > 0
          ? supabase.from('locations').select('id, name').eq('tenant_id', tenantId!).in('id', locIds)
          : Promise.resolve({ data: [] as any[] }),
        famIds.length > 0
          ? supabase.from('family_files').select('family_id').eq('tenant_id', tenantId!).eq('file_type', 'enrollment_agreement').in('family_id', famIds)
          : Promise.resolve({ data: [] as any[] }),
        studentIds.length > 0
          ? supabase.from('schedule_blocks').select('student_id, block_date, start_time').eq('tenant_id', tenantId!).in('student_id', studentIds).gte('block_date', today).lte('block_date', lookAheadStr).eq('status', 'booked').order('block_date').order('start_time')
          : Promise.resolve({ data: [] as any[] }),
      ])

      const teacherMap = new Map<string, string>()
      ;(teachersResult.data ?? []).forEach((t: any) => {
        teacherMap.set(t.id, `${t.first_name ?? t.profile?.first_name ?? ''} ${t.last_name ?? t.profile?.last_name ?? ''}`.trim())
      })

      const locMap = new Map<string, string>()
      ;(locsResult.data ?? []).forEach((l: any) => locMap.set(l.id, l.name))

      const agreementSet = new Set<string>()
      ;(agrResult.data ?? []).forEach((a: any) => agreementSet.add(a.family_id))

      const nextLessonMap = new Map<string, { date: string; time: string }>()
      ;(nextBlocksResult.data ?? []).forEach((b: any) => {
        if (!nextLessonMap.has(b.student_id)) nextLessonMap.set(b.student_id, { date: b.block_date, time: b.start_time })
      })

      const mapped: StudentRow[] = students.map((s: any) => {
        const fam = s.families ?? {}
        const parentDisplay = fam.parent_first_name
          ? `${fam.parent_first_name} ${fam.parent_last_name ?? ''}`.trim()
          : fam.parent_name ?? null
        const next = nextLessonMap.get(s.id)
        return {
          ...s,
          families: undefined,
          family_name: fam.name,
          family_email: fam.primary_email,
          family_phone: fam.primary_phone,
          family_contact: parentDisplay,
          family_rate_tier: fam.rate_tier ?? null,
          teacher_name: s.teacher_id ? teacherMap.get(s.teacher_id) ?? '—' : '—',
          location_name: locMap.get(s.location_id)?.replace(' Music Lessons', '') ?? '—',
          next_lesson_date: next?.date ?? null,
          next_lesson_time: next?.time ?? null,
          scheduled_teachers: [],
          has_enrollment_agreement: agreementSet.has(s.family_id),
        } as StudentRow
      })

      const len = students.length
      return {
        rows: mapped,
        nextOffset: offset + len,
        hasMore: len === PAGE,
      }
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextOffset : undefined),
  })
}

/** Distinct instrument values for filter dropdowns (scoped by location/teacher when provided). */
/** Per-location active student counts — runs N parallel HEAD queries, one per location.
 *  Fast: no row data fetched, just counts. Used for Tier 1 location overview cards. */
export function useStudentCountsByLocation(locationIds: string[]) {
  const { tenantId } = useAuthContext()
  const stableKey = [...locationIds].sort().join(',')
  return useQuery({
    queryKey: ['students-counts-by-location', tenantId, stableKey],
    enabled: !!tenantId && locationIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const results = await Promise.all(
        locationIds.map((id) =>
          supabase
            .from('students')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenantId!)
            .eq('location_id', id)
            .eq('status', 'active'),
        ),
      )
      return Object.fromEntries(locationIds.map((id, i) => [id, results[i].count ?? 0])) as Record<string, number>
    },
  })
}

export function useStudentInstrumentOptions(params: { locationId?: string; teacherId?: string }) {
  const { tenantId } = useAuthContext()
  const { locationId, teacherId } = params
  return useQuery({
    queryKey: qk.students.instruments(tenantId, locationId, teacherId),
    enabled: !!tenantId,
    staleTime: 120_000,
    queryFn: async () => {
      let q = supabase.from('students').select('instrument').eq('tenant_id', tenantId!).not('instrument', 'is', null)
      if (locationId) q = q.eq('location_id', locationId)
      if (teacherId) q = q.eq('teacher_id', teacherId)
      const { data, error } = await q
      if (error) throw error
      return [...new Set((data ?? []).map((r: { instrument: string }) => r.instrument).filter(Boolean))].sort()
    },
  })
}

export function useFamilies() {
  const { tenantId } = useAuthContext()
  return useQuery({
    queryKey: qk.families.list(tenantId),
    enabled: !!tenantId,
    queryFn: async () => {
      const { data: families, error } = await supabase
        .from('families')
        .select('*')
        .eq('tenant_id', tenantId!)
        .order('name')
      if (error) throw error

      // Get student counts per family
      const { data: students } = await supabase
        .from('students')
        .select('id, family_id, first_name, last_name, instrument, status')
        .eq('tenant_id', tenantId!)
        .order('last_name')

      const familyStudents = new Map<string, any[]>()
      students?.forEach((s: any) => {
        const list = familyStudents.get(s.family_id) ?? []
        list.push(s)
        familyStudents.set(s.family_id, list)
      })

      return families.map((f: any) => ({
        ...f,
        student_count: familyStudents.get(f.id)?.length ?? 0,
        students: familyStudents.get(f.id) ?? [],
      })) as FamilyRow[]
    },
  })
}

export function useFamily(id: string | undefined) {
  const { tenantId } = useAuthContext()
  return useQuery({
    queryKey: qk.families.detail(id, tenantId),
    enabled: !!id && !!tenantId,
    queryFn: async () => {
      const { data: family, error } = await supabase
        .from('families')
        .select('*')
        .eq('tenant_id', tenantId!)
        .eq('id', id!)
        .single()
      if (error) throw error

      const { data: students } = await supabase
        .from('students')
        .select('*')
        .eq('tenant_id', tenantId!)
        .eq('family_id', id!)
        .order('status')
        .order('last_name')

      return { ...family, students: students ?? [] } as FamilyRow & { students: StudentRow[] }
    },
  })
}

export function useCreateFamily() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { tenant_id: string; name: string; primary_contact_name: string; primary_email: string; primary_phone: string; billing_notes: string; is_military: boolean }) => {
      const { data, error } = await supabase.from('families').insert(params).select().single()
      if (error) throw error
      return data
    },
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: qk.families.all })
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.families.page }),
        qc.invalidateQueries({ queryKey: qk.families.roster }),
      ])
      qc.invalidateQueries({ queryKey: qk.families.tabCounts })
    },
  })
}

export function useUpdateFamily() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<FamilyRow> & { id: string }) => {
      const { error } = await supabase.from('families').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: qk.families.all })
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.families.page }),
        qc.invalidateQueries({ queryKey: qk.families.roster }),
      ])
      qc.invalidateQueries({ queryKey: qk.families.detail })
    },
  })
}

export function useCreateStudent() {
  const qc = useQueryClient()
  const { tenantId } = useAuthContext()
  return useMutation({
    mutationFn: async (params: {
      tenant_id: string; family_id: string; location_id: string; teacher_id: string | null
      first_name: string; last_name: string; instrument: string
      blocks_per_week: number; rate_per_session: number; start_date: string | null; notes: string
    }) => {
      const { data, error } = await supabase.from('students').insert({
        ...params,
        status: 'active' as const,
        teacher_id: params.teacher_id || null,
        notes: params.notes || null,
        start_date: params.start_date || null,
      }).select().single()
      if (error) throw error

      // Auto-create onboarding sequence
      const enrollDate = params.start_date || new Date().toISOString().split('T')[0]
      const base = new Date(enrollDate + 'T12:00:00')
      const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r.toISOString().split('T')[0] }
      await supabase.from('onboarding_sequences').insert({
        tenant_id: params.tenant_id,
        student_id: data.id,
        family_id: params.family_id,
        location_id: params.location_id,
        enrollment_date: enrollDate,
        day_7_due: addDays(base, 7),
        day_14_due: addDays(base, 14),
        day_30_due: addDays(base, 30),
        day_60_due: addDays(base, 60),
        day_90_due: addDays(base, 90),
        status: 'active',
      }).then(() => {}) // non-critical, don't block on failure

      return data
    },
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: qk.students.all })
      qc.invalidateQueries({ queryKey: qk.students.roster })
      qc.invalidateQueries({ queryKey: qk.students.instruments })
      qc.invalidateQueries({ queryKey: qk.students.tabCounts })
      qc.invalidateQueries({ queryKey: qk.retention.churnRisk })
      qc.invalidateQueries({ queryKey: qk.families.all })
      qc.invalidateQueries({ queryKey: qk.leads.duplicateReviews(tenantId) })
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.families.page }),
        qc.invalidateQueries({ queryKey: qk.families.roster }),
      ])
      qc.invalidateQueries({ queryKey: qk.families.tabCounts })
      qc.invalidateQueries({ queryKey: qk.families.detail })
      qc.invalidateQueries({ queryKey: qk.onboarding.pipeline })
    },
  })
}

export function useUpdateStudent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<StudentRow> & { id: string }) => {
      const { error } = await supabase.from('students').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: qk.students.all })
      qc.invalidateQueries({ queryKey: qk.students.roster })
      qc.invalidateQueries({ queryKey: qk.students.instruments })
      qc.invalidateQueries({ queryKey: qk.students.tabCounts })
      qc.invalidateQueries({ queryKey: qk.students.detail })
      qc.invalidateQueries({ queryKey: qk.retention.churnRisk })
      qc.invalidateQueries({ queryKey: ['churn-risk-student'] })
      qc.invalidateQueries({ queryKey: qk.families.all })
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.families.page }),
        qc.invalidateQueries({ queryKey: qk.families.roster }),
      ])
      qc.invalidateQueries({ queryKey: qk.families.detail })
      qc.invalidateQueries({ queryKey: qk.families.fileDetail })
    },
  })
}
