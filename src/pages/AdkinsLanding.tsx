import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase as anon } from '../lib/supabase'
import EnrollmentForm from '../components/enrollment/EnrollmentForm'
import CorneliusChat from '../components/site/CorneliusChat'
import { useRouteLocationKey } from '../config/LocationContext'
import { LOCATIONS, type LocKey } from '../config/locations'
import { useLocationTracking } from '../hooks/useLocationTracking'
import { useLocationStats } from '../hooks/useLocationStats'
import SiteHeader from '../components/site/SiteHeader'
import './adkins.css'

// ═══════════════════════════════════════
// DATA — sourced from central config
// ═══════════════════════════════════════

/** Adapter: map central LocationConfig to the shape the template uses */
function L(key: LocKey) {
  const loc = LOCATIONS[key]
  return {
    c: loc.accentColor, cg: loc.accentGlow, cl: loc.accentLight,
    name: loc.name, full: loc.fullName, badge: loc.badge, dbId: loc.locationId,
    address: loc.address, phone: loc.phone,
    reviews: loc.reviews.map(r => ({ t: r.text, n: r.name, r: r.role })),
  }
}


const HERO_REVIEWS: Record<LocKey, { text: string; name: string }> = {
  omaha: { text: 'We started with one child in guitar and loved the quality of teaching so much we have 3 kids in 4 different instruments!', name: 'Charles Burkett' },
  gretna: { text: 'I have been taking guitar lessons here since they opened. I started at 49. What started as a short goal turned into a lifelong passion.', name: 'Josh W' },
  bellevue: { text: 'Our 10 year old wanted to try the drums and now we have a music-obsessed kid who practices daily and is already talking about joining a band.', name: 'Chris Corley' },
  elkhorn: { text: 'My son has been taking guitar lessons here a couple of months and is progressing from beginner to intermediate quickly.', name: 'Speed Junkie 707' },
}

const INSTRUMENTS: { emoji: string; name: string; sub: string; core?: boolean; dashed?: boolean; desc?: string; why?: string }[] = [
  { emoji: '\u{1F3B9}', name: 'Piano', sub: 'Most Popular', core: true, desc: 'Piano is the foundation of music theory. Students learn to read music, develop both hands independently, and build a skill set that transfers to every other instrument. Great for all ages and all goals.', why: 'Our piano teachers are matched to your learning style — whether you want classical technique, pop songs, or just to finally understand how music works.' },
  { emoji: '\u{1F3B8}', name: 'Guitar', sub: 'Electric & Acoustic', core: true, desc: 'From acoustic to electric, beginner strumming to advanced lead playing — our guitar lessons meet you exactly where you are. Students learn chords, scales, songs they actually want to play, and real technique that sticks.', why: 'Adkins was built on guitar. Our founder is a national guitar competition winner. This is what we do.' },
  { emoji: '\u{1F3A4}', name: 'Vocals', sub: 'All Styles', core: true, desc: 'Singing lessons are about more than hitting notes. Students develop breath control, tone, range, confidence, and stage presence. We work with complete beginners and experienced performers alike.', why: 'Our vocal teachers specialize in finding your natural voice — not teaching you to sound like someone else.' },
  { emoji: '\u{1F941}', name: 'Drums', sub: 'Rock to Jazz', core: true, desc: 'Drumming builds coordination, timing, and musicality from the very first lesson. Students work on rhythm, technique, and playing along to real music — not just exercises.', why: 'Our drum rooms are fully equipped and soundproofed. Real kits, real lessons, real progress.' },
  { emoji: '\u{1F3BB}', name: 'Violin', sub: 'Select Locations', desc: 'Violin takes patience and the right teacher. Our violin students develop proper posture, tone production, and musicality in a structured but encouraging environment.', why: 'We match violin students with teachers who specialize in their age group and goals — classical training or contemporary styles.' },
  { emoji: '\u{1FA88}', name: 'Flute', sub: 'Select Locations', desc: 'Flute is one of the most expressive instruments in any genre. Students develop breath support, finger technique, and tone from day one in a fun, structured environment.', why: 'Our flute teachers make the first lesson the best one — no frustration, just progress.' },
  { emoji: '\u{1F3B8}', name: 'Bass', sub: 'Electric Bass', dashed: true },
  { emoji: '\u{2795}', name: 'More', sub: 'Just Ask', dashed: true },
]


