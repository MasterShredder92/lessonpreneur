import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { qk } from '../lib/queryKeys'

/* ══════════════════════════════════════════
   MARK TEACHER CALLED OUT
   ══════════════════════════════════════════ */

export function useMarkTeacherCalledOut() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      teacherId: string
      locationId: string
      date: string
      reason: string
      initiatedBy: string
      tenantId: string
    }) => {
      const { teacherId, locationId, date, reason, initiatedBy, tenantId } = params

      // 1. Find ALL blocks for this teacher on this date at this location
      const { data: blocks, error: fetchErr } = await supabase
        .from('schedule_blocks')
        .select('id, block_type, student_id')
        .eq('teacher_id', teacherId)
        .eq('block_date', date)
        .eq('location_id', locationId)
        .eq('tenant_id', tenantId)

      if (fetchErr) throw fetchErr
      if (!blocks || blocks.length === 0) throw new Error('No blocks found for this teacher today')

      const blockIds = blocks.map(b => b.id)

      // 2. Insert teacher_callouts record FIRST (need the id for linking)
      const { data: calloutRecord, error: insertErr } = await supabase
        .from('teacher_callouts')
        .insert({
          tenant_id: tenantId,
          teacher_id: teacherId,
          location_id: locationId,
          callout_date: date,
          reason: reason || null,
          blocks_affected: blockIds.length,
          initiated_by: initiatedBy,
        })
        .select('id')
        .single()

      if (insertErr) throw insertErr

      // 3. Update ALL blocks to call_out — LOCKED, not available for booking
      const { error: updateErr } = await supabase
        .from('schedule_blocks')
        .update({
          block_type: 'call_out',
          status: 'available',
          student_id: null,
          callout_reason: reason || null,
          callout_id: calloutRecord.id,
          teacher_tally: true,
        })
        .in('id', blockIds)

      if (updateErr) throw updateErr

      return { blocksAffected: blockIds.length, calloutId: calloutRecord.id }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.schedule.all })
      qc.invalidateQueries({ queryKey: qk.schedule.intelligence })
      qc.invalidateQueries({ queryKey: qk.dashboard.all })
      qc.invalidateQueries({ queryKey: qk.teachers.calloutTally })
      qc.invalidateQueries({ queryKey: qk.teachers.calloutHistory })
    },
  })
}

/* ══════════════════════════════════════════
   UNDO TEACHER CALLOUT
   ══════════════════════════════════════════ */

export function useUndoTeacherCallout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      calloutId: string
      teacherId: string
      date: string
      locationId: string
      tenantId: string
    }) => {
      const { calloutId, teacherId, date, locationId, tenantId } = params

      // 1. Find all blocks linked to this callout (by callout_id or by teacher/date/loc)
      let blockIds: string[] = []

      const { data: linkedBlocks } = await supabase
        .from('schedule_blocks')
        .select('id')
        .eq('callout_id', calloutId)

      if (linkedBlocks && linkedBlocks.length > 0) {
        blockIds = linkedBlocks.map(b => b.id)
      } else {
        // Fallback: find by teacher + date + location + block_type
        const { data: fallbackBlocks } = await supabase
          .from('schedule_blocks')
          .select('id')
          .eq('teacher_id', teacherId)
          .eq('block_date', date)
          .eq('location_id', locationId)
          .eq('block_type', 'call_out')
          .eq('tenant_id', tenantId)
        blockIds = (fallbackBlocks ?? []).map(b => b.id)
      }

      if (blockIds.length === 0) throw new Error('No called-out blocks found to restore')

      // 2. Reset blocks back to open_time
      const { error: updateErr } = await supabase
        .from('schedule_blocks')
        .update({
          block_type: 'open_time',
          status: 'available',
          student_id: null,
          callout_reason: null,
          callout_id: null,
          teacher_tally: false,
        })
        .in('id', blockIds)

      if (updateErr) throw updateErr

      // 3. Delete the teacher_callouts record
      const { error: deleteErr } = await supabase
        .from('teacher_callouts')
        .delete()
        .eq('id', calloutId)

      if (deleteErr) throw deleteErr

      return { blocksRestored: blockIds.length }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.schedule.all })
      qc.invalidateQueries({ queryKey: qk.schedule.intelligence })
      qc.invalidateQueries({ queryKey: qk.dashboard.all })
      qc.invalidateQueries({ queryKey: qk.teachers.calloutTally })
      qc.invalidateQueries({ queryKey: qk.teachers.calloutHistory })
    },
  })
}

/* ══════════════════════════════════════════
   TEACHER CALLOUT TALLY (from view)
   ══════════════════════════════════════════ */

export interface CalloutTally {
  teacher_id: string
  total_callouts: number
  total_blocks_affected: number
  last_callout_date: string | null
  callouts_this_month: number
  callouts_last_60_days: number
}

export function useTeacherCalloutTally(teacherId: string | undefined) {
  return useQuery({
    queryKey: ['teacher-callout-tally', teacherId],
    enabled: !!teacherId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teacher_callout_tally')
        .select('*')
        .eq('teacher_id', teacherId!)
        .maybeSingle()
      if (error) throw error
      return data as CalloutTally | null
    },
  })
}

/* ══════════════════════════════════════════
   TEACHER CALLOUT HISTORY (individual records)
   ══════════════════════════════════════════ */

export interface CalloutRecord {
  id: string
  teacher_id: string
  location_id: string
  callout_date: string
  reason: string | null
  blocks_affected: number
  initiated_by: string
  created_at: string
}

export function useTeacherCalloutHistory(teacherId: string | undefined) {
  return useQuery({
    queryKey: qk.teachers.calloutHistory(teacherId),
    enabled: !!teacherId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teacher_callouts')
        .select('*')
        .eq('teacher_id', teacherId!)
        .order('callout_date', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as CalloutRecord[]
    },
  })
}
