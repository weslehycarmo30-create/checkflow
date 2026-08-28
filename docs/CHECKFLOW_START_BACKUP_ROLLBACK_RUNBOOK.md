# CheckFlow Start — Backup e Rollback RC1

Data do ensaio: 2026-08-28
Projeto: `Check List Flow Project`
Project ref: `fzmzrtthmciaisygajba`
Região: `ca-central-1`
RC1: `fed09a9758074b6fef318bc6cc1507990833c05b`

## Status

**READY FOR ROLLOUT COM RESSALVAS**

O backup PostgreSQL foi exportado, recebeu checksum e foi restaurado com sucesso em database local descartável. Auth e conteúdo binário do Storage não foram exportados para não armazenar senhas, hashes, sessões ou tokens; ambos estão formalmente classificados como **ACCEPTED RISK FOR FIRST PILOT**, porque o proprietário confirmou que são dados exclusivamente de teste e não há cliente real. A primeira escrita ainda exige autorização humana explícita e os STOP points do plano de release.

## Backup PostgreSQL

- Ferramenta: Supabase CLI `2.116.0`, usando `supabase db dump` com a ref explícita; Docker `29.6.2`, PostgreSQL local de restore `17.x`.
- Timestamp schema UTC: `2026-08-28T03:31:58.0308108Z`.
- Timestamp dados UTC: `2026-08-28T03:42:12.9373475Z`.
- Local seguro temporário, fora do Git: `C:\Users\Lenovo i5 8ª\AppData\Local\Temp\checkflow-rc1-backup-20260828`.
- Schema: `database-schema.sql`, 157.395 bytes, SHA-256 `B8CB24BC1EECE2FDF7B5EC09D74241699FB17AE97D576393C69ADD36344E4D5C`.
- Dados não sensíveis de aplicação/Storage: `database-data-public-storage.sql`, 34.089 bytes, SHA-256 `CAA835D5A2A56EA9EED0835198553E844D172F1CF5174F9A0B696E692CB822CF`.
- O dump anterior que incluía tabelas internas de Auth foi removido; não é artefato versionado.
- O aviso de FK circular em `checklists` foi resolvido no ensaio pelo restore do schema seguido do dump de dados com `ON_ERROR_STOP=1`; restore final terminou com código zero.

## Restore test

Ensaio executado em database local isolado `rc1_restore`, nunca no remoto:

1. Criar database local separado com superuser interno da stack.
2. Restaurar `database-schema.sql`.
3. Restaurar `database-data-public-storage.sql`.
4. Consultar tabelas, Storage, RLS e snapshot.
5. Descartar a stack local após o ensaio.

Resultado: **RESTORE_SCHEMA_OK**, **RESTORE_DATA_OK** e validações concluídas sem erro.

Contagens restauradas: organizations 2; organization_members 7; checklists 7; checklist_assignments 11; checklist_executions 6; execution_answers 17; non_conformities 2; action_plans 1; attachments 1; objetos Storage 4. Foram observadas 16 tabelas públicas com RLS. `execution_snapshot` permaneceu ausente, igual ao estado remoto atual anterior às migrations RC1.

## Auth

Inventário somente agregado no remoto: 7 usuários, 7 identities, 7 profiles, 7 memberships; provider observado: `email`.

Não foi exportado `auth.users`, sessões, refresh tokens, MFA ou tokens de recuperação. Não há senhas/tokens neste runbook nem no Git. Antes do rollout, o responsável deve usar o mecanismo oficial de backup/export da plataforma ou definir recriação controlada dos usuários de teste e configuração Auth. Sem isso, Auth não é considerado restaurável comprovado.

## Storage

- Bucket: `checkflow-evidence`.
- Privacidade: privado.
- MIME permitido: JPEG/PNG/WebP.
- Limite: 10 MiB.
- Objetos: 4, total aproximado de 6.426.853 bytes.
- Paths e tamanhos foram inventariados em arquivo temporário `storage-inventory.txt`, SHA-256 `17235C2CCFFAA45C9A9C04DF67F77F0ACEA99C2E9A05F51DF6910AA02F866123`.
- Dois placeholders têm 0 bytes; dois JPGs têm 2.722.821 e 3.704.032 bytes.

As tentativas da CLI de copiar objetos remotos foram recusadas como operação não suportada e não alteraram Storage. Os binários não estão duplicados neste backup. A recuperação prevista é download controlado via Storage API/dashboard com credencial autorizada, validando cada path/tamanho/hash contra o inventário, antes de qualquer rollout.

## Functions / Worker / frontend

