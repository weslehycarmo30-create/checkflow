# CheckFlow Start — Backup e Rollback RC1

Data do ensaio: 2026-08-28
Projeto: `Check List Flow Project`
Project ref: `fzmzrtthmciaisygajba`
Região: `ca-central-1`
RC1: `fed09a9758074b6fef318bc6cc1507990833c05b`

## Status

**BACKUP READY COM RESSALVAS**

O backup PostgreSQL foi exportado, recebeu checksum e foi restaurado com sucesso em database local descartável. Auth e conteúdo binário do Storage não foram exportados para não armazenar senhas, hashes, sessões ou tokens; ambos têm inventário e plano de recuperação explícito. O rollout continua proibido até um responsável confirmar backup completo de Auth/Storage e rollback operacional.

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
