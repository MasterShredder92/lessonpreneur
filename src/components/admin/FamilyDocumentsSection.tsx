import type { CSSProperties } from 'react'
import { FileText, Upload, Trash2, Download, ShieldCheck, AlertTriangle } from 'lucide-react'
import { useFamilyFiles } from '../../hooks/useFamilyFiles'
import type { FamilyFile } from '../../hooks/useFamilies'
import MusicLoader from '../shared/MusicLoader'

const FILE_TYPE_LABELS: Record<string, string> = {
  enrollment_agreement: 'Enrollment Agreement',
  contract: 'Contract',
  enrollment_form: 'Enrollment Form',
  id: 'ID',
  insurance: 'Insurance',
  other: 'Other',
}

const SOURCE_LABELS: Record<string, string> = {
  migration: 'Migration',
  manual: 'Manual',
  signwell: 'SignWell',
}

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#A0A0C8',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
}

type Props = {
  familyId: string
  canUpload: boolean
  onUploadClick: () => void
  onDeleteRequest: (file: FamilyFile) => void
  /** Wider heading + spacing for desktop Director column */
  variant?: 'default' | 'compact'
}

export default function FamilyDocumentsSection({
  familyId,
  canUpload,
  onUploadClick,
  onDeleteRequest,
  variant = 'default',
}: Props) {
  const { files, hasEnrollmentAgreement, isLoading, isError, error, refetch } = useFamilyFiles(familyId)
  const agreementFile = files.find((f) => f.file_type === 'enrollment_agreement')
  const compact = variant === 'compact'

  if (isLoading) {
    return (
      <div style={{ padding: compact ? '20px 0' : '24px 0', display: 'flex', justifyContent: 'center' }}>
        <MusicLoader />
      </div>
    )
  }

  if (isError) {
    return (
      <div
        style={{
          padding: compact ? 12 : 14,
          borderRadius: 10,
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.2)',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: '#F87171', marginBottom: 6 }}>Could not load documents</div>
        <div style={{ fontSize: 11, color: '#A0A0C8', marginBottom: 10 }}>{(error as Error)?.message ?? 'Unknown error'}</div>
        <button
          type="button"
          onClick={() => refetch()}
          className="btn-outline"
          style={{ fontSize: 11, padding: '6px 12px' }}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div data-guide-id="family-files-section">
      {compact && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <FileText size={14} style={{ color: '#8080A8' }} />
          <span style={{ ...labelStyle, margin: 0 }}>Documents</span>
        </div>
      )}

      {hasEnrollmentAgreement ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: compact ? '10px 12px' : '10px 14px',
            borderRadius: 10,
            marginBottom: 12,
            background: 'rgba(34,197,94,0.06)',
            border: '1px solid rgba(34,197,94,0.15)',
          }}
        >
          <ShieldCheck size={compact ? 18 : 16} style={{ color: '#22C55E', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#22C55E' }}>Enrollment agreement on file</div>
            {agreementFile && (
              <div style={{ fontSize: 10, color: '#8080A8', marginTop: 1 }}>
                Signed{' '}
                {new Date(agreementFile.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: compact ? '10px 12px' : '10px 14px',
            borderRadius: 10,
            marginBottom: 12,
            background: 'rgba(255,184,0,0.06)',
            border: '1px solid rgba(255,184,0,0.15)',
          }}
        >
          <AlertTriangle size={compact ? 18 : 16} style={{ color: '#FFB800', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#FFB800' }}>No enrollment agreement on file</div>
            <div style={{ fontSize: 10, color: '#8080A8', marginTop: 1 }}>Upload one below or collect a signature</div>
          </div>
        </div>
      )}

      {files.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
          {files.map((f) => (
            <div
              key={f.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: compact ? '10px 12px' : '8px 14px',
                minHeight: compact ? 52 : undefined,
                borderRadius: 10,
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <FileText size={14} style={{ color: '#8080A8', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#C0C0E0',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {f.file_name}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 10,
                    color: '#606088',
                    marginTop: 1,
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{FILE_TYPE_LABELS[f.file_type] ?? f.file_type}</span>
                  <span>·</span>
                  <span>{new Date(f.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  {f.uploader_name && f.uploader_name !== 'Unknown' && (
                    <>
                      <span>·</span>
                      <span>{f.uploader_name}</span>
                    </>
                  )}
                  {f.source && SOURCE_LABELS[f.source] && (
                    <>
                      <span>·</span>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 600,
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          color: '#8080A8',
                        }}
                      >
                        {SOURCE_LABELS[f.source]}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <a
                href={f.file_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 10, color: '#38BDF8', fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}
              >
                View
              </a>
              <a
                href={f.file_url}
                download
                style={{
                  fontSize: 10,
                  color: '#8080A8',
                  fontWeight: 600,
                  textDecoration: 'none',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  minWidth: 28,
                  minHeight: 28,
                  justifyContent: 'center',
                }}
              >
                <Download size={10} />
              </a>
              {canUpload && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteRequest(f)
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#606088',
                    padding: 6,
                    minWidth: 36,
                    minHeight: 36,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  aria-label={`Delete ${f.file_name}`}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#606088', padding: '8px 0', marginBottom: 8 }}>No documents on file</div>
      )}

      {canUpload && (
        <button
          type="button"
          onClick={onUploadClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: compact ? '12px 16px' : '8px 16px',
            width: '100%',
            minHeight: compact ? 56 : undefined,
            borderRadius: 8,
            background: 'rgba(34,197,94,0.06)',
            border: '1px dashed rgba(34,197,94,0.2)',
            color: '#22C55E',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Upload size={12} /> Upload document
        </button>
      )}
    </div>
  )
}
