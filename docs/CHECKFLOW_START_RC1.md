# CheckFlow Start — Release Candidate 1

## Identidade

- Produto: CHECKFLOW START
- Branch RC: `codex/checkflow-start-rc1`
- SHA base `origin/main`: `eee7c64f36959284a12a5b06bc433b3358809fbd`
- Estado funcional aprovado herdado: `26281d1e1b0b1cba96d7ff0465f23d4dc1264a9e`
- Status: **PILOT READY LOCAL**

PILOT READY LOCAL NÃO SIGNIFICA PRODUCTION READY. O RC ainda requer preflight, configuração de ambiente e autorização explícita antes de qualquer rollout.

## Cadeia de origem

A ancestralidade foi verificada com `git merge-base --is-ancestor`:

`origin/main (eee7c64) → origin/codex/checkflow-start-p0 (36552c2) → origin/codex/checkflow-start-integridade-historica (54fdc76) → origin/codex/checkflow-start-e2e-mobile (26281d1)`.

Commits exclusivos, em ordem:

- `0fb62c5` — provisionamento seguro e armazenamento privado de evidências.
- `38dfc38` — evidência do gate P0.
- `36552c2` — comportamento P0 e isolamento local.
- `54fdc76` — snapshot histórico imutável V1/V2.
- `26281d1` — harness Windows, E2E/mobile, fixtures e correção do P1 de fotografia.
- O commit deste manifest documenta a referência RC1 final.

As branches intermediárias permanecem como evidência e não precisam ser mescladas separadamente: todas são ancestrais lineares do RC1.

## Classificação do conteúdo

- PRODUCT: snapshot histórico, execução, não conformidade, ação corretiva e controle de acesso já aprovados nos gates anteriores.
- SECURITY: RLS, isolamento entre organizações, provisionamento server-side e bucket privado.
- MIGRATION: cinco migrations listadas abaixo.
- TEST: testes Node, SQL P0/histórico, smoke e E2E/mobile.
- TOOLING: scripts Node cross-platform, configuração npm e Playwright Core.
- DOCUMENTATION: gates anteriores e este manifest.

Não foram encontrados mocks apresentados como operação real, `service_role` no frontend, bucket público, bypass de RLS ou `organization_id` confiado ao browser para provisionamento. O `service_role` aparece somente no worker server-side e em fixtures/testes estruturais. Não há `.env` real, tokens ou credenciais reais versionados; `@checkflow.test` e `Checkflow123!` são fixtures locais explícitas.

## Migrations do RC1

| Arquivo | Finalidade | Ordem/dependência | Risco | Testada localmente? |
|---|---|---|---|---|
| `202607220001_base_multitenant.sql` | Schema base multi-tenant, perfis, organizações, checklists e execuções | 1; fundação | Alto: schema inicial e RLS base | Sim; instalação limpa |
| `202607230002_hardening_rls_mvp.sql` | Hardening de RLS e permissões MVP | 2; depende da base | Alto: autorização e isolamento | Sim; instalação limpa e SQL P0 |
| `202607230003_action_plan_minimal_rls.sql` | Não conformidade e plano de ação mínimo com RLS | 3; depende das tabelas base | Alto: fluxo de correção | Sim; instalação limpa e E2E |
| `202608260001_checkflow_start_p0_provisioning_storage.sql` | Provisionamento P0 e storage privado de evidências | 4; depende de base/RLS | Alto: segurança de provisionamento e uploads | Sim; instalação limpa, SQL P0 e E2E |
| `202608260002_execution_historical_snapshot.sql` | Snapshot imutável da execução e histórico V1/V2 | 5; depende de execuções/checklists | Alto: integridade histórica | Sim; instalação limpa, SQL histórico e E2E |

Nenhuma migration histórica aprovada foi editada nesta consolidação.

## Reprodução local

Pré-requisitos: Node/npm, Docker, Supabase CLI e Google Chrome instalado.

1. Usar uma cópia limpa do repositório na branch RC1.
2. Iniciar somente Supabase local, com `127.0.0.1` ou `localhost`.
3. Aplicar migrations na ordem acima; uma instalação limpa foi confirmada em `127.0.0.1:54321`/`127.0.0.1:54322`.
4. Para o gate, carregar `supabase/tests/checkflow_start_e2e_fixture.sql`.
5. Iniciar `npm run dev` (`vinext dev --hostname 127.0.0.1 --port 3000`).
6. Executar smoke e E2E com Chrome real.
7. Parar o stack local descartável após a validação; não usar Supabase remoto.

## Validação do RC1

- `npm test`: 22/22 PASS.
- `npx tsc --noEmit`: PASS.
- `npm run build`: PASS; artefato Worker validado.
- `npm run lint`: PASS.
- `git diff --check`: PASS.
- SQL `checkflow_start_p0_behavior.sql`: PASS, rollback limpo.
- SQL `checkflow_start_historical_integrity.sql`: PASS, rollback limpo.
- Smoke Playwright/Chrome real: PASS.
- E2E herdado do RC funcional: **31/31 PASS** em Chrome real.
- Viewports: 360×800, 390×844 e 412×915.
- Persistência após reload, fotografia, não conformidade, ação corretiva e histórico V1/V2 comprovados.

## Riscos e limitações

- P0 conhecido: nenhum.
- P1 impeditivo conhecido: nenhum.
- P2 conhecidos e não corrigidos: fontes Geist retornam 404 no `vinext dev`; `vinext start` apresenta incompatibilidade de separadores de caminho nos assets em Windows. O caminho homologado do RC é `vinext dev`; não corrigir esses P2 nesta missão.
- As validações 390/412 cobrem login, legibilidade inicial e overflow; o fluxo operacional completo foi exercitado em 360px.

## Pré-requisitos de rollout posterior

- revisão/aprovação da PR pelo gerente;
- ambiente Supabase remoto separado, com backup e migrations aprovadas;
- configuração de secrets server-side, sem exposição ao frontend;
- validação de domínio, storage privado, RLS e observabilidade;
- smoke controlado pós-release e plano de rollback aprovado;
- dados/usuários reais somente após autorização formal.

## Rollback conceitual

Antes do rollout, registrar o SHA implantado e confirmar backup/migrations reversíveis ou procedimento operacional aprovado. Em caso de falha, interromper o rollout, retornar ao SHA anterior aprovado e seguir o procedimento de restauração do ambiente remoto. Nenhum rollback remoto foi executado nesta sessão.

## PR preparada

Título sugerido: `feat: prepare CheckFlow Start pilot release candidate`

Descrição: consolidar P0, integridade histórica e E2E/mobile em uma única referência RC1; preservar RLS, isolamento multi-tenant, storage privado e snapshots históricos; incluir migrations, testes SQL, smoke e E2E 31/31 com Chrome real nos viewports 360/390/412; registrar riscos P2 e checklist de rollout. Sem deploy, sem alteração do Supabase remoto e sem merge em `main`.

## Confirmações

- Produção não foi alterada.
- Supabase remoto não foi acessado nem alterado.
- Nenhum deploy ou publicação ocorreu.
- `main` não foi alterada.
