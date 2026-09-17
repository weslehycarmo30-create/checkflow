# Auditoria técnica integral — CheckFlow

Data da auditoria: 2026-09-02 (execução técnica concluída em 2026-09-03 UTC)

Escopo: repositório, migrations, testes, build, artefatos publicados e consultas read-only aos ambientes. Não foram feitas correções de produto, commit, push, deploy, migration remota, alteração de dados/Auth/Storage/Cloudflare/Sites ou operação destrutiva.

## 1. Executive Summary

Veredito: **C — NÃO PRONTO; EXISTEM BLOQUEADORES**.

Os gates de build, TypeScript, lint e a suíte Node passaram, mas a cobertura não prova os invariantes críticos. Foram encontrados riscos confirmados de integridade e concorrência:

1. A imutabilidade da estrutura do checklist após atribuição/execução é aplicada somente pela UI; a policy de manager continua permitindo escrita direta nas tabelas de checklist, seções e itens. Uma alteração posterior pode fazer uma execução em andamento operar sobre estrutura diferente da atribuída.
2. Não existe constraint/índice único para impedir duas execuções ativas do mesmo assignment nem duas atribuições ativas equivalentes. As verificações são `SELECT` seguido de `INSERT`, portanto sofrem TOCTOU em abas/managers concorrentes.
3. A policy de update de execução do colaborador permite alterar qualquer coluna autorizada pela tabela, sem máquina de estados no banco. Um cliente autenticado pode tentar mudar diretamente uma execução própria para estados e valores que a UI não oferece.
4. Criação/validação de plano de ação e upload de evidência são operações em múltiplos passos sem transação; falhas intermediárias deixam plano, NC e objeto Storage divergentes.

Não foi identificado P0 reproduzido. Os P1 acima impedem afirmar integridade operacional para o Cliente Piloto 001. O isolamento RLS tem uma base boa e os seis arquivos de migration estão registrados remotamente, mas a prova de segurança dinâmica completa não foi possível nesta worktree porque o harness local está parado/incompleto.

## 2. SHA/branch auditados

- Branch: `main`.
- HEAD local: `68852bd55ff67bda30da1bd40df02a61559d7d32`.
- `origin/main`: `68852bd55ff67bda30da1bd40df02a61559d7d32`.
- Sincronização: confirmada; não houve push nesta auditoria.
- Código auditado: commit `68852bd` (`fix(checklists): create fresh assignments after completion`), incluindo `app/checklists/[id]/checklist-detail.tsx` e `tests/assignment-reuse-regression.test.mjs`.

## 3. Estado da worktree

Não há alterações tracked. Permanecem untracked, pré-existentes/gerados por validações anteriores:

- `supabase/.temp/cli-latest`
- `supabase/.temp/linked-project.json`
- `test-results/e2e-mobile-results.json`
- `test-results/executor-completed-360.png`
- `test-results/executor-v2-360.png`
- `test-results/manager-history-360.png`
- `test-results/owner-checklist-360.png`

O relatório é o único arquivo novo criado nesta auditoria: `docs/AUDITORIA_TECNICA_INTEGRAL_2026-09-02.md`. Nenhum arquivo de produto foi alterado.

## 4. Arquitetura observada

- Frontend React/Vinext/Next-compatible, servido como Worker Cloudflare via `worker/index.ts`.
- Supabase JS no browser para Auth, PostgREST, Storage e RLS.
- Worker possui somente endpoints de configuração pública, otimização de imagem e convite de equipe.
- Banco PostgreSQL/Supabase contém o domínio multiempresa, assignments, executions, respostas, evidências, NCs, planos e logs.
- Storage privado `checkflow-evidence` guarda fotos por paths que começam pelo tenant.
- D1/R2 aparecem como scaffolding opcional; `db/schema.ts` está vazio e não é a fonte efetiva do domínio.
- O app usa `organization_id` em queries e o banco usa helpers/RLS/triggers para tenant links.
- `PrivateRouteGuard` é client-side; páginas privadas entregam HTML de rota antes do redirect, embora os dados dependam do RLS.