- Edge Functions Supabase observáveis: nenhuma.
- Worker/backend e frontend são identificáveis pelo SHA RC1 `fed09a9` e pelo histórico Git; o artefato Cloudflare Sites/Vinext é validado por `npm run build`.
- Versão atualmente implantada do Worker/frontend remoto não foi obtida por operação de escrita ou deploy e permanece **INCERTA**.
- Rollback de código: reverter o deployment Cloudflare para o SHA anterior aprovado, após registrar o SHA efetivamente implantado.
- Não foram alterados secrets, bindings, Auth, Storage ou frontend remoto.

## Rollback operacional

### Falha durante migration

Parar na migration que falhar, preservar logs, não executar a próxima etapa e restaurar o export/backup confirmado. Se o backup completo ainda não estiver confirmado, decisão automática é NO-GO.

### Migration aplicada, frontend incompatível

Interromper tráfego, reverter frontend/Worker ao SHA anterior e restaurar o banco somente com procedimento aprovado para o schema resultante.

### Falha de Auth

Bloquear smoke, não criar usuários reais e restaurar Auth/config pelo backup oficial confirmado; sem esse backup, abortar.

### Falha de Storage

Bloquear uploads, preservar objetos, comparar inventário e recuperar objetos via API oficial; não apagar nem sobrescrever objetos como tentativa de correção.

### Falha após smoke

Parar o rollout controlado, registrar evidências, retirar tráfego, voltar ao SHA anterior e restaurar banco/Auth/Storage conforme backups confirmados.

## Condições de abortar rollout

- project ref ou conta divergente;
- qualquer migration ausente ou divergente sem plano aprovado;
- backup sem checksum ou restore não repetível;
- Auth/Storage sem recuperação comprovada;
- violação de integridade, RLS, tenant ou ownership;
- falha no smoke de organização de teste;
- secrets expostos ou configuração não server-side;
- ausência do responsável humano pelo GO/ROLLBACK.

## Ensaio conceitual

`estado remoto atual → dump PostgreSQL → checksum → restore em database descartável → validação de schema/contagens/RLS → manter migrations RC1 não aplicadas`.

O ensaio técnico foi concluído em poucos segundos após a stack local estar disponível; a maior parte do tempo foi inicialização do PostgreSQL local. Nenhuma migration RC1 foi aplicada ao remoto e nenhuma alteração de rollout foi simulada no remoto.

## Responsabilidades e limitações

Responsável pelo GO/ROLLBACK: ainda não designado nesta sessão; deve ser nomeado pelo gerente. O backup local temporário não é armazenamento corporativo de produção e não deve ser usado como único plano de continuidade. A ausência de PITR e de backup físico listado no Supabase permanece uma ressalva operacional.

## Gate final

1. Backup real do banco atual? **Sim, dump oficial do schema e dados public/Storage.**
2. Checksum? **Sim, SHA-256 registrado.**
3. Restaurado com sucesso em ambiente descartável? **Sim.**
4. Schema/dados essenciais validados? **Sim, contagens/RLS/Storage validados; snapshot ausente como no remoto.**
5. Auth recuperável? **Parcialmente: inventário e plano explícito; export sensível não realizado.**
6. Storage recuperável? **Com ressalva: inventário completo e plano via API; binários não duplicados.**
7. Worker/frontend com rollback identificável? **Sim por SHA/artefato; versão remota atualmente implantada é incerta.**
8. Runbook executável? **Sim, este documento.**
9. Seguro voltar ao gate de rollout? **Não ainda; exigir confirmação humana de backup completo Auth/Storage e rollback operacional.**

Produção não foi alterada. Nenhuma migration remota, deploy, publicação, inserção ou alteração de dados foi realizada.

## Decisão humana e classificação de recovery — missão 012

O proprietário confirmou formalmente: não há cliente vendido, cliente real em produção, operação comercial dependente do deployment ou dado de cliente a preservar. Os 7 usuários Auth e os 4 objetos Storage atuais são exclusivamente testes do proprietário. Recriação/perda desses dados de teste é aceitável para o primeiro piloto. Isso é **ACCEPTED RISK**, não autorização para apagar: nenhum `DELETE`, reset de Auth, upload, move, overwrite ou outra operação destrutiva foi autorizada nesta missão.

Matriz vigente:

