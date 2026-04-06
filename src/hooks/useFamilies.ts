import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { batchIn } from '../lib/batchQuery'
import { useAuthContext } from '../app/AuthContext'
import { DEFAULT_SESSIONS_PER_MONTH, DEFAULT_RATE_TIER_CENTS } from '../lib/constants'

// ═══════════════════════════════════════
// FAMILY TYPES
// ═══════════════════════════════════════

export interface FamilyStudent {
  id: string
  first_name: string
  last_name: string
  instrument: string
  status: string
  teacher_id: string | null
  teacher_name?: string
  student_display_id?: string | null
  sessions_per_month?: number
  pause_reason?: string | null
  deactivated_at?: string | null
}

export interface FamilyFile {
  id: string
  tenant_id: string
  family_id: string
  file_type: string
  file_name: string
  file_url: string
  file_size_bytes: number | null
  uploaded_by: string | null
  notes: string | null
  created_at: string
  uploader_name?: string
}

export interface Family {
  id: string
  tenant_id: string
  name: string
  parent_name: string | null
  parent_first_name: string | null
  parent_last_name: string | null
  primary_contact_name: string | null
  primary_email: string | null
  primary_phone: string | null
  billing_notes: string | null
  is_military: boolean
  billing_status: string
  billing_day: number | null
  rate_tier: number
  rate_tier_override: boolean
  rate_tier_reason: string | null
  card_brand: string | null
  card_last_four: string | null
  balance: number
  square_customer_id: string | null
  created_at: string
  primary_location_id: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  emergency_contact_relationship: string | null
  scheduling_notes: string | null
  lifetime_paid_cents: number | null
  overdue_balance_cents: number | null
  contract_status: string | null
  // Computed
  activeStudentCount: number
  hasOverdueInvoice: boolean
  paymentStatus: 'current' | 'overdue' | 'scheduled' | 'paused' | 'no_invoice' | 'cancelled'
  overdueAmountDisplay: string | null
  monthlyTotalCents: number
  latestInvoice: { status: string; amountCents: number; date: string } | null
  instrumentList: string[]
  students: FamilyStudent[]
  teacherNames: string[]
  locationName: string | null
  locationColor: string | null
  sessionDays?: string[]
  totalSessionsPerMonth?: number
}

// ═══════════════════════════════════════
// HOOKS — LIST PAGE
// ═══════════════════════════════════════

