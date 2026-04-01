import { useState, useEffect } from 'react'
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

export default function LesssonpreneurLanding() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  useEffect(() => {
    document.title = 'Lessonpreneur — The Operating System for Music Schools'
    document.querySelector('meta[name="description"]')?.setAttribute('content',
      'Run your music school from your phone in 15 minutes a day. Scheduling, billing, leads, teacher portals, AI-powered matching — all in one place. Built by a music school owner doing $1.2M/year. 90-day free trial.')
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', 'Lessonpreneur — The Operating System for Music Schools')
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', 'https://www.lessonpreneur.io/lessonpreneur')
  }, [])

  return (
    <div className="lp-page">
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
            <a href="#pricing" className="lp-btn-primary">Start Your 90-Day Free Trial &rarr;</a>
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
              <div className="lp-trust-num">2,000+</div>
              <div className="lp-trust-label">Students Managed</div>
            </div>
          </div>
        </div>
      </section>

      {/* PAIN POINTS */}
      <section className="lp-sec lp-pain-sec">
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
      <section className="lp-sec lp-feat-sec" id="features">
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
      <section className="lp-sec lp-proof-sec">
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
      <section className="lp-sec lp-comp-sec">
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
      <section className="lp-sec lp-price-sec" id="pricing">
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
      <section className="lp-sec lp-faq-sec" id="faq">
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
        <a href="#pricing" className="lp-btn-primary" style={{ width: '100%', textAlign: 'center' }}>Start Free Trial &rarr;</a>
      </div>
    </div>
  )
}
