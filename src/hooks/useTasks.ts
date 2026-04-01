import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'

// ═══════════════════════════════════════
// TYPES
// ═══════════════════════════════════════

export interface Task {
  id: string
  tenant_id: string
  task_type: string
  title: string
  description: string | null
  priority: 'urgent' | 'high' | 'normal' | 'low'
  assigned_role: string | null
  assigned_to: string | null
  location_id: string | null
  created_by: string | null
  created_by_role: string | null
  entity_type: string | null
  entity_id: string | null
  entity_name: string | null
  status: 'pending' | 'in_progress' | 'completed' | 'dismissed'
  completed_at: string | null
  completed_by: string | null
  completion_note: string | null
  file_verified: boolean | null
  escalated: boolean | null
  dedup_key: string | null
  snoozed_until: string | null
  recurring: string | null
  due_date: string | null
  created_at: string
  // Resolved
  assigned_to_name?: string
  completed_by_name?: string
  location_name?: string
}

export interface TaskFilters {
  status?: string
  priority?: string
  task_type?: string
  location_id?: string
  assigned_to?: string
}

// ═══════════════════════════════════════
// READ TASKS
// ═══════════════════════════════════════

export function useTasks(filters?: TaskFilters) {
  const { role, profile } = useAuthContext()
  return useQuery({
    queryKey: ['tasks', filters],
    queryFn: async () => {
      let query = supabase.from('tasks').select('*').order('created_at', { ascending: false })

      if (filters?.status) {
        query = query.eq('status', filters.status)
      } else {
        query = query.in('status', ['pending', 'in_progress'])
      }
      if (filters?.priority) query = query.eq('priority', filters.priority)
      if (filters?.task_type) {
        if (filters.task_type === 'manual') query = query.eq('task_type', 'manual')
        else if (filters.task_type === 'system') query = query.neq('task_type', 'manual')
      }
      if (filters?.location_id) query = query.eq('location_id', filters.location_id)
      if (filters?.assigned_to) query = query.eq('assigned_to', filters.assigned_to)

      const { data, error } = await query
      if (error) throw error

      const today = new Date().toISOString().split('T')[0]

      // Filter snoozed tasks (hide until snooze date)
      let filtered = (data ?? []).filter((t: any) => !t.snoozed_until || t.snoozed_until <= today)

      // Studio director scope
      if (role === 'studio_director' && profile) {
        filtered = filtered.filter((t: any) =>
          t.assigned_role === 'studio_director' ||
          t.assigned_to === profile.id ||
          (t.location_id && (profile as any).location_id && t.location_id === (profile as any).location_id)
        )
      }
      // Teachers only see tasks assigned directly to them
      if (role === 'teacher' && profile) {
        filtered = filtered.filter((t: any) => t.assigned_to === profile.id)
      }

      // Resolve names
      const profileIds = new Set<string>()
      filtered.forEach((t: any) => {
        if (t.assigned_to) profileIds.add(t.assigned_to)
        if (t.completed_by) profileIds.add(t.completed_by)
      })
      const nameMap = new Map<string, string>()
      if (profileIds.size > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, first_name, last_name').in('id', [...profileIds])
        profiles?.forEach((p: any) => nameMap.set(p.id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()))
      }

      const locIds = [...new Set(filtered.filter((t: any) => t.location_id).map((t: any) => t.location_id))]
      const locMap = new Map<string, string>()
      if (locIds.length > 0) {
        const { data: locs } = await supabase.from('locations').select('id, name').in('id', locIds)
        locs?.forEach((l: any) => locMap.set(l.id, l.name?.replace(' Music Lessons', '') ?? ''))
      }

      return filtered.map((t: any) => ({
        ...t,
        assigned_to_name: t.assigned_to ? nameMap.get(t.assigned_to) : undefined,
        completed_by_name: t.completed_by ? nameMap.get(t.completed_by) : undefined,
        location_name: t.location_id ? locMap.get(t.location_id) : undefined,
      })) as Task[]
    },
  })
}