Fronteira de confiança: browser não é confiável; a segurança real depende de RLS, triggers e do Worker server-side. O risco arquitetural mais relevante é staging e produção compartilharem o projeto Supabase `fzmzrtthmciaisygajba`. Um teste, fixture ou configuração errada no staging pode atingir usuários, Auth, schema, Storage ou dados vistos pela produção.

Classificação do compartilhamento:

| Fase | Risco |
|---|---|
| Desenvolvimento | Alto: fixtures e resets remotos são perigosos; exige disciplina local estrita. |
| Homologação | Alto: staging não é isolamento de dados nem de Auth. |
| Primeiro piloto | Alto: uma falha de tenant/cleanup mistura ambientes. |
| Crescimento | Inadequado: exige projeto Supabase separado por ambiente ou controles operacionais fortes. |

## 5. Matriz de segurança

| Área | Evidência | Avaliação |
|---|---|---|
| Chave pública no frontend | `lib/supabase.ts` só lê variáveis `NEXT_PUBLIC_*`; `service_role` fica em `worker/index.ts`. | Aprovado estaticamente. |
| Service role | Usado somente no Worker para convite e leitura de membership. | Server-side, mas endpoint precisa de rate limit/limite de corpo e rollback de falhas. |
| RLS | Todas as tabelas operacionais habilitam RLS na migration base; migrations seguintes substituem policies críticas. | Base sólida; não substitui testes dinâmicos. |
| Storage | Bucket privado e policies de path em `202608260001`. | Aprovado estaticamente; faltam provas A/B com usuários reais locais. |
| XSS | O único `dangerouslySetInnerHTML` encontrado é o script estático de tema em `app/layout.tsx`; não há conteúdo de usuário interpolado. | Nenhum XSS confirmado. |
| Histórico Git | Busca encontrou nomes de secrets em código/documentação/Worker, mas nenhum token real foi impresso ou encontrado no bundle público. | Sem segredo exposto confirmado; revisar histórico com scanner CI. |

## 6. Matriz de roles/permissões

- Owner: membership é criado pelo fluxo de signup; escrita de memberships é owner-only.
- Manager: leitura e escrita ampla nas tabelas operacionais da própria organização via `org_manager_write` (`202607220001_base_multitenant.sql:141-149`).
- Collaborator: lê seus assignments, cria/atualiza suas executions e answers; Storage usa executor/responsável e tenant path.
- Convites: `/api/team-invitations` deriva a organização da membership server-side e impede manager de convidar manager (`worker/index.ts:60-75`).
- O banco não possui uma policy/trigger de “estrutura congelada” para impedir manager de alterar checklist/seção/item depois de assignment ou execution. Esse é o descompasso principal entre a matriz pretendida e a autorização efetiva.

## 7. Banco/migrations

Foram auditadas em ordem as seis migrations:

1. `202607220001_base_multitenant.sql`
2. `202607230002_hardening_rls_mvp.sql`
3. `202607230003_action_plan_minimal_rls.sql`
4. `202608260001_checkflow_start_p0_provisioning_storage.sql`
5. `202608260002_execution_historical_snapshot.sql`
6. `202608280001_security_definer_execute_hardening.sql`

Pontos positivos: PKs UUID, FKs principais, unique `(execution_id,item_id)`, índices básicos, enumerações, `search_path=''` nos SECURITY DEFINER, triggers de tenant e proteção de snapshot.

Lacunas:

- Não há FK composta garantindo que `organization_id` de filho seja o mesmo tenant do pai; os triggers cobrem vários caminhos, mas não substituem uma modelagem composta completa.
- `checklist_executions.assignment_id` é nullable e usa `ON DELETE SET NULL`; há caminhos para execução sem assignment após deleção/alteração do pai.
- Não há constraint de transição para `execution_status`.
- Não há índice único parcial para execution ativa por assignment/executor.
- Não há índice único parcial para assignment ativo por organização/checklist/executor.
- `attachments` permite `execution_id` e `answer_id` em combinações mais amplas que o vínculo lógico usado pela UI; parte da consistência depende do trigger/app.
- `audit_logs` é append-only por policy de aplicação, mas não há trigger geral de append-only nem escrita automática das operações principais.

O comando read-only `npx supabase migration list --linked --project-ref fzmzrtthmciaisygajba` retornou as seis versões local/remota alinhadas. Não foi executado `db push`, migration, SQL de alteração ou reset remoto.

