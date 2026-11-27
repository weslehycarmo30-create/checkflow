# Publicar o CheckFlow em checkflow.tec.br (Cloudflare)

O app é um Worker da Cloudflare (vinext) com arquivos estáticos e o banco no Supabase.
Esta página é o passo a passo para colocá-lo no ar. **Nada aqui é executado automaticamente**:
cada etapa marcada com 👤 precisa ser feita pelo responsável (login, DNS, aprovação).

## O que já está pronto no repositório

| Arquivo | Função |
| --- | --- |
| `deploy/wrangler.production.jsonc` | Config do Worker `checkflow-universal`: assets, binding de imagens (`IMAGES`) e domínio `checkflow.tec.br`. Sem segredos. |
| `scripts/deploy-cloudflare.mjs` | Faz o build verificado e roda `wrangler deploy`. **Sem `--apply` é só ensaio (dry-run).** |
| `npm run deploy:cloudflare` | Atalho do script acima. |

Variáveis em runtime do Worker: `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (públicas; o script as lê do seu `.env.local`) e `SUPABASE_SERVICE_ROLE_KEY` (**secret**, usada só em `/api/team-invitations`). O CRM continua indisponível em produção porque `CRM_LOCAL_DEVELOPMENT` não é definido.

## Passo a passo

### 1. 👤 Aprovar o código que vai ao ar
Fazer o merge no `main` dos PRs empilhados, nesta ordem: #5 → #7 → #8 → #9 → #10 → #11 → #12 → este. Depois `git switch main && git pull`.

### 2. 👤 Conferir o banco de produção (Supabase `fzmzrtthmciaisygajba`)
O site novo usa tabelas, colunas e regras das migrações mais recentes (dados da empresa, integridade de unidades, bloqueio de exclusão de unidade). Antes de publicar:
1. Comparar `supabase/migrations/` com o que já está aplicado no remoto: rodar, no SQL Editor do Supabase, `supabase/preflight/prod_migration_parity_read_only.sql` (só leitura; `present = false` indica migração pendente) ou `supabase migration list --linked`.
2. Aplicar o que faltar **na ordem**, seguindo `supabase/manual-rollout/` e os docs `docs/P1_REMOTE_MIGRATION_ROLLOUT_2026-09-07.md` e `docs/CHECKFLOW_START_PRODUCTION_PREFLIGHT.md`.
3. Rodar as consultas só de leitura de `supabase/preflight/` e as `*_verify_read_only.sql`.

Publicar o app sem este passo pode quebrar telas que dependem de colunas novas.

### 3. 👤 Colocar o domínio na Cloudflare
`checkflow.tec.br` hoje **não tem DNS**. Para o Worker atender nesse domínio:
1. Na Cloudflare: *Add a domain* → `checkflow.tec.br` (plano Free serve).
2. No **Registro.br**, trocar os servidores DNS do domínio pelos dois nameservers que a Cloudflare mostrar. A propagação pode levar de minutos a algumas horas.
3. Esperar a Cloudflare marcar a zona como *Active*.

### 4. 👤 Login na Cloudflare
```bash
npx wrangler login
```
(abre o navegador; use a conta que tem a zona do passo 3).

### 5. 👤 Secret do Supabase (só para convites de equipe)
```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config deploy/wrangler.production.jsonc
```
Cole a service_role do painel do Supabase quando o terminal pedir. Nunca coloque essa chave em arquivo versionado nem no frontend. Sem ela o site funciona, mas "convidar para a equipe" responde "Convites não configurados".

### 5b. 👤 URLs de autenticação no Supabase
No painel do Supabase, em *Authentication → URL Configuration*:
- **Site URL:** `https://checkflow.tec.br`
- **Redirect URLs:** adicionar `https://checkflow.tec.br/**`

Sem isso, os links de confirmação de cadastro, recuperação de senha e convite de equipe voltam para o endereço antigo (ou são recusados). O convite abre `/auth?mode=reset`, onde a pessoa convidada define a senha. Teste convidando um e-mail seu antes do primeiro turno.

### 6. Ensaio
```bash
npm run deploy:cloudflare
```
Faz o build, valida o pacote e termina em `--dry-run: exiting now` sem publicar.

Opcional, para ver o Worker rodando na sua máquina antes de publicar (valores fictícios, nada remoto):
```bash
npx wrangler dev --config deploy/wrangler.production.jsonc --local --compatibility-date 2026-05-22 --var NEXT_PUBLIC_SUPABASE_URL:https://exemplo.supabase.co --var NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:sb_publishable_exemplo
```
A opção `--compatibility-date` é só para o ensaio local: o runtime do wrangler instalado aqui vai até 2026-05-22 e a config de produção pede 2026-09-03. Em outro terminal: `npm run verify:deploy -- http://127.0.0.1:8787` (sem o secret, os convites aparecem como aviso).

### 7. 👤 Publicar
```bash
npm run deploy:cloudflare -- --apply
```
O primeiro deploy cria o Worker, anexa o domínio `checkflow.tec.br` e emite o certificado HTTPS.

### 8. Verificação pós-publicação
Primeiro a conferência automática (só leitura, não imprime chaves):
```bash
npm run verify:deploy
```
Ela confere HTTPS, página inicial, login, a configuração pública do Supabase (falha se uma chave secreta estiver exposta), se o secret dos convites está configurado e se `/crm` está bloqueado. Depois, à mão:

- `https://checkflow.tec.br/` abre a landing; `https://checkflow.tec.br/auth` abre o login.
- `https://checkflow.tec.br/api/supabase-config` responde `200` com a URL e a chave **pública** (nunca a service_role).
- Entrar com uma conta de teste, abrir **Modelos**, criar um checklist com "Usar modelo" e conferir que aparece em **Operação**.
- Executar o checklist no celular (foto, não conformidade, conclusão) e conferir o **Histórico**.
- Se algo falhar: `npx wrangler rollback --config deploy/wrangler.production.jsonc` volta para a versão anterior.

## Observações
- Redirecionar `www.checkflow.tec.br` exige uma regra extra na Cloudflare; não está no escopo acima.
- O OpenAI Sites (`.openai/hosting.json`) deixa de ser usado se a publicação passar a ser feita por aqui; manter o arquivo não atrapalha o build.
