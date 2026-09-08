# CheckFlow — checklist de lançamento do Piloto Wesley 001

## Antes do piloto

- [ ] Aplicar as migrations remotas exclusivamente por Supabase CLI `db push`, preservando o migration history.
- [ ] Executar preflight/postflight remoto e confirmar exatamente as oito migrations P1 esperadas.
- [ ] Executar o human canary em celular e registrar todos os resultados.
- [ ] Confirmar URL pública, configuração pública do Supabase e fluxo de confirmação/recuperação de e-mail.
- [ ] Preparar duas contas reais: gestor e colaborador; não compartilhar senhas.
- [ ] Definir um checklist curto de abertura/fechamento e uma unidade piloto.
- [ ] Definir responsável, canal de suporte e horário para coleta diária de feedback.

## Dia 1

- [ ] Owner cria e atribui uma rotina real.
- [ ] Collaborator executa no celular, pausa e retoma uma vez.
- [ ] Registrar uma não conformidade com observação e evidência.
- [ ] Manager cria e valida um plano de ação.
- [ ] Conferir histórico e iniciar um segundo ciclo limpo.
- [ ] Registrar falhas com horário, papel, rota, rede e captura de tela.

## Primeira semana

- [ ] Usar uma rotina real por turno/unidade piloto.
- [ ] Revisar diariamente execuções concluídas, pendências e NCs sem plano.
- [ ] Medir adesão: atribuídos, iniciados, concluídos e abandonados.
- [ ] Validar que o histórico continua separado por ciclo e organização.
- [ ] Priorizar apenas defeitos reproduzíveis; não alterar o processo operacional sem registro.

## Critério de sucesso

- A equipe consegue iniciar, pausar, responder, evidenciar e concluir sem apoio técnico recorrente.
- Respostas e histórico persistem após recarga, logout/login e novo ciclo.
- Gestor localiza NC e plano de ação no mesmo dia.
- Nenhum acesso ou dado atravessa organizações/papéis indevidos.

## Critério de stop

- Qualquer P0: vazamento entre empresas, elevação de papel, perda/corrupção de dados ou conclusão indevida.
- Qualquer falha repetível que bloqueie iniciar, salvar resposta, anexar evidência ou concluir uma rotina crítica.
- Histórico de um ciclo exibindo dados de outro ciclo.
- Migrations/postflight remoto não confirmados.
