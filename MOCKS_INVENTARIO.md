# Inventário de dados simulados do CheckFlow

Data da revisão: 22/07/2026

Este documento registra os mocks que permanecem ativos durante a reconstrução controlada. Nenhum deles foi apresentado como integração real.

| Área | Origem atual | Comportamento simulado | Destino previsto | Condição para substituição |
|---|---|---|---|---|
| Prioridades do dia | `tasks` em `app/page.tsx` | Quatro tarefas fixas; conclusão apenas em estado React | `checklist_assignments` e `checklist_executions` | Tabelas, RLS e leitura autenticada validadas |
| Modelos | `templates` em `app/page.tsx` | Seis cartões fixos | `checklists`, `checklist_sections`, `checklist_items` | Migração e biblioteca inicial aplicadas |
| Indicadores | `kpis` dentro de `Dashboard` | Totais e percentuais fixos | Consultas agregadas por organização | Execuções e não conformidades reais disponíveis |
| Progresso semanal | Array de barras em `Dashboard` | Percentuais fixos por dia | `checklist_executions` | Histórico real suficiente para agregação |
| Execuções em andamento | Array dentro de `Dashboard` | Três execuções fixas | `checklist_executions` e `execution_answers` | Fluxo de execução e autosave validados |
| Operação | `content` dentro de `Generic` | Linhas estáticas | `checklist_assignments` | Atribuição e permissões validadas |
| Planos de ação | `content` dentro de `Generic` | Linhas estáticas | `non_conformities` e `action_plans` | Workflow e RLS validados |
| Histórico | `content` dentro de `Generic` | Linhas estáticas | `checklist_executions` | Conclusão real disponível |
| Equipe e unidades | `content` dentro de `Generic` | Linhas estáticas | `profiles`, `organization_members`, `teams`, `units` | Autenticação e multiempresa validadas |
| Relatórios | `content` dentro de `Generic` | Linhas estáticas | Agregações das tabelas operacionais | Base operacional real disponível |
| Configurações | `content` dentro de `Generic` | Linhas estáticas | `organizations` e perfis | Gestão da organização validada |
| Criação de checklist | `CreateModal` | Fecha modal e mostra toast; não persiste | `checklists` e tabelas filhas | Construtor real e autorização de gestor validados |

## Integração criada neste bloco

- Cliente público Supabase centralizado em `lib/supabase.ts`.
- Leitura de `NEXT_PUBLIC_SUPABASE_URL` e da chave pública publishable, com fallback para anon.
- Sessão persistente, renovação automática e detecção de retorno de autenticação habilitadas no cliente.
- Aviso amigável quando a configuração estiver ausente ou a inicialização da sessão falhar.
- Nenhuma `service_role` é lida ou exposta pelo frontend.

## Limite da validação

A presença das variáveis no ambiente hospedado foi confirmada sem revelar seus valores. Este bloco valida compilação e inicialização do cliente. Tabelas, buckets, autenticação de usuário e RLS só poderão ser declarados funcionais depois que as migrações correspondentes existirem e forem aplicadas.
