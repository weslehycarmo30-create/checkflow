# Piloto 001 — execução remota controlada

Nenhum comando desta página foi executado nesta preparação. A senha é inserida pelo operador em sessão local, nunca em URL, Git ou documentação.

## CHECKPOINT → MIGRATION HISTORY → DRY RUN

**Ação:** execute `node scripts/checkflow-release-gate.mjs`; confirme projeto `fzmzrtthmciaisygajba`, backup/owner e hashes. Depois, em PowerShell, defina `SUPABASE_DB_PASSWORD` somente no processo e execute `supabase migration list --db-url <URL-sem-senha> --output json`.

**Esperado:** HEAD/hashes locais passam; histórico contém somente o baseline e as oito versões estão pendentes, em ordem.

**Stop:** qualquer versão extra, ausente ou diferente; qualquer hash/gate falho. **Recovery:** não escrever; salvar a evidência restrita e reconciliar antes de recomeçar.

## DRY RUN → GO/NO-GO

**Ação:** `supabase db push --dry-run --db-url <URL-sem-senha>` usando a mesma variável de processo.

**Esperado:** enumera exatamente `202609030001` até `202609070004`, nessa ordem.

**Stop:** lista diferente, drift ou falha de autenticação. **Recovery:** nenhuma escrita ocorreu; corrigir o acesso ou a divergência.

## HUMAN AUTHORIZATION REQUIRED → MIGRATIONS

**Ação remota de escrita, somente após autorização humana explícita:** `supabase db push --db-url <URL-sem-senha>`.

**Esperado:** o CLI aplica as migrations em ordem e registra cada uma em `supabase_migrations.schema_migrations`. O CLI interrompe no primeiro erro; não usar SQL Editor para aplicar os arquivos manualmente.

**Stop:** erro, timeout, versão/histórico inesperado. **Recovery:** não executar a próxima migration; preservar saída. Use forward-fix revisado ou restauração autorizada — nunca `migration repair` improvisado.

## POSTFLIGHT → STAGING → SMOKE → HUMAN CANARY → PILOTO 001

**Ação:** execute `supabase/preflight/p1_postflight_remote_read_only.sql` em modo read-only; então staging com fixture de dois tenants, smoke autenticado e o roteiro human canary.

**Esperado:** todos os gates obrigatórios `PASS`; somente seis LEGACY PRE-SNAPSHOT e dois placeholders Storage são exceções documentadas.

**Stop:** qualquer `FAIL`, `REVIEW` sem aceite humano, cross-tenant, duplicidade, referência Storage inválida ou canary falho. **Recovery:** congelar avanço; investigar/forward-fix ou restore sob o owner designado.
