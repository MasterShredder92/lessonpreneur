import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuthContext } from '../app/AuthContext'

export interface OnboardingProgress {
  step: string
  completed: string[]
}

const ONBOARDING_STEPS = ['welcome', 'school_info', 'import_students', 'add_teachers', 'set_schedule', 'branding', 'done'] as const

export function useOnboardingMode() {
  const { tenantId } = useAuthContext()

  const { data } = useQuery({
    queryKey: ['onboarding-mode', tenantId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async () => {
      // Check if tenant is new (no students, no teachers = fresh account)
      const [{ count: studentCount }, { count: teacherCount }, { data: tenant }] = await Promise.all([
        supabase.from('students').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId!),
        supabase.from('teachers').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId!),
        supabase.from('tenants').select('onboarding_progress, name').eq('id', tenantId!).single(),
      ])

      const progress: OnboardingProgress = tenant?.onboarding_progress ?? { step: 'welcome', completed: [] }
      const isNew = (studentCount ?? 0) === 0 && (teacherCount ?? 0) === 0 && !progress.completed.includes('done')
      const needsOnboarding = isNew || (progress.step !== 'done' && !progress.completed.includes('done'))

      return {
        isNew,
        needsOnboarding,
        progress,
        tenantName: tenant?.name ?? 'your school',
        studentCount: studentCount ?? 0,
        teacherCount: teacherCount ?? 0,
      }
    },
  })

  return data ?? { isNew: false, needsOnboarding: false, progress: { step: 'welcome', completed: [] }, tenantName: '', studentCount: 0, teacherCount: 0 }
}

export function useUpdateOnboardingProgress() {
  const { tenantId } = useAuthContext()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (progress: OnboardingProgress) => {
      if (!tenantId) return
      await supabase.from('tenants').update({ onboarding_progress: progress }).eq('id', tenantId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onboarding-mode'] })
      qc.invalidateQueries({ queryKey: ['onboarding-checklist'] })
    },
  })
}

/**
 * Generate the Star system prompt for onboarding mode.
 * This replaces the normal business context when the tenant is new.
 */
export function getOnboardingSystemPrompt(tenantName: string, progress: OnboardingProgress, studentCount: number, teacherCount: number): string {
  const completed = progress.completed
  const step = progress.step

  const statusLines = [
    `School name: ${tenantName}`,
    `Students imported: ${studentCount}`,
    `Teachers added: ${teacherCount}`,
    `Completed steps: ${completed.length > 0 ? completed.join(', ') : 'none yet'}`,
    `Current step: ${step}`,
  ].join('\n')

  return `You are Star, the AI onboarding assistant for Lessonpreneur. A new music school just signed up and you're helping them get set up. Be warm, encouraging, and practical. Guide them step by step.

Current setup status:
${statusLines}

Your job:
1. If they just arrived (step=welcome), greet them warmly and ask if they're ready to start setup. Mention it takes about 30-60 minutes.
2. Guide them through these steps IN ORDER (skip completed ones):
   - Import students (ask how they track students: CSV, another software, manual, or none yet)
   - Add teachers (ask how many, guide them to the Teachers page)
   - Set up their schedule (guide them to Schedule page)
   - Upload logo and set brand color (guide them to Settings > Branding)
3. After each step, congratulate them and move to the next.
4. Always offer "I'll do this later" as an option — never pressure.
5. If they ask a non-onboarding question, answer it, then gently guide back to setup.
6. When all steps are done, congratulate them and give 3 specific action items for their first week.

Keep responses to 2-4 sentences. Be specific and actionable. Use their school name.
Don't repeat instructions for completed steps. Reference real page names (Teachers, Students, Schedule, Settings > Branding).`
}

export { ONBOARDING_STEPS }
