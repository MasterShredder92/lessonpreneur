# Duplicate inquiry / enrollment handling

## Entity flow (current)

1. **Website form** → Edge `public-lead-submit` inserts **`intake_submissions`** (immutable payload) and one or more **`leads`** (`stage = inquiry`), each with `intake_submission_id`, `location_id`, `family_id`.
2. **Family** is resolved by **primary email** (normalized) and **normalized phone digits** (same tenant) before inserting a new family row when needed.
3. **Convert** (RPC `convert_lead_to_student`) **always inserts a new `students` row** for that conversion, sets **`leads.converted_student_id`**, `stage = enrolled`, and links **`intake_submissions.converted_student_id`** when applicable. Every inquiry row remains accounted for; multiple location interests stay visible on separate leads.

Implementation: migration `20260423120000_student_duplicate_manual_review.sql` (replaces the older auto-merge behavior in `20260422120000_lead_conversion_dedupe.sql` for `convert_lead_to_student` once migrations have run in order).

## Dedupe rules (implemented)

| Step | Rule |
|------|------|
| Intake → family | Match `families.primary_email` (lower/trim); else match **same 10+ digit** phone on tenant. |
| Convert → family | If `p_family_id` null: match family by lead **email**, then **phone digits** (`normalize_phone_digits`); else insert family. |
| Convert → student | **No automatic merge** of roster identity. If an **active** student already exists on that family with the **same normalized first + last name** as the lead, the RPC still **inserts** the new student, sets **`students.counts_toward_family_tier = false`** on the new row (until staff resolve), creates a **`student_duplicate_reviews`** row (`status = pending`), and returns **`possible_duplicate_review`** in the JSON payload. Staff choose **keep separate** (siblings) or **merge into existing** after review. |

### Ambiguous vs high-confidence

- **Family-level match (still automatic):** same tenant, normalized email or phone → reuse **`families`** row. Safe for “same household.”
- **Same child vs sibling:** same family + same/similar student name is **not** treated as provably the same person. The system **flags** a possible duplicate instead of collapsing two children into one roster row.
- **Different child names:** two students; no duplicate review unless the same name collision occurs again later.
- **Same name, different families:** no cross-family merge; operators pick the correct family in the Convert modal.

RPC returns a **`possible_duplicate_review`** object (review id, candidate and new student ids, reason) when a pending review was created; otherwise that field is null. It does **not** return `merged_existing_student` (legacy; removed with the manual-review migration).

## Staff resolution

- Pending items are listed in-app (e.g. **Families** banner) and resolved via RPC **`resolve_student_duplicate_review`** (`keep_separate` or `merge_into_existing`).
- **`keep_separate`:** both students count toward family tier; duplicate flag cleared on the newer row.
- **`merge_into_existing`:** newer student row retired, leads and schedule blocks repointed to the canonical student. When available, **`apply_family_rate_tier`** should be run for the family after resolve (app hooks attempt this).

## Historical duplicate rows already in the database

Forward behavior is fixed for **new** conversions; this **does not** repair old bad merges or duplicate active rows automatically.

Cleanup is **separate work**: identify same-`family_id` + same normalized name pairs, choose a canonical student, re-point FKs (`leads`, `schedule_blocks`, billing references as needed), then retire the extra row. Optional: one-off SQL or admin tooling — not part of the conversion migration.
