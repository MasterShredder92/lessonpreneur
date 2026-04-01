import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { LESSON_LOOKBACK_DAYS } from '../lib/constants'

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
  // Joined
  family_name?: string
  family_email?: string | null
  family_phone?: string | null
  family_contact?: string | null
  teacher_name?: string
  location_name?: string
  next_lesson_date?: string | null
  next_lesson_time?: string | null
  scheduled_teachers?: { teacherId: string; teacherName: string; locationName: string; instrument?: string }[]
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

export function useStudents(filters?: { status?: string; locationId?: string; teacherId?: string }) {
  return useQuery({
    queryKey: ['students', filters],
    queryFn: async () => {
      let query = supabase
        .from('students')
        .select('*')
        .order('first_name')
        .order('last_name')

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status)
      }
      if (filters?.locationId) {
        query = query.eq('location_id', filters.locationId)
      }
      if (filters?.teacherId) {
        query = query.eq('teacher_id', filters.teacherId)
      }

      const { data: students, error } = await query
      if (error) throw error

      // Get family names
      const familyIds = [...new Set(students.map((s: any) => s.family_id).filter(Boolean))]
      const { data: families } = familyIds.length > 0
        ? await supabase
            .from('families')
            .select('id, name, primary_email, primary_phone, primary_contact_name, parent_name, parent_first_name, parent_last_name')
            .in('id', familyIds)
        : { data: [] }
      const famMap = new Map(families?.map((f: any) => {
        const parentDisplay = f.parent_first_name ? `${f.parent_first_name} ${f.parent_last_name ?? ''}`.trim() : f.parent_name ?? null
        return [f.id, { name: f.name, email: f.primary_email, phone: f.primary_phone, contact: parentDisplay }]
      }) ?? [])

      // Get teacher names + instruments
      const teacherIds = [...new Set(students.filter((s: any) => s.teacher_id).map((s: any) => s.teacher_id))]
      const teacherMap = new Map<string, string>()
      const teacherInstrumentsMap = new Map<string, string[]>()
      if (teacherIds.length > 0) {
        const { data: teachers } = await supabase
          .from('teachers')
          .select('id, first_name, last_name, instruments, profile:profiles!teachers_profile_id_fkey(first_name, last_name)')
          .in('id', teacherIds)
        teachers?.forEach((t: any) => {
          teacherMap.set(t.id, `${t.first_name ?? t.profile?.first_name ?? ''} ${t.last_name ?? t.profile?.last_name ?? ''}`.trim())
          teacherInstrumentsMap.set(t.id, t.instruments ?? [])
        })
      }

      // Get location names
      const locIds = [...new Set(students.map((s: any) => s.location_id).filter(Boolean))]
      const { data: locations } = locIds.length > 0
        ? await supabase.from('locations').select('id, name').in('id', locIds)
        : { data: [] }
      const locMap = new Map(locations?.map((l: any) => [l.id, l.name]) ?? [])

      // Get upcoming lessons per student (next N days, grouped by teacher)
      const today = new Date().toISOString().split('T')[0]
      const lookAhead = new Date(); lookAhead.setDate(lookAhead.getDate() + LESSON_LOOKBACK_DAYS)
      const lookAheadStr = lookAhead.toISOString().split('T')[0]
      const studentIds = students.map((s: any) => s.id)
      const { data: nextBlocks } = studentIds.length > 0
        ? await supabase
            .from('schedule_blocks')
            .select('student_id, teacher_id, block_date, start_time, location_id')
            .in('student_id', studentIds)
            .gte('block_date', today)
            .lte('block_date', lookAheadStr)
            .eq('status', 'booked')
            .order('block_date')
            .order('start_time')
        : { data: [] }

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

export function useFamilies() {
  return useQuery({
    queryKey: ['families'],
    queryFn: async () => {
      const { data: families, error } = await supabase
        .from('families')
        .select('*')
        .order('name')
      if (error) throw error

      // Get student counts per family
      const { data: students } = await supabase
        .from('students')
        .select('id, family_id, first_name, last_name, instrument, status')
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
  return useQuery({
    queryKey: ['family', id],
    enabled: !!id,
    queryFn: async () => {
      const { data: family, error } = await supabase
        .from('families')
        .select('*')
        .eq('id', id!)
        .single()
      if (error) throw error

      const { data: students } = await supabase
        .from('students')
        .select('*')
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['families'] }),
  })
}

export function useUpdateFamily() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<FamilyRow> & { id: string }) => {
      const { error } = await supabase.from('families').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['families'] })
      qc.invalidateQueries({ queryKey: ['family'] })
    },
  })
}

export function useCreateStudent() {
  const qc = useQueryClient()
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
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['students'] })
      qc.invalidateQueries({ queryKey: ['families'] })
      qc.invalidateQueries({ queryKey: ['family'] })
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['students'] })
      qc.invalidateQueries({ queryKey: ['student-detail'] })
      qc.invalidateQueries({ queryKey: ['families'] })
      qc.invalidateQueries({ queryKey: ['families_page'] })
      qc.invalidateQueries({ queryKey: ['family'] })
      qc.invalidateQueries({ queryKey: ['family_detail'] })
    },
  })
}
