# Piloto 001 — release engineering readiness

- Baseline autorizado: `e31198765f24b4f7f3a907e9599bb958e5dc8016`.
- O gate local valida o baseline como ancestral, hashes/order das oito migrations, hash do postflight, focused/skipped tests, Node, TypeScript, build, lint, diff check e audit runtime. Não contém credenciais, URL remota ou comando de escrita remota.
- Failure injection: 4/4 (`hash`, ausência, ordem, worktree sintético) rejeitados.
- Postflight: cobre history, constraints, indexes, functions/grants, triggers, RLS/policies, state machine, duplicidades, cross-tenant, snapshots/6 legacy, NC, action plans, attachments e referências Storage.
- E2E browser segue bloqueado pela infraestrutura Storage local Windows; não é mascarado.

## Estado

Remote write commands are prepared in `PILOTO_001_REMOTE_ROLLOUT_EXECUTION.md`, mas exigem **HUMAN AUTHORIZATION REQUIRED** e não foram executados.

ZERO REMOTE SQL; ZERO REMOTE MIGRATION; ZERO REMOTE DATA/AUTH/STORAGE CHANGE; ZERO DEPLOY; ZERO PUSH.