## 8. RLS/multitenancy

Os helpers `is_org_member`/`has_org_role`, triggers de tenant e policies impedem vários vínculos cross-tenant no desenho atual. A migration de hardening valida checklist/assignment/execution/answer/attachment/NC/action plan em diferentes graus.

Achado relevante: a policy é permissiva para o manager dentro do tenant e as invariantes de lifecycle não estão no banco. A UI faz consultas preliminares para bloquear edição (`app/checklists/[id]/checklist-detail.tsx:303-315`), mas uma requisição direta não passa por essa UI.

Não foi possível concluir a matriz dinâmica A→B para SELECT/INSERT/UPDATE/DELETE, Storage, histórico e planos porque o container Supabase local esperado (`supabase_db_checkflow`) não existe e o repositório não contém `supabase/config.toml`. Nenhuma prova remota destrutiva ou de criação de usuários foi tentada.

## 9. Auth

O fluxo implementado usa Supabase Auth:

- login por senha;
- signup com `emailRedirectTo` para a origem corrente;
- recuperação para `/auth?mode=reset`;
- captura de `PASSWORD_RECOVERY`;
- `updateUser({password})`;
- logout e redirect para `/auth`.

Os endpoints públicos de staging e produção responderam 200 em `/`, `/auth` e `/api/supabase-config`, e a configuração retornou somente os campos públicos esperados. Não foram usados tokens/cookies/credenciais no relatório.

Riscos/lacunas: múltiplas organizações não são suportadas pelo frontend; sessão expirada é tratada no guard client-side; confirmação de e-mail, recuperação real, usuário desativado e allowlist/Redirect URLs não foram reproduzidos com contas de teste nesta auditoria. A implementação paralela de ChatGPT/SIWC está essencialmente não usada pelas telas atuais, criando documentação/configuração potencialmente divergente.

## 10. Lifecycle do checklist

Criação, seções, itens, edição, atribuição, execução, pausa, retomada, conclusão e histórico estão implementados. A UI bloqueia edição estrutural quando `status !== "draft"`, existe execution ou assignment (`app/checklists/[id]/checklist-detail.tsx`, cálculo de `canEditStructureBase`).

**F-01 — P1 — CONFIRMADO por evidência estática forte; reprodução local indisponível.**

O bloqueio estrutural está só nos handlers React (`saveSection`, `removeSection`, `saveItem`, `removeItem`). A policy `org_manager_write` continua `FOR ALL` para as tabelas operacionais. Assim, um manager autenticado pode enviar UPDATE/DELETE direto em seção/item/checklist após assignment/execution. A snapshot protege a visualização de uma execução concluída, mas a execução em andamento carrega a estrutura viva; o executor pode responder um conjunto e finalizar com outro.

Impacto: divergência entre o que foi atribuído, o que foi executado e o que a gestão vê; risco P1 para piloto. Teste existente apenas verifica texto/condição da UI (`tests/section-editing.test.mjs`), não a policy nem a tentativa direta.

Também há uma assimetria: a UI impede remover seção com assignment/execution, mas o banco só bloqueará indiretamente quando FKs encontrarem dependências; não existe regra de negócio explícita e consistente.

## 11. Assignments/reexecuções

O patch `68852bd` faz:

1. SELECT de assignments ativos para `(org, checklist, assigned_to)`;
2. SELECT de executions desses assignments;
3. reutiliza se não houver execution ou se houver execution `in_progress/paused`;
4. caso contrário insere um novo assignment.

**F-02 — P1 — CONFIRMADO por análise de concorrência; não reproduzido em DB local.**

Dois managers podem executar os SELECTs antes de qualquer INSERT e ambos criarem assignment novo. Duas abas do executor podem fazer o mesmo na criação de execution. Não há constraint/índice parcial que encerre a corrida. `actionLock` é somente por componente/aba (`checklist-detail.tsx:208-264`, `checklist-execution.tsx:130-164`).

**F-08 — P2 — PROVÁVEL.**

`existing.find(...)` percorre assignments em ordem `created_at` ascendente e aceita o primeiro com zero execution ou qualquer execution pausada/em andamento (`checklist-detail.tsx:230-251`). Com múltiplos assignments históricos ativos, pode reutilizar um assignment antigo enquanto outro mais recente é o operacional correto, ou ignorar o estado mais relevante de outro assignment. Falta regra determinística de “assignment atual” e constraint de unicidade.

