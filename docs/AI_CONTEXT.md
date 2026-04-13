# AI_CONTEXT.md
> Last updated: April 8, 2026 — Generated from full project memory. This is the single source of truth for any new AI session on this project.

---

# PROJECT OVERVIEW

**Lessonpreneur (LP)** is a full business operating system for music school owners — not a CRM. Built first for Adkins Music Lessons (4 locations, 560+ families, 610+ students, $1.2M+/year), then white-labeled to other music school owners and solo teachers. Expands to dance studios, gyms, martial arts, and any lesson-based business.

**North star:** Owner runs their entire business from their phone in 15 minutes a day.
**Core mindset:** "Be a resource, not a sales pitch." Educate and help first. Sell second.
**Primary domain:** lessonpreneur.io (also owns .com, .net, .org, .co — .io is production)

**Adkins Music Lessons** is the live proving ground. Everything built here ships to LP.

---

# PRODUCTS / BRANDS

## 1. Lessonpreneur (LP) — B2B SaaS

**What it replaces:** Disconnected scheduling and spreadsheets, Google Drive, Make/n8n scattered workflows, My Music Staff, Jackrabbit, Opus1, Google Sheets. (Square may remain the payment processor; LP owns schedules and billing logic.)

**What it covers:** Leads, scheduling, students, teachers, billing, two-way SMS (QUO), automation (n8n), and AI-powered growth tools.

**Pricing (LOCKED — never use other numbers):**
| Tier | Price |
|---|---|
| Individual Teacher | $197/mo |
| Single Location | $497/mo |
| Multi-Location (up to 3) | $997/mo |
| Free Trial | 60 days (migration-friendly) |

**Stripe Payment Links:**
- Solo $97/mo: `https://buy.stripe.com/aFabJ16ySgmabyE9JS2ZO02`
- School $297/mo: `https://buy.stripe.com/7sYdR97CW4Ds46c5tC2ZO01`
- Pro $997/mo: `https://buy.stripe.com/dRm3cv3mGfi646c2hq2ZO00`

**Target customers (3 tiers):**
1. Solo music teachers — professional infrastructure without enterprise complexity
2. Single-location school owners — control and less chaos
3. Multi-location operators — visibility, standardization, scalable systems

**Competitors:** My Music Staff, Jackrabbit, Opus1, Google Sheets

---

## 2. Adkins Music Lessons — B2C Music School (4 Locations)

**Locations (always this exact order):** Omaha, Gretna, Bellevue, Elkhorn

| Location | Color | UUID |
|---|---|---|
| Omaha | `#D41113` red | `d48229c1-b70a-4d29-893e-5079887dab76` |
| Gretna | `#00A651` green | `40c67ffc-91b5-46a9-94bd-6ddffdfb7638` |
| Bellevue | `#A333FF` purple | `f7b52dd5-12ee-437f-9c60-f8adf454ac31` |
| Elkhorn | `#00A5E8` baby blue | `cebd97d4-c241-4de2-8ade-49e5cc0070d5` |

**Core Four Instruments (always first, always this order, forever):** Piano, Guitar, Vocals, Drums — separated from all others by a divider in every UI.

**Key people:**
- **Zach Adkins** — founder, owner, builder
- **Alicia** — co-owner, board level
- **Andrea** — Company Director, all 4 locations, LP beta tester, Paperclip chain-of-command anchor
- **Katie** — Gretna studio director
- **Illiana Hammers** — Bellevue studio director
- **Cornelius Cobb** — LP's corn mascot/AI enrollment assistant. Floats bottom-right on school websites. Guitar bend sound on click.
- **Reyli Gonzalez** — Teacher, he/him, ID: `TMRXYPoH3Hpjlh7E`

---

## 3. 7-Figure Music Teacher — Course / Knowledge Product

Zach's framework for music school owners to scale. 8 workbooks: Foundation, Enrollment Engine, Retention, Systems, Hiring, Scaling, Buy Your Time Back, Thinking Bigger.

**Banked product layers:**
- **Knowledge Vault** — lawyer-vetted contracts (~$10K to develop), growth playbooks, operational frameworks. Watermarked PDFs (subscriber name/date), viewer-only in-app (no download by default, logged if requested), non-transferable license, access revoked on lapse.
- **LP School Program** — optional coaching/mastermind membership on top of software. Separate recurring revenue stream.

