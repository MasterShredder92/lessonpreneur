import { useState, useCallback, useMemo, type CSSProperties } from 'react'
import { useAuthContext } from '../../app/AuthContext'
import { usePlaidLink } from 'react-plaid-link'
import {
  usePlaidItems,
  useFinanceAccounts,
  useFinanceLocations,
  useFinanceTransactions,
  useUncategorizedTransactions,
  useFinanceCategories,
  useRecurringRules,
  useMonthlySummary,
  useLatestBalances,
  useFinanceExports,
  useSyncRuns,
  useCreateLinkToken,
  useExchangePlaidToken,
  useSyncTransactions,
  useSyncBalances,
  useAssignCategory,
  useCreateRecurringRule,
  useDeleteRecurringRule,
  useUpdateAccountLocation,
  useToggleTransactionRecurring,
  useRequestExport,
  currentMonthKey,
  shiftMonth,
  formatMonth,
  type FinanceTransaction,
  type FinanceAccount,
  type FinanceRecurringRule,
} from '../../hooks/useFinancePlaid'
import { toast } from '../../components/shared/Toast'
import MusicLoader from '../../components/shared/MusicLoader'
import { IssueContextProvider } from '../../contexts/IssueContext'
import ReportIssueButton from '../../components/shared/ReportIssueButton'
import {
  Plus, RefreshCw, ChevronLeft, ChevronRight, Download,
  Link2, Trash2, Tag, Repeat, Building2, ArrowUpDown, Search,
  Landmark, TrendingUp, TrendingDown, AlertCircle, Check,
} from 'lucide-react'

// ─── Design tokens ──────────────────────────────

const PINK = '#D4226A'
const ORANGE = '#FF5500'
const GOLD = '#FFB800'
const GLASS: CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
  padding: '22px 22px 20px',
  boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
}
const LABEL: CSSProperties = { fontSize: 10, fontWeight: 700, color: '#707090', textTransform: 'uppercase', letterSpacing: '0.06em' }
const MONO: CSSProperties = { fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.02em' }
const LOC_COLORS: Record<string, string> = {
  omaha: '#D41113', gretna: '#00A651', bellevue: '#A333FF', elkhorn: '#00A5E8',
}

type TabId = 'overview' | 'accounts' | 'transactions' | 'monthly' | 'recurring' | 'uncategorized' | 'exports'
const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'recurring', label: 'Recurring' },
  { id: 'uncategorized', label: 'Uncategorized' },
  { id: 'exports', label: 'Exports' },
]

// ─── Formatters ─────────────────────────────────

function dollars(n: number): string {
  const abs = Math.abs(n)
  const s = abs.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
  return n < 0 ? `−${s}` : s
}

