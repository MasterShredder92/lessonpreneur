import { useState, useRef, useEffect, type CSSProperties } from 'react'
import { ChevronDown } from 'lucide-react'
import { useAuthContext } from '../../app/AuthContext'
import {
  useIssues,
  useCreateIssue,
  useUpdateIssue,
  useScreenshotUrl,
  checkForDuplicateIssue,
  PAGES,
  CATEGORIES,
  SEVERITIES,
  STATUS_COLORS,
  DESCRIPTION_MAX_LENGTH,
  getSectionsForPage,
  getSubsectionsForSection,
  type StatusGroup,
} from '../../hooks/useIssues'
import { toast } from '../../components/shared/Toast'

export default function SettingsIssuesTab() {
  const { role } = useAuthContext()
  const isOwner = role === 'owner' || role === 'admin'
  const [statusFilter, setStatusFilter] = useState<StatusGroup>('open')
  const { data: issues, isLoading } = useIssues(statusFilter)
  const totalCount = issues?.length ?? 0
  const openCount = issues?.filter(i => ['reported', 'queued', 'diagnosing', 'fixing', 'deploying'].includes(i.status)).length ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <IssueReportForm isOwner={isOwner} />

      {/* Issue Log */}
      <div style={{ padding: '20px 22px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#E0E0F4', marginBottom: 4 }}>Issue Log</div>
          <div style={{ fontSize: 12, color: '#8080A8' }}>{totalCount} issues{statusFilter === 'open' ? '' : ` · ${openCount} open`}</div>
        </div>

        {/* Filter pills — Status */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#55516E', fontWeight: 600, marginRight: 4 }}>Status</span>
          {([['all', 'All'], ['open', 'New'], ['resolved', 'Fixed'], ['failed', 'Needs Attention']] as [StatusGroup, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setStatusFilter(key)} style={{
              padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: statusFilter === key ? 'rgba(212,34,106,0.12)' : 'rgba(255,255,255,0.03)',
              color: statusFilter === key ? '#D4226A' : '#8080A8',
              border: statusFilter === key ? '1px solid rgba(212,34,106,0.25)' : '1px solid rgba(255,255,255,0.06)',
            }}>{label}</button>
          ))}
        </div>

        {isLoading ? <div style={{ fontSize: 12, color: '#55516E', padding: '20px 0' }}>Loading issue list…</div> : !issues?.length ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#55516E', fontSize: 13 }}>No issues found.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {issues.map(issue => <IssueRow key={issue.id} issue={issue} isOwner={isOwner} />)}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Report Form ─────────────────────────────────────

function IssueReportForm({ isOwner }: { isOwner: boolean }) {
  const { tenantId: formTenantId } = useAuthContext()
  const createIssue = useCreateIssue()
  const [title, setTitle] = useState('')
  const [page, setPage] = useState('')
  const [section, setSection] = useState('')
  const [subsection, setSubsection] = useState('')
  const [otherPage, setOtherPage] = useState('')
  const [otherSection, setOtherSection] = useState('')
  const [otherSubsection, setOtherSubsection] = useState('')
  const [element, setElement] = useState('')
  const [platform, setPlatform] = useState('both')
  const [category, setCategory] = useState('')
  const [severity, setSeverity] = useState('normal')
  const [desc, setDesc] = useState('')
  const [stepsToReproduce, setStepsToReproduce] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [duplicateWarning, setDuplicateWarning] = useState<{ id: string; title: string } | null>(null)
  const [duplicateChecked, setDuplicateChecked] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const categories = isOwner ? CATEGORIES : CATEGORIES.filter(c => c.value !== 'feature_request')
  const selectedSeverity = SEVERITIES.find(s => s.value === severity)

  const sections = getSectionsForPage(page)
  const subsections = getSubsectionsForSection(page, section)
  const hasSubsections = subsections !== null && subsections.length > 0

  const clearForm = () => {
    setTitle(''); setPage(''); setSection(''); setSubsection('')
    setOtherPage(''); setOtherSection(''); setOtherSubsection('')
    setPlatform('both'); setElement('')
    setCategory(''); setSeverity('normal'); setDesc(''); setStepsToReproduce('')
    setFile(null); setPreview(null)
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 5 * 1024 * 1024) { toast('Screenshot must be under 5MB', 'error'); return }
    setFile(f)
    const reader = new FileReader()
    reader.onload = () => setPreview(reader.result as string)
    reader.readAsDataURL(f)
  }

  const handleSubmit = async () => {
    if (!title.trim()) { toast('Title is required', 'error'); return }
    if (!page) { toast('Select a page', 'error'); return }
    if (page === 'Other' && !otherPage.trim()) { toast('Describe the page', 'error'); return }
    if (!section) { toast('Select a section', 'error'); return }
    if (section === 'Other' && !otherSection.trim()) { toast('Describe the section', 'error'); return }
    if (hasSubsections && subsection === 'Other' && !otherSubsection.trim()) { toast('Describe the subsection', 'error'); return }
    if (!element.trim()) { toast('Describe the element', 'error'); return }
    if (!category) { toast('Select a category', 'error'); return }
    if (desc.trim().length < 20) { toast('Description must be at least 20 characters', 'error'); return }

    // "Other" saves as just "Other" — the user's typed description goes into element_description
    const finalPage = page === 'Other' ? 'Other' : page
    const finalSection = section === 'Other' ? 'Other' : section
    const finalSubsection = !hasSubsections ? null
      : subsection === 'Other' ? 'Other'
      : subsection || null

    // Build element_description with any "Other" context
    const otherContext = [
      page === 'Other' && otherPage.trim() ? `Page: ${otherPage.trim()}` : '',
      section === 'Other' && otherSection.trim() ? `Section: ${otherSection.trim()}` : '',
      subsection === 'Other' && otherSubsection.trim() ? `Subsection: ${otherSubsection.trim()}` : '',
    ].filter(Boolean).join('; ')
    const fullElement = otherContext
      ? `${element.trim()}${element.trim() ? ' — ' : ''}${otherContext}`
      : element.trim()

    // Check for duplicates (soft warning, never blocks)
    if (!duplicateChecked && formTenantId && finalPage) {
      setIsSubmitting(true)
      try {
        const dup = await checkForDuplicateIssue(formTenantId, finalPage, desc.trim())
        if (dup) {
          setDuplicateWarning(dup)
          setIsSubmitting(false)
          return
        }
      } catch {
        // If duplicate check fails, proceed
      }
      setIsSubmitting(false)
    }

    setIsSubmitting(true)
    try {
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Request timed out — please try again')), 15000))
      await Promise.race([
        createIssue.mutateAsync({
          title: title.trim(), page: finalPage, section: finalSection, subsection: finalSubsection,
          platform, element_description: fullElement,
          category, severity, description: desc.trim(),
          steps_to_reproduce: stepsToReproduce.trim() || null,
          user_friendly_category: categories.find(c => c.value === category)?.friendlyLabel ?? null,
          screenshotFile: file,
        }),
        timeout,
      ])
      toast('Issue reported — fix pipeline activated', 'success')
      clearForm()
      setDuplicateWarning(null)
      setDuplicateChecked(false)
    } catch (err: any) {
      toast(err.message ?? 'Failed to submit issue', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 13,
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
    color: '#E0E0F4', outline: 'none',
  }
  const disabledStyle: React.CSSProperties = { ...inputStyle, opacity: 0.4, cursor: 'not-allowed' }

  return (
    <div style={{ padding: '20px 22px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#E0E0F4', marginBottom: 4 }}>How can we help?</div>
      <div style={{ fontSize: 12, color: '#8080A8', marginBottom: 18 }}>Tell us what's wrong and we'll fix it.</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Title */}
        <div>
          <input value={title} onChange={e => setTitle(e.target.value.slice(0, 100))} maxLength={100} placeholder="Brief summary of the issue" style={inputStyle} />
          <div style={{ fontSize: 11, marginTop: 4, color: (100 - title.length) === 0 ? '#D4226A' : (100 - title.length) < 20 ? '#FF5500' : '#55516E' }}>{100 - title.length} characters remaining</div>
        </div>

        {/* Page → Section → Subsection cascade */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, color: '#8080A8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Where did this occur?</div>
          <select value={page} onChange={e => { setPage(e.target.value); setSection(''); setSubsection(''); setOtherPage(''); setOtherSection(''); setOtherSubsection('') }} style={inputStyle}>
            <option value="">Select page...</option>
            {PAGES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {page === 'Other' && (
            <input value={otherPage} onChange={e => setOtherPage(e.target.value.slice(0, 100))} maxLength={100} placeholder="Describe the page..." style={{ ...inputStyle, borderColor: 'rgba(251,146,60,0.3)' }} />
          )}
          <select value={section} onChange={e => { setSection(e.target.value); setSubsection(''); setOtherSection(''); setOtherSubsection('') }} disabled={!page} style={page ? inputStyle : disabledStyle}>
            <option value="">Select section...</option>
            {sections.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {section === 'Other' && (
            <input value={otherSection} onChange={e => setOtherSection(e.target.value.slice(0, 100))} maxLength={100} placeholder="Describe the section..." style={{ ...inputStyle, borderColor: 'rgba(251,146,60,0.3)' }} />
          )}
          {hasSubsections && (
            <select value={subsection} onChange={e => { setSubsection(e.target.value); setOtherSubsection('') }} style={inputStyle}>
              <option value="">Select subsection (optional)...</option>
              {subsections.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {hasSubsections && subsection === 'Other' && (
            <input value={otherSubsection} onChange={e => setOtherSubsection(e.target.value.slice(0, 100))} maxLength={100} placeholder="Describe the subsection..." style={{ ...inputStyle, borderColor: 'rgba(251,146,60,0.3)' }} />
          )}
        </div>

        {/* Platform */}
        <div>
          <div style={{ fontSize: 11, color: '#8080A8', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Platform</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[{ value: 'mobile', label: 'Mobile' }, { value: 'desktop', label: 'Desktop' }, { value: 'both', label: 'Both' }].map(p => (
              <button key={p.value} onClick={() => setPlatform(p.value)} style={{
                padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: platform === p.value ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)',
                color: platform === p.value ? '#E0E0F4' : '#8080A8',
                border: `1px solid ${platform === p.value ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)'}`,
              }}>{p.label}</button>
            ))}
          </div>
        </div>

        {/* Element */}
        <div>
          <input value={element} onChange={e => setElement(e.target.value.slice(0, 200))} maxLength={200} placeholder="Which specific element? (e.g. the Save button, the name column)" style={inputStyle} />
          <div style={{ fontSize: 11, marginTop: 4, color: (200 - element.length) === 0 ? '#D4226A' : (200 - element.length) < 20 ? '#FF5500' : '#55516E' }}>{200 - element.length} characters remaining</div>
        </div>

        {/* Category dropdown */}
        <CategoryDropdown categories={categories} value={category} onChange={setCategory} />

        {/* Severity pills */}
        <div>
          <div style={{ fontSize: 11, color: '#8080A8', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Severity</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SEVERITIES.map(s => (
              <button key={s.value} onClick={() => setSeverity(s.value)} style={{
                padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: severity === s.value ? `${s.color}18` : 'rgba(255,255,255,0.03)',
                color: severity === s.value ? s.color : '#8080A8',
                border: `1px solid ${severity === s.value ? `${s.color}30` : 'rgba(255,255,255,0.06)'}`,
              }}>{s.label}</button>
            ))}
          </div>
          {selectedSeverity && <div style={{ fontSize: 11, color: '#55516E', marginTop: 4 }}>{selectedSeverity.hint}</div>}
        </div>

        {/* Description */}
        <div>
          <div style={{ fontSize: 11, color: '#8080A8', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>What happened?</div>
          <textarea value={desc} onChange={e => setDesc(e.target.value.slice(0, DESCRIPTION_MAX_LENGTH))} maxLength={DESCRIPTION_MAX_LENGTH} placeholder="Tell us what went wrong or what you expected to happen..." rows={4} style={{ ...inputStyle, resize: 'vertical', minHeight: 100 }} />
          <div style={{ fontSize: 11, marginTop: 4, color: (DESCRIPTION_MAX_LENGTH - desc.length) === 0 ? '#D4226A' : (DESCRIPTION_MAX_LENGTH - desc.length) < 50 ? '#FF5500' : '#55516E' }}>{DESCRIPTION_MAX_LENGTH - desc.length} characters remaining</div>
        </div>

        {/* Steps to reproduce */}
        <div>
          <div style={{ fontSize: 11, color: '#8080A8', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>How can we reproduce it? <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></div>
          <textarea value={stepsToReproduce} onChange={e => setStepsToReproduce(e.target.value)} maxLength={1000} placeholder="e.g. 1. Go to Schedule  2. Tap on a block  3. Nothing happens" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
        </div>

        {/* Screenshot */}
        <div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFile} style={{ display: 'none' }} />
          {!preview ? (
            <button onClick={() => fileRef.current?.click()} style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: 'rgba(255,255,255,0.03)', color: '#8080A8', border: '1px solid rgba(255,255,255,0.08)',
            }}>📷 Add Screenshot</button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src={preview} alt="Screenshot" style={{ height: 48, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)' }} />
              <button onClick={() => { setFile(null); setPreview(null) }} style={{
                background: 'none', border: 'none', color: '#EF4444', fontSize: 16, cursor: 'pointer',
              }}>✕</button>
            </div>
          )}
        </div>

        {/* Duplicate Warning */}
        {duplicateWarning && (
          <div style={{
            padding: '12px 14px', borderRadius: 10,
            background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#D97706', marginBottom: 4 }}>Possible duplicate</div>
            <div style={{ fontSize: 11, color: '#D4C5A0', lineHeight: 1.4, marginBottom: 10 }}>
              This may be similar to: <strong>"{duplicateWarning.title}"</strong>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setDuplicateWarning(null); setDuplicateChecked(true); handleSubmit() }} disabled={isSubmitting} style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: 'rgba(217,119,6,0.15)', border: '1px solid rgba(217,119,6,0.3)', color: '#D97706',
              }}>{isSubmitting ? 'Submitting...' : 'Submit Anyway'}</button>
              <button onClick={() => setDuplicateWarning(null)} style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#A0A0C8',
              }}>Edit Report</button>
            </div>
          </div>
        )}

        {/* Actions */}
        {!duplicateWarning && (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={clearForm} style={{ padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'none', color: '#8080A8', border: 'none' }}>Cancel</button>
            <button onClick={handleSubmit} disabled={isSubmitting} style={{
              padding: '10px 24px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              background: '#D4226A', color: '#fff', border: 'none', opacity: isSubmitting ? 0.5 : 1,
            }}>{isSubmitting ? 'Submitting...' : 'Submit Issue'}</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Issue Row (expandable) ─────────────────────────

function IssueRow({ issue, isOwner }: { issue: any; isOwner: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [actionModal, setActionModal] = useState<string | null>(null)
  const [actionNotes, setActionNotes] = useState('')
  const [promptOpen, setPromptOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const updateIssue = useUpdateIssue()
  const { data: screenshotUrl } = useScreenshotUrl(issue.screenshot_path)
  const [lightbox, setLightbox] = useState(false)

  const statusColor = STATUS_COLORS[issue.status] ?? '#55516E'
  const isPulsing = ['diagnosing', 'fixing'].includes(issue.status)
  const catMeta = CATEGORIES.find(c => c.value === issue.category)
  const sevMeta = SEVERITIES.find(s => s.value === issue.severity)

  const timeAgo = (d: string) => {
    const diff = (Date.now() - new Date(d).getTime()) / 1000
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  const handleAction = async (action: string) => {
    try {
      if (action === 'wont_fix') {
        await updateIssue.mutateAsync({ id: issue.id, status: 'wont_fix', resolution_notes: actionNotes, resolved_at: new Date().toISOString(), resolved_by: 'admin' })
      } else if (action === 'resolve') {
        await updateIssue.mutateAsync({ id: issue.id, status: 'resolved', resolution_notes: actionNotes, resolved_at: new Date().toISOString(), resolved_by: 'admin' })
      } else if (action === 'retry') {
        await updateIssue.mutateAsync({ id: issue.id, status: 'reported', resolution_notes: null, pipeline_prompt: null, pipeline_started_at: null, pipeline_completed_at: null, deploy_status: 'pending' })
      } else if (action === 'duplicate') {
        await updateIssue.mutateAsync({ id: issue.id, status: 'duplicate', resolution_notes: actionNotes })
      }
      toast(`Issue updated`, 'success')
      setActionModal(null)
      setActionNotes('')
    } catch (err: any) {
      toast(err.message ?? 'Failed', 'error')
    }
  }

  return (
    <>
      <div onClick={() => setExpanded(!expanded)} style={{
        padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
        transition: 'border-color 0.2s',
      }}>
        {/* Collapsed */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0,
            ...(isPulsing ? { animation: 'issue-pulse 1.5s infinite' } : {}),
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{issue.title}</div>
            <div style={{ fontSize: 11, color: '#55516E', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span>{issue.page} → {issue.section}{issue.subsection ? ` → ${issue.subsection}` : ''}</span>
              {catMeta && <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: `${catMeta.color}15`, color: catMeta.color }}>{catMeta.pillLabel}</span>}
            </div>
          </div>
          {sevMeta && sevMeta.value !== 'normal' && (
            <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 9, fontWeight: 700, background: `${sevMeta.color}15`, color: sevMeta.color }}>{sevMeta.label}</span>
          )}
          <div style={{ fontSize: 10, color: '#55516E', textAlign: 'right', flexShrink: 0 }}>
            <div>{issue.reporter_name?.split(' ')[0]}</div>
            <div>{timeAgo(issue.created_at)}</div>
          </div>
        </div>

        {/* Expanded */}
        {expanded && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 13, color: '#A0A0C8', lineHeight: 1.65, marginBottom: 10 }}>{issue.description}</div>
            <div style={{ fontSize: 11, color: '#55516E', marginBottom: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div><strong style={{ color: '#8080A8' }}>Element:</strong> {issue.element_description}</div>
              {issue.platform && <div><strong style={{ color: '#8080A8' }}>Platform:</strong> {issue.platform === 'both' ? 'Both' : issue.platform === 'mobile' ? 'Mobile' : 'Desktop'}</div>}
              {issue.reported_from_url && <div><strong style={{ color: '#8080A8' }}>Reported from:</strong> {issue.reported_from_url}</div>}
              {issue.reported_screen_width && issue.reported_screen_height && <div><strong style={{ color: '#8080A8' }}>Screen:</strong> {issue.reported_screen_width} × {issue.reported_screen_height}px</div>}
            </div>

            {screenshotUrl && (
              <div style={{ marginBottom: 10 }}>
                <img src={screenshotUrl} alt="Screenshot" onClick={() => setLightbox(true)} style={{ maxHeight: 80, borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.08)' }} />
              </div>
            )}

            {issue.status === 'resolved' && (
              <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#22C55E', marginBottom: 3 }}>Resolved</div>
                {issue.resolution_notes && <div style={{ fontSize: 12, color: '#A0A0C8', lineHeight: 1.5 }}>{issue.resolution_notes}</div>}
                <div style={{ fontSize: 10, color: '#55516E', marginTop: 4 }}>
                  {issue.resolved_at && timeAgo(issue.resolved_at)} by {issue.resolved_by === 'system:claude_code' ? 'Auto-fix pipeline' : issue.resolved_by ?? 'admin'}
                </div>
              </div>
            )}

            {issue.status === 'failed_build' && (
              <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#EF4444', marginBottom: 3 }}>Build failed — awaiting manual review</div>
                {issue.resolution_notes && <div style={{ fontSize: 12, color: '#A0A0C8', lineHeight: 1.5, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{issue.resolution_notes}</div>}
              </div>
            )}

            {isOwner && issue.pipeline_prompt && (
              <div style={{ marginTop: 8 }}>
                <button onClick={() => setPromptOpen(!promptOpen)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  color: '#8080A8', display: 'flex', alignItems: 'center', gap: 4, padding: 0,
                }}>
                  {promptOpen ? '▾' : '▸'} View Pipeline Prompt
                </button>
                {promptOpen && (
                  <div style={{ marginTop: 6, position: 'relative' }}>
                    <button onClick={() => {
                      navigator.clipboard.writeText(issue.pipeline_prompt!)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }} style={{
                      position: 'absolute', top: 6, right: 6, padding: '3px 10px', borderRadius: 6,
                      fontSize: 10, fontWeight: 700, cursor: 'pointer',
                      background: copied ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.06)',
                      color: copied ? '#22C55E' : '#8080A8',
                      border: `1px solid ${copied ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.08)'}`,
                    }}>{copied ? 'Copied!' : 'Copy to Clipboard'}</button>
                    <pre style={{
                      fontSize: 11, lineHeight: 1.5, color: '#A0A0C8', fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      padding: '12px 14px', borderRadius: 8, maxHeight: 400, overflowY: 'auto',
                      background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)',
                    }}>{issue.pipeline_prompt}</pre>
                  </div>
                )}
              </div>
            )}

            {isOwner && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {!['resolved', 'wont_fix', 'duplicate'].includes(issue.status) && (
                  <>
                    <button onClick={() => setActionModal('wont_fix')} style={actionBtnStyle}>Won't Fix</button>
                    <button onClick={() => setActionModal('duplicate')} style={actionBtnStyle}>Duplicate</button>
                    <button onClick={() => setActionModal('retry')} style={actionBtnStyle}>Retry Pipeline</button>
                    <button onClick={() => setActionModal('resolve')} style={actionBtnStyle}>Resolve Manually</button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Screenshot lightbox */}
      {lightbox && screenshotUrl && (
        <div onClick={() => setLightbox(false)} style={{
          position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <img src={screenshotUrl} alt="Full screenshot" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 10 }} />
        </div>
      )}

      {/* Action modal */}
      {actionModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => { setActionModal(null); setActionNotes('') }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '90%', maxWidth: 420, padding: 24, borderRadius: 16,
            background: '#12121E', border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#E0E0F4', marginBottom: 12 }}>
              {actionModal === 'wont_fix' && "Mark as Won't Fix"}
              {actionModal === 'duplicate' && 'Mark as Duplicate'}
              {actionModal === 'retry' && 'Retry Pipeline'}
              {actionModal === 'resolve' && 'Resolve Manually'}
            </div>

            {actionModal === 'retry' ? (
              <div style={{ fontSize: 13, color: '#A0A0C8', marginBottom: 16 }}>Re-send this issue to the fix pipeline?</div>
            ) : (
              <textarea value={actionNotes} onChange={e => setActionNotes(e.target.value)} placeholder={actionModal === 'duplicate' ? 'Which issue is this a duplicate of?' : 'Resolution notes...'} rows={3} style={{
                width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 13,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                color: '#E0E0F4', outline: 'none', resize: 'vertical', marginBottom: 16,
              }} />
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setActionModal(null); setActionNotes('') }} style={{ padding: '8px 18px', borderRadius: 8, fontSize: 12, background: 'none', color: '#8080A8', border: 'none', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => handleAction(actionModal)} disabled={updateIssue.isPending || (actionModal !== 'retry' && !actionNotes.trim())} style={{
                padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: actionModal === 'wont_fix' ? '#55516E' : '#D4226A', color: '#fff', border: 'none',
                opacity: updateIssue.isPending || (actionModal !== 'retry' && !actionNotes.trim()) ? 0.4 : 1,
              }}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function CategoryDropdown({ categories, value, onChange }: { categories: readonly { value: string; label: string; helper: string; color: string }[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = categories.find(c => c.value === value)

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ fontSize: 11, color: '#8080A8', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Category</div>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 13, textAlign: 'left',
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
        color: selected ? '#E0E0F4' : '#55516E', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>{selected ? selected.label : 'What kind of issue is this?'}</span>
        <ChevronDown size={14} style={{ color: '#55516E', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 50,
          background: '#12121E', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)', overflow: 'hidden',
        }}>
          {categories.map(c => (
            <button key={c.value} onClick={() => { onChange(c.value); setOpen(false) }} style={{
              display: 'block', width: '100%', padding: '10px 14px', textAlign: 'left', cursor: 'pointer',
              background: value === c.value ? 'rgba(255,255,255,0.04)' : 'transparent', border: 'none',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background = value === c.value ? 'rgba(255,255,255,0.04)' : 'transparent'}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#E0E0F4' }}>{c.label}</div>
              <div style={{ fontSize: 11, color: '#55516E', marginTop: 2 }}>{c.helper}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const actionBtnStyle: CSSProperties = {
  padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
  cursor: 'pointer', background: 'rgba(255,255,255,0.03)', color: '#8080A8',
  border: '1px solid rgba(255,255,255,0.06)',
}

