import { useEffect, useMemo, useRef, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { LocationContext } from '../config/LocationContext'
import { safeFetch } from '../lib/safeFetch'
import { EDGE_FUNCTIONS } from '../lib/config'
import './lessonpreneur.css'

type DemoStatus = 'idle' | 'submitting' | 'success' | 'error'

const FAQS = [
  {
    q: 'How is this different from Jackrabbit, Pike13, or MyMusicStaff?',
    a: "Those tools were built by software companies. Lessonpreneur was built by someone who runs 4 music school locations and got tired of working around their limitations. The scheduling logic, billing workflows, and multi-location reporting are designed for how music schools actually operate — not how a product team imagined they might.",
  },
  {
    q: 'I already have a system. How painful is switching?',
    a: "We do it for you. White-glove migration is included free. We move your student data, billing records, and schedules. Most schools are fully live within 48 hours without lifting a finger.",
  },
  {
    q: 'Is there a contract or annual commitment?',
    a: "No. Month-to-month, always. Cancel anytime, no penalties, no fees. We earn your business every single month.",
  },
  {
    q: "What if it doesn't work for my school?",
    a: "You get 90 days free. If it's not a clear upgrade from what you're using now, cancel and you've paid nothing. We'll even help you export your data. Zero risk.",
  },
  {
    q: 'Does it actually work for multiple locations?',
    a: "It was built for multiple locations from day one. That's the whole point. One dashboard, all locations — enrollment, revenue, and instructor load across every site. No more driving between locations to check schedules.",
  },
  {
    q: 'What does support look like?',
    a: "You get a direct line to the founder. Not a ticket queue. Not a chatbot. A real person who runs music schools and understands exactly what you're dealing with.",
  },
] as const

export default function LessonpreneurLanding() {
  // Wrap in same location layout context pattern as LocationLanding.
  // (We default to Omaha for theme/SEO fallbacks; this page is SaaS-facing.)
  const locationKey = 'omaha' as const

  const [demoOpen, setDemoOpen] = useState(false)
  const [faqOpen, setFaqOpen] = useState<number | null>(null)

  const [name, setName] = useState('')
  const [school, setSchool] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const [status, setStatus] = useState<DemoStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const overlayRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDemoOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    // IntersectionObserver for scroll animations
    const els = Array.from(document.querySelectorAll('.lp-animate'))
    if (els.length === 0) return
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible')
          obs.unobserve(entry.target)
        }
      })
    }, { threshold: 0.15 })

    els.forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    document.body.style.overflow = demoOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [demoOpen])

  const canSubmit = useMemo(() => {
    if (status === 'submitting') return false
    return !!(name.trim() && school.trim() && email.trim() && phone.trim())
  }, [name, school, email, phone, status])

  async function submitDemo(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setStatus('submitting')
    setErrorMsg('')
    try {
      await safeFetch<{ success?: boolean; error?: string }>(EDGE_FUNCTIONS.publicLeadSubmit, {
        skipAuth: true,
        body: {
          source: 'lessonpreneur',
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          message: `School: ${school.trim()}. Requested demo via /lessonpreneur.`,
        },
        timeoutMs: 15_000,
      })
      setStatus('success')
    } catch (err: any) {
      setStatus('error')
      setErrorMsg(err?.message || 'Something went wrong. Please try again.')
    }
  }

  function openDemo() {
    setStatus('idle')
    setErrorMsg('')
    setDemoOpen(true)
  }

  function closeDemo() {
    setDemoOpen(false)
  }

  return (
    <LocationContext.Provider value={locationKey}>
      <div className="lp-page lp-reset">
        <Helmet>
          <title>Book a Demo | Adkins Music</title>
        </Helmet>

        <main>
          {/* 1. HERO */}
          <section className="lp-hero">
            <div className="lp-glow-pink" />
            <div className="lp-glow-purple" />
            <div className="lp-container">
              <span className="lp-label">Built by a music school owner</span>
              <h1 className="lp-h1">
                You Didn&apos;t Open a Music School<br />
                to Spend Every Night<br />
                <span className="lp-gradient-text">Buried in Spreadsheets</span>
              </h1>
              <p className="lp-hero-sub">
                Scheduling chaos. Billing headaches. Five tools that don&apos;t talk to each other. You built something great — now run it with software that actually understands your business.
              </p>
              <div className="lp-cta-row">
                <a href="https://buy.stripe.com/7sYdR97CW4Ds46c5tC2ZO01" className="lp-btn-cta">Start Your 90-Day Free Trial</a>
                <button type="button" className="lp-btn-demo" onClick={openDemo}>Book a Demo</button>
              </div>
              <p className="lp-hero-note">Card required to start. Cancel anytime. We&apos;ll set everything up for you.</p>
            </div>
          </section>

          {/* 2. PROOF STATS */}
          <section className="lp-section lp-proof lp-animate">
            <div className="lp-glow-pink" />
            <div className="lp-container lp-z1">
              <span className="lp-label">Not theory. Experience.</span>
              <h2 className="lp-h2">Built Inside a Real Music School.<br />Not a Silicon Valley Office.</h2>
              <p className="lp-sub">
                Every feature exists because we hit the same wall you&apos;re hitting right now. 4 locations, dozens of instructors, over <strong>$1,000,000 per year</strong> in lessons.
              </p>
              <div className="lp-stats-row">
                <div>
                  <span className="lp-stat-num">4</span>
                  <span className="lp-stat-label">School Locations</span>
                </div>
                <div>
                  <span className="lp-stat-num">$1M+</span>
                  <span className="lp-stat-label">Annual Revenue</span>
                </div>
                <div>
                  <span className="lp-stat-num">1,000+</span>
                  <span className="lp-stat-label">Students Managed</span>
                </div>
              </div>
            </div>
          </section>

          {/* 3. COMPETITOR SWITCH */}
          <section className="lp-section lp-animate">
            <div className="lp-container">
              <div className="lp-glass lp-switch-card">
                <span className="lp-label">Sound familiar?</span>
                <h2 className="lp-h2 lp-switch-title">
                  Already Using MyMusicStaff, Jackrabbit, or Pike13?
                </h2>
                <p className="lp-switch-p">
                  You picked them because they were &quot;good enough.&quot; But you&apos;re still doing half the work manually. You&apos;re not alone — here&apos;s what we hear from every school that switches:
                </p>
                <ul className="lp-switch-list">
                  {[
                    "I can't see all my locations in one place.",
                    'Billing is clunky. Parents complain. I chase payments.',
                    "It wasn't built for how music schools actually work.",
                    "Support takes days and doesn't understand my business.",
                  ].map((t) => (
                    <li key={t} className="lp-switch-li">
                      <span className="lp-xicon">×</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
                <p className="lp-switch-p">
                  Switch to Lessonpreneur and we&apos;ll beat your current price. We migrate your data for free. If it&apos;s not better, we refund every penny.
                </p>
                <a href="https://buy.stripe.com/7sYdR97CW4Ds46c5tC2ZO01" className="lp-btn-cta">Claim Your Free 90 Days</a>
              </div>
            </div>
          </section>

          {/* 4. PAIN */}
          <section className="lp-section lp-animate">
            <div className="lp-container lp-center">
              <span className="lp-label">The real cost</span>
              <h2 className="lp-h2">This Is What&apos;s Actually<br />Eating Your Time</h2>
              <p className="lp-sub">Every hour you spend on admin is an hour you&apos;re not teaching, not growing, not living.</p>
              <div className="lp-grid-2">
                {[
                  { icon: '⏰', title: 'Sunday Nights on the Laptop', body: "You're rescheduling lessons, fixing double-bookings, and texting parents at 10pm. Your family sees the back of your head more than your face." },
                  { icon: '💰', title: 'Money Slipping Through the Cracks', body: 'Missed payments you forgot to follow up on. Invoices you entered wrong. That family who owes you $400 and you\'re too embarrassed to ask again.' },
                  { icon: '👁️', title: 'Flying Blind Across Locations', body: 'You drive to your second location just to check if Tuesday slots are filled. Your staff texts you updates that get buried in a group chat.' },
                  { icon: '🔌', title: 'Frankenstein Tech Stack', body: "Google Calendar for scheduling. Stripe for some payments. A spreadsheet for the rest. A group chat for communication. None of it connects. All of it breaks." },
                ].map((c) => (
                  <div key={c.title} className="lp-glass lp-left">
                    <div className="lp-problem-icon">{c.icon}</div>
                    <h3 className="lp-h3">{c.title}</h3>
                    <p className="lp-card-p">{c.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* 5. SOLUTION */}
          <section className="lp-section lp-animate">
            <div className="lp-container lp-center">
              <span className="lp-label">How Lessonpreneur fixes it</span>
              <h2 className="lp-h2">One Dashboard. Every Location.<br />Your Sundays Back.</h2>
              <p className="lp-sub">Built for the way music schools actually run — not how software companies think they should.</p>
              <div className="lp-grid-2 lp-left">
                {[
                  { pain: 'Stop rescheduling by text.', title: 'Smart Scheduling', body: "Students book online. Conflicts blocked automatically. Reschedules in two clicks. You'll never play phone tag over a 30-minute lesson again." },
                  { pain: 'Stop chasing payments manually.', title: 'Automated Billing', body: "Recurring charges run on autopilot. Invoices go out without you touching them. You see exactly who paid and who didn't — in real time." },
                  { pain: 'Stop driving between locations to check the schedule.', title: 'Multi-Location Dashboard', body: 'Enrollment, revenue, instructor load, open slots — every location, side by side. Make decisions from your couch, not your car.' },
                  { pain: "Stop losing students you didn't see leaving.", title: 'Student Management', body: "Every student's lesson history, payment status, and progress notes in one profile. Spot the ones about to churn before they ghost you." },
                  { pain: 'Stop sharing your financials with your teachers.', title: 'Instructor Portal', body: "Teachers get their own login with schedules, attendance, and lesson notes. They see exactly what they need. Nothing they don't." },
                  { pain: 'Stop sending reminder texts yourself.', title: 'Automated Follow-Up', body: "Lesson reminders, payment nudges, and re-engagement emails go out automatically. No-shows drop. Revenue stops leaking. You stop being a human reminder service." },
                ].map((c) => (
                  <div key={c.title} className="lp-glass">
                    <span className="lp-pain-line">{c.pain}</span>
                    <h3 className="lp-h3">{c.title}</h3>
                    <p className="lp-card-p">{c.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* 6. SOCIAL PROOF */}
          <section className="lp-section lp-animate">
            <div className="lp-glow-pink" />
            <div className="lp-container lp-z1 lp-center">
              <span className="lp-label">We use it ourselves</span>
              <h2 className="lp-h2">Built to Run a Real School.<br />Here Are the Numbers.</h2>
              <p className="lp-sub">Lessonpreneur was built inside Adkins Music Lessons — a four-location operation in Omaha, Nebraska. These are the real numbers from the system you&apos;d be using.</p>
              <div className="lp-grid-3">
                {[
                  { metric: '656 Active Students', body: 'Every student, lesson history, payment status, and progress note — managed from one dashboard across all four locations. No spreadsheets. No guesswork.', role: '4 Locations — Omaha, NE' },
                  { metric: '559 Families Billed Automatically', body: 'Invoices go out on schedule. Payments sync with Square. Multi-student discounts and military rates calculate themselves. No more chasing parents for money.', role: '$1.2M+ Annual Revenue' },
                  { metric: '42 Teachers Coordinated', body: 'Every instructor has their own portal — schedules, attendance, lesson notes. The owner sees everything. Teachers see only what they need. Zero micromanagement required.', role: 'Built by the Owner, for Owners' },
                ].map((c) => (
                  <div key={c.metric} className="lp-glass lp-left">
                    <span className="lp-metric-pill">{c.metric}</span>
                    <p className="lp-test-text">{c.body}</p>
                    <p className="lp-test-author">
                      Adkins Music Lessons<br />
                      <span className="lp-test-role">{c.role}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* 7. PRICING */}
          <section className="lp-section lp-animate" id="pricing">
            <div className="lp-glow-pink" />
            <div className="lp-container lp-z1 lp-center">
              <span className="lp-label">Simple pricing</span>
              <h2 className="lp-h2">Pick the Plan That Fits Your School</h2>
              <p className="lp-sub">Every plan includes the full platform. No feature gates. No upsells. 90 days free to prove it.</p>
              <div className="lp-pricing-grid">
                <div className="lp-glass lp-pricing-card">
                  <div className="lp-tier-name">Solo</div>
                  <div className="lp-price-amount">$97</div>
                  <div className="lp-price-period">per month</div>
                  <p className="lp-tier-desc">For the independent teacher ready to stop running their studio out of a spreadsheet.</p>
                  <a href="https://buy.stripe.com/aFabJ16ySgmabyE9JS2ZO02" className="lp-btn-cta">Start Free Trial</a>
                </div>

                <div className="lp-glass lp-pricing-card lp-pricing-popular">
                  <span className="lp-popular-badge">Most Popular</span>
                  <div className="lp-tier-name">School</div>
                  <div className="lp-price-amount">$297</div>
                  <div className="lp-price-period">per month</div>
                  <p className="lp-tier-desc">For the school owner who&apos;s done duct-taping their business together with 5 different tools.</p>
                  <a href="https://buy.stripe.com/7sYdR97CW4Ds46c5tC2ZO01" className="lp-btn-cta">Start Free Trial</a>
                </div>

                <div className="lp-glass lp-pricing-card">
                  <div className="lp-tier-name">Pro</div>
                  <div className="lp-price-amount">$997</div>
                  <div className="lp-price-period">per month</div>
                  <p className="lp-tier-desc">For the multi-location operator who needs every location running like one machine.</p>
                  <a href="https://buy.stripe.com/dRm3cv3mGfi646c2hq2ZO00" className="lp-btn-cta">Start Free Trial</a>
                </div>
              </div>
              <p className="lp-pricing-note">90-day free trial on all plans. Cancel anytime. No contracts.</p>
            </div>
          </section>

          {/* 8. FAQ */}
          <section className="lp-section lp-animate">
            <div className="lp-container lp-center">
              <span className="lp-label">Questions</span>
              <h2 className="lp-h2">Before You Decide</h2>
              <p className="lp-sub">The stuff you&apos;d ask a friend before switching. Straight answers.</p>
              <div className="lp-faq-list">
                {FAQS.map((f, idx) => {
                  const open = faqOpen === idx
                  return (
                    <div key={f.q} className={`lp-faq-item${open ? ' open' : ''}`}>
                      <button
                        type="button"
                        className="lp-faq-q"
                        onClick={() => setFaqOpen(open ? null : idx)}
                        aria-expanded={open}
                      >
                        <span>{f.q}</span>
                        <span aria-hidden="true" className="lp-faq-sign">{open ? '−' : '+'}</span>
                      </button>
                      <div className="lp-faq-a">
                        <p>{f.a}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          {/* 9. FINAL CTA */}
          <section className="lp-cta lp-animate" id="cta">
            <div className="lp-glow-pink" />
            <div className="lp-container lp-z1">
              <h2 className="lp-h2">You&apos;ve Read Enough.<br />You Know If This Is You.</h2>
              <p className="lp-sub">90 days free. We set everything up. If it&apos;s not better than what you have, you pay nothing.</p>
              <div className="lp-cta-row">
                <a href="https://buy.stripe.com/7sYdR97CW4Ds46c5tC2ZO01" className="lp-btn-cta">Start Your 90-Day Free Trial</a>
                <button type="button" className="lp-btn-demo" onClick={openDemo}>Book a Demo</button>
              </div>
              <p className="lp-cta-note">Card required to start. Cancel anytime.</p>
              <div className="lp-guarantee-row">
                {[
                  '90-day free trial',
                  'Free data migration',
                  'No contracts, ever',
                  'Cancel in two clicks',
                ].map((t) => (
                  <span key={t} className="lp-guarantee-item"><span className="lp-gicon">✓</span>{t}</span>
                ))}
              </div>
            </div>
          </section>

          <footer className="lp-footer">
            <div className="lp-container">
              <p>© 2026 Lessonpreneur. All rights reserved.</p>
            </div>
          </footer>
        </main>

        {/* DEMO MODAL */}
        <div
          ref={overlayRef}
          className={`lp-demo-overlay${demoOpen ? ' open' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label="Book a Demo"
          onMouseDown={(e) => {
            if (e.target === overlayRef.current) closeDemo()
          }}
        >
          <div className="lp-demo-modal">
            <button type="button" className="lp-demo-close" onClick={closeDemo} aria-label="Close">×</button>
            <h2 className="lp-modal-title">Book a Demo</h2>
            <p className="lp-demo-sub">See how Lessonpreneur runs your school. We&apos;ll reach out within 24 hours.</p>

            {status === 'success' ? (
              <div className="lp-msg success" role="status">
                Got it. We will reach out within 24 hours.
              </div>
            ) : (
              <form onSubmit={submitDemo}>
                <input className="lp-field" type="text" placeholder="Your Name" value={name} onChange={(e) => setName(e.target.value)} required />
                <input className="lp-field" type="text" placeholder="School Name" value={school} onChange={(e) => setSchool(e.target.value)} required />
                <input className="lp-field" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <input className="lp-field" type="tel" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                <button className="lp-submit" type="submit" disabled={!canSubmit}>
                  {status === 'submitting' ? 'Sending...' : 'Request a Demo'}
                </button>

                {status === 'error' && (
                  <div className="lp-error-box" role="alert">
                    {errorMsg || 'Something went wrong. Please try again.'}
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    </LocationContext.Provider>
  )
}

