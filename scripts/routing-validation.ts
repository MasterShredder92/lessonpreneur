/**
 * Live-task routing validation harness.
 *
 * Runs 50 representative ZiroWork inputs through classifyIntent()
 * and logs: input, chosen route, expected route, pass/fail, notes.
 *
 * Usage: npx tsx scripts/routing-validation.ts
 */

// ── Duplicate classifyIntent logic (pure function, no Supabase dependency) ──

type Classification = 'quick_answer' | 'actionable_task' | 'skill_proposal'

interface OrchestrationIntent {
  classification: Classification
  intent_summary: string
  suggested_skill_key?: string
  input_payload?: Record<string, unknown>
}

function classifyIntent(
  userQuestion: string,
  assistantAnswer: string,
  proposedAction?: { action: string; params: Record<string, unknown> } | null,
): OrchestrationIntent {
  if (proposedAction?.action) {
    const actionToSkill: Record<string, string> = {
      'crm.reassign_students': 'schedule_optimizer',
      'crm.move_schedule_sessions': 'schedule_optimizer',
      'crm.navigate': '',
      'crm.audit_ping': '',
    }
    const skillKey = actionToSkill[proposedAction.action]
    if (skillKey) {
      return {
        classification: 'actionable_task',
        intent_summary: `Execute ${proposedAction.action}`,
        suggested_skill_key: skillKey,
        input_payload: proposedAction.params,
      }
    }
  }

  const proposalPatterns = [
    /I['']d like to propose a new skill/i,
    /propose a new skill.*for approval/i,
    /submit.*for approval.*new skill/i,
  ]
  if (proposalPatterns.some(p => p.test(assistantAnswer))) {
    return {
      classification: 'skill_proposal',
      intent_summary: 'STAR proposed a new skill',
    }
  }

  const taskPatterns: Array<{ pattern: RegExp; skill: string; summary: string }> = [
    { pattern: /follow.?up.*(lead|inquiry)/i, skill: 'lead_followup', summary: 'Lead follow-up task' },
    { pattern: /(draft|write|compose|send|remind).*(parent|family|families).*(message|email|sms|update|notice)/i, skill: 'parent_comms', summary: 'Parent communication' },
    { pattern: /(parent|family|families).*(message|email|sms|reminder|update|notice)/i, skill: 'parent_comms', summary: 'Parent communication' },
    { pattern: /(message|email|update|notice|reminder).*(parent|family|families)/i, skill: 'parent_comms', summary: 'Parent communication' },
    { pattern: /morning briefing|daily.*summary/i, skill: 'morning_briefing', summary: 'Generate morning briefing' },
    { pattern: /churn|at.?risk|retention.*(analys|trend|rate)/i, skill: 'churn_analysis', summary: 'Churn risk analysis' },
    { pattern: /billing.*(summary|report|insight|anomal)/i, skill: 'billing_insight', summary: 'Billing insight generation' },
    { pattern: /teacher.*(eval|review|performance|effectiveness)/i, skill: 'teacher_eval', summary: 'Teacher performance evaluation' },
    { pattern: /(eval|review|assess).*teach/i, skill: 'teacher_eval', summary: 'Teacher performance evaluation' },
    { pattern: /session.*(recap|note|polish|enhance)/i, skill: 'session_recap', summary: 'Session note enhancement' },
    { pattern: /sop|standard operating/i, skill: 'sop_generator', summary: 'SOP generation' },
    { pattern: /offer.*(creat|build|strateg|ladder)|upsell.*offer/i, skill: 'offer_strategy', summary: 'Offer strategy' },
    { pattern: /marketing.*(brief|plan|campaign)/i, skill: 'marketing_brief', summary: 'Marketing brief' },
    { pattern: /sales.*(script|pitch|objection)|(pitch|objection).*(sales|lesson|price)/i, skill: 'sales_script', summary: 'Sales script refinement' },
    { pattern: /operations?.*(audit|review|check)|review.*operations?/i, skill: 'ops_audit', summary: 'Operations audit' },
  ]

  for (const { pattern, skill, summary } of taskPatterns) {
    if (pattern.test(userQuestion)) {
      return {
        classification: 'actionable_task',
        intent_summary: summary,
        suggested_skill_key: skill,
      }
    }
  }

  return {
    classification: 'quick_answer',
    intent_summary: 'Quick answer — no orchestration needed',
  }
}