---

# ARCHITECTURE

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS, TanStack Query |
| Backend | Supabase (Postgres, Auth, Storage, Edge Functions, Realtime) |
| Deployment | Vercel (auto-deploy on push to master) |
| AI | Claude API via Supabase Edge Functions |
| SMS | QUO (two-way SMS, native to LP) |
| Automation | n8n |
| Billing processor | Square (LP is source of truth, Square is payment rail only) |
| Contracts | SignWell |
| Agent orchestration | Paperclip (VPS: 143.198.25.186) |

## Key IDs

| Key | Value |
|---|---|
| Supabase project ID (PRODUCTION) | `dhsyxyhtoadrqfrlmsqe` |
| Supabase URL | `https://dhsyxyhtoadrqfrlmsqe.supabase.co` |
| Tenant ID | `00000000-0000-0000-0000-000000000001` |
| Test user ID | `10000000-0000-0000-0000-000000000001` |
| Adkins Enterprises company UUID | `8913078e-2c4d-4fc7-86c8-fd1d86a11616` |
| Tenant slug | `adkins-music-lessons` (updated April 6, 2026 — was `adkins`) |
| LP Diagnostics Paperclip company ID | `cb69dd3b-a243-4a0b-be17-2b132f31aa82` |
| LP Diagnostics CEO agent ID | `de151bb7-62ac-4330-b4b1-6dae3e3e399b` |
| LP Diagnostics CEO urlKey | `lp-diagnostics-ceo` |
| LP Diagnostics API key | `pcp_6a6a6b440f32697cc3a06cb7b2f6fbe2bdeee59ca941e52e` |

> ⚠️ MCP only sees `iybiksgeotjhgbmwjovx` — do NOT run migrations there. All DDL goes to `dhsyxyhtoadrqfrlmsqe` via Supabase SQL editor directly.

## Analytics & Tracking

**GA4 — Adkins Music Lessons (Account 14281733218):**
- Gretna: `G-FBMP7Y8M2X`
- Bellevue: `G-Q5C7W68SC9`
- Elkhorn: `G-KNEM7VHEC1`
- Omaha: `G-0KT89GHX52`

**Meta Pixels:**
- Bellevue: `216419921006041`
- Gretna: `696662488386167`
- Omaha: `426901091077909`
- Elkhorn: `873626412816671`

**TikTok Pixels:**
- Omaha: `D768H23C77UD6SV8PU40`
- Gretna: `D768IC3C77UD6SV8PU60`
- Bellevue: `D768ITRC77UD6SV8PU80`
- Elkhorn: `D768JBRC77U03P65153G`

**LP Platform Analytics:** GA4 `G-PQWBNEDH0L` · Meta Pixel `1121184396815192` · Microsoft Clarity `w3j28uoufo`

## Codebase & Repos

| Repo / Path | Purpose |
|---|---|
| `D:\music-school-os\app` | LP codebase (local) |
| `github.com/MasterShredder92/lessonpreneur` | LP GitHub (correct account) |
| `github.com/MasterShredder92/adkins-paperclip` | Adkins Paperclip repo |
| `D:\lessonpreneur` | Paperclip files: CEO_AGENT.md, CEO_MUSIC_SCHOOL.md, CRM_BUILDER.md, .env.local, outreach-templates.md, prospect-list.md |
| `lessonpreneur.vercel.app` | Vercel deployment (auto-deploys on push to master) |

**Git aliases:** `git ship` and `git fawkyahbud` = add + commit + push in one command.

---

## Design System — V9 (LOCKED)

| Token | Value |
|---|---|
| Background | `#020209` |
| Primary Pink | `#D4226A` |
| Orange | `#FF5500` |
| Gold | `#FFB800` |
| LP Wordmark | Gradient left→right: `#D4226A` → `#FF5500` → `#FFB800` via `background-clip: text` |
| Font | Plus Jakarta Sans 800–900 weight |
| Cards | `background: rgba(255,255,255,0.04)`, `border: 1px solid rgba(255,255,255,0.08)`, `backdrop-filter: blur(12px)`, `border-radius: 16px` |
| CTA glow pulse | `box-shadow: 0 0 20px rgba(212,34,106,0.35) → 0 0 45px rgba(212,34,106,0.75)`, 2s loop |
| Transitions | Micro-interactions 150–200ms, modals 250–350ms |

