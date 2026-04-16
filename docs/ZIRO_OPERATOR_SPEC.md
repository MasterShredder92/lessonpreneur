# ZIRO OPERATOR SPEC

Single source of truth for the Ziro operator-system implementation.
Any tool (Claude Code, Cursor, or manual review) should reference this document.

---

## 1. OBJECTIVE

Make Ziro context-aware, operationally intelligent, and capable of safely executing coordinated family/student/schedule/billing lifecycle changes — so that an operator can describe a real-world situation in natural language and Ziro proposes, confirms, and executes the correct multi-system changes atomically.

**Done means:** Ziro understands where in the app the user is, what entity they are looking at, can reason about the full impact of a lifecycle change across student status, schedule, billing, discounts, and retention — and executes only after showing a structured plan and receiving confirmation.

---

## 2. CONSTRAINTS

These are non-negotiable. Every implementation step must preserve all of them.

### 2.1 Safety

- Confirmation required before any action that changes billing, schedule, or student status.
- No silent auto-merges. No hidden side effects.
- Multi-step lifecycle changes must execute atomically (single DB transaction). Partial execution = full rollback.
- Stale-context guard: re-validate state at execution time, not just at plan time.
- Effective dates in the past must be rejected.

### 2.2 Scope

- All data access is role-scoped (owner > admin > studio_director > teacher > student).
- Studio directors see assigned location only. Teachers see no financial data.
- Every query includes `tenant_id = '00000000-0000-0000-0000-000000000001'`.
- RLS must be confirmed on every table touched.

### 2.3 Auditability

- Every Ziro-initiated change must be logged to `ai_action_logs` via the existing `logZiroStructuredAction` path.
- Every status/billing/schedule change must also log to `audit_log`.
- Idempotency keys required on all mutating actions (pattern exists in `ziro_idempotency_keys` table).

### 2.4 Correctness

- Pricing must follow real business rules, not hardcoded assumptions.
  - Rate tiers: 4500 (standard), 4000 (multi-student OR military OR 8+ sessions), 3750 (16+ sessions).
  - Military discount persists at family level (`is_military` flag) regardless of student count.
  - Zero-charge students (`rate_per_session=0`) do not affect family tier.
  - Students with `counts_toward_family_tier = false` (pending duplicate review) do not affect tier.
- `student_effective_rate` view is source of truth for billing. Not student-level fields alone.
- Schedule: all sessions are 30-minute increments. 60 min = two back-to-back slots.
- Invoice amounts are stored in cents. Divide by 100 for display.

### 2.5 Effective-date logic

- "Leaving in May" must not break April. Changes begin on the specified future date/cycle.
- Schedule: preserve current sessions until effective date, remove future sessions from that date forward.
- Billing: changes begin on the next correct billing cycle, not mid-cycle.
- Final session should be identified and marked where appropriate.

---

## 3. CURRENT ARCHITECTURE

### 3.1 Ziro context pipeline

```
ZiroContext.tsx (shell state: panel open/close, route, role, page context)
  → ziro-core/loadGlobalContext.ts → services/ziroContext.ts → get_ziro_context() RPC
    → Full JSONB snapshot: students, families, billing, schedule, teachers, leads, retention, sessions, tasks, locations
  → ziro-core/composePrompt.ts + pagePrompts.ts
    → Formatted system prompt with page-specific overlays
  → hooks/useAI.ts
    → useZiroBusinessChat (business Q&A) or useScheduleZiroChat (scheduling tools)
  → services/aiAssistantClient.ts
    → Edge Function: /ai-assistant
```

### 3.2 Ziro action pipeline

```
ziro/actions/executeZiroAction.ts (single entry, deduplication, audit)
  → crm.navigate         — dispatch window event
  → crm.audit_ping       — log only
  → crm.reassign_students → reassignStudents.ts → ziro_reassign_students_to_teacher() RPC
  → crm.move_schedule_sessions → scheduleMoveSessions.ts → ziro_move_schedule_sessions_v2() RPC
```

All actions: validated payload → dedupe check (4s) → execute → log to ai_action_logs.

### 3.3 Family/student/billing data model

