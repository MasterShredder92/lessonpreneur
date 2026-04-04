import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuthContext } from '../../app/AuthContext'

/* ═══════════════════════════════════════════════════════
   /onboarding — STAR ONBOARDING WIZARD
   Chat-style UI. Scripted dialogue. Saves to
   tenants.onboarding_progress JSONB per step.
   Calls ai-assistant for the final insight.
   ═══════════════════════════════════════════════════════ */

type StepKey = 'welcome' | 'name' | 'studio_name' | 'student_count' | 'teacher_count' | 'location_count' | 'pain_point' | 'setup'

interface WizardData {
  first_name: string
  studio_name: string
  student_count: string
  teacher_count: string
  location_count: string
  pain_point: string
}

const STEP_ORDER: StepKey[] = ['welcome', 'name', 'studio_name', 'student_count', 'teacher_count', 'location_count', 'pain_point', 'setup']

const STUDENT_OPTIONS = ['Under 20', '20-50', '51-100', '101-200', '200+']
const TEACHER_OPTIONS = ['Just me', '2-3', '4-6', '7-10', '10+']
const LOCATION_OPTIONS = ['1 location', '2-3 locations', '4+ locations']
const PAIN_OPTIONS = ['Scheduling', 'Missed payments', 'Lead follow-up', 'Teacher coordination', 'No visibility', 'Everything']

