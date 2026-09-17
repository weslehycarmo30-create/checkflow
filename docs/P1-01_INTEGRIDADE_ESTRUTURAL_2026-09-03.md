# CheckFlow — P1-01: integridade estrutural server-side

Data: 2026-09-04
Escopo exclusivo: congelamento de `checklists`, `checklist_sections` e `checklist_items` após assignment/execution. P1-02, P1-03 e P1-04 não foram implementados.

## 1. Reprodução original do P1

No schema local com as seis migrations da auditoria, sem a migration P1-01 e com RLS ativo, foi executada uma fixture autenticada como manager. Após inserir uma `checklist_assignment`, o manager conseguiu fazer `UPDATE` direto em `checklists` (`UPDATE 1`). A regressão então falhou com `owner protected update was accepted` porque a mesma operação também foi aceita para owner.

No mesmo cenário, a policy permitia ao manager:

- `checklists`: `UPDATE` e `DELETE` de registro protegido;
- `checklist_sections`: `UPDATE` e `DELETE` de seção protegida;
- `checklist_items`: `INSERT`, `UPDATE` e `DELETE` em checklist protegido.

Isso reproduz a divergência entre a UI e o limite real do banco.

## 2. Causa raiz e matriz de operações

`checklist-detail.tsx` bloqueia os handlers somente no frontend. A policy `org_manager_write` era `FOR ALL` para owner/manager nas tabelas operacionais. Portanto, RLS autorizava a operação por papel/tenant, mas não havia uma regra de lifecycle.

| Tabela | owner/manager | collaborator/executor |
|---|---|---|
| checklist/seção/item | `INSERT`, `UPDATE`, `DELETE` quando RLS permite | sem escrita estrutural por RLS; leitura do próprio tenant |
| assignment | escrita ampla | leitura apenas de assignment próprio |
| execution | escrita ampla | `INSERT`/`UPDATE` da própria execução atribuída; sem delete |

O snapshot existente protege a cópia histórica e a execução concluída; não protegia a estrutura viva durante assignment/execution. FKs, constraints existentes, policies e triggers de tenant não expressavam a regra temporal.

## 3. Invariante formalizada

```text
checklist.status = draft
e não existe assignment
e não existe execution
  => owner/manager autorizados podem inserir, atualizar e excluir estrutura

status <> draft ou existe qualquer assignment ou existe qualquer execution
  => nenhuma mutação em checklist, seção ou item é aceita

execution completed
  => execution, snapshot, answers e attachments seguem as proteções históricas existentes

nova execução/reatribuição
  => assignment novo pode ser inserido; não altera assignment/execução/histórico anterior
```

A regra é monotônica enquanto houver a linha de assignment/execution. Não foi inventado versionamento de template nem um fluxo para reabrir checklist.

## 4. Mecanismo escolhido

Foi criada a migration `supabase/migrations/202609030001_checklist_structure_integrity.sql` com:

- trigger `BEFORE INSERT OR UPDATE OR DELETE` nas seções e itens;
- trigger `BEFORE UPDATE OR DELETE` no checklist;
- função `SECURITY DEFINER`, `search_path = ''`, que consulta o estado real do checklist sem depender da UI/RLS;
- lock `FOR UPDATE` do checklist durante mutações estruturais;
- lock equivalente em `INSERT/UPDATE` de assignment/execution, para serializar a transição para o estado protegido;
- ordem estável de locks em movimentos entre checklists;
- `EXECUTE` revogado para `public`, `anon`, `authenticated` e `service_role`; as funções só são chamadas por triggers.

RLS continua responsável por “quem pode fazer”. O trigger é responsável por “em qual estado pode existir”.

## 5. Avaliação das alternativas

- RLS: mantém isolamento e autorização, mas não é o mecanismo principal; uma expressão de policy não resolve sozinha a corrida entre assignment e edição.
- Trigger: escolhido para garantir a invariante em chamadas diretas às tabelas, inclusive para owner/manager autorizados, e para consultar relações pai.
- Constraint: não é suficiente para uma regra que depende de existência/estado em outras tabelas.
- Função/RPC: não foi usada como porta obrigatória, pois chamadas diretas existentes às tabelas precisam continuar protegidas sem refatorar o fluxo da aplicação.

## 6. Arquivos alterados

- `supabase/migrations/202609030001_checklist_structure_integrity.sql` — migration local nova.
- `supabase/tests/checkflow_start_structural_integrity.sql` — regressão SQL comportamental A–L, com fixture e RLS.
- `supabase/tests/checkflow_start_historical_integrity.sql` — fixture passa a estruturar checklist em `draft` e verifica rejeição das mutações de fonte.
- `supabase/tests/checkflow_start_p0_behavior.sql` — fixture passa a estruturar checklist em `draft`, mantendo o gate P0 compatível com o congelamento.
- `docs/P1-01_INTEGRIDADE_ESTRUTURAL_2026-09-03.md` — este relatório.

