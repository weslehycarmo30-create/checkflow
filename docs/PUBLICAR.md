# Colocar o piloto no ar (checkflow.tec.br)

Situação em 27/11/2026. **O site ainda não está publicado.** A zona `checkflow.tec.br` está **Active** na Cloudflare (confirmado pelo responsável); o domínio ainda não tem registro de endereço, que é criado ao publicar. Legenda: 👤 = só você pode fazer.

## O que este conjunto traz
A branch `release/piloto` junta, sobre o `main` (`44c4fa5`): correções de resposta, pendências e convite (#22), tela de pessoas (#23), pacotes vulneráveis corrigidos (#24), a landing nova (#6) e este guia (#20). Não há migração além das que já estavam no `main`.

## Conferido em 27/11
Clone limpo desta branch (`a5e8668`), Windows, Node 26, seguindo os comandos abaixo com valores de exemplo:

| Checagem | Resultado |
| --- | --- |
| `npm ci`, lint, `tsc` | ok (9 avisos antigos de lint) |
| `npm test` (inclui build) | 156/156 |
| `npm run e2e:local` (piloto, papéis, pessoas, quedas de conexão; banco local) | 34/34 |
| `npm run deploy:cloudflare` (ensaio, nada publicado) | ok, 1,8 MB; número de WhatsApp presente no build; `git status` limpo |

Não testado: Supabase e e-mails de produção, painel da Cloudflare, publicação real, `verify:deploy` contra o site e celular real.

## Riscos para resolver antes

Conferidos por fora em 27/11, só com leitura. Os painéis da Cloudflare e do Supabase não foram vistos.

### A. App antigo público no banco de produção
| Endereço | O que é |
| --- | --- |
| `checkflow-start.weslehy-carmo30.workers.dev` | versão do fim de agosto, ligada ao Supabase `fzmzrtthmciaisygajba` |
| `checkflow-start-staging.weslehy-carmo30.workers.dev` | igual; o "teste" usa o **mesmo banco** |

Esses dois e o `checkflow-universal` (hoje só com a landing) foram gerados com uma versão do React Server Components que tem [falha crítica](https://github.com/advisories/GHSA-xqc2-xf4c-x3h3), corrigida neste conjunto. O aviso diz que ela só atinge casos muito raros; não verifiquei se é o caso. Publicar corrige o `checkflow-universal`; os outros dois só mudam se forem desligados ou publicados de novo.

A versão antiga também **deixa de registrar não conformidade** quando a migração `20261127220000` for aplicada.
👤 Antes do passo 3, decida: desligar os dois (Cloudflare → Workers & Pages → o Worker → desativar o endereço `workers.dev`, ou excluir) ou aceitar que parem de funcionar em parte. Se alguém usa esses endereços, avise a pessoa.

### B. E-mail
O envio padrão do Supabase **só entrega para membros da equipe do projeto** e tem limite baixo ([documentação](https://supabase.com/docs/guides/auth/auth-smtp)). Sem SMTP próprio, convite, confirmação de cadastro e recuperação de senha não chegam a clientes. Não sei se já há um configurado.

### C. Suas alterações sem commit não estão aqui
Em `C:\Factory Apps\checkflow` há mudanças suas (botão de sair, duração e estilo das mensagens, dois testes). **Sem elas, as mensagens de erro saem em vermelho sobre vermelho escuro, difíceis de ler.** A publicação abaixo usa um clone limpo, então não depende delas. 👤 Se quiser incluí-las, peça um PR antes do passo 1.

## Passo a passo

### 1. 👤 Juntar o PR da `release/piloto` no `main`
Só com a checagem `validate` verde. Os PRs #6, #20, #22, #23 e #24 estão contidos nele.

### 2. 👤 Decidir sobre o app antigo (risco A)

### 3. 👤 Banco de produção (Supabase `fzmzrtthmciaisygajba`)
Use os arquivos do `main` do GitHub ou do clone do passo 5; sua cópia local está atrasada.

1. Faça um backup (`docs/FREE_PLAN_MANUAL_LOGICAL_BACKUP_RUNBOOK_2026-09-08.md`). Migração não tem "desfazer" automático.
2. No SQL Editor, rode `supabase/preflight/prod_migration_parity_read_only.sql` (só leitura). `present = false` significa migração pendente.
3. Aplique o que faltar, na ordem dos nomes em `supabase/migrations/`, parando no primeiro erro. A última é `20261127220000_restrict_unguarded_writes.sql`.
4. Rode a consulta de novo: tudo deve aparecer como presente.

### 4. 👤 Autenticação e e-mail no Supabase
Em *Authentication*, configure o **SMTP próprio** (risco B). Em *Authentication → URL Configuration*: **Site URL** `https://checkflow.tec.br` e **Redirect URLs** `https://checkflow.tec.br/**`.

### 5. 👤 Clone limpo (PowerShell)
Um comando por vez. A pasta `C:\CheckFlow-publicar` não pode existir.

```powershell
git clone https://github.com/weslehycarmo30-create/checkflow.git C:\CheckFlow-publicar
```
```powershell
Set-Location C:\CheckFlow-publicar
```
```powershell
git log --oneline -3
```
```powershell
node -v
```
O `log` deve mostrar o merge do passo 1; o Node precisa ser 22.13 ou mais novo.
```powershell
npm.cmd ci
```
```powershell
notepad .env.local
```
Cole, troque os dois valores e salve:
```text
NEXT_PUBLIC_SUPABASE_URL=https://fzmzrtthmciaisygajba.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=COLE_A_CHAVE_PUBLISHABLE
NEXT_PUBLIC_CHECKFLOW_SALES_WHATSAPP=55DDNUMERO
```
- Use só a chave **pública** (Publishable). Nunca a secreta.
- O WhatsApp **não é obrigatório**: só dígitos, com 55 e DDD. Sem ele a landing mostra "Criar conta" no lugar do piloto de 14 dias. Ele é gravado no build: para mudar, publique de novo.

### 6. 👤 Login e segredo
```powershell
npx.cmd wrangler login
```
```powershell
npx.cmd wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config deploy/wrangler.production.jsonc
```
Cole a chave secreta só quando o terminal pedir. Ela é usada apenas nos convites de equipe.

### 7. 👤 Ensaiar, conferir e publicar
```powershell
npm.cmd run deploy:cloudflare
```
No começo da saída deve aparecer **"WhatsApp comercial: configurado"** (ou o `AVISO`, se você decidiu publicar sem número). No fim, `--dry-run: exiting now`. Com número, confira que ele entrou no build (troque pelo seu; precisa listar um arquivo):
```powershell
Get-ChildItem dist -Recurse -Filter *.js | Select-String -SimpleMatch "55DDNUMERO" -List | Select-Object -First 3 -ExpandProperty Path
```
```powershell
git status --short
```
O `status` deve sair vazio. Então publique:
```powershell
npm.cmd run deploy:cloudflare -- --apply
```

### 8. Verificar
```powershell
npm.cmd run verify:deploy
```
Depois, à mão, antes do primeiro turno:
1. Convide como executor um e-mail seu que **não** seja da equipe do projeto Supabase (testa o SMTP), abra o link, defina a senha e entre.
2. Crie "Abertura do bar" por **Modelos** e atribua ao executor.
3. No celular: responda, registre uma não conformidade, envie uma foto, recarregue a página e conclua.
4. Confira Histórico, Planos de ação, Relatórios e a tela de pessoas.
5. Preencha `docs/PILOTO_001_DAY0_TECH_CHECK.md`.

Pare o piloto nas condições de `docs/PILOTO_001_STOP_RULES.md`.

## Como desfazer

| Problema | Ação |
| --- | --- |
| Versão nova com defeito | `npx.cmd wrangler rollback --config deploy/wrangler.production.jsonc` (volta à versão anterior, hoje a landing de 18/11, sem login) |
| Tirar o site do domínio | Cloudflare → Workers & Pages → `checkflow-universal` → remover o domínio `checkflow.tec.br` |
| Chave secreta exposta (`verify:deploy` acusa) | Gerar chave nova no Supabase, regravar o segredo, conferir o `.env.local` e publicar de novo |
| Migração quebrou o banco | Restaurar o backup do passo 3; o rollback do Worker **não** desfaz o banco |
| Convites falhando | Conferir o SMTP e as URLs (passo 4) e o segredo (passo 6) |

## Arrumação no GitHub (opcional)
Os PRs #17, #18 e #19 já estão no `main` e podem ser fechados. O #4 (convite, antigo e com conflito) é uma frente separada.
