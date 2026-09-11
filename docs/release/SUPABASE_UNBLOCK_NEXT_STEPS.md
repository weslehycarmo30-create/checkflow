# Supabase unblock: controlled first contact

Never put a password, token, database URL with credentials, or service key in a file, shell history, or ticket.

1. **One authentication attempt only (read-only).** Use approved interactive Supabase CLI authentication. Expected: authenticated CLI identity. STOP on error; do not retry variations or inspect poolers.
2. **Read migration history.** Run `npx supabase migration list`. Expected: baseline through `202608280001` applied and exactly the eight manifest versions pending. STOP on drift.
3. **Validate local package.** Run `node scripts/checkflow-remote-rollout.mjs --precheck` then `node scripts/checkflow-remote-rollout.mjs --dry-run`. Expected PASS/READY; neither performs remote I/O.
4. **Remote dry run.** Run `npx supabase db push --dry-run`. Expected: exactly the eight manifest versions in order. STOP on any mismatch/auth error.
5. **STOP for authorization A.** Record dry-run output and obtain explicit human approval before write.

Do not use `migration repair`, SQL editor copy/paste, or a second authentication experiment as a workaround.