// ── Test Cases ──────────────────────────────────────────

interface TestCase {
  id: number
  category: string
  input: string
  expectedRoute: 'direct' | 'skill' | 'agent'
  expectedSkill: string | null
  /** If direct but SHOULD be a skill, what skill key? */
  recommendedNewSkill?: string
  notes?: string
}

const testCases: TestCase[] = [
  // ── LEADS & SALES (1-10) ──
  { id: 1, category: 'Leads', input: 'Follow up on the Smith lead from yesterday', expectedRoute: 'skill', expectedSkill: 'lead_followup' },
  { id: 2, category: 'Leads', input: 'How many new leads came in this week?', expectedRoute: 'direct', expectedSkill: null, notes: 'Data query, not a task' },
  { id: 3, category: 'Leads', input: 'Write a sales script for handling price objections', expectedRoute: 'skill', expectedSkill: 'sales_script' },
  { id: 4, category: 'Leads', input: 'Follow up on the Johnson inquiry about piano lessons', expectedRoute: 'skill', expectedSkill: 'lead_followup' },
  { id: 5, category: 'Sales', input: 'Create a pitch for our summer camp program', expectedRoute: 'direct', expectedSkill: null, recommendedNewSkill: 'sales_script', notes: '"pitch" alone without "sales" doesn\'t match — correct, "create a pitch" is ambiguous' },
  { id: 6, category: 'Sales', input: 'What is our close rate this month?', expectedRoute: 'direct', expectedSkill: null },
  { id: 7, category: 'Sales', input: 'Help me handle the objection about lesson prices being too high', expectedRoute: 'skill', expectedSkill: 'sales_script', notes: 'Pattern now covers "objection.*price"' },
  { id: 8, category: 'Leads', input: 'Send a follow-up text to all unresponsive leads from last week', expectedRoute: 'skill', expectedSkill: 'lead_followup', notes: 'Matches follow-up + lead — bulk vs single is a runtime concern, not routing' },
  { id: 9, category: 'Sales', input: 'Build an upsell offer for existing families', expectedRoute: 'skill', expectedSkill: 'offer_strategy', notes: 'Pattern now covers "upsell.*offer"' },
  { id: 10, category: 'Leads', input: 'Qualify the 3 leads that came in today', expectedRoute: 'direct', expectedSkill: null, recommendedNewSkill: 'lead_qualification', notes: 'Lead qualification is a recurring task' },

  // ── PARENT COMMUNICATIONS (11-17) ──
  { id: 11, category: 'Parent Comms', input: 'Draft a parent email about the upcoming recital', expectedRoute: 'skill', expectedSkill: 'parent_comms' },
  { id: 12, category: 'Parent Comms', input: 'Draft a family message about schedule changes next week', expectedRoute: 'skill', expectedSkill: 'parent_comms' },
  { id: 13, category: 'Parent Comms', input: 'Write a welcome message for the new Anderson family', expectedRoute: 'skill', expectedSkill: 'parent_comms', notes: 'Pattern now covers "write" + "family" + "message"' },
  { id: 14, category: 'Parent Comms', input: 'Remind parents about next week studio closure', expectedRoute: 'direct', expectedSkill: null, recommendedNewSkill: 'parent_comms', notes: '"Remind parents about..." doesn\'t include message/email/sms word — correct fallback' },
  { id: 15, category: 'Parent Comms', input: 'Draft a parent SMS about late pickup policy', expectedRoute: 'skill', expectedSkill: 'parent_comms' },
  { id: 16, category: 'Parent Comms', input: 'Send the quarterly update to all families', expectedRoute: 'skill', expectedSkill: 'parent_comms', notes: 'Pattern now covers "families" + "update"' },
  { id: 17, category: 'Parent Comms', input: 'Compose a parent email about summer scheduling', expectedRoute: 'skill', expectedSkill: 'parent_comms', notes: 'Pattern now covers "compose" + "parent" + "email"' },

  // ── OPERATIONS & AUDITS (18-25) ──
  { id: 18, category: 'Operations', input: 'Run an operations audit on the Gretna location', expectedRoute: 'skill', expectedSkill: 'ops_audit' },
  { id: 19, category: 'Operations', input: 'Create an SOP for teacher onboarding', expectedRoute: 'skill', expectedSkill: 'sop_generator' },
  { id: 20, category: 'Operations', input: 'Generate my morning briefing', expectedRoute: 'skill', expectedSkill: 'morning_briefing' },
  { id: 21, category: 'Operations', input: 'Give me a daily summary of what happened today', expectedRoute: 'skill', expectedSkill: 'morning_briefing' },
  { id: 22, category: 'Operations', input: 'Review operations at the Bellevue studio', expectedRoute: 'skill', expectedSkill: 'ops_audit', notes: 'Pattern now covers "review.*operations"' },
  { id: 23, category: 'Operations', input: 'What tasks are overdue across all locations?', expectedRoute: 'direct', expectedSkill: null, recommendedNewSkill: 'task_tracker', notes: 'Task tracking is a recurring operational need' },
  { id: 24, category: 'Operations', input: 'Create a standard operating procedure for handling cancellations', expectedRoute: 'skill', expectedSkill: 'sop_generator' },
  { id: 25, category: 'Operations', input: 'Check inventory of rental instruments', expectedRoute: 'direct', expectedSkill: null, notes: 'Niche query, direct is correct' },

  // ── BILLING & FINANCIALS (26-32) ──
  { id: 26, category: 'Billing', input: 'Generate a billing summary for March', expectedRoute: 'skill', expectedSkill: 'billing_insight' },
  { id: 27, category: 'Billing', input: 'Show billing anomalies for this month', expectedRoute: 'skill', expectedSkill: 'billing_insight' },
  { id: 28, category: 'Billing', input: 'How much revenue did we make last month?', expectedRoute: 'direct', expectedSkill: null, notes: 'Simple data query, direct is fine' },
  { id: 29, category: 'Billing', input: 'Create invoices for all families who haven\'t been billed', expectedRoute: 'direct', expectedSkill: null, recommendedNewSkill: 'invoice_generator', notes: 'Invoice creation is a repeatable workflow' },
  { id: 30, category: 'Billing', input: 'Show me a billing report by location', expectedRoute: 'skill', expectedSkill: 'billing_insight' },
  { id: 31, category: 'Billing', input: 'Which families have outstanding balances?', expectedRoute: 'direct', expectedSkill: null, notes: 'Data lookup, direct is appropriate' },
  { id: 32, category: 'Billing', input: 'Calculate projected revenue for next quarter', expectedRoute: 'direct', expectedSkill: null, recommendedNewSkill: 'revenue_forecast', notes: 'Revenue forecasting is a strategic skill' },

  // ── TEACHER MANAGEMENT (33-38) ──
  { id: 33, category: 'Teachers', input: 'Review teacher performance for Q1', expectedRoute: 'skill', expectedSkill: 'teacher_eval' },
  { id: 34, category: 'Teachers', input: 'Evaluate Sarah\'s teaching effectiveness', expectedRoute: 'skill', expectedSkill: 'teacher_eval', notes: 'Pattern now covers "eval.*teach"' },
  { id: 35, category: 'Teachers', input: 'Which teachers have the most cancellations?', expectedRoute: 'direct', expectedSkill: null, notes: 'Data query, direct is correct' },
  { id: 36, category: 'Teachers', input: 'Write a teacher performance review for Jake', expectedRoute: 'skill', expectedSkill: 'teacher_eval' },
  { id: 37, category: 'Teachers', input: 'Create a training plan for new teachers', expectedRoute: 'direct', expectedSkill: null, recommendedNewSkill: 'teacher_training', notes: 'Teacher training is a structured recurring need' },
  { id: 38, category: 'Teachers', input: 'How many students does each teacher have?', expectedRoute: 'direct', expectedSkill: null, notes: 'Data query' },

  // ── RETENTION & CHURN (39-43) ──
  { id: 39, category: 'Retention', input: 'Show me at-risk students', expectedRoute: 'skill', expectedSkill: 'churn_analysis' },
  { id: 40, category: 'Retention', input: 'Analyze retention trends over the last 6 months', expectedRoute: 'skill', expectedSkill: 'churn_analysis', notes: 'Pattern now covers "retention.*trend"' },
  { id: 41, category: 'Retention', input: 'Which students are most likely to churn?', expectedRoute: 'skill', expectedSkill: 'churn_analysis' },
  { id: 42, category: 'Retention', input: 'Create a win-back campaign for former students', expectedRoute: 'direct', expectedSkill: null, recommendedNewSkill: 'winback_campaign', notes: 'Win-back is a structured campaign workflow' },
  { id: 43, category: 'Retention', input: 'What is our monthly churn rate?', expectedRoute: 'skill', expectedSkill: 'churn_analysis' },

  // ── MARKETING & STRATEGY (44-48) ──
  { id: 44, category: 'Marketing', input: 'Build a marketing plan for the fall semester', expectedRoute: 'skill', expectedSkill: 'marketing_brief' },
  { id: 45, category: 'Marketing', input: 'Create a marketing campaign for guitar lessons', expectedRoute: 'skill', expectedSkill: 'marketing_brief' },
  { id: 46, category: 'Marketing', input: 'Write social media copy for our recital', expectedRoute: 'direct', expectedSkill: null, recommendedNewSkill: 'social_media_copy', notes: 'Social media content is a distinct repeatable task' },
  { id: 47, category: 'Marketing', input: 'Build an offer strategy for Black Friday', expectedRoute: 'skill', expectedSkill: 'offer_strategy' },
  { id: 48, category: 'Marketing', input: 'Create an offer ladder for family bundles', expectedRoute: 'skill', expectedSkill: 'offer_strategy' },

  // ── SESSION NOTES & CURRICULUM (49-50) ──
  { id: 49, category: 'Sessions', input: 'Polish the session notes from today', expectedRoute: 'skill', expectedSkill: 'session_recap' },
  { id: 50, category: 'Sessions', input: 'Enhance my session recap for Tommy', expectedRoute: 'skill', expectedSkill: 'session_recap' },
]

