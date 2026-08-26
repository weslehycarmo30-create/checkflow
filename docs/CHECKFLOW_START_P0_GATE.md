# CHECKFLOW START — Gate P0 de baseline, provisionamento e evidências

Data da auditoria: 2026-08-26
Branch: `codex/checkflow-start-p0`
Baseline oficial: `eee7c64f36959284a12a5b06bc433b3358809fbd` (`origin/main`)
Release candidate de código: `0fb62c5f195b435b81899520fd1a233d2d46e87a` (`feat(checkflow-start): secure team provisioning and evidence storage`).

## Reproduzir a baseline

```powershell
git fetch origin
git switch --detach eee7c64f36959284a12a5b06bc433b3358809fbd
git status -sb
```

A baseline foi confirmada com `main` e `origin/main` no mesmo SHA. Nenhum `pull`, merge, push para `main`, `supabase link`, `db push`, deploy de função ou mudança em Supabase remoto foi feito neste gate.

## Migrations exigidas

Aplicar somente na ordem abaixo, em ambiente local ou de homologação explicitamente autorizado:

1. `202607220001_base_multitenant.sql`
2. `202607230002_hardening_rls_mvp.sql`
3. `202607230003_action_plan_minimal_rls.sql`
4. `202608260001_checkflow_start_p0_provisioning_storage.sql`

A migration P0 é forward-only. Ela troca as policies amplas do bucket privado `checkflow-evidence` por regras que exigem a relação entre o caminho e uma execução/item do executor, ou um plano de ação do responsável. Ela também remove a deleção de evidências para usuários da aplicação, preservando o registro do piloto.

Estado testado das migrations nesta estação: revisão estática de todas as quatro; execução em banco local pendente porque Docker não está disponível. Não há evidência, nesta cópia do repositório, de quais migrations foram aplicadas em qualquer ambiente remoto.

## Modelo de acesso encontrado

Papéis existentes no schema: `owner`, `manager`, `collaborator`. Neste documento, `collaborator` é o executor operacional; nenhum papel novo foi criado.

| Capacidade | Estado | Evidência / limite |
| --- | --- | --- |
| Autenticação e perfil | IMPLEMENTADA | Supabase Auth e trigger `handle_new_user`; cadastro normal cria a organização inicial do owner. |
| Organização e membership | IMPLEMENTADA COM RESSALVA | RLS exige membership ativa; a interface usa uma única membership ativa. |
| Convite/provisionamento | IMPLEMENTADA | Worker valida sessão, deriva tenant no servidor, owner convida manager/executor e manager somente executor. Exige segredo server-side configurado fora do repositório. |
| Checklist, atribuição e execução | IMPLEMENTADA | Migrations e rotas existentes; trigger valida tenant, executor e atribuição ativa. |
| Respostas, não conformidade e plano | IMPLEMENTADA | Fluxo e migrations existentes; validações de vínculos e atualização restrita do responsável. |
| Foto/evidência | IMPLEMENTADA COM RESSALVA | Bucket privado, upload por caminho controlado e URL assinada no cliente. Teste real de Storage local ainda está pendente. |
| Histórico | PARCIAL | Tela e consultas existem; este gate não auditou integridade histórica além das relações atuais. |
| RLS e migrations | IMPLEMENTADA COM RESSALVA | Código e policies auditados; aplicação efetiva em um banco permanece não comprovada. |

## Provisionamento aprovado para o Start

`POST /api/team-invitations` recebe somente e-mail e papel permitido. O navegador envia o token da sessão, nunca `organization_id` nem chave de serviço. O Worker:

1. valida a sessão com a chave pública;
2. busca a única membership ativa do solicitante usando o segredo server-side;
3. aceita apenas `owner` ou `manager`;
4. permite ao owner convidar `manager` ou `collaborator`, e ao manager somente `collaborator`;
5. cria o convite no Auth e a membership no tenant derivado no passo 2.

RLS mantém `organization_members` modificável somente por owner. Assim executor não se promove, manager não cria/promoção owner, usuário sem membership ativa não opera e usuário inativo perde acesso. A chave `SUPABASE_SERVICE_ROLE_KEY` existe apenas como segredo do Worker; não está em `.env.example`, código de browser ou resposta HTTP.

### Reconciliação da branch de convites

Branch analisada: `origin/codex/fluxo-cliente001-convite`, commits `c834087`, `3f74873`, `77c2477`.

