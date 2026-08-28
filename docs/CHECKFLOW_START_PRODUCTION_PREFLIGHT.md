# CheckFlow Start — Production Preflight RC1

Data: 2026-08-28
RC: `codex/checkflow-start-rc1`
SHA auditado: `98dc99d8e7c977de86e41b1f8295aa464ac57778`
SHA `origin/main`: `eee7c64f36959284a12a5b06bc433b3358809fbd`

## Status

**READY FOR ROLLOUT COM RESSALVAS**

O projeto remoto correto foi identificado. O rollout está tecnicamente preparado para a primeira escrita controlada, condicionado à autorização humana no momento da execução. As migrations do RC1 ainda não estão registradas/aplicadas no remoto; o dry-run das cinco migrations, em ordem, passou sobre uma cópia descartável do estado remoto restaurado. Nenhuma alteração remota foi feita.

### Decisão humana do proprietário — missão 012

O proprietário confirmou que ainda não existe cliente real, venda, operação comercial ou dado de cliente em produção. Os 7 usuários Auth e os 4 objetos Storage são exclusivamente dados de teste do próprio proprietário; sua recriação/perda é aceitável para o primeiro piloto. Esta classificação é **ACCEPTED RISK**, não autorização para apagar dados: nenhum `DELETE`, reset de Auth, alteração Storage ou operação destrutiva está autorizado nesta missão.

Classificação vigente: PostgreSQL schema/data **GREEN**; Storage metadata **GREEN**; Auth e Storage binaries antigos **ACCEPTED RISK FOR FIRST PILOT**; baseline comercial anterior **NOT APPLICABLE FOR CUSTOMER ROLLBACK**. O Worker/Functions remoto antigo não é requisito do RC1; a primeira publicação estabelecerá uma nova baseline.

## Ambiente remoto identificado

- Projeto: `Check List Flow Project`
- Project ref: `fzmzrtthmciaisygajba`
- Região: `ca-central-1`
- Estado observado: `ACTIVE_HEALTHY`
- Endpoint derivado da ref: `https://fzmzrtthmciaisygajba.supabase.co`; não foi usado para escrita.
- A sessão autenticada listou apenas um projeto ativo compatível; os demais projetos listados estavam inativos e tinham nomes distintos.
- Não existe `supabase/config.toml` no RC1 e `.env.example` não contém URL preenchida. Não foi criado vínculo local.
- Publicação existente: Cloudflare Sites/Vinext, indicada por `.openai/hosting.json`, `wrangler` e o artefato Worker. Nenhum deploy foi executado.

## Inventário remoto somente leitura

O schema remoto possui as tabelas operacionais, RLS habilitado nas tabelas auditadas, funções de tenant, triggers de validação e bucket privado `checkflow-evidence` com MIME `image/jpeg`, `image/png`, `image/webp` e limite de 10 MiB. A coluna `checklist_executions.execution_snapshot` não existe no remoto.

Contagens agregadas, sem leitura de dados pessoais:

| Objeto | Quantidade |
|---|---:|
| organizations | 2 |
| organization_members | 7 |
| checklists | 7 |
| checklist_assignments | 11 |
| checklist_executions | 6 |
| execution_answers | 17 |
| non_conformities | 2 |
| action_plans | 1 |
| attachments | 1 |
| storage.objects em `checkflow-evidence` | 4 |
| auth.users | 7 |

Edge Functions observáveis pela CLI: nenhuma listada.

## Migrations RC1

`supabase migration list --linked --project-ref fzmzrtthmciaisygajba` retornou `remote` vazio para todas as cinco versões. Status oficial: **NÃO APLICADA** para todas; algumas estruturas antigas são parcialmente representadas, mas não substituem o registro/aplicação da migration.

| Arquivo | Status remoto | Risco | Observação |
|---|---|---|---|
| `202607220001_base_multitenant.sql` | NÃO APLICADA; estruturas base parcialmente representadas | ALTO | Cria/ajusta schema base, RLS, funções, triggers e bucket; contém `CREATE TABLE IF NOT EXISTS`, replacement de policies e alteração de dados do bucket. |
| `202607230002_hardening_rls_mvp.sql` | NÃO APLICADA; policies/triggers parcialmente representados | ALTO | `SECURITY DEFINER`, triggers tenant e replacement de policies; inclui `REVOKE` de função e pode alterar autorização. |
| `202607230003_action_plan_minimal_rls.sql` | NÃO APLICADA; ação corretiva parcialmente representada | ALTO | Função `SECURITY DEFINER`, replacement de policy e trigger em `action_plans`. |
| `202608260001_checkflow_start_p0_provisioning_storage.sql` | NÃO APLICADA; bucket/policies parcialmente representados | ALTO | `SECURITY DEFINER`, `REVOKE`, replacement de policies do storage e validação de paths; risco de bloquear uploads/acesso. |
| `202608260002_execution_historical_snapshot.sql` | NÃO APLICADA; `execution_snapshot` ausente | ALTO | `ALTER TABLE`, funções/triggers `SECURITY DEFINER` e proteção de registros concluídos; exige validação de dados legados antes da aplicação. |

