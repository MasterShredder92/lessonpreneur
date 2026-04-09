import { useState } from 'react'
import { useAuthContext } from '../../app/AuthContext'
import { supabase } from '../../lib/supabase'
import { useQuery } from '@tanstack/react-query'
import MusicLoader from '../../components/shared/MusicLoader'
import { getTierPrice } from '../../lib/pricing'
import { Star, Users, MapPin, DollarSign } from 'lucide-react'
import { IssueContextProvider } from '../../contexts/IssueContext'
import ReportIssueButton from '../../components/shared/ReportIssueButton'
import { qk } from '../../lib/queryKeys'

interface TenantRow {
  id: string
  name: string
  slug: string
  plan: string
  pricing_tier: string
  trial_ends_at: string | null
  created_at: string
  location_count: number
  student_count: number
  owner_name: string
  owner_email: string
  mrr: number
}

export default function Platform() {
  const { profile } = useAuthContext()
  const [search, setSearch] = useState('')

  // Guard: only platform admins
  if (!profile?.is_platform_admin) {
    return <div className="page" style={{ padding: 40, textAlign: 'center', color: '#8080A8' }}>Access denied.</div>
  }

  const { data: tenants, isLoading } = useQuery<TenantRow[]>({
    queryKey: qk.tenant.platform,
    queryFn: async () => {
      const { data: allTenants } = await supabase.from('tenants').select('id, name, slug, plan, pricing_tier, trial_ends_at, created_at').order('created_at', { ascending: false })
      if (!allTenants) return []

      // Get counts per tenant
      const results: TenantRow[] = []
      for (const t of allTenants) {
        const [{ count: locCount }, { count: stuCount }, { data: owner }] = await Promise.all([
          supabase.from('locations').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id),
          supabase.from('students').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id).eq('status', 'active'),
          supabase.from('profiles').select('first_name, last_name, email').eq('tenant_id', t.id).eq('role', 'owner').limit(1).single(),
        ])
        results.push({
          ...t,
          location_count: locCount ?? 0,
          student_count: stuCount ?? 0,
          owner_name: owner ? `${owner.first_name} ${owner.last_name}`.trim() : '—',
          owner_email: owner?.email ?? '—',
          mrr: getTierPrice(t.pricing_tier ?? 'school'),
        })
      }
      return results
    },
  })

  const filtered = (tenants ?? []).filter(t => {
    if (!search) return true
    return t.name.toLowerCase().includes(search.toLowerCase()) || t.owner_name.toLowerCase().includes(search.toLowerCase())
  })

  const totalMRR = (tenants ?? []).filter(t => t.plan === 'active').reduce((s, t) => s + t.mrr, 0)
  const totalStudents = (tenants ?? []).reduce((s, t) => s + t.student_count, 0)
  const activeCount = (tenants ?? []).filter(t => t.plan === 'active').length
  const trialCount = (tenants ?? []).filter(t => t.plan === 'trial').length

  return (
    <IssueContextProvider page="Settings" section="Platform Admin">
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Star size={18} style={{ color: '#f59e0b' }} />
          <h1>Platform Admin</h1>
        </div>
        <ReportIssueButton />
      </div>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        <MetricCard label="Total Tenants" value={String(tenants?.length ?? 0)} sub={`${activeCount} active, ${trialCount} trial`} color="#f59e0b" />
        <MetricCard label="Total Students" value={String(totalStudents)} color="#D4226A" />
        <MetricCard label="MRR" value={`$${totalMRR.toLocaleString()}`} color="#22C55E" />
        <MetricCard label="Locations" value={String((tenants ?? []).reduce((s, t) => s + t.location_count, 0))} color="#3b82f6" />
      </div>

      {/* Search */}
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tenants..." style={{
        width: '100%', padding: '10px 14px', borderRadius: 10, marginBottom: 16,
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
        color: '#E0E0F4', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
      }} />

      {/* Tenant list */}
      {isLoading ? <MusicLoader /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(t => {
            const planColor = t.plan === 'active' ? '#22C55E' : t.plan === 'trial' ? '#f59e0b' : '#EF4444'
            return (
              <div key={t.id} style={{
                padding: '14px 16px', borderRadius: 10,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#E0E0F4' }}>{t.name}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: `${planColor}18`, color: planColor }}>{t.plan}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#8080A8', marginTop: 2, display: 'flex', gap: 14 }}>
                    <span>{t.owner_name} ({t.owner_email})</span>
                    <span>{t.location_count} loc</span>
                    <span>{t.student_count} students</span>
                    {t.plan === 'active' && <span style={{ color: '#22C55E' }}>${t.mrr}/mo</span>}
                    <span>Since {new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
    </IssueContextProvider>
  )
}

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{ padding: '16px 18px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#E0E0F4', fontFamily: 'monospace' }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#8080A8', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: '#606088', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