| Arquivo/alteração | Avaliação | Decisão |
| --- | --- | --- |
| `app/team-management.tsx` | Lista membros e oferece UI mínima, mas somente owner/colaborador. | Adaptado: suporta owner e manager, papel real e mensagem de limite. |
| `app/page.tsx` | Liga a área de equipe já existente. | Reutilizado de forma seletiva. |
| `worker/index.ts` | Arquitetura server-side correta em princípio, mas assumia `invite.id` em vez de `invite.user.id`, aceitava apenas owner e não tratava limites de manager. | Adaptado e coberto por teste comportamental do Worker. |
| `.env.example` | Declarava chave de serviço junto das variáveis públicas. | Descartado: segredo deve ser configurado somente no ambiente do Worker. |
| Documentos da branch | Relato histórico útil, mas não representa este gate nem suas policies. | Descartados. |

## Política de evidência fotográfica

O bucket continua privado. Não há URL pública. Uma URL assinada só é emitida após a operação de leitura ser autorizada pela policy.

| Ator | Execução / item | Plano de ação |
| --- | --- | --- |
| Owner ou manager ativo do tenant | Lê e envia quando a execução, item e tenant do caminho existem. | Lê e envia quando o plano pertence ao tenant. |
| Executor ativo | Lê e envia apenas no próprio `organization/execution/item/arquivo`. | Lê e envia apenas no próprio `organization/action-plans/plan/arquivo`. |
| Colaborador do mesmo tenant sem relação | Sem leitura e sem upload. | Sem leitura e sem upload. |
| Tenant externo, inativo ou sem membership | Sem leitura e sem upload. | Sem leitura e sem upload. |

O caminho precisa conter UUIDs existentes da organização, execução e item, ou organização, literal `action-plans` e plano. Caminhos arbitrários e vínculos cross-tenant são rejeitados. Usuários da aplicação não possuem policy de delete; a remoção exige procedimento administrativo posterior, fora deste gate, para não apagar evidência registrada.

## Testes e validação

Teste automatizado novo: `tests/team-invitations.test.mjs` exerce o Worker compilado com respostas simuladas do Supabase. Cobre derivação de tenant no servidor, convite owner→manager e negativas manager→manager / executor→convite. `npm test` agora executa todos os `tests/*.test.mjs` após o build.

Teste comportamental de banco preparado: `supabase/tests/checkflow_start_p0_behavior.sql`. Ele usa Tenant A/B, owner, manager, executor, membro não relacionado, usuário inativo e usuário sem membership. Cobre leitura própria, isolamento A/B, promoção indevida, upload autorizado, same-tenant não autorizado, Storage de plano de ação e relação cross-tenant.

Antes de executá-lo, confirmar explicitamente que a stack é local:

```powershell
supabase status
# O endpoint exibido precisa ser http://localhost... ou http://127.0.0.1...
docker ps --format '{{.Names}}'
# Escolha apenas o container local supabase_db_* correspondente.
```

Somente após essa confirmação, executar o SQL no container local e preservar a saída. O script começa com `BEGIN` e termina em `ROLLBACK`.

Nesta estação, Docker não estava acessível e não existe `supabase/config.toml`; por isso o teste de banco, o teste de signed URL contra Storage API e a prova de migrations aplicadas estão pendentes. Não declarar esses cenários como aprovados sem essa execução.

## Registro de release

| Campo | Registro |
| --- | --- |
| Base | `eee7c64f36959284a12a5b06bc433b3358809fbd` |
| Código do RC | `0fb62c5f195b435b81899520fd1a233d2d46e87a` |
| Schema requerido | as quatro migrations listadas acima |
| Schema executado/testado | não executado nesta estação; teste local pendente |
| Ambiente validado | revisão local Windows; Node/Supabase CLI presentes, Docker indisponível |
| Ambiente remoto | não acessado |

## Pendências para o próximo gate

- Subir uma stack Supabase local explicitamente em `localhost`/`127.0.0.1`, aplicar as quatro migrations e executar a matriz SQL sem modificar remoto.
- Confirmar no ambiente de homologação autorizado quais migrations estão aplicadas e repetir a matriz por credenciais reais.
- Validar o convite contra a resposta real da versão de Supabase usada pelo ambiente e o e-mail de convite.
- O Gate de integridade histórica permanece fora de escopo e não foi iniciado.
