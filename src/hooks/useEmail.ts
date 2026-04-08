import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import { EDGE_FUNCTIONS } from '../lib/config'
import type { EmailBrand } from '../lib/emailTemplates'

// ─── Types ───────────────────────────────────────────

export interface EmailRecord {
  id: string
  to_email: string
  subject: string
  status: 'queued' | 'sent' | 'failed'
  communication_id: string | null
  campaign_id: string | null
  created_at: string
  error: string | null
}

// ─── Get brand data for a location ───────────────────

export function useEmailBrand(locationId: string | null) {
  return useQuery<EmailBrand>({
    queryKey: ['email-brand', locationId],
    enabled: !!locationId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('brand_settings')
        .select('studio_name, primary_color, logo_circle_path, website_domain')
        .eq('location_id', locationId!)
        .single()

      const logoUrl = data?.logo_circle_path
        ? supabase.storage.from('brand-assets').getPublicUrl(data.logo_circle_path).data.publicUrl
        : null

      return {
        studioName: data?.studio_name ?? 'Adkins Music Lessons',
        primaryColor: data?.primary_color ?? '#D4226A',
        logoUrl,
        websiteDomain: data?.website_domain ?? 'lessonpreneur.io',
        appUrl: window.location.origin,
      }
    },
  })
}

// ─── Send email via Edge Function ────────────────────

export function useSendEmail() {
  const { tenantId } = useAuthContext()

  return useMutation({
    mutationFn: async (params: {
      to: string
      subject: string
      htmlBody: string
      fromName: string
      communicationId?: string
      campaignId?: string
    }) => {
      // Don't send in development
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return { sent: false, reason: 'dev_environment' }
      }

      if (!params.to || !params.to.includes('@')) {
        return { sent: false, reason: 'invalid_email' }
      }

      const session = await supabase.auth.getSession()
      const token = session.data.session?.access_token

      try {
        const res = await fetch(
          EDGE_FUNCTIONS.sendEmail,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              to: params.to,
              subject: params.subject,
              html: params.htmlBody,
              from_name: params.fromName,
              tenant_id: tenantId,
            }),
          }
        )

        if (!res.ok) {
          const err = await res.text()
          console.error('[Email] Send failed:', err)
          return { sent: false, reason: err }
        }

        return { sent: true }
      } catch (err) {
        console.error('[Email] Send error:', err)
        return { sent: false, reason: String(err) }
      }
    },
  })
}

// ─── Batch send emails with rate limiting ────────────

export function useBatchSendEmails() {
  const sendEmail = useSendEmail()

  return useMutation({
    mutationFn: async (emails: Array<{
      to: string
      subject: string
      htmlBody: string
      fromName: string
      communicationId?: string
    }>) => {
      let sent = 0, failed = 0

      // Process 10 at a time with 1s pause between batches
      for (let i = 0; i < emails.length; i += 10) {
        const batch = emails.slice(i, i + 10)
        const results = await Promise.allSettled(
          batch.map(e => sendEmail.mutateAsync(e))
        )

        results.forEach(r => {
          if (r.status === 'fulfilled' && r.value.sent) sent++
          else failed++
        })

        if (i + 10 < emails.length) {
          await new Promise(r => setTimeout(r, 1000))
        }
      }

      return { sent, failed, total: emails.length }
    },
  })
}

// ─── Helper: send email for a communication record ───

export async function sendEmailForCommunication(
  comm: { id: string; family_id: string; body: string; subject: string | null; type: string },
  locationId: string | null,
  sendFn: ReturnType<typeof useSendEmail>['mutateAsync']
) {
  // Look up family email
  const { data: family } = await supabase
    .from('families')
    .select('primary_email, name')
    .eq('id', comm.family_id)
    .single()

  if (!family?.primary_email) return

  // Get brand data
  const { data: brand } = locationId
    ? await supabase.from('brand_settings').select('studio_name, primary_color, logo_circle_path, website_domain').eq('location_id', locationId).single()
    : { data: null }

  const studioName = brand?.studio_name ?? 'Adkins Music Lessons'

  // Import template dynamically based on type
  const { campaignEmail } = await import('../lib/emailTemplates')
  const brandData: EmailBrand = {
    studioName,
    primaryColor: brand?.primary_color ?? '#D4226A',
    logoUrl: brand?.logo_circle_path ? supabase.storage.from('brand-assets').getPublicUrl(brand.logo_circle_path).data.publicUrl : null,
    websiteDomain: brand?.website_domain ?? 'lessonpreneur.io',
    appUrl: window.location.origin,
  }

  const email = campaignEmail(brandData, {
    subject: comm.subject ?? 'Update from your studio',
    heading: comm.subject ?? 'Update',
    body: comm.body,
  })

  await sendFn({
    to: family.primary_email,
    subject: email.subject,
    htmlBody: email.html,
    fromName: studioName,
    communicationId: comm.id,
  })
}
