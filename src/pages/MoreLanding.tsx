import { useEffect } from 'react'
import { useNavigate, useLocation as useRouterLocation } from 'react-router-dom'
import { LOCATIONS, type LocKey } from '../config/locations'
import { useSiteLocation } from '../hooks/useSiteLocation'
import { useLandingSEO, buildInstrumentJsonLd } from '../hooks/useLandingSEO'
import { setLocColors } from '../lib/setLocColors'
import { useLocationStats } from '../hooks/useLocationStats'
import ReviewsSection from '../components/site/ReviewsSection'
import SiteHeader from '../components/site/SiteHeader'
import './adkins.css'
import './more.css'

// LOC_RANKINGS removed — now pulled live from Supabase via useLocationStats

const VIOLIN_PAIN_POINTS = [
  { title: 'Feeling Overwhelmed as a Beginner', body: "Posture, bow hold, finger placement, intonation, tuning — all at once. Without clear guidance it's easy to feel lost.", solution: 'We break it down step by step. One thing at a time.' },
  { title: 'Lessons That Lack Engagement', body: 'Dry exercises and method books with no connection to music students enjoy. Motivation fades fast.', solution: 'We connect technique to music students actually want to play.' },
  { title: 'Scratchy Sound and Off-Pitch Notes', body: "Bow control and finger placement take real time to develop. Many students get discouraged before it clicks.", solution: 'We build clean tone and accurate pitch systematically — no shortcuts, no frustration.' },
  { title: 'Music Theory and Note Reading', body: "Violinists learn treble clef, fingerboard geography, and rhythm simultaneously. Without a clear method it feels impossible.", solution: 'We teach theory in context through real music so it actually sticks.' },
  { title: 'No Clear Path or Milestones', body: "Without structure and goals, progress feels invisible even when it's happening.", solution: 'Every lesson has a goal. Every month shows measurable progress.' },
]

