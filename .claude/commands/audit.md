Perform a full codebase audit on the Lessonpreneur app.

Check every single one of the following and report findings
grouped by severity: CRITICAL, WARNING, and INFO.

CONNECTIVITY AUDIT
- Every button, link, and CTA — does it go somewhere real?
- Every form — does it save to the database?
- Every page — does it load real data from Supabase?
- Every navigation item — does the route exist?
- Any orphaned components not connected to anything?
- Any dead routes that lead nowhere?

SECURITY AUDIT
- Every Supabase table touched — RLS policy confirmed?
- Every protected route — auth gate confirmed?
- Role-based access enforced (owner/admin/studio_director/
  teacher/student)?
- Any tables exposed without tenant_id filtering?
- Any open security doors that need to be closed?

PERFORMANCE AUDIT
- Any queries without date range limits?
- Any queries that could return more than 500 rows without
  pagination?
- Any schedule queries pulling beyond 2 weeks?
- Any unbounded data fetches on page load?
- Any missing indexes on filter columns?

DATA INTEGRITY AUDIT
- Every Supabase query includes tenant_id filter?
- Schedule bookings have status='booked',
  block_type='student_session', student_id set?
- Square invoice amounts divided by 100 for display?
- rate_tier values limited to 4500, 4000, or 3750?
- student_effective_rate view used for billing calculations?

CODE QUALITY AUDIT
- Any console errors?
- Any TypeScript errors being silently ignored?
- Any loading states missing?
- Any error states missing?
- Any hardcoded values that should be constants?

OUTPUT FORMAT
For each issue found:
- File path and line number
- What the problem is
- Why it matters
- Exact fix required

End with a prioritized fix list — CRITICAL items first.
Do not summarize vaguely. Be specific and surgical.