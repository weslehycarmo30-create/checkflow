# Auditoria completa do MVP — CheckFlow

Data: 23/07/2026  
Base auditada: commit `a4149e2`  
Ponto de restauração anterior às correções: commit `6bc4bd3`

## 1. Resumo objetivo

O CheckFlow possui um fluxo real e persistente de autenticação, isolamento multiempresa, criação de checklist, atribuição, execução, pausa, retomada, conclusão e histórico. O produto ainda não é um MVP comercial completo: fotografia, não conformidade, plano de ação, gestão de usuários/unidades e parte do construtor permanecem ausentes ou incompletos.

A auditoria removeu a mistura de indicadores fictícios com dados reais, protegeu ações contra clique duplo e confirmação falsa de persistência, corrigiu a verificação de tipos e preparou o endurecimento de RLS e integridade referencial.

## 2. Mapa do sistema

| Rota | Acesso | Estado | Persistência |
|---|---|---|---|
| `/auth` | Pública | Real | Supabase Auth |
| `/` | Sessão autenticada | Parcialmente real | Supabase |
| `/checklists/[id]` | Proprietário/gestor da organização pelo RLS | Real, porém construtor parcial | Supabase |
| `/executions/[assignmentId]` | Colaborador atribuído pelo RLS e filtro da rota | Real, com lacunas | Supabase + Storage ainda não usado pela tela |

### Autenticação e sessão

- Cadastro, confirmação de e-mail, login, logout, recuperação e redefinição estão implementados.
- Sessão persistente e renovação automática estão habilitadas no cliente.
- Rotas privadas redirecionam usuários sem sessão.
- O primeiro cadastro recebe `profile`, `organization` e papel `owner` pelo trigger `handle_new_user`.
- Lacuna: o bloqueio de usuário inativo ocorre pelo RLS, mas ainda não existe uma tela específica explicando “usuário desativado”.

### Página principal

- Operação, histórico, perfil e organização usam dados reais.
- Dashboard foi alterado para indicadores derivados de checklists, execuções e não conformidades reais.
- Busca agora filtra checklists reais.
- Modelos continuam demonstrativos e estão explicitamente identificados como não conectados.
- Planos de ação, equipes/unidades, relatórios e configurações não exibem mais registros fictícios; mostram homologação pendente.

### Checklist

- Criar, listar, abrir, editar nome/descrição/categoria, adicionar seção/item e atribuir são reais.
- Atribuições atuais são lidas do banco.
- A mesma atribuição ativa é atualizada em vez de duplicada.
- Lacunas: arquivar, duplicar, reordenar, selecionar todos os tipos de resposta e editar regras condicionais.

### Execução

- Iniciar, responder, salvar, pausar, retomar, concluir e recuperar após recarregar são reais.
- Conclusão exige campos obrigatórios respondidos.
- A tela passou a aguardar a confirmação do banco antes de considerar uma resposta salva.
- Cliques duplos em início/pausa/conclusão são bloqueados.
- `rating` e `single_select` agora possuem controles coerentes.
- Lacunas: fotografia, observação obrigatória em falha, “não se aplica”, criação automática de não conformidade e plano de ação.

### Uploads

- Bucket privado `checkflow-evidence` e políticas existem.
- O upload não está conectado à tela de execução; portanto, o fluxo de evidência não está homologado.

### Navegação mobile

- Menu lateral e logout possuem tratamento responsivo.
- Execução possui layout próprio para celular e ação de pausa fixa.
- Lacuna: câmera/upload não podem ser homologados porque a funcionalidade ainda não existe.

## 3. CRUD e consultas Supabase

| Entidade | Criar | Ler | Editar | Excluir |
|---|---:|---:|---:|---:|
| Auth | Sim | Sim | Senha | Não na UI |
| Checklists | Sim | Sim | Sim | Não |
| Seções | Sim | Sim | Não | Não |
| Itens | Sim | Sim | Não | Não |
| Atribuições | Sim/atualiza | Sim | Sim | Desativa duplicadas |
| Execuções | Sim | Sim | Status/conclusão | Não |
| Respostas | Upsert | Sim | Upsert | Não |
| Não conformidades | Não na UI | Contagem no dashboard | Não | Não |
| Planos de ação | Não na UI | Não na UI | Não | Não |
| Usuários/unidades | Não na UI | Parcial | Não | Não |
| Anexos | Não na UI | Não na UI | Não | Não |

## 4. Problemas classificados

### P0 — segurança ou integridade crítica (2)

1. A política genérica permitia ao gestor alterar `organization_members`, incluindo promoção indevida de papel ou remoção de proprietário.
2. Chaves estrangeiras isoladas não garantiam que checklist, atribuição, execução, item e organização pertenciam ao mesmo tenant.

Correção preparada em `202607230002_hardening_rls_mvp.sql`. O P0 somente será considerado encerrado depois de aplicar e executar novamente a matriz RLS no Supabase.

### P1 — fluxo principal (9)

