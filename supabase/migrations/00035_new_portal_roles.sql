-- ═══════════════════════════════════════════════════════════════
-- 00035 · توسعة الأدوار: 7 بوابات جديدة (field_ops, admin_ops,
-- maintenance, transfer_station, executive_director, deputy_director,
-- ops_room) — mirror لـ src/lib/constants/roles.constants.ts
-- ═══════════════════════════════════════════════════════════════

-- ① توسعة قيد CHECK في user_roles
alter table public.user_roles drop constraint user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in (
    'employee', 'hr_officer', 'department_manager',
    'finance_officer', 'it_admin', 'super_admin',
    'field_ops', 'admin_ops', 'maintenance', 'transfer_station',
    'executive_director', 'deputy_director', 'ops_room'));

-- ② تحديث أولوية الدور الأساسي في JWT Hook (mirror لـ ROLE_PRIORITY)
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
    'super_admin', 'it_admin', 'executive_director', 'deputy_director',
    'ops_room', 'finance_officer', 'hr_officer', 'admin_ops',
    'field_ops', 'maintenance', 'transfer_station',
    'department_manager', 'employee'
  ], role)
  limit 1;

  claims = coalesce(event -> 'claims', '{}'::jsonb);
  claims = jsonb_set(claims, '{role}', to_jsonb(coalesce(user_role, 'employee')));

  return jsonb_set(event, '{claims}', claims);
end;
$$;

revoke all on function app.custom_access_token_hook from public, anon, authenticated;
grant execute on function app.custom_access_token_hook to supabase_auth_admin;