O teste de regressão do patch é source-text/runtime superficial e não executa duas atribuições concorrentes nem múltiplas abas.

## 12. Execuções/respostas

Há suporte de UI para checkbox, yes/no, texto curto/longo, número, data, horário, seleção e fotografia, além de rating 0–10. O teste de rating confirma 0, 5 e 10 como valores numéricos e 0 como respondido.

**F-03 — P1 — CONFIRMADO por policy/migration.**

`collaborator_execution_update` permite update quando `executor_id=auth.uid()` e membership é válida, mas o `WITH CHECK` só reafirma identidade/membership (`202607230002_hardening_rls_mvp.sql:159-162`). Não há constraint ou trigger de transição. O executor pode enviar diretamente status `pending`, `cancelled` ou `completed`, preencher `completed_at`, `conformity_percentage` e `summary` sem passar pelas regras de respostas obrigatórias da UI. O trigger de snapshot somente torna uma execução já completed imutável; ele não valida a transição anterior (`202608260002_execution_historical_snapshot.sql:110-151`).

**F-09 — P2 — CONFIRMADO no código.**

Ao escolher `Não`, a UI atualiza somente estado local e limpa feedback; a resposta só é persistida quando o usuário registra a NC (`checklist-execution.tsx:388-405`). Se for opcional, pode finalizar sem que o “Não” exista no banco; se recarregar antes do registro, a escolha desaparece. Para item obrigatório, a regra também exige observação/NC, mas não usa de forma completa os flags armazenados (`nonconformity_on_no`, `require_photo_on_failure`).

**F-10 — P2 — CONFIRMADO.**

`single_select` é renderizado na execução, mas os controles de criação/edição do checklist não oferecem configuração de opções no construtor. Dados existentes podem funcionar; novos checklists não têm caminho completo para criar esse tipo.

Conformidade: checkbox só conta `true`, yes/no só conta `Sim`, mas qualquer valor não vazio de texto/número/data/hora/seleção/foto conta como conforme (`checklist-execution.tsx:361-367`). Isso é uma decisão de domínio não expressa em schema/teste; número 0 é corretamente preservado como respondido, mas não há validação de limites/semântica para os demais tipos.

## 13. Storage/evidências

O bucket é privado, com paths de organização e policies de leitura/escrita baseadas em execução/plano. A UI valida MIME e 10 MB antes do upload; o bucket também declara limites.

Riscos:

- Upload, upsert de answer e insert de attachment são passos separados. Se o attachment falhar, o arquivo e answer podem permanecer sem vínculo (`checklist-execution.tsx:330-344`).
- Se o update do plano falhar depois do upload, há tentativa de remove, mas falha nessa limpeza não é tratada (`action-plans.tsx:165-175`).
- O Storage policy valida path/tenant/relação principal, mas não exige que exista uma linha `attachments` para todo objeto de execution evidence.
- `photoAnswers` tenta criar signed URL para qualquer resposta string, não apenas itens `photo` (`checklist-execution.tsx:107-109`), causando chamadas e erros desnecessários.
- Não há fluxo de substituição/remoção de evidência concluída; o histórico protege attachments depois de completion.

**F-04 — P1/P2 — CONFIRMADO por fluxo de erro estático; não reproduzido localmente.**

Criação de plano: INSERT em `action_plans`, depois UPDATE em `non_conformities`; em erro, delete best-effort do plano. Validação: UPDATE do plano e depois UPDATE da NC; se o segundo falhar, o plano e a NC divergem (`action-plans.tsx:128-151`, `184-201`). O mesmo padrão ocorre no upload. Isso pode deixar operação parcial e exigir reconciliação manual.

## 14. Não conformidades

A criação relaciona execução, resposta e item; RLS/trigger verifica vínculo. O modelo permite responsável, prazo, status, observação e prioridade. Após execução concluída, conteúdo principal da NC é protegido, mas status, responsável e prazo permanecem mutáveis por desenho para o fluxo corretivo.

