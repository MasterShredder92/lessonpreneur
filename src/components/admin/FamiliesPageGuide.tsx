import PageGuide, { type GuideStep } from '../shared/PageGuide'
import { usePermissions } from '../../hooks/usePermissions'

const STEPS: GuideStep[] = [
  {
    id: 'families-list',
    targetSelector: '[data-guide-id="families-list"]',
    title: 'Family Accounts',
    body: "Every student belongs to a family account. Billing, contact info, and household-level details all live at the family level — not the student level. You'll come here when you need to update contact info, check payment status, or look up a family's full picture.",
  },
  {
    id: 'family-card-first',
    targetSelector: '[data-guide-id="family-card-first"]',
    title: 'Family at a Glance',
    body: "Each row shows the family name, number of active students, their monthly billing amount, and payment status. Families with overdue balances are flagged here so you can follow up before it becomes a bigger issue.",
    interactivePrompt: 'Tap this family to open their full record →',
  },
  {
    id: 'family-tab-account',
    targetSelector: '[data-guide-id="family-tab-account"]',
    title: 'Account Tab',
    body: "This is the family's core account info — account name, their unique billing ID, military status, member since date, and their assigned location. The account name is how they appear in billing and communications. You can edit this directly.",
    clickBeforeShow: '[data-guide-id="family-tab-account"]',
  },
  {
    id: 'family-parent-contact',
    targetSelector: '[data-guide-id="family-parent-contact"]',
    title: 'Contact Information',
    body: "Primary parent name, phone, and email live here. This is what you use to reach the family — calls, texts, follow-ups. Keep this current. If a family member calls with a different number, update it here so the next person who pulls this up has the right info.",
    clickBeforeShow: '[data-guide-id="family-tab-contact"]',
  },
  {
    id: 'family-emergency-contact',
    targetSelector: '[data-guide-id="family-emergency-contact"]',
    title: 'Emergency Contact',
    body: "Required for every active family. If something happens during a session and we can't reach the primary parent, this is who we call. Make sure it's filled out and current for every family at your studio.",
  },
  {
    id: 'family-students-list',
    targetSelector: '[data-guide-id="family-students-list"]',
    title: 'Students in This Household',
    body: "Every student linked to this family appears here. Tap any student name to jump directly to their student profile. Families can have multiple students — siblings often take different instruments with different teachers.",
    clickBeforeShow: '[data-guide-id="family-tab-account"]',
  },
  {
    id: 'family-tab-billing',
    targetSelector: '[data-guide-id="family-tab-billing"]',
    title: 'Billing Tab',
    body: "This tab shows the family's current billing status, their monthly rate, card on file status, and payment history. You can see whether autopay is active, if there's an outstanding balance, and when their last invoice was paid.",
    clickBeforeShow: '[data-guide-id="family-tab-billing"]',
  },
  {
    id: 'family-card-on-file',
    targetSelector: '[data-guide-id="family-card-on-file"]',
    title: 'Card on File',
    body: "Families without a card on file are a collection risk. If this shows no card, follow up with the family to get one added before the next billing cycle. Autopay families almost never go overdue.",
  },
  {
    id: 'family-scheduling-notes',
    targetSelector: '[data-guide-id="family-scheduling-notes"]',
    title: 'Scheduling Notes',
    body: "This is where you record anything the family has told you about scheduling preferences — 'doesn't want Monday slots', 'needs 4pm or later', 'can't do Saturdays'. This saves you from re-asking the same questions every time something changes.",
    skipIfMissing: true,
  },
  {
    id: 'family-billing-notes',
    targetSelector: '[data-guide-id="family-billing-notes"]',
    title: 'Billing Notes',
    body: "Use this for anything billing-related that isn't captured automatically — payment arrangements, rate exceptions that were approved, or notes about a disputed invoice. This creates a paper trail so anyone can understand the situation without asking.",
    skipIfMissing: true,
  },
  {
    id: 'family-tab-documents',
    targetSelector: '[data-guide-id="family-tab-documents"]',
    title: 'Documents Tab (Mobile)',
    body: "On your phone, household documents live on the Documents tab — enrollment agreements, contracts, and IDs. On desktop, open the Director tab to see the same section next to billing notes.",
    clickBeforeShow: '[data-guide-id="family-tab-documents"]',
    skipIfMissing: true,
  },
  {
    id: 'family-files-section',
    targetSelector: '[data-guide-id="family-files-section"]',
    title: 'Family Documents',
    body: "Enrollment agreements, signed contracts, and any documents that belong to the household rather than an individual student are stored here. These are the permanent records for this family's relationship with the school.",
    skipIfMissing: true,
  },
]

export default function FamiliesPageGuide() {
  const { isStudioDirector } = usePermissions()
  return (
    <PageGuide
      steps={STEPS}
      enabled={isStudioDirector}
      completionMessage="Families guide complete. Tap 📖 Guide anytime to replay."
    />
  )
}
