import { supabase } from './supabase'

export interface AuditLogEntry {
  tenantId: string
  performedBy: string
  userName: string
  userRole: string
  action: string
  tableName: string
  recordId: string
  entityName?: string | null
  locationId?: string | null
  oldValue?: any
  newValue?: any
}

// Fire-and-forget audit log insert. Never throws to caller.
export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    await supabase.from('audit_log').insert({
      tenant_id: entry.tenantId,
      performed_by: entry.performedBy,
      user_name: entry.userName,
      user_role: entry.userRole,
      action: entry.action,
      table_name: entry.tableName,
      record_id: entry.recordId,
      entity_name: entry.entityName ?? null,
      location_id: entry.locationId ?? null,
      old_value: entry.oldValue ?? null,
      new_value: entry.newValue ?? null,
    })
  } catch (e) {
    // Swallow — audit logging must not break user flow
    console.warn('[auditLog] insert failed', e)
  }
}
