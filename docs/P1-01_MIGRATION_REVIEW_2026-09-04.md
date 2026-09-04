# CheckFlow — revisão P1-01 e plano de rollout controlado

Data: 2026-09-04
HEAD revisado: `68852bd55ff67bda30da1bd40df02a61559d7d32`
Migration: [`supabase/migrations/202609030001_checklist_structure_integrity.sql`](../supabase/migrations/202609030001_checklist_structure_integrity.sql)
Escopo exclusivo: integridade estrutural de checklist após assignment/execution. P1-02, P1-03 e P1-04 permanecem fora do escopo.

## 1. Resultado executivo

A correção está comprovada dinamicamente no Supabase local e é compatível, por inspeção, com as seis migrations presentes no baseline local. A revisão encontrou e corrigiu uma janela de visibilidade: `checkflow_checklist_is_protected` não deve ser `STABLE` quando é chamada depois de um `SELECT ... FOR UPDATE` que pode esperar outra sessão; a função agora usa a volatilidade padrão `VOLATILE`.

O rollout remoto está bloqueado nesta sessão. A consulta read-only da CLI alcançou o projeto, mas falhou por conectividade IPv6; a tentativa alternativa de inventário exigiria um access token Supabase que não está disponível. REST público também retornou `401`. Portanto, os pré-requisitos remotos não foram novamente provados em 2026-09-04. Os números e o histórico registrados nos documentos anteriores são evidência histórica, não confirmação atual.

Não houve escrita remota, migration remota, deploy, push, merge, alteração de Auth, Storage ou Cloudflare.

## 2. Auditoria SQL linha a linha

| Linhas | Conteúdo | Revisão |
|---|---|---|
| 5–19 | `lock_checkflow_checklist(uuid)` | `plpgsql`, `SECURITY DEFINER`, `search_path=''`; bloqueia somente a linha pai com `FOR UPDATE`; `NULL` é no-op. Owner local: `postgres`. |
| 21–44 | `checkflow_checklist_is_protected(uuid)` | `SQL SECURITY DEFINER`, `search_path=''`, `VOLATILE`; retorna protegido se status não é `draft`, ou existe qualquer assignment/execution para o checklist. IDs são UUID globalmente únicos. |
| 46–105 | trigger estrutural | Resolve checklist pai para checklist/seção/item; em move entre checklists adquire locks em ordem UUID ascendente; em seguida consulta a proteção e lança exceção antes da mutação. `DELETE` retorna `OLD`, demais operações retornam `NEW`. |
| 107–145 | trigger de lifecycle | Assignment/execution `INSERT/UPDATE` adquire o mesmo lock do pai; em mudança entre checklists usa a mesma ordem ascendente. Não rejeita assignment, execution ou reatribuição. |
| 147–160 | triggers estruturais | `BEFORE UPDATE/DELETE` em `checklists`; `BEFORE INSERT/UPDATE/DELETE` em `checklist_sections` e `checklist_items`. |
| 162–172 | triggers de lifecycle | `before_checkflow_lifecycle_lock` em assignment e execution. O nome faz o lock ocorrer antes, por ordem de nome, do trigger histórico `capture_and_protect_execution_snapshot`. |
| 174–177 | privilégios | `EXECUTE` revogado de `public`, `anon`, `authenticated` e `service_role` nas quatro funções. Elas só são alcançadas pelo mecanismo de trigger. |

### Segurança das funções

As quatro funções são `SECURITY DEFINER`, pertencem localmente a `postgres` e têm `proconfig = {search_path=""}`. Todas as relações são referenciadas como `public.<objeto>`; não há resolução implícita de objeto pelo `search_path`. A função de proteção precisa enxergar assignments/executions independentemente da visibilidade RLS do chamador, e por isso a execução pelo owner da tabela é intencional. Os privilégios de chamada pública são revogados.

O rollout deve confirmar no remoto que o executor da migration é o owner operacional esperado (`postgres` ou role equivalente controlada), pois `SECURITY DEFINER` assume o owner da função. Também deve confirmar que as tabelas não estão em `FORCE ROW LEVEL SECURITY`; caso estivessem, a leitura interna poderia ser afetada.

### Lock order, deadlock e corrida