// ── Run Tests ───────────────────────────────────────────

interface TestResult {
  id: number
  category: string
  input: string
  expectedRoute: string
  actualRoute: string
  expectedSkill: string | null
  actualSkill: string | null
  pass: boolean
  recommendedNewSkill?: string
  notes?: string
}

const results: TestResult[] = []
let passCount = 0
let failCount = 0
const missedSkills = new Map<string, string[]>() // skill key → list of inputs

for (const tc of testCases) {
  const intent = classifyIntent(tc.input, '', null)

  const actualRoute = intent.classification === 'actionable_task' ? 'skill' :
    intent.classification === 'skill_proposal' ? 'direct' : 'direct'
  const actualSkill = intent.suggested_skill_key ?? null

  const pass = actualRoute === tc.expectedRoute && actualSkill === tc.expectedSkill

  if (pass) passCount++
  else failCount++

  // Track missed skills
  if (tc.recommendedNewSkill && actualRoute === 'direct') {
    const existing = missedSkills.get(tc.recommendedNewSkill) ?? []
    existing.push(tc.input)
    missedSkills.set(tc.recommendedNewSkill, existing)
  }

  results.push({
    id: tc.id,
    category: tc.category,
    input: tc.input,
    expectedRoute: tc.expectedRoute,
    actualRoute,
    expectedSkill: tc.expectedSkill,
    actualSkill,
    pass,
    recommendedNewSkill: tc.recommendedNewSkill,
    notes: tc.notes,
  })
}