**Atmospheric background:** Real SVG DOM elements — NOT CSS pseudo-elements — plus canvas particle system and floating symbols.
**Mobile-first always.** Min font 16px body, 28px headlines on mobile. All CTAs min 56px tap height. Test every build at Pixel 7 (412px) in Chrome DevTools.

---

## Route Map

### LP Marketing Routes

| Route | Component |
|---|---|
| `/` | `LandingPageV2` — LP home |
| `/start` | `VSLPage` — B2B funnel step 1 |
| `/get-started` | `LeadCaptureFormPage` — B2B funnel step 2 |
| `/trial` | `CardCapturePage` — B2B funnel step 3 → Stripe |
| `/pay/:token` | `PayInvoice` |

**LP landing page scroll order:** Fold → Who This Is For → Chaos Stack → Testimonial (Zachary Adkins) → Revenue Leak Calculator → What Changes → Built Inside Real Schools → Testimonial (Andrea Redman) → Device Mockup → Logo Hub/Chaos-to-Value → Testimonial (Anonymous) → Proof Section → Offer Stack → FAQ → Final CTA → Footer.

**Sticky overlay:** `StopTheBleedingBar` — fixed bottom, appears after 15s. Counter persists via `lp_bleed_start` in localStorage. Rate: $200/hr = $0.01 per 180ms.

### Adkins B2C Routes (28 total — 4 locations × 7)

| Route | Component |
|---|---|
| `/{loc}` | `AdkinsLanding` |
| `/{loc}/piano` | `PianoLanding` |
| `/{loc}/guitar` | `GuitarLanding` |
| `/{loc}/vocals` | `VocalsLanding` |
| `/{loc}/drums` | `DrumsLanding` |
| `/{loc}/more` | `MoreLanding` |
| `/{loc}/signup` | `SignupLanding` — unified enrollment entry point |
| `/thank-you` | `ThankYou` |
| `/intake/:slug` | Redirects → `/omaha/signup` |

**Flat redirects:** `/drums` → `/omaha/drums`, `/guitar` → `/omaha/guitar`, `/piano` → `/omaha/piano`, `/vocals` → `/omaha/vocals`, `/site` → `/omaha`, `/lessonpreneur` → `/`

**ALL CTAs on all location/instrument pages → `/{loc}/signup`** (never modal, never `/intake`). `EnrollmentForm` modal preserved but not wired.

### B2C Enrollment Funnel

```
/{loc}/[instrument page or home]
  ↓ any CTA
/{loc}/signup  →  multi-step: Who is this for → student info → instruments → location (display-only, pre-filled) → contact → teacher match
  ↓ submit → Edge Function → leads table (leads.location_id = UUID)
/thank-you?location={loc}
```

Location color switching: CSS variable `--c` on `document.documentElement`. Smooth 500ms transition via `.loc-transitioning` class.

### Auth / App Routes
`/login`, `/admin/*` (18 routes), `/teacher/*` (4 routes), `/parent/*` (5 routes)