export function useFamiliesPage() {
  return useQuery({
    queryKey: ['families_page'],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data: families, error } = await supabase
        .from('families')
        .select('*')
        .order('name')
      if (error) throw error

      // Get all students with teacher info
      const { data: students } = await supabase
        .from('students')
        .select('id, family_id, first_name, last_name, instrument, status, teacher_id, student_display_id')
        .order('last_name')

      // Get teacher names
      const teacherIds = [...new Set((students ?? []).filter((s) => s.teacher_id).map((s) => s.teacher_id!))]
      const teacherMap = new Map<string, string>()
      if (teacherIds.length > 0) {
        const { data: teachers } = await supabase
          .from('teachers')
          .select('id, first_name, last_name, profile:profiles!teachers_profile_id_fkey(first_name, last_name)')
          .in('id', teacherIds)
        teachers?.forEach((t: any) => {
          teacherMap.set(t.id, `${t.first_name ?? t.profile?.first_name ?? ''} ${t.last_name ?? t.profile?.last_name ?? ''}`.trim())
        })
      }

      // Get locations for color mapping
      const { data: locations } = await supabase
        .from('locations')
        .select('id, name, color')
      const locMap = new Map<string, { name: string; color: string }>()
      locations?.forEach((l: any) => locMap.set(l.id, { name: l.name.replace(' Music Lessons', ''), color: l.color ?? '#D4226A' }))

      // Check for overdue invoices per family (invoice_tokens + square_invoices)
      const today = new Date().toISOString().slice(0, 10)
      const { data: overdueTokens } = await supabase
        .from('invoice_tokens')
        .select('family_id')
        .not('status', 'in', '("paid","cancelled","expired")')
        .lt('due_date', today)
      const overdueSet = new Set((overdueTokens ?? []).map((t: any) => t.family_id))

      // Monthly totals from student_effective_rate view
      const { data: effectiveRates } = await supabase
        .from('student_effective_rate')
        .select('family_id, monthly_cents')
      const monthlyByFamily = new Map<string, number>()
      for (const r of (effectiveRates ?? [])) {
        monthlyByFamily.set(r.family_id, (monthlyByFamily.get(r.family_id) ?? 0) + (r.monthly_cents ?? 0))
      }

      // Square invoice status per family — latest invoice + status flags
      const { data: squareInvoices } = await supabase
        .from('square_invoices')
        .select('family_id, status, requested_amount, amount_paid, due_date, invoice_date')
        .not('family_id', 'is', null)
        .not('status', 'in', '("CANCELED","DRAFT")')
        .order('invoice_date', { ascending: false })
      const squareByFamily = new Map<string, { hasScheduled: boolean; hasOverdue: boolean; hasPaid: boolean; overdueCents: number; latest: { status: string; amountCents: number; date: string } | null }>()
      for (const inv of (squareInvoices ?? [])) {
        const entry = squareByFamily.get(inv.family_id) ?? { hasScheduled: false, hasOverdue: false, hasPaid: false, overdueCents: 0, latest: null }
        const s = (inv.status ?? '').toUpperCase()
        if (s === 'SCHEDULED' || s === 'RECURRING') entry.hasScheduled = true
        if (s === 'PAID' || s === 'PARTIALLY_REFUNDED') entry.hasPaid = true
        if (s === 'UNPAID' && inv.due_date && inv.due_date < today) {
          entry.hasOverdue = true
          entry.overdueCents += (inv.requested_amount ?? 0) - (inv.amount_paid ?? 0)
        }
        // Keep the most recent invoice (already sorted desc)
        if (!entry.latest) {
          const amt = s === 'PARTIALLY_REFUNDED' ? (inv.amount_paid ?? 0) : (inv.requested_amount ?? 0)
          entry.latest = { status: s, amountCents: amt, date: inv.due_date ?? inv.invoice_date ?? '' }
        }
        squareByFamily.set(inv.family_id, entry)
      }

      // Group students by family
      const familyStudents = new Map<string, FamilyStudent[]>()
      students?.forEach((s: any) => {
        const list = familyStudents.get(s.family_id) ?? []
        list.push({
          ...s,
          teacher_name: s.teacher_id ? teacherMap.get(s.teacher_id) ?? '---' : '---',
        })
        familyStudents.set(s.family_id, list)
      })

      return families.map((f: any) => {
        const studs = familyStudents.get(f.id) ?? []
        const activeStuds = studs.filter((s) => s.status === 'active')
        const instruments = [...new Set(activeStuds.map((s) => s.instrument).filter(Boolean))]
        const tNames = [...new Set(
          activeStuds
            .map((s) => s.teacher_id ? teacherMap.get(s.teacher_id!) : null)
            .filter(Boolean) as string[]
        )]
        const loc = f.primary_location_id ? locMap.get(f.primary_location_id) : null
        return {
          ...f,
          billing_status: f.billing_status ?? 'active',
          rate_tier: f.rate_tier ?? DEFAULT_RATE_TIER_CENTS,
          balance: f.balance ?? 0,
          activeStudentCount: activeStuds.length,
          instrumentList: instruments,
          students: studs,
          teacherNames: tNames,
          locationName: loc?.name ?? null,
          locationColor: loc?.color ?? null,
          hasOverdueInvoice: overdueSet.has(f.id) || (f.overdue_balance_cents ?? 0) > 0 || (squareByFamily.get(f.id)?.hasOverdue ?? false),
          paymentStatus: (() => {
            const bs = f.billing_status ?? 'active'
            if (bs === 'cancelled') return 'cancelled' as const
            if (bs === 'paused') return 'paused' as const
            const sq = squareByFamily.get(f.id)
            const isOverdue = overdueSet.has(f.id) || (f.overdue_balance_cents ?? 0) > 0 || (sq?.hasOverdue ?? false)
            if (isOverdue) return 'overdue' as const
            if (sq?.hasScheduled) return 'scheduled' as const
            if (sq?.hasPaid) return 'current' as const
            if (activeStuds.length > 0 && !sq) return 'no_invoice' as const
            return 'current' as const
          })(),
          overdueAmountDisplay: (() => {
            const sq = squareByFamily.get(f.id)
            const cents = (f.overdue_balance_cents ?? 0) || (sq?.overdueCents ?? 0)
            return cents > 0 ? `$${(cents / 100).toFixed(0)}` : null
          })(),
          monthlyTotalCents: monthlyByFamily.get(f.id) ?? 0,
          latestInvoice: squareByFamily.get(f.id)?.latest ?? null,
        } as Family
      })
    },
  })
}

