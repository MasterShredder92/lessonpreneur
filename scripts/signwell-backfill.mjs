/**
 * SignWell Backfill Script
 *
 * Pulls all completed documents from SignWell and matches them
 * to teacher profiles in Supabase. Downloads signed PDFs and
 * uploads them to the teacher-documents storage bucket.
 *
 * Usage:
 *   SIGNWELL_API_KEY=xxx SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/signwell-backfill.mjs
 */

import { createClient } from '@supabase/supabase-js'

const SIGNWELL_API_KEY = process.env.SIGNWELL_API_KEY
const SUPABASE_URL = 'https://dhsyxyhtoadrqfrlmsqe.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const TENANT_ID = '00000000-0000-0000-0000-000000000001'

if (!SIGNWELL_API_KEY) { console.error('Missing SIGNWELL_API_KEY'); process.exit(1) }
if (!SUPABASE_SERVICE_ROLE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── Stats ────────────────────────────────────────────
const stats = {
  totalDocs: 0,
  synced: 0,
  alreadySynced: 0,
  noMatch: [],
  errors: [],
}

// ── SignWell API helpers ─────────────────────────────
async function signwellGet(path) {
  const resp = await fetch(`https://www.signwell.com/api/v1${path}`, {
    headers: { 'X-Api-Key': SIGNWELL_API_KEY },
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`SignWell ${resp.status}: ${text}`)
  }
  return resp.json()
}

async function fetchAllCompletedDocuments() {
  const allDocs = []
  let page = 1

  while (true) {
    console.log(`  Fetching page ${page}...`)
    const data = await signwellGet(`/documents?limit=50&page=${page}`)
    const docs = data.documents ?? data ?? []

    if (!Array.isArray(docs) || docs.length === 0) break

    const completed = docs.filter((d) => d.status?.toLowerCase() === 'completed')
    allDocs.push(...completed)
    console.log(`  Page ${page}: ${docs.length} docs, ${completed.length} completed`)

    if (docs.length < 50) break
    page++
    await sleep(500)
  }

  return allDocs
}

// ── Process a single document ────────────────────────
async function processDocument(docSummary) {
  await sleep(500)

  // Fetch full document details
  let doc
  try {
    doc = await signwellGet(`/documents/${docSummary.id}`)
  } catch (err) {
    console.error(`  ✗ Failed to fetch doc ${docSummary.id}: ${err.message}`)
    stats.errors.push(`fetch ${docSummary.id}: ${err.message}`)
    return
  }

  const docName = doc.name ?? 'Untitled'
  const docId = doc.id
  const isW9 = /w[-\s]?9/i.test(docName)
  const recipients = doc.recipients ?? []

  if (recipients.length === 0) {
    console.log(`  ⊘ "${docName}" — no recipients`)
    return
  }

  for (const recipient of recipients) {
    const email = recipient.email?.toLowerCase()
    if (!email) continue

    // Look up teacher
    const { data: teacher, error: lookupErr } = await supabase
      .from('teachers')
      .select('id, first_name, last_name, email, contract_status, w9_status')
      .eq('tenant_id', TENANT_ID)
      .ilike('email', email)
      .maybeSingle()

    if (lookupErr) {
      console.error(`  ✗ DB error looking up ${email}: ${lookupErr.message}`)
      stats.errors.push(`lookup ${email}: ${lookupErr.message}`)
      continue
    }

    if (!teacher) {
      console.log(`  ⊘ No teacher match for ${email}`)
      if (!stats.noMatch.includes(email)) stats.noMatch.push(email)
      continue
    }

    const teacherName = `${teacher.first_name} ${teacher.last_name}`

    // Check if already synced
    if (isW9 && teacher.w9_status === 'completed') {
      console.log(`  ⊘ Already synced (W-9): ${teacherName}`)
      stats.alreadySynced++
      continue
    }
    if (!isW9 && teacher.contract_status === 'signed') {
      console.log(`  ⊘ Already synced: ${teacherName}`)
      stats.alreadySynced++
      continue
    }

    // Download signed PDF via /completed_pdf endpoint (returns raw PDF bytes)
    const folder = isW9 ? 'w9' : 'contracts'
    const storagePath = `${teacher.id}/${folder}/${docId}.pdf`
    let finalUrl = null

    try {
      console.log(`  ↓ Downloading PDF from /documents/${docId}/completed_pdf ...`)
      const pdfResp = await fetch(`https://www.signwell.com/api/v1/documents/${docId}/completed_pdf`, {
        headers: { 'X-Api-Key': SIGNWELL_API_KEY },
      })
      if (!pdfResp.ok) throw new Error(`SignWell PDF endpoint returned ${pdfResp.status}`)

      const contentType = pdfResp.headers.get('content-type') ?? ''
      if (!contentType.includes('pdf')) {
        console.warn(`  ⚠ Unexpected content-type: ${contentType}`)
      }

      const pdfBuffer = new Uint8Array(await pdfResp.arrayBuffer())
      console.log(`  ↓ Downloaded ${(pdfBuffer.length / 1024).toFixed(1)} KB`)

      const { error: uploadErr } = await supabase.storage
        .from('teacher-documents')
        .upload(storagePath, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true,
        })

      if (uploadErr) {
        console.error(`  ✗ Storage upload failed for ${teacherName}: ${uploadErr.message}`)
        stats.errors.push(`upload ${teacherName}: ${uploadErr.message}`)
      } else {
        const { data: urlData } = supabase.storage
          .from('teacher-documents')
          .getPublicUrl(storagePath)
        finalUrl = urlData?.publicUrl ?? null
        console.log(`  ↑ Uploaded to Storage: ${storagePath}`)
      }
    } catch (err) {
      console.error(`  ✗ PDF download failed for ${teacherName}: ${err.message}`)
      stats.errors.push(`pdf ${teacherName}: ${err.message}`)
    }

    // Determine completed_at timestamp
    const completedAt = doc.completed_at ?? doc.updated_at ?? new Date().toISOString()

    // Update teacher record
    if (isW9) {
      const { error: updateErr } = await supabase
        .from('teachers')
        .update({
          w9_status: 'complete',
          w9_completed_at: completedAt,
        })
        .eq('id', teacher.id)

      if (updateErr) {
        console.error(`  ✗ Failed to update W-9 for ${teacherName}: ${updateErr.message}`)
        stats.errors.push(`update w9 ${teacherName}: ${updateErr.message}`)
        continue
      }
      console.log(`  ✓ W-9 synced: ${teacherName} (${email})`)
    } else {
      const { error: updateErr } = await supabase
        .from('teachers')
        .update({
          contract_status: 'signed',
          contract_signed_at: completedAt,
          contract_pdf_url: finalUrl,
        })
        .eq('id', teacher.id)

      if (updateErr) {
        console.error(`  ✗ Failed to update contract for ${teacherName}: ${updateErr.message}`)
        stats.errors.push(`update contract ${teacherName}: ${updateErr.message}`)
        continue
      }
      console.log(`  ✓ Contract synced: ${teacherName} (${email}) — "${docName}"`)
    }

    stats.synced++
  }
}

