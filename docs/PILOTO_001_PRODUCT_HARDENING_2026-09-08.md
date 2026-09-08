# Piloto 001 — product hardening (2026-09-08)

## Resultado

- HEAD inicial: `4aaf4922379050734bd123153a41c62676ab461b`.
- Escopo: produto local, sem acesso remoto e sem alteração de migrations.
- P0/P1: nenhum novo conhecido nesta revisão focada.

## Integration tests e correção

Foi criado `lib/pilot-execution-state.mjs`, usado pelas telas reais de execution e assignment, e `tests/pilot-execution-state.test.mjs`. Os testes executam regras compartilhadas, não uma cópia/mock da lógica: resposta numérica `0`, progresso, obrigatórios + NC, ciclo completed não reutilizável e mensagem fail-safe após persistência.

**Bug corrigido — action plan stale state após persistência:** `createPlan`, `uploadCorrection` e `validatePlan` podiam lançar durante `load()` posterior. O CTA podia ficar ocupado e a mensagem genérica podia induzir retry de uma operação já persistida. Cada fluxo agora usa `try/catch/finally`, libera lock/busy e distingue falha anterior à persistência de falha de refresh (“Atualize antes de tentar novamente”).

## Failure paths auditados

| Cenário | Resultado | Evidência |
| --- | --- | --- |
| A erro com falso sucesso | PROTECTED | sucesso só após resposta DB; catch/error nos planos. |
| B mutação parcial/conclusão assumida | PROTECTED | completion é validado no DB; pós-persistência pede refresh. |
| C request pendente | PROTECTED | lock/busy impede repetição; `finally` nos planos. Timeout visual global permanece GAP P2. |
| D double-click | PROTECTED | `actionLock`, `savingItems` e constraints SQL. |
| E reload no meio | PROTECTED | load é execution/assignment-scoped; persistido é reidratado. |
| F sessão expira | PROTECTED | auth/loads exibem sessão ausente; rotas privadas redirecionam. |
| G array vazio inesperado | PROTECTED | arrays normalizados a `[]`; UI vazia explícita. |
| H dado duplicado | PROTECTED | unique gates SQL e seleção por assignment/ciclo. |
| I upload falha | PROTECTED | sem feedback de sucesso; RPC/update ambíguo preserva evidência e pede refresh. |
| J assignment criado e refresh lento | PROTECTED | `load()` após mutation; erro não anuncia sucesso inválido. |
| K completion/dashboard stale | PARTIAL | completion local muda para terminal; dashboard é recarregado em nova visita, sem subscription. |
| L NC falha após answer | PROTECTED | estado local de NC só muda após RPC. |
| M plano falha após status | PROTECTED | correção de persistência/refresh nesta missão. |

## Stale state e mobile

Não há cache/optimistic update externo. Estados derivados usam IDs de assignment/execution; a reatribuição não reutiliza ciclos completed. A única lacuna relevante é dashboard aberto em outra aba/dispositivo sem realtime subscription: **P2 deferred pilot**, mitigado por reload/reabertura e canary.

Revisão estrutural 360/390/412: CTA finalizar em largura total e margem safe-area, ações sticky, feedback com z-index/safe-area sem interceptar CTA, inputs com 44px, upload/foto empilhados, cards de NC e planos em uma coluna abaixo de 560px. Keyboard/browser real continua BLOCKED no E2E conhecido.

## P2/P3

| Item | Decisão |
| --- | --- |
| Dashboard sem atualização entre abas/dispositivos | DEFER PILOT; reload/reabertura no canary. |
| E2E browser por healthcheck Storage local | DEFER PILOT; bloqueio ambiental já conhecido, não reinvestigado. |
| `npm audit` indisponível por registry | DEFER PILOT; ENVIRONMENT, não vulnerabilidade. |
| 7 warnings de `window.location.href` | DEFER POST-PILOT; sem defeito reproduzido. |
| warnings futuros Vite | DEFER POST-PILOT. |

## Referências entregues

- `PILOTO_001_CRITICAL_FLOW_MAP.md`
- `PILOTO_001_ACCEPTANCE_CRITERIA.md`
- `PILOTO_001_TEST_COVERAGE_MATRIX.md`
- `pilot-templates/` com cinco checklists manuais para bar/evento.

## Regressão final

| Gate | Resultado |
| --- | --- |
| Node | 44/44 PASS |
| SQL local | 8/8 PASS |
| Adversarial local | 6/6 PASS |
| Concurrency local | 12/12 PASS |
| TypeScript | PASS |
| Build | PASS |
| Lint | PASS: 0 erros, 7 avisos conhecidos |
| `git diff --check` | PASS |
| Runtime audit | PASS: 0 vulnerabilidades |
| Release gate | PASS |
| Rollout precheck | PASS, local only |

## Veredito

**B — READY WITH NON-BLOCKING GAPS.** A correção reforça caminhos operacionais reais e a documentação/cobertura cresceu sem mascarar E2E browser bloqueado. Remote access: **BLOCKED**. Remote write: **ZERO**.

Confirmação: ZERO REMOTE SQL, ZERO REMOTE MIGRATION, ZERO REMOTE DATA CHANGE, ZERO AUTH/STORAGE REMOTE CHANGE, ZERO DEPLOY e ZERO PUSH.