function playNote() {
  try {
    const ctx = new AudioContext()
    const o1 = ctx.createOscillator(); const g1 = ctx.createGain()
    o1.connect(g1); g1.connect(ctx.destination)
    o1.type = 'sawtooth'
    o1.frequency.setValueAtTime(330, ctx.currentTime)
    o1.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.35)
    g1.gain.setValueAtTime(0.28, ctx.currentTime)
    g1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    o1.start(); o1.stop(ctx.currentTime + 0.6)
    const o2 = ctx.createOscillator(); const g2 = ctx.createGain()
    o2.connect(g2); g2.connect(ctx.destination)
    o2.type = 'sawtooth'
    o2.frequency.setValueAtTime(440, ctx.currentTime + 0.1)
    o2.frequency.exponentialRampToValueAtTime(330, ctx.currentTime + 0.45)
    g2.gain.setValueAtTime(0.14, ctx.currentTime + 0.1)
    g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65)
    o2.start(ctx.currentTime + 0.1); o2.stop(ctx.currentTime + 0.65)
  } catch (_) { /* ignore */ }
}

// ═══════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════

export default function AdkinsLanding() {
  const routeLocKey = useRouteLocationKey()
  const [loc, setLoc] = useState<LocKey>(routeLocKey ?? 'omaha')
  const [logos, setLogos] = useState<Record<string, string>>({})
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [expandedInst, setExpandedInst] = useState<number | null>(null)
  const [randomReviews, setRandomReviews] = useState<{ id: string; reviewer_name: string; text_cleaned: string }[]>([])
  const [matchScore, setMatchScore] = useState(0)
  const [barsAnimated, setBarsAnimated] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const compatRef = useRef<HTMLDivElement>(null)

  const [chatOpen, setChatOpen] = useState(false)

  const LD = L(loc)

  // Fire correct GA4 + Meta Pixel for this location
  useLocationTracking(LOCATIONS[loc])
  const locStats = useLocationStats(loc)

  // Dynamic SEO: page title + meta description per location
  useEffect(() => {
    const l = LOCATIONS[loc]
    document.title = `${l.fullName} | Piano, Guitar, Vocals & Drums — Adkins Music Lessons`
    document.querySelector('meta[name="description"]')?.setAttribute('content',
      `Private music lessons in ${l.name}, NE. Piano, guitar, vocals, drums & more. Expert teachers, flexible scheduling, no contracts. 90-day free trial. ${l.phone}`)
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', `${l.fullName} — Private Music Lessons`)
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', `https://www.lessonpreneur.io${l.route}`)
  }, [loc])

  // Fetch logos from Supabase
  useEffect(() => {
    anon.from('locations').select('id, name, logo_url').then(({ data }) => {
      const map: Record<string, string> = {}
      data?.forEach((l: any) => {
        const key = (l.name as string).split(' ')[0].toLowerCase()
        if (l.logo_url) map[key] = l.logo_url
      })
      setLogos(map)
    })
  }, [])

  // Fetch 3 random reviews for this location from Supabase
  useEffect(() => {
    let cancelled = false
    async function fetchReviews() {
      const locName = LOCATIONS[loc].name
      // Try location-specific first
      const { data: locData } = await anon
        .from('reviews')
        .select('id, reviewer_name, text_cleaned')
        .ilike('location_name', `%${locName}%`)
        .eq('is_active', true)
      let pool = locData ?? []
      // Backfill from all reviews if fewer than 3
      if (pool.length < 3) {
        const { data: allData } = await anon
          .from('reviews')
          .select('id, reviewer_name, text_cleaned')
          .eq('is_active', true)
        const ids = new Set(pool.map(r => r.id))
        pool = [...pool, ...(allData ?? []).filter(r => !ids.has(r.id))]
      }
      // Fisher-Yates shuffle
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[pool[i], pool[j]] = [pool[j], pool[i]]
      }
      if (!cancelled) setRandomReviews(pool.slice(0, 3))
    }
    fetchReviews()
    return () => { cancelled = true }
  }, [loc])

  // Animate 95% match counter + bars when the compat card scrolls into view
  useEffect(() => {
    if (!compatRef.current) return
    const el = compatRef.current
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          // Count up 0 → 95 over ~1.2s
          const target = 95
          const duration = 1200
          const start = performance.now()
          const tick = (now: number) => {
            const t = Math.min((now - start) / duration, 1)
            const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic
            setMatchScore(Math.round(eased * target))
            if (t < 1) requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
          setBarsAnimated(true)
          obs.unobserve(el)
        }
      })
    }, { threshold: 0.35 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Set CSS vars on location change
  useEffect(() => {
    const r = document.documentElement.style
    r.setProperty('--c', LD.c); r.setProperty('--cg', LD.cg); r.setProperty('--cl', LD.cl)
  }, [loc])

  const goEnroll = useCallback(() => setEnrollOpen(true), [])

  // 3D tilt
  const handleTilt = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return
    const r = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width - 0.5) * 28
    const y = -((e.clientY - r.top) / r.height - 0.5) * 28
    cardRef.current.style.transform = `perspective(800px) rotateY(${x}deg) rotateX(${y}deg)`
  }, [])
  const resetTilt = useCallback(() => { if (cardRef.current) cardRef.current.style.transform = 'perspective(800px) rotateY(0deg) rotateX(0deg)' }, [])


  const logoUrl = logos[loc] || ''

  return (
    <div className="ak-page">
      <SiteHeader />

      {/* HERO — single column, everything above the fold */}
      <section className="ak-hero">
        <div className="ak-hbg-glow" />
        <div className="ak-hgrid" />
        <div className="ak-hcontent">
          <h1 className="ak-htitle">
            <span className="ak-htitle-line1">You Were Born</span>
            <span className="ak-htitle-line2">to Play Music.</span>
          </h1>
          <div className="ak-hlogo" onMouseMove={handleTilt} onMouseLeave={resetTilt}>
            <div className="ak-lcard" ref={cardRef}>
              <div className="ak-lring">
                {logoUrl && <img src={logoUrl} alt={LD.name} />}
              </div>
            </div>
          </div>
          <div className="ak-henroll-badge">Now Enrolling in {LD.name}</div>
          <p className="ak-hsub">Private one-on-one lessons for kids, teens, and adults. No contracts. Month to month. Expert teachers who show up — every single time.</p>
          <div className="ak-hreview">
            <p className="ak-hreview-text">"{HERO_REVIEWS[loc].text}"</p>
            <span className="ak-hreview-name">— {HERO_REVIEWS[loc].name}</span>
          </div>
          {locStats && (
            <div className="ak-stat-row">
              <div className="ak-stat-card"><div className="ak-stat-num">#{locStats.stateRank}</div><div className="ak-stat-lbl">Ranked in Nebraska</div></div>
              <div className="ak-stat-card"><div className="ak-stat-num">{locStats.studentsEnrolled.toLocaleString()}+</div><div className="ak-stat-lbl">Enrolled</div></div>
              <div className="ak-stat-card"><div className="ak-stat-num">{locStats.studentsTaughtTotal.toLocaleString()}+</div><div className="ak-stat-lbl">Taught Overall</div></div>
            </div>
          )}
          <button className="ak-btnp ak-hero-cta" onClick={goEnroll} style={{ marginTop: 20 }}>Enroll Now {'\u{2192}'}</button>
        </div>
      </section>

      {/* COMPATIBILITY */}
      <section className="ak-compat-sec">
        <div className="ak-compat-inner">
          <div className="ak-slbl">Our Matching System</div>
          <h2 className="ak-stitle">We Find You <em>The Right Teacher.</em></h2>
          <p className="ak-csub">Over a decade of music education experience and a deep profile of every teacher we have — combined into a compatibility system that matches you or your child to the teacher most likely to make them fall in love with music.</p>
          <div className="ak-ccard" ref={compatRef}>
            <div className="ak-cscore-row">
              <div className="ak-sring"><div className="ak-snum">{matchScore}</div><div className="ak-spct">% MATCH</div></div>
              <div className="ak-sdetails">
                <h3>We Found Your Match {'\u{1F3B5}'}</h3>
                <p>Based on answers to our enrollment questions, we identify a teacher with a high compatibility score. We only show the number when we are confident.</p>
              </div>
            </div>
            <div className="ak-cbars">
              {[{ l: 'Personality', v: 96 }, { l: 'Schedule', v: 100 }, { l: 'Age Experience', v: 92 }, { l: 'Teaching Style', v: 94 }].map((b, i) => (
                <div className="ak-cbrow" key={b.l}>
                  <span className="ak-cblbl">{b.l}</span>
                  <div className="ak-cbtrack"><div className="ak-cbfill" style={{ width: barsAnimated ? `${b.v}%` : '0%', transition: `width 1.1s cubic-bezier(0.22,1,0.36,1) ${i * 120}ms` }} /></div>
                  <span className="ak-cbval">{b.v}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* PAIN POINTS */}
      <section className="ak-sec ak-concerns-sec">
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Real Talk</div>
          <h2 className="ak-concerns-title">We Know What<br />You Are Thinking.</h2>
          <p className="ak-secdesc">Most families have been through music lessons that did not stick. Teachers who cancelled, studios that locked you into contracts, students who gave up after a month. We built everything around making sure that does not happen here.</p>
        </div>
        <div className="ak-concerns-scroll">
          <div className="ak-concerns-track">
            {[
              { icon: '\u{1F61F}', title: '"What if they want to quit?"', desc: 'Month to month. Cancel anytime, no questions asked. We are so confident you or your child will love it that we do not need a contract to keep you here.' },
              { icon: '\u{1F4F5}', title: '"Teachers always cancel on us"', desc: 'Every teacher is background-checked and held to strict attendance standards. When a teacher is out, we find a substitute. You never lose a session.' },
              { icon: '\u{1F382}', title: '"I am too old to start"', desc: 'Adults actually progress faster than kids when they have the right teacher — because you have discipline, focus, and real motivation. You just never had the right guide.' },
              { icon: '\u{1F4C5}', title: '"Our schedule is packed"', desc: 'After school, evenings, weekends — we build around your life, not ours. Flexible scheduling that works for real families.' },
              { icon: '\u{1F3B5}', title: '"What if I have no musical background?"', desc: 'Most of our families have zero musical experience. Our teachers specialize in starting from zero — no shame, no jargon, just progress.' },
            ].map((p, i) => (
              <div className="ak-concern-card" key={i}>
                <span className="ak-concern-icon">{p.icon}</span>
                <h3>{p.title}</h3>
                <p>{p.desc}</p>
              </div>
            ))}
          </div>
          <div className="ak-concerns-hint">{'\u{2190}'} swipe {'\u{2192}'}</div>
        </div>
        <div className="ak-pcta-box">
          <h3>Stop Wondering. Start Playing.</h3>
          <p>We will match your family with the perfect teacher and have your first lesson on the calendar within 24 hours.</p>
          <button className="ak-btnp" onClick={goEnroll}>Check Availability Now {'\u{2192}'}</button>
        </div>
      </section>

      {/* 3 STEPS — Roadmap */}
      <section className="ak-steps-sec">
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Ridiculously Simple</div>
          <h2 className="ak-stitle">3 Steps to Your First Lesson</h2>
        </div>
        <div className="ak-roadmap">
          <div className="ak-roadline" />
          {[
            { n: 1, title: 'Tell us about your family', desc: '30 seconds. Instrument, age, and availability. That is it for now.' },
            { n: 2, title: 'We find your match', desc: 'Our system picks the teacher most likely to connect with you or your child — not just whoever is available.' },
            { n: 3, title: 'Book your first lesson within 24 hours', desc: 'Most families have their first lesson locked in same day.' },
          ].map(s => (
            <div className="ak-rstep" key={s.n}>
              <div className="ak-rdot">{s.n}</div>
              <div className="ak-rbody">
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            </div>
          ))}
          <div className="ak-rstep ak-rstep-final">
            <div className="ak-rcorn">
              <img src="/cornelius.png" alt="Cornelius Cobb" />
            </div>
            <div className="ak-rbody">
              <h3>You are in. Cornelius takes it from here.</h3>
              <p>Your teacher shows up. You or your child starts playing. That is the whole point.</p>
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: 36 }}>
          <button className="ak-btnp" onClick={goEnroll}>Get Started — Free to Try {'\u{2192}'}</button>
        </div>
      </section>

      {/* TESTIMONIAL 2 — after 3 steps */}
      {randomReviews[1] && (
        <div className="ak-testimonial">
          <div className="ak-test-stars">{'\u{2B50}\u{2B50}\u{2B50}\u{2B50}\u{2B50}'}</div>
          <p className="ak-test-text">"{randomReviews[1].text_cleaned}"</p>
          <span className="ak-test-name">— {randomReviews[1].reviewer_name.split(' ')[0]}</span>
        </div>
      )}

      {/* INSTRUMENTS */}
      <section className="ak-sec">
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">What We Teach</div>
          <h2 className="ak-stitle">Pick Your Instrument</h2>
        </div>
        <div className="ak-igrid">
          {INSTRUMENTS.map((inst, i) => {
            const isOpen = expandedInst === i
            const hasPanel = !!inst.desc
            return (
              <div key={i} className="ak-icard-wrap" style={{ gridColumn: isOpen ? '1 / -1' : undefined }}>
                <div
                  className={`ak-icard${inst.dashed ? ' dashed' : ''}${isOpen ? ' open' : ''}`}
                  onClick={() => hasPanel && setExpandedInst(isOpen ? null : i)}
                  style={{ cursor: hasPanel ? 'pointer' : 'default' }}
                >
                  {inst.core && <span className="ak-cbadge">Core</span>}
                  <span className="ak-iem">{inst.emoji}</span>
                  <h3>{inst.name}</h3>
                  <p>{inst.sub}</p>
                  {hasPanel && (
                    <span className={`ak-ichev${isOpen ? ' rot' : ''}`}>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </span>
                  )}
                </div>
                {isOpen && inst.desc && (
                  <div className="ak-ipanel" style={{ borderLeftColor: LD.c }}>
                    <div className="ak-ipanel-desc">
                      <p>{inst.desc}</p>
                    </div>
                    <div className="ak-ipanel-why">
                      <div className="ak-ipanel-wlbl" style={{ color: LD.c }}>Why We Are Great at This</div>
                      <p>{inst.why}</p>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* TESTIMONIAL 1 — after instruments */}
      {randomReviews[0] && (
        <div className="ak-testimonial">
          <div className="ak-test-stars">{'\u{2B50}\u{2B50}\u{2B50}\u{2B50}\u{2B50}'}</div>
          <p className="ak-test-text">"{randomReviews[0].text_cleaned}"</p>
          <span className="ak-test-name">— {randomReviews[0].reviewer_name.split(' ')[0]}</span>
        </div>
      )}

      {/* NO RISK */}
      <section className="ak-norisk-sec">
        <div className="ak-nrinner">
          <div className="ak-nri">{'\u{1F6E1}\u{FE0F}'}</div>
          <h2>We Do Not Believe in<br />Trapping Families.</h2>
          <p>Month to month. Always. If it is not working after the first month, we will make it right — no awkward conversations, no fees, no drama. That is a promise.</p>
          <div className="ak-rpoints">
            {['No long-term contracts', 'Cancel anytime', 'No enrollment fees', 'Month to month billing'].map(r => (
              <div className="ak-rpt" key={r}><div className="ak-rck">{'\u{2713}'}</div>{r}</div>
            ))}
          </div>
          <button className="ak-btnp" onClick={goEnroll}>Start Month-to-Month {'\u{2192}'}</button>
        </div>
      </section>

      {/* ADULTS WELCOME */}
      <section className="ak-sec">
        <div className="ak-adult-card" style={{ borderColor: `${LD.c}30` }}>
          <h2 className="ak-adult-title" style={{ color: LD.c }}>Adults Welcome. Always.</h2>
          <p className="ak-adult-body">Most of our students are kids — but some of our best students are adults. Whether you picked up an instrument as a kid and walked away, or you have always wanted to start and never did, there is no wrong time. Our teachers work with students from age 5 to 95. No judgment. No pressure. Just real progress at your pace.</p>
        </div>
      </section>

      {/* FAQ */}
      <section className="ak-sec">
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Questions</div>
          <h2 className="ak-stitle">Frequently Asked</h2>
        </div>
        <div className="ak-faq-grid">
          {[
            { q: 'Do you teach adults?', a: 'Absolutely. We have students of all ages and our teachers are experienced working with adult learners. Adults often progress faster than kids because of their focus and life experience. You are not too old. Book a first session and see for yourself.' },
            { q: 'Do I need my own instrument?', a: 'Not necessarily. Some students start without one. During enrollment we will ask and can help you figure out the best path — renting, buying, or borrowing.' },
            { q: 'What if I need to cancel?', a: 'Month to month. Cancel anytime, no questions asked. No contracts, no fees, no drama.' },
            { q: 'How long are lessons?', a: 'Standard lessons are 30 minutes. Some students do 45 or 60 minute sessions depending on age and level.' },
          ].map((f, i) => (
            <div className="ak-faq-card" key={i}>
              <h3 className="ak-faq-q">{f.q}</h3>
              <p className="ak-faq-a">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* TESTIMONIAL 3 — before final CTA */}
      {randomReviews[2] && (
        <div className="ak-testimonial">
          <div className="ak-test-stars">{'\u{2B50}\u{2B50}\u{2B50}\u{2B50}\u{2B50}'}</div>
          <p className="ak-test-text">"{randomReviews[2].text_cleaned}"</p>
          <span className="ak-test-name">— {randomReviews[2].reviewer_name.split(' ')[0]}</span>
        </div>
      )}

      {/* LOCATION / MAP */}
      <section className="ak-loc-sec">
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Visit Us</div>
          <h2 className="ak-stitle">{LOCATIONS[loc].fullName}</h2>
        </div>
        <div className="ak-loc-grid">
          <div className="ak-loc-info">
            <div className="ak-loc-row">
              <span className="ak-loc-icon">{'\u{1F4CD}'}</span>
              <div>
                <div className="ak-loc-label">Address</div>
                <div className="ak-loc-value">{LOCATIONS[loc].address}</div>
              </div>
            </div>
            <div className="ak-loc-row">
              <span className="ak-loc-icon">{'\u{1F4DE}'}</span>
              <div>
                <div className="ak-loc-label">Phone</div>
                <a className="ak-loc-value ak-loc-link" href={`tel:${LOCATIONS[loc].phone.replace(/\D/g, '')}`}>{LOCATIONS[loc].phone}</a>
              </div>
            </div>
            <div className="ak-loc-row">
              <span className="ak-loc-icon">{'\u{2709}\u{FE0F}'}</span>
              <div>
                <div className="ak-loc-label">Email</div>
                <a className="ak-loc-value ak-loc-link" href={`mailto:${LOCATIONS[loc].email}`}>{LOCATIONS[loc].email}</a>
              </div>
            </div>
            <div className="ak-loc-row">
              <span className="ak-loc-icon">{'\u{1F552}'}</span>
              <div>
                <div className="ak-loc-label">Hours</div>
                <div className="ak-loc-value">Mon – Thu: 3:00 – 9:00 PM</div>
                <div className="ak-loc-value">Sat – Sun: 10:00 AM – 3:00 PM</div>
              </div>
            </div>
            <a
              className="ak-btnp ak-loc-dir"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(LOCATIONS[loc].address)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Get Directions {'\u{2192}'}
            </a>
          </div>
          <div className="ak-loc-map">
            <iframe
              key={loc}
              title={`Map — ${LOCATIONS[loc].fullName}`}
              src={`https://maps.google.com/maps?q=${encodeURIComponent(LOCATIONS[loc].address)}&output=embed`}
              width="100%"
              height="100%"
              style={{ border: 0, borderRadius: 14 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="ak-final-sec">
        <h2>Your <span>First Lesson</span><br />Is Waiting.</h2>
        <p>Join {locStats ? `${locStats.studentsTaughtTotal.toLocaleString()}+` : ''} students across the Omaha metro — kids, teens, and adults. Book in the next 60 seconds.</p>
        <div className="ak-fbtns">
          <button className="ak-btnp" style={{ fontSize: 16, padding: '16px 34px' }} onClick={goEnroll}>Sign Up For Lessons Now {'\u{2192}'}</button>
          <button className="ak-btng" onClick={goEnroll}>Or Text Us First</button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="ak-footer">
        <div className="ak-fname">{LD.full.toUpperCase()}</div>
        <div style={{ fontSize: 11, color: '#55516E', marginBottom: 8 }}>By Adkins Music Lessons</div>
        <div className="ak-fpow">Powered by <span>Lessonpreneur</span></div>
      </footer>

      {/* CORNELIUS MASCOT */}
      <img
        id="ak-corn"
        src="/cornelius.png"
        alt="Cornelius Cobb"
        onClick={() => { setChatOpen(o => !o); playNote() }}
      />
      <CorneliusChat
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        locKey={loc}
        onNavigateSignup={goEnroll}
      />

      {/* Full-screen enrollment form */}
      <EnrollmentForm isOpen={enrollOpen} onClose={() => setEnrollOpen(false)} defaultLocation={loc} />
    </div>
  )
}
