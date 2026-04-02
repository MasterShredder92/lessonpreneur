import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'

// ─── Types ───────────────────────────────────────────

export interface AutoPayFamily {
  familyId: string
  familyName: string
  email: string | null
  locationName: string | null
  studentCount: number
  nudgesSent: number
  lastNudgeDate: string | null
}

export interface AutoPayStats {
  totalFamilies: number
  manualPayFamilies: number
  autoPayFamilies: number
  autoPayPercent: number
  nudgesSent: number
}

// ─── Auto-pay stats ──────────────────────────────────

export function useAutoPayStats() {
  const { tenantId } = useAuthContext()
  return useQuery<AutoPayStats>({
    queryKey: ['autopay-stats', tenantId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async () => {
      // Get all active families
      const { data: families } = await supabase
        .from('families')
        .select('id, card_last_four')
        .eq('billing_status', 'active')
        .eq('tenant_id', tenantId!)

      const total = (families ?? []).length
      const withCard = (families ?? []).filter(f => !!f.card_last_four).length
      const withoutCard = total - withCard

      // Get nudge count
      const { count } = await supabase
        .from('retention_campaigns')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId!)
        .eq('campaign_type', 'autopay_nudge')
        .in('status', ['sent', 'read', 'actioned'])

      return {
        totalFamilies: total,
        manualPayFamilies: withoutCard,
        autoPayFamilies: withCard,
        autoPayPercent: total > 0 ? Math.round((withCard / total) * 100) : 0,
        nudgesSent: count ?? 0,
      }
    },
  })
}

// ─── Manual-pay families needing nudges ──────────────

export function useManualPayFamilies() {
  const { tenantId } = useAuthContext()
  return useQuery<AutoPayFamily[]>({
    queryKey: ['manual-pay-families', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      // Families without card on file
      const { data: families } = await supabase
        .from('families')
        .select('id, name, primary_email, primary_location_id')
        .eq('billing_status', 'active')
        .eq('tenant_id', tenantId!)
        .or('card_last_four.is.null,card_last_four.eq.')

      if (!families || families.length === 0) return []

      const familyIds = families.map(f => f.id)

      // Count students per family
      const { data: students } = await supabase
        .from('students')
        .select('family_id')
        .in('family_id', familyIds)
        .eq('status', 'active')

      const studentCountMap = new Map<string, number>()
      students?.forEach((s: any) => studentCountMap.set(s.family_id, (studentCountMap.get(s.family_id) ?? 0) + 1))

      // Get nudge history
      const { data: nudges } = await supabase
        .from('retention_campaigns')
        .select('family_id, sent_at')
        .eq('tenant_id', tenantId!)
        .eq('campaign_type', 'autopay_nudge')
        .in('family_id', familyIds)
        .in('status', ['sent', 'read', 'actioned'])
        .order('sent_at', { ascending: false })

      const nudgeCountMap = new Map<string, number>()
      const lastNudgeMap = new Map<string, string>()
      nudges?.forEach((n: any) => {
        nudgeCountMap.set(n.family_id, (nudgeCountMap.get(n.family_id) ?? 0) + 1)
        if (!lastNudgeMap.has(n.family_id)) lastNudgeMap.set(n.family_id, n.sent_at)
      })

      // Locations
      const locIds = [...new Set(families.map(f => f.primary_location_id).filter(Boolean))]
      const locMap = new Map<string, string>()
      if (locIds.length > 0) {
        const { data: locs } = await supabase.from('locations').select('id, name').in('id', locIds)
        locs?.forEach((l: any) => locMap.set(l.id, l.name?.replace(' Music Lessons', '') ?? ''))
      }

      return families.map((f: any): AutoPayFamily => ({
        familyId: f.id,
        familyName: f.name,
        email: f.primary_email,
        locationName: locMap.get(f.primary_location_id ?? '') ?? null,
        studentCount: studentCountMap.get(f.id) ?? 0,
        nudgesSent: nudgeCountMap.get(f.id) ?? 0,
        lastNudgeDate: lastNudgeMap.get(f.id) ?? null,
      })).filter(f => f.studentCount > 0) // only families with active students
    },
  })
}

// ─── Send nudge to a family ──────────────────────────

