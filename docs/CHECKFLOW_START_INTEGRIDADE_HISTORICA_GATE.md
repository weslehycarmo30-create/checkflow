# CHECKFLOW START — Gate de Integridade Histórica

Data: 2026-08-26
Branch: `codex/checkflow-start-integridade-historica`
Base autorizada: `36552c2c7b9cfe14849e0cf6dae14a39832c3371`

## Auditoria antes da implementação

O schema atual separa o modelo operacional (`checklists`, `checklist_sections`, `checklist_items`) das ocorrências de execução (`checklist_executions`, `execution_answers`, `attachments`, `non_conformities`, `action_plans`). A execução guarda IDs, horários, status, percentual e um `summary` de contagem, mas não guarda o conteúdo do checklist.

A tela `app/history/[executionId]/execution-history-detail.tsx` consulta seções e itens pelo `checklist_id` da execução. Portanto, renomear o checklist, alterar texto/ordem de itens ou seções, ou incluir/remover item mudaria retroativamente a visualização histórica. Respostas, observações, anexos, não conformidades e planos já estão ligados à execução, porém a identificação visual de cada item ainda depende do modelo atual.

As chaves estrangeiras atuais impedem excluir um checklist que possua execução referenciada; isso é uma proteção incidental, não um snapshot. Arquivamento e edição continuam possíveis e já são suficientes para corromper a fidelidade do histórico.

## Alternativas avaliadas

1. **Snapshot no fim da execução** — rejeitada: uma alteração no checklist durante uma execução pausada alteraria o que o executor deveria ver e o que seria registrado.
2. **Tabelas normalizadas de versão e editor de versões** — rejeitada: segura, mas excede o CheckFlow Start ao introduzir versionamento, gestão e potencial restauração/comparação.
3. **Snapshot JSONB imutável na própria execução, capturado pelo banco no início** — selecionada: é a menor estrutura que preserva checklist, seções, itens, ordem, configuração, responsável, executor, unidade e atribuição sem aceitar conteúdo do navegador.

## Arquitetura selecionada

A migration adiciona `execution_snapshot` a `checklist_executions` e um trigger `BEFORE INSERT` que constrói o snapshot a partir do tenant, checklist, atribuição e perfis existentes. O valor enviado por cliente é sempre substituído. Um trigger de imutabilidade impede alterar ou excluir uma execução concluída e impede alterar respostas/anexos depois da conclusão. Não conformidades concluídas mantêm identidade e conteúdo; somente status, responsável e prazo permanecem atualizáveis para o fluxo de ação corretiva. Planos de ação permanecem evolutivos em status/evidência, mas não podem ser apagados nem ter seus termos estruturais alterados após a execução concluída.

O histórico deixará de consultar o modelo atual para montar seções/itens. Ele usará o snapshot, juntando somente os registros próprios da execução: respostas, observações, anexos, não conformidades e ações corretivas. Registros antigos sem snapshot serão declarados como legados indisponíveis, em vez de exibir uma reconstrução potencialmente falsa.

## Implementação concluída

- Migration criada: `202608260002_execution_historical_snapshot.sql`.
- `checklist_executions.execution_snapshot` guarda, no `BEFORE INSERT` e a partir de dados confiáveis do banco, o checklist, seções, itens, ordem, regras de item, atribuição, executor, unidade e responsáveis disponíveis naquele momento.
- O snapshot fornecido por cliente é descartado e o campo não pode ser alterado depois.
- Após conclusão, execução, respostas e anexos não podem ser reescritos ou apagados. Não conformidades preservam identidade/conteúdo; ações corretivas preservam descrição, responsável e prazo, permitindo apenas o avanço operacional de status/evidência/validação.
- A tela de detalhe e a listagem de histórico não consultam mais `checklists`, `checklist_sections` ou `checklist_items` para reconstruir a execução. Elas usam o snapshot e consultam somente respostas, anexos, não conformidades e planos vinculados à execução.
- Um registro pré-existente sem snapshot é explicitamente identificado como legado sem integridade comprovável; ele não recebe uma reconstrução enganosa a partir do checklist atual.

## Ambiente e migrations locais

