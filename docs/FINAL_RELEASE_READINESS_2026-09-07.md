# CheckFlow — final release readiness — 2026-09-07

## 1. Baseline

- HEAD inicial: `06e35ea514dfbf41ecc550ddd081cbf14e65b277`; `origin/main`: `68852bd55ff67bda30da1bd40df02a61559d7d32`.
- `main` estava 4 commits à frente; `git diff` e `git diff --cached` estavam vazios.
- Arquivos untracked existentes, `supabase/.temp/`, `supabase/preflight/` e `test-results/` foram preservados. Nenhuma ação remota foi realizada.

## 2–5. P1-01, P1-02, P1-03, P1-04 e state machine

As quatro migrations P1 foram reaplicadas em PostgreSQL local isolado e revisadas contra funções, triggers, índices, RLS, RPCs, policies, frontend e testes. A baseline aceitava cinco ataques: mover vínculos históricos, RPC de foto por membro removido, vínculo a objeto inexistente, completion declarado pelo cliente e deadlock NC/plano.

Forward fixes locais, nesta ordem:

1. `202609070001_close_historical_identity_and_membership_gaps.sql`
2. `202609070002_validate_completion_from_persisted_answers.sql`
3. `202609070003_record_non_conformity_atomically.sql`
4. `202609070004_fail_fast_on_lifecycle_lock_conflicts.sql`

P1-01 congela estrutura depois de assignment/execution. P1-02 limita uma execution por assignment e um ciclo operacional por executor/checklist. P1-03 aceita `in_progress → paused → in_progress → completed`; completed é terminal. P1-04 torna plano/NC e resposta/anexo atômicos dentro do Postgres. Completion valida snapshot, respostas persistidas, NC para falha obrigatória e evidência; resumo/conformidade são calculados pelo servidor.

## 6–7. Matriz de locks e concorrência

| Operação | Ordem / proteção | Resultado |
| --- | --- | --- |
| Estrutura | checklist NO KEY UPDATE NOWAIT | recusa se protegido ou concorrente |
| Assignment/reassign | checklist → assignment | ciclo único; retry após contenção |
| Start | checklist → execution | UNIQUE por assignment |
| Pause/resume/complete | execution | state machine e completion server-side |
| Answer/evidence | execution → answer/attachment | RPC, objeto/uploader e únicos |
| NC | execution → answer → NC | RPC, um NC por answer |
| Action plan | action_plan/NC | um plano por NC e sync transacional |

Havia inversão real entre UPDATE de NC e criação de plano; ela foi reproduzida como deadlock. NOWAIT elimina o ciclo: o concorrente recebe 55P03, atualiza o estado e faz retry. Doze cenários de sessões independentes passaram: A duas assignments, B dois starts, C dois completes, D pause/complete, E estrutura/assignment em ambas as ordens, F estrutura/start em ambas as ordens, G planos, answer/complete nas duas ordens e a inversão NC/plano.

## 8–10. RLS, multiempresa e histórico

Gates SQL cobriram RLS, membership inativa/removida, tenant B e relações cross-tenant. Helpers SECURITY DEFINER usam `search_path=''`; EXECUTE foi revogado de funções internas. RPCs exigem membro ativo e validam executor/objeto. Após completion, ataques contra checklist, section, item, assignment, execution, answer, attachment, NC e vínculos com ciclo novo foram bloqueados. Nova assignment cria ciclo independente e não muda histórico.

## 11. Storage

Postgres e Storage não possuem transação comum. Antes do vínculo, objeto deve existir, ser do uploader e respeitar o prefixo. A remoção client-side foi suspensa: uma resposta RPC perdida pode ocorrer após commit, e compensação automática poderia apagar evidência legítima. Órfão residual é **P2 operacional**; cleanup precisa de operador, inventário e janela sem upload/vinculação.

## 12. Auth e security review

