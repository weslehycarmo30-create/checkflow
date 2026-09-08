# Piloto 001 — playbook de incidentes

Regra comum: anote horário com fuso, rota, papel do usuário, IDs de organização/checklist/assignment/execution, mensagem literal, request id se exposto e captura. Não alterar, excluir, reatribuir ou reenviar dados para “testar de novo” antes de preservar a evidência.

| Categoria | Sintoma | Check imediato | Dados que não devem ser alterados | Evidência | Quando parar o piloto |
| --- | --- | --- | --- | --- | --- |
| AUTH | Login falha, redireciona em loop ou sessão expira. | Rota `/auth`, hora do dispositivo e papel. | Sessão, usuário e memberships. | Captura, rota, horário, erro. | Usuário vê conta/sessão errada ou não recupera acesso. |
| ASSIGNMENT | UI confirma mas tarefa não aparece ou duplica. | Recarregar uma vez e comparar ID. | Assignments e prazo. | IDs, papel, captura antes/depois. | Atribuição duplicada ou de outra organização. |
| EXECUTION | Início/pausa/conclusão não persiste. | Recarregar e abrir histórico. | Execution, respostas e snapshot. | ID, status antes/depois, erro. | Conclusão indevida ou execução cruza usuário. |
| SAVE | Resposta aparenta salvar e some. | Recarregar; verificar mensagem de erro. | Answers existentes. | Item, valor, horário, captura. | Perda de resposta confirmada. |
| UPLOAD | Foto falha, fica pendente ou sem vínculo. | Não reenviar; recarregar histórico. | Arquivo, attachment e caminho. | Nome/tamanho/tipo, erro, ID. | Foto de outra execução ou falso sucesso. |
| NC | NC duplica, some ou aponta item errado. | Recarregar e conferir uma ocorrência. | NC, observação e answer. | IDs, item, mensagem. | NC em tenant/ciclo errado ou duplicado. |
| ACTION_PLAN | Plano não acompanha NC ou atualiza parcialmente. | Recarregar NC e plano. | Plano, responsável e prazo. | IDs e valores antes/depois. | Plano/NC divergente ou duplicado. |
| HISTORY | Histórico perde dados ou mistura ciclos. | Comparar IDs de execução e snapshot. | Histórico, snapshots e evidências. | IDs, telas e horário. | Ciclo anterior muta ou dados somem. |
| TENANT_ISOLATION | Qualquer dado de outra empresa aparece/edita. | Pare; capture rota e IDs, sem navegar mais. | Tudo relacionado aos dois tenants. | Captura completa, papel, rota, IDs. | Sempre: incidente P0. |
