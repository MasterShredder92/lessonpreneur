import { useEffect } from 'react'
import { useNavigate, useLocation as useRouterLocation } from 'react-router-dom'
import { LOCATIONS, type LocKey } from '../config/locations'
import { useSiteLocation } from '../hooks/useSiteLocation'
import { setLocColors } from '../lib/setLocColors'
import { useLocationStats } from '../hooks/useLocationStats'
import ReviewsSection from '../components/site/ReviewsSection'
import SiteHeader from '../components/site/SiteHeader'
import './adkins.css'
import './more.css'

const PAIN_POINTS = [
  { title: 'Feeling Overwhelmed as a Beginner', body: "Posture, bow hold, finger placement, intonation, tuning — all at once. Without clear guidance it's easy to feel lost.", solution: 'We break it down step by step. One thing at a time.' },
  { title: 'Scratchy Sound and Off-Pitch Notes', body: "Bow control and finger placement take real time to develop. Many students get discouraged before it clicks.", solution: 'We build clean tone and accurate pitch systematically — no shortcuts, no frustration.' },
  { title: 'Lessons That Lack Engagement', body: 'Dry exercises and method books with no connection to music students enjoy. Motivation fades fast.', solution: 'We connect technique to music students actually want to play.' },
  { title: 'Music Theory and Note Reading', body: "Violinists learn treble clef, fingerboard geography, and rhythm simultaneously. Without a clear method it feels impossible.", solution: 'We teach theory in context through real music so it actually sticks.' },
  { title: 'No Clear Path or Milestones', body: "Without structure and goals, progress feels invisible even when it's happening.", solution: 'Every lesson has a goal. Every month shows measurable progress.' },
  { title: 'Fear of Playing in Front of Others', body: "Many students love violin but freeze up when asked to perform. Confidence doesn't come from more practice — it comes from the right environment.", solution: "We build performance confidence gradually so students are ready when it counts." },
]

const FAQS = [
  { q: 'What age can a child start violin lessons?', a: "Most children can begin violin lessons around age 5 or 6. We start with the fundamentals — proper posture, bow hold, and basic finger placement — in a patient, encouraging one-on-one setting. We've successfully started students as young as 4 with parent involvement." },
  { q: 'Do I need to rent or buy a violin first?', a: "Not before your first lesson. After your initial session, we'll help you find the right size and quality for your level and budget. We can recommend trusted local shops and rental programs. Many of our students start with a rental and upgrade later." },
  { q: 'How much do violin lessons cost?', a: "Sessions are billed in 30-minute increments and sold in prepaid monthly packages. The total varies depending on how many students you're enrolling and how many instruments. Fill out the form and we'll walk you through all the options — no pressure, no surprises.", link: true },
  { q: 'Can adults learn violin or is it too late?', a: "It's never too late. We teach adult beginners every week — people in their 30s, 40s, 60s, and beyond. Adults often progress faster because they're more focused and self-motivated. The key is having the right teacher and the right method." },
  { q: 'Where are your locations?', a: "Four locations across the Omaha metro: Omaha (96th St), Gretna, Bellevue, and Elkhorn. We'll match you to the closest one." },
]

const WHAT_YOU_LEARN = [
  { title: 'Proper Posture & Bow Hold', desc: 'The foundation everything else is built on. We get it right from the start.' },
  { title: 'Intonation & Ear Training', desc: 'No frets means your ear does the work. We train it deliberately.' },
  { title: 'Music Reading & Theory', desc: 'Treble clef, key signatures, rhythm — learned through real music, not worksheets.' },
  { title: 'Vibrato & Shifting', desc: 'Advanced techniques introduced at the right time with proper preparation.' },
  { title: 'Performance Skills', desc: 'From recitals to auditions, we prepare students to play with confidence.' },
  { title: 'Repertoire You Love', desc: 'Classical, fiddle, pop, film scores — we teach what inspires you.' },
]

