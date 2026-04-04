/**
 * W-9 Backfill from Local PDFs/Images
 *
 * Matches local W-9 files to teachers in Supabase by filename,
 * uploads to Storage, and updates w9_status.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/w9-backfill.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readdir, readFile } from 'fs/promises'
import { join, extname, basename } from 'path'

const SUPABASE_URL = 'https://dhsyxyhtoadrqfrlmsqe.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const TENANT_ID = '00000000-0000-0000-0000-000000000001'
const W9_DIR = 'D:/w9/W-9 Forms-20260403T202816Z-3-001/W-9 Forms'

if (!SUPABASE_SERVICE_ROLE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const VALID_EXTS = ['.pdf', '.jpg', '.jpeg', '.png']

const MIME_TYPES = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
}

// Clean filename into name tokens for matching
function extractNameTokens(filename) {
  const base = basename(filename, extname(filename))
  // Remove common W-9 prefixes/suffixes and noise
  const cleaned = base
    .replace(/w[-_\s]?9/gi, '')
    .replace(/form|signed|copy|scan|final/gi, '')
    .replace(/\d+/g, '') // remove numbers
    .replace(/[_\-\.]+/g, ' ')  // underscores/dashes to spaces
    .trim()
    .toLowerCase()
  return cleaned.split(/\s+/).filter(t => t.length > 1)
}

// Score how well a filename matches a teacher
function matchScore(tokens, teacher) {
  const first = (teacher.first_name ?? '').toLowerCase()
  const last = (teacher.last_name ?? '').toLowerCase()
  if (!first && !last) return 0

  let score = 0
  for (const token of tokens) {
    if (token === first) score += 3
    else if (token === last) score += 3
    else if (first.startsWith(token) && token.length >= 3) score += 2
    else if (last.startsWith(token) && token.length >= 3) score += 2
    else if (token.startsWith(first) && first.length >= 3) score += 1
    else if (token.startsWith(last) && last.length >= 3) score += 1
  }

  // Bonus: both first AND last matched
  const hasFirst = tokens.some(t => t === first || (first.length >= 3 && t.startsWith(first)) || (t.length >= 3 && first.startsWith(t)))
  const hasLast = tokens.some(t => t === last || (last.length >= 3 && t.startsWith(last)) || (t.length >= 3 && last.startsWith(t)))
  if (hasFirst && hasLast) score += 5

  return score
}

async function main() {
  console.log('╔══════════════════════════════════════════╗')
  console.log('║     W-9 Local PDF Backfill Script        ║')
  console.log('╚══════════════════════════════════════════╝\n')

  // Step 1: List files
  const allFiles = await readdir(W9_DIR)
  const w9Files = allFiles.filter(f => VALID_EXTS.includes(extname(f).toLowerCase()))
  console.log(`Found ${w9Files.length} W-9 files:\n`)
  w9Files.forEach(f => console.log(`  ${f}`))
  console.log()

  // Step 2: Fetch teachers
  const { data: teachers, error } = await supabase
    .from('teachers')
    .select('id, first_name, last_name, email, w9_status')
    .eq('tenant_id', TENANT_ID)
  if (error) { console.error('Failed to fetch teachers:', error.message); process.exit(1) }
  console.log(`Loaded ${teachers.length} teachers from Supabase.\n`)

  const stats = { total: w9Files.length, matched: 0, skipped: 0, alreadyDone: 0, noMatch: [] }

  // Step 3-4: Match and upload
  for (const file of w9Files) {
    const tokens = extractNameTokens(file)
    if (tokens.length === 0) {
      console.log(`  ⊘ SKIP (no name tokens): ${file}`)
      stats.noMatch.push(file)
      continue
    }

    // Score all teachers, pick best
    let bestTeacher = null
    let bestScore = 0
    for (const t of teachers) {
      const s = matchScore(tokens, t)
      if (s > bestScore) { bestScore = s; bestTeacher = t }
    }

    // Require minimum confidence (both first+last = 5 base + 3+3 = 11 min)
    if (!bestTeacher || bestScore < 5) {
      console.log(`  ⊘ NO MATCH (best score ${bestScore}): ${file} → tokens: [${tokens.join(', ')}]`)
      stats.noMatch.push(file)
      continue
    }

    const teacherName = `${bestTeacher.first_name} ${bestTeacher.last_name}`

    // Skip if already completed
    if (bestTeacher.w9_status === 'complete' || bestTeacher.w9_status === 'completed') {
      console.log(`  ⊘ Already completed: ${file} → ${teacherName}`)
      stats.alreadyDone++
      continue
    }

    // Upload file
    const ext = extname(file).toLowerCase()
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream'
    const storagePath = `${bestTeacher.id}/w9/${file}`

    try {
      const fileBuffer = await readFile(join(W9_DIR, file))

      const { error: uploadErr } = await supabase.storage
        .from('teacher-documents')
        .upload(storagePath, fileBuffer, { contentType, upsert: true })

      if (uploadErr) {
        console.error(`  ✗ Upload failed for ${file}: ${uploadErr.message}`)
        stats.noMatch.push(`${file} (upload error)`)
        continue
      }

      // Update teacher
      const { error: updateErr } = await supabase
        .from('teachers')
        .update({
          w9_status: 'complete',
          w9_completed_at: new Date().toISOString(),
        })
        .eq('id', bestTeacher.id)

      if (updateErr) {
        console.error(`  ✗ DB update failed for ${teacherName}: ${updateErr.message}`)
        stats.noMatch.push(`${file} (db error)`)
        continue
      }

      // Mark in-memory so we don't re-match
      bestTeacher.w9_status = 'completed'

      console.log(`  ✓ Matched: ${file} → ${teacherName} (score: ${bestScore})`)
      stats.matched++
    } catch (err) {
      console.error(`  ✗ Error processing ${file}: ${err.message}`)
      stats.noMatch.push(`${file} (error)`)
    }

    await sleep(200)
  }

  // Step 5: Summary
  console.log('\n╔══════════════════════════════════════════╗')
  console.log('║            W-9 BACKFILL SUMMARY          ║')
  console.log('╚══════════════════════════════════════════╝')
  console.log(`  Total W-9 files:       ${stats.total}`)
  console.log(`  Matched & uploaded:    ${stats.matched}`)
  console.log(`  Already completed:     ${stats.alreadyDone}`)
  console.log(`  Skipped (no match):    ${stats.noMatch.length}`)
  if (stats.noMatch.length > 0) {
    console.log(`    Files for manual review:`)
    stats.noMatch.forEach(f => console.log(`      - ${f}`))
  }
  console.log()
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
