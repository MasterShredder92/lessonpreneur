import PageGuide, { type GuideStep } from '../shared/PageGuide'
import { usePermissions } from '../../hooks/usePermissions'

const STEPS: GuideStep[] = [
  {
    id: 'happening-today',
    targetSelector: '[data-tour-id="happening-today"]',
    title: 'Things Happening Today',
    body: "This feed shows every family call-out the moment it happens. When a parent cancels through the app, it appears here instantly. Tap the ✓ checkmark on each one to acknowledge it — this tells the system you've seen it and clears it from the feed. You must clear these before you can close out your day.",
  },
  {
    id: 'location-grid',
    targetSelector: '[data-tour-id="dash-location-grid"]',
    title: 'Your Location at a Glance',
    body: "These cards show a live snapshot of each studio — active students, open slots, and utilization. Your location card is fully interactive. The other locations are visible so you have context, but you can only click into your own studio.",
  },
  {
    id: 'active-students',
    targetSelector: '[data-tour-id="active-students-metric"]',
    title: 'Active Students',
    body: "This is your current enrolled headcount at your studio. It updates automatically when students are added or deactivated. This is the number that drives your location's revenue — every open slot is a potential student.",
  },
  {
    id: 'schedule-utilization',
    targetSelector: '[data-tour-id="schedule-utilization"]',
    title: 'Schedule Utilization',
    body: "This tells you what percentage of your available teaching slots are filled with students. A healthy studio runs at 80% or higher. If this number is low, you have open slots to fill — that's where leads become students.",
  },
  {
    id: 'open-slots',
    targetSelector: '[data-tour-id="open-slots"]',
    title: 'Open Slots',
    body: "Every open slot is revenue sitting on the table. This number shows how many teaching blocks at your studio are available right now. Use this when talking to leads — 'We have 3 openings this week' creates urgency.",
  },
  {
    id: 'whats-important',
    targetSelector: '[data-tour-id="whats-important"]',
    title: 'What Needs Your Attention',
    body: "This section surfaces the most important things right now — unsigned agreements, overdue follow-ups, missing session notes, or students flagged as at-risk. Work through these daily so nothing falls through the cracks.",
  },
  {
    id: 'closeout',
    targetSelector: '[data-tour-id="closeout-btn"]',
    title: 'Your Daily Closeout',
    body: "At the end of each day, tap this to close out. Before it lets you through, it checks that all family call-outs are acknowledged and all your teacher recaps are logged. This creates an accountability record and logs the time you wrapped up. Make it your last tap of every studio day.",
    tooltipAbove: true,
  },
  {
    id: 'report-issue',
    targetSelector: '[data-tour-id="report-issue-btn"]',
    title: 'See Something Off?',
    body: "If anything looks wrong, broken, or confusing on any page — tap here. Choose the page, describe what's happening, and submit. It goes directly to the owner so it can get fixed fast. Don't ignore bugs — report them.",
  },
]

export default function DashboardPageGuide() {
  const { isStudioDirector } = usePermissions()
  return (
    <PageGuide
      steps={STEPS}
      enabled={isStudioDirector}
      completionMessage="Dashboard guide complete. Tap 📖 Guide anytime to replay."
    />
  )
}
