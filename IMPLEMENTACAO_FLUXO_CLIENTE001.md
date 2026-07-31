# Implementação do fluxo Cliente 001

## Arquivos alterados

- `app/team-management.tsx`: tela mínima para owner listar membros e enviar convite.
- `app/page.tsx`: monta a tela na opção existente **Equipe e unidades**.
- `worker/index.ts`: endpoint `POST /api/team-invitations`.
- `.env.example`: declara `SUPABASE_SERVICE_ROLE_KEY` para o ambiente do Worker.

## Decisões técnicas

Não foi criada migration. `organization_members`, `profiles`, os papéis e RLS já existem. O Worker valida o token do solicitante, confirma que ele é owner da organização e só então usa a chave de serviço privada para convidar o e-mail e inserir o membership como `collaborator` na mesma organização.

A chave de serviço permanece no Worker; o navegador continua usando somente a chave pública existente. O fluxo de atribuição e a execução do colaborador já existentes passam a usar o membership criado: a tela de checklist lista colaboradores ativos e a rota de execução filtra a atribuição pelo usuário autenticado.

## Evidências do fluxo

1. Owner abre **Equipe e unidades**, informa e-mail e envia `POST /api/team-invitations` com sua sessão.
2. O Worker consulta `organization_members` para exigir `role=owner` e `active=true`.
3. O Worker chama o endpoint de convite do Supabase Auth e grava `organization_members` com `role: "collaborator"` e o `organization_id` do owner.
4. A tela recarrega a lista de membros da organização.
5. `app/checklists/[id]/checklist-detail.tsx` já busca colaboradores ativos dessa mesma organização para atribuição.
6. `app/page.tsx` e `app/executions/[assignmentId]/checklist-execution.tsx` já filtram a visualização/executação pelas atribuições do colaborador autenticado.

## Limitações e pendências

- Exige `SUPABASE_SERVICE_ROLE_KEY` configurada como segredo no ambiente do Worker; sem ela o endpoint retorna 503.
- O convite é para novo usuário do Supabase Auth; tratamento de e-mail já existente não foi ampliado.
- Não foi possível executar E2E contra Supabase nesta estação sem credenciais/alteração de ambiente.
- Não há gestão avançada de equipes, remoção, edição de papel ou unidades.

## Testes realizados

- `npx tsc --noEmit`: aprovado.
- `node --test tests/*.test.mjs`: 17 aprovados, 0 falhos.
- Cobertura: não há métrica de cobertura configurada; os testes existentes preservaram aprovação. O endpoint novo foi validado por TypeScript e inspeção de fluxo, sem teste de integração remoto.