| Table/View | Key columns | Role |
|---|---|---|
| `families` | `rate_tier`, `is_military`, `rate_tier_override`, `billing_status`, `billing_day` | Family billing state |
| `students` | `status` (active/inactive/former), `family_id`, `rate_per_session`, `blocks_per_week`, `pause_reason`, `coming_back`, `expected_return_date`, `deactivated_at` | Student lifecycle |
| `student_effective_rate` | `monthly_cents`, `status`, `location_id` | Billing source of truth (view) |
| `schedule_blocks` | `block_date`, `status` (booked/available), `block_type`, `student_id`, `teacher_id`, `location_id` | Schedule state |
| `billing_adjustments` | `family_id`, `student_id`, `amount_cents`, `applies_to_cycle` | Credits/debits |
| `student_followups` | `student_id`, `family_id`, `followup_date`, `status`, `reason` | Win-back tracking |
| `retention_campaigns` | `student_id`, `family_id`, `campaign_type`, `wave_number`, `scheduled_date` | 30/60/90-day waves |
| `audit_log` | `action`, `table_name`, `record_id`, `new_value`, `performed_by` | General audit trail |
| `ai_action_logs` | `action_id`, `payload`, `result`, `ok`, `idempotency_key` | Ziro action trace |

### 3.4 Pricing logic

Source: `src/hooks/useFamilyRate.ts`

```
calculatePreviewRate(activeStudents, totalSessions, isMilitary):
  if totalSessions >= 16 → 3750
  if activeStudents >= 2 OR totalSessions >= 8 OR isMilitary → 4000
  else → 4500
```

Server-side: `apply_family_rate_tier(p_family_id)` RPC recalculates based on current active students.

Rate tier labels:
- 4500 = Standard
- 4000 = Multi-Student / Military Discount / 8+ Sessions
- 3750 = Volume Rate

### 3.5 Retention logic

Source: `src/hooks/useRetention.ts`

`usePauseStudent()` already handles:
1. Update student status + pause fields (reason, coming_back, expected_return_date, deactivated_at)
2. Create followup record if followup date set
3. Schedule 30/60/90-day win-back campaigns to `retention_campaigns`
4. Audit log entry

`useReactivateStudent()` handles:
1. Reset student to active, clear all pause fields
2. Set family billing_status = active
3. Audit log entry

### 3.6 Page context registration

Pages call `useRegisterZiroPageContext(factory, deps)` to inject structured context into Ziro.
Context resets on route change. Currently used by: Dashboard, Students, Families, Schedule.

---

## 4. GAP ANALYSIS

### 4.1 What Ziro knows today

- Current route/page, user role, tenant, location scope
- Full business snapshot (aggregates)
- Page-specific context (schedule grid, family filters)
- How to reassign students between teachers
- How to move schedule blocks

### 4.2 What Ziro does not know

| Gap | Impact |
|---|---|
| No family-detail entity context | On a family page, Ziro does not know which family, which students, their statuses, discounts, billing |
| No student-detail entity context | Same gap on student pages |
| No `crm.deactivate_student` action | Cannot change student status |
| No `crm.update_family_rate` action | Cannot adjust pricing after lifecycle changes |
| No `crm.stop_invoicing` action | Cannot stop future billing |
| No `crm.release_schedule_slots` action | Cannot free up vacated slots |
| No `crm.assign_slot_to_sibling` action | Cannot transfer slots within a family |
| No orchestration layer | Cannot compose atomic actions into a coordinated change set with impact preview |
| No effective-date support | Current schedule moves are immediate only |
| No contextual opening framing | Opens as generic chat on every page |

---

## 5. IMPLEMENTATION PLAN

### Phase 1: Context awareness

**Goal:** Ziro knows where the user is and what entity they are looking at.

#### 5.1.1 Enrich page context registration

Register family-detail and student-detail context so Ziro receives entity-level data when opened on those pages.

**Files involved:**
- `src/pages/admin/StudentDetail.tsx` — register student + family context
- `src/pages/admin/Families.tsx` — already registers; extend with selected family detail
- `src/contexts/ZiroContext.tsx` — extend `ZiroPageContext` interface if needed
- `src/ziro-core/composePrompt.ts` — add `family_detail` and `student_detail` page prompt templates

