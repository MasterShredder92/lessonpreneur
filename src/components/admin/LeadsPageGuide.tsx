import PageGuide, { type GuideStep } from '../shared/PageGuide'
import { usePermissions } from '../../hooks/usePermissions'

const STEPS: GuideStep[] = [
  {
    id: 'leads-list',
    targetSelector: '[data-guide-id="leads-list"]',
    title: 'The Lead Engine',
    body: "Every inquiry that comes through your studio's website lands here automatically. A lead is a potential student — someone who raised their hand and said 'I'm interested.' Your job is to follow up fast. Speed is everything in enrollment. The first studio to respond usually wins the student.",
  },
  {
    id: 'leads-stages',
    targetSelector: '[data-guide-id="leads-stages"]',
    title: 'Lead Stages',
    body: "Every lead moves through stages: Inquiry → Contacted → Scheduled → Enrolled → Lost. Move them forward as you make progress. This tells you and the owner exactly where every potential student stands at any moment.",
  },
  {
    id: 'leads-first-card',
    targetSelector: '[data-guide-id="leads-first-card"]',
    title: 'Reading a Lead',
    body: "Each card shows the student's name, instrument interest, how they found you, and when they came in. The age matters — it affects which teacher is the right fit. Tap the card to open the full lead record.",
    interactivePrompt: 'Tap this lead to open the full record →',
  },
  {
    id: 'lead-contact',
    targetSelector: '[data-guide-id="lead-contact"]',
    title: 'Parent Contact',
    body: "Phone and email are here. Text is almost always better than a call for first contact. Parents are busy — a text they can respond to on their own time converts better than a voicemail they'll never return.",
  },
  {
    id: 'lead-sms',
    targetSelector: '[data-guide-id="lead-sms"]',
    title: 'Text the Lead Directly',
    body: "Tap the phone number to send a text message directly from the platform. The message comes from your studio's number via QUO. Keep the first message short and warm — introduce yourself, confirm their interest, and ask when they're available. Don't pitch. Just connect.",
  },
  {
    id: 'lead-stage-controls',
    targetSelector: '[data-guide-id="lead-stage-controls"]',
    title: 'Moving the Lead Forward',
    body: "After you make contact, update the stage to Contacted. After you book a meet and greet, update to Scheduled. After they enroll, mark Enrolled. Never leave a lead stuck in Inquiry — move it or mark it Lost with a reason so the data stays clean.",
    tooltipAbove: true,
  },
  {
    id: 'lead-notes',
    targetSelector: '[data-guide-id="lead-notes"]',
    title: 'Log Your Follow-Up',
    body: "Every time you talk to or text a lead, add a note. What did they say? What instrument? What time slot works? What's holding them back? These notes create a conversation history so you never lose context — even if someone else follows up later.",
  },
  {
    id: 'lead-convert',
    targetSelector: '[data-guide-id="lead-convert"]',
    title: 'Converting a Lead',
    body: "When a lead is ready to enroll, tap Enroll. This creates their student and family record, links their instrument and teacher preference, and moves them into the active roster. The lead record stays for history. This is the finish line — every lead should be working toward this.",
    tooltipAbove: true,
  },
  {
    id: 'lead-add-new',
    targetSelector: '[data-guide-id="lead-add-new"]',
    title: 'Adding a Lead Manually',
    body: "If someone calls instead of using the website form, add them manually here. Don't rely on memory — log every inquiry immediately. A lead not in the system is a lead you'll forget to follow up on.",
  },
]

export default function LeadsPageGuide() {
  const { isStudioDirector } = usePermissions()
  return (
    <PageGuide
      steps={STEPS}
      enabled={isStudioDirector}
      completionMessage="Leads guide complete. Tap 📖 Guide anytime to replay."
    />
  )
}