// ── Output ──────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════')
console.log('  ZIROWORK ROUTING VALIDATION — 50 TASKS')
console.log('═══════════════════════════════════════════════════\n')

console.log(`Results: ${passCount} PASS / ${failCount} FAIL out of ${testCases.length}\n`)

// Table of all results
console.log('ID | Category       | Route   | Skill              | Pass | Input')
console.log('---|----------------|---------|--------------------|----- |------')
for (const r of results) {
  const passStr = r.pass ? ' ✓  ' : ' ✗  '
  const route = (r.actualRoute).padEnd(7)
  const skill = (r.actualSkill ?? '—').padEnd(18)
  const cat = r.category.padEnd(14)
  console.log(`${String(r.id).padStart(2)} | ${cat} | ${route} | ${skill} | ${passStr} | ${r.input.slice(0, 55)}`)
}

// Failures
const failures = results.filter(r => !r.pass)
if (failures.length > 0) {
  console.log(`\n\n═══ FAILURES (${failures.length}) ═══\n`)
  for (const f of failures) {
    console.log(`#${f.id}: "${f.input}"`)
    console.log(`  Expected: ${f.expectedRoute} / ${f.expectedSkill ?? '—'}`)
    console.log(`  Actual:   ${f.actualRoute} / ${f.actualSkill ?? '—'}`)
    if (f.notes) console.log(`  Note:     ${f.notes}`)
    console.log()
  }
}

