import { useState } from 'react'
import { useSquareSync, useImportSquareFamily, useBulkImportSquareFamilies, useUpdateFamilyStatus } from '../../hooks/useSquareSync'
import { toast } from '../shared/Toast'
import ConfirmModal from '../shared/ConfirmModal'
import type { ParsedFamily, MatchedFamily, SquareSeriesRow } from '../../lib/squareCsvParser'
import type { UnmatchedLpFamily } from '../../hooks/useSquareSync'
import MusicLoader from '../shared/MusicLoader'

function dollars(cents: number): string {
  if (!cents) return '$0.00'
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

type SyncTab = 'new' | 'review' | 'not_in_square' | 'clean'

interface Props {
  locations: any[]
  initialLocationFilter?: string
}

export default function SquareSyncPanel({ locations, initialLocationFilter }: Props) {
  const { data, isLoading } = useSquareSync()
  const importOne = useImportSquareFamily()
  const importBulk = useBulkImportSquareFamilies()
  const updateStatus = useUpdateFamilyStatus()

  const [tab, setTab] = useState<SyncTab>('new')
  const [locationFilter, setLocationFilter] = useState(initialLocationFilter ?? '')
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [skippedReview, setSkippedReview] = useState<Set<string>>(new Set())
  const [importedRows, setImportedRows] = useState<Set<string>>(new Set())

  if (isLoading || !data) {
    return <div style={{ padding: 40, textAlign: 'center' }}><MusicLoader /></div>
  }

  const { newFamilies, needsReview, notInSquare, cleanMatches, rateMismatches } = data

  // Apply location filter
  const filterLoc = (row: { row?: SquareSeriesRow; series?: SquareSeriesRow }) => {
    if (!locationFilter) return true
    const loc = row.row?.location ?? row.series?.location ?? ''
    const locId = locations.find((l: any) => l.name.toLowerCase().includes(loc))?.id
    return locId === locationFilter || loc === locationFilter
  }
  const filterLpLoc = (fam: UnmatchedLpFamily) => {
    if (!locationFilter) return true
    const locName = fam.locationName?.toLowerCase() ?? ''
    const loc = locations.find((l: any) => l.id === locationFilter)
    return loc ? locName.includes(loc.name.replace(' Music Lessons', '').toLowerCase()) : true
  }

  const filteredNew = newFamilies.filter(filterLoc).filter(f => !importedRows.has(f.row.seriesToken))
  const filteredReview = needsReview.filter(filterLoc).filter(f => !skippedReview.has(f.row.seriesToken))
  const filteredNotInSquare = notInSquare.filter(filterLpLoc)
  const filteredClean = cleanMatches.filter(filterLoc)
  const filteredMismatch = rateMismatches.filter(filterLoc)

  const autoCreateCount = filteredNew.filter(f => f.autoCreate).length

  const handleImportOne = async (parsed: ParsedFamily) => {
    try {
      const result = await importOne.mutateAsync(parsed)
      toast(`Created ${result.familyName} with ${parsed.students.length} student(s)`, 'success')
      setImportedRows(prev => new Set([...prev, parsed.row.seriesToken]))
    } catch (err: any) {
      toast(err.message ?? 'Import failed', 'error')
    }
  }

  const handleBulkImport = async () => {
    setConfirmBulk(false)
    const autoRows = filteredNew.filter(f => f.autoCreate)
    try {
      const result = await importBulk.mutateAsync(autoRows)
      if (result.failed > 0) {
        toast(`Imported ${result.success}, failed ${result.failed}`, 'error')
      } else {
        toast(`Successfully imported ${result.success} families`, 'success')
      }
      // Mark all as imported
      setImportedRows(prev => {
        const next = new Set(prev)
        autoRows.forEach(r => next.add(r.row.seriesToken))
        return next
      })
    } catch (err: any) {
      toast(err.message ?? 'Bulk import failed', 'error')
    }
  }

  const handleMarkInactive = async (familyId: string) => {
    try {
      await updateStatus.mutateAsync({ familyId, status: 'cancelled' })
      toast('Family marked as inactive', 'success')
    } catch (err: any) {
      toast(err.message ?? 'Failed to update status', 'error')
    }
  }

  const locColor = (loc: string) => {
    const colors: Record<string, string> = { omaha: '#D4226A', bellevue: '#38BDF8', elkhorn: '#22C55E', gretna: '#FFB800' }
    return colors[loc] ?? '#8080A8'
  }

  return (
    <div>
      {/* Location filter pills */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 16, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 3, width: 'fit-content' }}>
        <button onClick={() => setLocationFilter('')} style={{
          padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
          background: !locationFilter ? 'rgba(212,34,106,0.12)' : 'transparent',
          color: !locationFilter ? '#E8488A' : '#8080A8',
          border: !locationFilter ? '1px solid rgba(212,34,106,0.2)' : '1px solid transparent',
        }}>All</button>
        {locations?.filter((l: any) => l.is_active).map((loc: any) => {
          const locName = loc.name.replace(' Music Lessons', '')
          const isActive = locationFilter === loc.id
          const lc = loc.color ?? '#D4226A'
          return (
            <button key={loc.id} onClick={() => setLocationFilter(isActive ? '' : loc.id)} style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: isActive ? `${lc}20` : 'transparent',
              color: isActive ? lc : '#8080A8',
              border: isActive ? `1px solid ${lc}40` : '1px solid transparent',
            }}>{locName}</button>
          )
        })}
      </div>

      {/* Sub-tabs */}
      <div className="lead-view-tabs" style={{ marginBottom: 16 }}>
        <button className={`lead-view-tab${tab === 'new' ? ' active' : ''}`} onClick={() => setTab('new')}>
          New Families <span className="tab-count">{filteredNew.length}</span>
        </button>
        <button className={`lead-view-tab${tab === 'review' ? ' active' : ''}`} onClick={() => setTab('review')}>
          Needs Review <span className="tab-count">{filteredReview.length}</span>
        </button>
        <button className={`lead-view-tab${tab === 'not_in_square' ? ' active' : ''}`} onClick={() => setTab('not_in_square')}>
          Not in Square <span className="tab-count">{filteredNotInSquare.length}</span>
        </button>
        <button className={`lead-view-tab${tab === 'clean' ? ' active' : ''}`} onClick={() => setTab('clean')}>
          Clean Matches <span className="tab-count">{filteredClean.length}</span>
        </button>
      </div>

      {/* Tab content */}
      {tab === 'new' && (
        <NewFamiliesTab
          families={filteredNew}
          autoCreateCount={autoCreateCount}
          onImportOne={handleImportOne}
          onBulkImport={() => setConfirmBulk(true)}
          importing={importOne.isPending || importBulk.isPending}
          locColor={locColor}
        />
      )}
      {tab === 'review' && (
        <NeedsReviewTab
          families={filteredReview}
          onSkip={(token) => setSkippedReview(prev => new Set([...prev, token]))}
          locColor={locColor}
        />
      )}
      {tab === 'not_in_square' && (
        <NotInSquareTab
          families={filteredNotInSquare}
          onMarkInactive={handleMarkInactive}
          updating={updateStatus.isPending}
        />
      )}
      {tab === 'clean' && (
        <CleanMatchesTab
          matches={filteredClean}
          mismatches={filteredMismatch}
          locColor={locColor}
        />
      )}

      {/* Bulk import confirmation */}
      {confirmBulk && (
        <ConfirmModal
          title="Bulk Import Families"
          message={`This will create ${autoCreateCount} new family records and their students in Lessonpreneur. Rows flagged for review will be skipped. Continue?`}
          variant="warning"
          onConfirm={handleBulkImport}
          onCancel={() => setConfirmBulk(false)}
        />
      )}
    </div>
  )
}

