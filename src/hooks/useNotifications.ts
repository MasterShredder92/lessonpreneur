import { supabase } from '../lib/supabase'

export interface Notification {
  id: string
  type: string
  title: string
  body: string | null
  route: string | null
  reference_id: string | null
  reference_type: string | null
  read: boolean
  created_at: string
}

// ─── Create notification helper ──────────────────────

export async function createNotification(params: {
  tenantId: string
  profileId: string
  type: string
  title: string
  body?: string
  route?: string
  referenceId?: string
  referenceType?: string
}) {
  await supabase.from('notifications').insert({
    tenant_id: params.tenantId,
    profile_id: params.profileId,
    type: params.type,
    title: params.title,
    body: params.body ?? null,
    route: params.route ?? null,
    reference_id: params.referenceId ?? null,
    reference_type: params.referenceType ?? null,
  })
}