export default function ViolinLessonsLanding() {
  const siteLoc = useSiteLocation()
  const navigate = useNavigate()
  const { pathname } = useRouterLocation()
  const loc = siteLoc.key as LocKey
  const LD = LOCATIONS[loc]
  const locStats = useLocationStats(loc)
  const currentInstrument = pathname.split('/')[2] || 'violin-lessons'

  useEffect(() => {
    document.title = `Violin Lessons in ${LD.name}, NE | Private Instruction for All Ages — Adkins Music`
    document.querySelector('meta[name="description"]')?.setAttribute('content',
      `Private violin lessons in ${LD.name}, NE for kids and adults. Expert background-checked instructors, flexible scheduling, no contracts. Classical, fiddle, and contemporary styles. Call ${LD.phone} or sign up online.`)
  }, [loc])

  useEffect(() => {
    setLocColors({ '--c': LD.accentColor, '--cg': LD.accentGlow, '--cl': LD.accentLight, '--loc-color': LD.accentColor })
  }, [loc])

  const otherLocs = (Object.keys(LOCATIONS) as LocKey[]).filter(k => k !== loc)
  const signupUrl = `/${loc}/signup`

  return (
    <div style={{ background: '#0D0D14', color: '#F0EEF8', minHeight: '100vh', fontFamily: "'Barlow', sans-serif" }}>
      <SiteHeader activeInstrument={currentInstrument} />

      {/* ═══════════════════════════════════════ */}
      {/* 1. HERO                                */}
      {/* ═══════════════════════════════════════ */}
      <section className="ak-hero" style={{ textAlign: 'center', flexDirection: 'column' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: LD.accentColor, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 }}>
            {LD.name}, Nebraska
          </p>
          <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(48px, 9vw, 88px)', color: '#fff', lineHeight: 0.92, letterSpacing: '1px', marginBottom: 0 }}>
            VIOLIN LESSONS
          </h1>
          <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(28px, 5vw, 48px)', color: LD.accentColor, lineHeight: 1, letterSpacing: '1px', marginBottom: 20 }}>
            FOR ALL AGES & LEVELS.
          </h2>
          <p style={{ fontSize: 17, color: '#ccc', fontWeight: 600, lineHeight: 1.5, marginBottom: 10 }}>
            One-on-one violin instruction from experienced, background-checked teachers.
          </p>
          <p style={{ fontSize: 15, color: '#9A96B4', lineHeight: 1.7, maxWidth: 540, margin: '0 auto 28px' }}>
            Whether you're picking up the bow for the first time or preparing for an audition, our instructors meet you where you are and build real skill — the right way.
          </p>
          <div style={{ position: 'relative', display: 'inline-block', marginBottom: 32 }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 320, height: 90, borderRadius: '50%', background: LD.accentColor, filter: 'blur(40px)', animation: 'glowPulse 3s ease-in-out infinite', opacity: 0.5, pointerEvents: 'none', zIndex: 0 }} />
            <button onClick={() => navigate(signupUrl)} className="ak-btnp" style={{ color: '#fff', background: LD.accentColor, position: 'relative', zIndex: 1, fontSize: 16, padding: '16px 34px' }}>
              Sign Up for Violin Lessons {'\u2192'}
            </button>
          </div>
          {locStats && (
            <div className="ak-stat-row" style={{ marginTop: 12 }}>
              <div className="ak-stat-card"><div className="ak-stat-num">#{locStats.stateRank}</div><div className="ak-stat-lbl">Ranked in Nebraska</div></div>
              <div className="ak-stat-card"><div className="ak-stat-num">{locStats.studentsEnrolled.toLocaleString()}+</div><div className="ak-stat-lbl">Enrolled</div></div>
              <div className="ak-stat-card"><div className="ak-stat-num">{locStats.studentsTaughtTotal.toLocaleString()}+</div><div className="ak-stat-lbl">Taught Overall</div></div>
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════ */}
      {/* 2. PAIN POINTS                         */}
      {/* ═══════════════════════════════════════ */}
      <section className="ak-sec" style={{ background: '#0A0A10', borderTop: '1px solid #1C1C2A', borderBottom: '1px solid #1C1C2A' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Common Challenges</div>
          <h2 className="ak-stitle">SOUND <em>FAMILIAR?</em></h2>
          <p className="ak-secdesc">Every violinist hits these walls. Here's how we help you break through.</p>
        </div>

        <div className="mr-pain-desktop">
          <div className="mr-pain-grid">
            {PAIN_POINTS.map((p, i) => (
              <div className="mr-pain-card" key={i}>
                <h4>{p.title}</h4>
                <p>{p.body}</p>
                <div className="mr-sol">{p.solution}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mr-pain-mobile">
          <div className="mr-pain-carousel">
            {PAIN_POINTS.map((p, i) => (
              <div className="mr-pain-card" key={i}>
                <h4>{p.title}</h4>
                <p>{p.body}</p>
                <div className="mr-sol">{p.solution}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: '#444', textAlign: 'center', marginTop: 8 }}>{'\u2190'} Swipe to explore {'\u2192'}</div>
        </div>
      </section>

      {/* ═══════════════════════════════════════ */}
      {/* 3. WHAT YOU'LL LEARN                   */}
      {/* ═══════════════════════════════════════ */}
      <section className="ak-sec">
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Curriculum</div>
          <h2 className="ak-stitle">WHAT YOU'LL <em>LEARN.</em></h2>
          <p className="ak-secdesc">Structured, progressive violin instruction built around real results.</p>
        </div>

        <div className="mr-band-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {WHAT_YOU_LEARN.map((item, i) => (
            <div className="mr-band-card" key={i}>
              <h4 style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 8 }}>{item.title}</h4>
              <p>{item.desc}</p>
            </div>
          ))}
        </div>

        <div style={{ maxWidth: 680, margin: '36px auto 0', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: '#9A96B4', lineHeight: 1.75 }}>
            At Adkins Music Lessons in {LD.name}, our violin instruction covers classical technique, contemporary styles, fiddle, and more. Whether your goal is orchestra, recitals, school auditions, or playing for fun — we build the skills that matter. Private lessons mean every minute is focused on your progress.
          </p>
        </div>

        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 280, height: 80, borderRadius: '50%', background: LD.accentColor, filter: 'blur(40px)', animation: 'glowPulse 3.2s ease-in-out infinite', opacity: 0.45, pointerEvents: 'none', zIndex: 0 }} />
            <button onClick={() => navigate(signupUrl)} className="ak-btnp" style={{ color: '#fff', background: LD.accentColor, position: 'relative', zIndex: 1 }}>
              Start Violin Lessons {'\u2192'}
            </button>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════ */}
      {/* 4. WHY ADKINS                          */}
      {/* ═══════════════════════════════════════ */}
      <section className="ak-sec" style={{ background: '#0A0A10', borderTop: '1px solid #1C1C2A', borderBottom: '1px solid #1C1C2A' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Why Families Choose Us</div>
          <h2 className="ak-stitle">THE ADKINS <em>DIFFERENCE.</em></h2>
        </div>

        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          {[
            { title: 'Background-Checked Instructors', desc: `Every violin teacher at our ${LD.name} studio passes a thorough background check. Cameras in every room. Your child's safety is non-negotiable.` },
            { title: 'Flexible Scheduling', desc: 'Afternoon, evening, and weekend slots available. We work around your family\'s schedule, not the other way around.' },
            { title: 'No Long-Term Contracts', desc: 'Month-to-month lessons. Stay because you love it, not because you\'re locked in.' },
            { title: 'Real Progress Tracking', desc: 'Parents get regular updates on their child\'s development. You\'ll see the improvement — not just hear about it.' },
          ].map((item, i) => (
            <div key={i} style={{ padding: '20px 0', borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <h4 style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 6 }}>{item.title}</h4>
              <p style={{ fontSize: 14, color: '#9A96B4', lineHeight: 1.7, margin: 0 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════ */}
      {/* 5. REVIEWS                             */}
      {/* ═══════════════════════════════════════ */}
      <ReviewsSection instrumentTag="general" />

      {/* ═══════════════════════════════════════ */}
      {/* 6. FAQ                                 */}
      {/* ═══════════════════════════════════════ */}
      <section className="ak-sec">
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Questions</div>
          <h2 className="ak-stitle">FREQUENTLY <em>ASKED.</em></h2>
        </div>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          {FAQS.map((f, i) => (
            <details key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '18px 0' }}>
              <summary style={{ fontSize: 15, fontWeight: 700, color: '#fff', cursor: 'pointer', listStyle: 'none' }}>
                {f.q}
              </summary>
              <p style={{ fontSize: 14, color: '#9A96B4', lineHeight: 1.7, marginTop: 10 }}>
                {f.a}
                {f.link && <><br /><br /><button onClick={() => navigate(signupUrl)} style={{ background: 'none', border: 'none', color: LD.accentColor, fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: 14 }}>Get pricing details {'\u2192'}</button></>}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════ */}
      {/* 7. HOW IT WORKS — 3 STEPS              */}
      {/* ═══════════════════════════════════════ */}
      <section className="ak-steps-sec">
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Ridiculously Simple</div>
          <h2 className="ak-stitle">3 Steps. <em>That's It.</em></h2>
        </div>
        <div className="ak-sgrid">
          {[
            { n: 1, title: 'Fill Out the Form', desc: 'Tell us your schedule, goals, and preferred location.' },
            { n: 2, title: 'We Find Your Teacher', desc: "We match you on fit — not just who's available. You'll hear back within 24 hours." },
            { n: 3, title: 'Book Your First Session', desc: "Pick your time and you're in. No waitlists. No weird onboarding. Just music." },
          ].map(s => (
            <div className="ak-scard" key={s.n}>
              <div className="ak-snum2">{s.n}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 36 }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 280, height: 80, borderRadius: '50%', background: 'var(--c)', filter: 'blur(40px)', animation: 'glowPulse 3.2s ease-in-out infinite', opacity: 0.45, pointerEvents: 'none', zIndex: 0 }} />
            <button onClick={() => navigate(signupUrl)} className="ak-btnp" style={{ color: '#fff', background: LD.accentColor, position: 'relative', zIndex: 1 }}>
              Sign Up Now {'\u2192'}
            </button>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════ */}
      {/* 8. FINAL CTA                           */}
      {/* ═══════════════════════════════════════ */}
      <section className="ak-final-sec">
        <h2>YOUR VIOLIN TEACHER IS <span style={{ color: LD.accentColor }}>WAITING</span>.</h2>
        <p>One form. We'll take it from there.</p>
        <div className="ak-fbtns">
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 380, height: 100, borderRadius: '50%', background: 'var(--c)', filter: 'blur(40px)', animation: 'glowPulse 3s ease-in-out infinite', opacity: 0.55, pointerEvents: 'none', zIndex: 0 }} />
            <button onClick={() => navigate(signupUrl)} className="ak-btnp" style={{ fontSize: 16, padding: '16px 34px', color: '#fff', background: LD.accentColor, position: 'relative', zIndex: 1 }}>
              Get Started with Violin {'\u2192'}
            </button>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════ */}
      {/* 9. LOCATION MAP                        */}
      {/* ═══════════════════════════════════════ */}
      <section className="ak-loc-sec" id="location-section">
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Visit Us</div>
          <h2 className="ak-stitle">{LD.fullName}</h2>
        </div>
        <div className="ak-loc-grid">
          <div className="ak-loc-info">
            <div className="ak-loc-row">
              <span className="ak-loc-icon">{'\uD83D\uDCCD'}</span>
              <div>
                <div className="ak-loc-label">Address</div>
                <div className="ak-loc-value">{LD.address}</div>
              </div>
            </div>
            <div className="ak-loc-row">
              <span className="ak-loc-icon">{'\uD83D\uDCDE'}</span>
              <div>
                <div className="ak-loc-label">Phone</div>
                <a className="ak-loc-value ak-loc-link" href={`tel:${LD.phone.replace(/\D/g, '')}`}>{LD.phone}</a>
              </div>
            </div>
            <div className="ak-loc-row">
              <span className="ak-loc-icon">{'\u2709\uFE0F'}</span>
              <div>
                <div className="ak-loc-label">Email</div>
                <a className="ak-loc-value ak-loc-link" href={`mailto:${LD.email}`}>{LD.email}</a>
              </div>
            </div>
            <div className="ak-loc-row">
              <span className="ak-loc-icon">{'\uD83D\uDD52'}</span>
              <div>
                <div className="ak-loc-label">Hours</div>
                <div className="ak-loc-value">Mon – Thu: 3:00 – 9:00 PM</div>
                <div className="ak-loc-value">Sat – Sun: 10:00 AM – 3:00 PM</div>
              </div>
            </div>
            <a
              className="ak-btnp ak-loc-dir"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(LD.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#ffffff' }}
            >
              Get Directions {'\u2192'}
            </a>
          </div>
          <div className="ak-loc-map">
            <iframe
              key={loc}
              title={`Map — ${LD.fullName}`}
              src={`https://maps.google.com/maps?q=${encodeURIComponent(LD.address)}&output=embed`}
              width="100%"
              height="100%"
              style={{ border: 0, borderRadius: 14 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
          {otherLocs.map(k => (
            <button
              key={k}
              onClick={() => navigate(`/${k}/violin-lessons`)}
              style={{
                display: 'inline-block',
                padding: '8px 20px',
                borderRadius: 20,
                border: `2px solid ${LOCATIONS[k].accentColor}`,
                color: LOCATIONS[k].accentColor,
                background: 'transparent',
                fontFamily: "'Barlow', sans-serif",
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Violin in {LOCATIONS[k].name} {'\u2192'}
            </button>
          ))}
        </div>
      </section>

      <footer className="ak-footer">
        <div className="ak-fname">{LD.fullName.toUpperCase()}</div>
        <div style={{ fontSize: 11, color: '#55516E', marginBottom: 8 }}>By Adkins Music Lessons</div>
        <div className="ak-fpow">Powered by <span>Lessonpreneur</span></div>
      </footer>
    </div>
  )
}