Não foi possível provar em execução local se todos os casos A/B de NC e histórico respeitam simultaneamente as policies devido ao harness ausente. A policy de insert do colaborador não aceita `answer_id` nulo em certos caminhos porque o trigger exige answer correspondente; isso é coerente com a UI, mas deveria ter teste de contrato explícito.

## 15. Planos de ação

O fluxo operacional está presente: gestão cria/atribui, colaborador envia fotografia, gestão aprova ou reprova. A migration restringe colaborador ao plano responsável e a status `in_progress/awaiting_validation` (`202607230003_action_plan_minimal_rls.sql:4-70`).

Lacunas:

- `correction_comment` armazena path de Storage, embora o nome sugira comentário; não há coluna dedicada para evidence path.
- O banco valida apenas que `correction_comment` é texto não vazio para `awaiting_validation`; não prova que o objeto existe, pertence ao plano ou é imagem.
- A aprovação depende de signed URL na UI, não de uma constraint de evidência.
- Criação e validação têm inconsistência parcial descrita em F-04.

## 16. Histórico/snapshot

`202608260002_execution_historical_snapshot.sql` captura snapshot na criação da execution, não na conclusão. A tela de histórico lê o snapshot, não o checklist vivo, e triggers tornam snapshot e execution concluída imutáveis. Answers e attachments de execução concluída não podem ser alterados; NC e action plan mantêm somente campos de acompanhamento mutáveis.

Isso protege o histórico exibido, mas não resolve F-01: antes da conclusão, a estrutura viva pode mudar. Também não há snapshot de toda a evolução de NC/plano; o histórico consulta status atual dos planos, portanto “o que ocorreu” e “estado atual da correção” são conceitos misturados.

O teste `tests/historical-integrity.test.mjs` confirma a presença textual de migration/tela; o SQL de integridade existente foi documentado como aprovado em ambiente temporário anterior, mas não foi reexecutado nesta worktree por ausência do stack.

## 17. Frontend/mobile

Pontos positivos: feedback tem timeout com cleanup, CTA tem espaço para safe-area, inputs têm labels em áreas críticas, rating 0 é tratado e a UI foi preparada para 360/390/412 px em artefatos de teste existentes.

Achados:

- O hook de feedback é usado por tela, não é realmente global; navegação desmonta o componente e pode perder mensagem entre operações.
- `limit(1).maybeSingle()` é usado para membership em dashboard, detalhe, action plans e team management. O schema permite múltiplas organizações ativas. Com duas rows, PostgREST pode devolver erro de cardinalidade; com limit aplicado, a seleção fica arbitrária.
- Dashboard limita histórico/executions a 50 sem paginação e carrega assignments/checklists sem limite.
- Dashboard manager calcula status por `checklist_id`, não por assignment; com vários executores/execuções pode exibir status de uma execução diferente da operação aberta.
- Guard é client-side e navega com `window.location`, o que provoca reload completo e pode perder estado/feedback.
- Não há rota real de listagem `/checklists`; o dashboard concentra a operação.

Nenhum defeito visual novo foi reproduzido com Browser in-app nesta auditoria: o runtime informou que não havia navegador disponível. Os screenshots untracked existentes não foram considerados prova de todas as rotas.

## 18. Concorrência/idempotência

**F-02** cobre assignment/execution duplicados. `actionLock` reduz double-click dentro da mesma instância, mas não cobre duas abas, dois managers, retry de rede ou request duplicado depois de timeout. O upsert de answer é protegido pelo unique `(execution_id,item_id)`, o que é positivo. Não há idempotency key para criação de execution, assignment, convite, plano ou upload.

## 19. Tratamento de erros

Não foram encontrados catch vazios generalizados, mas há operações best-effort sem reconciliação: delete de plano após falha de NC, remove de objeto após falha de metadata, e limpeza após upload. Mensagens de sucesso só são exibidas após o passo imediato retornar sucesso, mas a operação composta ainda pode estar parcialmente concluída.

O endpoint de convite também cria usuário/convite Auth antes de criar membership. Se o último POST falhar, o usuário convidado e o e-mail podem existir sem associação (`worker/index.ts:77-107`). **F-11 — P2 — CONFIRMADO estaticamente.**

## 20. Dependências

`npm audit --omit=dev --audit-level=high` retornou 4 vulnerabilidades high:

- `nanoid` transitivo;
- `next` 16.2.6 e dependências relacionadas;
- `postcss` transitivo;
- `sharp` transitivo, com advisories/CVEs reportados pelo registry.

Não foram feitos upgrades. **F-07 — P2 — CONFIRMADO pelo registry; impacto exato depende dos caminhos efetivamente expostos pelo bundle.** A recomendação do audit exigia `--force` para parte da árvore; isso deve ser tratado em mudança versionada, com testes e avaliação de compatibilidade.

## 21. Performance

Riscos relevantes para piloto pequeno: queries sem paginação em assignments, checklist sections/items e action plans; dashboard/histórico com limite fixo 50; signed URLs em lote; chamadas repetidas de signed URL para strings não-photo. Não há evidência de problema de latência em escala real, portanto são P2/P3 preventivos, não bloqueador isolado.

## 22. Testes

Resultado observado:

| Comando | Resultado |
|---|---|
| `npm test` | PASS — build verificado + 36/36 testes. |
| `npx tsc --noEmit` | PASS. |
| `npm run lint` | PASS. |
| `git diff --check` | PASS. |
| `npm run validate:artifact` | FAIL no shell Bash/Windows com `E_ACCESSDENIED`; o build interno validou Worker ESM `default.fetch` e hosting manifest. |
| `npm audit --omit=dev --audit-level=high` | 4 high. Sem alteração de dependência. |
| `supabase status` | FAIL: container local `supabase_db_checkflow` inexistente. |
| `supabase migration list --linked ...` | PASS read-only: seis local/remota alinhadas. |

Classificação da suíte:

- unitários/source-text: maioria dos `.test.mjs` de assignment, histórico, feedback, tema e edição;
- Worker integration-like: convite com `fetch` mockado;
- E2E real: scripts Playwright de smoke/mobile/rating, dependentes de ambiente local e fixtures;
- SQL contract/integration: arquivos em `supabase/tests`, mas não executados nesta worktree;
- smoke HTTP: staging/prod públicos respondem, sem autenticação real.

Falsa sensação de segurança: asserts regex/source-text podem passar com wiring quebrado; E2Es felizes não cobrem A/B, duas abas, duas atribuições, timeout/retry, múltiplas organizations, edição direta via PostgREST, status inválido ou falha parcial.

## 23. Harness/reprodutibilidade

O repo não contém `supabase/config.toml`; scripts SQL dependem de uma stack temporária criada fora do projeto. Nesta execução, `supabase status` encontrou referência a container inexistente. O Browser in-app também não disponibilizou navegador. Isso impede repetir aqui a matriz dinâmica sem criar novamente um stack descartável/configuração fora da árvore.

A documentação existente descreve caminhos locais e fixtures, mas há dependência operacional de Node 22, Docker, Supabase CLI, Chrome e portas específicas. A ausência de um comando único de bootstrap/reset/cleanup reduz a reprodutibilidade de um novo desenvolvedor.

## 24. Documentação

| Categoria | Estado |
|---|---|
| Arquitetura/MVP | Parcialmente correta; `AUDITORIA_COMPLETA_MVP.md` registra lacunas antigas, algumas já mudaram. |
| Release/rollback | Desatualizada em baseline e deployment: vários docs dizem “nenhum deploy”/migration não aplicada, enquanto a consulta atual mostra seis migrations remotas e deployments Cloudflare. |
| P0/RC1 | Útil como evidência histórica, mas não representa o HEAD `68852bd` nem a publicação atual. |
| Auth/Storage | Procedimentos existem, mas recuperação Auth e bytes Storage continuam dependentes de acesso humano/operacional. |
| Harness local | Ausente como configuração versionada; instruções dependem de diretório temporário. |
| Concorrência/lifecycle | Ausente: não há runbook/teste formal para duas abas, duas atribuições ou state machine inválida. |

## 25. Staging × produção × repositório

Consulta read-only aos Workers:

- Staging URL: `https://checkflow-start-staging.weslehy-carmo30.workers.dev`.
- Staging versão ativa: `e2596308-957e-45e4-bc80-8219e232d491`, 100%, tag `68852bd55ff67bda30da1bd40df02a61559d7d32`.
- Staging responde 200 em `/`, `/auth` e `/api/supabase-config`; o config expõe apenas `url` e `publicKey`.
- Produção URL Worker: `https://checkflow-start.weslehy-carmo30.workers.dev`.
- Produção deployment listado: versão `03b5b32a-104b-4ad9-988d-d46b4c1f63cf`, mensagem `CheckFlow Start runtime fix d49be2e`; não corresponde ao HEAD auditado.
- Produção respondeu 200 em `/`, `/auth` e `/api/supabase-config`.
- `.openai/hosting.json` aponta para o projeto Sites `appgprj_6a5ee794dc588191860b8c58b57bec77`; não existe `wrangler.jsonc` na raiz. O Worker staging/prod é uma trilha de deployment separada do Sites manifest.

O bundle público não apresentou `service_role`/JWT real na varredura; referências encontradas estão no Worker/server bundle esperado. O build não provou equivalência de bindings/secrets entre versões.

## 26. Todos os achados por severidade

### P0

Nenhum P0 confirmado nesta auditoria.

### P1

- **F-01 — Estrutura editável após assignment/execution.** Confirmado por policy/UI descompassadas; afeta integridade do que é executado.
- **F-02 — Corrida de assignment e execution.** Confirmado por ausência de constraint e sequência SELECT→INSERT; reprodução dinâmica pendente.
- **F-03 — State machine de execution não protegida.** Confirmado por policy `UPDATE` ampla e ausência de trigger de transição; reprodução local pendente.
- **F-04 — Operações compostas não transacionais.** Confirmado por código; pode deixar NC/plano/Storage divergentes. Classificação P1 quando ocorrer em operação real; P2 se o fluxo de recuperação manual for aceito.

### P2

- **F-05 — Múltiplas organizations não suportadas pelo frontend** (`limit(1).maybeSingle`).
- **F-06 — Staging e produção compartilham Supabase**, risco operacional e de dados.
- **F-07 — Quatro vulnerabilidades high de dependências**, sem upgrade nesta auditoria.
- **F-08 — Reuse de assignment pode escolher candidato errado** em múltiplos assignments.
- **F-09 — “Não” não persiste antes do registro de NC.**
- **F-10 — `single_select` sem caminho completo de criação/configuração e sem semântica de conformidade explícita.**
- **F-11 — Convite Auth pode deixar usuário órfão se membership falhar.**
- **F-13 — Gate `validate:artifact` não é cross-platform e a configuração de deploy não está centralizada.**

### P3

- Feedback por tela, apesar de ser descrito como global.
- Listas sem paginação e limite histórico fixo.
- `audit_logs` sem emissão automática pelo domínio.
- Signed URL desnecessária para respostas string não-photo.
- Histórico mistura snapshot imutável com status atual de planos de ação.
- Rota/UX concentrada no dashboard, sem listagem `/checklists` dedicada.

## 27. Evidências principais

- Policy manager ampla: `supabase/migrations/202607220001_base_multitenant.sql:141-149`.
- Policy de execution update sem state machine: `supabase/migrations/202607230002_hardening_rls_mvp.sql:159-162`.
- Policy de answers limitada a `in_progress`: `...202607230002_hardening_rls_mvp.sql:176-202`.
- Snapshot captura no INSERT e só protege após `completed`: `supabase/migrations/202608260002_execution_historical_snapshot.sql:110-151`.
- Proteção de records concluídos: `...202608260002_execution_historical_snapshot.sql:153-228`.
- UI-only check de assignment/execution antes de deletar: `app/checklists/[id]/checklist-detail.tsx:293-318`.
- Reuse SELECT/find/insert: `app/checklists/[id]/checklist-detail.tsx:219-264`.
- Dupla verificação e insert de execution: `app/executions/[assignmentId]/checklist-execution.tsx:130-164`.
- “Não” local até NC: `app/executions/[assignmentId]/checklist-execution.tsx:388-405`.
- Conclusão/conformidade: `app/executions/[assignmentId]/checklist-execution.tsx:347-382`.
- Plano em múltiplas escritas: `app/action-plans/action-plans.tsx:128-201`.
- Convite Auth antes de membership: `worker/index.ts:77-107`.
- Membership arbitrária: `app/page.tsx:104-116`; também action plans/team management.

