-- Dados comerciais opcionais da organização. A policy existente
-- organizations_owner_update mantém UPDATE restrito ao proprietário.
alter table public.organizations
  add column if not exists commercial_email text,
  add column if not exists whatsapp text,
  add column if not exists instagram text,
  add column if not exists phone text,
  add column if not exists address text;