**What to register:**
- Family: id, name, students (names, instruments, statuses), rate_tier, is_military, billing_status, overdue status
- Student: id, name, family context, schedule slots, teacher, status, pause fields

#### 5.1.2 Context-aware opening state

When Ziro opens, it should display page-appropriate framing.

**Files involved:**
- `src/components/ziro/ZiroPanel.tsx` — detect page context and render appropriate greeting
- No new components needed; this is a conditional render within the existing panel

**Behavior:**
- Family page: "I can help with billing, student changes, schedule updates, and status changes for this family."
- Student page: "I can help with schedule, status, or family changes for this student."
- Schedule page: existing behavior (schedule-aware)
- Dashboard: existing behavior (business-wide)
- No context: generic fallback

---

### Phase 2: Atomic action types

**Goal:** Ziro can execute each individual lifecycle operation.

Each new action follows the existing pattern: validated payload → dedupe → execute via RPC → audit log → structured result.

#### 5.2.1 `crm.deactivate_student`

Wraps the proven `usePauseStudent` logic into a Ziro action.

**New files:**
- `src/ziro/actions/deactivateStudent.ts`

**New RPC:**
- `ziro_deactivate_student(p_tenant_id, p_student_id, p_new_status, p_reason, p_reason_detail, p_coming_back, p_expected_return_date, p_effective_date, p_performed_by)`

**Behavior:**
- Validate student exists and is currently active
- Set status to paused/inactive
- Set pause fields (reason, coming_back, expected_return_date, deactivated_at)
- Create followup record if expected_return_date set
- Schedule 30/60/90-day win-back campaigns
- Audit log
- If `effective_date` is future: store as pending, do not apply status change yet (separate scheduled job or check)

#### 5.2.2 `crm.release_schedule_slots`

**New files:**
- `src/ziro/actions/releaseScheduleSlots.ts`

**New RPC:**
- `ziro_release_future_slots(p_tenant_id, p_student_id, p_effective_date)`

**Behavior:**
- Find all `schedule_blocks` where `student_id = p_student_id` AND `block_date >= p_effective_date` AND `status = 'booked'`
- Set `status = 'available'`, clear `student_id`
- Identify the last booked session before effective date (final lesson)
- Return count of released slots and final lesson date

#### 5.2.3 `crm.update_family_rate`

**New files:**
- `src/ziro/actions/updateFamilyRate.ts`

**Uses existing RPC:**
- `apply_family_rate_tier(p_family_id)` — already exists

**Behavior:**
- Call existing RPC to recalculate tier based on current active student count
- Return old rate, new rate, reason for change
- Respect `rate_tier_override` (if manually overridden, do not auto-change)
- Respect `is_military` persistence

#### 5.2.4 `crm.assign_slot_to_sibling`

**New files:**
- `src/ziro/actions/assignSlotToSibling.ts`

**New RPC:**
- `ziro_assign_slot_to_sibling(p_tenant_id, p_source_student_id, p_target_student_id, p_effective_date)`

**Behavior:**
- Validate both students are in the same family
- Find source student's booked slots from effective date forward
- Reassign `student_id` to target student
- Preserve target student's original slots (adding, not replacing)
- Update target student's `blocks_per_week` if applicable
- Return list of moved slots

---

### Phase 3: Orchestration layer

**Goal:** Ziro composes atomic actions into a plan, shows impact, gets confirmation, executes atomically.

#### 5.3.1 Lifecycle change plan

**New files:**
- `src/ziro/actions/lifecycleChange.ts`

**New types:**
```
ZiroLifecyclePlan {
  summary: string                    // "Deactivate Kid A, keep Kid B, update billing"
  steps: ZiroLifecycleStep[]         // Ordered atomic actions
  pricingImpact: {
    currentRate: number
    newRate: number
    reason: string                   // "Dropping from 2 to 1 active student"
    militaryApplies: boolean
  }
  scheduleImpact: {
    slotsReleased: number
    finalLessonDate: string | null
    slotsReassigned: number
  }
  billingImpact: {
    effectiveCycle: string           // "May 2026"
    invoicingStops: boolean
    rateChange: string               // "$40.00 → $45.00"
  }
  retentionCapture: {
    reason: string
    expectedReturn: string | null
    winBackScheduled: boolean
  }
  requiresConfirmation: true         // Always true for lifecycle changes
}
```