Não foram observados `DROP TABLE`, mas há `DROP POLICY`/`DROP TRIGGER` seguido de replacement, criação de funções `SECURITY DEFINER`, `REVOKE`, triggers e alteração de bucket. A ordem obrigatória é exatamente a tabela acima; parar após cada etapa se a validação correspondente falhar.

### Decisão de estratégia — missão 012

Estratégia escolhida: **A — aplicar as cinco migrations existentes diretamente**, em ordem, sem editar migrations históricas e sem criar migration forward. A prova local executou exatamente os cinco arquivos contra a cópia restaurada do schema/dados remoto, com `ON_ERROR_STOP=1`; os cinco passaram. A natureza repetível foi observada em `CREATE ... IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY/TRIGGER` seguido de criação e `ADD COLUMN IF NOT EXISTS`. A escrita de policies, triggers, funções `SECURITY DEFINER`, `REVOKE`, bucket e coluna histórica continua sendo operação de alto impacto e exige os STOP points do plano de release.

Como a tabela de histórico remoto estava vazia na última consulta, o primeiro push deve usar a CLI Supabase atual e `supabase db push --linked --dry-run`; se a lista mostrar exatamente as cinco versões, executar o push normal. Não usar `migration repair` para mascarar divergência. Se o dry-run remoto não listar as cinco versões ou acusar drift, parar e gerar uma reconciliação versionada separada.

## Preflight de dados

Consultas `SELECT` agregadas foram executadas remotamente para owners, roles, memberships, organizações, relações cross-tenant, execuções/respostas órfãs, não conformidades, planos e storage.

Resultado: **zero violações em todas as verificações**. Não foram executados `INSERT`, `UPDATE` ou `DELETE`. Isso não elimina o risco de aplicar a migration histórica ausente, pois o preflight não substitui backup/rollback.

## Backup e rollback

Consulta de backups do projeto retornou:

- `walg_enabled: true`;
- `pitr_enabled: false`;
- lista de backups físicos: vazia.

Último backup, retenção, export recuperável e restauração de Auth/config não foram comprovados. Portanto, não é possível declarar restaurabilidade nem rollout seguro.

Plano conceitual, a ser aprovado e detalhado pelo responsável do ambiente:

- Falha durante migration: interromper após a etapa, preservar logs, não avançar; restaurar snapshot/export confirmado ou aplicar procedimento de recuperação aprovado.
- Migration aplicada e frontend incompatível: interromper publicação, voltar frontend/Worker ao SHA anterior e restaurar banco se o schema não for compatível.
- Problema de Auth: bloquear smoke, não cadastrar usuários reais, restaurar configuração/Auth conforme backup comprovado.
- Problema de Storage: bloquear uploads, preservar objetos, restaurar policy/bucket conforme export e procedimento aprovado.
- Problema após smoke: retirar tráfego controlado, registrar evidência, voltar ao SHA anterior e restaurar banco/config se necessário.

Sem backup verificável, qualquer um desses rollbacks permanece apenas plano, não capacidade comprovada.

## Plano de rollout — não executado

1. **Janela:** aprovar janela de manutenção e responsáveis. Parar se não houver owner técnico e comunicação.
2. **Backup:** criar/verificar backup, PITR ou export restaurável de banco, Auth e Storage. Parar se não houver evidência de restauração.
3. **Preflight:** repetir os SELECTs deste documento e salvar contagens. Parar com qualquer violação.
4. **Escrita:** bloquear escrita apenas se o runbook aprovado exigir. Parar se o bloqueio não for verificável.
5. **Migrations:** aplicar as cinco migrations na ordem definida, com validação após cada uma. Parar no primeiro erro ou divergência.
6. **Pós-migration:** verificar schema, `execution_snapshot`, RLS, policies, triggers, funções e bucket privado. Parar se qualquer item faltar.
7. **Worker/backend:** publicar o SHA RC1 somente após aprovação de configuração server-side. Parar se secrets não estiverem configurados com segurança.
8. **Frontend:** publicar o artefato Cloudflare Sites/Vinext do SHA aprovado. Parar se o build/healthcheck falhar.
9. **Smoke teste:** usar exclusivamente organização e usuários de teste; executar Owner → Executor mobile → Gestão → histórico. Parar com falha de Auth, Storage, persistência ou isolamento.
10. **Monitoramento:** observar erros, Auth, Storage, RLS, latência e logs pelo período aprovado. Parar com regressão ou falso sucesso.
11. **GO/ROLLBACK:** decisão humana documentada; sem evidência de backup restaurável, a decisão deve ser NO-GO.

