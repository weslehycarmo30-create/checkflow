# CheckFlow release command sheet

## SAFE NOW — local/read-only

```powershell
git status -sb
git rev-parse HEAD
git rev-parse origin/main
node scripts/checkflow-remote-rollout.mjs --precheck
node scripts/checkflow-remote-rollout.mjs --dry-run
```

## REQUIRES AUTHORIZATION — remote read-only

```powershell
npx supabase migration list
npx supabase db push --dry-run
```

Expected: baseline applied; precisely eight manifest migrations pending/in dry-run order. STOP otherwise.

## REMOTE WRITE — authorization A only

```powershell
npx supabase db push
```

Expected: eight migrations applied in order. STOP on first error; do not repair or rerun selectively.

## VALIDATION — after DB write

Run `supabase/preflight/p1_postflight_remote_read_only.sql` in approved read-only SQL session, save JSON locally, then:

```powershell
node scripts/checkflow-postflight-classify.mjs <postflight.json>
```

Expected `GO`: mandatory migration/catalog/RLS/integrity rows PASS, exactly six accepted legacy snapshots, and only accepted Storage placeholder review. Any FAIL is NO-GO.

## DEPLOY — authorization B/C only

Deploy approved artifact to staging, then:

```powershell
node scripts/checkflow-staging-canary-smoke.mjs --target=https://<approved-staging-host>
```

Expected PASS; then execute the human canary. Production deploy follows only staging/canary GO and authorization C. `git push` needs independent authorization D.