| Componente | Classificação para o primeiro piloto | Justificativa |
|---|---|---|
| PostgreSQL schema/data | GREEN | dump com checksum e restore local comprovado |
| Auth atual | ACCEPTED RISK | 7 contas de teste do proprietário; recriação/password reset aceitável |
| Storage metadata | GREEN | metadata preservada no dump/restore |
| Storage binaries antigos | ACCEPTED RISK | 4 evidências exclusivamente de teste; nenhum cliente afetado |
| Frontend baseline anterior | NOT APPLICABLE FOR CUSTOMER ROLLBACK | não existe produção comercial anterior |
| Worker/Functions | validar somente o necessário ao RC1 | nenhum Worker antigo é dependência assumida do primeiro rollout |

O accepted risk não encobre um risco comercial: ele delimita conscientemente o primeiro piloto e não autoriza exclusão de dados.

## Dry-run de upgrade do estado remoto — missão 012

Os dumps do estado remoto atual foram restaurados em PostgreSQL Docker descartável. As cinco migrations históricas foram executadas exatamente em ordem, com `ON_ERROR_STOP=1`, e todas passaram. A incompatibilidade de colunas internas `auth.users` entre a imagem local e o dump foi isolada ao role interno da imagem; uma coluna de compatibilidade foi adicionada somente ao container descartável para executar os fixtures. Nenhum arquivo histórico foi editado e nenhum comando foi dirigido ao remoto.

Resultado: dados preservados (2 organizations, 7 memberships, 7 checklists, 11 assignments, 6 executions, 17 answers, 2 non-conformities, 1 action plan, 4 metadata Storage); zero órfãos e zero links cross-tenant; RLS público completo; `execution_snapshot` e triggers históricos presentes. Os testes SQL P0 e de integridade histórica passaram e fizeram `ROLLBACK` dos fixtures.

Estratégia aprovada para a primeira escrita: aplicar diretamente as cinco migrations existentes, sem migration forward e sem `migration repair`. Antes da escrita, `supabase db push --linked --dry-run` deve listar exatamente as cinco versões. Qualquer lista diferente, erro ou drift é STOP.

## Target de primeira publicação

O código é um Site Vinext/Cloudflare Sites, não o Worker antigo identificado como `clip-flow-ai-remix`. O pipeline esperado executa `npm run build` no commit aprovado e publica o artefato Sites; `.openai/hosting.json` contém o identificador do projeto de hosting. O deploy não foi executado nesta missão. As variáveis públicas `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` devem ser configuradas no ambiente do Site; `SUPABASE_SERVICE_ROLE_KEY`, se necessária para o endpoint server-side de convite, deve ser secret server-side. A URL final será registrada no STOP de health após a publicação.

## Atualização do recovery gap — missão 010

### Storage físico

O inventário remoto foi repetido: 4 objetos no bucket privado `checkflow-evidence`, total de aproximadamente 6.426.853 bytes. A CLI Supabase `2.116.0` recusou `storage cp` remoto como operação não suportada, tanto com `--project-ref` quanto com `--linked --project-ref`; nenhum objeto foi alterado.

Resultado: **0/4 objetos baixados fisicamente**. O arquivo temporário `storage-inventory.txt` contém paths, MIME e tamanhos, com SHA-256 `17235C2CCFFAA45C9A9C04DF67F77F0ACEA99C2E9A05F51DF6910AA02F866123`. A cópia física exige Dashboard ou cliente S3/API oficial com credencial autorizada para leitura do bucket privado. Não foi usado `service_role` nem criada sessão remota.

Em ambiente local, o schema/metadados Storage do dump foram restaurados e os 4 registros de objetos foram validados. Os bytes não foram restaurados; portanto a prova de recuperação binária ainda está pendente.

### Auth recovery

O inventário remoto confirmou 7 usuários, 7 identities, 7 profiles, 7 memberships e somente provider `email`. O dump sensível anterior foi removido; não há passwords, hashes, sessões, refresh tokens ou access tokens armazenados como artefato de backup.

Segundo a documentação oficial do Supabase, um backup completo/`.backup` ou export SQL do schema `auth` pode migrar usuários e hashes de senha, mas isso deve ser tratado como material sensível e protegido. O projeto não tem backup físico listado nem PITR habilitado, e não foi produzido um export Auth nesta sessão.

Plano A: obter backup oficial completo do projeto, com acesso controlado, e testar restauração em projeto/database descartável autorizado. Plano B: reconstruir os 7 usuários com fluxo administrativo seguro/password reset, preservando IDs quando possível; se IDs mudarem, remapear profiles/memberships e validar todas as FKs antes de liberar acesso. Nenhum plano foi executado remotamente.

### Deploy baseline

Cloudflare Wrangler `4.92.0` não está autenticado nesta máquina (`wrangler whoami`), e o repositório não contém URL, deployment ID ou SHA atualmente publicado. `.openai/hosting.json` identifica apenas o projeto Sites `appgprj_6a5ee794dc588191860b8c58b57bec77`; isso não prova o deployment ativo.

