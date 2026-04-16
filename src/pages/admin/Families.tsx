import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthContext } from '../../app/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import { useLocations } from '../../hooks/useLocations'
import { useFamiliesPage, useFamilyCountsByLocation, useFamilyTabCounts } from '../../hooks/useFamilies'
import { toast } from '../../components/shared/Toast'
import { IssueContextProvider } from '../../contexts/IssueContext'
import AddFamilyModal from '../../components/admin/AddFamilyModal'
import { useFamilyInsights } from '../../hooks/useInsights'
import { useAutoPayStats } from '../../hooks/useAutoPayNudge'
import { FamilyHeader } from '../../components/families/FamilyHeader'
import { FamilyNotes } from '../../components/families/FamilyNotes'
import { FamilyTags } from '../../components/families/FamilyTags'
import FamilyLocationGrid from '../../components/families/FamilyLocationGrid'
import LocationFamilyPanel from '../../components/families/LocationFamilyPanel'
import { FamilyDetailModal } from '@/components/families/FamilyDetailModal'

// Location brand colors — keyed by Supabase UUID (CLAUDE.md authoritative source)
const LOCATION_COLORS: Record<string, string> = {
  'f7b52dd5-12ee-437f-9c60-f8adf454ac31': '#A333FF', // Bellevue
  'cebd97d4-c241-4de2-8ade-49e5cc0070d5': '#00A5E8', // Elkhorn
  '40c67ffc-91b5-46a9-94bd-6ddffdfb7638': '#00A651', // Gretna
  'd48229c1-b70a-4d29-893e-5079887dab76': '#D41113', // Omaha
}

// ═══════════════════════════════════════
// FAMILIES PAGE
// ═══════════════════════════════════════

