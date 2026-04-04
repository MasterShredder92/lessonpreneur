/**
 * SignWell Webhook Handler
 *
 * Receives webhook events from SignWell when documents are signed.
 * Auto-attaches signed PDFs to teacher profiles in Supabase.
 *
 * Deploy: supabase functions deploy signwell-webhook --no-verify-jwt
 * URL:    https://dhsyxyhtoadrqfrlmsqe.supabase.co/functions/v1/signwell-webhook
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return json({ ok: true, skipped: 'invalid_json' })
  }

  const rawStatus = payload?.document?.status ?? payload?.status
  const documentStatus = rawStatus?.toLowerCase()
  const documentId = payload?.document?.id ?? payload?.id
  const documentName = payload?.document?.name ?? payload?.name ?? ''

  // Log every event to integration_events
  const logEvent = async (overrides: Record<string, unknown> = {}) => {
    await supabase.from('integration_events').insert({
      tenant_id: TENANT_ID,
      source: 'signwell',
      event_type: documentStatus === 'completed' ? 'document_completed' : (documentStatus ?? 'unknown'),
      payload,
      matched: false,
      ...overrides,
    })
  }

  // Only process completed documents
  if (documentStatus !== 'completed') {
    await logEvent()
    return json({ ok: true, skipped: 'not_completed' })
  }

  if (!documentId) {
    await logEvent({ error: 'missing_document_id' })
    return json({ ok: true, skipped: 'no_document_id' })
  }

  // ── Fetch full document from SignWell API ──────────────
  const signwellKey = Deno.env.get('SIGNWELL_API_KEY')
  if (!signwellKey) {
    await logEvent({ error: 'SIGNWELL_API_KEY not configured' })
    return json({ ok: true, error: 'missing_api_key' })
  }

  let doc: any
  try {
    const resp = await fetch(`https://www.signwell.com/api/v1/documents/${documentId}`, {
      headers: { 'X-Api-Key': signwellKey },
    })
    if (!resp.ok) {
      const errText = await resp.text()
      await logEvent({ error: `signwell_api_${resp.status}: ${errText}` })
      return json({ ok: true, error: 'signwell_api_error' })
    }
    doc = await resp.json()
  } catch (err: any) {
    await logEvent({ error: `signwell_fetch_failed: ${err.message}` })
    return json({ ok: true, error: 'signwell_fetch_failed' })
  }

  const recipients: any[] = doc.recipients ?? []
  if (recipients.length === 0) {
    await logEvent({ error: 'no_recipients_in_document' })
    return json({ ok: true, skipped: 'no_recipients' })
  }

  const isW9 = /w[-\s]?9/i.test(doc.name ?? documentName)
  let matchCount = 0

  // ── Process each recipient ─────────────────────────────
  for (const recipient of recipients) {
    const email = recipient.email?.toLowerCase()
    if (!email) continue

    // Find matching teacher
    const { data: teacher } = await supabase
      .from('teachers')
      .select('id, first_name, last_name')
      .eq('tenant_id', TENANT_ID)
      .ilike('email', email)
      .maybeSingle()

    if (!teacher) {
      await logEvent({
        event_type: 'document_completed',
        error: `no_teacher_match for ${email}`,
      })
      continue
    }

    matchCount++

    // ── Download signed PDF via /completed_pdf endpoint ─
    const folder = isW9 ? 'w9' : 'contracts'
    const storagePath = `${teacher.id}/${folder}/${documentId}.pdf`
    let storageUrl: string | null = null

    try {
      const pdfResp = await fetch(`https://www.signwell.com/api/v1/documents/${documentId}/completed_pdf`, {
        headers: { 'X-Api-Key': signwellKey },
      })
      if (!pdfResp.ok) throw new Error(`PDF endpoint returned ${pdfResp.status}`)

      const pdfBlob = await pdfResp.blob()
      const pdfBuffer = new Uint8Array(await pdfBlob.arrayBuffer())

      const { error: uploadErr } = await supabase.storage
        .from('teacher-documents')
        .upload(storagePath, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true,
        })

      if (uploadErr) {
        console.error('Storage upload error:', uploadErr)
      } else {
        const { data: urlData } = supabase.storage
          .from('teacher-documents')
          .getPublicUrl(storagePath)
        storageUrl = urlData?.publicUrl ?? null
      }
    } catch (err: any) {
      console.error('PDF download/upload failed:', err.message)
    }

    // ── Update teacher record ──────────────────────────
    if (isW9) {
      await supabase
        .from('teachers')
        .update({
          w9_status: 'complete',
          w9_completed_at: new Date().toISOString(),
        })
        .eq('id', teacher.id)
    } else {
      await supabase
        .from('teachers')
        .update({
          contract_status: 'signed',
          contract_signed_at: new Date().toISOString(),
          contract_pdf_url: storageUrl,
        })
        .eq('id', teacher.id)
    }

    // ── Audit log ──────────────────────────────────────
    await supabase.from('audit_log').insert({
      tenant_id: TENANT_ID,
      action: isW9 ? 'w9_signed' : 'contract_signed',
      table_name: 'teachers',
      record_id: teacher.id,
      new_value: {
        document_id: documentId,
        document_name: doc.name ?? documentName,
        signer_email: email,
        signer_name: recipient.name ?? `${teacher.first_name} ${teacher.last_name}`,
        storage_path: storagePath,
        is_w9: isW9,
      },
    })

    // ── Log matched event ──────────────────────────────
    await logEvent({
      matched: true,
      matched_entity: 'teacher',
      matched_entity_id: teacher.id,
    })
  }

  if (matchCount === 0) {
    await logEvent({ error: 'no_teacher_matches_found' })
  }

  return json({ ok: true, matched: matchCount })
})
