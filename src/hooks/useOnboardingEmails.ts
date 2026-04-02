import { useMutation } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * Onboarding email sequence for new tenants.
 * 5 emails at days 0, 2, 5, 10, 13.
 * Each checks onboarding_emails_sent on the tenant to avoid duplicates.
 * Skips if tenant has already subscribed (plan = 'active').
 */

interface OnboardingEmail {
  key: string
  day: number
  subject: string
  body: string
}

const ONBOARDING_SEQUENCE: OnboardingEmail[] = [
  {
    key: 'welcome',
    day: 0,
    subject: 'Welcome to Lessonpreneur! Here\'s how to get started.',
    body: `Welcome to Lessonpreneur! We're excited to help you run your music school smarter.\n\nHere's your 3-step quick start:\n\n1. Add your first teacher — go to Teachers and click "+ Add Teacher"\n2. Import your students — go to Students and use "Import CSV" or add them one by one\n3. Set up your schedule — go to Schedule to see your weekly grid\n\nMost schools are fully set up in under an hour. If you need help, Star (our AI assistant) is always available in the sidebar.\n\nYou have 60 days to explore everything — no rush. Let's make this the best decision you've made for your school.`,
  },
  {
    key: 'import_students',
    day: 3,
    subject: 'The fastest way to get value from Lessonpreneur',
    body: `Quick tip: the single fastest way to start seeing value is to import your student list.\n\nGo to Students > Import CSV and upload your roster. Lessonpreneur will automatically:\n- Create family records\n- Set up billing tiers\n- Start tracking retention from day one\n\nOnce your students are in, have your teachers log their first sessions. That's when the magic starts — AI progress updates go out to parents automatically.\n\nYour students are waiting.`,
  },
  {
    key: 'first_insight',
    day: 7,
    subject: 'Your first AI insight is waiting',
    body: `Have your teachers logged a few sessions yet?\n\nHere's what happens when they do:\n1. Teacher opens their schedule, taps a student, logs the session in 45 seconds\n2. AI generates a warm, personalized progress update for the family\n3. Parents receive it automatically — in the app and via email\n4. You see everything in your dashboard: who's engaged, who's at risk\n\nThe more sessions logged, the smarter Lessonpreneur gets. Start today and watch the insights roll in.\n\nOpen Star in your sidebar and ask "How are we doing?" — it'll tell you.`,
  },
  {
    key: 'halfway_checkin',
    day: 30,
    subject: 'How\'s it going? Here\'s what you might have missed.',
    body: `You're 30 days into your Lessonpreneur trial — how's it going?\n\nHere are a few things you might not have tried yet:\n\n- Star AI Assistant: Open the sidebar and ask Star anything about your business\n- Retention Campaigns: Launch a summer retention wave from your dashboard\n- Financial Dashboard: See your real take-home in Financials\n- Parent Sharing: Parents can share 1080x1080 progress cards on social media\n- Practice Lab: Your students have interactive instruments to practice between sessions\n\nYou still have 30 days left. If you need help getting something set up, we're here.`,
  },
  {
    key: 'trial_warning',
    day: 50,
    subject: '10 days left — here\'s what you\'ll lose',
    body: `Your Lessonpreneur trial ends in 10 days.\n\nIf you don't subscribe, you'll lose access to:\n- AI progress updates for parents\n- Churn risk scoring and retention campaigns\n- Your financial dashboard and P&L tracking\n- Star AI assistant\n- Email notifications and session reminders\n- Everything you've set up\n\nThe good news: subscribing takes 30 seconds and your data stays exactly where it is.\n\nNo contracts. Cancel anytime.\n\nSubscribe now in Settings > Billing to keep your momentum going.`,
  },
  {
    key: 'final_reminder',
    day: 58,
    subject: 'Your trial expires in 2 days',
    body: `Your Lessonpreneur free trial ends in 2 days.\n\nAfter that, your access will be limited. Everything you've built — your students, your schedule, your session data — it's all safe. But you won't be able to use the platform until you subscribe.\n\nDon't let the momentum stop.\n\nSubscribe in Settings > Billing.`,
  },
]

export { ONBOARDING_SEQUENCE }

/**
 * Process onboarding emails for all trial tenants.
 * Call this from a scheduled function or admin action.
 */
export function useProcessOnboardingEmails() {
  return useMutation({
    mutationFn: async () => {
      const { data: tenants } = await supabase
        .from('tenants')
        .select('id, name, plan, created_at, onboarding_emails_sent, billing_email')
        .eq('plan', 'trial')

      if (!tenants || tenants.length === 0) return { processed: 0 }

      const now = Date.now()
      let processed = 0

      for (const tenant of tenants) {
        const sent = (tenant.onboarding_emails_sent ?? {}) as Record<string, boolean>
        const daysSinceCreation = Math.floor((now - new Date(tenant.created_at).getTime()) / 86400000)

        // Get owner email
        const { data: owner } = await supabase
          .from('profiles')
          .select('email, first_name')
          .eq('tenant_id', tenant.id)
          .eq('role', 'owner')
          .limit(1)
          .single()

        const email = tenant.billing_email ?? owner?.email
        if (!email) continue
        const firstName = owner?.first_name ?? 'there'

        for (const template of ONBOARDING_SEQUENCE) {
          if (sent[template.key]) continue // already sent
          if (daysSinceCreation < template.day) continue // not time yet

          // Send email
          const session = await supabase.auth.getSession()
          const token = session.data.session?.access_token

          try {
            await fetch('https://dhsyxyhtoadrqfrlmsqe.supabase.co/functions/v1/send-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({
                to: email,
                subject: template.subject,
                html: `<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#101018;border-radius:16px;color:#E0E0F4;">
                  <div style="text-align:center;margin-bottom:24px;font-size:14px;font-weight:700;color:#f59e0b;">Lessonpreneur</div>
                  <div style="font-size:20px;font-weight:800;color:#E0E0F4;margin-bottom:16px;">Hi ${firstName},</div>
                  <div style="font-size:15px;color:#C0C0E0;line-height:1.7;white-space:pre-line;">${template.body}</div>
                  <div style="text-align:center;margin-top:24px;">
                    <a href="https://app.lessonpreneur.io/admin/dashboard" style="display:inline-block;padding:12px 28px;border-radius:8px;background:#f59e0b;color:#000;text-decoration:none;font-weight:700;font-size:14px;">Open Lessonpreneur</a>
                  </div>
                  <div style="text-align:center;margin-top:16px;font-size:11px;color:#606088;">Lessonpreneur — The Operating System for Music Schools</div>
                </div>`,
                from_name: 'Lessonpreneur',
              }),
            })

            // Mark as sent
            sent[template.key] = true
            await supabase.from('tenants').update({ onboarding_emails_sent: sent }).eq('id', tenant.id)
            processed++
          } catch {
            // Skip on error — will retry next run
          }
        }
      }

      return { processed }
    },
  })
}