## Smoke pós-rollout planejado

Usar somente organização, Owner, Executor e Manager de teste, identificados antes do rollout e removidos conforme runbook:

`Owner login → criar checklist → atribuir Executor → Executor login mobile → iniciar → responder → observação → fotografia → NÃO OK → pausar/retomar → concluir → Gestão visualizar não conformidade → criar ação corretiva → atribuir responsável/prazo → Executor enviar foto de correção → Manager aprovar → consultar histórico e snapshot.`

Validar também isolamento entre duas organizações de teste e ausência de acesso com papel inadequado. Não usar cliente ou dado real no smoke.

## Riscos e bloqueadores

- Bloqueador: migrations RC1 não registradas/aplicadas remotamente; `execution_snapshot` ausente.
- Bloqueador: nenhum backup físico listado e PITR desabilitado; restaurabilidade não comprovada.
- Dados incompatíveis detectados pelas consultas: nenhum, com as limitações do escopo agregado.
- P2 local herdado: fontes Geist 404 no dev server e assets de `vinext start` no Windows; não fazem parte deste preflight.

## Conclusão

1. Ambiente correto identificado inequivocamente? **Sim.**
2. Sabemos quais migrations faltam? **Sim: as cinco estão sem registro remoto; a histórica também está estruturalmente ausente.**
3. Existe backup/rollback verificável? **Não.**
4. Existe dado remoto incompatível? **Nenhum encontrado nas consultas SELECT executadas.**
5. É seguro solicitar autorização humana para rollout? **Não para execução ainda; primeiro exigir backup/export restaurável e runbook aprovado.**
6. O próximo passo pode ser somente execução controlada do release? **Não; o próximo passo é preflight de backup/rollback e aprovação humana.**

Produção não foi alterada. Nenhuma migration remota, alteração de dados, deploy ou publicação foi realizada.

## Fechamento do final release gate — missão 012

- SHA inicial/final desta missão: `0d204f8d51e2fad059ae1962780d94d834d67c83` antes das alterações documentais; SHA final será registrado após o commit.
- RC1 revalidado: `npm test` 22/22, build Sites válido, SQL P0 PASS, histórico PASS, TypeScript e lint sem erro.
- Dry-run remoto atual copiado localmente: preservou 2 organizations, 7 memberships, 7 checklists, 11 assignments, 6 executions, 17 answers, 2 non-conformities, 1 action plan e 4 objetos Storage; órfãos/cross-tenant: zero.
- Pós-migration: RLS desabilitado em tabelas públicas: zero; `execution_snapshot`: presente; trigger histórico: presente; nenhuma relação cross-tenant.
- Migration forward: **não criada**.
- P0/P1 técnico restante: **nenhum conhecido**.
- RED não aceito conscientemente: **nenhum**; os riscos antigos de Auth/Storage binaries são aceitos formalmente pelo proprietário para o primeiro piloto.
- Target: Sites hosting do projeto `.openai/hosting.json`, build `npm run build`, publicação pelo pipeline Sites no commit aprovado; não usar o Worker antigo `clip-flow-ai-remix` como alvo.

O remoto foi consultado novamente quanto ao projeto/estado e permanece `Check List Flow Project` / `fzmzrtthmciaisygajba`. A CLI instalada nesta máquina é `2.95.4`, enquanto o preflight anterior usou `2.116.0`; por isso a confirmação detalhada de migration history permanece baseada na última leitura oficial registrada, e deverá ser repetida pelo comando do plano imediatamente antes da primeira escrita.

## Resultado da FASE 1 — missão 013

As cinco migrations foram aplicadas exatamente no projeto `fzmzrtthmciaisygajba` pela CLI `2.116.0`, entre `2026-08-28T14:37:39.8482353Z` e `2026-08-28T14:37:53.1223423Z`, exit code 0. O history remoto registra as cinco versões, na ordem aprovada. As contagens permaneceram `2/7/7/6/17/2/1/4` para organizations/memberships/checklists/executions/responses/nonconformities/action_plans/Storage metadata.

RLS, integridade tenant, órfãos, snapshot, triggers e Storage privado passaram. Os testes P0 e histórico foram executados remotamente em transações com rollback e passaram.

