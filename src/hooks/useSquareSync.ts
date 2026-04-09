import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'
import {
  parseSeriesCsv,
  categorizeRow,
  isMarch2026,
  getLocationId,
  type SquareSeriesRow,
  type ParsedFamily,
} from '../lib/squareCsvParser'
import { qk } from '../lib/queryKeys'

// ─── Types ───────────────────────────────────────────

export interface MatchedFamily {
  familyId: string
  familyName: string
  email: string | null
  phone: string | null
  locationName: string | null
  lpRateTier: number            // cents
  squareAmount: number          // cents
  rateMatch: boolean
  series: SquareSeriesRow
}

export interface UnmatchedLpFamily {
  familyId: string
  familyName: string
  email: string | null
  locationName: string | null
  lpRateTier: number
  billingStatus: string
}

export interface SquareSyncData {
  newFamilies: ParsedFamily[]
  needsReview: ParsedFamily[]
  notInSquare: UnmatchedLpFamily[]
  cleanMatches: MatchedFamily[]
  rateMismatches: MatchedFamily[]
  allSeries: SquareSeriesRow[]
  loading: boolean
}

// ─── CSV Loader ──────────────────────────────────────

const CSV_FILES = [
  { path: '/data/square/series-omaha.csv', location: 'omaha' },
  { path: '/data/square/series-bellevue.csv', location: 'bellevue' },
  { path: '/data/square/series-elkhorn.csv', location: 'elkhorn' },
  { path: '/data/square/series-gretna.csv', location: 'gretna' },
]

async function loadAllSeries(): Promise<SquareSeriesRow[]> {
  const all: SquareSeriesRow[] = []
  for (const file of CSV_FILES) {
    try {
      const resp = await fetch(file.path)
      if (!resp.ok) continue
      const text = await resp.text()
      const rows = parseSeriesCsv(text, file.location)
      all.push(...rows)
    } catch {
      console.warn(`Failed to load ${file.path}`)
    }
  }
  return all
}

// ─── Matching logic ──────────────────────────────────

function normalizeEmail(e: string | null | undefined): string {
  return (e ?? '').trim().toLowerCase()
}

function normalizeLastName(n: string | null | undefined): string {
  return (n ?? '').trim().toLowerCase().replace(/\s+family$/i, '')
}

function extractLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : parts[0]?.toLowerCase() ?? ''
}

// ─── Main Hook ───────────────────────────────────────

