# Auditoria técnica do MVP — Cliente 001

Data: 29/07/2026  
Base auditada: `eee7c64` — `Merge pull request #2 from weslehycarmo30-create/codex/tema-escuro`  
Branch de auditoria: `codex/auditoria-mvp-cliente001`

## Resumo executivo

O fluxo operacional previsto — autenticar, criar checklist, atribuir, executar pelo celular, registrar evidência e não conformidade, tratar plano de ação, consultar histórico e dashboard, e sair — está implementado no código e protegido por RLS/migrações versionadas. Os testes estruturais relevantes passaram (17/17) e o TypeScript foi aprovado.

Entretanto, a implantação autônoma do Cliente 001 está bloqueada: o cadastro cria uma **nova** organização e não existe na interface fluxo de convite, inclusão ou gestão de membros. Assim, um gestor não consegue criar o executor na própria organização para então atribuir-lhe um checklist. Há também uma condição obrigatória de ambiente: as migrações de hardening e de plano de ação precisam estar aplicadas no Supabase de produção; o repositório não comprova esse estado remoto.

**Decisão de implantação: NÃO.** O sistema pode ser homologado em fluxo controlado se os usuários já forem provisionados manualmente na organização e o Supabase estiver migrado, mas isso não atende uma implantação operacional autônoma do Cliente 001 hoje.

## Escopo e evidências da auditoria

- Nenhuma funcionalidade, regra de negócio, arquitetura, dependência ou banco foi alterado.
- Validação estática: leitura de rotas, componentes, cliente Supabase e três migrações do MVP.
- `npx tsc --noEmit`: aprovado.
- `node --test tests/*.test.mjs`: 17 aprovados, 0 falhas.
- `npm run build` e `npm run lint`: não executáveis nesta estação, pois os scripts requerem `bash`/WSL e não há distribuição WSL instalada. Isso não é falha funcional comprovada do produto, mas deixa a validação local de artefato e lint pendente.
- Não foi possível comprovar, somente pelo código, a aplicação das migrações nem a configuração de variáveis no Supabase remoto do Cliente 001.

## Fluxos auditados

| Etapa | Resultado | Evidência técnica | Risco/impacto para Cliente 001 | Prioridade |
|---|---|---|---|---|
| 1. Login | Funciona | `/auth` usa `signInWithPassword`; guardas privados consultam sessão e reagem a `SIGNED_OUT`. Recuperação e redefinição também existem. | Depende de URL/chave pública do Supabase configuradas no ambiente. | P1 |
| 2. Criação de checklist | Funciona | Gestor/proprietário cria `checklists`; a página de detalhe persiste seções e itens. | Construtor não oferece reordenação, edição ou exclusão de itens depois da criação. Não bloqueia o primeiro uso. | P2 |
| 3. Atribuição | Funciona parcialmente | A atribuição persiste colaborador, unidade e prazo, atualizando a atribuição ativa para não duplicar. Trigger valida membro ativo no mesmo tenant. | Não existe interface para incluir/convidar um colaborador na organização. Cadastro comum cria outra organização; sem provisionamento manual não há a quem atribuir. | **P0** |
| 4. Execução mobile | Funciona | Rota só carrega atribuição ativa do executor; inicia, salva respostas, pausa, retoma e finaliza. Ações críticas têm bloqueio contra clique duplo e finalização exige itens obrigatórios. O campo de foto usa `capture=environment`. | Não houve teste manual em dispositivo/browser mobile nesta auditoria; comportamento de câmera e conectividade deve ser homologado em aparelho do Cliente 001. | P1 |
| 5. Evidências | Funciona | Upload de JPG/PNG/WebP até 10 MB ao bucket privado `checkflow-evidence`; caminho inclui organização, execução e item; metadado é gravado em `attachments`; URLs são assinadas. | Só funciona se bucket e políticas das migrações estiverem aplicados. Falha de rede não tem fila/offline. | P1 |
| 6. Não conformidade | Funciona | Para item não conforme, exige observação quando configurado, persiste resposta e ocorrência vinculadas; o trigger valida execução/resposta/item/tenant. | A abertura depende de o item ter sido configurado como `yes_no`, comportamento atual do construtor. | P2 |
| 7. Plano de ação | Funciona | Gestão cria plano com responsável e prazo; responsável envia foto de correção; gestão aprova/reprova. Trigger restringe o que o colaborador pode alterar. | Depende da migração `202607230003_action_plan_minimal_rls.sql` aplicada. Não há notificação automática, deliberadamente fora deste MVP. | P1 |
| 8. Histórico | Funciona | Lista execuções concluídas e abre detalhe com respostas, ocorrências e evidências via URL assinada. | Consultas dependem de RLS de gestor/proprietário no Supabase. | P1 |
| 9. Dashboard | Funciona | KPIs são derivados de checklists, execuções concluídas/em curso e não conformidades abertas; não há dados operacionais fictícios ativos. | Os indicadores são carregados no cliente e sem atualização em tempo real; recarregamento atualiza a visão. | P2 |
| 10. Logout | Funciona | Botão chama `auth.signOut`; em sucesso redireciona a `/auth`; o guarda também reage ao evento de saída. | Em erro, mostra alerta e preserva a sessão, comportamento seguro. | P2 |

