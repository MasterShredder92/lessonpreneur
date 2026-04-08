Build a new feature for Lessonpreneur. Arguments: $ARGUMENTS

Before writing a single line of code, complete this
planning phase and show it to Zach for approval:

PLANNING PHASE
1. Restate what the feature is and what it does
2. Map the full chain:
   - What database tables does this read from?
   - What database tables does this write to?
   - What existing pages connect to this?
   - What new routes are needed?
   - What components already exist that can be reused?
   - What new components need to be built?
   - What happens when the user clicks, submits, navigates?
   - What role permissions apply?
   - What could break elsewhere when this is added?
3. Identify performance risks:
   - Could any query return unbounded data?
   - Does anything need pagination?
   - What date range limits apply?
4. Identify security requirements:
   - What RLS policies are needed?
   - What auth gates are needed?
   - What role restrictions apply?
5. Estimate scope:
   - Files to create
   - Files to modify
   - Database migrations needed

Wait for Zach to approve the plan before building.

BUILD PHASE
Once approved, build in this exact order:
1. Database migration first (if needed)
2. Supabase RLS policies
3. TypeScript types
4. Data fetching hooks
5. Backend logic
6. UI components
7. Route registration
8. Navigation connections
9. Loading states
10. Error states
11. Mobile responsiveness

VERIFICATION PHASE
After building, run through every item:
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
- [ ] End to end chain verified

Do not say done until every box is checked.
If anything is unchecked, finish it before reporting done.