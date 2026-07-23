# Plano de 10 dias para o MVP

Premissa: 3 horas por dia. Objetivo: chegar ao primeiro cliente piloto, não à perfeição.

| Dia | Tarefa | Resultado esperado | Teste | Critério de conclusão |
|---:|---|---|---|---|
| 1 | Aplicar hardening de RLS e integridade | Gestor não altera papéis; vínculos cruzados são rejeitados | Matriz owner/manager/collaborator nas organizações A e B | Todos os testes de leitura/escrita e tentativas de elevação passam |
| 2 | Upload fotográfico na execução | Foto enviada ao bucket privado e vinculada à resposta | JPEG/PNG/WebP, câmera negada, arquivo >10 MB, outra organização | Upload válido persiste e acesso cruzado é bloqueado |
| 3 | Regra de resposta não conforme | “Não” exige observação e foto quando configurado | Resposta conforme, não conforme, ausência de evidência | Não é possível avançar sem os requisitos do item |
| 4 | Geração de não conformidade | Ocorrência criada uma única vez e ligada à resposta | Responder, recarregar, editar e reenviar | Sem duplicidade; item, executor, unidade e horário corretos |
| 5 | Plano de ação mínimo | Gestor define responsável, prazo e status | Criar, comentar, enviar evidência, aprovar/reprovar | Histórico e transições válidas persistem |
| 6 | Gestão mínima de usuários e unidades | Proprietário ativa/desativa membros e mantém unidades | Desativar colaborador com sessão aberta | Próxima consulta/escrita é bloqueada e mensagem é clara |
| 7 | Completar construtor essencial | Tipos de resposta, regras, arquivar e duplicar | Criar checklist misto, duplicar, arquivar | Cópia íntegra; arquivado some da operação e não perde histórico |
| 8 | Congelar checklist durante execução | Execuções não mudam quando modelo é editado | Iniciar, editar modelo em outra sessão, retomar | Execução preserva itens originalmente atribuídos |
| 9 | Homologação mobile e falhas | Fluxo estável em 360, 390, 412, tablet e desktop | Internet lenta, recarga, sessão expirada, clique duplo | Nenhuma perda silenciosa; mensagens e recuperação disponíveis |
| 10 | Ensaio comercial e piloto | Demonstração de 5 minutos e checklist final de produção | Fluxo completo com Buffet Sabor & Festa | Zero P0/P1 aberto no fluxo do piloto; relatório assinado |

## Ordem de corte se o prazo apertar

1. Segurança e integridade.
2. Fotografia.
3. Não conformidade e plano de ação.
4. Usuários/unidades.
5. Construtor essencial.
6. Melhorias de histórico e mensagens.

Relatórios avançados, recorrência automática, IA, pagamentos e personalização permanecem fora destes dez dias.
