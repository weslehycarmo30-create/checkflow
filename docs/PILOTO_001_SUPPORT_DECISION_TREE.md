# Piloto 001 — árvore de decisão de suporte

Em todos os ramos, coletar horário, organização, tela, código e IDs; nunca segredo ou conteúdo privado.

- LOGIN: sessão existe? → organização correta? → nova tentativa única → tenant errado: **STOP**.
- START: assignment visível? → usuário atribuído? → execução já existe? → atualizar uma vez → coletar `EXECUTION_START_FAILED`.
- SAVE: item ainda salva? → atualizar uma vez → resposta aparece? → coletar `ANSWER_SAVE_FAILED`; resposta confirmada perdida: **STOP**.
- UPLOAD: tipo/tamanho válido? → atualizar antes de reenviar → coletar `UPLOAD_FAILED`.
- COMPLETE: obrigatórios/salvamentos pendentes? → atualizar e confirmar → coletar `EXECUTION_COMPLETE_FAILED`; não recuperável: **STOP**.
- HISTORY: atualizar → confirmar organização → coletar `HISTORY_LOAD_FAILED`; histórico alterado: **STOP**.
- NC: observação existe? → atualizar antes de repetir → coletar `NC_CREATE_FAILED`; duplicação recorrente: **STOP**.
- ACTION PLAN: responsável/prazo preenchidos? → atualizar antes de repetir → coletar `ACTION_PLAN_SAVE_FAILED`.
