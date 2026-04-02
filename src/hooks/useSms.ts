import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'

// ─── SMS Templates ───────────────────────────────────

export const SMS_TEMPLATES = {
  session_reminder: (data: { studentName: string; instrument: string; time: string; teacherName: string; locationName: string }) =>
    `Reminder: ${data.studentName} has ${data.instrument} tomorrow at ${data.time} with ${data.teacherName}. See you at ${data.locationName}!`,

  progress_update: (data: { studentName: string; summary: string; appUrl: string }) =>
    `${data.studentName} had a great session today! ${data.summary} Full update: ${data.appUrl}/parent`,

  retention_wave1: (data: { studentName: string; appUrl: string }) =>
    `See what ${data.studentName} accomplished this semester → ${data.appUrl}/parent. Summer is the best time to keep the momentum going!`,

  win_back: (data: { studentName: string; schoolName: string; teacherName: string }) =>
    `We miss ${data.studentName} at ${data.schoolName}! ${data.teacherName} has spots available. Ready to come back? Reply YES or tap here to schedule.`,

  autopay_nudge: (data: { appUrl: string }) =>
    `Quick one — set up auto-pay and never think about your music invoice again. Takes 30 seconds: ${data.appUrl}/parent`,
}

// ─── Normalize phone to E.164 ────────────────────────

export function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.startsWith('+')) return phone.replace(/[^\d+]/g, '')
  return null
}

// ─── Send SMS ────────────────────────────────────────

export function useSendSms() {
  const { tenantId } = useAuthContext()

  return useMutation({
    mutationFn: async (params: { to: string; body: string; familyId?: string }) => {
      if (!tenantId) throw new Error('No tenant')

      // Check opt-out
      if (params.familyId) {
        const { data: family } = await supabase.from('families').select('sms_opted_out').eq('id', params.familyId).single()
        if (family?.sms_opted_out) return { sent: false, reason: 'opted_out' }
      }

      const normalized = normalizePhone(params.to)
      if (!normalized) return { sent: false, reason: 'invalid_phone' }

      // Don't send in dev
      if (window.location.hostname === 'localhost') {
        console.log('[SMS] Dev skip:', normalized, params.body)
        return { sent: false, reason: 'dev_environment' }
      }

      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token

      try {
        const res = await fetch('https://dhsyxyhtoadrqfrlmsqe.supabase.co/functions/v1/send-sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ to: normalized, body: params.body, tenant_id: tenantId }),
        })
        if (!res.ok) return { sent: false, reason: await res.text() }
        return { sent: true }
      } catch (err) {
        return { sent: false, reason: String(err) }
      }
    },
  })
}

// ─── Batch SMS ───────────────────────────────────────

export function useBatchSendSms() {
  const sendSms = useSendSms()
  return useMutation({
    mutationFn: async (messages: Array<{ to: string; body: string; familyId?: string }>) => {
      let sent = 0, failed = 0
      for (let i = 0; i < messages.length; i += 10) {
        const batch = messages.slice(i, i + 10)
        const results = await Promise.allSettled(batch.map(m => sendSms.mutateAsync(m)))
        results.forEach(r => {
          if (r.status === 'fulfilled' && r.value.sent) sent++
          else failed++
        })
        if (i + 10 < messages.length) await new Promise(r => setTimeout(r, 1000))
      }
      return { sent, failed }
    },
  })
}

// ─── SMS Stats ───────────────────────────────────────

export function useSmsStats() {
  const { tenantId } = useAuthContext()
  return useQuery({
    queryKey: ['sms-stats', tenantId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async () => {
      const { count: optOuts } = await supabase.from('families').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId!).eq('sms_opted_out', true)
      return { optOuts: optOuts ?? 0 }
    },
  })
}
