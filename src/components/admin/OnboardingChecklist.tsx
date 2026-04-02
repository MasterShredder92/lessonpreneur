import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuthContext } from '../../app/AuthContext'
import { useQuery } from '@tanstack/react-query'
import { Check, X } from 'lucide-react'

interface ChecklistItem {
  key: string
  label: string
  route: string
  done: boolean
}

export default function OnboardingChecklist() {
  const { tenantId } = useAuthContext()
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('lp-onboarding-dismissed') === 'true')

  // Only show if onboarding flag is set
  const isNew = localStorage.getItem('lp-onboarding') === 'true'
  if (!isNew || dismissed) return null

  const { data: checklist } = useQuery<ChecklistItem[]>({
    queryKey: ['onboarding-checklist', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const [
        { count: teacherCount },
        { count: studentCount },
        { count: blockCount },
        { data: brandData },
      ] = await Promise.all([
        supabase.from('teachers').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId!),
        supabase.from('students').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId!),
        supabase.from('schedule_blocks').select('id', { count: 'exact', head: true }).limit(1),
        supabase.from('brand_settings').select('logo_circle_path').eq('tenant_id', tenantId!).limit(1).single(),
      ])

      return [
        { key: 'teacher', label: 'Add your first teacher', route: '/admin/teachers', done: (teacherCount ?? 0) > 0 },
        { key: 'schedule', label: 'Set up your schedule', route: '/admin/schedule', done: (blockCount ?? 0) > 0 },
        { key: 'students', label: 'Import or add students', route: '/admin/students', done: (studentCount ?? 0) > 0 },
        { key: 'logo', label: 'Upload your logo', route: '/admin/settings', done: !!brandData?.logo_circle_path },
      ]
    },
  })

  if (!checklist) return null

  const doneCount = checklist.filter(c => c.done).length
  const allDone = doneCount === checklist.length

  // Auto-dismiss when all done
  useEffect(() => {
    if (allDone) {
      localStorage.removeItem('lp-onboarding')
      localStorage.setItem('lp-onboarding-dismissed', 'true')
    }
  }, [allDone])

  const handleDismiss = () => {
    setDismissed(true)
    localStorage.setItem('lp-onboarding-dismissed', 'true')
  }

  return (
    <div style={{
      marginBottom: 24, padding: '16px 20px', borderRadius: 14,
      background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.12)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#E0E0F4' }}>Get Started</div>
          <div style={{ fontSize: 11, color: '#8080A8', marginTop: 2 }}>{doneCount} of {checklist.length} complete</div>
        </div>
        <button onClick={handleDismiss} style={{ background: 'none', border: 'none', color: '#606088', cursor: 'pointer', padding: 4 }}>
          <X size={14} />
        </button>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', marginBottom: 12 }}>
        <div style={{ height: '100%', borderRadius: 2, background: '#f59e0b', width: `${(doneCount / checklist.length) * 100}%`, transition: 'width 300ms' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {checklist.map(item => (
          <div key={item.key} onClick={() => !item.done && navigate(item.route)} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8,
            background: item.done ? 'rgba(34,197,94,0.04)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${item.done ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)'}`,
            cursor: item.done ? 'default' : 'pointer',
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: item.done ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
            }}>
              {item.done && <Check size={12} style={{ color: '#22C55E' }} />}
            </div>
            <span style={{ fontSize: 13, color: item.done ? '#22C55E' : '#E0E0F4', fontWeight: 600, textDecoration: item.done ? 'line-through' : 'none' }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
      <button onClick={handleDismiss} style={{
        marginTop: 10, padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
        background: 'rgba(255,255,255,0.04)', color: '#8080A8', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer',
      }}>
        I'll do this later
      </button>
    </div>
  )
}
