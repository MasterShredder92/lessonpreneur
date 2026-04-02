/**
 * Appointment notification service.
 *
 * Composes messages, checks family notification preferences,
 * logs every attempt to appointment_notifications table,
 * and schedules timed reminders via pending_reminders table.
 *
 * Actual SMS/email delivery via QUO is wired separately —
 * this service creates the records and log entries.
 */

import { supabase } from './supabase'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

export type NotificationEventType =
  | 'booked'
  | 'reminder_24hr'
  | 'reminder_4hr'
  | 'reminder_1hr'
  | 'cancelled'
  | 'rescheduled'
  | 'virtual_converted'

interface BlockContext {
  block_id: string
  student_name: string
  student_first_name: string
  instrument: string | null
  teacher_name: string
  teacher_first_name: string
  location_name: string
  block_date: string     // YYYY-MM-DD
  start_time: string     // HH:MM:SS
  family_id: string | null
  teacher_id: string | null
  meet_link?: string | null
  // For rescheduled events:
  new_date?: string
  new_time?: string
  new_teacher_name?: string
}

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

// ── Message templates ──

function parentBookedMsg(ctx: BlockContext): string {
  return `Hi ${ctx.student_first_name}'s family! ${ctx.student_name}'s ${ctx.instrument ?? 'music'} session has been scheduled for ${formatDate(ctx.block_date)} at ${formatTime(ctx.start_time)} with ${ctx.teacher_first_name} at ${ctx.location_name}. See you then! 🎵`
}

function teacherBookedMsg(ctx: BlockContext): string {
  return `Hey ${ctx.teacher_first_name}! You have a new session scheduled — ${ctx.student_name} (${ctx.instrument ?? 'music'}) on ${formatDate(ctx.block_date)} at ${formatTime(ctx.start_time)} at ${ctx.location_name}.`
}

function parentReminder24hrMsg(ctx: BlockContext): string {
  const link = ctx.meet_link ? ` Join here: ${ctx.meet_link}` : ''
  return `Reminder: ${ctx.student_name}'s ${ctx.instrument ?? 'music'} session is tomorrow at ${formatTime(ctx.start_time)} with ${ctx.teacher_first_name} at ${ctx.location_name}.${link} See you then! 🎵`
}

function teacherReminder24hrMsg(ctx: BlockContext): string {
  return `Reminder: ${ctx.student_name} (${ctx.instrument ?? 'music'}) tomorrow at ${formatTime(ctx.start_time)} at ${ctx.location_name}.`
}

function parentReminder4hrMsg(ctx: BlockContext): string {
  const link = ctx.meet_link ? ` Join here: ${ctx.meet_link}` : ''
  return `See you in 4 hours! ${ctx.student_name}'s session starts at ${formatTime(ctx.start_time)} today at ${ctx.location_name}.${link} 🎵`
}

function parentReminder1hrMsg(ctx: BlockContext): string {
  const link = ctx.meet_link ? ` Join here: ${ctx.meet_link}` : ''
  return `1 hour until ${ctx.student_name}'s session at ${ctx.location_name}!${link} See you real quick. 🎵`
}

function parentCancelledMsg(ctx: BlockContext): string {
  return `Hi ${ctx.student_first_name}'s family — ${ctx.student_name}'s ${ctx.instrument ?? 'music'} session on ${formatDate(ctx.block_date)} at ${formatTime(ctx.start_time)} has been cancelled. Please reach out if you have questions.`
}

function teacherCancelledMsg(ctx: BlockContext): string {
  return `Update: ${ctx.student_name}'s session on ${formatDate(ctx.block_date)} at ${formatTime(ctx.start_time)} has been cancelled.`
}

function parentRescheduledMsg(ctx: BlockContext): string {
  const teacher = ctx.new_teacher_name ?? ctx.teacher_first_name
  return `Hi ${ctx.student_first_name}'s family — ${ctx.student_name}'s session has been rescheduled to ${formatDate(ctx.new_date!)} at ${formatTime(ctx.new_time!)} with ${teacher} at ${ctx.location_name}.`
}