// ═══════════════════════════════════════
// CREATE MANUAL TASK
// ═══════════════════════════════════════

export function useCreateTask() {
  const qc = useQueryClient()
  const { user, role } = useAuthContext()
  return useMutation({
    mutationFn: async (params: {
      tenantId: string; title: string; description?: string; priority: string
      assignedRole?: string; assignedTo?: string; locationId?: string
      entityType?: string; entityId?: string; entityName?: string
      recurring?: string; dueDate?: string
    }) => {
      const { error } = await supabase.from('tasks').insert({
        tenant_id: params.tenantId,
        task_type: 'manual',
        title: params.title,
        description: params.description || null,
        priority: params.priority,
        assigned_role: params.assignedRole || null,
        assigned_to: params.assignedTo || null,
        location_id: params.locationId || null,
        created_by: user?.id ?? null,
        created_by_role: role ?? null,
        status: 'pending',
        recurring: params.recurring || null,
        due_date: params.dueDate || null,
      })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }) },
  })
}

// ═══════════════════════════════════════
// COMPLETE / UNCHECK / DISMISS / SNOOZE
// ═══════════════════════════════════════

export function useCompleteTask() {
  const qc = useQueryClient()
  const { user, profile, role } = useAuthContext()
  return useMutation({
    mutationFn: async (params: { taskId: string; tenantId: string; completionNote?: string; fileVerified?: boolean }) => {
      const { error } = await supabase.from('tasks').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: user?.id ?? null,
        completion_note: params.completionNote || null,
        file_verified: params.fileVerified ?? true,
      }).eq('id', params.taskId)
      if (error) throw error

      const displayName = profile ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() : 'Unknown'
      await supabase.from('audit_log').insert({
        tenant_id: params.tenantId,
        action: 'TASK_COMPLETED',
        table_name: 'tasks',
        record_id: params.taskId,
        new_value: JSON.stringify({ completed_by_name: displayName, completed_by_role: role, file_verified: params.fileVerified ?? true }),
        performed_by: user?.id ?? null,
      })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }) },
  })
}

export function useUncheckTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from('tasks').update({
        status: 'pending',
        completed_at: null,
        completed_by: null,
        completion_note: null,
      }).eq('id', taskId)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }) },
  })
}

export function useDismissTask() {
  const qc = useQueryClient()
  const { user } = useAuthContext()
  return useMutation({
    mutationFn: async (params: { taskId: string; tenantId: string }) => {
      const { error } = await supabase.from('tasks').update({ status: 'dismissed' }).eq('id', params.taskId)
      if (error) throw error
      await supabase.from('audit_log').insert({
        tenant_id: params.tenantId, action: 'TASK_DISMISSED', table_name: 'tasks',
        record_id: params.taskId, performed_by: user?.id ?? null,
      })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }) },
  })
}

export function useSnoozeTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { taskId: string; until: string }) => {
      const { error } = await supabase.from('tasks').update({ snoozed_until: params.until }).eq('id', params.taskId)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }) },
  })
}

// ═══════════════════════════════════════
// SYSTEM TASK SCANNER
// ═══════════════════════════════════════