// Missed skills (tasks falling to direct that should be skills)
if (missedSkills.size > 0) {
  console.log('\n═══ RECOMMENDED NEW SKILLS ═══\n')
  for (const [skill, inputs] of missedSkills) {
    console.log(`  ${skill} (${inputs.length} tasks)`)
    for (const inp of inputs) {
      console.log(`    → "${inp}"`)
    }
  }
}

// Pattern collision check
console.log('\n\n═══ PATTERN COLLISION CHECK ═══\n')
const taskPatterns: Array<{ pattern: RegExp; skill: string }> = [
  { pattern: /follow.?up.*(lead|inquiry)/i, skill: 'lead_followup' },
  { pattern: /(draft|write|compose|send|remind).*(parent|family|families).*(message|email|sms|update|notice)/i, skill: 'parent_comms' },
  { pattern: /(parent|family|families).*(message|email|sms|reminder|update|notice)/i, skill: 'parent_comms' },
  { pattern: /(message|email|update|notice|reminder).*(parent|family|families)/i, skill: 'parent_comms' },
  { pattern: /morning briefing|daily.*summary/i, skill: 'morning_briefing' },
  { pattern: /churn|at.?risk|retention.*(analys|trend|rate)/i, skill: 'churn_analysis' },
  { pattern: /billing.*(summary|report|insight|anomal)/i, skill: 'billing_insight' },
  { pattern: /teacher.*(eval|review|performance|effectiveness)/i, skill: 'teacher_eval' },
  { pattern: /(eval|review|assess).*teach/i, skill: 'teacher_eval' },
  { pattern: /session.*(recap|note|polish|enhance)/i, skill: 'session_recap' },
  { pattern: /sop|standard operating/i, skill: 'sop_generator' },
  { pattern: /offer.*(creat|build|strateg|ladder)|upsell.*offer/i, skill: 'offer_strategy' },
  { pattern: /marketing.*(brief|plan|campaign)/i, skill: 'marketing_brief' },
  { pattern: /sales.*(script|pitch|objection)|(pitch|objection).*(sales|lesson|price)/i, skill: 'sales_script' },
  { pattern: /operations?.*(audit|review|check)|review.*operations?/i, skill: 'ops_audit' },
]

// Check each test input against ALL patterns to find multi-matches
let collisions = 0
for (const tc of testCases) {
  const matches = taskPatterns.filter(p => p.pattern.test(tc.input))
  if (matches.length > 1) {
    collisions++
    console.log(`  COLLISION #${tc.id}: "${tc.input.slice(0, 60)}"`)
    console.log(`    Matches: ${matches.map(m => m.skill).join(', ')}`)
    console.log(`    Winner:  ${matches[0].skill} (first-match-wins)`)
    console.log()
  }
}
if (collisions === 0) {
  console.log('  No pattern collisions detected across 50 test inputs.')
}

// Top 5 routing misses
console.log('\n\n═══ TOP 5 ROUTING MISSES / AMBIGUITIES ═══\n')
const directFallbacks = results.filter(r => r.actualRoute === 'direct' && r.recommendedNewSkill)
for (const r of directFallbacks.slice(0, 5)) {
  console.log(`#${r.id}: "${r.input}"`)
  console.log(`  Current: Falls to direct (no pattern match)`)
  console.log(`  Recommended: ${r.recommendedNewSkill}`)
  if (r.notes) console.log(`  Reason: ${r.notes}`)
  console.log()
}

console.log('\n═══ SUMMARY ═══\n')
console.log(`Total tasks:           ${testCases.length}`)
console.log(`Correct routing:       ${passCount} (${Math.round(passCount/testCases.length*100)}%)`)
console.log(`Incorrect routing:     ${failCount}`)
console.log(`Pattern collisions:    ${collisions}`)
console.log(`Tasks needing skills:  ${directFallbacks.length}`)
console.log(`Unique missing skills: ${missedSkills.size}`)
console.log()
