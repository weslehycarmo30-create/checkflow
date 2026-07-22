# Instalação do Supabase — CheckFlow

## 1. Criar ou abrir o projeto

1. Entre em [supabase.com/dashboard](https://supabase.com/dashboard).
2. Abra o projeto do CheckFlow. Se ainda não existir, clique em **New project**, escolha a organização, informe nome, senha forte do banco e região próxima do Brasil.
3. Em **Project Settings → API**, copie **Project URL**.
4. Na mesma tela, copie a chave pública **Publishable key**. Em projetos antigos, use a chave pública `anon`.

## 2. Configurar o aplicativo

Use `.env.example` como referência. No ambiente hospedado configure:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` é aceito apenas como compatibilidade. Nunca coloque `service_role` no frontend ou no repositório.

## 3. Aplicar as migrações

Ordem atual:

1. `supabase/migrations/202607220001_base_multitenant.sql`

No painel Supabase:

1. Clique em **SQL Editor**.
2. Clique em **New query**.
3. Abra o arquivo da migração no repositório, copie todo o conteúdo e cole no editor.
4. Clique em **Run** uma única vez.
5. Confirme que aparece **Success. No rows returned**. A migração é protegida contra duplicação e pode ser reaplicada para corrigir funções e políticas.

## 4. Validar tabelas, funções e bucket

1. Em **Table Editor**, confirme as tabelas `organizations`, `profiles`, `organization_members`, `units`, `teams`, `checklists`, `checklist_sections`, `checklist_items`, `checklist_assignments`, `checklist_executions`, `execution_answers`, `attachments`, `non_conformities`, `action_plans` e `audit_logs`.
2. Em **Database → Functions**, confirme `handle_new_user`, `is_org_member`, `has_org_role` e `set_updated_at`.
3. Em **Storage**, confirme o bucket privado `checkflow-evidence`.
4. Em **Authentication → Policies** ou no Table Editor, confirme que RLS está habilitado nas tabelas públicas.

## 5. Configurar autenticação

1. Acesse **Authentication → Providers → Email**.
2. Mantenha **Enable Email provider** ativado.
3. Para produção, mantenha **Confirm email** ativado.
4. Em **Authentication → URL Configuration**, use a URL publicada do CheckFlow como **Site URL**.
5. Em **Redirect URLs**, adicione:
   - `https://SEU-DOMINIO/auth`
   - `https://SEU-DOMINIO/auth?mode=reset`
   - durante homologação local, `http://localhost:3000/auth` e `http://localhost:3000/auth?mode=reset`.

## 6. Criar o primeiro proprietário

1. Abra `/auth` no aplicativo.
2. Clique em **Criar empresa**.
3. Informe nome, empresa, e-mail e uma senha com pelo menos oito caracteres.
4. Confirme o e-mail recebido.
5. Faça login.
6. No Table Editor, confira: um registro em `profiles`, uma organização em `organizations` e um vínculo `owner` em `organization_members`.

O gatilho `on_auth_user_created` cria a organização e torna o primeiro usuário proprietário quando `organization_name` é enviado pelo cadastro.

## 7. Validação inicial de RLS

Antes de homologar, crie duas organizações com usuários diferentes. Com a sessão de cada usuário, teste leitura, inserção, alteração e exclusão. Um usuário nunca deve receber registros da outra organização. O bucket exige que o primeiro segmento do caminho seja o UUID da organização, por exemplo: `ORGANIZATION_ID/executions/EXECUTION_ID/foto.jpg`.

Os testes automatizados do repositório validam a presença estrutural das tabelas, RLS, bucket privado e ausência de `service_role`. A validação real de comportamento exige a migração aplicada e usuários de teste autenticados.
