import { useState, useEffect, useRef, useCallback } from 'react'
import './lessonpreneur-landing.css'

const PLANS = [
  {
    name: 'Solo Teacher',
    price: 97,
    desc: 'For independent teachers with 1\u201330 students',
    features: [
      'Student & family management',
      'Scheduling & calendar',
      'Automated billing & invoicing',
      'Parent & student portals',
      'SMS notifications',
      'Lead capture form',
    ],
    stripe: 'https://buy.stripe.com/aFabJ16ySgmabyE9JS2ZO02',
    popular: false,
  },
  {
    name: 'Music School',
    price: 297,
    desc: 'For school owners with one location and 2\u201310 teachers',
    features: [
      'Everything in Solo, plus:',
      'Multi-teacher management',
      'Teacher app with schedules',
      'AI-powered lead scoring',
      'Automated follow-up sequences',
      'Payroll tracking',
      'Square payment integration',
      'Custom branded landing pages',
    ],
    stripe: 'https://buy.stripe.com/7sYdR97CW4Ds46c5tC2ZO01',
    popular: true,
  },
  {
    name: 'Multi-Location Pro',
    price: 997,
    desc: 'For operators running multiple locations',
    features: [
      'Everything in School, plus:',
      'Unlimited locations',
      'Cross-location dashboard',
      'Location-specific branding',
      'Advanced analytics & reporting',
      'Priority support',
      'Custom integrations',
      'Dedicated onboarding',
    ],
    stripe: 'https://buy.stripe.com/dRm3cv3mGfi646c2hq2ZO00',
    popular: false,
  },
]

const PAIN_POINTS = [
  {
    icon: '\u{1F4CB}',
    title: 'Scheduling Chaos',
    desc: 'Juggling Google Calendar, spreadsheets, and sticky notes. Teachers double-booked. Parents frustrated.',
  },
  {
    icon: '\u{1F4B8}',
    title: 'Billing Headaches',
    desc: 'Chasing payments. Sending invoices manually. No idea who owes what until it\'s overdue.',
  },
  {
    icon: '\u{1F4E9}',
    title: 'Leads Falling Through',
    desc: 'Inquiries come in. You reply 3 days later. They\'ve already signed up somewhere else.',
  },
  {
    icon: '\u{1F914}',
    title: 'No Visibility',
    desc: 'How many students do you actually have? What\'s your retention rate? You shouldn\'t have to guess.',
  },
]

const FEATURES = [
  {
    icon: '\u{1F4C5}',
    title: 'Smart Scheduling',
    desc: 'Drag-and-drop calendar. Teacher availability. Conflict detection. Families see their schedule instantly.',
  },
  {
    icon: '\u{1F4B3}',
    title: 'Automated Billing',
    desc: 'Generate invoices in one click. Families pay online. Overdue reminders sent automatically.',
  },
  {
    icon: '\u{1F9F2}',
    title: 'Lead Pipeline',
    desc: 'Every inquiry captured. AI compatibility scoring. Automated follow-up. Never lose a lead again.',
  },
  {
    icon: '\u{1F468}\u{200D}\u{1F3EB}',
    title: 'Teacher Portal',
    desc: 'Teachers see their own schedule, students, and notes. No more texting you for info.',
  },
  {
    icon: '\u{1F46A}',
    title: 'Family Portal',
    desc: 'Parents view schedules, pay invoices, and message teachers. All from their phone.',
  },
  {
    icon: '\u{1F4CA}',
    title: 'Real-Time Dashboard',
    desc: 'Students, revenue, retention, growth \u2014 all visible at a glance. Know your numbers.',
  },
]

const COMPETITORS = [
  { name: 'MyMusicStaff', scheduling: true, billing: true, leads: false, ai: false, multiLoc: false, teacherApp: false, familyApp: false },
  { name: 'Opus One', scheduling: true, billing: true, leads: false, ai: false, multiLoc: false, teacherApp: false, familyApp: false },
  { name: 'Music Teacher\'s Helper', scheduling: true, billing: true, leads: false, ai: false, multiLoc: false, teacherApp: false, familyApp: false },
  { name: 'Lessonpreneur', scheduling: true, billing: true, leads: true, ai: true, multiLoc: true, teacherApp: true, familyApp: true },
]