export default function OnboardingWizardPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isPreview = searchParams.get('preview') === 'true'
  const { user, profile, tenantId, isLoading: authLoading } = useAuthContext()
  const [step, setStep] = useState<StepKey>('welcome')
  const [data, setData] = useState<WizardData>({
    first_name: '', studio_name: '', student_count: '',
    teacher_count: '', location_count: '', pain_point: '',
  })
  const [textInput, setTextInput] = useState('')
  const [setupProgress, setSetupProgress] = useState(0)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Redirect if no auth session (skip in preview mode)
  useEffect(() => {
    if (isPreview) return
    if (!authLoading && !user) {
      navigate('/start', { replace: true })
    }
  }, [authLoading, user, navigate, isPreview])

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [step])

  const stepIndex = STEP_ORDER.indexOf(step)
  const progressPct = Math.round((stepIndex / (STEP_ORDER.length - 1)) * 100)

  // Save progress to tenants.onboarding_progress
  const saveProgress = async (currentStep: StepKey, currentData: WizardData, completed: string[]) => {
    if (isPreview || !tenantId) return
    try {
      await supabase.from('tenants').update({
        onboarding_progress: {
          step: currentStep,
          completed,
          data: currentData,
        },
      }).eq('id', tenantId)
    } catch {
      // Silent — don't block wizard
    }
  }

  const advanceStep = (nextStep: StepKey, updatedData: WizardData) => {
    const completedSteps = STEP_ORDER.slice(0, STEP_ORDER.indexOf(nextStep))
    setData(updatedData)
    setStep(nextStep)
    setTextInput('')
    saveProgress(nextStep, updatedData, completedSteps)
  }

  const handleTextSubmit = () => {
    if (!textInput.trim()) return
    const val = textInput.trim()

    if (step === 'name') {
      advanceStep('studio_name', { ...data, first_name: val })
    } else if (step === 'studio_name') {
      advanceStep('student_count', { ...data, studio_name: val })
    }
  }

  const handlePillSelect = (val: string) => {
    if (step === 'student_count') {
      advanceStep('teacher_count', { ...data, student_count: val })
    } else if (step === 'teacher_count') {
      advanceStep('location_count', { ...data, teacher_count: val })
    } else if (step === 'location_count') {
      advanceStep('pain_point', { ...data, location_count: val })
    } else if (step === 'pain_point') {
      const updated = { ...data, pain_point: val }
      setData(updated)
      setStep('setup')
      const completedAll = STEP_ORDER.slice(0, STEP_ORDER.length - 1)
      saveProgress('setup', updated, completedAll)
      runSetup(updated)
    }
  }

  // Setup animation + AI call + redirect
  const runSetup = async (finalData: WizardData) => {
    // Animate progress bar
    const duration = 2500
    const start = Date.now()
    const tick = () => {
      const elapsed = Date.now() - start
      const pct = Math.min(100, (elapsed / duration) * 100)
      setSetupProgress(pct)
      if (pct < 100) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)

    // Wait for animation
    await new Promise(r => setTimeout(r, 2600))

    // Mark onboarding complete
    if (!isPreview && tenantId) {
      try {
        await supabase.from('tenants').update({
          onboarding_progress: {
            step: 'complete',
            completed: STEP_ORDER,
            completed_at: new Date().toISOString(),
            data: finalData,
          },
        }).eq('id', tenantId)
      } catch { /* silent */ }
    }

    // Call AI for insight
    if (!isPreview && tenantId && profile) {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token

        const prompt = `You are Star, an AI studio advisor for Lessonpreneur.
A new studio owner just completed setup. Here is their data:

Studio: ${finalData.studio_name}
Owner: ${finalData.first_name}
Students: ${finalData.student_count}
Teachers: ${finalData.teacher_count}
Locations: ${finalData.location_count}
Biggest pain point: ${finalData.pain_point}

Using only this information, deliver ONE sharp, specific, confident insight about this studio's biggest opportunity or risk. Maximum 3 sentences. No generic advice. No bullet points. Speak directly to ${finalData.first_name}. Sound like a trusted advisor who has seen hundreds of studios, not a chatbot.`

        const res = await fetch(
          'https://dhsyxyhtoadrqfrlmsqe.supabase.co/functions/v1/ai-assistant',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              question: prompt,
              tenant_id: tenantId,
              conversation_history: [],
              system_override: prompt,
            }),
          }
        )

        const aiData = await res.json()
        if (aiData.answer) {
          // Store insight in ai_conversations
          await supabase.from('ai_conversations').insert({
            tenant_id: tenantId,
            profile_id: profile.id,
            role: 'assistant',
            content: aiData.answer,
            metadata: { type: 'onboarding_insight', shown: false },
          })
        }
      } catch {
        // Silent — insight is bonus, don't block redirect
      }
    }

    navigate('/admin/dashboard', { replace: true })
  }

  if (!isPreview && authLoading) {
    return (
      <div className="obw" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <style>{styles}</style>
        <div className="obw-spinner" />
      </div>
    )
  }

  if (!isPreview && !user) return null

  return (
    <div className="obw">
      <style>{styles}</style>

      {/* Progress bar */}
      <div className="obw-progress">
        <div className="obw-progress-bar">
          <div className="obw-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className="obw-chat">
        {/* Welcome */}
        <StarMessage>
          Hey — I'm Star, your AI studio advisor. I'm going to help you get set up in about 3 minutes.
          Then I'll show you something about your business most owners have never seen. Ready?
        </StarMessage>
        {step === 'welcome' && (
          <div className="obw-actions">
            <button className="obw-pill obw-pill-cta" onClick={() => advanceStep('name', data)}>
              Let's go →
            </button>
          </div>
        )}

        {/* Step 1: Name */}
        {stepIndex >= 1 && (
          <>
            {stepIndex > 1 && <UserBubble>{data.first_name}</UserBubble>}
            <StarMessage>What's your first name?</StarMessage>
            {step === 'name' && (
              <div className="obw-text-input-wrap">
                <input
                  className="obw-text-input"
                  value={textInput}
                  onChange={e => setTextInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleTextSubmit()}
                  placeholder="Your first name"
                  autoFocus
                />
                <button className="obw-send" onClick={handleTextSubmit} disabled={!textInput.trim()}>→</button>
              </div>
            )}
          </>
        )}

        {/* Step 1 response */}
        {stepIndex >= 2 && (
          <>
            <UserBubble>{data.first_name}</UserBubble>
            <StarMessage>Nice to meet you, {data.first_name}. Let's get your studio set up.</StarMessage>
          </>
        )}

        {/* Step 2: Studio name */}
        {stepIndex >= 2 && (
          <>
            <StarMessage>What's the name of your studio?</StarMessage>
            {step === 'studio_name' && (
              <div className="obw-text-input-wrap">
                <input
                  className="obw-text-input"
                  value={textInput}
                  onChange={e => setTextInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleTextSubmit()}
                  placeholder="Studio name"
                  autoFocus
                />
                <button className="obw-send" onClick={handleTextSubmit} disabled={!textInput.trim()}>→</button>
              </div>
            )}
          </>
        )}

        {/* Step 2 response + Step 3: Students */}
        {stepIndex >= 3 && (
          <>
            <UserBubble>{data.studio_name}</UserBubble>
            <StarMessage>How many active students are you currently teaching?</StarMessage>
            {step === 'student_count' && (
              <PillOptions options={STUDENT_OPTIONS} onSelect={handlePillSelect} />
            )}
          </>
        )}

        {/* Step 3 response + Step 4: Teachers */}
        {stepIndex >= 4 && (
          <>
            <UserBubble>{data.student_count}</UserBubble>
            <StarMessage>Got it. How many teachers on your roster including yourself?</StarMessage>
            {step === 'teacher_count' && (
              <PillOptions options={TEACHER_OPTIONS} onSelect={handlePillSelect} />
            )}
          </>
        )}

        {/* Step 4 response + Step 5: Locations */}
        {stepIndex >= 5 && (
          <>
            <UserBubble>{data.teacher_count}</UserBubble>
            <StarMessage>Are you running one location or multiple?</StarMessage>
            {step === 'location_count' && (
              <PillOptions options={LOCATION_OPTIONS} onSelect={handlePillSelect} />
            )}
          </>
        )}

        {/* Step 5 response + Step 6: Pain point */}
        {stepIndex >= 6 && (
          <>
            <UserBubble>{data.location_count}</UserBubble>
            <StarMessage>Last one — what's the single biggest operational pain point in your business right now?</StarMessage>
            {step === 'pain_point' && (
              <PillOptions options={PAIN_OPTIONS} onSelect={handlePillSelect} />
            )}
          </>
        )}

        {/* Step 7: Setup */}
        {step === 'setup' && (
          <>
            <UserBubble>{data.pain_point}</UserBubble>
            <StarMessage>Perfect. Setting up your studio now...</StarMessage>
            <div className="obw-setup-bar-wrap">
              <div className="obw-setup-bar">
                <div className="obw-setup-fill" style={{ width: `${setupProgress}%` }} />
              </div>
            </div>
          </>
        )}

        <div ref={chatEndRef} />
      </div>
    </div>
  )
}

function StarMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="obw-msg obw-msg-star">
      <div className="obw-avatar">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <circle cx="14" cy="14" r="13" fill="rgba(212,34,106,0.15)" stroke="rgba(212,34,106,0.3)" strokeWidth="1" />
          <path d="M14 6l2.5 5 5.5.8-4 3.9.9 5.3-4.9-2.6L9.1 22l.9-5.3-4-3.9 5.5-.8L14 6z" fill="#D4226A" />
        </svg>
      </div>
      <div className="obw-bubble obw-bubble-star">{children}</div>
    </div>
  )
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="obw-msg obw-msg-user">
      <div className="obw-bubble obw-bubble-user">{children}</div>
    </div>
  )
}

function PillOptions({ options, onSelect }: { options: string[]; onSelect: (v: string) => void }) {
  return (
    <div className="obw-actions obw-pills-grid">
      {options.map(o => (
        <button key={o} className="obw-pill" onClick={() => onSelect(o)}>{o}</button>
      ))}
    </div>
  )
}

const styles = `
.obw {
  min-height: 100vh;
  background: #020209;
  color: #fff;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  display: flex;
  flex-direction: column;
}

/* Progress */
.obw-progress {
  padding: 16px 24px 0;
  max-width: 600px;
  margin: 0 auto;
  width: 100%;
}
.obw-progress-bar {
  height: 3px;
  background: rgba(255,255,255,0.06);
  border-radius: 4px;
  overflow: hidden;
}
.obw-progress-fill {
  height: 100%;
  background: linear-gradient(135deg, #D4226A, #FF5500);
  border-radius: 4px;
  transition: width 400ms ease;
}

/* Chat area */
.obw-chat {
  flex: 1;
  max-width: 600px;
  width: 100%;
  margin: 0 auto;
  padding: 32px 24px 100px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Messages */
.obw-msg {
  display: flex;
  gap: 10px;
  animation: obwFadeIn 300ms ease;
}
.obw-msg-star {
  align-items: flex-start;
}
.obw-msg-user {
  justify-content: flex-end;
}
.obw-avatar {
  flex-shrink: 0;
  margin-top: 2px;
}
.obw-bubble {
  max-width: 80%;
  padding: 14px 18px;
  border-radius: 18px;
  font-size: 15px;
  line-height: 1.5;
}
.obw-bubble-star {
  background: rgba(22,20,40,0.97);
  border: 1px solid rgba(255,255,255,0.1);
  color: #E8E8FC;
  border-top-left-radius: 4px;
}
.obw-bubble-user {
  background: rgba(212,34,106,0.12);
  border: 1px solid rgba(212,34,106,0.25);
  color: #E8488A;
  font-weight: 600;
  border-top-right-radius: 4px;
}

@keyframes obwFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Actions area */
.obw-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-left: 38px;
  animation: obwFadeIn 300ms ease;
}
.obw-pills-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* Pills */
.obw-pill {
  padding: 10px 20px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.04);
  color: #A0A0C8;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 140ms ease;
}
.obw-pill:hover {
  border-color: rgba(212,34,106,0.4);
  color: #E8E8FC;
  background: rgba(212,34,106,0.08);
}
.obw-pill-cta {
  background: #D4226A;
  color: white;
  border-color: #D4226A;
  font-weight: 700;
}
.obw-pill-cta:hover {
  opacity: 0.88;
  background: #D4226A;
  color: white;
  border-color: #D4226A;
  box-shadow: 0 4px 16px rgba(212,34,106,0.3);
}

/* Text input */
.obw-text-input-wrap {
  display: flex;
  gap: 8px;
  padding-left: 38px;
  animation: obwFadeIn 300ms ease;
}
.obw-text-input {
  flex: 1;
  padding: 12px 16px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.05);
  color: #fff;
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  font-size: 15px;
  outline: none;
  transition: border-color 140ms ease;
}
.obw-text-input:focus {
  border-color: rgba(212,34,106,0.4);
  box-shadow: 0 0 0 3px rgba(212,34,106,0.08);
}
.obw-text-input::placeholder { color: #6868A0; }
.obw-send {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: none;
  background: #D4226A;
  color: white;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  transition: all 140ms ease;
  flex-shrink: 0;
}
.obw-send:hover { opacity: 0.88; }
.obw-send:disabled { opacity: 0.3; cursor: not-allowed; }

/* Setup bar */
.obw-setup-bar-wrap {
  padding-left: 38px;
  animation: obwFadeIn 300ms ease;
}
.obw-setup-bar {
  height: 6px;
  background: rgba(255,255,255,0.06);
  border-radius: 6px;
  overflow: hidden;
  max-width: 300px;
}
.obw-setup-fill {
  height: 100%;
  background: linear-gradient(135deg, #D4226A, #FF5500, #FFB800);
  border-radius: 6px;
  transition: width 100ms linear;
}

/* Spinner */
.obw-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid rgba(255,255,255,0.1);
  border-top-color: #D4226A;
  border-radius: 50%;
  animation: obwSpin 0.7s linear infinite;
}
@keyframes obwSpin { to { transform: rotate(360deg); } }
`
