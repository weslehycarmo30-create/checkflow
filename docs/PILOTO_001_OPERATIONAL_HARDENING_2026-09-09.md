# Piloto 001 — operational hardening — 2026-09-09

## Checkpoint

- HEAD esperado: `4e2b192b564c258d92d02fd294f22aaafffc946a`.
- HEAD inicial encontrado: `864e93d7ee7ed80d707e682021f22fe5c69d4b6f` (**diverge do esperado; 23 commits à frente de `origin/main`**).
- `origin/main`: `68852bd55ff67bda30da1bd40df02a61559d7d32`.
- Modificações rastreadas iniciais: nenhuma; artefatos não rastreados preexistentes foram preservados.
- As oito migrations congeladas foram conferidas localmente contra `supabase/manual-rollout/MANIFEST.md`; os SHA-256 das migrations de origem coincidem com o manifesto. Nenhuma migration foi alterada.

## Error handling e códigos

Foi adicionada telemetria local, leve e sem serviço externo em `lib/operational-telemetry.mjs`. O console recebe somente `operation`, `entity`, `entity_id`, `organization_id`, `error_code`, horário e tipo do erro; não recebe mensagem bruta do servidor, tokens, senhas, respostas, fotos ou PII.

Os caminhos críticos de iniciar execução, salvar resposta, upload/vínculo e concluir agora capturam rejeições de rede e liberam locks/spinners em `finally`. A UI mostra ação segura e código de suporte:

- `EXECUTION_START_FAILED`
- `ANSWER_SAVE_FAILED`
- `UPLOAD_FAILED`
- `EXECUTION_COMPLETE_FAILED`

O mapa de suporte também reserva `AUTH_SESSION_EXPIRED`, `ASSIGNMENT_CREATE_FAILED`, `NC_CREATE_FAILED`, `ACTION_PLAN_SAVE_FAILED` e `HISTORY_LOAD_FAILED` quando esses fluxos forem diagnosticados. Não foi criado catálogo artificial de códigos.

## False success, stale state e conexão ruim

- Resposta, início e conclusão só atualizam a UI depois de confirmação persistida.
- Upload com falha de vínculo preserva a possibilidade de que o arquivo já exista e manda atualizar antes de repetir; evita duplicação cega.
- Falha de refresh posterior à persistência de plano já era tratada como sucesso persistido + atualização antes de nova tentativa.
- Gap corrigido: exceções/rejeições de transporte em execution não deixam ação bloqueada indefinidamente.
- O MVP continua sem offline. Em queda/timeout, a orientação é: não assumir persistência; anotar código/IDs; atualizar uma vez; repetir somente se o estado não estiver confirmado. Nunca concluir com respostas ainda salvando.

## Revisão mobile estrutural

Revisão estática preservou os controles já existentes: área reservada para CTA e safe-area, mensagens de erro sem interceptar CTA, controles de foto com `capture=environment`, feedback acessível e retry visível nas telas de detalhe/histórico. A matriz permanece `PARTIAL` para 360/390/412: browser E2E não foi executado nem reclassificado, pois permanece bloqueado pelo healthcheck local conhecido.

## Operação do piloto

- Console de suporte: `PILOTO_001_SUPPORT_CONSOLE.md`.
- Modelo de incidente: `PILOTO_001_INCIDENT_REPORT_TEMPLATE.md`.
- Check Day-0: `PILOTO_001_DAY0_TECH_CHECK.md`.
- Pacote do primeiro turno: `PILOTO_001_FIRST_SHIFT_PACK.md` (começar por Abertura do Bar, máximo oito itens obrigatórios).
- Stop rules: `PILOTO_001_STOP_RULES.md`.

## Novos testes e gates

- Novo `tests/operational-telemetry.test.mjs`: evidência sem erro bruto/segredo, mensagem segura com código, e liberação de locks após rejeição.
- Atualizado contrato de execução para exigir `ANSWER_SAVE_FAILED` e camada segura.
- Node: **47/47 PASS**.
- TypeScript: **PASS**.
- Build: **PASS**.
- Lint: **PASS**.
- `git diff --check`: **PASS**.
- Rollout precheck: **PASS local-only**; não tentou remoto.
- SQL, adversarial e concurrency: estado anterior informado era PASS (8/8, 6/6, 12/12); a reexecução desta janela não iniciou porque o executor local retornou erro de criação de processo (`-1073741523`). Classificação: **ENVIRONMENT**, sem investigação do Storage/Docker.
- Release gate: invocado; a saída disponível chegou ao build antes do retorno do executor, sem evidência final reproduzível nesta janela. Classificação: **ENVIRONMENT / não reatestado**.
- `npm audit --omit=dev`: não executado; não foi verificada conectividade do registry, para não introduzir dependência externa.

## Bugs encontrados e corrigidos

| Severidade | Encontrado | Correção |
| --- | --- | --- |
| P2 | Rejeição de rede em início/resposta/upload/conclusão podia manter lock ou spinner ativo. | `try/catch/finally`, código seguro e telemetria local. |
| P3 | Teste de contrato esperava texto obsoleto, não o código de suporte. | Atualizado para validar o novo comportamento. |

P0: 0. P1: 0. P2: 1 corrigido. P3: 1 corrigido.

## Gaps restantes

- HEAD inicial não é o checkpoint exigido; não foi feito reset por segurança.
- Browser mobile E2E continua BLOCKED pelo healthcheck local conhecido.
- Não há offline engine, timeout de transporte explícito ou observabilidade externa — fora do escopo desta missão.
- Gates SQL/adversarial/concurrency e resultado final do release gate precisam ser reatestado em um executor local saudável antes da decisão de rollout.

## Confirmações de escopo

- ZERO remote SQL.
- ZERO remote migration.
- ZERO remote data change.
- ZERO Auth/Storage remoto change.
- ZERO deploy.
- ZERO push.
