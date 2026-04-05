import AtmosphericBackground from '../components/landing/AtmosphericBackground'
import FoldSection from '../components/landing/FoldSection'
import WhoItsForSection from '../components/landing/WhoItsForSection'
import ChaosStackSection from '../components/landing/ChaosStackSection'
import RevenueLeakSection from '../components/landing/RevenueLeakSection'
import WhatChangesSection from '../components/landing/WhatChangesSection'
import BuiltInRealSchoolsSection from '../components/landing/BuiltInRealSchoolsSection'
import DeviceMockupSection from '../components/landing/DeviceMockupSection'
import ProofSection from '../components/landing/ProofSection'
import LogoHubSection from '../components/landing/LogoHubSection'
import OfferSection from '../components/landing/OfferSection'
import FAQSection from '../components/landing/FAQSection'
import FinalCTASection from '../components/landing/FinalCTASection'
import Reveal from '../components/landing/Reveal'
import { COLORS, FONT, mobileSectionCss } from '../components/landing/shared'
import StopTheBleedingBar from '../components/landing/StopTheBleedingBar'
import InlineTestimonial from '../components/landing/InlineTestimonial'

export default function LandingPage() {
  return (
    <div
      style={{
        background: COLORS.bg,
        minHeight: '100vh',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: FONT,
      }}
    >
      <style>{mobileSectionCss}</style>
      <AtmosphericBackground />

      {/* Wordmark */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          padding: '20px',
        }}
      >
        <span
          style={{
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: '20px',
            color: COLORS.pink,
          }}
        >
          lessonpreneur
        </span>
      </div>

      <main style={{ position: 'relative', zIndex: 1 }}>
        <FoldSection />
        <Reveal><WhoItsForSection /></Reveal>
        <Reveal><ChaosStackSection /></Reveal>
        <InlineTestimonial
          quote="I built Lessonpreneur from the pressure of holding a real music school together and refusing to believe chaos was the only way."
          name="Zachary Adkins"
          descriptor="Founder, Lessonpreneur · Owner, Adkins Music Lessons"
          align="left"
        />
        <Reveal><RevenueLeakSection /></Reveal>
        <Reveal><WhatChangesSection /></Reveal>
        <Reveal><DeviceMockupSection /></Reveal>
        <InlineTestimonial
          quote="It literally moved me to tears. We were using a standard POS system that just wasn't built for the unique rhythm of a music school. This has been a complete game changer — I have more time with parents and students and less time behind a computer screen."
          name="Andrea Redman"
          descriptor="Studio Director, Adkins Music Lessons"
          align="right"
        />
        <Reveal><BuiltInRealSchoolsSection /></Reveal>
        <Reveal><ProofSection /></Reveal>
        <Reveal><LogoHubSection /></Reveal>
        <InlineTestimonial
          quote="I don't run a music school or a business of any kind. But that tally at the bottom freaks me the f*** out."
          name="Anonymous"
          descriptor="Not a music school owner — just someone who stumbled onto this page"
          align="center"
        />
        <p
          style={{
            fontSize: '13px',
            color: 'rgba(255,255,255,0.35)',
            fontStyle: 'italic',
            textAlign: 'center',
            marginTop: '8px',
            marginBottom: 0,
          }}
        >
          Imagine what it does to someone who actually runs a studio.
        </p>
        <Reveal><OfferSection /></Reveal>
        <Reveal><FAQSection /></Reveal>
        <Reveal><FinalCTASection /></Reveal>
      </main>
      <StopTheBleedingBar />
    </div>
  )
}