function teacherRescheduledMsg(ctx: BlockContext): string {
  return `Update: ${ctx.student_name}'s session has been moved to ${formatDate(ctx.new_date!)} at ${formatTime(ctx.new_time!)}.`
}

function parentVirtualMsg(ctx: BlockContext): string {
  return `Hi ${ctx.student_first_name}'s family — ${ctx.student_name}'s session on ${formatDate(ctx.block_date)} at ${formatTime(ctx.start_time)} will be virtual via Google Meet. Join here: ${ctx.meet_link}\nThis link is just for ${ctx.student_name}'s session. See you online! 🎵`
}

function teacherVirtualMsg(ctx: BlockContext): string {
  return `${ctx.student_name}'s session on ${formatDate(ctx.block_date)} at ${formatTime(ctx.start_time)} is now virtual. Google Meet link: ${ctx.meet_link}\nThis link has been sent to the family as well.`
}

// ── Log a notification attempt ──

async function logNotification(
  blockId: string,
  eventType: NotificationEventType,
  channel: 'sms' | 'email',
  recipientType: 'parent' | 'teacher',
  recipientName: string,
  recipientContact: string,
  message: string,
  success: boolean = true,
  errorMessage: string | null = null,
) {
  try {
    await supabase.from('appointment_notifications').insert({
      tenant_id: TENANT_ID,
      block_id: blockId,
      event_type: eventType,
      channel,
      recipient_type: recipientType,
      recipient_name: recipientName,
      recipient_contact: recipientContact,
      message_content: message,
      success,
      error_message: errorMessage,
    })
  } catch (err) {
    console.error('Failed to log notification:', err)
  }
}

// ── Check for duplicate notification ──

async function alreadySent(blockId: string, eventType: NotificationEventType, recipientType: string, channel: string): Promise<boolean> {
  const { data } = await supabase
    .from('appointment_notifications')
    .select('id')
    .eq('block_id', blockId)
    .eq('event_type', eventType)
    .eq('recipient_type', recipientType)
    .eq('channel', channel)
    .eq('success', true)
    .limit(1)
  return (data?.length ?? 0) > 0
}

// ── Get family notification preferences ──

async function getFamilyPrefs(familyId: string | null) {
  if (!familyId) return { sms: true, email: true, rem4hr: true, rem1hr: false, phone: '', emailAddr: '', parentName: '' }
  const { data } = await supabase
    .from('families')
    .select('notify_via_sms, notify_via_email, reminder_4hr, reminder_1hr, primary_phone, primary_email, parent_name, parent_first_name')
    .eq('id', familyId)
    .single()
  if (!data) return { sms: true, email: true, rem4hr: true, rem1hr: false, phone: '', emailAddr: '', parentName: '' }
  return {
    sms: data.notify_via_sms ?? true,
    email: data.notify_via_email ?? true,
    rem4hr: data.reminder_4hr ?? true,
    rem1hr: data.reminder_1hr ?? false,
    phone: data.primary_phone ?? '',
    emailAddr: data.primary_email ?? '',
    parentName: (data.parent_first_name ?? data.parent_name ?? '').split(' ')[0],
  }
}

// ── Get teacher contact info ──

async function getTeacherContact(teacherId: string | null) {
  if (!teacherId) return { phone: '', email: '' }
  const { data } = await supabase
    .from('teachers')
    .select('phone, email')
    .eq('id', teacherId)
    .single()
  return { phone: data?.phone ?? '', email: data?.email ?? '' }
}

// ── Send to a single recipient (logs + placeholder for QUO) ──

async function sendToRecipient(
  blockId: string,
  eventType: NotificationEventType,
  recipientType: 'parent' | 'teacher',
  recipientName: string,
  channels: { sms: boolean; email: boolean },
  contacts: { phone: string; email: string },
  message: string,
) {
  if (channels.sms && contacts.phone) {
    const dup = await alreadySent(blockId, eventType, recipientType, 'sms')
    if (!dup) {
      // TODO: Wire QUO SMS delivery here
      await logNotification(blockId, eventType, 'sms', recipientType, recipientName, contacts.phone, message)
    }
  }
  if (channels.email && contacts.email) {
    const dup = await alreadySent(blockId, eventType, recipientType, 'email')
    if (!dup) {
      // TODO: Wire email delivery here
      await logNotification(blockId, eventType, 'email', recipientType, recipientName, contacts.email, message)
    }
  }
}