O advisor Supabase não retornou `ERROR`, mas retornou 155 warnings; o postflight confirmou um P1 de segurança: funções `SECURITY DEFINER` públicas, incluindo `build_execution_snapshot`, `capture_and_protect_execution_snapshot`, `protect_completed_execution_records` e `validate_checkflow_tenant_links`, continuam com `EXECUTE` para `anon`. Isso requer uma migration corretiva versionada e novo teste; não foi corrigido nesta missão por estar fora das cinco migrations autorizadas. Portanto o banco não está liberado para deploy/FASE 2.

## Atualização de recovery — missão 010

O dump PostgreSQL previamente comprovado continua válido: schema e dados públicos/Storage foram restaurados em database local isolado, com checksums registrados. O stack local foi encerrado após o ensaio.

O inventário Storage foi confirmado somente por leitura: 4 objetos no bucket privado `checkflow-evidence`, aproximadamente 6.426.853 bytes. As tentativas autorizadas de `supabase storage cp` remoto foram recusadas pela CLI como operação não suportada; resultado físico: **0/4 objetos baixados**. Não foi usado `service_role`, nem houve upload, delete ou alteração remota.

Auth permanece sem export restaurável comprovado: há 7 usuários, 7 identities, 7 profiles e 7 memberships, todos com provider `email`. O plano seguro é obter backup oficial de Auth ou, como contingência, reconstruir usuários com password reset e validar/remapear as referências de tenant antes de liberar acesso. Nenhum plano foi executado.

O baseline do deploy também permanece incompleto: `.openai/hosting.json` identifica o projeto Cloudflare Sites, mas `wrangler whoami` não autenticou e não foi possível determinar URL, deployment ID ou SHA atualmente publicado. O alvo de rollback publicado é, portanto, **incerto**.

Conclusão atualizada: **BLOCKED** para rollout. Os componentes críticos `Auth`, `Storage binaries` e `Config/deployment baseline` permanecem RED. A menor ação seguinte é obter, por acesso humano autorizado, a cópia física dos 4 objetos, um mecanismo comprovado de recuperação Auth e o registro do deployment Cloudflare ativo, sem alterar produção.

## Diagnóstico executável — missão 011

Os três REDs foram testados separadamente, somente em leitura:

| Componente | Status | Bloqueador | Próxima ação |
|---|---|---|---|
| Storage binaries | HUMAN AUTH REQUIRED | `supabase storage cp` remoto recusado como operação não suportada; bucket privado | Download humano dos 4 objetos via Dashboard ou Storage API/S3 oficial |
| Auth recovery | HUMAN AUTH REQUIRED | dump de dados `auth` vazio; schema Auth isolado não contém usuários | Export/backup Auth oficial autorizado e restore test local |
| Cloudflare baseline | HUMAN AUTH REQUIRED | `wrangler whoami`: não autenticado | `wrangler login`, seguido de consulta read-only de deployments |

O projeto Supabase `fzmzrtthmciaisygajba` foi confirmado novamente. Não há credenciais Supabase/Cloudflare relevantes em variáveis de ambiente. Não foram feitos login, upload, download remoto de objetos, alterações de dados ou deploy.

Não existe defeito de produto ou necessidade de programação para esses três bloqueios. A menor sequência humana está documentada no runbook: baixar Storage, obter backup Auth oficial e autenticar Wrangler apenas para consulta de deployments.

Status global desta missão: **HUMAN AUTH REQUIRED**. O rollout continua bloqueado até os componentes críticos deixarem de ser RED.

## Security Definer hardening — missão 014

Inventário remoto encontrou 9 funções `SECURITY DEFINER` públicas, todas com `search_path=""` seguro e owner `postgres`. Antes da correção, as 9 eram executáveis por `anon` e `authenticated`. Seis são internas/trigger; três são helpers de policy necessários para `authenticated`: `is_org_member`, `has_org_role` e `can_access_checkflow_evidence`.

A migration `202608280001_security_definer_execute_hardening.sql` revogou EXECUTE explicitamente por assinatura. Resultado remoto: `security_definer_anon_exec=0`, `internal_anon_exec=0`, `policy_helpers_anon_exec=0`, `policy_helpers_authenticated_exec=3`. Triggers, P0 e histórico permaneceram funcionais.

Migration aplicada entre `2026-08-28T14:50:41.6780070Z` e `2026-08-28T14:50:53.1005322Z`, com histórico registrado. Contagens preservadas: `2/7/7/6/17/2/1/4`. Advisors: 140 WARN, sem `ERROR`, P0 ou P1 real; permanecem warnings de performance/configuração e os 3 helpers authenticated necessários.