export function useSendAutoPayNudge() {
  const { tenantId } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (family: AutoPayFamily) => {
      if (!tenantId) throw new Error('No tenant')
      const waveNumber = family.nudgesSent + 1
      if (waveNumber > 3) throw new Error('Max 3 nudges per family')

      const messages: Record<number, string> = {
        1: `Quick heads up — you can set up automatic payments so you never have to think about your monthly invoice again. One less thing to worry about. Tap below to set it up — takes about 30 seconds.`,
        2: `Just a reminder — auto-pay means no late fees, no missed sessions, and one less task on your plate each month. Families on auto-pay never have an interruption. Takes 30 seconds to set up.`,
        3: `Families on auto-pay never miss a beat. Set it up once and forget about it — your student's sessions continue uninterrupted month after month. This is the last reminder we'll send.`,
      }

      const subjects: Record<number, string> = {
        1: 'Set up auto-pay in 30 seconds',
        2: 'Reminder: auto-pay saves you time',
        3: 'Final reminder: set up auto-pay',
      }

      // Get a student for this family (for the communications table)
      const { data: student } = await supabase.from('students').select('id').eq('family_id', family.familyId).eq('status', 'active').limit(1).single()

      // Save to communications
      const { data: comm } = await supabase.from('communications').insert({
        tenant_id: tenantId,
        student_id: student?.id ?? null,
        family_id: family.familyId,
        type: 'announcement',
        subject: subjects[waveNumber],
        body: messages[waveNumber],
        channel: 'in_app',
        status: 'sent',
        sent_at: new Date().toISOString(),
      }).select('id').single()

      // Save campaign record
      await supabase.from('retention_campaigns').insert({
        tenant_id: tenantId,
        student_id: student?.id ?? '00000000-0000-0000-0000-000000000000',
        family_id: family.familyId,
        campaign_type: 'autopay_nudge',
        wave_number: waveNumber,
        subject: subjects[waveNumber],
        body: messages[waveNumber],
        status: 'sent',
        sent_at: new Date().toISOString(),
        communication_id: comm?.id ?? null,
      })

      return { waveNumber }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['autopay-stats'] })
      qc.invalidateQueries({ queryKey: ['manual-pay-families'] })
      qc.invalidateQueries({ queryKey: ['family-communications'] })
    },
  })
}

// ─── Bulk send nudges to all eligible families ───────

export function useBulkAutoPayNudge() {
  const { tenantId } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (families: AutoPayFamily[]) => {
      if (!tenantId) throw new Error('No tenant')
      let sent = 0, skipped = 0

      for (const fam of families) {
        if (fam.nudgesSent >= 3) { skipped++; continue }

        // Check minimum 14 days between nudges
        if (fam.lastNudgeDate) {
          const daysSince = Math.floor((Date.now() - new Date(fam.lastNudgeDate).getTime()) / 86400000)
          if (daysSince < 14) { skipped++; continue }
        }

        const waveNumber = fam.nudgesSent + 1
        const messages: Record<number, string> = {
          1: `Quick heads up — you can set up automatic payments so you never have to think about your monthly invoice again. One less thing to worry about.`,
          2: `Just a reminder — auto-pay means no late fees, no missed sessions, and one less task on your plate each month. Takes 30 seconds to set up.`,
          3: `Families on auto-pay never miss a beat. Set it up once and forget about it — your student's sessions continue uninterrupted. This is the last reminder.`,
        }
        const subjects: Record<number, string> = { 1: 'Set up auto-pay', 2: 'Reminder: auto-pay', 3: 'Final reminder: auto-pay' }

        const { data: student } = await supabase.from('students').select('id').eq('family_id', fam.familyId).eq('status', 'active').limit(1).single()

        const { data: comm } = await supabase.from('communications').insert({
          tenant_id: tenantId, student_id: student?.id ?? null, family_id: fam.familyId,
          type: 'announcement', subject: subjects[waveNumber], body: messages[waveNumber],
          channel: 'in_app', status: 'sent', sent_at: new Date().toISOString(),
        }).select('id').single()

        await supabase.from('retention_campaigns').insert({
          tenant_id: tenantId, student_id: student?.id ?? '00000000-0000-0000-0000-000000000000',
          family_id: fam.familyId, campaign_type: 'autopay_nudge', wave_number: waveNumber,
          subject: subjects[waveNumber], body: messages[waveNumber],
          status: 'sent', sent_at: new Date().toISOString(), communication_id: comm?.id ?? null,
        })

        sent++
      }

      return { sent, skipped }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['autopay-stats'] })
      qc.invalidateQueries({ queryKey: ['manual-pay-families'] })
    },
  })
}