Rollback de código é identificável para o RC1 pelo SHA `fed09a9758074b6fef318bc6cc1507990833c05b` e pelos commits anteriores, mas o alvo efetivamente publicado é **INCERTO**. Antes do rollout, registrar no painel Cloudflare a URL, deployment ID, SHA, data/hora, bindings e configuração pública; sem isso, abortar.

### Matriz de recovery

| Componente | Backup existe? | Restore provado? | Método | RPO | Risco residual |
|---|---|---|---|---|---|
| PostgreSQL schema | Sim | Sim | `supabase db dump` + psql local | ponto do dump | GREEN |
| PostgreSQL public/storage data | Sim | Sim | dump sanitizado + database local | ponto do dump | GREEN |
| Auth | Inventário sim; export sensível não | Não | backup oficial ou reconstrução/password reset | definido pelo backup futuro | RED |
| Storage metadata | Sim | Sim | dump SQL | ponto do dump | GREEN |
| Storage binaries | Inventário sim; bytes não | Não | Dashboard/S3/API oficial | ponto do download futuro | RED |
| Frontend | Código RC sim | Deployment ativo não | Git SHA + Cloudflare Sites | último SHA registrado | YELLOW |
| Worker/Functions | Código RC sim; Edge Functions nenhuma listada | Deployment ativo não | Git SHA/artefato | último SHA registrado | YELLOW |
| Config | `.env.example`/hosting metadata sim | Config remota não | inventário manual/Management API | desconhecido | RED |

Qualquer componente crítico RED bloqueia rollout. O próximo passo mínimo é obter, com autorização humana, cópia física dos 4 objetos, backup/restore Auth oficial ou decisão formal de reconstrução, e baseline Cloudflare documentado.

### Fontes oficiais consultadas

- [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups): backup de banco não inclui bytes dos objetos Storage.
- [Supabase Download Objects](https://supabase.com/docs/guides/storage/management/download-objects): Dashboard/S3/CLI são caminhos oficiais para obter objetos.
- [Supabase Migrating Auth Users](https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects): backup completo ou SQL do schema Auth pode preservar usuários e hashes, com tratamento sensível.

## Diagnóstico executável — missão 011

### Classificação dos três REDs

| Componente | Status | Bloqueador | Próxima ação |
|---|---|---|---|
| Storage binaries | HUMAN AUTH REQUIRED | CLI remota recusou `storage cp`; bucket privado exige credencial autorizada | Humano baixar os 4 paths pelo Dashboard ou Storage API/S3 oficial e calcular SHA-256 |
| Auth recovery | HUMAN AUTH REQUIRED | export de dados `auth` resultou vazio; somente schema Auth foi exportado | Humano obter backup/export Auth oficial com permissão adequada e testar restore isolado |
| Cloudflare baseline | HUMAN AUTH REQUIRED | Wrangler não autenticado | Humano executar login e consultar deployments read-only |

O projeto remoto foi novamente confirmado como `fzmzrtthmciaisygajba`, ativo e saudável. Não existem variáveis de ambiente relevantes disponíveis nesta máquina. Não foi impresso nem armazenado token.

O export `auth-schema.sql` foi criado fora do repositório, mas contém somente definição de schema. O arquivo `auth-data.sql` resultou em zero bytes; portanto não é backup de `auth.users`/`auth.identities` e não foi tratado como tal. Nenhum restore Auth foi executado.

### AÇÃO HUMANA AGORA

1. **Dashboard Supabase / Storage** — abrir o projeto `fzmzrtthmciaisygajba`, bucket privado `checkflow-evidence`, e baixar os 4 objetos preservando os paths; resultado esperado: 4 arquivos locais com tamanho, MIME e SHA-256 conferidos contra o inventário; **não autorizar upload, delete, move ou update**.
2. **Supabase Support/Database backup autorizado** — obter export ou backup oficial que inclua `auth.users` e `auth.identities`, armazená-lo fora do Git e fornecer somente metadados/checksum; resultado esperado: restore testável em ambiente descartável; **não autorizar criação, alteração ou reset de usuários remotos**.
3. **PowerShell / Cloudflare** — executar `wrangler login` e depois `wrangler deployments list` em modo leitura; resultado esperado: conta, URL, deployment ativo, timestamp e SHA identificados; **não autorizar deploy, alteração de configuração ou publicação**.

Até essas ações, os três componentes permanecem RED. Não há problema de programação identificado; são bloqueios de permissão/autenticação humana.
