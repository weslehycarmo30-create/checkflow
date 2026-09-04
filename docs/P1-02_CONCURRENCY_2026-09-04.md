# P1-02 — concorrência de assignment e execution

## Causa raiz e reprodução

Antes desta migration, a política RLS autorizava as inserções, mas não havia
invariante serializável entre duas sessões. Em uma fixture local, duas sessões
`psql` independentes criaram duas assignments ativas para o mesmo checklist e
executor; duas sessões também criaram duas executions para uma mesma assignment.

## Invariante

- Um ciclo operacional ativo é único por organização, checklist e executor.
- Uma assignment possui no máximo uma execution, inclusive após sua conclusão.
- Uma nova execução após conclusão usa a nova assignment criada pela
  reatribuição aprovada em `68852bd`; nunca reutiliza a execution histórica.

## Correção

`202609040001_prevent_assignment_execution_duplication.sql` adiciona:

- trigger `prevent_checkflow_duplicate_assignment_cycle`, que usa o lock do
  checklist introduzido por P1-01 antes de inspecionar ciclos ativos;
- índice único parcial `checklist_executions_one_per_assignment`.

RLS continua tratando autorização; o trigger e o índice tratam a invariante.
O trigger é `SECURITY DEFINER`, com `search_path=''`, e seu execute foi revogado
de papéis de cliente.

## Provas locais

- `checkflow_start_assignment_execution_integrity.sql`: duplicata de assignment
  rejeitada, segunda execution rejeitada, e nova assignment após `completed`
  aceita; tudo em transação com rollback.
- Corrida real em duas sessões independentes: uma assignment inserida e uma
  rejeitada; contagem final 1. A corrida de execution retornou uma inserção e
  um `unique_violation`; contagem final 1.
- A primeira tentativa da corrida de execution usava o ID presumido da sessão
  vencedora: foi classificada como **TEST BUG** e corrigida na execução para
  consultar o vencedor real. Não foi falha da proteção.

## Risco residual

O trigger serializa concorrência por checklist. Cargas muito altas no mesmo
checklist podem esperar esse lock, mas a ordem é compatível com P1-01
(checklist primeiro), sem ciclo de locks observado. A migration deve ser
aplicada após P1-01.