// ── Schedule reminders for a block ──

async function scheduleReminders(blockId: string, blockDate: string, startTime: string) {
  // Parse appointment datetime in Central Time
  const apptStr = `${blockDate}T${startTime}`
  const apptTime = new Date(apptStr) // Assumes server/browser is in Central or we adjust

  const reminder24hr = new Date(apptTime.getTime() - 24 * 60 * 60 * 1000)
  const reminder4hr = new Date(apptTime.getTime() - 4 * 60 * 60 * 1000)
  const reminder1hr = new Date(apptTime.getTime() - 1 * 60 * 60 * 1000)

  const now = new Date()
  const rows: { block_id: string; reminder_type: string; fire_at: string }[] = []

  if (reminder24hr > now) rows.push({ block_id: blockId, reminder_type: 'reminder_24hr', fire_at: reminder24hr.toISOString() })
  if (reminder4hr > now) rows.push({ block_id: blockId, reminder_type: 'reminder_4hr', fire_at: reminder4hr.toISOString() })
  if (reminder1hr > now) rows.push({ block_id: blockId, reminder_type: 'reminder_1hr', fire_at: reminder1hr.toISOString() })

  if (rows.length > 0) {
    await supabase.from('pending_reminders').insert(rows)
  }
}

// ── Cancel pending reminders for a block ──

async function cancelReminders(blockId: string) {
  await supabase
    .from('pending_reminders')
    .update({ cancelled: true })
    .eq('block_id', blockId)
    .eq('fired', false)
    .eq('cancelled', false)
}

// ══════════════════════════════
//  PUBLIC API
// ══════════════════════════════

/**
 * Send notification for an appointment event.
 * Never throws — logs errors but doesn't break the caller.
 */
