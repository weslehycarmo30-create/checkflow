# Piloto 001 — console de suporte (Wesley)

Use este guia para registrar e orientar; não altere dados, permissões, banco, Storage ou configuração durante o turno. Colete apenas IDs técnicos, horário, tela, código de erro e print sem dados pessoais, respostas privadas ou fotos.

| Sintoma | Possível causa / o que conferir | Evidência a coletar | O que não alterar | Parar ou continuar |
| --- | --- | --- | --- | --- |
| Login não entra | conexão; e-mail/senha digitados; mensagem e horário | papel informado, organização esperada, print, `AUTH_SESSION_EXPIRED` se houver | senha, token, conta de outro usuário | Continue após nova tentativa; pare se abrir outra organização |
| Atribuição não aparece | refresh falhou ou atribuição não persistiu | checklist/assignment ID, executor, horário, `ASSIGNMENT_CREATE_FAILED` | duplicar atribuição ou editar histórico | Atualize uma vez; pare se duplicar recorrente |
| Execução não inicia | conexão, sessão ou conflito de ciclo | assignment ID, `EXECUTION_START_FAILED`, print | criar execução manualmente | Atualize antes de repetir; pare se não for recuperável |
| Resposta não salva | queda/timeout; não há confirmação | execution/item ID, `ANSWER_SAVE_FAILED`, horário | concluir, trocar usuário ou assumir que salvou | Tente de novo só se a resposta não aparecer após atualizar; pare se uma resposta confirmada sumir |
| Foto não envia/vincula | conexão, tipo/tamanho ou confirmação do vínculo | execution/item ID, `UPLOAD_FAILED`, tipo/tamanho (não o arquivo) | apagar objeto, reenviar antes de atualizar | Atualize antes de repetir vínculo; continue se upload falhar sem confirmação |
| Conclusão falha | obrigatório pendente, conflito ou conexão | execution ID, itens pendentes, `EXECUTION_COMPLETE_FAILED` | marcar concluído fora da interface | Continue após confirmar estado; pare se execução não recuperar |
| Histórico não carrega | sessão, permissão ou refresh | execution ID, `HISTORY_LOAD_FAILED`, print | editar histórico ou snapshot | Continue com refresh; pare se histórico concluído mudou |
| NC não registra | observação ausente, conexão ou conflito | execution/item ID, `NC_CREATE_FAILED` | criar NC duplicada | Atualize e confirme antes de repetir; pare se duplicar |
| Plano não salva | responsável/prazo ou conexão | NC/plan ID, `ACTION_PLAN_SAVE_FAILED` | criar segundo plano | Atualize antes de repetir; pare se estado corromper |
| Dados de outra empresa | isolamento/conta errada | organização esperada/real, IDs e print | navegar, corrigir ou apagar dados | **Pare imediatamente** e preserve evidência |

Em qualquer erro, peça ao usuário para anotar a ação única que acabou de executar e não prometer que foi salva sem confirmação visual após recarregar.