O lock de runtime é uma row lock no checklist pai. Assignment/execution e cada mutação estrutural do mesmo checklist passam pelo mesmo lock. Isso elimina a corrida crítica: a operação que adquirir o lock primeiro define se a outra, após esperar e obter uma nova leitura `VOLATILE`, será aceita ou rejeitada.

Movimentos entre dois checklists adquirem ambos os locks pelo UUID ascendente, evitando deadlock entre duas sessões que movimentam a mesma combinação em direções opostas. Ainda existe o risco geral de deadlock em uma única transação que faça múltiplos statements/rows sobre vários checklists em ordem diferente; a migration não tenta ordenar globalmente uma instrução multi-row. O risco para o fluxo atual é baixo, porque as operações da UI são checklist-scoped e os movimentos estruturais não são um fluxo aprovado.

O trigger não bloqueia a assignment/execution depois de adquirir o lock: a transição continua legítima. Uma falha posterior de RLS, FK, validação de tenant ou snapshot aborta a operação normalmente. Se a transação fizer rollback, o lock é liberado e nenhuma assignment, execution ou alteração estrutural fica persistida.

### RLS, autorização e domínio

RLS continua decidindo “quem pode fazer”: no schema-base, `org_manager_write` autoriza owner/manager em `FOR ALL` para as tabelas estruturais; collaborator/executor não tem escrita estrutural. O trigger decide “em qual estado pode existir”: mesmo owner/manager autorizado recebe exceção se o checklist estiver publicado/não-draft ou tiver assignment/execution.

A migration não altera policies, roles, Auth ou isolamento. Constraints/FKs continuam garantindo referências, mas não poderiam expressar a condição temporal entre tabelas. Não foi criado RPC obrigatório porque chamadas diretas existentes às tabelas também precisam permanecer seguras.

## 3. Invariante aprovada

```text
status = draft ∧ nenhum assignment ∧ nenhuma execution
  => owner/manager autorizados podem INSERT/UPDATE/DELETE checklist, seção e item

status <> draft ∨ existe assignment ∨ existe execution
  => nenhuma mutação estrutural INSERT/UPDATE/DELETE é aceita

execution completed
  => execution, snapshot, answers e attachments continuam protegidos pelas
     migrations históricas; NC/action plan preservam o fluxo corretivo aprovado

reatribuição após conclusão
  => novo assignment independente pode ser inserido; assignment/execution/snapshot
     anteriores não são alterados
```

A proteção é baseada na existência de assignment/execution. Não foi criado versionamento de template, tombstone de assignment ou fluxo de reabertura. Assim, uma combinação administrativa que apague todos os assignments e executions não concluídos pode remover o motivo existencial da proteção; isso é uma limitação explícita do modelo atual e não deve ser tratado como reabertura de checklist pela UI.

## 4. Matriz final de operações

| Objeto/operação | owner/manager em draft sem lifecycle | owner/manager protegido | collaborator/executor |
|---|---:|---:|---:|
| checklist `INSERT` | permitido pela RLS | permitido para criar outro checklist draft; não há trigger `INSERT` | bloqueado pela RLS |
| checklist `UPDATE/DELETE` | permitido | rejeitado pelo trigger | bloqueado pela RLS |
| seção/item `INSERT/UPDATE/DELETE` | permitido | rejeitado pelo trigger | bloqueado pela RLS |
| assignment `INSERT/UPDATE/DELETE` | permissões existentes | continua permitido para owner/manager; `INSERT/UPDATE` apenas serializam | leitura do assignment próprio, conforme policy |
| execution `INSERT/UPDATE` | permissões existentes | continua permitido; `INSERT/UPDATE` apenas serializam | execution própria atribuída, conforme policy |
| execution `DELETE` | comportamento histórico inalterado | proteção de concluída continua na migration histórica | sem delete pela policy do executor |

## 5. Snapshot, dados existentes e 68852bd