function shortDollars(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${n < 0 ? '−' : ''}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${n < 0 ? '−' : ''}$${(abs / 1_000).toFixed(1)}K`
  return dollars(n)
}

function dateShort(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── Stat Card ──────────────────────────────────

function StatCard({ label, value, sub, color, icon }: {
  label: string; value: string; sub?: string; color?: string
  icon?: React.ReactNode
}) {
  return (
    <div style={{ ...GLASS, minHeight: 90, display: 'flex', flexDirection: 'column', gap: 4, borderLeft: `3px solid ${color ?? '#707090'}` }}>
      <div style={{ ...LABEL, display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon}
        {label}
      </div>
      <div style={{ ...MONO, fontSize: 22, fontWeight: 800, color: '#E8E8FC' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#8080A8' }}>{sub}</div>}
    </div>
  )
}

// ─── Pill Button ────────────────────────────────

function Pill({ active, onClick, children, color }: {
  active: boolean; onClick: () => void; children: React.ReactNode; color?: string
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
        border: active ? `2px solid ${color ?? PINK}` : '1px solid rgba(255,255,255,0.12)',
        background: active ? `${color ?? PINK}22` : 'rgba(255,255,255,0.04)',
        color: active ? color ?? PINK : '#A0A0C0',
        transition: 'all 0.15s ease',
      }}
    >
      {children}
    </button>
  )
}

// ─── Month Navigator ────────────────────────────

function MonthNav({ monthKey, onChange }: { monthKey: string; onChange: (mk: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button onClick={() => onChange(shiftMonth(monthKey, -1))} style={navBtnStyle}><ChevronLeft size={16} /></button>
      <span style={{ fontSize: 15, fontWeight: 800, color: '#E8E8FC', minWidth: 140, textAlign: 'center' }}>
        {formatMonth(monthKey)}
      </span>
      <button onClick={() => onChange(shiftMonth(monthKey, 1))} style={navBtnStyle}><ChevronRight size={16} /></button>
    </div>
  )
}
const navBtnStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8, padding: 6, cursor: 'pointer', color: '#A0A0C0', display: 'flex',
}

// ═══════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════

export default function Financials() {
  const { role } = useAuthContext()
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [monthKey, setMonthKey] = useState(currentMonthKey)

  // Access guard
  if (!['owner', 'admin', 'company_director'].includes(role ?? '')) {
    return <div style={{ padding: 40, color: '#8080A8' }}>You do not have access to this page.</div>
  }

  return (
    <IssueContextProvider pageName="Financials">
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px 80px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: '#E8E8FC', margin: 0 }}>Financials</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <SyncButtons />
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, overflowX: 'auto', paddingBottom: 4 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                border: activeTab === t.id ? `2px solid ${PINK}` : '1px solid rgba(255,255,255,0.08)',
                background: activeTab === t.id ? `${PINK}18` : 'transparent',
                color: activeTab === t.id ? PINK : '#8080A8',
                cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
              }}
            >
              {t.label}
              {t.id === 'uncategorized' && <UncategorizedBadge monthKey={monthKey} />}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'overview' && <OverviewTab monthKey={monthKey} setMonthKey={setMonthKey} />}
        {activeTab === 'accounts' && <AccountsTab />}
        {activeTab === 'transactions' && <TransactionsTab monthKey={monthKey} setMonthKey={setMonthKey} />}
        {activeTab === 'monthly' && <MonthlyTab monthKey={monthKey} setMonthKey={setMonthKey} />}
        {activeTab === 'recurring' && <RecurringTab />}
        {activeTab === 'uncategorized' && <UncategorizedTab monthKey={monthKey} setMonthKey={setMonthKey} />}
        {activeTab === 'exports' && <ExportsTab />}
      </div>
      <ReportIssueButton />
    </IssueContextProvider>
  )
}

// ─── Sync Buttons ───────────────────────────────

function SyncButtons() {
  const syncTx = useSyncTransactions()
  const syncBal = useSyncBalances()

  const handleSyncAll = async () => {
    try {
      toast.info('Syncing transactions...')
      const txResult = await syncTx.mutateAsync()
      toast.info('Syncing balances...')
      await syncBal.mutateAsync()
      toast.success(`Sync complete — ${txResult.added} added, ${txResult.modified} modified`)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <button
      onClick={handleSyncAll}
      disabled={syncTx.isPending || syncBal.isPending}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10,
        background: `linear-gradient(135deg, ${PINK}, ${ORANGE})`, border: 'none',
        color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: syncTx.isPending ? 0.6 : 1,
      }}
    >
      <RefreshCw size={14} className={syncTx.isPending ? 'spin' : ''} />
      {syncTx.isPending || syncBal.isPending ? 'Syncing...' : 'Sync Plaid'}
    </button>
  )
}

// ─── Uncategorized Badge ────────────────────────

function UncategorizedBadge({ monthKey }: { monthKey: string }) {
  const { data } = useUncategorizedTransactions(monthKey)
  const n = data?.length ?? 0
  // Reserve horizontal space so tab labels do not shift when the count appears (CLS).
  return (
    <span
      aria-hidden={n === 0}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 22,
        marginLeft: 6,
        padding: n > 0 ? '2px 7px' : '2px 0',
        borderRadius: 10,
        fontSize: 10,
        fontWeight: 800,
        background: n > 0 ? ORANGE : 'transparent',
        color: n > 0 ? '#fff' : 'transparent',
        verticalAlign: 'middle',
      }}
    >
      {n > 0 ? n : '\u00a0'}
    </span>
  )
}

// ═══════════════════════════════════════════════
// TAB: OVERVIEW
// ═══════════════════════════════════════════════

function OverviewTab({ monthKey, setMonthKey }: { monthKey: string; setMonthKey: (mk: string) => void }) {
  const { data: accounts, isLoading: loadingAccounts } = useFinanceAccounts()
  const { data: balances } = useLatestBalances()
  const { data: summary, isLoading: loadingSummary } = useMonthlySummary(monthKey)
  const { data: plaidItems } = usePlaidItems()
  const { data: syncRuns } = useSyncRuns()

  const hasAccounts = (accounts?.length ?? 0) > 0
  const totalBalance = balances?.reduce((s, b) => s + (b.current_balance ?? 0), 0) ?? 0
  const lastSync = syncRuns?.[0]

  if (!hasAccounts) return <ConnectBankPrompt />

  if (loadingAccounts || loadingSummary) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minHeight: 520 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                height: 92,
                borderRadius: 12,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            />
          ))}
        </div>
        <div style={{ borderRadius: 14, padding: 20, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', minHeight: 140 }}>
          <div style={{ height: 10, width: 120, borderRadius: 4, background: 'rgba(255,255,255,0.06)', marginBottom: 16 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ height: 72, borderRadius: 10, background: 'rgba(255,255,255,0.03)' }} />
            ))}
          </div>
        </div>
        <div style={{ borderRadius: 14, padding: 20, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', minHeight: 160 }}>
          <div style={{ height: 10, width: 140, borderRadius: 4, background: 'rgba(255,255,255,0.06)', marginBottom: 14 }} />
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ height: 48, borderRadius: 10, background: 'rgba(255,255,255,0.03)', marginBottom: 8 }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Balance + sync status */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <StatCard
          label="Total Cash Balance"
          value={dollars(totalBalance)}
          sub={`${balances?.length ?? 0} accounts linked`}
          color="#22C55E"
          icon={<Landmark size={12} />}
        />
        <StatCard
          label="Linked Institutions"
          value={String(plaidItems?.length ?? 0)}
          sub={plaidItems?.[0]?.institution_name ?? '—'}
          color={PINK}
          icon={<Link2 size={12} />}
        />
        <StatCard
          label="Last Sync"
          value={lastSync ? timeAgo(lastSync.completed_at ?? lastSync.started_at) : 'Never'}
          sub={lastSync ? `${lastSync.added_count} added, ${lastSync.modified_count} modified` : 'Connect a bank to start'}
          color={GOLD}
          icon={<RefreshCw size={12} />}
        />
      </div>

      {/* Monthly cash flow */}
      <div style={GLASS}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ ...LABEL, fontSize: 12 }}>Monthly Cash Flow</div>
          <MonthNav monthKey={monthKey} onChange={setMonthKey} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
          <StatCard
            label="Income"
            value={shortDollars(summary?.totalIncome ?? 0)}
            color="#22C55E"
            icon={<TrendingUp size={12} />}
          />
          <StatCard
            label="Expenses"
            value={shortDollars(summary?.totalExpenses ?? 0)}
            color="#EF4444"
            icon={<TrendingDown size={12} />}
          />
          <StatCard
            label="Net Cash Flow"
            value={shortDollars(summary?.netCashFlow ?? 0)}
            color={(summary?.netCashFlow ?? 0) >= 0 ? '#22C55E' : '#EF4444'}
            icon={<ArrowUpDown size={12} />}
          />
        </div>
      </div>

      {/* Account balances */}
      <div style={GLASS}>
        <div style={{ ...LABEL, fontSize: 12, marginBottom: 12 }}>Account Balances</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {balances?.map(b => (
            <div key={b.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#E8E8FC' }}>{b.account_name}</div>
                <div style={{ fontSize: 11, color: '#707090' }}>{b.mask ? `····${b.mask}` : ''}</div>
              </div>
              <div style={{ ...MONO, fontSize: 16, fontWeight: 800, color: (b.current_balance ?? 0) >= 0 ? '#22C55E' : '#EF4444' }}>
                {dollars(b.current_balance ?? 0)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top expenses by category */}
      {summary && summary.byCategory.length > 0 && (
        <div style={GLASS}>
          <div style={{ ...LABEL, fontSize: 12, marginBottom: 12 }}>Spend by Category</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {summary.byCategory
              .filter(c => c.total > 0) // outflows only
              .slice(0, 8)
              .map(c => {
                const pct = summary.totalExpenses > 0 ? (c.total / summary.totalExpenses) * 100 : 0
                return (
                  <div key={c.categoryName} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, fontSize: 13, color: '#C0C0E0', fontWeight: 600 }}>{c.categoryName}</div>
                    <div style={{ width: 120, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 3, background: PINK }} />
                    </div>
                    <div style={{ ...MONO, fontSize: 12, color: '#A0A0C0', minWidth: 80, textAlign: 'right' }}>
                      {dollars(c.total)}
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Connect Bank Prompt ────────────────────────

function ConnectBankPrompt() {
  const createLinkToken = useCreateLinkToken()
  const exchangeToken = useExchangePlaidToken()
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const { data: finLocs } = useFinanceLocations()
  const [selectedLocId, setSelectedLocId] = useState<string | null>(null)

  const handleConnect = async () => {
    try {
      const result = await createLinkToken.mutateAsync()
      setLinkToken(result.link_token)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const onSuccess = useCallback(async (publicToken: string, metadata: Record<string, unknown>) => {
    try {
      const result = await exchangeToken.mutateAsync({
        public_token: publicToken,
        institution: metadata.institution as { institution_id: string; name: string },
        location_id: selectedLocId ?? undefined,
      })
      toast.success(`Linked ${result.accounts_linked} accounts`)
      setLinkToken(null)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }, [exchangeToken, selectedLocId])

  return (
    <div style={{ ...GLASS, maxWidth: 500, margin: '60px auto', textAlign: 'center', padding: 40 }}>
      <Landmark size={48} color={PINK} style={{ marginBottom: 16 }} />
      <h2 style={{ fontSize: 22, fontWeight: 900, color: '#E8E8FC', margin: '0 0 8px' }}>Connect Your Bank</h2>
      <p style={{ fontSize: 14, color: '#8080A8', margin: '0 0 20px' }}>
        Link your business bank accounts to automatically track deposits, withdrawals, and balances.
      </p>

      {finLocs && finLocs.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ ...LABEL, marginBottom: 8 }}>Map to Location (optional)</div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Pill active={!selectedLocId} onClick={() => setSelectedLocId(null)}>All</Pill>
            {finLocs.map(l => (
              <Pill key={l.id} active={selectedLocId === l.core_location_id} onClick={() => setSelectedLocId(l.core_location_id)} color={LOC_COLORS[l.code]}>
                {l.name}
              </Pill>
            ))}
          </div>
        </div>
      )}

      {!linkToken ? (
        <button
          onClick={handleConnect}
          disabled={createLinkToken.isPending}
          style={{
            padding: '12px 28px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: `linear-gradient(135deg, ${PINK}, ${ORANGE})`,
            color: '#fff', fontSize: 15, fontWeight: 800,
            opacity: createLinkToken.isPending ? 0.6 : 1,
          }}
        >
          {createLinkToken.isPending ? 'Loading...' : 'Connect Bank Account'}
        </button>
      ) : (
        <PlaidLinkButton linkToken={linkToken} onSuccess={onSuccess} />
      )}
    </div>
  )
}

function PlaidLinkButton({ linkToken, onSuccess }: {
  linkToken: string; onSuccess: (token: string, metadata: Record<string, unknown>) => void
}) {
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (public_token: string, metadata: Record<string, unknown>) => onSuccess(public_token, metadata),
  })

  return (
    <button
      onClick={() => open()}
      disabled={!ready}
      style={{
        padding: '12px 28px', borderRadius: 12, border: 'none', cursor: 'pointer',
        background: `linear-gradient(135deg, ${PINK}, ${ORANGE})`,
        color: '#fff', fontSize: 15, fontWeight: 800,
        opacity: ready ? 1 : 0.6,
      }}
    >
      Open Plaid Link
    </button>
  )
}

// ═══════════════════════════════════════════════
// TAB: ACCOUNTS
// ═══════════════════════════════════════════════

function AccountsTab() {
  const { data: accounts, isLoading } = useFinanceAccounts()
  const { data: finLocs } = useFinanceLocations()
  const updateLoc = useUpdateAccountLocation()
  const createLinkToken = useCreateLinkToken()
  const exchangeToken = useExchangePlaidToken()
  const [linkToken, setLinkToken] = useState<string | null>(null)

  const handleAddAccount = async () => {
    try {
      const result = await createLinkToken.mutateAsync()
      setLinkToken(result.link_token)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const onPlaidSuccess = useCallback(async (publicToken: string, metadata: Record<string, unknown>) => {
    try {
      const result = await exchangeToken.mutateAsync({
        public_token: publicToken,
        institution: metadata.institution as { institution_id: string; name: string },
      })
      toast.success(`Linked ${result.accounts_linked} accounts`)
      setLinkToken(null)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }, [exchangeToken])

  if (isLoading) return <MusicLoader />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ ...LABEL, fontSize: 12 }}>{accounts?.length ?? 0} Linked Accounts</div>
        {!linkToken ? (
          <button onClick={handleAddAccount} style={addBtnStyle}>
            <Plus size={14} /> Link Account
          </button>
        ) : (
          <PlaidLinkButton linkToken={linkToken} onSuccess={onPlaidSuccess} />
        )}
      </div>

      {accounts?.map(acct => (
        <div key={acct.id} style={{ ...GLASS, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#E8E8FC' }}>{acct.account_name}</div>
            <div style={{ fontSize: 12, color: '#707090' }}>
              {acct.institution_name ?? ''} {acct.mask ? `····${acct.mask}` : ''} · {acct.account_type}/{acct.account_subtype}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <select
              value={acct.location_id ?? ''}
              onChange={e => {
                updateLoc.mutate({ account_id: acct.id, location_id: e.target.value || null })
                toast.success('Location updated')
              }}
              style={selectStyle}
            >
              <option value="">No Location</option>
              {finLocs?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>

            <div style={{ ...MONO, fontSize: 18, fontWeight: 800, color: (acct.latest_balance ?? 0) >= 0 ? '#22C55E' : '#EF4444', minWidth: 100, textAlign: 'right' }}>
              {acct.latest_balance != null ? dollars(acct.latest_balance) : '—'}
            </div>
          </div>
        </div>
      ))}

      {(!accounts || accounts.length === 0) && <ConnectBankPrompt />}
    </div>
  )
}

const addBtnStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10,
  background: `${PINK}22`, border: `1px solid ${PINK}44`, color: PINK,
  fontSize: 12, fontWeight: 700, cursor: 'pointer',
}

const selectStyle: CSSProperties = {
  padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
  color: '#C0C0E0', cursor: 'pointer',
}

// ═══════════════════════════════════════════════
// TAB: TRANSACTIONS
// ═══════════════════════════════════════════════

function TransactionsTab({ monthKey, setMonthKey }: { monthKey: string; setMonthKey: (mk: string) => void }) {
  const { data: transactions, isLoading } = useFinanceTransactions(monthKey)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!transactions) return []
    if (!search) return transactions
    const q = search.toLowerCase()
    return transactions.filter(t =>
      t.transaction_name.toLowerCase().includes(q) ||
      (t.merchant_name ?? '').toLowerCase().includes(q) ||
      (t.category_name ?? '').toLowerCase().includes(q)
    )
  }, [transactions, search])

  if (isLoading) return <MusicLoader />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <MonthNav monthKey={monthKey} onChange={setMonthKey} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '6px 12px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <Search size={14} color="#707090" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search transactions..."
            style={{ background: 'none', border: 'none', color: '#E8E8FC', fontSize: 13, outline: 'none', width: 180 }}
          />
        </div>
      </div>

      <div style={{ ...LABEL, fontSize: 11 }}>{filtered.length} transactions</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filtered.map(tx => (
          <TransactionRow key={tx.id} tx={tx} />
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#707090' }}>
            No transactions for {formatMonth(monthKey)}
          </div>
        )}
      </div>
    </div>
  )
}

function TransactionRow({ tx }: { tx: FinanceTransaction }) {
  const { data: categories } = useFinanceCategories()
  const assignCategory = useAssignCategory()
  const toggleRecurring = useToggleTransactionRecurring()
  const [showCatPicker, setShowCatPicker] = useState(false)

  const isInflow = tx.amount < 0 // Plaid: negative = money in
  const displayAmount = Math.abs(tx.amount)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
      borderRadius: 10, background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap',
    }}>
      {/* Date */}
      <div style={{ ...MONO, fontSize: 11, color: '#707090', minWidth: 50 }}>
        {dateShort(tx.posted_date)}
      </div>

      {/* Name + merchant */}
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#E8E8FC' }}>{tx.transaction_name}</div>
        {tx.merchant_name && tx.merchant_name !== tx.transaction_name && (
          <div style={{ fontSize: 11, color: '#707090' }}>{tx.merchant_name}</div>
        )}
      </div>

      {/* Account */}
      <div style={{ fontSize: 11, color: '#707090', minWidth: 80 }}>
        {tx.account_mask ? `····${tx.account_mask}` : tx.account_name}
      </div>

      {/* Category */}
      <div style={{ position: 'relative', minWidth: 110 }}>
        <button
          onClick={() => setShowCatPicker(!showCatPicker)}
          style={{
            padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            border: '1px solid rgba(255,255,255,0.1)',
            background: tx.category_name ? `${GOLD}18` : 'rgba(255,255,255,0.04)',
            color: tx.category_name ? GOLD : '#707090',
          }}
        >
          <Tag size={10} style={{ marginRight: 4 }} />
          {tx.category_name ?? 'Categorize'}
        </button>

        {showCatPicker && categories && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, zIndex: 100, marginTop: 4,
            background: '#1A1A2E', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10, padding: 8, maxHeight: 200, overflowY: 'auto', minWidth: 180,
            boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
          }}>
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => {
                  assignCategory.mutate({ transaction_id: tx.id, category_id: c.id })
                  setShowCatPicker(false)
                  toast.success(`Categorized as ${c.name}`)
                }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: tx.category_id === c.id ? `${PINK}22` : 'transparent',
                  color: '#C0C0E0', fontSize: 12, fontWeight: 600,
                }}
              >
                {c.name}
                <span style={{ fontSize: 10, color: '#707090', marginLeft: 6 }}>{c.group_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Recurring toggle */}
      <button
        onClick={() => {
          toggleRecurring.mutate({ id: tx.id, is_recurring: !tx.is_recurring })
          toast.success(tx.is_recurring ? 'Unmarked as recurring' : 'Marked as recurring')
        }}
        title={tx.is_recurring ? 'Recurring' : 'Mark as recurring'}
        style={{
          padding: 4, borderRadius: 6, border: 'none', cursor: 'pointer',
          background: tx.is_recurring ? `${GOLD}22` : 'transparent',
          color: tx.is_recurring ? GOLD : '#505070',
        }}
      >
        <Repeat size={14} />
      </button>

      {/* Amount */}
      <div style={{
        ...MONO, fontSize: 14, fontWeight: 800, minWidth: 90, textAlign: 'right',
        color: isInflow ? '#22C55E' : '#E8E8FC',
      }}>
        {isInflow ? '+' : '−'}{dollars(displayAmount).replace(/^−/, '')}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
// TAB: MONTHLY
// ═══════════════════════════════════════════════

function MonthlyTab({ monthKey, setMonthKey }: { monthKey: string; setMonthKey: (mk: string) => void }) {
  const { data: summary, isLoading } = useMonthlySummary(monthKey)

  if (isLoading) return <MusicLoader />
  if (!summary) return <div style={{ color: '#707090', padding: 40 }}>No data available.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <MonthNav monthKey={monthKey} onChange={setMonthKey} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <StatCard label="Income" value={dollars(summary.totalIncome)} color="#22C55E" icon={<TrendingUp size={12} />} />
        <StatCard label="Expenses" value={dollars(summary.totalExpenses)} color="#EF4444" icon={<TrendingDown size={12} />} />
        <StatCard label="Net Cash Flow" value={dollars(summary.netCashFlow)} color={summary.netCashFlow >= 0 ? '#22C55E' : '#EF4444'} icon={<ArrowUpDown size={12} />} />
      </div>

      {/* By Category */}
      <div style={GLASS}>
        <div style={{ ...LABEL, fontSize: 12, marginBottom: 12 }}>Breakdown by Category</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {summary.byCategory.map(c => (
            <div key={c.categoryName} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#C0C0E0' }}>{c.categoryName}</div>
              <div style={{ ...MONO, fontSize: 13, fontWeight: 700, color: c.total > 0 ? '#EF4444' : '#22C55E' }}>
                {dollars(c.total)}
              </div>
            </div>
          ))}
          {summary.byCategory.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: '#707090' }}>No transactions this month</div>
          )}
        </div>
      </div>

      {/* By Account */}
      <div style={GLASS}>
        <div style={{ ...LABEL, fontSize: 12, marginBottom: 12 }}>Breakdown by Account</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {summary.byAccount.map(a => (
            <div key={a.name} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#C0C0E0' }}>{a.name}</div>
                {a.mask && <div style={{ fontSize: 10, color: '#707090' }}>····{a.mask}</div>}
              </div>
              <div style={{ ...MONO, fontSize: 13, fontWeight: 700, color: a.total > 0 ? '#EF4444' : '#22C55E' }}>
                {dollars(a.total)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
// TAB: RECURRING
// ═══════════════════════════════════════════════

function RecurringTab() {
  const { data: rules, isLoading } = useRecurringRules()
  const deleteRule = useDeleteRecurringRule()
  const { data: transactions } = useFinanceTransactions(currentMonthKey())

  // Get transactions marked as recurring
  const recurringTxs = useMemo(
    () => (transactions ?? []).filter(t => t.is_recurring),
    [transactions],
  )

  if (isLoading) return <MusicLoader />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Recurring transactions this month */}
      <div style={GLASS}>
        <div style={{ ...LABEL, fontSize: 12, marginBottom: 12 }}>
          Recurring Transactions This Month ({recurringTxs.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {recurringTxs.map(tx => (
            <div key={tx.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#E8E8FC' }}>{tx.transaction_name}</div>
                <div style={{ fontSize: 11, color: '#707090' }}>
                  {dateShort(tx.posted_date)} · {tx.category_name ?? 'Uncategorized'}
                </div>
              </div>
              <div style={{ ...MONO, fontSize: 14, fontWeight: 800, color: tx.amount < 0 ? '#22C55E' : '#E8E8FC' }}>
                {dollars(Math.abs(tx.amount))}
              </div>
            </div>
          ))}
          {recurringTxs.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: '#707090' }}>
              No recurring transactions tagged. Use the Transactions tab to mark expenses as recurring.
            </div>
          )}
        </div>
      </div>

      {/* Recurring rules */}
      <div style={GLASS}>
        <div style={{ ...LABEL, fontSize: 12, marginBottom: 12 }}>
          Recurring Rules ({rules?.length ?? 0})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rules?.map(rule => (
            <div key={rule.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.05)',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#E8E8FC' }}>{rule.name}</div>
                <div style={{ fontSize: 11, color: '#707090' }}>
                  {rule.cadence ?? 'monthly'} · {rule.category_name ?? '—'} · {rule.merchant_match ? `Merchant: ${rule.merchant_match}` : ''}
                  {rule.amount_hint ? ` · ~${dollars(rule.amount_hint)}` : ''}
                </div>
              </div>
              <button
                onClick={() => {
                  deleteRule.mutate(rule.id)
                  toast.success('Rule deleted')
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 4 }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {(!rules || rules.length === 0) && (
            <div style={{ padding: 20, textAlign: 'center', color: '#707090' }}>
              No recurring rules defined yet. Rules auto-match merchants to categories.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
// TAB: UNCATEGORIZED
// ═══════════════════════════════════════════════

function UncategorizedTab({ monthKey, setMonthKey }: { monthKey: string; setMonthKey: (mk: string) => void }) {
  const { data: uncategorized, isLoading } = useUncategorizedTransactions(monthKey)
  const { data: categories } = useFinanceCategories()
  const assignCategory = useAssignCategory()

  if (isLoading) return <MusicLoader />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <MonthNav monthKey={monthKey} onChange={setMonthKey} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertCircle size={14} color={ORANGE} />
          <span style={{ fontSize: 13, fontWeight: 700, color: ORANGE }}>
            {uncategorized?.length ?? 0} uncategorized
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {uncategorized?.map(tx => (
          <div key={tx.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
            borderRadius: 10, background: 'rgba(255,255,255,0.02)',
            border: `1px solid ${ORANGE}22`, flexWrap: 'wrap',
          }}>
            <div style={{ ...MONO, fontSize: 11, color: '#707090', minWidth: 50 }}>
              {dateShort(tx.posted_date)}
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#E8E8FC' }}>{tx.transaction_name}</div>
              {tx.merchant_name && <div style={{ fontSize: 11, color: '#707090' }}>{tx.merchant_name}</div>}
            </div>
            <div style={{ ...MONO, fontSize: 14, fontWeight: 800, color: tx.amount < 0 ? '#22C55E' : '#E8E8FC', minWidth: 80, textAlign: 'right' }}>
              {dollars(Math.abs(tx.amount))}
            </div>

            {/* Quick category buttons */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {categories?.slice(0, 6).map(c => (
                <button
                  key={c.id}
                  onClick={() => {
                    assignCategory.mutate({ transaction_id: tx.id, category_id: c.id })
                    toast.success(`Categorized as ${c.name}`)
                  }}
                  style={{
                    padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                    border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
                    background: 'rgba(255,255,255,0.04)', color: '#A0A0C0',
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        ))}

        {(!uncategorized || uncategorized.length === 0) && (
          <div style={{ ...GLASS, padding: 40, textAlign: 'center' }}>
            <Check size={32} color="#22C55E" style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: '#22C55E' }}>All caught up!</div>
            <div style={{ fontSize: 13, color: '#707090' }}>Every transaction in {formatMonth(monthKey)} has been categorized.</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
// TAB: EXPORTS
// ═══════════════════════════════════════════════

function ExportsTab() {
  const { data: exports, isLoading } = useFinanceExports()
  const requestExport = useRequestExport()
  const [fromMonth, setFromMonth] = useState(currentMonthKey())
  const [toMonth, setToMonth] = useState(currentMonthKey())

  const handleExport = async () => {
    try {
      const result = await requestExport.mutateAsync({
        from_month: fromMonth,
        to_month: toMonth,
        export_type: 'csv',
      })
      toast.success(`Exported ${result.rows} transactions`)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  if (isLoading) return <MusicLoader />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* New export */}
      <div style={GLASS}>
        <div style={{ ...LABEL, fontSize: 12, marginBottom: 12 }}>Export Transactions</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: '#707090', marginBottom: 4 }}>From</div>
            <input
              type="month"
              value={fromMonth}
              onChange={e => setFromMonth(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#707090', marginBottom: 4 }}>To</div>
            <input
              type="month"
              value={toMonth}
              onChange={e => setToMonth(e.target.value)}
              style={inputStyle}
            />
          </div>
          <button
            onClick={handleExport}
            disabled={requestExport.isPending}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: `linear-gradient(135deg, ${PINK}, ${ORANGE})`,
              color: '#fff', fontSize: 13, fontWeight: 700,
              opacity: requestExport.isPending ? 0.6 : 1,
            }}
          >
            <Download size={14} />
            {requestExport.isPending ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* Export history */}
      <div style={GLASS}>
        <div style={{ ...LABEL, fontSize: 12, marginBottom: 12 }}>Export History</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {exports?.map(ex => (
            <div key={ex.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#E8E8FC' }}>
                  {ex.export_type.toUpperCase()} Export
                </div>
                <div style={{ fontSize: 11, color: '#707090' }}>
                  {new Date(ex.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
              <div style={{
                padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                background: ex.status === 'completed' ? '#22C55E22' : '#FFB80022',
                color: ex.status === 'completed' ? '#22C55E' : GOLD,
              }}>
                {ex.status}
              </div>
            </div>
          ))}
          {(!exports || exports.length === 0) && (
            <div style={{ padding: 20, textAlign: 'center', color: '#707090' }}>No exports yet</div>
          )}
        </div>
      </div>
    </div>
  )
}

const inputStyle: CSSProperties = {
  padding: '8px 12px', borderRadius: 8, fontSize: 13,
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
  color: '#E8E8FC', outline: 'none',
}
