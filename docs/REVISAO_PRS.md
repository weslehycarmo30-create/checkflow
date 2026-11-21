# Revisão crítica dos PRs #5 a #15

Revisão feita em 21/11/2026 como segundo revisor: leitura dos diffs, `lint`, `tsc`, build e a suíte de testes sobre o `main` limpo, e conferência no Chrome (contra um Supabase falso local) das telas de Relatórios e Duplicar. **Nada foi lido nem alterado no Supabase de produção**: o conector deste computador não tem acesso a ele.

## Situação real

- Os PRs **#5 e #7 a #13 já estão no `main`** (merge em 18/11/2026, na ordem, com commits de merge e base trocada para `main` antes de cada um). Os testes do `main` resultante: build ok e 118/118.
- **Abertos:** #14 (docs + SQL de leitura), #15 (correções desta revisão), #6 (landing, de outra sessão) e #4 (convite, **com conflito**; não faz parte desta cadeia).
- **A cadeia era linear?** Sim: cada branch (#5 → #7 → #8 → #9 → #10 → #11 → #12 → #13) continha a anterior e não havia arquivos conflitantes, então entraria por fast-forward. Entrou por merge commit porque cada base foi retargetada para `main`; o resultado de conteúdo é o mesmo.
- **#14 e #15** saem os dois de `origin/main` e mexem em arquivos diferentes: podem entrar em qualquer ordem, mas o segundo a entrar precisa de merge commit (ou rebase), não de fast-forward.

## Por PR

| PR | O que muda | Risco | Como testar em 2 minutos |
| --- | --- | --- | --- |
| #5 | Modelos **Abertura do bar** (8 itens) e **Fechamento do bar** (7), além do buffet; esconde cards "não conectado" e o menu Relatórios (na época); preflights P1 de leitura; `supabase/config.toml` (seed desligado, `[inbucket]`→`[local_smtp]`); `vite.config.ts` com `with { type: "json" }`; logo PNG na raiz. | Baixo. `[local_smtp]` exige Supabase CLI recente. O PNG de 1,1 MB na raiz não é usado por nenhum arquivo. | **Modelos** → "Usar modelo" em Abertura do bar → o checklist aparece em **Operação** com 8 itens. |
| #7 | Modelo **Operação do evento** (12 itens: 9 sim/não com NC, nota 0–10, intercorrência opcional, horário). Tipos `long_text`, `rating`, `time` nos modelos. | Baixo. A conclusão no banco trata esses tipos como "respondido se não nulo/vazio" (`else answered`); a nota 0 conta como respondida. | Criar pelo modelo, atribuir, executar no celular e concluir sem preencher o item opcional. |
| #8 | Modelo **Conferência de bebidas e insumos** (7 itens, categoria Estoque). Fecha os 5 modelos do Day 0. | Baixo. | Aparece em **Modelos**; "Usar modelo" cria 7 itens em 4 seções. |
| #9 | Só documentação: `ESTADO_ATUAL_DO_PROJETO.md` reescrito; first-event e first-shift apontam para os modelos do app. | Nenhum de código. | Ler `ESTADO_ATUAL_DO_PROJETO.md`. |
| #10 | **Relatórios** (só owner/manager): 7/30/90 dias, conclusões, conformidade média, abaixo de 80%, tabelas por checklist/executor, CSV. Lógica em `lib/operational-report.mjs`. | Baixo. Usa só as **50 execuções concluídas mais recentes** já carregadas (o texto da tela diz isso). CSV com células entre aspas e fórmulas neutralizadas. | Entrar como owner → **Relatórios** → trocar 7/30/90 dias → "Exportar CSV". Como colaborador o menu não aparece. |
| #11 | **Duplicar** na tela do checklist (owner/manager): cria "Cópia de …" como rascunho sem atribuição, com todas as regras dos itens. | Médio-baixo. Não é transacional: se a inserção de itens falhar, sobra um rascunho parcial (a tela avisa e mostra o link). Depende das colunas de `checklist_items` (bloco 3 do SQL de paridade). | Abrir um checklist atribuído → **Duplicar** → abre a cópia em rascunho, editável. |
| #12 | Acessibilidade: cada campo de resposta na execução usa `aria-labelledby` na pergunta; barra de progresso com `role="progressbar"`. | Baixo; sem mudança visual. Não foi testado com leitor de tela real. | No celular, executar um checklist; com TalkBack/VoiceOver cada campo anuncia a pergunta. |
| #13 | Publicação: `deploy/wrangler.production.jsonc`, `npm run deploy:cloudflare` (dry-run por padrão), `docs/DEPLOY_CLOUDFLARE.md`. | Médio **no dia de publicar**, nulo antes (não publica nada). Veja "Achados". | `npm run deploy:cloudflare` termina em `--dry-run: exiting now`. |
| #14 | `supabase/preflight/prod_migration_parity_read_only.sql` (só `SELECT`) e link no runbook; blocos 1–3 (migrações, objetos, colunas). | Nenhum. | Colar no SQL Editor do Supabase e ler `present`/linhas. |
| #15 | `tsc --noEmit` passa (`allowImportingTsExtensions`); o script de deploy recusa também chave `sb_secret_` na variável pública. | Baixo. | `npx tsc --noEmit` sem erro; `npm test`. |

## Achados da revisão

Corrigidos em #15:
1. `tsc --noEmit` falhava no `main` (`vite.config.ts` importa um `.ts`); o plano de release exige `tsc` verde.
2. O script de deploy só barrava `service_role` em formato JWT. Uma `sb_secret_` na variável pública iria ao Worker e seria servida por `/api/supabase-config`.

Não corrigidos (decisão ou baixo risco):
- O logo `Logo CheckFlow em Verde Neon.png` (1,1 MB) na raiz não é usado: mover para `public/` ou remover.
- `window.location.href` em navegação interna gera 9 avisos de lint (nenhum erro); migrar para o roteador quando houver tempo.
- Muitos testes novos são verificações de texto do código-fonte (regex). Protegem contra regressão acidental, mas quebram com reformatação; não substituem um E2E (bloqueado pelo healthcheck do Docker/Windows).
- Duplicar não é atômico (veja #11). Se isso incomodar, a solução é uma função SQL (RPC) que copia tudo numa transação, **o que exige migração no Supabase**.
- `workers_dev` fica no padrão: o site também responde em `*.workers.dev`. Se quiser só o domínio oficial, acrescente `"workers_dev": false` na config de produção.
- Alterações locais não commitadas (botão de sair, mensagens) não foram revisadas: não fazem parte de nenhum PR.

## Antes de publicar: Supabase remoto (`fzmzrtthmciaisygajba`)

Os PRs acima **não trazem migração nova**, mas o app depende de migrações anteriores. Rode `supabase/preflight/prod_migration_parity_read_only.sql` e confira:

| Migração | O que o app usa | Sem ela (inferido do código) |
| --- | --- | --- |
| `202609280001_organization_company_details` | dados da empresa em Configurações e no painel | a leitura das colunas novas falha; nome da organização cai no texto genérico e Configurações não salva |
| `202610020001_tenant_unit_integrity_and_privileges` e `20261017150310_prevent_unit_hard_delete` | unidades por empresa e bloqueio de exclusão | gestão de unidades sem as proteções de isolamento |
| `202609070003_record_non_conformity_atomically` | NC atômica na execução | registrar não conformidade falha |
| `202609180002_checkbox_required_true_completion` | regra de checkbox obrigatório na conclusão | conclusão aceita checkbox desmarcado |
| base + `202609030001`…`202609070004` | estrutura, estados, NC, planos | ver `docs/P1_REMOTE_MIGRATION_ROLLOUT_2026-09-07.md` |

Aplicar migrações é escrita em produção: só com autorização e na ordem de `supabase/manual-rollout/`.

## Ordem sugerida a partir de agora

1. Rodar o SQL de paridade e aplicar o que faltar no Supabase (autorização do responsável).
2. Merge de #15, depois #14 (ou o inverso).
3. Zona `checkflow.tec.br` na Cloudflare, nameservers no Registro.br, `wrangler login`, secret `SUPABASE_SERVICE_ROLE_KEY`.
4. `npm run deploy:cloudflare`, depois `npm run deploy:cloudflare -- --apply`, e as verificações de `docs/DEPLOY_CLOUDFLARE.md`.
