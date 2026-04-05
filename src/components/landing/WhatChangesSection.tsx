import { Zap, CreditCard, Calendar, Users, Bell } from 'lucide-react'
import { COLORS, FONT, GlassCard, sectionStyle } from './shared'
import Reveal from './Reveal'

const CARDS = [
  {
    title: 'Leads Follow Themselves Up',
    body: 'The moment a lead comes in, LP sends a text automatically. No one has to remember. No manual step. The lead gets a response in seconds — and you find out after it\'s already handled. You stop losing families to faster schools.',
    Icon: Zap,
  },
  {
    title: 'Billing You Actually Understand',
    body: "Every student's rate, payment status, and upcoming charges in one place. No reconciling Square exports. No guessing. No 'I'll figure it out later.' You know exactly what's coming in. Every month. At a glance.",
    Icon: CreditCard,
  },
  {
    title: 'A Schedule That Actually Works',
    body: 'Availability, open slots, teacher assignments, and makeups — all connected, all in one place. You stop being the person who holds all of that in their head. The schedule runs. You supervise.',
    Icon: Calendar,
  },
  {
    title: "Teachers Who Don't Need You in Every Text",
    body: 'Teachers see their schedules, manage their own availability, and stay coordinated without you being the relay. You stop fielding messages that the system should be handling.',
    Icon: Users,
  },
  {
    title: 'Parents Who Hear From You Without You Doing Anything',
    body: 'Reminders go out automatically. Makeup requests have a process. Parents stop texting your personal number because they have a real communication channel. You stop being on call at 9pm.',
    Icon: Bell,
  },
  {
    title: 'Your Morning Briefing in 60 Seconds',
    body: "Every morning, Star — LP's AI assistant — gives you a snapshot of your school: who's at risk of dropping, which leads need attention, revenue trends, and what actually requires you today. From your phone. Before your coffee is cold.",
    Icon: null,
  },
]

export default function WhatChangesSection() {
  return (
    <section className="lp-section" style={sectionStyle}>
      <h2
        className="lp-h2"
        style={{
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: '36px',
          lineHeight: 1.2,
          color: COLORS.textPrimary,
          margin: 0,
        }}
      >
        Here's what running a school on LP <span style={{ color: COLORS.pink }}>actually</span> looks like.
      </h2>

      <div
        className="lp-grid-2"
        style={{
          marginTop: '40px',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '20px',
        }}
      >
        {CARDS.map((card, idx) => (
          <Reveal key={card.title} delay={idx * 100}>
          <GlassCard accent>
            {idx === 5 ? (
              <img
                src="/lp-logo.png"
                alt="Lessonpreneur"
                style={{ width: '40px', height: '40px', objectFit: 'contain' }}
              />
            ) : (
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  background: 'rgba(212,34,106,0.10)',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {card.Icon && <card.Icon size={22} color="#D4226A" />}
              </div>
            )}
            <h3
              style={{
                fontFamily: FONT,
                fontWeight: 800,
                fontSize: '18px',
                color: COLORS.textPrimary,
                marginTop: '16px',
                marginBottom: 0,
              }}
            >
              {card.title}
            </h3>
            <p
              style={{
                fontFamily: FONT,
                fontSize: '16px',
                lineHeight: 1.6,
                color: 'rgba(255,255,255,0.70)',
                marginTop: '8px',
                marginBottom: 0,
              }}
            >
              {card.body}
            </p>
          </GlassCard>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