export function useScanSystemTasks() {
  const { tenantId } = useAuthContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!tenantId) return

      // 1. Missing teacher W-9s and contracts
      const { data: activeTeachers } = await supabase
        .from('teachers')
        .select('id, first_name, last_name, is_active')
        .eq('is_active', true)

      const { data: teacherDocs } = await supabase
        .from('teacher_documents')
        .select('teacher_id, category')

      const docsByTeacher = new Map<string, Set<string>>()
      teacherDocs?.forEach((d: any) => {
        if (!docsByTeacher.has(d.teacher_id)) docsByTeacher.set(d.teacher_id, new Set())
        docsByTeacher.get(d.teacher_id)!.add(d.category?.toLowerCase() ?? '')
      })

      const tasksToCreate: any[] = []
      for (const t of (activeTeachers ?? [])) {
        const name = `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim()
        const docs = docsByTeacher.get(t.id) ?? new Set()

        if (!docs.has('w-9') && !docs.has('w9')) {
          tasksToCreate.push({
            tenant_id: tenantId, task_type: 'missing_teacher_w9',
            title: `W-9 missing — ${name}`, priority: 'high',
            assigned_role: 'company_director', entity_type: 'teacher',
            entity_id: t.id, entity_name: name, status: 'pending',
            dedup_key: `missing_w9:${t.id}`,
          })
        }
        if (!docs.has('contract')) {
          tasksToCreate.push({
            tenant_id: tenantId, task_type: 'missing_teacher_contract',
            title: `Contract missing — ${name}`, priority: 'high',
            assigned_role: 'company_director', entity_type: 'teacher',
            entity_id: t.id, entity_name: name, status: 'pending',
            dedup_key: `missing_teacher_contract:${t.id}`,
          })
        }
      }

      // 2. Missing family contracts + enrollment forms
      const { data: activeFamilies } = await supabase
        .from('families')
        .select('id, name, billing_status, primary_location_id')
        .eq('billing_status', 'active')

      const { data: familyFiles } = await supabase
        .from('family_files')
        .select('family_id, file_type')

      const filesByFamily = new Map<string, Set<string>>()
      familyFiles?.forEach((f: any) => {
        if (!filesByFamily.has(f.family_id)) filesByFamily.set(f.family_id, new Set())
        filesByFamily.get(f.family_id)!.add(f.file_type)
      })

      for (const f of (activeFamilies ?? [])) {
        const files = filesByFamily.get(f.id) ?? new Set()
        const displayName = f.name?.replace(/\s+family$/i, '') ?? f.name

        if (!files.has('contract')) {
          tasksToCreate.push({
            tenant_id: tenantId, task_type: 'missing_contract',
            title: `Upload contract — ${displayName}`, priority: 'high',
            assigned_role: 'studio_director', location_id: f.primary_location_id,
            entity_type: 'family', entity_id: f.id, entity_name: displayName,
            status: 'pending', dedup_key: `missing_contract:${f.id}`,
          })
        }
        if (!files.has('enrollment_form')) {
          tasksToCreate.push({
            tenant_id: tenantId, task_type: 'missing_enrollment_form',
            title: `Upload enrollment form — ${displayName}`, priority: 'high',
            assigned_role: 'studio_director', location_id: f.primary_location_id,
            entity_type: 'family', entity_id: f.id, entity_name: displayName,
            status: 'pending', dedup_key: `missing_enrollment:${f.id}`,
          })
        }
      }

      // Batch upsert with dedup
      if (tasksToCreate.length > 0) {
        await supabase.from('tasks').upsert(tasksToCreate, { onConflict: 'dedup_key', ignoreDuplicates: true })
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }) },
  })
}

// ═══════════════════════════════════════
// FILE VERIFICATION CHECK
// ═══════════════════════════════════════

export async function checkFileExists(taskType: string, entityId: string): Promise<boolean> {
  if (taskType === 'missing_contract') {
    const { data } = await supabase.from('family_files').select('id').eq('family_id', entityId).eq('file_type', 'contract').limit(1)
    return (data?.length ?? 0) > 0
  }
  if (taskType === 'missing_enrollment_form') {
    const { data } = await supabase.from('family_files').select('id').eq('family_id', entityId).eq('file_type', 'enrollment_form').limit(1)
    return (data?.length ?? 0) > 0
  }
  if (taskType === 'missing_teacher_w9') {
    const { data } = await supabase.from('teacher_documents').select('id').eq('teacher_id', entityId).ilike('category', '%w%9%').limit(1)
    return (data?.length ?? 0) > 0
  }
  if (taskType === 'missing_teacher_contract') {
    const { data } = await supabase.from('teacher_documents').select('id').eq('teacher_id', entityId).ilike('category', '%contract%').limit(1)
    return (data?.length ?? 0) > 0
  }
  return true
}