// ═══ Sub-tab 1: New Families ═══

function NewFamiliesTab({ families, autoCreateCount, onImportOne, onBulkImport, importing, locColor }: {
  families: ParsedFamily[]
  autoCreateCount: number
  onImportOne: (f: ParsedFamily) => void
  onBulkImport: () => void
  importing: boolean
  locColor: (loc: string) => string
}) {
  if (families.length === 0) {
    return <div style={{ padding: 32, textAlign: 'center', color: '#8080A8' }}>No new families to import.</div>
  }

  return (
    <div>
      {/* Bulk import button */}
      {autoCreateCount > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBulkImport} disabled={importing} style={{
            padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            background: 'rgba(34,197,94,0.12)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.25)',
            opacity: importing ? 0.5 : 1,
          }}>
            {importing ? 'Importing...' : `Import All Auto-Create (${autoCreateCount})`}
          </button>
          <span style={{ fontSize: 11, color: '#8080A8' }}>Skips flagged rows</span>
        </div>
      )}

      {/* Family rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {families.map(f => (
          <div key={f.row.seriesToken} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 10, borderLeft: `3px solid ${locColor(f.row.location)}`,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>
                  The {f.familyLastName} Family
                </span>
                {f.autoCreate ? (
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(34,197,94,0.12)', color: '#22C55E' }}>
                    Auto-create
                  </span>
                ) : (
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,184,0,0.12)', color: '#FFB800' }}>
                    Needs review
                  </span>
                )}
                <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: `${locColor(f.row.location)}20`, color: locColor(f.row.location) }}>
                  {f.row.location.charAt(0).toUpperCase() + f.row.location.slice(1)}
                </span>
                <span style={{ fontSize: 9, color: '#8080A8' }}>Rule {f.rule}</span>
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#A0A0C8' }}>
                <span>Students: {f.students.length > 0 ? f.students.map(s => s.firstName).join(', ') : '—'}</span>
                <span>{f.row.amountDisplay}/mo</span>
                <span>Billing day: {f.billingDay}</span>
                {f.sessionsPerMonth > 4 && <span style={{ color: '#FFB800' }}>{f.sessionsPerMonth} sessions/mo (double)</span>}
              </div>
              <div style={{ fontSize: 10, color: '#606088', marginTop: 2 }}>
                {f.row.customerName} · {f.row.customerEmail || 'no email'} · {f.row.customerPhone || 'no phone'}
              </div>
              {f.row.seriesTitle && (
                <div style={{ fontSize: 10, color: '#606088', fontStyle: 'italic' }}>Title: {f.row.seriesTitle}</div>
              )}
            </div>
            {f.autoCreate && (
              <button onClick={() => onImportOne(f)} disabled={importing} style={{
                padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                background: 'rgba(34,197,94,0.08)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.2)',
                whiteSpace: 'nowrap', opacity: importing ? 0.5 : 1,
              }}>
                Import
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══ Sub-tab 2: Needs Review ═══

function NeedsReviewTab({ families, onSkip, locColor }: {
  families: ParsedFamily[]
  onSkip: (token: string) => void
  locColor: (loc: string) => string
}) {
  if (families.length === 0) {
    return <div style={{ padding: 32, textAlign: 'center', color: '#8080A8' }}>No items need review.</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {families.map(f => (
        <div key={f.row.seriesToken} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
          background: 'rgba(255,184,0,0.02)', border: '1px solid rgba(255,184,0,0.1)',
          borderRadius: 10, borderLeft: `3px solid ${locColor(f.row.location)}`,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>
                {f.row.customerName}
              </span>
              <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: `${locColor(f.row.location)}20`, color: locColor(f.row.location) }}>
                {f.row.location.charAt(0).toUpperCase() + f.row.location.slice(1)}
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#FFB800', marginBottom: 4 }}>{f.reviewReason}</div>
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#A0A0C8' }}>
              <span>Amount: {f.row.amountDisplay}/mo</span>
              <span>Billing day: {f.billingDay}</span>
              <span>Email: {f.row.customerEmail || '—'}</span>
              <span>Phone: {f.row.customerPhone || '—'}</span>
            </div>
            {f.row.seriesTitle && (
              <div style={{ fontSize: 10, color: '#606088', marginTop: 2, fontStyle: 'italic' }}>Title: {f.row.seriesTitle}</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => onSkip(f.row.seriesToken)} style={{
              padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: 'rgba(255,255,255,0.04)', color: '#8080A8', border: '1px solid rgba(255,255,255,0.08)',
            }}>
              Skip
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ═══ Sub-tab 3: Not in Square ═══

function NotInSquareTab({ families, onMarkInactive, updating }: {
  families: UnmatchedLpFamily[]
  onMarkInactive: (id: string) => void
  updating: boolean
}) {
  const [keptActive, setKeptActive] = useState<Set<string>>(new Set())

  if (families.length === 0) {
    return <div style={{ padding: 32, textAlign: 'center', color: '#22C55E', fontWeight: 600 }}>All active LP families have a matching Square series.</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 12, color: '#A0A0C8', marginBottom: 8 }}>
        {families.length} active LP {families.length === 1 ? 'family has' : 'families have'} no matching Square recurring series.
      </div>
      {families.filter(f => !keptActive.has(f.familyId)).map(f => (
        <div key={f.familyId} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
          background: 'rgba(239,68,68,0.02)', border: '1px solid rgba(239,68,68,0.1)',
          borderRadius: 10,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>{f.familyName}</span>
              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>
                No Square series found
              </span>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#A0A0C8' }}>
              <span>{f.locationName ?? '—'}</span>
              <span>LP rate: {dollars(f.lpRateTier)}</span>
              <span>Email: {f.email ?? '—'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => onMarkInactive(f.familyId)} disabled={updating} style={{
              padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)',
              opacity: updating ? 0.5 : 1,
            }}>
              Mark Inactive
            </button>
            <button onClick={() => setKeptActive(prev => new Set([...prev, f.familyId]))} style={{
              padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: 'rgba(34,197,94,0.08)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.2)',
            }}>
              Keep Active
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ═══ Sub-tab 4: Clean Matches ═══

function CleanMatchesTab({ matches, mismatches, locColor }: {
  matches: MatchedFamily[]
  mismatches: MatchedFamily[]
  locColor: (loc: string) => string
}) {
  return (
    <div>
      {/* Clean matches */}
      <div style={{ fontSize: 12, color: '#22C55E', fontWeight: 600, marginBottom: 12 }}>
        {matches.length} families matched with aligned rates
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 24 }}>
        {matches.map(m => (
          <div key={m.familyId + m.series.seriesToken} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px',
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
            borderRadius: 8, borderLeft: `3px solid ${locColor(m.series.location)}`,
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#E0E0F4', flex: 1 }}>{m.familyName}</span>
            <span style={{ fontSize: 10, color: '#A0A0C8' }}>{m.locationName}</span>
            <span style={{ fontSize: 10, color: '#22C55E', fontWeight: 600 }}>{dollars(m.squareAmount)}/mo</span>
          </div>
        ))}
      </div>

      {/* Rate mismatches */}
      {mismatches.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: '#FFB800', fontWeight: 600, marginBottom: 12, marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {mismatches.length} rate {mismatches.length === 1 ? 'mismatch' : 'mismatches'} — review only
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {mismatches.map(m => (
              <div key={m.familyId + m.series.seriesToken} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px',
                background: 'rgba(255,184,0,0.02)', border: '1px solid rgba(255,184,0,0.08)',
                borderRadius: 8,
              }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#E0E0F4', flex: 1 }}>{m.familyName}</span>
                <span style={{ fontSize: 10, color: '#A0A0C8' }}>{m.locationName}</span>
                <span style={{ fontSize: 10 }}>
                  <span style={{ color: '#FFB800' }}>LP: {dollars(m.lpRateTier)}</span>
                  <span style={{ color: '#606088', margin: '0 6px' }}>vs</span>
                  <span style={{ color: '#38BDF8' }}>Square: {dollars(m.squareAmount)}</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