// ═══════════════════════════════════════
// HOOKS — DETAIL
// ═══════════════════════════════════════

export function useFamilyDetail(familyId: string | undefined) {
  return useQuery({
    queryKey: ['family_detail', familyId],
    enabled: !!familyId,
    queryFn: async () => {
      const { data: family, error } = await supabase
        .from('families')
        .select('*')
        .eq('id', familyId!)
        .single()
      if (error) throw error

      const { data: students } = await supabase
        .from('students')
        .select('id, first_name, last_name, instrument, status, teacher_id, sessions_per_month, pause_reason, deactivated_at, created_at')
        .eq('family_id', familyId!)
        .order('status')
        .order('last_name')

      // Resolve teacher names
      const teacherIds = [...new Set((students ?? []).filter((s) => s.teacher_id).map((s) => s.teacher_id!))]
      const teacherMap = new Map<string, string>()
      if (teacherIds.length > 0) {
        const { data: teachers } = await supabase
          .from('teachers')
          .select('id, first_name, last_name, profile:profiles!teachers_profile_id_fkey(first_name, last_name)')
          .in('id', teacherIds)
        teachers?.forEach((t: any) => {
          teacherMap.set(t.id, `${t.first_name ?? t.profile?.first_name ?? ''} ${t.last_name ?? t.profile?.last_name ?? ''}`.trim())
        })
      }

      const studs: FamilyStudent[] = (students ?? []).map((s: any) => ({
        ...s,
        teacher_name: s.teacher_id ? teacherMap.get(s.teacher_id) ?? '---' : '---',
      }))

      const activeStuds = studs.filter((s) => s.status === 'active')
      const instruments = [...new Set(activeStuds.map((s) => s.instrument).filter(Boolean))]
      const tNames = [...new Set(activeStuds.map((s) => s.teacher_name).filter((n) => n && n !== '---') as string[])]

      // Get session days from schedule_blocks for active students
      const activeStudentIds = activeStuds.map((s) => s.id)
      let sessionDays: string[] = []
      if (activeStudentIds.length > 0) {
        const todayStr = new Date().toISOString().split('T')[0]
        const blocks = await batchIn('schedule_blocks', 'block_date', 'student_id', activeStudentIds, (q: any) =>
          q.eq('status', 'booked').gte('block_date', todayStr)
        )
        if (blocks && blocks.length > 0) {
          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
          const daySet = new Set(blocks.map((b: any) => dayNames[new Date(b.block_date + 'T12:00:00').getDay()]))
          const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
          sessionDays = order.filter((d) => daySet.has(d))
        }
      }

      const totalSessionsPerMonth = activeStuds.reduce((sum, s) => sum + (s.sessions_per_month ?? DEFAULT_SESSIONS_PER_MONTH), 0)

      // Resolve location name
      const { data: locations } = await supabase.from('locations').select('id, name, color')
      const locMap = new Map<string, { name: string; color: string }>()
      locations?.forEach((l: any) => locMap.set(l.id, { name: l.name.replace(' Music Lessons', ''), color: l.color ?? '#D4226A' }))
      const loc = family.primary_location_id ? locMap.get(family.primary_location_id) : null

      return {
        ...family,
        billing_status: family.billing_status ?? 'active',
        rate_tier: family.rate_tier ?? DEFAULT_RATE_TIER_CENTS,
        balance: family.balance ?? 0,
        activeStudentCount: activeStuds.length,
        instrumentList: instruments,
        students: studs,
        teacherNames: tNames,
        sessionDays,
        totalSessionsPerMonth,
        locationName: loc?.name ?? null,
        locationColor: loc?.color ?? null,
      } as Family
    },
  })
}

