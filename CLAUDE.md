# LESSONPRENEUR — PROJECT RULES

Stacks on top of global CLAUDE.md. All global rules apply.
These are Lessonpreneur-specific rules and context.

---

## WHAT THIS IS

Lessonpreneur is a full business operating system for music
school owners. Not a CRM. A complete platform covering
leads, scheduling, students, teachers, billing, two-way SMS,
automation, and AI-powered growth tools.

North star: Owner runs their school from their phone in
15 minutes a day.

Built by Zach Adkins — owner of Adkins Enterprises LLC,
four-location music school, $1M+/year revenue.

---

## TECH STACK

- React 19 / Vite / TypeScript — frontend
- Supabase — backend and database
- Vercel — deployment (vercel --prod for manual deploys)
- n8n — automation workflows
- QUO SMS — two-way SMS communication
- Square — billing processor only (LP is source of truth)
- SignWell — contracts and document signing
- GitHub: MasterShredder92/lessonpreneur

---

## DATABASE CONSTANTS

Supabase project ID: dhsyxyhtoadrqfrlmsqe
Tenant ID: 00000000-0000-0000-0000-000000000001
Company UUID: 8913078e-2c4d-4fc7-86c8-fd1d86a11616

Location UUIDs:
- Gretna:   40c67ffc-91b5-46a9-94bd-6ddffdfb7638
- Omaha:    d48229c1-b70a-4d29-893e-5079887dab76
- Bellevue: f7b52dd5-12ee-437f-9c60-f8adf454ac31
- Elkhorn:  cebd97d4-c241-4de2-8ade-49e5cc0070d5

Location brand colors (apply automatically, never ask):
- Omaha:    #D41113 red
- Gretna:   #00A651 green
- Bellevue: #A333FF purple
- Elkhorn:  #00A5E8 baby blue

LP brand palette:
- Background: #020209
- Pink:       #D4226A
- Orange:     #FF5500
- Gold:       #FFB800
- Font:       Plus Jakarta Sans 800-900 weight
- Design:     V9 glassmorphism

---

## SUPABASE RULES

- EVERY query must include:
  tenant_id = '00000000-0000-0000-0000-000000000001'
- student_effective_rate view = source of truth for billing
- Square invoice amounts stored in cents — divide by 100
- Square invoice statuses: PAID, UNPAID, SCHEDULED,
  CANCELED, REFUNDED, PARTIALLY_REFUNDED
- Calendar month boundaries:
  date_trunc('month', now())::date
  (date_trunc('month', now()) + interval '1 month')::date
- rate_tier CHECK constraint: 4500, 4000, or 3750 only
- Zero-charge students: set at student level
  (rate_per_session=0, sessions_per_month=0)
- Studio director scoping: join profile_locations →
  locations → square_location_id
- Teacher queries use teacher_locations, not
  profile_locations
- Raw SQL user creation: empty strings not NULL for all
  GoTrue string token columns
- get_star_context() RPC = full business JSONB snapshot,
  granted to authenticated and service_role

---

## SCHEDULE RULES

- All sessions are 30-minute increments only
- 60-minute sessions = two back-to-back 30-minute slots
- Availability = "Open Time" placeholder entries
- NEVER pull open-ended schedule data
- Default query window: current week + 1 week ahead only
- Schedule bookings require:
  status='booked'
  block_type='student_session'
  student_id set
- Location matching is strict

---

## SECURITY RULES

- RLS must be confirmed on every table touched
- Auth gates required on every protected route
- Role hierarchy: owner → admin → studio_director →
  teacher → student
- Owners/admins see all locations
- Studio directors see assigned location only
- Teachers and students see no financial data
- White-label: each customer gets their own Supabase
  project — website never calls Supabase directly
- Edge functions with third-party webhooks:
  deploy with --no-verify-jwt flag
- SignWell PDF download via /documents/{id}/completed_pdf
  (raw bytes, not URL in response body)

---

## BUILD RULES

- Full rewrites only — never patch broken code
- TypeScript build gate (tsc -b) removed — do not re-add
- vercel --prod required manually unless auto-deploy confirmed
- All scripts and commands: Windows PowerShell only,
  never CMD
- After any Supabase data change, verify frontend can
  see it by checking block_type, status enums, join
  conditions, and filters before calling it done
- Parallel tasks go to Paperclip — never open multiple
  Claude Code terminals manually

---

## PAPERCLIP WORKFLOW

Claude Code = execution only.
Claude.ai = architecture, strategy, prompt writing.
Zach relays prompts between the two manually until
Paperclip automates the relay.

Paperclip VPS: DigitalOcean 143.198.25.186
Chain of command: Zach/Alicia → Andrea → Studio Directors
→ Department Agents. Never bypass.

Every prompt sent to Claude Code must include a
verification checklist. Never confirm done without it.

---

## WHAT DONE ACTUALLY MEANS

A feature is not done until:
- [ ] Real data loads from Supabase
- [ ] All buttons and links go somewhere real
- [ ] Full navigation chain works both directions
- [ ] RLS and auth verified
- [ ] Mobile responsive
- [ ] Loading states present
- [ ] Error states present
- [ ] No console errors
- [ ] No unbounded queries
- [ ] No orphaned components
- [ ] No open security doors
- [ ] End-to-end chain verified

If any item is unchecked, it is not done.
Say what is missing and finish it.