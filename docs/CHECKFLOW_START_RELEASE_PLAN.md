# CheckFlow Start — First Release Plan

Data: 2026-08-28  
RC: `codex/checkflow-start-rc1`  
SHA aprovado: `0d204f8d51e2fad059ae1962780d94d834d67c83`

## Baseline

Esta é a **FIRST COMMERCIAL BASELINE**: ainda não existe cliente real, venda ou operação comercial. Auth e Storage binaries antigos são **ACCEPTED RISK FOR FIRST PILOT**, por decisão explícita do proprietário; isso não autoriza apagar dados. Não há baseline comercial anterior para rollback.

Target deliberado: Cloudflare Sites/Vinext pelo pipeline do projeto identificado em `.openai/hosting.json`. O artefato é produzido por `npm run build`. O Worker antigo `clip-flow-ai-remix` não é target do CheckFlow.

## Migration strategy

Aplicar diretamente as cinco migrations históricas, nesta ordem:

1. `202607220001_base_multitenant.sql`
2. `202607230002_hardening_rls_mvp.sql`
3. `202607230003_action_plan_minimal_rls.sql`
4. `202608260001_checkflow_start_p0_provisioning_storage.sql`
5. `202608260002_execution_historical_snapshot.sql`

Não editar migrations históricas, não criar migration forward e não usar `migration repair` para encobrir drift. O dry-run local sobre a cópia do estado remoto passou com os cinco arquivos. O primeiro comando remoto obrigatório é `supabase db push --linked --dry-run`; ele precisa listar exatamente essas cinco versões.

## Release sequence and stop points

| Step | Comando/ação | Resultado esperado e validação | STOP condition | Rollback |
|---|---|---|---|---|
| 1 | Confirmar owner, janela, branch e checksum dos dumps | SHA do backup confere; `git status -sb` na branch RC1 | owner/janela/checksum ausente | NO-GO |
| 2 | `supabase projects list`; confirmar ref `fzmzrtthmciaisygajba` | projeto `Check List Flow Project`, ativo | ref/conta divergente | NO-GO |
| 3 | `supabase migration list --linked`; `supabase db push --linked --dry-run` | history e plano são entendidos; exatamente 5 migrations | qualquer drift/lista inesperada | não escrever; preparar reconciliação |
| 4 | `supabase db push --linked` | cinco migrations aplicadas sem erro | primeiro erro ou timeout | parar, preservar log, restaurar backup aprovado |
| 5 | SELECTs pós-migration: coluna/snapshot, RLS, policies, triggers, órfãos e counts | schema e dados íntegros; P0/histórico verde | qualquer divergência | não publicar; restaurar backup aprovado |
| 6 | `npm test`; `npx tsc --noEmit`; `npm run lint`; confirmar env/secrets no Site | 22/22, build válido, TS/lint verdes | falha de build, segredo exposto ou env ausente | não publicar |
| 7 | Publicar o commit aprovado pelo pipeline Sites | URL pública responde e assets carregam | healthcheck HTTP falha | retirar publicação/corrigir configuração |
| 8 | Criar/usar somente organização de teste | Owner autentica e vê tenant de teste | qualquer dado real ou isolamento inválido | bloquear smoke |
| 9 | Smoke Owner → Executor mobile → Manager | fluxo completo e histórico verde em 360/390/412 | Auth, persistência, foto, ação ou histórico falha | interromper e registrar |
| 10 | Testar segundo tenant e decidir GO/ROLLBACK | isolamento confirmado, nenhum P0/P1 impeditivo | cross-tenant ou regressão | rollback do Site e banco conforme backup |

## First production smoke (test data only)

Owner faz login, cria checklist e atribui. Executor usa mobile, executa, registra observação, fotografia, `NÃO OK`, pausa, reload, retoma e conclui. Gestor visualiza a não conformidade, cria ação corretiva, recebe evidência, aprova e consulta o histórico/snapshot. Um segundo tenant de teste confirma que nenhum papel lê ou altera dados do primeiro tenant sem autorização.

## Acceptance

GO somente com migrations e postflight verdes, frontend acessível, Auth/Storage funcionais, smoke completo, mobile verde, snapshot histórico correto, isolamento confirmado, zero P0 e zero P1 impeditivo. A decisão final é humana.

## Rollback and accepted risks

Durante migration: parar no primeiro erro e não avançar. Se houver backup restaurável aprovado, restaurar schema/data conforme runbook; sem isso, NO-GO. Após publicação incompatível, retirar a publicação do Site e corrigir/republicar o commit aprovado. Como não existe cliente comercial anterior, não há rollback de customer deployment anterior. Auth e binaries Storage antigos são accepted risks conscientes para este primeiro piloto; não são motivo para DELETE.

## Final gate

Status: **READY FOR ROLLOUT COM RESSALVAS**. Nenhum P0/P1 técnico conhecido e nenhum RED não aceito conscientemente pelo proprietário. Nenhum rollout foi executado.

**AGUARDANDO AUTORIZAÇÃO HUMANA PARA PRIMEIRA ESCRITA EM PRODUÇÃO.**
