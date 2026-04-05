import AtmosphericBackground from '../components/landing/AtmosphericBackground'
import FoldSection from '../components/landing/FoldSection'
import WhoItsForSection from '../components/landing/WhoItsForSection'
import ChaosStackSection from '../components/landing/ChaosStackSection'
import WhatChangesSection from '../components/landing/WhatChangesSection'
import BuiltInRealSchoolsSection from '../components/landing/BuiltInRealSchoolsSection'
import ProofSection from '../components/landing/ProofSection'
import OfferSection from '../components/landing/OfferSection'
import FAQSection from '../components/landing/FAQSection'
import FinalCTASection from '../components/landing/FinalCTASection'
import { COLORS, FONT, mobileSectionCss } from '../components/landing/shared'

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
          padding: '24px 32px',
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
        <WhoItsForSection />
        <ChaosStackSection />
        <WhatChangesSection />
        <BuiltInRealSchoolsSection />
        <ProofSection />
        <OfferSection />
        <FAQSection />
        <FinalCTASection />
      </main>
    </div>
  )
}