const FAQS = [
  {
    q: 'Is there really a 90-day free trial?',
    a: 'Yes. Full access to every feature for 90 days. We ask for a card upfront to filter out tire-kickers, but you won\'t be charged until day 91. If it\'s not working for you, cancel before then \u2014 no questions asked.',
  },
  {
    q: 'I\'m already using another platform. How hard is it to switch?',
    a: 'We handle the migration for you. Student data, schedules, billing history \u2014 we\'ll move it all over. Plus, we\'ll beat whatever you\'re currently paying and give you 90 days free on top of it.',
  },
  {
    q: 'Do my teachers need to be tech-savvy?',
    a: 'Not at all. The teacher app is dead simple \u2014 they see their schedule and their students. That\'s it. If they can use a phone, they can use Lessonpreneur.',
  },
  {
    q: 'Can parents actually pay through the app?',
    a: 'Yes. We integrate with Square for payment processing. Parents get a payment link, tap to pay, done. No more chasing checks or Venmo requests.',
  },
  {
    q: 'What if I only have a few students?',
    a: 'The Solo plan is built exactly for you. $97/month gets you the full system. Most solo teachers make that back with one or two students they would\'ve lost without proper follow-up.',
  },
  {
    q: 'Who built this?',
    a: 'Zach Adkins \u2014 owner of Adkins Music Lessons, a four-location music school doing $1.2M+ per year in Omaha. He built Lessonpreneur because nothing on the market did what he needed. This isn\'t software built by a tech company guessing at your problems. It\'s built by someone who lives them.',
  },
]

const SHOWCASE_TABS = ['Studio', 'Schedule', 'Roster', 'The Band', 'Your Books'] as const

