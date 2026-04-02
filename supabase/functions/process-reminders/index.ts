/**
 * Process pending appointment reminders.
 *
 * Called on a schedule (every 5 minutes) by Supabase cron or n8n.
 * Finds all pending_reminders where fire_at <= now, fires the notification,
 * then marks them as fired.
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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${display}:${m} ${ampm}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const now = new Date().toISOString()

    // Find pending reminders that are due
    const { data: pending, error: fetchErr } = await supabase
      .from('pending_reminders')
      .select('*')
      .eq('fired', false)
      .eq('cancelled', false)
      .lte('fire_at', now)
      .limit(100)

    if (fetchErr) return json({ success: false, error: fetchErr.message }, 500)
    if (!pending || pending.length === 0) return json({ success: true, processed: 0 })

    let processed = 0

    for (const reminder of pending) {
      try {
        // Get the block
        const { data: block } = await supabase
          .from('schedule_blocks')
          .select('id, student_id, teacher_id, location_id, block_date, start_time, status, is_virtual, meet_link')
          .eq('id', reminder.block_id)
          .single()

        if (!block || block.status !== 'booked') {
          // Block no longer booked — skip and mark as cancelled
          await supabase.from('pending_reminders').update({ cancelled: true }).eq('id', reminder.id)
          continue
        }

        // Resolve student, teacher, location, family
        let studentName = 'Student'
        let studentFirstName = 'Student'
        let instrument: string | null = null
        let familyId: string | null = null

        if (block.student_id) {
          const { data: stu } = await supabase
            .from('students')
            .select('first_name, last_name, instrument, family_id')
            .eq('id', block.student_id)
            .single()
          if (stu) {
            studentName = `${stu.first_name} ${stu.last_name}`.trim()
            studentFirstName = stu.first_name
            instrument = stu.instrument
            familyId = stu.family_id
          }
        }

        let teacherFirstName = 'Teacher'
        let teacherPhone = ''
        let teacherEmail = ''
        if (block.teacher_id) {
          const { data: t } = await supabase.from('teachers').select('first_name, phone, email').eq('id', block.teacher_id).single()
          if (t) { teacherFirstName = t.first_name; teacherPhone = t.phone ?? ''; teacherEmail = t.email ?? '' }
        }

        let locationName = 'Studio'
        if (block.location_id) {
          const { data: loc } = await supabase.from('locations').select('name').eq('id', block.location_id).single()
          if (loc) locationName = loc.name?.replace(' Music Lessons', '') ?? 'Studio'
        }

        // Get family prefs
        let sms = true, email = true, rem4hr = true, rem1hr = false
        let parentPhone = '', parentEmail = '', parentName = ''
        if (familyId) {
          const { data: fam } = await supabase
            .from('families')
            .select('notify_via_sms, notify_via_email, reminder_4hr, reminder_1hr, primary_phone, primary_email, parent_first_name, parent_name')
            .eq('id', familyId)
            .single()
          if (fam) {
            sms = fam.notify_via_sms ?? true
            email = fam.notify_via_email ?? true
            rem4hr = fam.reminder_4hr ?? true
            rem1hr = fam.reminder_1hr ?? false
            parentPhone = fam.primary_phone ?? ''
            parentEmail = fam.primary_email ?? ''
            parentName = (fam.parent_first_name ?? fam.parent_name ?? '').split(' ')[0]
          }
        }

        // Check if this reminder type should fire
        if (reminder.reminder_type === 'reminder_4hr' && !rem4hr) {
          await supabase.from('pending_reminders').update({ cancelled: true }).eq('id', reminder.id)
          continue
        }
        if (reminder.reminder_type === 'reminder_1hr' && !rem1hr) {
          await supabase.from('pending_reminders').update({ cancelled: true }).eq('id', reminder.id)
          continue
        }

        // Virtual session — include Meet link in reminders
        const isVirtual = block.is_virtual && block.meet_link
        const meetLink = block.meet_link ?? ''

        // Compose messages — virtual sessions get Meet link
        const time = formatTime(block.start_time)

        let parentMsg = ''
        let teacherMsg = ''

        if (reminder.reminder_type === 'reminder_24hr') {
          if (isVirtual) {
            parentMsg = `Reminder: ${studentName}'s virtual ${instrument ?? 'music'} session is tomorrow at ${time}. Join here: ${meetLink} 🎵`
            teacherMsg = `Reminder: ${studentName} (${instrument ?? 'music'}) virtual session tomorrow at ${time}. Meet link: ${meetLink}`
          } else {
            parentMsg = `Reminder: ${studentName}'s ${instrument ?? 'music'} session is tomorrow at ${time} with ${teacherFirstName} at ${locationName}. See you then! 🎵`
            teacherMsg = `Reminder: ${studentName} (${instrument ?? 'music'}) tomorrow at ${time} at ${locationName}.`
          }
        } else if (reminder.reminder_type === 'reminder_4hr') {
          if (isVirtual) {
            parentMsg = `${studentName}'s virtual session starts in 4 hours at ${time}. Join here: ${meetLink} 🎵`
          } else {
            parentMsg = `See you in 4 hours! ${studentName}'s session starts at ${time} today at ${locationName}. 🎵`
          }
        } else if (reminder.reminder_type === 'reminder_1hr') {
          if (isVirtual) {
            parentMsg = `1 hour until ${studentName}'s virtual session! Join here: ${meetLink} 🎵`
          } else {
            parentMsg = `1 hour until ${studentName}'s session at ${locationName}! See you real quick. 🎵`
          }
        }

        // Check for duplicates before sending
        const { data: existing } = await supabase
          .from('appointment_notifications')
          .select('id')
          .eq('block_id', block.id)
          .eq('event_type', reminder.reminder_type)
          .eq('success', true)
          .limit(1)

        if (existing && existing.length > 0) {
          await supabase.from('pending_reminders').update({ fired: true }).eq('id', reminder.id)
          continue
        }

        // Send parent notification
        if (parentMsg) {
          if (sms && parentPhone) {
            // TODO: Wire QUO SMS
            await supabase.from('appointment_notifications').insert({
              tenant_id: TENANT_ID, block_id: block.id, event_type: reminder.reminder_type,
              channel: 'sms', recipient_type: 'parent', recipient_name: parentName,
              recipient_contact: parentPhone, message_content: parentMsg, success: true,
            })
          }
          if (email && parentEmail) {
            // TODO: Wire email
            await supabase.from('appointment_notifications').insert({
              tenant_id: TENANT_ID, block_id: block.id, event_type: reminder.reminder_type,
              channel: 'email', recipient_type: 'parent', recipient_name: parentName,
              recipient_contact: parentEmail, message_content: parentMsg, success: true,
            })
          }
        }

        // Send teacher notification (24hr only)
        if (teacherMsg) {
          if (teacherPhone) {
            await supabase.from('appointment_notifications').insert({
              tenant_id: TENANT_ID, block_id: block.id, event_type: reminder.reminder_type,
              channel: 'sms', recipient_type: 'teacher', recipient_name: teacherFirstName,
              recipient_contact: teacherPhone, message_content: teacherMsg, success: true,
            })
          }
          if (teacherEmail) {
            await supabase.from('appointment_notifications').insert({
              tenant_id: TENANT_ID, block_id: block.id, event_type: reminder.reminder_type,
              channel: 'email', recipient_type: 'teacher', recipient_name: teacherFirstName,
              recipient_contact: teacherEmail, message_content: teacherMsg, success: true,
            })
          }
        }

        // Mark reminder as fired
        await supabase.from('pending_reminders').update({ fired: true }).eq('id', reminder.id)
        processed++
      } catch (err) {
        console.error(`Failed to process reminder ${reminder.id}:`, err)
        // Don't break the loop — continue processing other reminders
      }
    }

    return json({ success: true, processed })
  } catch (err) {
    console.error('Unexpected error:', err)
    return json({ success: false, error: 'Internal server error' }, 500)
  }
})