## 28. Testes executados e resultados

Resultado integral já registrado na seção 22. O smoke HTTP read-only confirmou ambos os Workers vivos e Auth/config endpoints alcançáveis. O smoke de bundle staging conhecido confirmou assets principais 200 e presença do patch de assignment/reuse; nenhum deploy foi executado nesta auditoria.

## 29. O que não foi possível provar

- Matriz dinâmica completa de isolamento A/B em todas as tabelas e Storage.
- Login/signup/reset real com contas locais ou remotas.
- Corrida real de duas abas/managers e efeito exato do PostgREST sob concorrência.
- Falha real de cada etapa de upload/plano com rollback observado.
- Renderização Browser in-app nesta sessão, pois não havia navegador disponível.
- Equivalência de secrets/bindings de staging e produção; valores sensíveis não foram consultados/impressos.
- Preservação de dados históricos legados anteriores ao snapshot sem um export/fixture completo.

Essas limitações reduzem confiança da prova dinâmica; não reduzem a força das evidências estáticas dos P1.

## 30. Riscos residuais

Mesmo após corrigir os P1, permanecem risco de ambientes compartilhados, dependências high, ausência de bootstrap local único, operações sem transação, limites de paginação, manutenção de evidências e divergência entre documentação e deployment.

## 31. Plano de correção priorizado

### AGORA

1. Congelar estruturalmente checklist/seções/itens no banco após assignment ou execution; mover a regra da UI para trigger/policy testada.
2. Criar invariantes de concorrência: unique parcial para assignment ativo e execution ativa, ou RPC transacional/idempotente com locking.
3. Implementar state machine de execution no banco, incluindo limites de status, timestamps, conclusão e vínculo a respostas.
4. Tornar criação/validação/upload de plano e evidência transacionais ou usar workflow de compensação verificável/reconciliável.

### ANTES DO CLIENTE 001

1. Separar Supabase de staging e produção, ou estabelecer isolamento formal com tenant/projeto e proibição técnica de fixtures remotos.
2. Reexecutar matriz RLS A/B, Storage, histórico e papéis em stack local limpa, com testes negativos reais.
3. Corrigir múltiplas organizations, reuse determinístico e persistência de “Não”.
4. Corrigir/avaliar os quatro advisories high e registrar decisão de risco.
5. Criar baseline de deploy/rollback verificável e corrigir gate de artefato para Windows/CI.

### DURANTE PILOTO

1. Monitorar duplicatas de assignment/execution, erros de Storage, órfãos e divergência NC/plano.
2. Executar canary humano controlado e validar dashboards/histórico com dados reais não sensíveis.
3. Paginar histórico/listas e medir latência de signed URLs.

### DEPOIS DO PILOTO

1. Auditoria automática em `audit_logs`, versionamento de modelos e snapshot de follow-up.
2. Melhorias de UX/global feedback, rota dedicada de checklists e bootstrap local versionado.

## 32. Veredito

**C — NÃO PRONTO; EXISTEM BLOQUEADORES.**

## 33. Critérios objetivos para mudar o veredito

Mudar para B somente após: constraints/RPC de concorrência, state machine DB, bloqueio estrutural DB, transações/compensação de planos/evidências, teste negativo A/B completo, E2E de reload/pausa/reexecução e reexecução limpa de todos os gates.

Mudar para A somente depois de B mais: ambientes Supabase separados, rollback comprovado, dependências high tratadas ou aceitas formalmente, documentação/deploy baseline atualizada e evidência de canary sem regressões.

## 34. Top 3 alertas para o CEO

1. **O banco ainda permite que estrutura operacional mude fora da UI enquanto o processo está em uso; isso ameaça a confiabilidade do histórico e da execução.**
2. **Staging e produção compartilham o mesmo Supabase; qualquer teste remoto mal direcionado pode afetar o ambiente do cliente.**
3. **Os testes verdes não cobrem concorrência, state machine inválida e falhas parciais; o sistema precisa desses gates antes do piloto.**

## Arquivos locais criados/modificados

- Criado: `docs/AUDITORIA_TECNICA_INTEGRAL_2026-09-02.md`.
- Modificados: nenhum arquivo de produto; nenhum commit/push foi feito.
