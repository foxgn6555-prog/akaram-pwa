-- ═══════════════════════════════════════════════════════════════
-- 00003 · الأدوار والصلاحيات + Custom Access Token Hook
-- المصدر الوحيد للحقيقة: user_roles (قد يملك الموظف أكثر من دور)
-- JWT يحمل "الدور الأساسي" فقط — التبديل بين البوابات يقرأ user_roles.
-- ═══════════════════════════════════════════════════════════════

create table public.user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in (
               'employee', 'hr_officer', 'department_manager',
               'finance_officer', 'it_admin', 'super_admin')),
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  unique (user_id, role)
);

comment on table public.user_roles is 'الأدوار النظامية — قد يملك المستخدم عدة أدوار (بوابات متعددة)';

alter table public.user_roles enable row level security;

-- المستخدم يرى أدواره هو فقط
create policy "user_roles: قراءة أدواري" on public.user_roles
  for select to authenticated
  using (user_id = auth.uid());

-- HR / Super Admin يديران الأدوار (تعيين/سحب)
create policy "user_roles: إدارة بواسطة HR" on public.user_roles
  for all to authenticated
  using (app.has_role(array['hr_officer', 'super_admin']))
  with check (app.has_role(array['hr_officer', 'super_admin']));

create index idx_user_roles_user on public.user_roles (user_id);
create index idx_user_roles_role on public.user_roles (role);

-- ═══════════════════════════════════════════════════════════════
-- Custom Access Token Hook — يُحقن الدور الأساسي في JWT عند كل login/refresh
-- (أولوية الدور: super_admin > it_admin > finance_officer > hr_officer
--  > department_manager > employee)
-- ═══════════════════════════════════════════════════════════════
create or replace function app.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claims    jsonb;
  user_role text;
begin
  select role into user_role
  from public.user_roles
  where user_id = (event ->> 'user_id')::uuid
  order by array_position(array[
    'super_admin', 'it_admin', 'finance_officer',
    'hr_officer', 'department_manager', 'employee'
  ], role)
  limit 1;

  claims = coalesce(event -> 'claims', '{}'::jsonb);
  claims = jsonb_set(claims, '{role}', to_jsonb(coalesce(user_role, 'employee')));

  return jsonb_set(event, '{claims}', claims);
end;
$$;

revoke all on function app.custom_access_token_hook from public, anon, authenticated;
grant execute on function app.custom_access_token_hook to supabase_auth_admin;