Ambiente validado: Supabase CLI `2.95.4`, Docker `29.6.2`, stack temporária isolada em `http://127.0.0.1:54321` e PostgreSQL em `127.0.0.1:54322`. Não houve `supabase link`, `db push`, deploy ou contato com Supabase remoto.

As migrations abaixo foram aplicadas manualmente, nessa ordem, em banco local limpo e sem erro:

1. `202607220001_base_multitenant.sql`
2. `202607230002_hardening_rls_mvp.sql`
3. `202607230003_action_plan_minimal_rls.sql`
4. `202608260001_checkflow_start_p0_provisioning_storage.sql`
5. `202608260002_execution_historical_snapshot.sql`

## Testes comportamentais

O teste transacional `supabase/tests/checkflow_start_historical_integrity.sql` cria dois tenants e sete usuários: owner, manager, executor, colaborador não relacionado, colaborador inativo, usuário removido e owner do Tenant B. Todos os fixtures são encerrados com `ROLLBACK`.

Ele comprovou em RLS e dados reais:

1. criação do checklist original com duas seções e três itens;
2. atribuição e início pelo executor, com captura do snapshot pelo banco;
3. respostas OK e NÃO OK, observação, objeto privado no bucket e vínculo de anexo;
4. não conformidade, conclusão e plano de ação com responsável/prazo;
5. renomeação, edição, reordenação, arquivamento, adição e remoção de itens no modelo original;
6. permanência, no snapshot, do nome, ordem, conteúdo e item removido originalmente executados;
7. preservação de resposta, observação, anexo, não conformidade e plano de ação;
8. rejeição de alteração retroativa de resposta, anexo e do próprio snapshot, inclusive por manager;
9. leitura permitida para owner do Tenant A; bloqueio de colaborador não relacionado do mesmo tenant, Tenant B, usuário inativo e usuário removido;
10. rejeição de relação de execução cross-tenant.

Também foi executado `supabase/tests/checkflow_start_p0_behavior.sql` na mesma stack, sem regressão de provisionamento, roles e storage privado do P0. Os dois scripts concluíram com sucesso e `ROLLBACK`.

Validação do projeto:

- `node --test tests/*.test.mjs`: 21 testes aprovados;
- `npx tsc --noEmit`: aprovado;
- build e ESLint: executados antes do commit;
- `git diff --check`: sem erro.

## Critérios de aceite

| Critério | Resultado | Evidência |
| --- | --- | --- |
| Histórico não depende do checklist atual | Aprovado | Snapshot no banco; telas não consultam o modelo vivo. |
| Renomear/editar/reordenar/adicionar/remover não reescreve execução | Aprovado | Script transacional altera o modelo e valida snapshot original. |
| Respostas, observações e evidências permanecem vinculadas | Aprovado | `execution_answers`/`attachments` por `execution_id`, com imutabilidade após conclusão. |
| Não conformidades e ações corretivas permanecem preservadas | Aprovado | Relações por execução/ocorrência; termos estruturais do plano bloqueados após conclusão. |
| Tenant B e usuário do mesmo tenant sem relação são bloqueados | Aprovado | Asserções RLS sob papéis autenticados distintos. |
| Usuário inativo/removido é bloqueado | Aprovado | Asserções RLS após membership inativa e removida. |
| Stack limpa aceita todas as migrations | Aprovado | Aplicação local manual das cinco migrations sem erro. |

## Limitações e riscos restantes

- Execuções anteriores a esta migration não possuem snapshot e permanecem marcadas como legado. Não houve backfill inferencial, pois ele poderia registrar como histórico um checklist já alterado.
- A exclusão do checklist de origem continua impedida enquanto houver execução por chave estrangeira. Arquivamento e edição são suportados pelo snapshot; nenhuma mudança foi feita para liberar exclusão.
- O nome exibido do responsável de um plano é obtido do perfil atual, mas o identificador do responsável, descrição e prazo do plano são preservados e imutáveis após a conclusão. Histórico de renomeação de perfis não faz parte do Start.
- Os wrappers Bash de `npm test`, `npm run build` e `npm run lint` continuam sujeitos ao `E_ACCESSDENIED` conhecido no Windows/WSL. A validação foi feita pelas ferramentas equivalentes diretas; tornar os wrappers cross-platform é P1 fora deste gate.