export function useSquareSync() {
  const { tenantId } = useAuthContext()
  const qc = useQueryClient()

  return useQuery<SquareSyncData>({
    queryKey: qk.square.sync(tenantId),
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000, // cache for 5 min
    queryFn: async (): Promise<SquareSyncData> => {
      // 1. Load all series from CSVs
      const allSeries = await loadAllSeries()

      // 2. Load LP families with students
      const { data: families } = await supabase
        .from('families')
        .select('id, name, primary_email, primary_phone, billing_status, rate_tier, primary_location_id')
        .eq('tenant_id', tenantId!)

      const { data: locations } = await supabase
        .from('locations')
        .select('id, name')

      const locMap = new Map((locations ?? []).map(l => [l.id, l.name]))

      // Build lookup maps for matching
      const familiesByEmail = new Map<string, typeof families extends (infer T)[] | null ? T : never>()
      const familiesByLastName = new Map<string, Array<typeof families extends (infer T)[] | null ? T : never>>()

      for (const fam of families ?? []) {
        const email = normalizeEmail(fam.primary_email)
        if (email) familiesByEmail.set(email, fam)

        const lastName = normalizeLastName(fam.name)
        if (!familiesByLastName.has(lastName)) familiesByLastName.set(lastName, [])
        familiesByLastName.get(lastName)!.push(fam)
      }

      // 3. Categorize new families (March 2026 created)
      const marchSeries = allSeries.filter(s => isMarch2026(s.createdDate))
      const newFamilies: ParsedFamily[] = []
      const needsReview: ParsedFamily[] = []

      // Track which LP families have a matching series
      const matchedFamilyIds = new Set<string>()

      for (const series of marchSeries) {
        const parsed = categorizeRow(series)

        // Check if this customer already exists in LP
        const email = normalizeEmail(series.customerEmail)
        const lastName = extractLastName(series.customerName)
        const existingByEmail = email ? familiesByEmail.get(email) : undefined
        const existingByName = familiesByLastName.get(lastName)

        if (existingByEmail) {
          matchedFamilyIds.add(existingByEmail.id)
          continue // Skip — already in LP
        }
        if (existingByName && existingByName.length === 1) {
          matchedFamilyIds.add(existingByName[0].id)
          continue // Skip — already in LP
        }

        if (parsed.autoCreate) {
          newFamilies.push(parsed)
        } else {
          needsReview.push(parsed)
        }
      }

      // 4. Match ALL active series (not just March) against LP families
      const cleanMatches: MatchedFamily[] = []
      const rateMismatches: MatchedFamily[] = []

      for (const series of allSeries) {
        const email = normalizeEmail(series.customerEmail)
        const lastName = extractLastName(series.customerName)

        let matched: (typeof families extends (infer T)[] | null ? T : never) | undefined

        if (email) matched = familiesByEmail.get(email)
        if (!matched) {
          const byName = familiesByLastName.get(lastName)
          if (byName && byName.length === 1) matched = byName[0]
          // If multiple matches by name, skip (ambiguous)
        }

        if (matched) {
          matchedFamilyIds.add(matched.id)
          const entry: MatchedFamily = {
            familyId: matched.id,
            familyName: matched.name,
            email: matched.primary_email,
            phone: matched.primary_phone,
            locationName: locMap.get(matched.primary_location_id ?? '') ?? null,
            lpRateTier: matched.rate_tier ?? 0,
            squareAmount: series.amount,
            rateMatch: matched.rate_tier === series.amount,
            series,
          }
          if (entry.rateMatch) {
            cleanMatches.push(entry)
          } else {
            rateMismatches.push(entry)
          }
        }
      }

      // 5. Find LP active families NOT in Square
      const notInSquare: UnmatchedLpFamily[] = []
      for (const fam of families ?? []) {
        if (fam.billing_status !== 'active') continue
        if (matchedFamilyIds.has(fam.id)) continue
        notInSquare.push({
          familyId: fam.id,
          familyName: fam.name,
          email: fam.primary_email,
          locationName: locMap.get(fam.primary_location_id ?? '') ?? null,
          lpRateTier: fam.rate_tier ?? 0,
          billingStatus: fam.billing_status,
        })
      }

      return {
        newFamilies,
        needsReview,
        notInSquare,
        cleanMatches,
        rateMismatches,
        allSeries,
        loading: false,
      }
    },
  })
}

// ─── Import Mutation ─────────────────────────────────

export function useImportSquareFamily() {
  const { tenantId } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (parsed: ParsedFamily) => {
      if (!tenantId) throw new Error('No tenant context')

      const locationId = getLocationId(parsed.row.location)

      // Create family
      const { data: family, error: famErr } = await supabase
        .from('families')
        .insert({
          tenant_id: tenantId,
          name: `The ${parsed.familyLastName} Family`,
          parent_name: parsed.row.customerName,
          primary_email: parsed.row.customerEmail || null,
          primary_phone: parsed.row.customerPhone || null,
          billing_status: 'active',
          billing_day: parsed.billingDay,
          rate_tier: parsed.row.amount,
          primary_location_id: locationId || null,
          is_military: false,
          balance: 0,
        })
        .select('id')
        .single()

      if (famErr) throw famErr

      // Create student(s)
      for (const student of parsed.students) {
        const { error: stuErr } = await supabase
          .from('students')
          .insert({
            tenant_id: tenantId,
            family_id: family.id,
            first_name: student.firstName,
            last_name: parsed.familyLastName,
            status: 'active',
            instrument: null,
            location_id: locationId || null,
            sessions_per_month: parsed.sessionsPerMonth,
          })
        if (stuErr) throw stuErr
      }

      return { familyId: family.id, familyName: `The ${parsed.familyLastName} Family` }
    },
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: qk.square.sync })
      qc.invalidateQueries({ queryKey: qk.families.all })
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.families.page }),
        qc.invalidateQueries({ queryKey: qk.families.roster }),
      ])
      qc.invalidateQueries({ queryKey: qk.families.tabCounts })
      qc.invalidateQueries({ queryKey: qk.students.all })
      qc.invalidateQueries({ queryKey: qk.students.roster })
      qc.invalidateQueries({ queryKey: qk.students.tabCounts })
      qc.invalidateQueries({ queryKey: qk.billing.families })
      qc.invalidateQueries({ queryKey: qk.billing.dashboard })
      qc.invalidateQueries({ queryKey: qk.billing.heroStats })
    },
  })
}