// ═══════════════════════════════════════
// HOOKS — UPDATE FAMILY
// ═══════════════════════════════════════

export function useUpdateFamilyInfo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: {
      id: string
      name?: string
      parent_name?: string
      parent_first_name?: string
      parent_last_name?: string
      primary_contact_name?: string
      primary_email?: string
      primary_phone?: string
      billing_notes?: string
      is_military?: boolean
      emergency_contact_name?: string
      emergency_contact_phone?: string
      emergency_contact_relationship?: string
      scheduling_notes?: string
    }) => {
      const { error } = await supabase.from('families').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['families'] })
      qc.invalidateQueries({ queryKey: ['families_page'] })
      qc.invalidateQueries({ queryKey: ['family'] })
      qc.invalidateQueries({ queryKey: ['family_detail', vars.id] })
    },
  })
}

// ═══════════════════════════════════════
// HOOKS — BILLING STATUS
// ═══════════════════════════════════════

export function useChangeFamilyBillingStatus() {
  const qc = useQueryClient()
  const { user } = useAuthContext()
  return useMutation({
    mutationFn: async (params: { familyId: string; oldStatus: string; newStatus: string }) => {
      const { error } = await supabase
        .from('families')
        .update({ billing_status: params.newStatus })
        .eq('id', params.familyId)
      if (error) throw error

      await supabase.from('audit_log').insert({
        entity_type: 'family',
        entity_id: params.familyId,
        action: 'BILLING_STATUS_CHANGED',
        old_value: params.oldStatus,
        new_value: params.newStatus,
        performed_by: user?.id ?? null,
      })
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['families'] })
      qc.invalidateQueries({ queryKey: ['families_page'] })
      qc.invalidateQueries({ queryKey: ['family'] })
      qc.invalidateQueries({ queryKey: ['family_detail', vars.familyId] })
      qc.invalidateQueries({ queryKey: ['family_billing', vars.familyId] })
    },
  })
}

// ═══════════════════════════════════════
// HOOKS — FAMILY FILES
// ═══════════════════════════════════════

export function useFamilyFiles(familyId: string | undefined) {
  return useQuery({
    queryKey: ['family_files', familyId],
    enabled: !!familyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('family_files')
        .select('*')
        .eq('family_id', familyId!)
        .order('created_at', { ascending: false })
      if (error) throw error

      // Resolve uploader names
      const uploaderIds = [...new Set((data ?? []).filter((f: any) => f.uploaded_by).map((f: any) => f.uploaded_by))]
      const uploaderMap = new Map<string, string>()
      if (uploaderIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', uploaderIds)
        profiles?.forEach((p: any) => {
          uploaderMap.set(p.id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim())
        })
      }

      return (data ?? []).map((f: any) => ({
        ...f,
        uploader_name: f.uploaded_by ? uploaderMap.get(f.uploaded_by) ?? 'Unknown' : 'Unknown',
      })) as FamilyFile[]
    },
  })
}