- A migration não adiciona coluna, não faz backfill e não reescreve dados. Ao ser aplicada, rows existentes que já sejam não-draft ou tenham assignment/execution passam a estar protegidas imediatamente.
- O snapshot histórico continua sendo produzido/protegido por `202608260002_execution_historical_snapshot.sql`; a migration P1-01 não o recalcula nem o altera.
- `68852bd` continua compatível: a assignment posterior à conclusão passa pelo lock, mas não é rejeitada. O teste local confirmou duas assignments independentes para o mesmo checklist/executor.
- A exclusão administrativa de uma assignment continua não sendo bloqueada por esta migration; cascades/FKs e a proteção histórica mantêm o comportamento existente. Isso não é uma nova permissão nem uma mudança de produto.

## 6. Prova local executada

Stack: container local `supabase_db_checkflow-start-e2e-local`, RLS ativo, `set local role authenticated`, claims `request.jwt.claim.sub`, fixtures transacionais com `ROLLBACK`.

| Caso | Resultado |
|---|---|
| Reprodução sem P1: manager alterou checklist protegido diretamente | PASS da reprodução; `UPDATE 1` confirmou a vulnerabilidade |
| A — draft: owner/manager editam checklist, seção e item | PASS |
| B — assignment: checklist `UPDATE/DELETE` e seção/item `INSERT/UPDATE/DELETE` | PASS, todos rejeitados |
| C — execution em andamento: mutação estrutural | PASS, rejeitada |
| D — execution completed: mutação estrutural | PASS, rejeitada |
| E/F/G/H/I — seção/item nos três verbos | PASS, rejeitados quando protegidos |
| J — executor/collaborator e tenant A contra tenant B | PASS, RLS bloqueou |
| K — snapshot anterior | PASS, JSON permaneceu idêntico |
| L — reatribuição após conclusão | PASS, nova assignment independente |
| status `active` sem assignment | PASS, estrutura rejeitada após publicação |
| corrida: edição primeiro, assignment depois | PASS, assignment esperou e confirmou após commit |
| corrida: assignment primeiro, edição depois | PASS, edição esperou e falhou após commit |
| reaplicação da migration | PASS, idempotente |

As quatro funções, cinco triggers e privilégios foram inspecionados no catálogo local. O owner foi `postgres`, as quatro funções eram `SECURITY DEFINER`, `search_path` estava vazio e `EXECUTE` estava revogado para os quatro roles verificados.

## 7. Compatibilidade com schema remoto

Por inspeção do baseline local, a migration usa somente:

- `checklists.id`, `checklists.status`;
- `checklist_sections.id/checklist_id`;
- `checklist_items.section_id`;
- `checklist_assignments.checklist_id`;
- `checklist_executions.checklist_id`;
- roles `public`, `anon`, `authenticated`, `service_role`.

Essas tabelas/colunas existem no baseline local das migrations 202607220001, 202607230002, 202607230003, 202608260001, 202608260002 e 202608280001. A compatibilidade remota não pode ser declarada como confirmada sem uma leitura atual de catálogo e histórico.

## 8. Pré-condições remotas — somente leitura

Tentativas feitas em 2026-09-04:

1. `supabase migration list --linked --workdir migration-review --output json` alcançou o projeto, mas falhou por IPv6 indisponível.
2. `supabase projects list --output json` falhou porque não há `SUPABASE_ACCESS_TOKEN`/login disponível.
3. GET read-only no endpoint REST do projeto retornou `401` para as tabelas auditadas.

Não foi feito login, não foi criado link persistente no projeto, e nenhum comando de escrita foi tentado. O arquivo temporário de configuração usado para apontar a CLI deve ser removido antes do commit.

Última evidência histórica registrada: em 2026-08-28, os documentos de preflight registraram seis migrations, contagens `2 organizations / 7 memberships / 7 checklists / 11 assignments / 6 executions / 17 answers / 2 nonconformities / 1 action plan / 4 objetos Storage`, zero órfãos/cross-tenant e RLS ativo. Essa leitura não substitui o preflight imediatamente anterior ao rollout; há inclusive seções históricas anteriores com estado pré-RC1 divergente.

O operador autorizado deve executar, sem modificar dados, as consultas abaixo por uma conexão Supabase/psql com IPv4 e credencial apropriada:

```sql
select version, name
from supabase_migrations.schema_migrations
order by version;

select to_regclass('public.checklists'),
       to_regclass('public.checklist_sections'),
       to_regclass('public.checklist_items'),
       to_regclass('public.checklist_assignments'),
       to_regclass('public.checklist_executions');

select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('checklists','checklist_sections','checklist_items',
                     'checklist_assignments','checklist_executions')
order by table_name, ordinal_position;

select c.oid::regclass as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as force_rls,
       pg_get_userbyid(c.relowner) as owner
from pg_class c
where c.oid in ('public.checklists'::regclass,
                'public.checklist_sections'::regclass,
                'public.checklist_items'::regclass,
                'public.checklist_assignments'::regclass,
                'public.checklist_executions'::regclass);

select n.nspname||'.'||c.relname as table_name, t.tgname,
       pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('checklists','checklist_sections','checklist_items',
                    'checklist_assignments','checklist_executions')
  and not t.tgisinternal
order by 1,2;

select p.oid::regprocedure as signature,
       pg_get_userbyid(p.proowner) as owner,
       p.prosecdef as security_definer,
       p.provolatile as volatility,
       p.proconfig
from pg_proc p
where p.oid::regprocedure::text in (
  'lock_checkflow_checklist(uuid)',
  'checkflow_checklist_is_protected(uuid)',
  'enforce_checkflow_structure_immutability()',
  'lock_checkflow_lifecycle_checklist()'
);

select has_function_privilege('public','public.lock_checkflow_checklist(uuid)','execute') as public_exec,
       has_function_privilege('anon','public.lock_checkflow_checklist(uuid)','execute') as anon_exec,
       has_function_privilege('authenticated','public.lock_checkflow_checklist(uuid)','execute') as authenticated_exec,
       has_function_privilege('service_role','public.lock_checkflow_checklist(uuid)','execute') as service_role_exec;

select 'organizations' as entity, count(*) from public.organizations
union all select 'memberships', count(*) from public.organization_members
union all select 'checklists', count(*) from public.checklists
union all select 'assignments', count(*) from public.checklist_assignments
union all select 'executions', count(*) from public.checklist_executions
union all select 'answers', count(*) from public.execution_answers
union all select 'nonconformities', count(*) from public.non_conformities
union all select 'action_plans', count(*) from public.action_plans;

select count(*) as orphan_sections
from public.checklist_sections s
left join public.checklists c on c.id=s.checklist_id
where c.id is null;

select count(*) as orphan_items
from public.checklist_items i
left join public.checklist_sections s on s.id=i.section_id
where s.id is null;

select count(*) as orphan_assignments
from public.checklist_assignments a
left join public.checklists c on c.id=a.checklist_id
where c.id is null;

select count(*) as orphan_executions
from public.checklist_executions e
left join public.checklists c on c.id=e.checklist_id
where c.id is null;

select count(*) as cross_tenant_links
from public.checklist_sections s
join public.checklists c on c.id=s.checklist_id
where s.organization_id is distinct from c.organization_id
union all
select count(*)
from public.checklist_items i
join public.checklist_sections s on s.id=i.section_id
where i.organization_id is distinct from s.organization_id
union all
select count(*)
from public.checklist_assignments a
join public.checklists c on c.id=a.checklist_id
where a.organization_id is distinct from c.organization_id
union all
select count(*)
from public.checklist_executions e
join public.checklists c on c.id=e.checklist_id
where e.organization_id is distinct from c.organization_id;
```

STOP se houver migration ausente/divergente, coluna ausente, trigger homônimo inesperado, owner não controlado, `force_rls` incompatível, privilege inesperado, FK quebrada, contagem alterada sem explicação, órfão ou cross-tenant diferente de zero.

## 9. Impacto operacional e risco

Classificação da migration: **MEDIUM**.

