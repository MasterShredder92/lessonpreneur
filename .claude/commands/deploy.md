Run pre-deploy safety check then deploy Lessonpreneur
to production. Arguments: $ARGUMENTS

STOP — Do not deploy until every item below is confirmed.
Deploying broken code to production is not acceptable.

PRE-DEPLOY CHECKLIST

CODE SAFETY
- [ ] No console.log statements left in production code
- [ ] No hardcoded credentials, API keys, or secrets
- [ ] No TODO comments on critical functionality
- [ ] No TypeScript errors being silently ignored
- [ ] No commented-out broken code left behind
- [ ] Environment variables confirmed in .env and Vercel

DATABASE SAFETY
- [ ] All migrations applied to production Supabase
- [ ] RLS policies confirmed on every modified table
- [ ] No destructive queries without confirmed backups
- [ ] No schema changes that break existing queries
- [ ] tenant_id filtering confirmed on all new queries

FUNCTIONALITY SAFETY
- [ ] Every new feature verified end to end
- [ ] Every modified feature verified end to end
- [ ] No previously working features now broken
- [ ] All routes resolve correctly
- [ ] All forms save correctly
- [ ] All data loads correctly

PERFORMANCE SAFETY
- [ ] No unbounded queries introduced
- [ ] No schedule queries beyond 2 week window
- [ ] No page loads that fetch unnecessary data
- [ ] No new performance regressions

SECURITY SAFETY
- [ ] No new open security doors
- [ ] Auth gates confirmed on all protected routes
- [ ] Role permissions confirmed correct
- [ ] No sensitive data exposed to wrong roles

If any item above is unchecked, stop and fix it.
Do not proceed to deploy with known issues.

DEPLOY PHASE
Once all items are confirmed:

1. Run build check:
   npm run build

2. Confirm build succeeds with no errors

3. Deploy to production:
   vercel --prod

4. Confirm deployment URL is live

5. Run smoke test on production:
   - Load the app
   - Confirm login works
   - Confirm dashboard loads with real data
   - Confirm schedule loads correctly
   - Confirm billing data displays correctly
   - Confirm no console errors on production

REPORT
After deploy:
- Confirm deployment URL
- Confirm smoke test passed
- List every feature that was deployed
- Flag anything that needs monitoring