## Bugs encontrados

### P0 — impede implantação

1. **Onboarding de executor inexistente na interface.** `handle_new_user` cria uma organização e um membro `owner` para cada novo cadastro. Não há convite, associação a organização existente ou gestão de membros/unidades na UI; a área “Equipe e unidades” permanece em homologação pendente. Consequência: o Cliente 001 não consegue, sozinho, cadastrar o colaborador executor no mesmo tenant para realizar a atribuição.

2. **Estado de produção das migrações não comprovado.** As políticas de isolamento e os gatilhos necessários para o ciclo completo estão no repositório, em especial `202607230002_hardening_rls_mvp.sql` e `202607230003_action_plan_minimal_rls.sql`. Sem confirmação de aplicação no Supabase do Cliente 001, não é possível liberar o uso: podem falhar atribuição, upload, não conformidade, plano de ação ou as garantias de isolamento.

### P1 — prejudica a experiência

3. **Validação local de build/lint pendente.** Os scripts usam Bash/WSL e a estação auditada não possui distribuição WSL. TypeScript e testes passaram, mas o artefato não foi reconstruído neste ambiente. Impacto: reduzir a confiança antes de publicar uma nova versão.

4. **Sem garantia offline/retry para evidência.** Respostas aguardam persistência e mostram erro, mas fotos não entram em fila para reenvio automático. Em área de sinal instável o operador precisará reenviar manualmente.

5. **Homologação em aparelho físico pendente.** O código solicita câmera traseira e é responsivo, mas não houve execução E2E em celular com a configuração real do Cliente 001.

## Riscos

| Risco | Classificação | Mitigação/critério |
|---|---|---|
| Variáveis públicas do Supabase ausentes ou incorretas | P0 | Validar `/api/supabase-config`, login e sessão no ambiente de produção. |
| Migrações/RLS não aplicadas no projeto Supabase do Cliente 001 | P0 | Conferir histórico de migrações e executar matriz real com owner, colaborador e organização externa. |
| Ausência de membro colaborador no tenant | P0 | Provisionar manualmente com procedimento controlado antes do piloto, ou entregar posteriormente a gestão de membros. |
| Foto não enviada em conectividade instável | P1 | Homologar cobertura e orientar reenvio antes de finalizar. |
| Build/lint não revalidados nesta máquina | P1 | Executar pipeline em Linux/CI antes de deploy. |
| Edição operacional limitada do checklist | P2 | Criar checklist corretamente antes da atribuição; evolução posterior sem bloquear o piloto. |

## Melhorias futuras

Itens fora desta missão e não implementados:

1. P0: gestão/invite de membros e unidades para o tenant existente.
2. P1: execução E2E automatizada contra ambiente Supabase de homologação e teste manual de câmera mobile.
3. P1: fila/retry de evidências para conectividade intermitente.
4. P2: editar, excluir e reordenar seções/itens; duplicar/arquivar checklist.
5. P2: atualização automática do dashboard e melhorias de observabilidade.

## Lista priorizada para aceite de implantação

1. **P0** — Confirmar que `202607220001`, `202607230002` e `202607230003` foram aplicadas no Supabase do Cliente 001 e executar matriz de RLS.
2. **P0** — Criar owner e pelo menos um colaborador na **mesma** organização do Cliente 001 por processo controlado, pois a UI não oferece esse onboarding.
3. **P0** — Validar no ambiente publicado: login do owner, criação de checklist, atribuição ao colaborador, login do colaborador, execução e logout.
4. **P1** — Homologar em celular físico: câmera, upload, pausa/retomada, perda e retorno de conexão.
5. **P1** — Executar build e lint em Linux/CI antes de qualquer publicação.

## Critérios de aceite

Para considerar o Cliente 001 apto ao piloto controlado, todos os critérios abaixo precisam ser comprovados no ambiente remoto:

- Owner e colaborador ativos pertencem à mesma organização; o colaborador não enxerga dados de outra organização.
- Owner cria checklist com ao menos uma seção, item obrigatório `yes_no` e item de foto.
- Owner atribui o checklist ao colaborador com prazo.
- Colaborador inicia, responde, registra uma não conformidade com observação, envia foto e conclui.
- Owner visualiza o histórico, a evidência e a não conformidade; cria plano de ação.
- Colaborador responsável envia a foto de correção; owner aprova ou reprova e os dois status são persistidos.
- Dashboard mostra números decorrentes desses registros, sem dados simulados.
- Logout invalida a sessão e rota privada retorna a `/auth`.
- Build, lint, TypeScript e testes passam em ambiente Linux/CI.

## Resposta final

**O Cliente 001 conseguiria utilizar o sistema hoje? — NÃO.**

Tecnicamente, os fluxos principais existem e podem funcionar sob provisionamento manual, porém a própria interface não permite formar a equipe dentro da organização do Cliente 001, etapa necessária para atribuição e execução. Além disso, a aplicação efetiva das migrações e RLS no Supabase remoto não é demonstrável pelo repositório. Esses dois itens são P0 de implantação.
