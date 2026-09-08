# Piloto 001 — mapa de fluxos críticos

| Fluxo | Entrada / estado | Chamadas e sucesso | Falha, retry e feedback | Cobertura |
| --- | --- | --- | --- | --- |
| AUTH | `/auth`; login/signup/reset, `busy`. | `auth.signInWithPassword`, `signUp`, reset/update; redireciona somente após sessão. | `catch/finally`; mensagem e CTA reabilitado. Reenvio manual. | Node estrutural; canary. |
| CHECKLIST | Home/modal e detalhe draft. | insert/load de checklist, seções e itens; estado local confirmado por resposta DB. | Erro persistente, retry de tela. Estrutura só draft sem assignment/execution. | Node partial; SQL. |
| ASSIGNMENT | Detalhe manager; `busy`/lock. | busca cycles ativos, update reutilizável ou insert; `load()` após sucesso. | Erro visível; reenvio manual. Completed nunca reutiliza assignment. | estado executado + SQL/concurrency. |
| EXECUTION | `/executions/:assignmentId`; assignment-scoped. | busca assignment/checklist/execution; insert inicia ciclo. | bloqueio de lock/double-click; tela mostra erro e permite retry/reload. | estado executado + SQL/adversarial. |
| ANSWERS / PROGRESS | execution in_progress; `savingItems`. | upsert por `execution_id,item_id`; progresso derivado. | não atualiza answer local sem resposta DB; erro e novo toque. | estado executado. |
| COMPLETION | respostas obrigatórias e NC persistidas. | update `completed`; banco revalida snapshot/required. | sem mensagem de sucesso se erro; completed é terminal. | estado executado + SQL/adversarial/concurrency. |
| REASSIGNMENT | manager após completed. | nova assignment, nova execution vazia. | consulta/cycle falho não confirma UI. | estado executado + SQL/concurrency. |
| HISTORY | home/history detail; completed snapshot. | query completed e detalhes por execution ID. | erros de carregamento têm retry; não consulta modelo vivo para histórico. | Node/SQL/adversarial. |
| NON-CONFORMITY | item “Não”, observação obrigatória. | RPC atômica `record_checkflow_non_conformity`. | answer local só muda após RPC; erro explícito/retry. | estado executado + SQL/concurrency. |
| ACTION PLAN | action plans, owner/manager/responsável. | insert/update + refresh; status/evidência persistidos. | `finally` libera CTA; após persistência + refresh falho, pede atualização antes de retry. | UI failure contract + SQL/concurrency. |
| ATTACHMENT | foto in_progress ou correção atribuída. | Storage upload, depois RPC/update metadata. | upload/RPC falho não mostra sucesso; vínculo ambíguo preserva arquivo e pede refresh. | Node/SQL/adversarial; browser blocked. |
| TENANT ISOLATION | toda rota privada. | queries filtram contexto; RLS/triggers são autoridade. | acesso vazio/erro não revela dados; pare piloto em qualquer cruzamento. | SQL/adversarial/concurrency/canary. |

Não há cache client-side externo nem optimistic update para mutações operacionais. `load()` e estados derivados são a fonte de refresh; o risco residual é falha de rede durante reload, tratado como “atualize antes de repetir” nos planos de ação.
