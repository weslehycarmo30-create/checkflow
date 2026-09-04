# P1-04 — atomicidade de planos e evidências

## Causa raiz

Planos de ação eram gravados e depois sincronizados com a não conformidade por
uma segunda chamada do cliente. Evidência de foto gravava resposta e attachment
em chamadas independentes. Uma falha intermediária podia deixar estado parcial.

## Invariante e solução

`202609040003_make_action_workflows_failure_safe.sql` torna atômicos os passos
que pertencem ao Postgres:

- trigger após INSERT/UPDATE de `action_plans` sincroniza a não conformidade na
  mesma transação e aborta se o vínculo não existir;
- um plano é único por não conformidade;
- RPC `record_checkflow_execution_photo_evidence` grava/upserta resposta e
  attachment na mesma transação;
- `storage_path` é único e uma resposta de foto possui uma attachment canônica.

As funções são `SECURITY DEFINER`, usam `search_path=''`; a função interna não é
executável pelo cliente e somente `authenticated` pode chamar a RPC.

## Storage + Postgres

Object Storage e Postgres não compartilham transação. O cliente faz upload
primeiro; se a RPC falhar, remove o objeto recém-enviado. Retry com mesmo caminho
é idempotente. Retry com caminho novo é rejeitado pela unicidade da resposta e o
cliente compensa removendo esse objeto. Assim, uma falha de cleanup pode deixar
somente um objeto órfão identificável, nunca um vínculo de banco parcial ou
silenciosamente duplicado.

A policy de Storage permite essa compensação somente para o uploader autenticado
e somente enquanto o caminho não estiver vinculado a `attachments` nem a
`action_plans`; um objeto de evidência já vinculado continua sem DELETE para o
cliente.

## Provas locais

`checkflow_start_action_atomicity.sql`, em transação com rollback, comprovou:

- criação e validação do plano sincronizam a não conformidade;
- plano duplicado recebe `unique_violation`;
- retry de foto com mesmo caminho retorna a mesma attachment;
- retry com caminho novo é rejeitado e não cria segunda attachment;
- trigger de falha injetada em `attachments` aborta também a criação da resposta.
- executor remove objeto não vinculado, mas não consegue remover objeto já
  vinculado; o teste usa o guard transacional da API de Storage apenas para
  alcançar o DELETE e exercitar RLS.

O handler inicial esperava apenas `raise_exception`, embora a constraint correta
retornasse `unique_violation`: foi um **TEST BUG** corrigido. Uma ambiguidade de
variável na RPC também foi encontrada localmente e corrigida antes da prova.

## Risco residual

Os índices únicos podem falhar na aplicação se existirem duplicatas históricas;
o preflight remoto deve contá-las. A compensação de Storage é best-effort por
limitação entre serviços e exige observabilidade operacional para falha de
remoção.