- DDL: `CREATE/DROP TRIGGER` adquire lock de tabela nas cinco tabelas afetadas (`checklists`, `checklist_sections`, `checklist_items`, `checklist_assignments`, `checklist_executions`). Pode esperar transações longas e bloquear temporariamente leituras/escritas dessas tabelas até o commit da migration.
- Duração estimada: execução local do SQL foi sub-segundo; no remoto, reservar janela curta e medir lock wait. Não prometer duração fixa: transações abertas podem alongar a janela.
- Não há backfill, scan de dados em migration, `ALTER TABLE`, índice concorrente ou operação não transacional.
- Runtime: cada mutação estrutural/lifecycle bloqueia uma row de checklist; o custo é proporcional à contenção por checklist, não ao número total de rows.
- Deadlock: risco relevante somente em operações multi-checklist/multi-row em ordens diferentes; para o fluxo aprovado, a ordem ascendente em moves elimina o ciclo conhecido.
- Race: coberta pelo lock comum e pela leitura `VOLATILE` após espera.
- Falha parcial: pelo `supabase db push`, migration deve ser executada em transação; qualquer erro deve abortar todos os DDL. O arquivo não contém `BEGIN/COMMIT` explícitos, portanto não deve ser aplicado por `psql -f` sem wrapper transacional.
- Dados existentes: não são modificados, mas rows já protegidas começarão a rejeitar edições administrativas que antes passavam.

## 10. Rollback realista

O rollback não deve ser executado como comando avulso. A migration não altera rows, portanto não há payload de dados específico para restaurar. O rollback técnico deve ser uma migration forward revisada, executada em transação, que remova somente os objetos P1-01, ou um restore de backup se o incidente envolver estado mais amplo.

SQL técnico de referência para uma migration de rollback, válido somente depois de confirmar que não existem dependências posteriores nesses objetos:

```sql
begin;
drop trigger if exists enforce_checkflow_structure_immutability on public.checklists;
drop trigger if exists enforce_checkflow_structure_immutability on public.checklist_sections;
drop trigger if exists enforce_checkflow_structure_immutability on public.checklist_items;
drop trigger if exists before_checkflow_lifecycle_lock on public.checklist_assignments;
drop trigger if exists before_checkflow_lifecycle_lock on public.checklist_executions;

drop function if exists public.enforce_checkflow_structure_immutability();
drop function if exists public.lock_checkflow_lifecycle_checklist();
drop function if exists public.checkflow_checklist_is_protected(uuid);
drop function if exists public.lock_checkflow_checklist(uuid);
commit;
```

Esse SQL reabre o P1 e não restaura automaticamente triggers homônimos que existiam antes. Se a pré-condição detectar objetos prévios ou se o incidente exceder esses objetos, o rollback correto é restore de backup/schema previamente comprovado. Antes do rollout, obter backup/export aprovado e registrar checksum; não aplicar rollback nesta missão.

## 11. Plano de rollout remoto

1. Obter autorização humana para uma única escrita e acesso Supabase com conectividade IPv4.
2. Reexecutar todo o preflight da seção 8 e guardar a saída; não prosseguir com qualquer divergência.
3. Confirmar backup/export, checksum, janela curta e monitoramento de locks/erros.
4. Executar somente `supabase db push --linked` (ou mecanismo oficial equivalente) com a migration `202609030001_checklist_structure_integrity.sql` pendente; não usar `migration repair`, não editar histórico e não aplicar outras migrations.
5. Parar imediatamente se o comando listar outra migration, fizer prompt inesperado, falhar ou ultrapassar a janela de lock.
6. Executar o postflight da seção 12. Se qualquer teste falhar, não fazer deploy; preservar logs e decidir entre correção forward ou restore.

## 12. Postflight remoto reversível

Primeiro repetir catálogo, histórico, funções, triggers, owner, `search_path`, RLS e privilégios. A migration deve aparecer exatamente uma vez e os cinco triggers P1-01 devem existir.

Para A–I, usar uma organização/usuários de teste autorizados ou um banco descartável restaurado do backup. Não mutar rows de negócio reais. Em conexão de teste, usar `BEGIN`, `set local role authenticated`, claims reais de usuários de teste e `ROLLBACK`:

- **A:** checklist draft sem assignment/execution: owner/manager conseguem atualizar checklist, seção e item; conseguem inserir/excluir item e criar/excluir checklist draft.
- **B:** após inserir assignment, repetir checklist `UPDATE/DELETE`, seção `INSERT/UPDATE/DELETE` e item `INSERT/UPDATE/DELETE`; cada tentativa deve falhar pela proteção.
- **C:** após inserir execution in progress, repetir a matriz; cada tentativa deve falhar.
- **D:** concluir a execution e repetir ao menos checklist, seção e item; cada tentativa deve falhar.
- **E:** confirmar owner e manager autorizados no draft, mas ambos rejeitados pelo lifecycle protegido.
- **F:** confirmar collaborator/executor sem escrita estrutural no draft e no protegido; verificar que continua podendo operar somente sua execution conforme as policies existentes.
- **G:** com duas organizações, usuário de A não deve obter rows nem alterar B; repetir leitura e tentativa de update/insert.
- **H:** calcular hash/`md5(execution_snapshot::text)` antes da matriz e comparar depois; deve ser idêntico.
- **I:** após execution concluída, inserir nova assignment; confirmar novo UUID, assignment anterior inalterada e nenhuma alteração na execution/snapshot anterior.
- **J:** executar as consultas de órfãos para seções, itens, assignments, executions, answers, attachments, NCs e action plans; tudo deve ser zero.
- **K:** executar os joins cross-tenant para todas as relações e confirmar zero; verificar RLS habilitado em todas as tabelas operacionais.

Consultas adicionais obrigatórias para histórico/snapshot:

```sql
select count(*) as completed_without_snapshot
from public.checklist_executions
where status='completed' and execution_snapshot is null;

select id, md5(coalesce(execution_snapshot::text, '')) as snapshot_hash
from public.checklist_executions
where status='completed'
order by id; -- guardar antes e comparar depois do teste

select tgname, pg_get_triggerdef(oid)
from pg_trigger
where tgrelid='public.checklist_executions'::regclass
  and not tgisinternal
order by tgname;
```

O postflight não deve criar users Auth em produção. Se não houver fixture remota descartável, A–I ficam pendentes de prova dinâmica e o rollout deve ser considerado bloqueado, mesmo que o catálogo esteja correto.

## 13. Arquivos e commit local

Alterados para esta revisão/correção:

- `supabase/migrations/202609030001_checklist_structure_integrity.sql` — `checkflow_checklist_is_protected` ajustada de `STABLE` para `VOLATILE`.
- `supabase/tests/checkflow_start_structural_integrity.sql` — matriz comportamental, caso `status='active'` e grants locais transacionais.
- `supabase/tests/checkflow_start_historical_integrity.sql` — proteção de mutações de fonte e grants locais transacionais.
- `supabase/tests/checkflow_start_p0_behavior.sql` — grants locais transacionais para manter o gate executável com role authenticated.
- `docs/P1-01_INTEGRIDADE_ESTRUTURAL_2026-09-03.md` — relatório da implementação local.
- este documento — revisão da migration e plano de rollout.

Nenhum arquivo de configuração temporário, resultado local ou documentação não relacionada deve entrar no commit.

## 14. Gates executados

| Gate | Resultado |
|---|---|
| `npm test` | PASS — 36/36 |
| `npm run build` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `git diff --check` | PASS, somente avisos de conversão LF/CRLF |
| structural SQL | PASS |
| historical SQL | PASS |
| P0 SQL relevante | PASS |
| security-definer execute SQL | PASS |
| migration reaplicada localmente | PASS |
| concorrência em duas sessões | PASS nos dois sentidos |
| remote preflight atual | BLOCKED — IPv6/token/401 |

## 15. Gate de decisão

1. Migration segura para o schema remoto atual? **Não é possível confirmar atualmente**; compatibilidade local é PASS, confirmação remota está pendente.
2. Risco de deadlock relevante? **Não no fluxo normal; risco residual MEDIUM para DML multi-checklist em ordem inversa.**
3. Rollback definido? **Sim, como migration forward revisada ou restore; não executar rollback avulso.**
4. Postflight completo? **Definido, mas a parte dinâmica remota A–I ainda não executada.**
5. Novo P0/P1? **Nenhum novo dentro do P1-01; P1-02/P1-03/P1-04 e demais achados da auditoria não foram tratados.**
6. Risco final? **MEDIUM para o SQL; rollout operacional bloqueado até preflight/backup/prova remotos.**
7. É seguro solicitar autorização humana para aplicar somente esta migration? **Ainda não nesta sessão.** Primeiro é necessário repetir o preflight com acesso válido e confirmar backup/rollback.

Estado: **BLOCKED**