1. Dashboard apresentava indicadores fictícios como se fossem reais — corrigido.
2. Módulos não conectados apresentavam registros fictícios e botões sem persistência — corrigido com estado honesto de homologação pendente.
3. Resposta podia parecer salva e permitir conclusão mesmo após falha do upsert — corrigido.
4. Ações rápidas podiam gerar submissão duplicada — corrigido nas operações críticas do checklist e execução.
5. Atualizações mostravam sucesso sem verificar retorno persistido — corrigido nas ações auditadas.
6. `rating` e `single_select` eram renderizados como texto genérico — corrigido.
7. Fotografia/evidência na execução — pendente.
8. Não conformidade e plano de ação ponta a ponta — pendente.
9. Arquivar, duplicar e reordenar checklist — pendente.

### P2 — prejudica o uso, com contorno (7)

1. Cabeçalho e organização estavam fixos — corrigido.
2. Busca operava sobre tarefas fictícias — corrigido para checklists reais.
3. Verificação de tipos falhava por tipos Cloudflare ausentes — corrigido.
4. Ausência de tentar novamente em falhas principais — corrigido nas telas críticas.
5. Falta de mensagem específica para membro inativo — pendente.
6. Histórico sem tela de detalhe — pendente.
7. Mensagens técnicas do Supabase ainda podem chegar sem tradução — pendente.

### P3 — backlog (6)

1. Concorrência visual entre dois gestores editando o mesmo checklist.
2. Recorrência automática.
3. Relatórios avançados.
4. Modo offline completo.
5. Personalização comercial.
6. Métricas e observabilidade avançadas.

## 5. Segurança e RLS

A matriz real anteriormente homologada comprovou isolamento de leitura e escrita entre:

- proprietário A e proprietário B;
- gestor A e gestor B;
- colaborador A e colaborador B;
- atribuições limitadas ao próprio colaborador;
- bucket isolado pelo primeiro segmento do caminho (`organization_id`).

Esta auditoria encontrou riscos adicionais que a matriz anterior não cobria: elevação de papel por gestor e inconsistência entre IDs de entidades relacionadas. A nova migração cria triggers de integridade, restringe associação de membros ao proprietário, separa as políticas de execução/resposta do colaborador e torna logs de auditoria append-only na aplicação.

## 6. Riscos futuros

| Risco | Tratamento atual |
|---|---|
| Internet lenta/falha temporária | Loading, erro e confirmação do banco nas ações críticas |
| Clique duplo | Bloqueio síncrono e botão desabilitado |
| Atualizar/fechar durante execução | Respostas persistidas e execução recuperada |
| Sessão expirar | Cliente renova token; guard redireciona ao perder sessão |
| Resposta não persistida | Não entra no estado confirmado e bloqueia conclusão |
| Acesso direto por URL | Filtro da atribuição + RLS |
| Relações entre organizações diferentes | Migração de hardening preparada |
| Upload grande/câmera negada | Pendente; upload ainda não implementado |
| Checklist alterado durante execução | Pendente; requer snapshot/versionamento |
| Usuário desativado durante execução | RLS bloqueia próximas operações; UX específica pendente |

## 7. Qualidade técnica

- Build de produção: aprovado.
- Lint: aprovado.
- TypeScript: aprovado após correção.
- Imports quebrados: nenhum encontrado.
- Segredos no código: nenhum encontrado.
- `console.log`: nenhum encontrado no código de aplicação.
- Mocks ativos: catálogo visual de seis modelos, claramente marcado como demonstrativo.
- Teste de renderização do Worker: aprovado.
- Teste estrutural da migração base: aprovado.

## 8. Percentuais calculados

### Percentual técnico: 65%

Critério ponderado:

| Área | Peso | Entrega validada |
|---|---:|---:|
| Autenticação e sessão | 15 | 13 |
| Multiempresa, RLS e integridade | 20 | 16 |
| Construtor de checklist | 15 | 8 |
| Atribuição | 10 | 8 |
| Execução | 20 | 13 |
| Não conformidade/plano de ação | 10 | 2 |
| Dashboard/histórico | 5 | 4 |
| Usuários/unidades | 5 | 1 |
| **Total** | **100** | **65** |

### Prontidão comercial: 52%

O cálculo comercial reduz o resultado técnico devido a três bloqueadores diretamente visíveis para o cliente piloto: ausência de evidência fotográfica, ausência do ciclo de não conformidade/plano de ação e ausência de gestão operacional de usuários/unidades. O fluxo feliz pode ser demonstrado, mas ainda não sustenta sozinho uma operação real completa.

## 9. Decisão

**Homologação parcial.**

O CheckFlow está **pronto para demonstração controlada do fluxo básico**, mas **ainda não está pronto para cliente piloto**. Para piloto, devem ser encerrados: aplicação/validação da migração de hardening, fotografia, não conformidade/plano de ação e gestão mínima de usuários/unidades.

Estimativa restante: **30 a 45 horas**, equivalentes a **10 a 15 dias úteis com 3 horas por dia**.

