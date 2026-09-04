# Revisão integrada P1-01 a P1-04

## Ordem de migrations

1. `202609030001_checklist_structure_integrity.sql` (P1-01)
2. `202609040001_prevent_assignment_execution_duplication.sql` (P1-02)
3. `202609040002_enforce_execution_state_transitions.sql` (P1-03)
4. `202609040003_make_action_workflows_failure_safe.sql` (P1-04)

P1-02 chama o helper de lock criado em P1-01; essa dependência torna a ordem
obrigatória.

## Locks e deadlocks

P1-01 e P1-02 adquirem o lock da row pai `checklists` antes de consultar ou
alterar o ciclo de assignment. P1-03 não adquire novo lock; seu trigger apenas
valida a transição. P1-04 depende de índices únicos e de DML transacional. A
ordem observada é checklist antes de assignment/execution e não há lock inverso
nas novas funções. Corridas em sessões independentes concluíram sem deadlock.

## Compatibilidade

- RLS permanece responsável por quem pode atuar; triggers, RPC e constraints
  aplicam invariantes mesmo para roles autorizadas.
- Os triggers `SECURITY DEFINER` usam `search_path=''` e têm execute revogado.
  A RPC P1-04 restringe execute a `authenticated` e revalida usuário, execução,
  item, organização, MIME, tamanho e prefixo do caminho.
- Os testes locais cobriram tenant separado, histórico e snapshot. P1-01 mantém
  estrutura e snapshot imutáveis após lifecycle protegido.
- P1-02 preserva a reatribuição independente de `68852bd`: depois de concluída,
  uma nova assignment é aceita e a execution original não pode ser reutilizada.

## Limitações do harness

O repositório não possui `supabase/config.toml`; `supabase status` depende de
nomes antigos de container. A validação foi executada no container local saudável
`supabase_db_checkflow-start-e2e-local`, com fixtures transacionais e timeout de
consulta. Isso é uma **HARNESS/ENVIRONMENT LIMITATION**, não evidência de falha
de produto. A reprodução local é possível, mas ainda não é um comando único
padronizado pelo CLI do repositório.

## Estado remoto

Nenhum SQL, migration, dado, deploy ou push remoto foi executado nesta rodada.
P1-01 permanece congelado no commit `7f13b8c66f3e23f9ac6ea305e15eddbd61bfa2e3`;
seu preflight remoto continua pendente de execução humana.