**New RPC:**
- `ziro_lifecycle_change(p_tenant_id, p_plan jsonb, p_performed_by)` — single transaction wrapping all steps

**Behavior:**
1. Ziro interprets the user request
2. Builds a `ZiroLifecyclePlan` with all steps + impact calculations
3. Presents the plan to the user with clear explanations
4. Waits for confirmation
5. On confirm: calls the orchestrator RPC which executes all steps in a single transaction
6. On failure: full rollback, error shown
7. On success: summary shown, all logs written

#### 5.3.2 Impact preview calculation

Before presenting the plan, Ziro must calculate:
- **Pricing**: Run `calculatePreviewRate` with projected active student count and session count
- **Schedule**: Count affected blocks from effective date forward
- **Billing**: Identify the next billing cycle boundary
- **Retention**: Whether win-back campaigns will be scheduled

This is a read-only preview — no mutations until confirmation.

---

### Phase 4: Edge function integration

**Goal:** The AI model can recognize lifecycle requests and produce structured plans.

**Files involved:**
- `supabase/functions/ai-assistant/index.ts` — extend to recognize lifecycle intent and return `proposed_action` with type `lifecycle_change`

The edge function already supports `proposed_action` in its response. The new lifecycle actions need to be registered as valid action types that the model can propose.

---

## 6. SCENARIO WALKTHROUGHS

### Scenario A: "Kid A is leaving in May, Kid B stays"

```
Plan:
  1. Deactivate Kid A (effective 2026-05-01, status: inactive)
     - Prompt for: reason, expected return date
  2. Release Kid A's schedule slots from 2026-05-01
     - Final lesson: 2026-04-28 (last Monday before May)
     - 4 slots released
  3. Update family rate tier
     - Current: $40.00/session (2 active students)
     - New: $45.00/session (1 active student, not military)
     - OR: $40.00/session (1 active student, military family)
  4. Stop invoicing for Kid A from May billing cycle
  5. Create followup for return date if provided
  6. Schedule 30/60/90-day win-back campaigns

Confirmation required: Yes (billing + schedule + status changes)
```

### Scenario B: "Kid A drops in May, Kid B takes that slot too"

```
Plan:
  1. Deactivate Kid A (effective 2026-05-01)
  2. Assign Kid A's slot to Kid B from 2026-05-01
     - Kid B keeps original slot + gains Kid A's slot
     - Kid B: blocks_per_week 1 → 2
  3. Release any remaining unassigned Kid A slots
  4. Update family rate tier
     - 1 active student, but now 8 sessions/month → $40.00 stays
     - OR: military → $40.00 stays
     - Show reasoning to user
  5. Stop invoicing for Kid A from May cycle
  6. Adjust Kid B's billing to reflect 2 sessions/week
  7. Win-back campaigns for Kid A

Confirmation required: Yes
```

### Scenario C: "Kid is stopping in May"

```
Plan:
  1. Deactivate student (effective 2026-05-01)
     - Prompt for: reason, expected return
  2. Release schedule slots from 2026-05-01
  3. Stop invoicing from May cycle
  4. If last student in family: set family billing_status to paused
  5. Recalculate family rate tier (may not change if solo student)
  6. If return date known (e.g. "back in August"):
     - Create followup for late July
     - Win-back outreach timed for 2-3 weeks before return
  7. Standard 30/60/90-day win-back campaigns

Confirmation required: Yes
```

---

## 7. EDGE CASES

| Case | Guard |
|---|---|
| Two operators changing same family | Idempotency keys + stale-context validation at execution time |
| Partial execution failure | Single DB transaction via RPC. All or nothing. |
| Snapshot stale at confirmation time | Re-read current state in RPC before applying. Reject if preconditions fail. |
| Military family loses a student | `is_military` persists at family level. Rate stays at 4000 even with 1 student. |
| One student, two slots | `blocks_per_week` increases. May cross 8-session threshold (4000) or 16-session (3750). |
| Zero-charge student leaves | No billing impact. Still capture reason and schedule changes. |
| All students inactive | Family `billing_status` → paused. No active invoicing. |
| Pending duplicate review | `counts_toward_family_tier = false` students excluded from tier math. |
| Effective date in the past | Rejected. Only current or future dates allowed. |
| Rate tier override exists | Do not auto-change. Show warning that manual override is active. |