Nenhum frontend, Auth, Storage remoto, Worker, Cloudflare ou configuração remota foi alterado.

## 7. Testes adversariais e resultado

Executado no container local `supabase_db_checkflow-start-e2e-local`, com `set local role authenticated`, claims `request.jwt.claim.sub`, RLS ativo e `BEGIN ... ROLLBACK`:

| Caso | Resultado |
|---|---|
| A — draft: manager edita checklist/seção/item | PASS |
| A — draft: owner edita checklist | PASS |
| A — checklist draft nova pode ser criada e removida | PASS |
| B — após assignment: checklist `UPDATE`/`DELETE` | PASS, rejeitados |
| B/E — seção `UPDATE`/`DELETE` | PASS, rejeitados |
| B — seção `INSERT` | PASS, rejeitado |
| B/G/H/I — item `INSERT`/`UPDATE`/`DELETE` | PASS, rejeitados |
| C — após execution: mutação estrutural | PASS, rejeitada |
| D — após execution completed: mutação estrutural | PASS, rejeitada |
| J — executor tenta escrever estrutura | PASS, bloqueado por RLS |
| J — tenant A tenta alterar tenant B | PASS, zero linhas/RLS |
| K — snapshot permanece idêntico | PASS |
| L — reatribuição após conclusão cria assignment independente | PASS |

Também foi validada a serialização local em duas sessões: edição primeiro permite assignment somente depois do commit; assignment primeiro faz a edição aguardar e ser rejeitada após o commit do assignment.

## 8. Regressões locais

| Gate | Resultado |
|---|---|
| `npm test` (build + 36 testes Node) | PASS — 36/36 |
| `npm run build` | PASS — Worker ESM `default.fetch` e manifest validados |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `git diff --check` | PASS |
| structural SQL | PASS |
| historical SQL | PASS |
| P0 SQL relevante | PASS |
| reaplicação local da migration | PASS |

O comando `supabase status` continua reportando erro porque não há `supabase/config.toml` versionado e ele procura o container obsoleto `supabase_db_checkflow`. Isso não impediu a prova: o stack local descartável saudável foi identificado diretamente e usado. Os grants de tabelas ausentes nesse stack foram concedidos somente dentro das transações de teste; foram revogados ao final.

## 9. Impactos obrigatórios

### 68852bd

Sem alteração da lógica de `68852bd`. O trigger não bloqueia `checklist_assignments`; após execution concluída, a nova assignment independente continua sendo inserida. O teste L confirmou duas assignments para o mesmo executor/checklist.

### Snapshot histórico

Sem alteração da migration histórica. A estrutura é congelada antes/durante a execução; o snapshot capturado no `INSERT` permanece idêntico e as proteções de execution concluída continuam ativas. O teste histórico passou.

### Multiempresa/RLS

Não houve relaxamento de RLS. A função consulta somente o checklist relacionado à linha da operação e os triggers de vínculo/tenant continuam ativos. Tenant A não alterou tenant B; o gate P0 de isolamento continuou passando.

## 10. Migration, risco e rollback

A migration não altera dados, não faz backfill e não cria coluna. Ao ser aplicada, protege automaticamente checklists já existentes cujo status não seja `draft` ou que tenham assignment/execution.

Riscos: rejeição de operações administrativas diretas antes aceitas; dependência de relações existentes estarem consistentes; operações legítimas de exclusão/reabertura de assignment podem exigir revisão futura. Não há rollback aplicado nem remoto.

Rollback técnico, somente após revisão: migration posterior removendo os triggers/funções ou restauração de backup aprovado. Remover essa proteção reabre o P1, portanto não deve ser rollback operacional sem plano de contenção.

## 11. Limitações

- A prova dinâmica é local; claims foram simulados no PostgreSQL, não houve usuário remoto.
- A migration foi escrita e instalada manualmente no container local para teste; não foi aplicada via Supabase remoto.
- Não houve deploy, push, merge ou alteração de dados/Auth/Storage remoto.
- A proteção não impede um superusuário/DB owner de desabilitar triggers; isso está fora do limite de uma operação autenticada normal.
- P1-02/P1-03/P1-04 permanecem fora desta missão.

## 12. Commit

Nenhum commit foi criado. HEAD permanece `68852bd55ff67bda30da1bd40df02a61559d7d32`.

## Estado final

**READY FOR MIGRATION REVIEW**
