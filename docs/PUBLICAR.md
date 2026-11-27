# Colocar o piloto no ar (checkflow.tec.br)

Situação em 27/11/2026, `main` em `44c4fa5` (inclui o PR #21, de permissões). **O site ainda não está publicado** e `checkflow.tec.br` não tem DNS. Detalhes de cada comando: [DEPLOY_CLOUDFLARE.md](DEPLOY_CLOUDFLARE.md).

## O código está pronto?

Sim. Conferido na branch do PR #21, hoje igual ao `main` (dependências já instaladas reaproveitadas, Node 26):

| Checagem | Resultado |
| --- | --- |
| `tsc --noEmit` / `npm run lint` | sem erros (9 avisos antigos) |
| `npm test` (inclui build) | 137/137 |
| CI do GitHub (`validate`, Linux, Node 22), no `44c4fa5` | verde, 137/137 |
| `npm run validate:artifact` | ok |
| `npm run e2e:local` (piloto, papéis, quedas de conexão) | 27/27, sem erro da API |
| Gates SQL, adversarial (6) e concorrência (12), integridade de unidades (22) | ok, no banco local |
| `npm run deploy:cloudflare` (ensaio), no `dbe775e` | ok, 2,3 MB |
| `npm run verify:deploy` no Worker local (`wrangler dev`), no `dbe775e` | sem falhas |

`scripts/verify-tenant-unit-integrity-local.mjs` precisa da Supabase CLI **3.x** no PATH: a 2.x não entende `[local_smtp]` em `supabase/config.toml`.

Nada disso testa a produção: o banco remoto, os e-mails reais e o domínio ainda não foram conferidos.

## O que falta, em ordem (👤 = só você pode fazer)

### 1. 👤 Decidir sobre suas alterações sem commit
Em `C:\Factory Apps\checkflow` há mudanças suas que **não estão no `main`**: botão de sair (`app/logout-button.tsx`), duração das mensagens (`app/feedback.tsx`) e estilo das mensagens de erro (`app/globals.css`, `checklist-detail.tsx`, mais dois testes).

- **Por que importa:** sem elas, as mensagens de erro saem em vermelho sobre vermelho escuro, ilegíveis justamente quando a conexão cai no celular.
- Elas aplicam sobre o `main` atual sem conflito. Os testes com elas (140/140) rodaram sobre o `dbe775e`.
- Nada foi commitado por assistente. Para entrarem, peça um PR ou faça o commit você.

### 2. 👤 Banco de produção (Supabase `fzmzrtthmciaisygajba`)
Use os arquivos do `main` atual (no GitHub): sua cópia local está atrasada e não tem a migração nova nem a consulta atualizada.

1. Faça um backup antes (`docs/FREE_PLAN_MANUAL_LOGICAL_BACKUP_RUNBOOK_2026-09-08.md`). Migração não tem "desfazer" automático.
2. No SQL Editor, rode `supabase/preflight/prod_migration_parity_read_only.sql` (só leitura). `present = false` significa migração pendente.
3. Aplique o que faltar, na ordem dos nomes em `supabase/migrations/`, parando no primeiro erro. A última é `20261127220000_restrict_unguarded_writes.sql`, que vem depois de `20261017150310_prevent_unit_hard_delete.sql`.
4. Rode a consulta de novo: tudo deve aparecer como presente.

A migração `20261127220000` fecha falhas de permissão e precisa estar aplicada **antes do piloto**: o executor deixa de gravar não conformidade direto na tabela e de alterar correção já aprovada, e o dono não consegue vincular alguém ativo em outra empresa. Ela não corrige registros gravados antes.

### 3. 👤 Autenticação no Supabase
*Authentication → URL Configuration*: **Site URL** `https://checkflow.tec.br` e **Redirect URLs** `https://checkflow.tec.br/**`. Sem isso, os links de cadastro, senha e convite não voltam para o site.

### 4. 👤 Domínio
Na Cloudflare, adicione `checkflow.tec.br`. No Registro.br, troque os servidores DNS pelos dois que a Cloudflare mostrar. Espere a zona ficar **Active**.

### 5. 👤 Login e segredo
```bash
npx wrangler login
```
```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config deploy/wrangler.production.jsonc
```
Cole a chave só no terminal. Ela é usada apenas nos convites de equipe.

### 6. 👤 Publicar a partir do `main` limpo
O script publica **o que estiver na pasta**, inclusive mudanças sem commit. Sua cópia está numa branch antiga (`feat/deploy-cloudflare`) e o `main` local está atrasado. Depois de resolver o passo 1:
```bash
git switch main
```
```bash
git pull
```
```bash
git status --short
```
O `status` deve sair vazio. Confira que o `.env.local` tem a URL e a chave **pública** do Supabase. Ensaio e publicação:
```bash
npm run deploy:cloudflare
```
```bash
npm run deploy:cloudflare -- --apply
```

## Como verificar

```bash
npm run verify:deploy
```
Depois, à mão, antes do primeiro turno:
1. Convide um e-mail seu como executor, abra o link, defina a senha e entre.
2. Crie "Abertura do bar" por **Modelos**, atribua ao executor.
3. No celular: responda, registre uma não conformidade, envie uma foto, recarregue a página e conclua.
4. Confira Histórico, Planos de ação e Relatórios.
5. Preencha `docs/PILOTO_001_DAY0_TECH_CHECK.md`.

Pare o piloto nas condições de `docs/PILOTO_001_STOP_RULES.md`.

## Como desfazer

| Problema | Ação |
| --- | --- |
| Versão nova com defeito (já havia uma anterior) | `npx wrangler rollback --config deploy/wrangler.production.jsonc` |
| Primeira publicação com defeito (não há versão anterior) | Cloudflare → Workers & Pages → `checkflow-universal` → remover o domínio `checkflow.tec.br` |
| Chave secreta exposta (`verify:deploy` acusa) | Gerar chave nova no Supabase, regravar o segredo, conferir o `.env.local` e publicar de novo |
| Migração quebrou o banco | Restaurar o backup do passo 2; o rollback do Worker **não** desfaz o banco |
| Convites falhando | Conferir o segredo (passo 5) e as URLs (passo 3) |

## Arrumação no GitHub (opcional)
Os commits dos PRs #17, #18 e #19 já estão no `main`, mas eles seguem abertos porque apontam para outras branches: podem ser fechados. #6 (landing) e #4 (convite, com conflito) são frentes separadas.
