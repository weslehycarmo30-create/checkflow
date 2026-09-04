# P1-03 — state machine de execution

## Causa raiz

O enum aceitava `pending`, `in_progress`, `paused`, `completed` e `cancelled`,
mas o banco não impunha transições. Um cliente autorizado podia atualizar
diretamente uma execution concluída para um estado operacional, ou concluir uma
execution com metadados incompatíveis.

## Invariante

Fluxo operacional aprovado:

`in_progress -> paused -> in_progress -> completed`.

`completed` é terminal e imutável nos campos de negócio. Pausa requer
`paused_at`; retomada a limpa. Conclusão requer `completed_at >= started_at`,
conformidade entre 0 e 100 (incluindo 0), e resumo JSON objeto. Novas executions
devem nascer em `in_progress`. `pending` e `cancelled` permanecem valores legados
do enum, não são transições operacionais novas.

## Correção

`202609040002_enforce_execution_state_transitions.sql` cria o trigger
`enforce_checkflow_execution_state_transition`, `SECURITY DEFINER` e
`search_path=''`, com execute revogado de papéis de cliente. É uma regra de
domínio independente de UI e RLS.

## Provas locais

`checkflow_start_execution_state_machine.sql`, transacional e autocontido,
provou:

- `in_progress -> paused -> in_progress` permitido;
- `paused -> completed`, `pending`, conclusão sem conformidade,
  `completed -> in_progress` e nova conclusão com timestamp alterado rejeitados;
- conclusão válida com conformidade `0` aceita.

O teste inicialmente usava `now()` para produzir dois timestamps diferentes na
mesma transação; PostgreSQL fixa `now()` na transação. Foi um **TEST BUG** e a
assertion foi ajustada para `clock_timestamp()`, sem mudar a regra.

## Risco residual

Esta migration não faz backfill de rows legadas `pending`/`cancelled`; a
distribuição remota desses estados precisa ser revisada no rollout. Requisitos de
respostas completas continuam validados pelo fluxo de produto; não foram
promovidos a uma nova regra de banco nesta missão.