export default function LesssonpreneurLanding() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [showcaseTab, setShowcaseTab] = useState(0)
  const pageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.title = 'Lessonpreneur — The Operating System for Music Schools'
    document.querySelector('meta[name="description"]')?.setAttribute('content',
      'Run your music school from your phone in 15 minutes a day. Scheduling, billing, leads, teacher portals, AI-powered matching — all in one place. Built by a music school owner doing $1.2M/year. 90-day free trial.')
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', 'Lessonpreneur — The Operating System for Music Schools')
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', 'https://www.lessonpreneur.io/lessonpreneur')
  }, [])

  // Scroll-triggered fade-in
  useEffect(() => {
    const els = document.querySelectorAll('.lp-fade-in')
    if (!els.length) return
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('lp-visible'); obs.unobserve(e.target) } })
    }, { threshold: 0.12 })
    els.forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [])

  // Mobile showcase carousel scroll-snap
  const showcaseScrollRef = useRef<HTMLDivElement>(null)
  const handleShowcaseScroll = useCallback(() => {
    const el = showcaseScrollRef.current
    if (!el) return
    const idx = Math.round(el.scrollLeft / el.clientWidth)
    setShowcaseTab(idx)
  }, [])

  return (
    <div className="lp-page" ref={pageRef}>
      {/* NAV */}
      <nav className="lp-nav">
        <div className="lp-nav-brand">
          <span className="lp-nav-logo">Lessonpreneur</span>
        </div>
        <div className="lp-nav-links">
          <a href="#features" className="lp-nav-link">Features</a>
          <a href="#pricing" className="lp-nav-link">Pricing</a>
          <a href="#faq" className="lp-nav-link">FAQ</a>
          <a href="#pricing" className="lp-nav-cta">Start Free Trial &rarr;</a>
        </div>
      </nav>

      {/* HERO */}
      <section className="lp-hero">
        <div className="lp-hero-orb lp-hero-orb-pink" />
        <div className="lp-hero-orb lp-hero-orb-gold" />
        <div className="lp-hero-glow" />
        <div className="lp-hero-grid" />
        <div className="lp-hero-content">
          <div className="lp-badge">
            <div className="lp-badge-dot" />
            Built by a $1.2M music school owner
          </div>
          <h1 className="lp-hero-title">
            <span className="lp-ht-sm">Run Your Music School</span>
            <span className="lp-ht-lg">In 15 Minutes</span>
            <span className="lp-ht-sm">A Day. Everything Else Is Automated.</span>
          </h1>
          <p className="lp-hero-sub">
            Scheduling, billing, leads, teachers, families &mdash; one system.
            <strong> No more duct-taping 5 different tools together.</strong>
          </p>
          <div className="lp-hero-ctas">
            <a href="#pricing" className="lp-btn-primary lp-btn-pulse">Start Your 90-Day Free Trial &rarr;</a>
          </div>
          <div className="lp-trust-row">
            <div className="lp-trust-stat">
              <div className="lp-trust-num">4</div>
              <div className="lp-trust-label">Locations</div>
            </div>
            <div className="lp-trust-div" />
            <div className="lp-trust-stat">
              <div className="lp-trust-num">$1.2M+</div>
              <div className="lp-trust-label">Annual Revenue</div>
            </div>
            <div className="lp-trust-div" />
            <div className="lp-trust-stat">
              <div className="lp-trust-num">3,800+</div>
              <div className="lp-trust-label">Students Managed</div>
            </div>
          </div>
        </div>
      </section>

      {/* PRODUCT SHOWCASE */}
      <section className="lp-sec lp-showcase-sec lp-fade-in" id="showcase">
        <div className="lp-sec-inner">
          <div className="lp-sec-label">See It In Action</div>
          <h2 className="lp-sec-title">Your Entire School.<br /><em>One Screen.</em></h2>

          {/* Desktop: browser chrome frame */}
          <div className="lp-showcase-desktop">
            <div className="lp-browser-chrome">
              <div className="lp-browser-dots"><span /><span /><span /></div>
              <div className="lp-browser-url">app.lessonpreneur.io</div>
            </div>
            <div className="lp-showcase-tabs">
              {SHOWCASE_TABS.map((t, i) => (
                <button key={t} className={`lp-showcase-tab${showcaseTab === i ? ' active' : ''}`} onClick={() => setShowcaseTab(i)}>{t}</button>
              ))}
            </div>
            <div className="lp-showcase-panel">
              {showcaseTab === 0 && <ShowcaseStudio />}
              {showcaseTab === 1 && <ShowcaseSchedule />}
              {showcaseTab === 2 && <ShowcaseRoster />}
              {showcaseTab === 3 && <ShowcaseBand />}
              {showcaseTab === 4 && <ShowcaseBooks />}
            </div>
          </div>

          {/* Mobile: phone frame carousel */}
          <div className="lp-showcase-mobile">
            <div className="lp-phone-frame">
              <div className="lp-phone-notch" />
              <div className="lp-phone-screen" ref={showcaseScrollRef} onScroll={handleShowcaseScroll}>
                <div className="lp-phone-slide"><ShowcaseStudio /></div>
                <div className="lp-phone-slide"><ShowcaseSchedule /></div>
                <div className="lp-phone-slide"><ShowcaseRoster /></div>
                <div className="lp-phone-slide"><ShowcaseBand /></div>
                <div className="lp-phone-slide"><ShowcaseBooks /></div>
              </div>
            </div>
            <div className="lp-showcase-dots">
              {SHOWCASE_TABS.map((t, i) => (
                <button key={t} className={`lp-dot${showcaseTab === i ? ' active' : ''}`} onClick={() => showcaseScrollRef.current?.scrollTo({ left: i * (showcaseScrollRef.current?.clientWidth ?? 0), behavior: 'smooth' })} />
              ))}
            </div>
            <div className="lp-showcase-dot-labels">
              {SHOWCASE_TABS.map((t, i) => (
                <span key={t} className={showcaseTab === i ? 'active' : ''}>{t}</span>
              ))}
            </div>
          </div>

          <p className="lp-showcase-tagline">Every tab. Every tool. One app. <span>Your phone.</span></p>
        </div>
      </section>

      {/* PAIN POINTS */}
      <section className="lp-sec lp-pain-sec lp-fade-in">
        <div className="lp-sec-inner">
          <div className="lp-sec-label">Sound Familiar?</div>
          <h2 className="lp-sec-title">You Got Into Music Because You <em>Love It.</em><br />Not Because You Wanted to Be an Admin.</h2>
          <div className="lp-pain-grid">
            {PAIN_POINTS.map((p, i) => (
              <div className="lp-card" key={i}>
                <div className="lp-card-icon">{p.icon}</div>
                <h3 className="lp-card-title">{p.title}</h3>
                <p className="lp-card-desc">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="lp-sec lp-feat-sec lp-fade-in" id="features">
        <div className="lp-sec-inner">
          <div className="lp-sec-label">The System</div>
          <h2 className="lp-sec-title">Everything You Need.<br /><em>Nothing You Don't.</em></h2>
          <p className="lp-sec-desc">
            Lessonpreneur replaces your scheduling app, your billing tool, your CRM, your teacher group chat, and that spreadsheet you forgot to update last month.
          </p>
          <div className="lp-feat-grid">
            {FEATURES.map((f, i) => (
              <div className="lp-card" key={i}>
                <div className="lp-card-icon">{f.icon}</div>
                <h3 className="lp-card-title">{f.title}</h3>
                <p className="lp-card-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section className="lp-sec lp-proof-sec lp-fade-in">
        <div className="lp-sec-inner lp-proof-inner">
          <div className="lp-proof-quote">
            <div className="lp-proof-mark">&ldquo;</div>
            <blockquote>
              I built Lessonpreneur because I was running a four-location music school and nothing on the market did what I needed. Every tool was either built for solo teachers or built by people who've never run a music school. So I built my own. Now I run my entire operation from my phone in 15 minutes a day.
            </blockquote>
            <div className="lp-proof-author">
              <strong>Zach Adkins</strong>
              <span>Owner, Adkins Music Lessons &mdash; $1.2M+ / year, 4 locations, Omaha NE</span>
            </div>
          </div>
        </div>
      </section>

      {/* COMPETITOR COMPARISON */}
      <section className="lp-sec lp-comp-sec lp-fade-in">
        <div className="lp-sec-inner">
          <div className="lp-sec-label">Compare</div>
          <h2 className="lp-sec-title">How We Stack Up Against<br /><em>Everything Else</em></h2>
          <div className="lp-comp-table-wrap">
            <table className="lp-comp-table">
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>Scheduling</th>
                  <th>Billing</th>
                  <th>Lead CRM</th>
                  <th>AI</th>
                  <th>Multi-Location</th>
                  <th>Teacher App</th>
                  <th>Family App</th>
                </tr>
              </thead>
              <tbody>
                {COMPETITORS.map((c, i) => (
                  <tr key={i} className={c.name === 'Lessonpreneur' ? 'lp-comp-highlight' : ''}>
                    <td className="lp-comp-name">{c.name}</td>
                    <td>{c.scheduling ? '\u2705' : '\u274C'}</td>
                    <td>{c.billing ? '\u2705' : '\u274C'}</td>
                    <td>{c.leads ? '\u2705' : '\u274C'}</td>
                    <td>{c.ai ? '\u2705' : '\u274C'}</td>
                    <td>{c.multiLoc ? '\u2705' : '\u274C'}</td>
                    <td>{c.teacherApp ? '\u2705' : '\u274C'}</td>
                    <td>{c.familyApp ? '\u2705' : '\u274C'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="lp-sec lp-price-sec lp-fade-in" id="pricing">
        <div className="lp-sec-inner">
          <div className="lp-sec-label">Pricing</div>
          <h2 className="lp-sec-title">90 Days Free. <em>No Risk.</em></h2>
          <p className="lp-sec-desc">
            Card required to start &mdash; filters out tire-kickers so we can focus on people who are serious about growing. You won't be charged until day 91.
          </p>
          <div className="lp-price-grid">
            {PLANS.map((plan, i) => (
              <div className={`lp-price-card ${plan.popular ? 'lp-price-popular' : ''}`} key={i}>
                {plan.popular && <div className="lp-price-badge">Most Popular</div>}
                <h3 className="lp-price-name">{plan.name}</h3>
                <div className="lp-price-amount">
                  <span className="lp-price-dollar">$</span>
                  <span className="lp-price-num">{plan.price}</span>
                  <span className="lp-price-per">/mo</span>
                </div>
                <p className="lp-price-desc">{plan.desc}</p>
                <ul className="lp-price-features">
                  {plan.features.map((f, j) => (
                    <li key={j}><span className="lp-check">{'\u2713'}</span>{f}</li>
                  ))}
                </ul>
                <a href={plan.stripe} className={`lp-price-cta ${plan.popular ? 'lp-price-cta-pop' : ''}`}>
                  Start 90-Day Free Trial &rarr;
                </a>
              </div>
            ))}
          </div>
          <div className="lp-switch-guarantee">
            <strong>Switching from another platform?</strong> We'll beat your current price + give you 90 days free + handle your migration. If we're not better, full refund.
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="lp-sec lp-faq-sec lp-fade-in" id="faq">
        <div className="lp-sec-inner">
          <div className="lp-sec-label">FAQ</div>
          <h2 className="lp-sec-title">Questions? <em>Answers.</em></h2>
          <div className="lp-faq-list">
            {FAQS.map((faq, i) => (
              <div
                className={`lp-faq-item ${openFaq === i ? 'open' : ''}`}
                key={i}
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                <div className="lp-faq-q">
                  <span>{faq.q}</span>
                  <span className="lp-faq-arrow">{openFaq === i ? '\u2212' : '+'}</span>
                </div>
                {openFaq === i && <div className="lp-faq-a">{faq.a}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="lp-final-sec">
        <h2 className="lp-sec-title" style={{ textAlign: 'center' }}>
          Your School Deserves<br /><em>A Real Operating System.</em>
        </h2>
        <p className="lp-sec-desc" style={{ textAlign: 'center', margin: '0 auto 32px' }}>
          Stop duct-taping tools together. Start running your school like the business it is.
        </p>
        <div style={{ textAlign: 'center' }}>
          <a href="#pricing" className="lp-btn-primary lp-btn-lg">Start Your 90-Day Free Trial &rarr;</a>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="lp-footer">
        <div className="lp-footer-brand">LESSONPRENEUR</div>
        <div className="lp-footer-sub">Built by a music school owner, for music school owners.</div>
        <div className="lp-footer-copy">&copy; {new Date().getFullYear()} Lessonpreneur. All rights reserved.</div>
      </footer>

      {/* STICKY MOBILE CTA */}
      <div className="lp-sticky-cta">
        <a href="#pricing" className="lp-btn-primary lp-btn-pulse" style={{ width: '100%', textAlign: 'center' }}>Start Free Trial &rarr;</a>
      </div>
    </div>
  )
}

/* ─── Showcase Mock Panels ─── */

function ShowcaseStudio() {
  const locs = [
    { name: 'Omaha', color: '#D41113', students: 87, revenue: '$15,460' },
    { name: 'Gretna', color: '#00A651', students: 171, revenue: '$38,000' },
    { name: 'Bellevue', color: '#A333FF', students: 146, revenue: '$28,795' },
    { name: 'Elkhorn', color: '#00A5E8', students: 81, revenue: '$16,210' },
  ]
  return (
    <div className="sc-panel">
      <div className="sc-header">Studio Overview</div>
      <div className="sc-stat-row">
        <div className="sc-stat"><span className="sc-stat-num">485</span><span className="sc-stat-label">Families</span></div>
        <div className="sc-stat"><span className="sc-stat-num">603</span><span className="sc-stat-label">Students</span></div>
        <div className="sc-stat"><span className="sc-stat-num sc-green">$98,465</span><span className="sc-stat-label">Monthly</span></div>
      </div>
      <div className="sc-loc-grid">
        {locs.map(l => (
          <div key={l.name} className="sc-loc-card" style={{ borderLeftColor: l.color }}>
            <div className="sc-loc-name" style={{ color: l.color }}>{l.name}</div>
            <div className="sc-loc-detail">{l.students} students &middot; {l.revenue}/mo</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ShowcaseSchedule() {
  const slots = [
    { teacher: 'Sarah M.', time: '3:00', student: 'Jamie K.', inst: 'Piano', color: '#D4226A' },
    { teacher: 'Sarah M.', time: '3:30', student: 'Open Slot', inst: '', color: '#363656' },
    { teacher: 'Sarah M.', time: '4:00', student: 'Tyler R.', inst: 'Piano', color: '#D4226A' },
    { teacher: 'Marcus T.', time: '3:00', student: 'Jesse W.', inst: 'Guitar', color: '#FF5500' },
    { teacher: 'Marcus T.', time: '3:30', student: 'Ava C.', inst: 'Guitar', color: '#FF5500' },
    { teacher: 'Marcus T.', time: '4:00', student: 'Noah P.', inst: 'Guitar', color: '#FF5500' },
  ]
  return (
    <div className="sc-panel">
      <div className="sc-header">Today's Schedule</div>
      <div className="sc-schedule-grid">
        {slots.map((s, i) => (
          <div key={i} className="sc-slot" style={{ borderLeftColor: s.color }}>
            <div className="sc-slot-time">{s.time}</div>
            <div className="sc-slot-info">
              <span className="sc-slot-student">{s.student}</span>
              {s.inst && <span className="sc-slot-inst">{s.inst}</span>}
            </div>
            <div className="sc-slot-teacher">{s.teacher}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ShowcaseRoster() {
  const students = [
    { name: 'Jamie Kim', inst: 'Piano', status: 'Active', teacher: 'Sarah M.' },
    { name: 'Tyler Rodriguez', inst: 'Drums', status: 'Active', teacher: 'Alex B.' },
    { name: 'Ava Chen', inst: 'Guitar', status: 'Active', teacher: 'Marcus T.' },
    { name: 'Noah Parker', inst: 'Guitar', status: 'At Risk', teacher: 'Marcus T.' },
    { name: 'Lily Tran', inst: 'Vocals', status: 'Active', teacher: 'Dana W.' },
  ]
  return (
    <div className="sc-panel">
      <div className="sc-header">Student Roster</div>
      <div className="sc-roster">
        {students.map((s, i) => (
          <div key={i} className="sc-roster-row">
            <div className="sc-roster-avatar">{s.name[0]}</div>
            <div className="sc-roster-info">
              <span className="sc-roster-name">{s.name}</span>
              <span className="sc-roster-sub">{s.inst} &middot; {s.teacher}</span>
            </div>
            <span className={`sc-badge ${s.status === 'At Risk' ? 'sc-badge-warn' : 'sc-badge-ok'}`}>{s.status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ShowcaseBand() {
  const teachers = [
    { name: 'Sarah Mitchell', instruments: 'Piano, Vocals', students: 24, status: 'Active' },
    { name: 'Marcus Thompson', instruments: 'Guitar, Bass', students: 18, status: 'Active' },
    { name: 'Alex Brooks', instruments: 'Drums, Percussion', students: 15, status: 'At Capacity' },
    { name: 'Dana Williams', instruments: 'Vocals', students: 12, status: 'Active' },
  ]
  return (
    <div className="sc-panel">
      <div className="sc-header">The Band</div>
      <div className="sc-roster">
        {teachers.map((t, i) => (
          <div key={i} className="sc-roster-row">
            <div className="sc-roster-avatar sc-avatar-teacher">{t.name[0]}</div>
            <div className="sc-roster-info">
              <span className="sc-roster-name">{t.name}</span>
              <span className="sc-roster-sub">{t.instruments} &middot; {t.students} students</span>
            </div>
            <span className={`sc-badge ${t.status === 'At Capacity' ? 'sc-badge-gold' : 'sc-badge-ok'}`}>{t.status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ShowcaseBooks() {
  const invoices = [
    { family: 'Kim Family', amount: '$180', status: 'Paid', date: 'Apr 1' },
    { family: 'Rodriguez Family', amount: '$360', status: 'Paid', date: 'Apr 1' },
    { family: 'Chen Family', amount: '$180', status: 'Due', date: 'Apr 5' },
    { family: 'Parker Family', amount: '$180', status: 'Overdue', date: 'Mar 28' },
    { family: 'Tran Family', amount: '$180', status: 'Paid', date: 'Apr 2' },
  ]
  return (
    <div className="sc-panel">
      <div className="sc-header">Your Books</div>
      <div className="sc-roster">
        {invoices.map((inv, i) => (
          <div key={i} className="sc-roster-row">
            <div className="sc-roster-info">
              <span className="sc-roster-name">{inv.family}</span>
              <span className="sc-roster-sub">{inv.date} &middot; {inv.amount}</span>
            </div>
            <span className={`sc-badge ${inv.status === 'Paid' ? 'sc-badge-ok' : inv.status === 'Overdue' ? 'sc-badge-warn' : 'sc-badge-due'}`}>{inv.status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
