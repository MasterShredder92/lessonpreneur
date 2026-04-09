import { supabase } from './supabase'

/**
 * Batch a Supabase .in() query to avoid URL length limits.
 * Splits the IDs into chunks of `chunkSize` and merges results.
 */
export async function batchIn<T = any>(
  table: string,
  selectCols: string,
  filterCol: string,
  ids: string[],
  extraFilters?: (query: any) => any,
  chunkSize = 80,
  tenantId?: string,
): Promise<T[]> {
  if (ids.length === 0) return []
  if (ids.length <= chunkSize) {
    let q = supabase.from(table).select(selectCols).in(filterCol, ids)
    if (tenantId) q = q.eq('tenant_id', tenantId)
    if (extraFilters) q = extraFilters(q)
    const { data, error } = await q
    if (error) throw new Error(`batchIn(${table}): ${error.message}`)
    return (data ?? []) as T[]
  }

  const results: T[] = []
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    let q = supabase.from(table).select(selectCols).in(filterCol, chunk)
    if (tenantId) q = q.eq('tenant_id', tenantId)
    if (extraFilters) q = extraFilters(q)
    const { data, error } = await q
    if (error) throw new Error(`batchIn(${table}) chunk ${i}: ${error.message}`)
    if (data) results.push(...(data as T[]))
  }
  return results
}