export default function MoreLanding() {
  const siteLoc = useSiteLocation()
  const navigate = useNavigate()
  const { pathname } = useRouterLocation()
  const loc = siteLoc.key as LocKey
  const LD = LOCATIONS[loc]
  const locStats = useLocationStats(loc)
  const currentInstrument = pathname.split('/')[2] || 'more'

  useLandingSEO({
    loc,
    title: `More Instrument Lessons in ${LD.name}, NE | Violin, Band, Bass — Adkins Music Lessons`,
    description: `Private lessons for violin, brass, woodwinds, bass guitar and more in ${LD.name}, NE. Expert teachers, flexible scheduling, no contracts. ${LD.phone}`,
    path: `/${loc}/more`,
    jsonLd: buildInstrumentJsonLd(loc, 'More Instruments', 'more', 'Private one-on-one lessons for violin, bass guitar, flute, brass, woodwinds, and more.'),
  })

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
          <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(52px, 10vw, 96px)', color: '#fff', lineHeight: 0.92, letterSpacing: '1px', marginBottom: 0 }}>
            MORE INSTRUMENTS.
            <span style={{ display: 'block', color: LD.accentColor, marginTop: 0, marginBottom: 20 }}>ONE SCHOOL.</span>
          </h1>
          <p style={{ fontSize: 17, color: '#ccc', fontWeight: 600, lineHeight: 1.5, marginBottom: 10 }}>
            From violin to brass to bass — if you want to learn it, we probably teach it.
          </p>
          <p style={{ fontSize: 15, color: '#9A96B4', lineHeight: 1.7, maxWidth: 540, margin: '0 auto 28px' }}>
            Private one-on-one sessions for ages 5 to adult. 4 metro locations. Sign up and get started.
          </p>
          <div style={{ position: 'relative', display: 'inline-block', marginBottom: 32 }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 320, height: 90, borderRadius: '50%', background: LD.accentColor, filter: 'blur(40px)', animation: 'glowPulse 3s ease-in-out infinite', opacity: 0.5, pointerEvents: 'none', zIndex: 0 }} />
            <button onClick={() => navigate(signupUrl)} className="ak-btnp" style={{ color: '#fff', background: LD.accentColor, position: 'relative', zIndex: 1, fontSize: 16, padding: '16px 34px' }}>
              Sign Up Now {'\u2192'}
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
      {/* 2. AVAILABILITY CALLOUT                */}
      {/* ═══════════════════════════════════════ */}
      <section className="ak-sec" style={{ paddingTop: 0, paddingBottom: 48 }}>
        <div className="mr-callout">
          <div className="mr-callout-icon">{'\uD83D\uDCCD'}</div>
          <p>Availability varies by location. Sign up and we'll confirm exactly what's available near you — no guesswork, no runaround.</p>
          <button
            onClick={() => navigate(signupUrl)}
            style={{
              background: 'transparent',
              border: `2px solid ${LD.accentColor}`,
              color: LD.accentColor,
              padding: '10px 22px',
              borderRadius: 100,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Sign Up Now {'\u2192'}
          </button>
        </div>
      </section>

      {/* ═══════════════════════════════════════ */}
      {/* 3. VIOLIN SECTION                      */}
      {/* ═══════════════════════════════════════ */}
      <section className="ak-sec" style={{ background: '#0A0A10', borderTop: '1px solid #1C1C2A', borderBottom: '1px solid #1C1C2A' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Most Popular</div>
          <h2 className="ak-stitle">{'\uD83C\uDFBB'} VIOLIN <em>LESSONS.</em></h2>
          <p className="ak-secdesc">The most requested instrument outside the Core Four.</p>
        </div>

        {/* Desktop — 2-col grid */}
        <div className="mr-pain-desktop">
          <div className="mr-pain-grid">
            {VIOLIN_PAIN_POINTS.map((p, i) => (
              <div className="mr-pain-card" key={i} style={i === 4 ? { gridColumn: '1 / -1', maxWidth: 360, margin: '0 auto', width: '100%' } : undefined}>
                <h4>{p.title}</h4>
                <p>{p.body}</p>
                <div className="mr-sol">{p.solution}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Mobile — swipable carousel */}
        <div className="mr-pain-mobile">
          <div className="mr-pain-carousel">
            {VIOLIN_PAIN_POINTS.map((p, i) => (
              <div className="mr-pain-card" key={i}>
                <h4>{p.title}</h4>
                <p>{p.body}</p>
                <div className="mr-sol">{p.solution}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: '#444', textAlign: 'center', marginTop: 8 }}>{'\u2190'} Swipe to explore {'\u2192'}</div>
        </div>

        <div style={{ maxWidth: 680, margin: '36px auto 0', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: '#9A96B4', lineHeight: 1.75 }}>
            At Adkins Music Lessons, our violin instruction is built around proper technique, clear structure, and real progress at every stage. One-on-one lessons with experienced instructors who work with beginners through advanced players. Students build posture, bow control, intonation, and confidence — the right way from the start.
          </p>
        </div>

        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 280, height: 80, borderRadius: '50%', background: LD.accentColor, filter: 'blur(40px)', animation: 'glowPulse 3.2s ease-in-out infinite', opacity: 0.45, pointerEvents: 'none', zIndex: 0 }} />
            <button onClick={() => navigate(signupUrl)} className="ak-btnp" style={{ color: '#fff', background: LD.accentColor, position: 'relative', zIndex: 1 }}>
              Sign Up Now {'\u2192'}
            </button>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════ */}
      {/* 4. BAND INSTRUMENTS SECTION            */}
      {/* ═══════════════════════════════════════ */}
      <section className="ak-sec">
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">School Band & Beyond</div>
          <h2 className="ak-stitle">BAND <em>INSTRUMENTS.</em></h2>
          <p className="ak-secdesc">Brass, woodwinds, percussion, and more.</p>
        </div>

        <div style={{ maxWidth: 680, margin: '0 auto', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: '#9A96B4', lineHeight: 1.75, marginBottom: 32 }}>
            Our band instrument instruction supports school band students and beginners alike. One-on-one lessons mean focused attention on tone production, embouchure, breathing, fingerings, rhythm, and music reading — areas group band class simply doesn't have time to cover.
          </p>
        </div>

        <div className="mr-band-grid">
          <div className="mr-band-card">
            <div className="mr-band-emoji">{'\uD83C\uDFBA'}</div>
            <h4>Brass</h4>
            <p>Trumpet, trombone, French horn, tuba. Build real tone, technique, and confidence for school band and beyond.</p>
          </div>
          <div className="mr-band-card">
            <div className="mr-band-emoji">{'\uD83C\uDFB7'}</div>
            <h4>Woodwinds</h4>
            <p>Flute, clarinet, saxophone, oboe. Proper embouchure, breath control, and finger technique from day one.</p>
          </div>
          <div className="mr-band-card">
            <div className="mr-band-emoji">{'\uD83E\uDD41'}</div>
            <h4>Percussion</h4>
            <p>Snare, mallets, full kit, and concert percussion. Perfect for school band students who want to get ahead.</p>
          </div>
        </div>

        <div style={{ maxWidth: 680, margin: '28px auto 0', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: '#9A96B4', lineHeight: 1.75 }}>
            Our instructors understand what schools expect — chair placements, auditions, honor bands, and competitions. Whether you're a beginner or advancing player, we build the fundamentals that make you stand out.
          </p>
        </div>

        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 280, height: 80, borderRadius: '50%', background: LD.accentColor, filter: 'blur(40px)', animation: 'glowPulse 3.2s ease-in-out infinite', opacity: 0.45, pointerEvents: 'none', zIndex: 0 }} />
            <button onClick={() => navigate(signupUrl)} className="ak-btnp" style={{ color: '#fff', background: LD.accentColor, position: 'relative', zIndex: 1 }}>
              Sign Up Now {'\u2192'}
            </button>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════ */}
      {/* 5. BASS GUITAR SECTION                 */}
      {/* ═══════════════════════════════════════ */}
      <section className="ak-sec" style={{ background: '#0A0A10', borderTop: '1px solid #1C1C2A', borderBottom: '1px solid #1C1C2A' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="ak-slbl">Underrated & In Demand</div>
          <h2 className="ak-stitle">{'\uD83C\uDFB8'} BASS <em>GUITAR.</em></h2>
          <p className="ak-secdesc">The backbone of every band.</p>
        </div>

        <div style={{ maxWidth: 680, margin: '0 auto', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: '#9A96B4', lineHeight: 1.75 }}>
            Bass guitar is one of the most in-demand instruments in any band setting — and one of the most overlooked when it comes to lessons. Our bass instructors teach real technique, groove, theory, and how to lock in with a drummer. Whether you're a complete beginner or a guitarist making the switch, we build players that bands actually want.
          </p>
        </div>

        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 280, height: 80, borderRadius: '50%', background: LD.accentColor, filter: 'blur(40px)', animation: 'glowPulse 3.2s ease-in-out infinite', opacity: 0.45, pointerEvents: 'none', zIndex: 0 }} />
            <button onClick={() => navigate(signupUrl)} className="ak-btnp" style={{ color: '#fff', background: LD.accentColor, position: 'relative', zIndex: 1 }}>
              Sign Up Now {'\u2192'}
            </button>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════ */}
      {/* 6. REVIEWS                             */}
      {/* ═══════════════════════════════════════ */}
      <ReviewsSection instrumentTag="general" />

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
        <h2>YOUR TEACHER IS <span style={{ color: LD.accentColor }}>WAITING</span> FOR YOU.</h2>
        <p>One form. We'll take it from there.</p>
        <div className="ak-fbtns">
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 380, height: 100, borderRadius: '50%', background: 'var(--c)', filter: 'blur(40px)', animation: 'glowPulse 3s ease-in-out infinite', opacity: 0.55, pointerEvents: 'none', zIndex: 0 }} />
            <button onClick={() => navigate(signupUrl)} className="ak-btnp" style={{ fontSize: 16, padding: '16px 34px', color: '#fff', background: LD.accentColor, position: 'relative', zIndex: 1 }}>
              Get Signed Up Now {'\u2192'}
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
              onClick={() => navigate(`/${k}/more`)}
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
              {LOCATIONS[k].name} {'\u2192'}
            </button>
          ))}
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="ak-footer">
        <div className="ak-fname">{LD.fullName.toUpperCase()}</div>
        <div style={{ fontSize: 11, color: '#55516E', marginBottom: 8 }}>By Adkins Music Lessons</div>
        <div className="ak-fpow">Powered by <span>ZiroWork</span></div>
      </footer>
    </div>
  )
}
