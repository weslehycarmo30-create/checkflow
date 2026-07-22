# Estado atual do projeto CheckFlow

Data da auditoria: 22/07/2026 (America/Cuiabá)

## Identificação e ponto de restauração

- Caminho oficial: `/workspace/sites/checkflow-universal`
- Repositório remoto: repositório oficial vinculado ao projeto Sites
- Branch de trabalho: `homologacao-supabase-20260722`
- Commit de restauração anterior a qualquer alteração: `72be6a11337178a6034f749400418617f7a7d70e`
- Estado anterior: branch `main`, limpa e sincronizada com `origin/main`
- Último commit funcional anterior: `3c210bfbdd4487a412f3390ee3cc054e5f5ba9da` — 21/07/2026 23:54:17 -03:00 — “Etapa 1: verticalização para alimentação e eventos”
- Commit inicial do dashboard: `c0286be89eefc4777b69eddb20793440f7f70f0e` — “Build complete CheckFlow SaaS dashboard”

## Estrutura realmente existente

- `app/page.tsx`: dashboard/protótipo React de uma página.
- `app/globals.css`: identidade visual e responsividade.
- `app/layout.tsx`: layout e metadados.
- `app/chatgpt-auth.ts`: integração de autenticação da superfície ChatGPT/Sites, não Supabase Auth.
- `db/`, `drizzle.config.ts` e `examples/d1/`: infraestrutura D1 do starter; não alimenta as telas do CheckFlow.
- `scripts/`, `build/`, `worker/`, `vite.config.ts`: build e hospedagem Sites.
- `BACKLOG.md` e `MVP_PLAN.md`: documentação de escopo.

## Funcionalidades comprovadamente presentes

- Dashboard visual responsivo.
- Navegação lateral.
- Busca/filtros locais.
- Modal visual de criação de checklist sem persistência.
- Página visual de modelos.
- Telas genéricas de operação, planos de ação, histórico, equipe/unidades e relatórios.
- Build Sites anteriormente publicado nas versões 1 e 2.

Essas funcionalidades são de protótipo. Não existe persistência operacional real no código atual.

## Mocks ativos

O arquivo `app/page.tsx` contém arrays e valores fixos para:

- tarefas e responsáveis;
- modelos de checklist;
- indicadores do dashboard;
- execuções em andamento;
- operação;
- planos de ação;
- histórico;
- equipe e unidades;
- relatórios;
- criação de checklist simulada apenas com toast.

## Supabase realmente existente

- Variáveis de produção cadastradas e ocultas no ambiente hospedado:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` para compatibilidade
- Nenhum valor de chave foi salvo no repositório.
- Nenhuma `service_role` está presente.

Arquivos Supabase no repositório atual: **nenhum**.

Não existem atualmente:

- `lib/supabase.ts`;
- dependência `@supabase/supabase-js`;
- diretório `supabase/`;
- migrações SQL;
- cliente Supabase;
- autenticação Supabase;
- tabelas, funções, triggers ou políticas documentadas em código;
- scripts de seed ou testes de RLS;
- documentação de instalação/homologação Supabase.

## Implementações relatadas anteriormente, mas ausentes

- autenticação completa e sessão persistente;
- arquitetura multiempresa;
- construtor real de checklist;
- execução mobile com autosave e fotografia;
- biblioteca dos 18 modelos;
- não conformidades e planos de ação;
- dashboard conectado;
- políticas RLS;
- bucket privado de evidências;
- arquivos `SUPABASE_SETUP.md`, `SUPABASE_AUDIT.md` e `HOMOLOGACAO_MVP.md`.

Como não estão presentes em nenhum commit ou artefato recuperável, essas funcionalidades não são consideradas implementadas.

## Investigação de recuperação

Foram verificados, sem alterar o código:

- histórico completo do Git;
- branches locais e remotas;
- reflogs;
- stashes;
- objetos Git inalcançáveis;
- arquivos não rastreados;
- arquivos e artefatos no workspace;
- versões salvas do Sites;
- arquivos persistentes disponíveis na Biblioteca do usuário.

Resultado: somente dois commits e duas versões hospedadas foram encontrados. Ambos correspondem ao protótipo anterior. Não existe fonte recuperável da implementação Supabase relatada.

## Riscos atuais

1. Publicar agora mantém dados simulados e não ativa Supabase.
2. As variáveis estão configuradas, mas o código não as lê.
3. Não existe esquema de banco versionado para aplicar com segurança.
4. Não há autenticação, RLS ou isolamento multiempresa comprováveis.
5. Não há testes ponta a ponta.
6. O trabalho futuro pode ser perdido novamente se não for commitado e enviado ao repositório remoto por bloco.

## Regra de persistência adotada

- Cada bloco será um commit separado.
- Nenhum bloco será chamado de concluído antes do commit.
- Cada entrega informará hash e arquivos alterados.
- A branch de homologação será enviada ao repositório remoto.
- Antes de qualquer publicação haverá build, testes, revisão de diff e novo ponto de restauração.
- Nenhuma publicação automática ocorrerá nesta auditoria.

## Decisão

**Reconstruir de forma controlada.** Não há implementação Supabase recuperável. A reconstrução deve preservar a arquitetura e identidade visual atuais, substituir mocks apenas depois que cada tabela e política forem comprovadas e seguir a ordem:

1. cliente/variáveis e inventário de mocks;
2. migração base e autenticação;
3. RLS multiempresa e testes;
4. modelos/checklists;
5. execução mobile e storage;
6. não conformidades/planos de ação;
7. dados de demonstração;
8. homologação ponta a ponta;
9. publicação somente após aprovação.
