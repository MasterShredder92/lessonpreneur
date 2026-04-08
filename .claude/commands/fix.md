Fix a broken feature in Lessonpreneur. Arguments: $ARGUMENTS

DIAGNOSIS PHASE
Before touching any code, diagnose the full problem:

1. Identify the root cause — not the symptom
   - What is actually broken?
   - Why is it broken?
   - Where exactly in the code is the failure?
   - Is this a frontend, backend, database, or
     connection problem?

2. Map the blast radius
   - What else depends on this broken thing?
   - What else is broken because of this?
   - What will be affected when we fix it?
   - Are there other places in the codebase with
     the same problem?

3. Trace the full chain
   - Where does the data come from?
   - Where does it go?
   - Where exactly does the chain break?
   - What is missing or disconnected?

Show the diagnosis to Zach before touching anything.

FIX PHASE
Once diagnosis is confirmed:

- Full rewrite of the broken section — never patch
- Delete the broken code entirely
- Rebuild from scratch clean
- Connect every piece of the chain properly
- Do not leave any loose ends

Fix in this order:
1. Database/migration issues first
2. RLS and security issues second
3. Backend and data fetching third
4. UI and frontend fourth
5. Navigation and routing fifth
6. Loading and error states last

VERIFY PHASE
After the fix:
- [ ] Root cause confirmed resolved
- [ ] All connected pieces verified working
- [ ] No new problems introduced
- [ ] Real data loads correctly
- [ ] Navigation works in both directions
- [ ] RLS and auth confirmed
- [ ] No console errors
- [ ] No unbounded queries
- [ ] Mobile works
- [ ] Loading states present
- [ ] Error states present

Do not say fixed until every box is checked.
Report exactly what was broken, what was rebuilt,
and what was verified.