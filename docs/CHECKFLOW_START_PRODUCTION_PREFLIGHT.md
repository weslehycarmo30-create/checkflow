# CheckFlow Start — Production Preflight RC1

Data: 2026-08-28
RC: `codex/checkflow-start-rc1`
SHA auditado: `98dc99d8e7c977de86e41b1f8295aa464ac57778`
SHA `origin/main`: `eee7c64f36959284a12a5b06bc433b3358809fbd`

## Status

**BLOCKED**

O projeto remoto correto foi identificado, mas o rollout não é seguro para autorização porque as migrations do RC1 não estão registradas/aplicadas e não há backup recuperável comprovado nem PITR habilitado. Nenhuma alteração remota foi feita.

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

## Atualização de recovery — missão 010

O dump PostgreSQL previamente comprovado continua válido: schema e dados públicos/Storage foram restaurados em database local isolado, com checksums registrados. O stack local foi encerrado após o ensaio.

O inventário Storage foi confirmado somente por leitura: 4 objetos no bucket privado `checkflow-evidence`, aproximadamente 6.426.853 bytes. As tentativas autorizadas de `supabase storage cp` remoto foram recusadas pela CLI como operação não suportada; resultado físico: **0/4 objetos baixados**. Não foi usado `service_role`, nem houve upload, delete ou alteração remota.

Auth permanece sem export restaurável comprovado: há 7 usuários, 7 identities, 7 profiles e 7 memberships, todos com provider `email`. O plano seguro é obter backup oficial de Auth ou, como contingência, reconstruir usuários com password reset e validar/remapear as referências de tenant antes de liberar acesso. Nenhum plano foi executado.

O baseline do deploy também permanece incompleto: `.openai/hosting.json` identifica o projeto Cloudflare Sites, mas `wrangler whoami` não autenticou e não foi possível determinar URL, deployment ID ou SHA atualmente publicado. O alvo de rollback publicado é, portanto, **incerto**.

Conclusão atualizada: **BLOCKED** para rollout. Os componentes críticos `Auth`, `Storage binaries` e `Config/deployment baseline` permanecem RED. A menor ação seguinte é obter, por acesso humano autorizado, a cópia física dos 4 objetos, um mecanismo comprovado de recuperação Auth e o registro do deployment Cloudflare ativo, sem alterar produção.
