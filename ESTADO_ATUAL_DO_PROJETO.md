# Estado atual do projeto CheckFlow

Atualizado em 15/11/2026. A auditoria anterior (22/07/2026, quando o app ainda era um protótipo sem Supabase) continua no histórico do Git deste arquivo.

## Onde está

- Repositório: `weslehycarmo30-create/checkflow`, branch principal `main`.
- Stack: vinext (Vite + React 19, rotas no estilo Next) hospedado como Sites/Cloudflare, com Supabase (Auth, Postgres com RLS, Storage privado).
- Migrações versionadas em `supabase/migrations/` (base multiempresa até proteção contra exclusão de unidade, outubro/2026).

## O que já funciona

| Área | Rota / arquivo | Situação |
| --- | --- | --- |
| Login, cadastro e recuperação de senha | `/auth` | Supabase Auth |
| Painel, modelos e criação de checklist | `/` → `app/dashboard/page.tsx` | Dados reais por organização |
| Edição de checklist (seções e itens) e atribuição | `/checklists/:id` | Estrutura travada após atribuição ou histórico |
| Execução no celular (respostas, foto, NC) | `/executions/:assignmentId` | Conclusão revalidada no banco |
| Histórico com snapshot da execução | `/history/:executionId` | Não depende do modelo vivo |
| Planos de ação | `/action-plans` | Responsável, prazo, status e evidência |
| Equipe, convites, unidades e dados da empresa | painel → "Equipe e unidades" | Papéis owner, manager e colaborador |
| PWA instalável e tema claro/escuro | — | Ativo |

Isolamento entre empresas é garantido por RLS e gatilhos (ver `docs/P1_*` e `docs/CHECKFLOW_START_P0_GATE.md`).

## Modelos prontos para o piloto

Disponíveis em **Modelos** e criados no banco com um clique (sem configuração manual):

| Modelo | Itens | Fonte |
| --- | ---: | --- |
| Abertura do bar | 8 | `docs/pilot-templates/01_ABERTURA_DO_BAR.md` |
| Operação do evento | 12 | `docs/pilot-templates/02_OPERACAO_EVENTO_PRIMEIRO_EVENTO.md` |
| Conferência de bebidas e insumos | 7 | `docs/pilot-templates/03_CONFERENCIA_BEBIDAS_E_INSUMOS.md` |
| Fechamento do bar | 7 | `docs/pilot-templates/05_FECHAMENTO_DO_BAR.md` (sem a foto opcional) |
| Montagem e desmontagem de buffet | 21 | modelo próprio |

## O que está escondido ou fora do piloto

- Menu "Relatórios": escondido até existir um relatório real.
- Itens do `BACKLOG.md` (IA, WhatsApp, QR Code, offline completo etc.).

## Pendências conhecidas

1. **E2E no navegador**: `npm run e2e:local` percorre o fluxo do piloto (modelo, duplicar, atribuir, executar no celular com NC e foto, histórico, plano de ação e relatório) contra o Supabase local. Fica fora do `npm test` porque exige o Docker.
2. **Checagens P1 no Supabase remoto**: consultas só de leitura em `supabase/preflight/`; rodar apenas com autorização.
3. **Day 0 humano**: execução completa no celular seguindo `docs/PILOTO_001_DAY0_TECH_CHECK.md`.
4. Aviso de lint antigo: navegação interna com `window.location.href` (8 ocorrências, sem erro).

## Como verificar localmente

```bash
npm run lint
npm test   # roda o build verificado e todos os testes em tests/*.test.mjs
```

## Regras de trabalho

- Cada bloco de trabalho é um commit separado, enviado ao GitHub antes de ser chamado de concluído.
- Nada é publicado nem aplicado no Supabase remoto sem aprovação do responsável.
- Nunca commitar `.env*` ou chaves; o frontend só aceita chaves públicas do Supabase.