---

## 8. DECISION LOG

Decisions made during spec development. Update as implementation progresses.

| # | Decision | Rationale | Date |
|---|---|---|---|
| 1 | Single orchestrator RPC for lifecycle changes | Partial execution is unacceptable. One transaction, full rollback on failure. | 2026-04-12 |
| 2 | Confirmation always required for billing/schedule/status | Operator safety. Ziro is a copilot, not an autopilot. | 2026-04-12 |
| 3 | Effective-date logic handled at RPC level | Frontend cannot be trusted for timing. DB enforces boundaries. | 2026-04-12 |
| 4 | Reuse existing `apply_family_rate_tier` RPC | Proven logic. No reason to rewrite. | 2026-04-12 |
| 5 | Reuse `usePauseStudent` business logic (not the hook itself) | The hook has React dependencies. Extract the logic into a Ziro action that calls the same RPCs. | 2026-04-12 |
| 6 | Win-back campaigns at 30/60/90 days | Existing pattern. Do not change wave timing. | 2026-04-12 |
| 7 | Context-aware greeting is a conditional render, not a new component | Keeps the component tree simple. No new panel modes. | 2026-04-12 |
| 8 | Tool-neutral spec | This document is the source of truth for any tool. Not Cursor-only or Claude-only. | 2026-04-12 |

---

## 9. TASK CHECKLIST

### Phase 1: Context awareness
- [ ] Extend `ZiroPageContext` for family-detail and student-detail entity data
- [ ] Register family context in `Families.tsx` / family detail view
- [ ] Register student context in `StudentDetail.tsx`
- [ ] Add `family_detail` and `student_detail` page prompt templates in `composePrompt.ts`
- [ ] Implement context-aware opening in `ZiroPanel.tsx`

### Phase 2: Atomic actions
- [ ] Implement `crm.deactivate_student` action + RPC
- [ ] Implement `crm.release_schedule_slots` action + RPC
- [ ] Implement `crm.update_family_rate` action (wraps existing RPC)
- [ ] Implement `crm.assign_slot_to_sibling` action + RPC
- [ ] Register all new action IDs in `executeZiroAction.ts`
- [ ] Unit tests for each new action

### Phase 3: Orchestration
- [ ] Define `ZiroLifecyclePlan` types
- [ ] Implement impact preview calculation (pricing, schedule, billing)
- [ ] Implement `ziro_lifecycle_change()` orchestrator RPC (single transaction)
- [ ] Implement `crm.lifecycle_change` action in `executeZiroAction.ts`
- [ ] Confirmation UI in `ZiroPanel.tsx` for lifecycle plans
- [ ] End-to-end test: Scenario A (student leaving, sibling stays)
- [ ] End-to-end test: Scenario B (slot reassignment to sibling)
- [ ] End-to-end test: Scenario C (solo student stopping)

### Phase 4: Edge function
- [ ] Extend `/ai-assistant` to recognize lifecycle intent
- [ ] Return structured `proposed_action` for lifecycle changes
- [ ] Prompt engineering for plan generation from natural language

### Verification (every phase)
- [ ] Real data loads from Supabase
- [ ] RLS and auth verified on all new tables/RPCs
- [ ] Audit trail complete for every mutation path
- [ ] No unbounded queries
- [ ] Role scoping enforced
- [ ] Effective-date edge cases tested

---

## 10. HOW TO USE THIS SPEC

When starting any implementation task related to Ziro lifecycle changes, use this prompt pattern:

```
Use docs/ZIRO_OPERATOR_SPEC.md as the source of truth.

Do not assume missing behavior.
First:
1. Restate the objective
2. Map the current architecture against the spec
3. Identify implementation gaps
4. List exact files/RPCs/tables/hooks involved
5. Identify risks and confirmation points

Then implement in a way that preserves:
- auditability
- role scope
- transactional safety
- effective-date correctness
- pricing/billing correctness
- schedule consistency
- manual review where ambiguity exists

Do not skip the pre-implementation analysis.
Do not introduce silent auto-behavior for ambiguous lifecycle changes.
```
