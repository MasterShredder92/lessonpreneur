import { createClient } from '@supabase/supabase-js'
import { readFile } from 'fs/promises'

const supabase = createClient(
  'https://dhsyxyhtoadrqfrlmsqe.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const uploads = [
  {
    file: 'D:/w9/W-9 Forms-20260403T202816Z-3-001/W-9 Forms/Unknown_49_0_W9.pdf',
    teacherId: 'c4e88247-2ce1-4edf-bc47-2653b0ffa835',
    name: 'Sophie Ollis',
    storagePath: 'c4e88247-2ce1-4edf-bc47-2653b0ffa835/w9/sophie_ollis_w9.pdf',
  },
  {
    file: 'D:/w9/W-9 Forms-20260403T202816Z-3-001/W-9 Forms/Unknown_50_0_W9.pdf',
    teacherId: '9ce8b010-2e4f-4c52-9cf2-c914f1c9b95f',
    name: 'Edith Hickman',
    storagePath: '9ce8b010-2e4f-4c52-9cf2-c914f1c9b95f/w9/edith_hickman_w9.pdf',
  },
]

for (const u of uploads) {
  const buf = await readFile(u.file)
  const { error: upErr } = await supabase.storage
    .from('teacher-documents')
    .upload(u.storagePath, buf, { contentType: 'application/pdf', upsert: true })
  if (upErr) { console.error(`Upload failed for ${u.name}:`, upErr.message); continue }

  const { error: dbErr } = await supabase
    .from('teachers')
    .update({ w9_status: 'complete', w9_completed_at: new Date().toISOString() })
    .eq('id', u.teacherId)
  if (dbErr) { console.error(`DB update failed for ${u.name}:`, dbErr.message); continue }

  console.log(`✓ ${u.name} — uploaded & w9_status set to complete`)
}