export default function Families() {
  const { role } = useAuthContext()
  const { isAtLeast, isStudioDirector, locationIds } = usePermissions()
  const navigate = useNavigate()
  const { data: locations } = useLocations()
  const { data: tabCounts } = useFamilyTabCounts()
  const { data: familyInsights } = useFamilyInsights()
  const { data: autoPayStats } = useAutoPayStats()

  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null)
  const [showAddFamily, setShowAddFamily] = useState(false)
  const [showExport, setShowExport] = useState(false)

  const canEdit = role === 'owner' || role === 'admin'
  const canExport = role === 'owner' || role === 'admin' || role === 'company_director'
  const canCreate = role === 'owner' || role === 'admin' || role === 'company_director' || role === 'studio_director'
  const canView = isAtLeast('studio_director')

  const activeLocationIds = useMemo(() => {
    if (isStudioDirector && locationIds?.length) return locationIds
    return (locations ?? []).filter((l: any) => l.is_active).map((l: any) => l.id)
  }, [locations, isStudioDirector, locationIds])

  const { data: locationCounts } = useFamilyCountsByLocation(activeLocationIds)
  const lockedLocationId = isStudioDirector && locationIds?.length ? locationIds[0] : null

  const { data: exportFamilies, isLoading: exportLoading } = useFamiliesPage({ enabled: showExport })

  const onSelectLocation = useCallback((id: string) => setSelectedLocationId(id), [])

  if (!canView) {
    navigate('/login', { replace: true })
    return null
  }

  const countActive = tabCounts?.active ?? 0
  const countInactive = tabCounts?.inactive ?? 0
  const countTotal = tabCounts?.all ?? 0

  return (
    <IssueContextProvider page="Roster — Families">
    <div className="page">
      {/* HEADER — stat bar */}
      <FamilyHeader
        countActive={countActive}
        countInactive={countInactive}
        countTotal={countTotal}
        canCreate={canCreate}
        canExport={canExport}
        onAddFamily={() => setShowAddFamily(true)}
        onExportCsv={() => setShowExport(true)}
      />

      <FamilyTags canView={canView} />

      {/* At-a-glance insight tiles */}
      <FamilyNotes
        billingIssues={familyInsights?.billingIssues}
        noAutopay={autoPayStats?.manualPayFamilies}
        newThisMonth={familyInsights?.newThisMonth}
        autoPayPercent={autoPayStats?.autoPayPercent}
        totalActive={countActive}
        onFixBilling={() => navigate('/admin/billing')}
        onViewAutopay={() => navigate('/admin/billing?section=autopay')}
      />

      {/* TIER 1: Location overview grid */}
      <FamilyLocationGrid
        locations={locations}
        locationCounts={locationCounts}
        locationColors={LOCATION_COLORS}
        totalActive={tabCounts?.active}
        onSelectLocation={onSelectLocation}
        isStudioDirector={isStudioDirector}
        lockedLocationId={lockedLocationId}
      />

      {/* TIER 2: Slide panel — lazy-loads on location click */}
      {selectedLocationId !== null && (
        <LocationFamilyPanel
          locationId={selectedLocationId}
          locations={locations}
          canEdit={canEdit}
          onClose={() => setSelectedLocationId(null)}
          onAddFamily={() => setShowAddFamily(true)}
          onOpenFamily={setSelectedFamilyId}
          navigate={navigate}
          locationColors={LOCATION_COLORS}
        />
      )}

      {/* Family detail modal (portals to document.body) */}
      {selectedFamilyId && (
        <FamilyDetailModal
          familyId={selectedFamilyId}
          canEdit={canEdit}
          onClose={() => setSelectedFamilyId(null)}
          onNavigateStudent={(id) => {
            setSelectedFamilyId(null)
            navigate(`/admin/students?id=${id}`)
          }}
        />
      )}

      {/* Add Family Modal */}
      {showAddFamily && (
        <AddFamilyModal
          onClose={() => setShowAddFamily(false)}
          onCreated={(familyId) => {
            setShowAddFamily(false)
            setSelectedFamilyId(familyId)
          }}
        />
      )}

      {/* Export Modal */}
      {showExport && (
        <div className="modal-overlay" onClick={() => setShowExport(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <span className="modal-title">Export Families CSV</span>
              <button className="btn-ghost" onClick={() => setShowExport(false)} style={{ padding: '4px 8px' }}>X</button>
            </div>
            <div style={{ padding: 22 }}>
              <p style={{ fontSize: 12.5, color: '#A0A0C8', marginBottom: 16 }}>
                {exportLoading ? 'Loading full roster for export…' : `Export ${exportFamilies?.length ?? 0} families.`}
              </p>
              <button
                className="btn-primary"
                disabled={exportLoading || !exportFamilies}
                style={{ width: '100%', justifyContent: 'center', padding: 12 }}
                onClick={() => {
                  if (!exportFamilies) return
                  const headers = ['Family Name', 'Parent Name', 'Email', 'Phone', 'Location', 'Rate', 'Billing Status', 'Students', 'Teachers', 'Instruments', 'Lifetime Paid', 'Balance', 'Military']
                  const rows = exportFamilies.map((f) => [
                    f.name ?? '',
                    f.parent_name ?? '',
                    f.primary_email ?? '',
                    f.primary_phone ?? '',
                    f.locationName ?? '',
                    `$${(f.rate_tier / 100).toFixed(2)}`,
                    f.billing_status ?? 'active',
                    String(f.activeStudentCount),
                    f.teacherNames?.join('; ') ?? '',
                    f.instrumentList?.join(', ') ?? '',
                    `$${((f.lifetime_paid_cents ?? 0) / 100).toFixed(2)}`,
                    `$${((f.balance ?? 0) / 100).toFixed(2)}`,
                    f.is_military ? 'Yes' : 'No',
                  ])
                  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
                  const blob = new Blob([csv], { type: 'text/csv' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url; a.download = `families_export_${new Date().toISOString().split('T')[0]}.csv`; a.click()
                  URL.revokeObjectURL(url)
                  setShowExport(false)
                  toast('Export downloaded', 'success')
                }}
              >
                Export {exportFamilies?.length ?? 0} Families
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </IssueContextProvider>
  )
}