// ── Main ─────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════╗')
  console.log('║   SignWell → Supabase Backfill Script    ║')
  console.log('╚══════════════════════════════════════════╝')
  console.log()

  console.log('Fetching completed documents from SignWell...')
  const docs = await fetchAllCompletedDocuments()
  stats.totalDocs = docs.length
  console.log(`\nFound ${docs.length} completed documents.\n`)

  for (let i = 0; i < docs.length; i++) {
    console.log(`[${i + 1}/${docs.length}] Processing: ${docs[i].name ?? docs[i].id}`)
    await processDocument(docs[i])
  }

  // ── Summary ──────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════╗')
  console.log('║              BACKFILL SUMMARY            ║')
  console.log('╚══════════════════════════════════════════╝')
  console.log(`  Total completed docs:  ${stats.totalDocs}`)
  console.log(`  Matched & synced:      ${stats.synced}`)
  console.log(`  Already synced (skip): ${stats.alreadySynced}`)
  console.log(`  No teacher match:      ${stats.noMatch.length}`)
  if (stats.noMatch.length > 0) {
    console.log(`    Unmatched emails:`)
    stats.noMatch.forEach((e) => console.log(`      - ${e}`))
  }
  if (stats.errors.length > 0) {
    console.log(`  Errors:                ${stats.errors.length}`)
    stats.errors.forEach((e) => console.log(`      - ${e}`))
  }
  console.log()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
