import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useState, useEffect, useRef } from 'react'
import { DEFAULT_SESSIONS_PER_MONTH, DEFAULT_RATE_PER_SESSION } from '../lib/constants'

interface CreateStudentWithFamilyParams {
  tenant_id: string
  // Family fields
  family_name?: string
  parent_name: string
  email: string
  phone: string
  is_military: boolean
  // Student fields
  first_name: string
  last_name: string
  age: string | null
  instrument: string
  experience: string | null
  has_instrument: string | null
  preferred_days: string[] | null
  bio: string | null
  source: string | null
  location_id: string
  additional_location_ids?: string[]
  sessions_per_month?: number
  rate_per_session?: number
  start_date?: string | null
  notes?: string | null
}

export function useCreateStudentWithFamily() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: CreateStudentWithFamilyParams) => {
      let familyId: string
      let isNewFamily = false

      // 1. Check if family exists by email
      const { data: existingFamily } = await supabase
        .from('families')
        .select('id')
        .eq('primary_email', params.email)
        .maybeSingle()

      if (existingFamily) {
        familyId = existingFamily.id
      } else {
        // 2. Create new family
        isNewFamily = true
        const { data: newFamily, error: famErr } = await supabase
          .from('families')
          .insert({
            tenant_id: params.tenant_id,
            name: params.family_name?.trim() || `${params.last_name} Family`,
            parent_name: params.parent_name,
            primary_contact_name: params.parent_name,
            primary_email: params.email,
            primary_phone: params.phone || null,
            is_military: params.is_military,
            billing_status: 'active',
            billing_day: 1,
          })
          .select()
          .single()

        if (famErr) throw famErr
        familyId = newFamily.id
      }

      // 3. Insert student with family_id
      const { data: student, error: stuErr } = await supabase
        .from('students')
        .insert({
          tenant_id: params.tenant_id,
          family_id: familyId,
          location_id: params.location_id,
          first_name: params.first_name,
          last_name: params.last_name,
          instrument: params.instrument,
          status: 'active' as const,
          age: params.age || null,
          experience: params.experience || null,
          has_instrument: params.has_instrument || null,
          preferred_days: params.preferred_days || null,
          bio: params.bio || null,
          source: params.source || null,
          sessions_per_month: params.sessions_per_month ?? DEFAULT_SESSIONS_PER_MONTH,
          blocks_per_week: 1,
          rate_per_session: params.rate_per_session ?? DEFAULT_RATE_PER_SESSION,
          start_date: params.start_date || null,
          notes: params.notes || null,
        })
        .select()
        .single()

      if (stuErr) throw stuErr

      // 4. Auto-generate system tasks for missing docs
      const familyDisplayName = params.family_name ?? `${params.last_name} Family`

      // Check for missing contract
      const { data: hasContract } = await supabase.from('family_files').select('id').eq('family_id', familyId).eq('file_type', 'contract').limit(1)
      if (!hasContract?.length) {
        await supabase.from('tasks').upsert({
          tenant_id: params.tenant_id,
          task_type: 'missing_contract',
          title: `Upload contract — ${familyDisplayName}`,
          priority: 'high',
          assigned_role: 'studio_director',
          entity_type: 'family',
          entity_id: familyId,
          entity_name: familyDisplayName,
          status: 'pending',
          dedup_key: `missing_contract:${familyId}`,
        }, { onConflict: 'dedup_key', ignoreDuplicates: true })
      }

      // Check for missing enrollment form
      const { data: hasEnrollment } = await supabase.from('family_files').select('id').eq('family_id', familyId).eq('file_type', 'enrollment_form').limit(1)
      if (!hasEnrollment?.length) {
        await supabase.from('tasks').upsert({
          tenant_id: params.tenant_id,
          task_type: 'missing_enrollment_form',
          title: `Upload enrollment form — ${familyDisplayName}`,
          priority: 'high',
          assigned_role: 'studio_director',
          entity_type: 'family',
          entity_id: familyId,
          entity_name: familyDisplayName,
          status: 'pending',
          dedup_key: `missing_enrollment:${familyId}`,
        }, { onConflict: 'dedup_key', ignoreDuplicates: true })
      }

      // 5. Auto-create onboarding sequence
      const enrollDate = params.start_date || new Date().toISOString().split('T')[0]
      const base = new Date(enrollDate + 'T12:00:00')
      const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r.toISOString().split('T')[0] }
      await supabase.from('onboarding_sequences').insert({
        tenant_id: params.tenant_id,
        student_id: student.id,
        family_id: familyId,
        location_id: params.location_id ?? null,
        enrollment_date: enrollDate,
        day_7_due: addDays(base, 7),
        day_14_due: addDays(base, 14),
        day_30_due: addDays(base, 30),
        day_60_due: addDays(base, 60),
        day_90_due: addDays(base, 90),
        status: 'active',
      }).then(() => {}) // non-critical

      // 6. Invalidate caches
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['students'] }),
        qc.invalidateQueries({ queryKey: ['students_roster'] }),
        qc.invalidateQueries({ queryKey: ['student-instruments'] }),
        qc.invalidateQueries({ queryKey: ['student-tab-counts'] }),
        qc.invalidateQueries({ queryKey: ['families'] }),
        qc.invalidateQueries({ queryKey: ['families_page'] }),
        qc.invalidateQueries({ queryKey: ['families_roster'] }),
        qc.invalidateQueries({ queryKey: ['family-tab-counts'] }),
        qc.invalidateQueries({ queryKey: ['family_detail'] }),
        qc.invalidateQueries({ queryKey: ['tasks'] }),
        qc.invalidateQueries({ queryKey: ['onboarding-pipeline'] }),
      ])

      return { student, family: { id: familyId }, isNewFamily }
    },
  })
}

export function useFamilyByEmail(email: string) {
  const [debouncedEmail, setDebouncedEmail] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!email || !email.includes('@')) {
      setDebouncedEmail('')
      return
    }
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebouncedEmail(email), 400)
    return () => clearTimeout(timerRef.current)
  }, [email])

  return useQuery({
    queryKey: ['family-by-email', debouncedEmail],
    enabled: !!debouncedEmail && debouncedEmail.includes('@'),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('families')
        .select('id, name, primary_contact_name, parent_name, primary_phone, primary_email, is_military, billing_status')
        .eq('primary_email', debouncedEmail)
        .maybeSingle()

      if (error) throw error
      return data
    },
  })
}
