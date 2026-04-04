import { useState, useEffect, useRef } from 'react'
import type { LocKey } from '../../config/locations'
import { LOCATIONS } from '../../config/locations'

type Msg = { from: 'bot' | 'usr'; text: string }
type Path = 'idle' | 'find' | 'faq'
type FindStep = 'who' | 'instrument' | 'age' | 'confirm'
type FaqTopic = 'cost' | 'adults' | 'days' | 'instrument' | 'cancel' | null

const FAQ_ANSWERS: Record<string, { text: string; cta: string }> = {
  cost: {
    text: "We have options for all different schedules and budgets \u2014 honestly the best way to find what fits you perfectly is to grab a spot. It takes about 60 seconds! \uD83C\uDF3D",
    cta: 'Find My Option \u2192',
  },
  adults: {
    text: "Absolutely! We love teaching adults. It\u2019s never too late to start \u2014 in fact adults often progress faster than kids because of their focus and life experience. Come check it out!",
    cta: 'Grab My Spot \u2192',
  },
  days: {
    text: "We have availability throughout the week including evenings and weekends! The signup page will show you exactly what fits your schedule.",
    cta: 'See Availability \u2192',
  },
  instrument: {
    text: "No instrument? No problem! We can point you in the right direction when you sign up. Don\u2019t let that stop you from getting started \uD83C\uDFB5",
    cta: 'Get Started \u2192',
  },
  cancel: {
    text: "Month to month \u2014 no long-term contracts, no commitments. If it\u2019s not working for you, you can cancel anytime. Zero pressure.",
    cta: 'Try It Out \u2192',
  },
}

interface Props {
  open: boolean
  onClose: () => void
  locKey: LocKey
  onNavigateSignup: () => void
}