### Orphaned / Removed (April 6, 2026)
`/v2` (old MarketingLanding — preserved, Zach's reference only), `/v2/start`, `/signup`, `/onboarding` (built but not wired — needs post-B2B-signup wiring)

---

## Supabase Schema — Key Tables

`families` · `students` · `profiles` · `auth.users` · `reviews` · `locations` · `teachers` · `teacher_locations` · `teacher_availability` · `practice_sessions` · `contact_change_requests` · `studio_messages` · `square_invoices` · `payroll_periods` · `student_instruments` (junction) · `student_effective_rate` (VIEW — billing source of truth) · `leads` · `lp_prospects` · `tenants` · `schedule_blocks` · `family_files`

**Key enums (frontend must match exactly):**
- `student_status`: `active`, `paused`, `inactive`, `former`
- `lead_stage`: `inquiry`, `contacted`, `scheduled`, `enrolled`, `lost` (NOT "converted")
- `block_status`: `available`, `booked`
- `block_type`: `call_out`, `student_session`, `open_time`, `first_day`, `last_day`, `not_bookable`, `sub`, `meet_greet`, `teacher_training`
- `rate_tier` CHECK constraint: values `4500`, `4000`, or `3750` ONLY (in cents)
- `family_files.file_type` CHECK: includes `enrollment_agreement`

---

## Billing Architecture

- LP is the source of truth. Square is the payment processor only.
- Rate calculation: `sessions_per_month × rate_per_session` on student record
- `student_effective_rate` VIEW reads `rate_tier` from families live — always use this for billing math
- `rate_tier` stored in cents — use `rate_tier / 100.0` for display
- Zero-charge students: `rate_per_session=0`, `sessions_per_month=0`
- Square amounts in cents — always divide by 100 for display
- Card-on-file detection: use `card_last_four IS NOT NULL`, not `square_card_id IS NOT NULL`
- Square invoice search API: one location ID at a time — loop per location

---

## Paperclip Agent Architecture

**Platform:** paperclip.ing · VPS: DigitalOcean `143.198.25.186` · Port `3100` · Config: `/root/.paperclip/instances/default/config.json` · Data: `/home/paperclip/.paperclip`
**Start:** `su - paperclip -c "pm2 start 'paperclipai run' --name paperclip && pm2 save"`
**Deploy from:** `zach` user (not root — `--dangerously-skip-permissions` blocks on root)

**Two separate Paperclip businesses — always specify which:**

| Company | Purpose | CEO Agent |
|---|---|---|
| Adkins Enterprises (`8913078e-...`) | Music school operations | "Adkins Enterprises CEO" (Andrea role) |
| LP Diagnostics (`cb69dd3b-...`) | Receives all LP bug reports from n8n | "LP Diagnostics CEO" |

**Chain of command:** Zach/Alicia → Andrea (Adkins Enterprises CEO) → Studio Directors → Department Agents. NEVER bypass.
**Rule:** Always write skill/instruction files to D drive first. Then tell CEO agent to build agents pointing to those files. CEO agent submits hire requests — board approves.
**Routing:** Always route parallel build tasks to Paperclip — never open multiple Claude Code terminals manually.

**Paperclip Projects:**
| Project | Purpose |
|---|---|
| Prelaunch | LP CRM beta testing, bug fixes, QA, go-to-market prep |
| Onboarding | First customer onboarding flow, migration support |
| Growth | Outreach, go-to-market, first 10 paying customers |
| Adkins Ops | Adkins website, enrollment, Square monitoring |

---

# CURRENT STATE

## Recently Completed

- **Auto check-in engine** — `check_in_block()` rewired with payment gating, `teacher_tally` logic, `resolve_held_tallies()` trigger on `families.billing_status`. Frontend `useAutoCheckIn` hook fires every 60 seconds.
- **Enrollment agreement migration** — Google Apps Script pulled PDFs from Drive. Elkhorn + Omaha LIVE (61 families matched via email/phone/name fallback). Bellevue + Gretna stubbed. Uploaded to Supabase Storage: `family-files/enrollment-agreements/[location]/[family_id]/`. Inserted into `family_files`.
- **Documents UI** — `useFamilyFiles` hook, Documents section on family profile Director tab, Agreement status column on Families list with filtering, dashboard warning card for active families missing agreements.
- **LPD-10 performance audit (Paperclip)** — 5 of 9 query-bounding fixes completed: `useTeacherDashboard.ts`, `useRetentionData.ts`, `useScheduleGrid.ts`, `useParentPortal.ts`, `useFamilies.ts`.
- **Dead code cleanup (April 6, 2026)** — 1,576 lines removed. 8 confirmed orphaned files deleted. Stale duplicate `lessonpreneur/` directory at repo root deleted. TypeScript clean.
- **Route unification (April 6, 2026)** — all B2C CTAs now route to `/{loc}/signup`. Location color system synced to URL. Drum page copy fixed.
- **Lessonpreneur company in Paperclip** — wiped during Linux DB migration (Windows Postgres files incompatible). Needs rebuild.

---

# ACTIVE TASKS

## Immediate (Next to Execute)

1. **Paperclip: Rebuild Lessonpreneur company** — recreate LP Diagnostics CEO agent, rewire n8n webhook to new agent (path: `lp-bug-trigger`). Do NOT import n8n JSON — edit nodes directly.
2. **Claude Code: Fix Documents section** — full rewrite, not patch. Documents section rendering old Files UI.
3. **Claude Code: Fix JWT error** — "Invalid JWT" in Google Review AI compose modal. Full rewrite of auth call pattern.
4. **Supabase migration: Bellevue + Gretna enrollment agreement PDFs** — run same Google Apps Script pattern used for Elkhorn/Omaha.
5. **LPD-10 remaining 4 tasks** — dispatch to Paperclip next run. Status comment already posted with explicit instructions:
   - Upper bound in `Schedule.tsx` ~line 1501
   - Stale-closure guard + cleanup return in `useLocationHours.ts` ~line 40
   - `cancelled` flags in `useEffect` async fetches in `Dashboard.tsx` ~line 103 and `Families.tsx` ~line 1931

## Beta Session Checklist (Track Against This)

1. CRM full audit — every button/modal/form
2. Contact form → LP directory pipeline
3. Appointments full setup
4. Appointment notifications native to LP via QUO SMS — teacher + parent, booked/reminder/cancelled/rescheduled
5. Google Meet fallback — studio closure toggle converts lessons to Meet via Google Calendar API, fires native LP notifications with Meet link
6. End-to-end lifecycle smoke test: lead → convert → book → confirm → lesson or Meet flip
7. Mobile responsiveness audit — every page, one by one
8. TBD

## CRM Audit Fix List (Open)

- **Leads:** Silent mutations on instrument/location chips, notes, stage, `handleMarkLost`/Advance, DataGrid activity log
- **Students:** Bill Student routes to family billing (not one-off); retention cancel reverts status; status race condition reverts
- **Teachers:** Tenant from auth context not DB; standardize to `profile_locations` everywhere

---

# CODEBASE STRUCTURE

```
D:\music-school-os\app\
├── src/
│   ├── pages/
│   │   ├── public/           # LP marketing pages (LandingPageV2, VSLPage, etc.)
│   │   ├── admin/            # /admin/* routes (18 routes)
│   │   ├── teacher/          # /teacher/* routes (4 routes)
│   │   ├── parent/           # /parent/* routes (5 routes)
│   │   └── adkins/           # AdkinsLanding, instrument pages, SignupLanding
│   ├── components/
│   │   ├── public/           # LP marketing components
│   │   ├── shared/           # Shared UI (modals, tables, etc.)
│   │   ├── adkins/           # SiteHeader, VSLSection, InstrumentAtmosphere, ReviewsSection
│   │   ├── students/         # Student management UI
│   │   ├── teachers/         # Teacher management UI
│   │   └── layout/           # Shell layouts
│   ├── hooks/                # TanStack Query hooks (useFamilies, useTeacherDashboard, etc.)
│   ├── lib/                  # Supabase client, utilities
│   └── types/                # TypeScript types
├── supabase/
│   └── functions/            # Edge functions (deploy with --no-verify-jwt for webhook functions)
├── business-brain/           # Strategy docs, playbooks
├── docs/                     # Architecture docs
├── exports/                  # CSV exports, data
├── scripts/                  # PowerShell scripts
└── SQL/                      # Migration files
```

**Preserved orphaned files (banked features — do NOT delete):**
`OnboardingChecklist.tsx`, `OnboardingPipeline.tsx`, `SummerRetentionPanel.tsx`, `TrialBanner.tsx`, `InvoicesPanel.tsx`, `SquareSyncPanel.tsx`, `CalloutWizard.tsx`, `AccessDenied.tsx`, `StudentImportModal.tsx`, `CsvImportModal.tsx`, `StudentQuickCard.tsx`, `Reports.tsx`, `OnboardingWizardPage.tsx`, `EnrollmentForm.tsx`

---

# STANDARDS / RULES

## Non-Negotiable Build Rules

1. **Full rewrites only — never patch.** Delete broken sections and rebuild from scratch. Patches repeatedly fail.
2. **Verify frontend visibility after every Supabase data change.** Check how UI queries the data (block_type, status enums, join conditions, filters). Never say "done" until confirming data matches query patterns.
3. **Run a Supabase diagnostic before writing any feature prompt.** Identify gaps against full end-to-end requirements. Produce one complete prompt covering every surface the feature touches (database, hooks, UI, list views, dashboard indicators) before any code is written.
4. **Always filter with `tenant_id = '00000000-0000-0000-0000-000000000001'`** on every query.
5. **Schedule bookings require:** `status='booked'`, `block_type='student_session'`, `student_id` set.
6. **All scripts, bat files, terminal commands: Windows PowerShell only. Never CMD syntax.**
7. **Route changes:** Audit every file that links to a moved route before changing it.
8. **Before writing a build prompt:** Map where it goes, what connects to it, what breaks, what the full funnel flow is.
9. **Edge functions for third-party webhooks:** Deploy with `--no-verify-jwt` flag.
10. **TypeScript build gate (`tsc -b`)** removed from build script — do not re-add.
11. **`vercel --prod`** required manually if auto-deploy doesn't trigger.
12. **LP is always source of truth.** Calendar integrations are push-only mirrors.
13. **White-label:** Each customer gets their own Supabase project. Website never calls Supabase directly.
14. **React:** Never use HTML `<form>` tags. Use controlled state + `onClick` handlers.
15. **Atmospheric background:** Real SVG DOM elements. Not CSS pseudo-elements.
16. **Mobile-first always.** Every prompt must include mobile-first requirement and Pixel 7 (412px) test instruction.
17. **Never delete files without diagnostic first.** Confirm zero imports before removing anything.

## Supabase Patterns That Work

- Multi-statement queries in MCP only return the last result — run each diagnostic as a separate `execute_sql` call
- `apply_migration` for schema changes; `execute_sql` for read-only diagnostics
- Filter every query with both `tenant_id` and specific `location_id`
- `student_effective_rate` view = source of truth for billing calculations (reads in cents)
- `rate_tier` CHECK: `4500`, `4000`, or `3750` only — zero-charge students use `rate_per_session=0`, `sessions_per_month=0`
- Raw SQL user creation: coerce GoTrue string columns to empty strings (not NULL)
- Schedule block enums: cast explicitly as `'available'::block_status`, `'open_time'::block_type` on inserts
- `EXTRACT(DOW FROM block_date)`: Sunday=0 → Saturday=6
- Calendar month boundaries: `date_trunc('month', now())::date` and `(date_trunc('month', now()) + interval '1 month')::date`
- Studio director location scoping: join `profile_locations` → `locations` → `square_location_id`
- Teacher queries use `teacher_locations` table (not `profile_locations`)
- `get_star_context()` RPC = single server-side call returning full business JSONB snapshot
- Batch UPDATE statements in groups of ~100 per `execute_sql` for large migrations

## Other Critical Technical Rules

- SignWell signed PDFs require a separate call to `GET /documents/{id}/completed_pdf` for raw bytes — URL is not in the document detail API response
- Square invoice amounts in cents — always divide by 100
- Card-on-file detection: `card_last_four IS NOT NULL`
- Paperclip `deploymentMode`: valid values are `local_trusted` and `authenticated` only (`cloud` is not valid)
- Paperclip CLI start: `paperclipai run` (not `paperclipai start`)
- Bootstrap admin via: `paperclipai auth bootstrap-ceo`
- Register allowed hostnames: `paperclipai allowed-hostname [ip]` before browser connections
- n8n: Edit nodes directly — do NOT import n8n JSON

## Prompt Standards

- Every implementation prompt to Claude Code gets a **verification checklist**
- Paperclip prompts need: title, priority, and proper hierarchical routing
- All prompts assume full rewrite, not patch
- Parallel build tasks → Paperclip agents, not multiple Claude Code terminals

## Session Modes (Ask at Start of Each Session)

| Mode | Focus |
|---|---|
| Build | Write Claude Code prompts for Builder Agent |
| Strategy | Product thinking, feature design, UX decisions |
| Ops | Adkins Music Lessons operations and school management |
| Course | 7-Figure Music Teacher content and infrastructure |

---

# KNOWN ISSUES

| Issue | Status |
|---|---|
| Documents section rendering old Files UI | Open — handed to Claude Code |
| "Invalid JWT" in Google Review AI compose modal | Open — handed to Claude Code |
| Silent mutation pattern | Systemic — mutations confirm but don't persist, don't invalidate cache, don't surface errors |
| Teachers page "Add Row" | Silently fails |
| Teacher role permissions | Teachers must be blocked from BOTH student profiles AND family profiles |
| `OnboardingWizardPage` built but not wired | No navigation to `/onboarding` after B2B signup completes |
| Microsoft Clarity installed but not reviewed | High priority — session recordings sitting unused |
| VSL video placeholders | Real videos not yet shot or uploaded |
| Bellevue + Gretna enrollment agreement PDFs | Stubbed — migration not run yet |
| Lessonpreneur company in Paperclip | Wiped during Linux DB migration — needs full rebuild |
| n8n LP bug pipeline | Broken — depends on Paperclip LP company rebuild |
| LPD-10 performance audit | 4 remaining tasks |

---

# RECENT CHANGES

| Date | Change |
|---|---|
| April 8, 2026 | LPD-10 performance audit 5/9 tasks complete via Paperclip |
| April 8, 2026 | Two bugs handed to Claude Code: Documents UI, JWT error |
| April 6–8, 2026 | Enrollment agreement migration: Elkhorn + Omaha live (61 families), Bellevue + Gretna stubbed |
| April 6–8, 2026 | Documents section UI built: family profile tab, Families list column, dashboard warning card |
| April 6, 2026 | Auto check-in engine fully rewired with payment gating and `teacher_tally` logic |
| April 6, 2026 | Route cleanup: all B2C CTAs → `/{loc}/signup`, location color sync fixed |
| April 6, 2026 | Dead code cleanup: 1,576 lines removed, 8 files deleted, duplicate codebase deleted |
| April 6, 2026 | Tenant slug updated: `adkins` → `adkins-music-lessons` |
| April 6, 2026 | Drum page copy fixed: "uncomfortable" → "uncontrollable" |

---

# NEXT ACTIONS

**Ordered by priority:**

1. **Paperclip: Rebuild Lessonpreneur company** — recreate LP Diagnostics CEO agent, rewire n8n webhook to new agent (`lp-bug-trigger`). Edit n8n nodes directly — do NOT import JSON.
2. **Claude Code: Fix Documents section** — full rewrite. Documents section rendering old Files UI.
3. **Claude Code: Fix JWT error** — Google Review AI compose modal. Full rewrite of auth call pattern.
4. **Supabase migration: Bellevue + Gretna enrollment agreement PDFs** — run same Google Apps Script pattern used for Elkhorn/Omaha.
5. **LPD-10 remaining 4 tasks** — dispatch to Paperclip next run.
6. **Begin Beta Session Checklist Item 1** — CRM full audit, every button/modal/form.
7. **Wire OnboardingWizardPage** — post B2B signup → `/onboarding`.
8. **Review Microsoft Clarity session recordings** — high-value behavior data sitting unused.
9. **Shoot VSL videos** — LP landing page fold + `/start` page placeholders need real video.

---

## Banked Features (Do Not Build Until Core CRM Solid)

- **Auto-triggered enrollment agreement** — fires when `first_lesson_date` set → SignWell email/SMS → tracks signature → QUO SMS reminder if unsigned → signed PDF locks to family profile permanently
- **Monthly Progress Celebration (autopilot)** — personalized QUO SMS monthly per active family. Sources: `session_log`, teacher notes, attendance streak, months enrolled. Build after QUO SMS live.
- **Seasonal Retention Wave Campaigns** — AI multi-wave outreach by calendar. 3 waves: re-engagement → at-risk → scarcity. Build after QUO SMS + Monthly Progress.
- **White-label API layer** — LP public API endpoints: `leads/submit`, `appointments/book`, `locations/hours`, `availability`. Wire before first white-label customer.
- **LP Integrations page** — Google Calendar, Apple iCal, Outlook/M365, QUO SMS, Twilio, Mailchimp/Klaviyo, Gmail, Square, Stripe, Meta/GA4/TikTok, Google Drive, Slack/Teams, SignWell, Zoom.
- **Guitar page interactive chord builder** — SVG neck, 5 chord buttons (C G D Am Em), WAV audio, static display only.
- **Vocal page** — 16-section framework approved and banked.
- **n8n Google Maps Prospecting Agent**
- **Teacher document upload layered modal** — W-9, Contract, General sections
- **Teacher callout/time-off tracker** — auto-flag at 2+ absences in 60 days
- **Digital W-9 in Teacher App**
- **Teacher Expense & Receipt Tracker**

---

*End of AI_CONTEXT.md — If you are a new AI session reading this, this file is current as of April 8, 2026. Start by asking Zach which session mode applies (Build / Strategy / Ops / Course) before proceeding.*
