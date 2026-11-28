# Colocar o piloto no ar (checkflow.tec.br)

Situação em 27/11/2026, `main` em `44c4fa5` (inclui o PR #21, de permissões). **O site ainda não está publicado em `checkflow.tec.br`**: o DNS já está delegado à Cloudflare, mas o domínio ainda não tem registro de endereço e não abre. Há versões antigas ou parciais públicas em outros endereços (abaixo). Detalhes de cada comando: [DEPLOY_CLOUDFLARE.md](DEPLOY_CLOUDFLARE.md).

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

## Três riscos para resolver antes

Conferidos por fora em 27/11, só com leitura. O painel da Cloudflare e o do Supabase não foram vistos.

### A. App antigo público no banco de produção
| Endereço | O que é |
| --- | --- |
| `checkflow-start.weslehy-carmo30.workers.dev` | versão do fim de agosto, no ar, ligada ao Supabase `fzmzrtthmciaisygajba` |
| `checkflow-start-staging.weslehy-carmo30.workers.dev` | igual; o "teste" usa o **mesmo banco** |

Os três endereços (os dois acima e o `checkflow-universal`, do risco C) foram gerados com uma versão do React Server Components que tem [falha crítica](https://github.com/advisories/GHSA-xqc2-xf4c-x3h3), corrigida no PR #24. O aviso diz que ela só atinge casos muito raros; não verifiquei se é o caso. Só muda publicando de novo ou desligando.

A versão antiga não tem as proteções atuais e mostra a tela de cadastro. Além disso, **deixa de registrar não conformidade** quando a migração `20261127220000` for aplicada.
👤 Antes do passo 2, decida: desligar os dois (Cloudflare → Workers & Pages → o Worker → desativar o endereço `workers.dev`, ou excluir) ou aceitar que parem de funcionar em parte. Se alguém usa esse endereço hoje, avise a pessoa.

### B. E-mail
O envio padrão do Supabase **só entrega para membros da equipe do projeto** e tem limite baixo ([documentação](https://supabase.com/docs/guides/auth/auth-smtp)). Sem SMTP próprio, convite, confirmação de cadastro e recuperação de senha não chegam a clientes.
👤 Crie a conta em um serviço de e-mail e configure o SMTP no Supabase (passo 3). Não sei se já há um configurado.

### C. Publicar troca a landing nova pela antiga
O Worker `checkflow-universal`, que a publicação usa, hoje mostra a landing nova (publicada em 18/11 a partir do PR #6; o login não funciona lá por falta de configuração). Publicar o `main` sem o PR #6 coloca a landing antiga no lugar.
👤 Decida qual landing fica. Para a nova, o PR #6 precisa ser atualizado com o `main`, testado e juntado antes do passo 6.

## Juntar antes de publicar

| PR | O que traz | Ordem |
| --- | --- | --- |
| #24 | correção dos pacotes vulneráveis | qualquer |
| #22 | respostas e pendências coerentes, aviso do limite de 50 e reenvio de convite | antes do #23 |
| #23 | tela de pessoas: remover, reativar, mudar papel e reenviar convite | depois do #22 |

Nenhum deles tem migração. Os três juntados localmente em 27/11 passaram 154/154 e o fluxo no navegador 34/34 (banco local). Cada PR precisa estar com a checagem `validate` verde antes do merge.

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

### 3. 👤 Autenticação e e-mail no Supabase
Em *Authentication*, configure o **SMTP próprio** (risco B). Depois, em *Authentication → URL Configuration*: **Site URL** `https://checkflow.tec.br` e **Redirect URLs** `https://checkflow.tec.br/**`. Sem isso, os links de cadastro, senha e convite não voltam para o site.

### 4. 👤 Domínio
**Já feito:** os servidores DNS são os da Cloudflare (`carrera` e `terry`); não é preciso mexer no Registro.br. Só confirme que a zona aparece como **Active**. O registro de endereço é criado ao publicar (domínio próprio do Worker). O texto abaixo vale se a zona precisar ser refeita.

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
1. Convide como executor um e-mail seu que **não** seja da equipe do projeto Supabase (testa o SMTP), abra o link, defina a senha e entre.
2. Crie "Abertura do bar" por **Modelos**, atribua ao executor.
3. No celular: responda, registre uma não conformidade, envie uma foto, recarregue a página e conclua.
4. Confira Histórico, Planos de ação e Relatórios.
5. Preencha `docs/PILOTO_001_DAY0_TECH_CHECK.md`.

Pare o piloto nas condições de `docs/PILOTO_001_STOP_RULES.md`.

## Como desfazer

| Problema | Ação |
| --- | --- |
| Versão nova com defeito (o Worker já tem a de 18/11, com a landing nova) | `npx wrangler rollback --config deploy/wrangler.production.jsonc` |
| Tirar o site do domínio | Cloudflare → Workers & Pages → `checkflow-universal` → remover o domínio `checkflow.tec.br` |
| Chave secreta exposta (`verify:deploy` acusa) | Gerar chave nova no Supabase, regravar o segredo, conferir o `.env.local` e publicar de novo |
| Migração quebrou o banco | Restaurar o backup do passo 2; o rollback do Worker **não** desfaz o banco |
| Convites falhando | Conferir o SMTP e as URLs (passo 3) e o segredo (passo 5) |

## Arrumação no GitHub (opcional)
Os commits dos PRs #17, #18 e #19 já estão no `main`, mas eles seguem abertos porque apontam para outras branches: podem ser fechados. #6 (landing) e #4 (convite, com conflito) são frentes separadas.