// ─── Bulk Import ─────────────────────────────────────

export function useBulkImportSquareFamilies() {
  const { tenantId } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (families: ParsedFamily[]) => {
      if (!tenantId) throw new Error('No tenant context')
      const results: { success: number; failed: number; errors: string[] } = {
        success: 0, failed: 0, errors: [],
      }

      for (const parsed of families) {
        if (!parsed.autoCreate) continue
        try {
          const locationId = getLocationId(parsed.row.location)

          const { data: family, error: famErr } = await supabase
            .from('families')
            .insert({
              tenant_id: tenantId,
              name: `The ${parsed.familyLastName} Family`,
              parent_name: parsed.row.customerName,
              primary_email: parsed.row.customerEmail || null,
              primary_phone: parsed.row.customerPhone || null,
              billing_status: 'active',
              billing_day: parsed.billingDay,
              rate_tier: parsed.row.amount,
              primary_location_id: locationId || null,
              is_military: false,
              balance: 0,
            })
            .select('id')
            .single()

          if (famErr) throw famErr

          for (const student of parsed.students) {
            await supabase.from('students').insert({
              tenant_id: tenantId,
              family_id: family.id,
              first_name: student.firstName,
              last_name: parsed.familyLastName,
              status: 'active',
              instrument: null,
              location_id: locationId || null,
              sessions_per_month: parsed.sessionsPerMonth,
            })
          }

          results.success++
        } catch (err: any) {
          results.failed++
          results.errors.push(`${parsed.row.customerName}: ${err.message}`)
        }
      }

      return results
    },
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: qk.square.sync })
      qc.invalidateQueries({ queryKey: qk.families.all })
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.families.page }),
        qc.invalidateQueries({ queryKey: qk.families.roster }),
      ])
      qc.invalidateQueries({ queryKey: qk.families.tabCounts })
      qc.invalidateQueries({ queryKey: qk.students.all })
      qc.invalidateQueries({ queryKey: qk.students.roster })
      qc.invalidateQueries({ queryKey: qk.students.tabCounts })
      qc.invalidateQueries({ queryKey: qk.billing.families })
      qc.invalidateQueries({ queryKey: qk.billing.dashboard })
      qc.invalidateQueries({ queryKey: qk.billing.heroStats })
    },
  })
}

export function useUpdateFamilyStatus() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ familyId, status }: { familyId: string; status: string }) => {
      const { error } = await supabase
        .from('families')
        .update({ billing_status: status })
        .eq('id', familyId)
      if (error) throw error
    },
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: qk.square.sync })
      qc.invalidateQueries({ queryKey: qk.families.all })
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.families.page }),
        qc.invalidateQueries({ queryKey: qk.families.roster }),
      ])
      qc.invalidateQueries({ queryKey: qk.families.tabCounts })
      qc.invalidateQueries({ queryKey: qk.billing.families })
      qc.invalidateQueries({ queryKey: qk.billing.heroStats })
    },
  })
}
