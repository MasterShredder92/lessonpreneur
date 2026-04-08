Run a full verification pass on whatever was just built
or modified. Arguments: $ARGUMENTS

This command exists because done does not mean done
until everything on this list is confirmed.

Go through every single item. Do not skip anything.
Do not assume something works — verify it.

CONNECTIVITY
- [ ] Every button goes somewhere real
- [ ] Every link goes somewhere real
- [ ] Every form saves to the correct database table
- [ ] Every page loads real data from Supabase
- [ ] Every route exists and resolves correctly
- [ ] Navigation works forward and backward
- [ ] No orphaned components
- [ ] No dead ends in the user flow

DATABASE
- [ ] Every query includes tenant_id filter
- [ ] No unbounded queries
- [ ] Schedule queries limited to 2 weeks max
- [ ] Pagination exists on any list over 50 records
- [ ] Square amounts divided by 100 for display
- [ ] rate_tier values are 4500, 4000, or 3750 only
- [ ] student_effective_rate used for billing
- [ ] Schedule blocks have correct status, block_type,
      and student_id

SECURITY
- [ ] RLS policies confirmed on every table touched
- [ ] Auth gates on every protected route
- [ ] Role permissions enforced correctly
- [ ] Owners and admins see all locations
- [ ] Studio directors see assigned location only
- [ ] Teachers and students see no financial data
- [ ] No open security doors
- [ ] tenant_id filtering on every query

UI AND PERFORMANCE
- [ ] Loading states present on every data fetch
- [ ] Error states present on every data fetch
- [ ] Mobile responsive on all screen sizes
- [ ] No console errors
- [ ] No TypeScript errors being silently swallowed
- [ ] Design matches LP standards — no cheap defaults,
      no emoji UI, no placeholder styling
- [ ] Glassmorphism V9 design system applied correctly
- [ ] Brand colors applied correctly per location

FINAL CHECK
- [ ] End to end chain verified from first click to
      final data save
- [ ] Nothing that was working before is now broken
- [ ] No loose ends left behind

Report results as:
PASSED — item confirmed working
FAILED — item broken, with exact location and fix needed
SKIPPED — item not applicable, with reason

Do not report everything as passed without actually
checking. If something fails, fix it before finishing.