Varredura não encontrou token, JWT, chave privada ou `.env` real versionado. `SUPABASE_SERVICE_ROLE_KEY` aparece somente no Worker server-side e fixtures. Frontend usa chaves públicas. O único `dangerouslySetInnerHTML` é o script estático de tema; não recebe entrada de usuário. Não houve achado comprovado de XSS, open redirect, tenant ID confiado do navegador ou privilege escalation.

## 13–14. Dependências e npm audit

- Next 16.2.6 → 16.3.4; React/react-dom/RSC 19.2.6 → 19.2.8.
- sharp 0.34.5 → 0.35.3; PostCSS 8.5.23; nanoid 3.3.18.
- Vite 8.0.13 → 8.2.2; @cloudflare/vite-plugin 1.37.1 → 1.54.4.

`npm audit`: antes 23 (15 high, 7 moderate, 1 low); depois 16 (8 high, 7 moderate, 1 low; zero critical). Restam principalmente vinext/image-size, wrangler/miniflare e Drizzle tooling. Atualizar vinext para beta major é risco desproporcional nesta rodada; classificado P2 de tooling/build e deve ser reavaliado antes de escalar o piloto.

## 15–16. Harness e testes

`scripts/sql-local-gates.mjs` exige container local explícito `supabase_db_*`, recusa Docker remoto, cria banco isolado `checkflow_gate_*` e preserva bancos existentes. `release-adversarial.mjs` cobre seis ataques; `release-concurrency.mjs` usa sessões independentes. Falta `supabase/config.toml`; o harness não depende dele.

- 14/14 migrations passaram no banco isolado final.
- 8/8 gates SQL passaram, inclusive NC atomicity.
- 6/6 ataques dirigidos bloqueados; 12/12 cenários concorrentes passaram.
- `npm test`: 36/36; TypeScript e build passaram.
- Lint passou com 7 warnings preexistentes de `window.location.href`.
- `git diff --check` passou.

Os testes Node são em boa parte static/source-text; SQL é integração real. E2E HTTP autenticado não foi repetido nesta rodada.

## 17–18. Migrations e preflight

Pendentes para a rodada humana, em ordem: P1-01, P1-02, P1-03, P1-04 e as quatro forward fixes de 20260907 acima. O novo `supabase/preflight/p1_integrated_remote_read_only.sql` usa somente `BEGIN READ ONLY`, SELECT/CTE e COMMIT. Foi validado localmente contra baseline pré-P1; não foi executado remoto. Cobre history, schema, constraints, indexes, functions, triggers, RLS/policies, duplicates, lifecycle, snapshots, NC/plans/anexos, órfãos, tenant links e pré-condições de índices.

## 19–20. Backup e rollback

Seguir `docs/CHECKFLOW_START_BACKUP_ROLLBACK_RUNBOOK.md`: congelar writes, registrar SHA/versões, fazer backup lógico verificável e inventário/cópia autorizada de Storage; aplicar em ordem; executar postflight e smoke staging. Falha pré-commit: abortar. Falha pós-commit: preferir forward-fix. DROP não é rollback seguro para integridade em tráfego; restore de backup é decisão de incidente com downtime e validação de Storage. Não há rollback destrutivo automático.

## 21–23. Riscos residuais, P2 e P3

P0: 0 conhecido localmente. P1: 0 conhecido após forward fixes locais. P2: 16 advisories npm residuais, órfãos de Storage retidos, sete warnings de navegação e E2E autenticado pendente. P3: ergonomia `supabase/config.toml` e modernização major do vinext.

## 24. Readiness Piloto Wesley 001

**NOT READY** até preflight remoto, backup, migration/postflight e homologação de staging humanos. Localmente há evidência para Auth, isolamento, lifecycle, reexecução, histórico, Storage e NC/action plan. Billing, onboarding e analytics não são bloqueadores deste piloto.

## 25. Veredito

**A — READY FOR REMOTE PREFLIGHT**

Significa somente que um humano pode executar o preflight consolidado remotamente, sem escrita. PASS sem FAIL/REVIEW material, backup confirmado, migrations sequenciais, postflight e staging são gates posteriores.
