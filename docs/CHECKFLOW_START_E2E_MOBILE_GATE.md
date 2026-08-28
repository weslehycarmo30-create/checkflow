# CheckFlow Start — E2E Mobile Gate

Data: 2026-08-27
Branch: `codex/checkflow-start-e2e-mobile`
SHA inicial: `54fdc76`

## Status

**PILOT READY**

O P1 da fotografia foi corrigido, coberto por regressão e o fluxo completo passou em Chrome real, com Supabase exclusivamente local.

## Harness

- Scripts Bash/`pipefail` foram substituídos por caminhos Node cross-platform em `scripts/run-local.mjs` e `scripts/build-verified.mjs`.
- O caminho E2E reproduzível no Windows é `vinext dev --hostname 127.0.0.1 --port 3000`.
- Chrome real: `C:\Program Files\Google\Chrome\Application\chrome.exe`.
- Playwright Core está configurado como `playwright-core` 1.58.2.
- `vinext start` continua com ressalva de tooling: o servidor deriva chaves de assets com separadores `\\` no Windows, enquanto as URLs usam `/`. Não foi alterado nesta missão; `vinext dev` é o caminho estável do gate.
- Foram usados somente `127.0.0.1:54321` e banco local descartável. Não houve `supabase link`, `--linked`, `db push`, deploy ou acesso remoto.

## P1 da fotografia

### Reprodução e causa raiz

Em 360px, após upload válido, o Playwright reportou que `.detail-message` interceptava o clique normal de `Finalizar checklist`. A causa foi o feedback de fotografia com posicionamento fixo cobrindo a área do CTA e aceitando pointer events.

### Correção mínima

`app/globals.css` passou a aplicar `pointer-events:none` ao feedback `.detail-message`. A mensagem continua visível e informativa, mas não intercepta controles essenciais.

Regressão: `tests/photo-feedback-regression.test.mjs` verifica a regra não bloqueante; o E2E comprova o upload, a presença do feedback e o clique real em `Finalizar checklist`, sem `force:true`.

## Ambiente e migrations

Stack local descartável iniciado em `127.0.0.1`, com storage habilitado. Migrations executadas automaticamente nesta ordem:

1. `202607220001_base_multitenant.sql`
2. `202607230002_hardening_rls_mvp.sql`
3. `202607230003_action_plan_minimal_rls.sql`
4. `202608260001_checkflow_start_p0_provisioning_storage.sql`
5. `202608260002_execution_historical_snapshot.sql`

Fixture local aplicada: `supabase/tests/checkflow_start_e2e_fixture.sql`. Nenhum segredo ou credencial real foi versionado; usuários `@checkflow.test` são fixtures locais.

## Smoke

`tests/checkflow-start-e2e-smoke.mjs` passou em Chrome real: servidor HTTP 200; página e 51 assets funcionais carregados; login visível e interativo; autenticação local funcionando; Supabase local respondendo em `127.0.0.1:54321`.

## E2E completo

`tests/checkflow-start-e2e-mobile.mjs`: **31/31 checks PASS**.

- Owner: login, criação/configuração de checklist e atribuição ao Executor.
- Executor: login mobile, início, respostas, observação, fotografia válida, fotografia inválida sem falso sucesso, NÃO OK, pausa, reload/interrupção, retomada, persistência e conclusão.
- Manager/Gestão: visualização da falha, não conformidade, plano de ação com responsável e prazo, correção fotográfica do Executor, aprovação e acompanhamento.
- Histórico: execução concluída acessível; snapshot V1 mostra `Temperatura conferida` e não recebe `Lacre conferido V2` após alteração do template.
- O template V2 foi visualizado pelo Executor sem exigir uma segunda execução sobre a mesma atribuição já concluída.

Screenshots críticos gerados em `test-results/`: `owner-checklist-360.png`, `executor-completed-360.png`, `manager-history-360.png` e `executor-v2-360.png`. O JSON de resultados não é artefato de release.

## Mobile e persistência

Viewports exercitados: `360x800`, `390x844` e `412x915`.

Em 360px foram exercitados o fluxo operacional completo, upload, feedback não bloqueante, pausa/retomada, reload, conclusão e histórico, sem overflow horizontal. Em 390px e 412px foram validados carregamento do login, legibilidade inicial e ausência de overflow horizontal bloqueante.

A persistência foi comprovada pelo ciclo iniciar → responder parcialmente → salvar → recarregar/interromper → retornar → respostas presentes → continuar → concluir.

## Bugs e limitações

- P0: nenhum conhecido.
- P1: nenhum conhecido que impeça piloto assistido.
- P2 postergado: 404 das fontes Geist no `vinext dev` e o bug de assets do `vinext start` no Windows. O fallback Arial mantém a interface e não bloqueou o fluxo; não são parte da correção funcional desta missão.

## Validação técnica

- `npm test`: PASS, 22/22.
- `npx tsc --noEmit`: PASS.
- `npm run build`: PASS, com artefato Worker validado.
- `npm run lint`: PASS.
- `git diff --check`: PASS.
- Smoke Playwright: PASS.
- E2E Chrome real: PASS, 31/31.
- Testes SQL de integridade histórica V1/V2 existentes permanecem cobertos pelos testes do projeto; a UI histórica também foi comprovada no browser.

## Respostas obrigatórias

1. Harness reproduzível no Windows? **Sim, pelo caminho `vinext dev` + Chrome real + Supabase local.**
2. Fluxo completo em navegador real? **Sim, Chrome real, 31/31.**
3. Executor consegue operar pelo celular? **Sim, comprovado em 360px; 390/412 também passaram as validações responsivas.**
4. Gestor identifica falha, atribui correção e consulta evidência/histórico? **Sim.**
5. Existe P0 conhecido? **Não.**
6. Existe P1 que inviabilize piloto assistido? **Não.**
7. CHECKFLOW START está tecnicamente PILOT READY? **Sim.**