export function useUploadFamilyFile() {
  const qc = useQueryClient()
  const { profile } = useAuthContext()
  return useMutation({
    mutationFn: async (params: {
      tenantId: string
      familyId: string
      file: File
      fileType: string
      notes?: string
    }) => {
      const ts = Date.now()
      const safeName = params.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${params.tenantId}/families/${params.familyId}/${params.fileType}/${ts}_${safeName}`

      const { error: uploadErr } = await supabase.storage
        .from('family-files')
        .upload(path, params.file)
      if (uploadErr) throw uploadErr

      const { data: urlData } = supabase.storage
        .from('family-files')
        .getPublicUrl(path)

      const { error: dbErr } = await supabase
        .from('family_files')
        .insert({
          tenant_id: params.tenantId,
          family_id: params.familyId,
          file_type: params.fileType,
          file_name: params.file.name,
          file_url: urlData.publicUrl,
          file_size_bytes: params.file.size,
          uploaded_by: profile?.id ?? null,
          notes: params.notes || null,
        })
      if (dbErr) throw dbErr

      // Auto-resolve matching system tasks
      const dedupMap: Record<string, string> = {
        contract: `missing_contract:${params.familyId}`,
        enrollment_form: `missing_enrollment:${params.familyId}`,
      }
      const dedupKey = dedupMap[params.fileType]
      if (dedupKey) {
        const { data: task } = await supabase
          .from('tasks')
          .select('id')
          .eq('dedup_key', dedupKey)
          .in('status', ['pending', 'in_progress'])
          .maybeSingle()
        if (task) {
          await supabase.from('tasks').update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            completion_note: `Auto-completed: ${params.fileType.replace('_', ' ')} file uploaded`,
            file_verified: true,
          }).eq('id', task.id)
        }
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['family_files', vars.familyId] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

export function useDeleteFamilyFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { fileId: string; familyId: string; fileUrl: string }) => {
      const urlParts = params.fileUrl.split('/family-files/')
      if (urlParts.length > 1) {
        await supabase.storage.from('family-files').remove([urlParts[1]])
      }
      const { error } = await supabase.from('family_files').delete().eq('id', params.fileId)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['family_files', vars.familyId] })
    },
  })
}

// ═══════════════════════════════════════
// HOOKS — ACTIVITY LOG
// ═══════════════════════════════════════

export interface ActivityEvent {
  id: string
  date: string
  type: 'session_completed' | 'sub_session' | 'callout' | 'fifth_week' | 'cancelled' | 'billing_status' | 'payment_failed' | 'rate_changed' | 'notification' | 'other'
  description: string
  detail?: string
}

export function useFamilyActivityLog(familyId: string | undefined, limit = 20) {
  return useQuery({
    queryKey: ['family_activity', familyId, limit],
    enabled: !!familyId,
    queryFn: async () => {
      // 1. Get student IDs for this family
      const { data: students } = await supabase
        .from('students')
        .select('id, first_name, last_name, instrument')
        .eq('family_id', familyId!)
      const studentIds = (students ?? []).map((s) => s.id)
      const studentMap = new Map((students ?? []).map((s) => [s.id, s]))

      // 2. Get teacher names for resolving
      const { data: allTeachers } = await supabase
        .from('teachers')
        .select('id, first_name, last_name')
      const teacherMap = new Map((allTeachers ?? []).map((t: any) => [t.id, `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim()]))

      const events: ActivityEvent[] = []

      // 3. Schedule blocks events (batched to avoid URL length limits)
      if (studentIds.length > 0) {
        const blocks = await batchIn(
          'schedule_blocks',
          'id, block_date, status, checked_in, callout_reason, fifth_week, teacher_id, student_id, original_teacher_id, original_teacher_name, block_type',
          'student_id', studentIds,
          (q: any) => q.order('block_date', { ascending: false }).limit(limit * 2)
        )

        for (const b of blocks) {
          const stu = studentMap.get(b.student_id)
          const stuName = stu ? `${stu.first_name} ${stu.last_name}` : 'Unknown'
          const teacherName = b.teacher_id ? teacherMap.get(b.teacher_id) ?? 'Unknown' : 'Unknown'
          const instrument = stu?.instrument ? stu.instrument.charAt(0).toUpperCase() + stu.instrument.slice(1) : ''
          const dateStr = b.block_date

          if (b.checked_in) {
            if (b.original_teacher_name) {
              events.push({
                id: `block-sub-${b.id}`,
                date: dateStr,
                type: 'sub_session',
                description: 'Sub session completed',
                detail: `${b.original_teacher_name} called out → ${teacherName} covered · ${stuName}`,
              })
            } else {
              events.push({
                id: `block-done-${b.id}`,
                date: dateStr,
                type: 'session_completed',
                description: 'Session completed',
                detail: `${teacherName}${instrument ? ` · ${instrument}` : ''} · ${stuName}`,
              })
            }
          } else if (b.callout_reason) {
            events.push({
              id: `block-callout-${b.id}`,
              date: dateStr,
              type: 'callout',
              description: 'Teacher callout',
              detail: `${teacherName} · Reason: ${b.callout_reason} · ${stuName}`,
            })
          } else if (b.fifth_week) {
            events.push({
              id: `block-5th-${b.id}`,
              date: dateStr,
              type: 'fifth_week',
              description: '5th week session',
              detail: `${teacherName} · ${stuName}`,
            })
          } else if (b.status === 'cancelled') {
            events.push({
              id: `block-cancel-${b.id}`,
              date: dateStr,
              type: 'cancelled',
              description: 'Session cancelled',
              detail: `${teacherName} · ${stuName}`,
            })
          }
        }
      }

      // 4. Audit log events for family + students
      const recordIds = [familyId!, ...studentIds]
      const { data: auditRows } = await supabase
        .from('audit_log')
        .select('id, action, old_value, new_value, reason, performed_by, created_at')
        .in('record_id', recordIds)
        .order('created_at', { ascending: false })
        .limit(limit)

      // Resolve performer names
      const performerIds = [...new Set((auditRows ?? []).filter((r: any) => r.performed_by).map((r: any) => r.performed_by))]
      const performerMap = new Map<string, string>()
      if (performerIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name').in('id', performerIds)
        profiles?.forEach((p: any) => performerMap.set(p.id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()))
      }

      for (const row of (auditRows ?? [])) {
        const dateStr = row.created_at?.split('T')[0] ?? ''
        const performer = row.performed_by ? performerMap.get(row.performed_by) ?? 'System' : 'System'

        if (row.action === 'BILLING_STATUS_CHANGED') {
          events.push({
            id: `audit-${row.id}`,
            date: dateStr,
            type: 'billing_status',
            description: 'Billing status changed',
            detail: `${row.old_value ?? '?'} → ${row.new_value ?? '?'} · By: ${performer}`,
          })
        } else if (row.action === 'PAYMENT_FAILED') {
          events.push({
            id: `audit-${row.id}`,
            date: dateStr,
            type: 'payment_failed',
            description: 'Payment failed',
            detail: row.reason ?? undefined,
          })
        } else if (row.action === 'RATE_TIER_CHANGED') {
          events.push({
            id: `audit-${row.id}`,
            date: dateStr,
            type: 'rate_changed',
            description: 'Rate updated',
            detail: `$${((Number(row.old_value) || 0) / 100).toFixed(2)} → $${((Number(row.new_value) || 0) / 100).toFixed(2)}${row.reason ? ` · ${row.reason}` : ''}`,
          })
        } else {
          events.push({
            id: `audit-${row.id}`,
            date: dateStr,
            type: 'other',
            description: row.action?.replace(/_/g, ' ').toLowerCase() ?? 'Event',
            detail: row.reason ?? undefined,
          })
        }
      }

      // 4b. Appointment notifications for this family's students
      if (studentIds.length > 0) {
        // Get block IDs for these students
        const { data: familyBlocks } = await supabase
          .from('schedule_blocks')
          .select('id')
          .in('student_id', studentIds)
          .limit(200)
        const blockIds = (familyBlocks ?? []).map((b: any) => b.id)

        if (blockIds.length > 0) {
          const notifs = await batchIn(
            'appointment_notifications',
            'id, event_type, channel, recipient_type, recipient_name, success, sent_at',
            'block_id', blockIds,
            (q: any) => q.order('sent_at', { ascending: false }).limit(limit)
          )

          const eventLabels: Record<string, string> = {
            booked: 'Session booked', cancelled: 'Session cancelled', rescheduled: 'Session rescheduled',
            reminder_24hr: '24hr reminder', reminder_4hr: '4hr reminder', reminder_1hr: '1hr reminder',
            virtual_converted: 'Virtual session',
          }

          for (const n of notifs) {
            const channelLabel = n.channel === 'sms' ? 'SMS' : 'Email'
            events.push({
              id: `notif-${n.id}`,
              date: n.sent_at?.split('T')[0] ?? '',
              type: 'notification',
              description: `${channelLabel} sent to ${n.recipient_name ?? n.recipient_type}`,
              detail: eventLabels[n.event_type] ?? n.event_type,
            })
          }
        }
      }

      // 5. Sort by date DESC, limit
      events.sort((a, b) => b.date.localeCompare(a.date))
      return events.slice(0, limit)
    },
  })
}
