import PageGuide, { type GuideStep } from '../shared/PageGuide'
import { usePermissions } from '../../hooks/usePermissions'

const STEPS: GuideStep[] = [
  {
    id: 'billing-header',
    targetSelector: '[data-tour-id="billing-header"]',
    title: 'Billing Overview',
    body: "This page is the financial heartbeat of your studio. It shows what's been collected, what's outstanding, what's overdue, and what's coming next month. You can see all of this and take action on individual families — all scoped to your location only.",
  },
  {
    id: 'billing-hero-cards',
    targetSelector: '[data-tour-id="billing-hero-cards"]',
    title: 'The Numbers at a Glance',
    body: "These cards tell you the health of your billing cycle at a glance: how many families have paid, how many are outstanding, total overdue amount, what's scheduled to bill next, and card-on-file rate. Low card-on-file rate = collection risk. High overdue = follow-up needed now.",
  },
  {
    id: 'billing-card-collected',
    targetSelector: '[data-tour-id="billing-card-collected"]',
    title: 'Families Paid',
    body: "This counts how many families have successfully paid their invoice this cycle. As billing runs and payments process, this number climbs. By mid-month it should be most of your active families.",
  },
  {
    id: 'billing-card-scheduled',
    targetSelector: '[data-tour-id="billing-hero-cards"]',
    title: 'Scheduled Payments',
    body: "Invoices that are scheduled or unpaid for the current month. Some are on autopay and will process shortly. Others need manual follow-up.",
  },
  {
    id: 'billing-overdue',
    targetSelector: '[data-tour-id="billing-overdue-alert"], [data-tour-id="billing-tab-overdue"]',
    title: 'Overdue Balances',
    body: "Families past their payment due date. This is where you need to act. Overdue balances that sit too long become write-offs. A personal text from you as the director resolves most of these faster than an automated reminder.",
  },
  {
    id: 'billing-card-next-month',
    targetSelector: '[data-tour-id="billing-card-nextMonth"]',
    title: "Next Month's Revenue",
    body: "This shows what's already scheduled to bill next cycle based on current active students and their rates. This number should grow as you enroll new students. Watch it weekly — a declining number means you're losing students faster than you're gaining them.",
  },
  {
    id: 'billing-card-discounted',
    targetSelector: '[data-tour-id="billing-card-discounted"]',
    title: 'Card on File Rate',
    body: "The percentage of active families with a payment card stored. Families with a card on file pay automatically — zero collection effort. Families without one require manual invoicing every month. Your goal is to get every active family on autopay.",
  },
  {
    id: 'billing-families-section',
    targetSelector: '[data-tour-id="billing-families-section"]',
    title: 'Per-Student Billing',
    body: "Every active student at your location appears here with their individual monthly rate, session count, and invoice status. This is where you can see if someone's rate looks wrong or if a family has a credit applied.",
  },
  {
    id: 'billing-oneoff-btn',
    targetSelector: '[data-tour-id="billing-oneoff-btn"]',
    title: 'One-Off Invoices',
    body: "Need to charge a family for something outside their regular monthly billing? Use this. Registration fees, materials, or a catch-up payment — create it here and it goes directly to the family. It shows up in their billing history and sends them a notification.",
  },
  {
    id: 'billing-credits-btn',
    targetSelector: '[data-tour-id="billing-credits-btn"]',
    title: 'Credits and Adjustments',
    body: "If a family is owed a credit — a makeup session that needs to be refunded, a billing error, or an approved discount — apply it here. Credits reduce what they owe on their next invoice. Every credit is logged with who applied it and why.",
    tooltipAbove: true,
  },
  {
    id: 'billing-utility-strip',
    targetSelector: '[data-tour-id="billing-utility-strip"]',
    title: 'Square Sync',
    body: "Square Sync runs at the company level and is managed by ownership. You don't need to touch it — your billing data updates automatically when syncs run. If you notice data that looks off, report it using the issue button.",
    tooltipAbove: true,
  },
]

export default function BillingPageGuide() {
  const { isStudioDirector } = usePermissions()
  return (
    <PageGuide
      steps={STEPS}
      enabled={isStudioDirector}
      completionMessage="Billing guide complete. Tap 📖 Guide anytime to replay."
    />
  )
}