export async function sendAppointmentNotification(
  eventType: NotificationEventType,
  ctx: BlockContext,
) {
  try {
    // Resolve family_id from student if not provided
    let familyId = ctx.family_id
    if (!familyId && ctx.block_id) {
      const { data: blk } = await supabase.from('schedule_blocks').select('student_id').eq('id', ctx.block_id).single()
      if (blk?.student_id) {
        const { data: stu } = await supabase.from('students').select('family_id').eq('id', blk.student_id).single()
        if (stu?.family_id) familyId = stu.family_id
      }
    }
    const familyPrefs = await getFamilyPrefs(familyId)
    const teacherContact = await getTeacherContact(ctx.teacher_id)

    const parentChannels = { sms: familyPrefs.sms, email: familyPrefs.email }
    const teacherChannels = { sms: true, email: true } // Teachers always get notified
    const parentContacts = { phone: familyPrefs.phone, email: familyPrefs.emailAddr }
    const teacherContacts = { phone: teacherContact.phone, email: teacherContact.email }

    switch (eventType) {
      case 'booked': {
        await sendToRecipient(ctx.block_id, eventType, 'parent', familyPrefs.parentName, parentChannels, parentContacts, parentBookedMsg(ctx))
        await sendToRecipient(ctx.block_id, eventType, 'teacher', ctx.teacher_first_name, teacherChannels, teacherContacts, teacherBookedMsg(ctx))
        await scheduleReminders(ctx.block_id, ctx.block_date, ctx.start_time)
        break
      }

      case 'reminder_24hr': {
        // Always fires — cannot be disabled
        await sendToRecipient(ctx.block_id, eventType, 'parent', familyPrefs.parentName, parentChannels, parentContacts, parentReminder24hrMsg(ctx))
        await sendToRecipient(ctx.block_id, eventType, 'teacher', ctx.teacher_first_name, teacherChannels, teacherContacts, teacherReminder24hrMsg(ctx))
        break
      }

      case 'reminder_4hr': {
        if (!familyPrefs.rem4hr) return // Respect family preference
        await sendToRecipient(ctx.block_id, eventType, 'parent', familyPrefs.parentName, parentChannels, parentContacts, parentReminder4hrMsg(ctx))
        break
      }

      case 'reminder_1hr': {
        if (!familyPrefs.rem1hr) return // Respect family preference
        await sendToRecipient(ctx.block_id, eventType, 'parent', familyPrefs.parentName, parentChannels, parentContacts, parentReminder1hrMsg(ctx))
        break
      }

      case 'cancelled': {
        await sendToRecipient(ctx.block_id, eventType, 'parent', familyPrefs.parentName, parentChannels, parentContacts, parentCancelledMsg(ctx))
        await sendToRecipient(ctx.block_id, eventType, 'teacher', ctx.teacher_first_name, teacherChannels, teacherContacts, teacherCancelledMsg(ctx))
        await cancelReminders(ctx.block_id)
        break
      }

      case 'rescheduled': {
        await sendToRecipient(ctx.block_id, eventType, 'parent', familyPrefs.parentName, parentChannels, parentContacts, parentRescheduledMsg(ctx))
        await sendToRecipient(ctx.block_id, eventType, 'teacher', ctx.teacher_first_name, teacherChannels, teacherContacts, teacherRescheduledMsg(ctx))
        // Reschedule reminders for new time
        await cancelReminders(ctx.block_id)
        if (ctx.new_date && ctx.new_time) {
          await scheduleReminders(ctx.block_id, ctx.new_date, ctx.new_time)
        }
        break
      }

      case 'virtual_converted': {
        await sendToRecipient(ctx.block_id, eventType, 'parent', familyPrefs.parentName, parentChannels, parentContacts, parentVirtualMsg(ctx))
        await sendToRecipient(ctx.block_id, eventType, 'teacher', ctx.teacher_first_name, teacherChannels, teacherContacts, teacherVirtualMsg(ctx))
        break
      }
    }
  } catch (err) {
    console.error(`Notification error (${eventType}):`, err)
    // Never fail silently — but never break the caller either
  }
}

/**
 * Build a BlockContext from a schedule_blocks row by fetching related data.
 * Convenience helper for callers that only have a block_id.
 */
export async function buildBlockContext(blockId: string): Promise<BlockContext | null> {
  const { data: block } = await supabase
    .from('schedule_blocks')
    .select('id, student_id, teacher_id, location_id, block_date, start_time, room, notes')
    .eq('id', blockId)
    .single()
  if (!block) return null

  let studentName = 'Student'
  let studentFirstName = 'Student'
  let instrument: string | null = null
  let familyId: string | null = null

  if (block.student_id) {
    const { data: student } = await supabase
      .from('students')
      .select('first_name, last_name, instrument, family_id')
      .eq('id', block.student_id)
      .single()
    if (student) {
      studentName = `${student.first_name} ${student.last_name}`.trim()
      studentFirstName = student.first_name
      instrument = student.instrument
      familyId = student.family_id
    }
  }

  let teacherName = 'Teacher'
  let teacherFirstName = 'Teacher'
  if (block.teacher_id) {
    const { data: teacher } = await supabase
      .from('teachers')
      .select('first_name, last_name')
      .eq('id', block.teacher_id)
      .single()
    if (teacher) {
      teacherName = `${teacher.first_name} ${teacher.last_name}`.trim()
      teacherFirstName = teacher.first_name
    }
  }

  let locationName = 'Studio'
  if (block.location_id) {
    const { data: loc } = await supabase
      .from('locations')
      .select('name')
      .eq('id', block.location_id)
      .single()
    if (loc) locationName = loc.name?.replace(' Music Lessons', '') ?? 'Studio'
  }

  return {
    block_id: blockId,
    student_name: studentName,
    student_first_name: studentFirstName,
    instrument,
    teacher_name: teacherName,
    teacher_first_name: teacherFirstName,
    location_name: locationName,
    block_date: block.block_date,
    start_time: block.start_time,
    family_id: familyId,
    teacher_id: block.teacher_id,
  }
}
