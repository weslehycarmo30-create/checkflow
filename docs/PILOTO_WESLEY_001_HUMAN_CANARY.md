# CheckFlow — human canary Wesley 001

Tempo alvo: 15–20 minutos. Use um celular, uma conta owner/manager e uma conta collaborator. Registre `PASS` ou `FAIL` e uma evidência (captura, horário, rota e IDs) em cada linha; pare e preserve capturas de tela se um resultado divergir. Não use dados pessoais reais nem apague evidências durante a investigação.

| # | AÇÃO | RESULTADO ESPERADO | PASS/FAIL | EVIDÊNCIA |
| --- | --- | --- | --- |
| 1 | Entre como owner e confirme o e-mail se o provedor solicitar. | Painel da organização aparece; não há erro de sessão. | |
| 2 | Crie um checklist de abertura do bar, com uma seção e dois itens obrigatórios (um “Sim ou não” e uma foto). | O checklist aparece como rascunho e cada inclusão confirma salvamento. | |
| 3 | Atribua o checklist a um collaborator, com prazo. | A atribuição aparece com nome, unidade/prazo e mensagem de sucesso. | |
| 4 | Entre como collaborator no celular e abra a tarefa. | Só a tarefa atribuída aparece; o botão diz “Iniciar checklist”. | |
| 5 | Inicie a execução. | O progresso começa em `0%`; os itens não vêm respondidos. | |
| 6 | Responda um item, pause, atualize a página e retome. | A resposta continua salva e o botão muda entre Pausar/Continuar corretamente. | |
| 7 | Responda “Não” no item obrigatório e tente finalizar sem observação. | Finalização fica bloqueada; a interface explica a pendência. | |
| 8 | Registre a observação, envie uma foto JPG/PNG/WebP válida e finalize. | Evidência confirma vínculo; tela mostra “Checklist finalizado”. | |
| 9 | Entre como manager e abra Histórico. | A execução concluída, respostas, NC e evidência pertencem ao ciclo correto. | |
| 10 | Crie um plano de ação para a NC, indicando responsável e prazo. | Plano aparece atribuído e com status operacional. | |
| 11 | Atribua o mesmo checklist novamente ao collaborator e inicie o novo ciclo. | É uma nova execução, com progresso `0%` e sem respostas do ciclo anterior. | |
| 12 | Saia, entre novamente e confira histórico/plano. | Dados persistem; sessão anterior não reaparece após logout. | |

Critério de interrupção: falha de isolamento entre empresas, edição estrutural por collaborator, perda de resposta após recarregar, conclusão sem obrigatórios, ou duplicação de ciclo/NC/plano. Não contorne o problema manualmente; registre horário, usuário, rota, IDs, captura e o texto literal do erro. Antes de prosseguir, classifique o incidente no playbook do Piloto 001.