export default function CorneliusChat({ open, onClose, locKey, onNavigateSignup }: Props) {
  const loc = LOCATIONS[locKey]
  const scrollRef = useRef<HTMLDivElement>(null)

  const [msgs, setMsgs] = useState<Msg[]>([])
  const [path, setPath] = useState<Path>('idle')
  const [findStep, setFindStep] = useState<FindStep>('who')
  const [faqTopic, setFaqTopic] = useState<FaqTopic>(null)
  const [findAnswers, setFindAnswers] = useState<{ who?: string; instrument?: string; age?: string }>({})

  // Reset on open
  useEffect(() => {
    if (open) {
      const greeting = `Hey! I\u2019m Cornelius \uD83C\uDF3D I help match students with the perfect teacher here at ${loc.fullName}. What can I help you with?`
      setMsgs([{ from: 'bot', text: greeting }])
      setPath('idle')
      setFindStep('who')
      setFaqTopic(null)
      setFindAnswers({})
    }
  }, [open, locKey])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [msgs])

  const addBot = (text: string) => setMsgs(p => [...p, { from: 'bot', text }])
  const addUsr = (text: string) => setMsgs(p => [...p, { from: 'usr', text }])

  const firePixelAndGo = () => {
    if (window.fbq) {
      window.fbq('track', 'Lead', { content_name: 'Cornelius Widget' })
      window.fbq('track', 'InitiateCheckout')
    }
    onNavigateSignup()
  }

  // ── PATH A: Find My Teacher ──
  const handleFindStart = () => {
    addUsr('Find My Teacher \uD83C\uDFB5')
    setPath('find')
    setFindStep('who')
    setTimeout(() => addBot('Who are the lessons for?'), 300)
  }

  const handleWho = (answer: string) => {
    addUsr(answer)
    setFindAnswers(p => ({ ...p, who: answer }))
    setFindStep('instrument')
    setTimeout(() => addBot('Which instrument are you interested in?'), 300)
  }

  const handleInstrument = (answer: string) => {
    addUsr(answer)
    setFindAnswers(p => ({ ...p, instrument: answer }))
    if (findAnswers.who === 'Myself') {
      setFindStep('confirm')
      setTimeout(() => addBot("Perfect! I think I can find a great match for you. Want me to grab you a spot?"), 300)
    } else {
      setFindStep('age')
      setTimeout(() => addBot('How old is the student?'), 300)
    }
  }

  const handleAge = (answer: string) => {
    addUsr(answer)
    setFindAnswers(p => ({ ...p, age: answer }))
    setFindStep('confirm')
    setTimeout(() => addBot("Perfect! I think I can find a great match for you. Want me to grab you a spot?"), 300)
  }

  // ── PATH B: FAQ ──
  const handleFaqStart = () => {
    addUsr('I Have a Question')
    setPath('faq')
    setFaqTopic(null)
    setTimeout(() => addBot("Of course! What\u2019s on your mind? I\u2019ll do my best to help \uD83C\uDF3D"), 300)
  }

  const handleFaqSelect = (topic: FaqTopic) => {
    if (!topic) return
    const labels: Record<string, string> = {
      cost: 'How much do lessons cost?',
      adults: 'Do you teach adults?',
      days: 'What days are you open?',
      instrument: 'Do I need my own instrument?',
      cancel: 'Can I cancel anytime?',
    }
    addUsr(labels[topic])
    setFaqTopic(topic)
    setTimeout(() => addBot(FAQ_ANSWERS[topic].text), 300)
  }

  if (!open) return null

  // ── Determine quick reply buttons ──
  let buttons: { label: string; onClick: () => void }[] = []

  if (path === 'idle') {
    buttons = [
      { label: 'Find My Teacher \uD83C\uDFB5', onClick: handleFindStart },
      { label: 'I Have a Question', onClick: handleFaqStart },
    ]
  } else if (path === 'find') {
    if (findStep === 'who') {
      buttons = [
        { label: 'My child', onClick: () => handleWho('My child') },
        { label: 'Myself', onClick: () => handleWho('Myself') },
        { label: 'Both', onClick: () => handleWho('Both') },
      ]
    } else if (findStep === 'instrument') {
      buttons = ['Guitar', 'Piano', 'Vocals', 'Drums', 'Not sure yet'].map(i => ({
        label: i, onClick: () => handleInstrument(i),
      }))
    } else if (findStep === 'age') {
      buttons = ['Under 8', '8-12', 'Teen', 'Adult'].map(a => ({
        label: a, onClick: () => handleAge(a),
      }))
    } else if (findStep === 'confirm') {
      buttons = [{ label: "Yes, let\u2019s do it! \u2192", onClick: firePixelAndGo }]
    }
  } else if (path === 'faq') {
    if (!faqTopic) {
      buttons = [
        { label: 'How much do lessons cost?', onClick: () => handleFaqSelect('cost') },
        { label: 'Do you teach adults?', onClick: () => handleFaqSelect('adults') },
        { label: 'What days are you open?', onClick: () => handleFaqSelect('days') },
        { label: 'Do I need my own instrument?', onClick: () => handleFaqSelect('instrument') },
        { label: 'Can I cancel anytime?', onClick: () => handleFaqSelect('cancel') },
      ]
    } else {
      buttons = [{ label: FAQ_ANSWERS[faqTopic].cta, onClick: firePixelAndGo }]
    }
  }

  return (
    <>
      {/* Backdrop — click outside to close */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 1001,
      }} />

      {/* Widget */}
      <div className="cc-widget">
        <style>{widgetCSS}</style>

        {/* Header */}
        <div className="cc-header">
          <div className="cc-header-left">
            <span className="cc-avatar">{'\uD83C\uDF3D'}</span>
            <div>
              <div className="cc-header-name">Cornelius</div>
              <div className="cc-header-loc">{loc.fullName}</div>
            </div>
          </div>
          <button className="cc-close" onClick={onClose}>{'\u2715'}</button>
        </div>

        {/* Messages */}
        <div className="cc-messages" ref={scrollRef}>
          {msgs.map((m, i) => (
            <div key={i} className={`cc-msg cc-msg--${m.from}`}>
              {m.from === 'bot' && <span className="cc-msg-avatar">{'\uD83C\uDF3D'}</span>}
              <div className={`cc-bubble cc-bubble--${m.from}`}>{m.text}</div>
            </div>
          ))}
        </div>

        {/* Quick Replies */}
        {buttons.length > 0 && (
          <div className="cc-replies">
            {buttons.map((b, i) => (
              <button key={i} className="cc-reply-btn" onClick={b.onClick}>{b.label}</button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

const widgetCSS = `
.cc-widget {
  position: fixed;
  bottom: 100px;
  right: 14px;
  z-index: 1002;
  width: 320px;
  max-height: 420px;
  background: rgba(2,2,9,0.95);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(212,34,106,0.3);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 12px 48px rgba(0,0,0,0.6);
  animation: cc-slideUp 0.25s ease-out;
}
@keyframes cc-slideUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

.cc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}
.cc-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.cc-avatar {
  font-size: 24px;
  line-height: 1;
}
.cc-header-name {
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 800;
  color: #E0E0F4;
}
.cc-header-loc {
  font-size: 11px;
  color: #8080A8;
  font-weight: 600;
}
.cc-close {
  background: none;
  border: none;
  color: #606088;
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.15s;
}
.cc-close:hover {
  background: rgba(255,255,255,0.06);
  color: #A0A0C8;
}

.cc-messages {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 120px;
  max-height: 220px;
}

.cc-msg {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.cc-msg--usr {
  justify-content: flex-end;
}
.cc-msg-avatar {
  font-size: 16px;
  flex-shrink: 0;
  margin-top: 2px;
}

.cc-bubble {
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  font-size: 13px;
  line-height: 1.5;
  padding: 10px 14px;
  border-radius: 14px;
  max-width: 85%;
}
.cc-bubble--bot {
  background: rgba(255,255,255,0.06);
  color: #E0E0F4;
  border-bottom-left-radius: 4px;
}
.cc-bubble--usr {
  background: rgba(212,34,106,0.15);
  color: #E0E0F4;
  border-bottom-right-radius: 4px;
}

.cc-replies {
  padding: 10px 14px 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  border-top: 1px solid rgba(255,255,255,0.04);
  flex-shrink: 0;
}
.cc-reply-btn {
  font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  font-size: 12px;
  font-weight: 700;
  padding: 8px 14px;
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,0.12);
  background: var(--c, #D4226A);
  color: #fff;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.cc-reply-btn:hover {
  filter: brightness(1.15);
  transform: translateY(-1px);
}
.cc-reply-btn:active {
  transform: scale(0.97);
}

@media (max-width: 768px) {
  .cc-widget {
    bottom: 0;
    right: 0;
    left: 0;
    width: 100%;
    max-height: 60vh;
    border-radius: 16px 16px 0 0;
    border-bottom: none;
  }
}
`
