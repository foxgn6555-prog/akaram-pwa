-- 00229 — الجولة 00259: بوابة «المتابعة» (دور follow_up)
-- حساب من التطوير المركزية يُسند إلى مناطق متعددة أو قاطع كامل (أو أكثر)؛ يرى متعهدي نطاقه وعددهم اليومي ويكتب عدده (جهة follow_up).
-- متابعة الحاويات في الجولة التالية (00260).

-- ═══ 1) الدور ═══
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in (
    'employee', 'hr_officer', 'department_manager',
    'finance_officer', 'it_admin', 'super_admin',
    'field_ops', 'admin_ops', 'maintenance', 'transfer_station',
    'executive_director', 'deputy_director', 'ops_room',
    'disclosures_officer', 'complaints_officer', 'media_officer',
    'central_garage_officer', 'follow_up'
  ) or role like 'portal:%');

create or replace function app.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare claims jsonb; user_role text;
begin
  select role into user_role
  from public.user_roles
  where user_id = (event ->> 'user_id')::uuid
  order by array_position(array[
    'super_admin', 'it_admin', 'executive_director', 'deputy_director',
    'ops_room', 'finance_officer', 'hr_officer', 'admin_ops',
    'field_ops', 'follow_up', 'maintenance', 'transfer_station', 'disclosures_officer',
    'complaints_officer', 'media_officer', 'central_garage_officer',
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

create or replace function app.set_user_role(p_user_id uuid, p_role text, p_grant boolean, p_actor uuid default null)
returns void language plpgsql security definer set search_path = public, app
as $$
declare
  v_is_dynamic boolean := p_role like 'portal:%';
  v_actor uuid := coalesce(p_actor, auth.uid());
begin
  if v_actor is null or not exists (select 1 from public.user_roles ur where ur.user_id = v_actor and ur.role = any(array['it_admin', 'super_admin', 'hr_officer'])) then
    raise exception 'USERS_FORBIDDEN: لا تملك صلاحية تعديل الأدوار';
  end if;
  if not v_is_dynamic and p_role not in (
    'employee', 'hr_officer', 'department_manager',
    'finance_officer', 'it_admin', 'super_admin',
    'field_ops', 'admin_ops', 'maintenance', 'transfer_station',
    'executive_director', 'deputy_director', 'ops_room',
    'disclosures_officer', 'complaints_officer', 'media_officer',
    'central_garage_officer', 'follow_up'
  ) then
    raise exception 'ROLE_INVALID: دور غير معروف';
  end if;
  if v_is_dynamic and not exists (select 1 from public.dynamic_portals where 'portal:' || slug = p_role and is_active) then
    raise exception 'ROLE_INVALID: البوابة الديناميكية غير موجودة';
  end if;
  if p_user_id = v_actor then raise exception 'SELF_MODIFY_FORBIDDEN: لا يمكنك تعديل أدوارك بنفسك'; end if;
  if p_grant then
    insert into public.user_roles (user_id, role, granted_by) values (p_user_id, p_role, v_actor) on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles where user_id = p_user_id and role = p_role;
  end if;
  insert into public.audit_logs(table_name, record_id, operation, new_row, actor_id, actor_role)
  values ('user_roles', p_user_id::text, case when p_grant then 'INSERT' else 'DELETE' end, jsonb_build_object('role', p_role, 'granted', p_grant), v_actor, app.current_role());
end;
$$;

-- ═══ 2) ملف المتابعة: قواطع كاملة و/أو مناطق محددة ═══
create table if not exists public.follow_up_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  parent_sectors text[] not null default '{}',     -- قاطع كامل (karrada / zaafaraniya)
  sector_ids smallint[] not null default '{}',     -- مناطق محددة
  is_active boolean not null default true,
  notes text,
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(parent_sectors) + cardinality(sector_ids) > 0)
);
alter table public.follow_up_profiles enable row level security;
drop policy if exists "follow_up_profiles: read" on public.follow_up_profiles;
create policy "follow_up_profiles: read" on public.follow_up_profiles for select to authenticated
  using (user_id = auth.uid() or app.has_role(array['it_admin','ops_room','super_admin']));

-- المناطق الفعلية لنطاق المتابع (اتحاد القواطع الكاملة + المناطق المحددة)
create or replace function app.follow_up_sectors(p_user uuid default auth.uid()) returns smallint[]
language sql stable security definer set search_path = public, app as $$
  select coalesce(array_agg(distinct s.id order by s.id), '{}'::smallint[])
  from public.follow_up_profiles f
  join public.sectors s on (s.parent_sector = any(f.parent_sectors) or s.id = any(f.sector_ids))
  where f.user_id = p_user and f.is_active
$$;
revoke all on function app.follow_up_sectors(uuid) from public, anon;

create or replace function app.require_follow_up() returns public.follow_up_profiles
language plpgsql stable security definer set search_path = public, app as $$
declare f public.follow_up_profiles;
begin
  if auth.uid() is null or not app.has_role(array['follow_up','super_admin']) then raise exception 'FOLLOW_UP_FORBIDDEN'; end if;
  select * into f from public.follow_up_profiles where user_id = auth.uid() and is_active;
  if f.user_id is null then raise exception 'FOLLOW_UP_NOT_ASSIGNED'; end if;
  return f;
end$$;
revoke all on function app.require_follow_up() from public, anon;

-- ═══ 3) التطوير المركزية: الإسناد ═══
create or replace function public.follow_up_assign(p_user_id uuid, p_parent_sectors text[] default '{}', p_sector_ids smallint[] default '{}', p_notes text default null)
returns public.follow_up_profiles language plpgsql security definer set search_path = public, app as $$
declare f public.follow_up_profiles; ps text[] := coalesce(p_parent_sectors, '{}'); ss smallint[] := coalesce(p_sector_ids, '{}');
begin
  perform app.require_it();
  if not exists (select 1 from public.user_roles ur where ur.user_id = p_user_id and ur.role = 'follow_up') then raise exception 'FOLLOW_UP_ROLE_REQUIRED'; end if;
  if cardinality(ps) + cardinality(ss) = 0 then raise exception 'FOLLOW_UP_SCOPE_REQUIRED'; end if;
  if exists (select 1 from unnest(ps) x where x not in ('karrada','zaafaraniya')) then raise exception 'FOLLOW_UP_PARENT_INVALID'; end if;
  if exists (select 1 from unnest(ss) x where not exists (select 1 from public.sectors s where s.id = x)) then raise exception 'FOLLOW_UP_SECTOR_INVALID'; end if;
  insert into public.follow_up_profiles (user_id, parent_sectors, sector_ids, is_active, notes, assigned_by)
  values (p_user_id, (select coalesce(array_agg(distinct x order by x), '{}') from unnest(ps) x), (select coalesce(array_agg(distinct x order by x), '{}') from unnest(ss) x), true, nullif(trim(coalesce(p_notes,'')),''), auth.uid())
  on conflict (user_id) do update set parent_sectors = excluded.parent_sectors, sector_ids = excluded.sector_ids, is_active = true, notes = excluded.notes, assigned_by = auth.uid(), assigned_at = now(), updated_at = now()
  returning * into f;
  insert into public.contractor_audit_log(actor_id, action, contractor_user_id, after_data) values (auth.uid(), 'follow_up_assign', p_user_id, to_jsonb(f));
  return f;
end$$;
revoke all on function public.follow_up_assign(uuid, text[], smallint[], text) from public, anon;
grant execute on function public.follow_up_assign(uuid, text[], smallint[], text) to authenticated;

create or replace function public.follow_up_unassign(p_user_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, app as $$
begin
  perform app.require_it();
  if length(trim(coalesce(p_reason,''))) < 2 then raise exception 'FOLLOW_UP_REASON_REQUIRED'; end if;
  update public.follow_up_profiles set is_active = false, updated_at = now() where user_id = p_user_id and is_active;
  if not found then raise exception 'FOLLOW_UP_NOT_ASSIGNED'; end if;
  insert into public.contractor_audit_log(actor_id, action, contractor_user_id, reason) values (auth.uid(), 'follow_up_unassign', p_user_id, trim(p_reason));
end$$;
revoke all on function public.follow_up_unassign(uuid, text) from public, anon;
grant execute on function public.follow_up_unassign(uuid, text) to authenticated;

create or replace function public.follow_up_profile_for_user(p_user_id uuid)
returns table(user_id uuid, parent_sectors text[], sector_ids smallint[], is_active boolean, scope_label text, areas_count int, assigned_at timestamptz)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if auth.uid() is null or not (auth.uid() = p_user_id or app.has_role(array['it_admin','ops_room','super_admin'])) then raise exception 'IT_FORBIDDEN'; end if;
  return query
  select f.user_id, f.parent_sectors, f.sector_ids, f.is_active,
    concat_ws(' + ',
      nullif((select string_agg(app.parent_sector_name(x) || ' (كامل)', '، ' order by x) from unnest(f.parent_sectors) x), ''),
      nullif((select string_agg(s.name, '، ' order by s.name) from public.sectors s where s.id = any(f.sector_ids)), '')),
    cardinality(app.follow_up_sectors(f.user_id)), f.assigned_at
  from public.follow_up_profiles f where f.user_id = p_user_id;
end$$;
revoke all on function public.follow_up_profile_for_user(uuid) from public, anon;
grant execute on function public.follow_up_profile_for_user(uuid) to authenticated;

-- خيارات الإسناد: القواطع ومناطقها (مع متعهد كل منطقة)
create or replace function public.follow_up_scope_options()
returns table(parent_sector text, parent_name text, sector_id smallint, area_name text, contractor_name text)
language plpgsql stable security definer set search_path = public, app as $$
begin
  perform app.require_it();
  return query
  select s.parent_sector, app.parent_sector_name(s.parent_sector), s.id, s.name,
    (select app.manager_display_name(cp.user_id) from public.contractor_profiles cp where cp.sector_id = s.id and cp.is_active limit 1)
  from public.sectors s order by s.parent_sector, s.id;
end$$;
revoke all on function public.follow_up_scope_options() from public, anon;
grant execute on function public.follow_up_scope_options() to authenticated;

-- ═══ 4) بوابة المتابعة ═══
create or replace function public.follow_up_me()
returns table(user_id uuid, full_name text, parent_sectors text[], sector_ids smallint[], areas jsonb, areas_count int, contractors_count int,
              today date, today_checked_in int, today_counted_by_me int, month_locked boolean)
language plpgsql stable security definer set search_path = public, app as $$
declare f public.follow_up_profiles; ids smallint[]; d date := app.baghdad_today();
begin
  f := app.require_follow_up(); ids := app.follow_up_sectors(f.user_id);
  return query
  select f.user_id, app.manager_display_name(f.user_id), f.parent_sectors, f.sector_ids,
    coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'parent_sector', s.parent_sector) order by s.id) from public.sectors s where s.id = any(ids)), '[]'::jsonb),
    cardinality(ids),
    (select count(*)::int from public.contractor_profiles cp where cp.is_active and cp.sector_id = any(ids)),
    d,
    (select count(*)::int from public.contractor_checkins c join public.contractor_profiles cp on cp.user_id = c.contractor_user_id and cp.is_active where c.log_date = d and cp.sector_id = any(ids)),
    (select count(*)::int from public.contractor_daily_counts x where x.log_date = d and x.source = 'follow_up' and x.entered_by = f.user_id),
    app.contractor_month_locked(d);
end$$;
revoke all on function public.follow_up_me() from public, anon;
grant execute on function public.follow_up_me() to authenticated;

-- متعهدو نطاقي ليوم: عدد المتعهد (فقط) + عددي + حالة الإثبات
create or replace function public.follow_up_contractors(p_date date default null)
returns table(contractor_user_id uuid, contractor_name text, sector_id smallint, area_name text, parent_sector text, shift text,
              checked_in boolean, checkin_at timestamptz, in_zone boolean, contractor_headcount int, my_headcount int, my_updated_at timestamptz, editable boolean)
language plpgsql stable security definer set search_path = public, app as $$
declare f public.follow_up_profiles; ids smallint[]; d date := coalesce(p_date, app.baghdad_today());
begin
  f := app.require_follow_up(); ids := app.follow_up_sectors(f.user_id);
  return query
  select cp.user_id, app.manager_display_name(cp.user_id), cp.sector_id, s.name, s.parent_sector, cp.shift,
    c.id is not null, c.checked_at, c.in_zone,
    (select x.headcount from public.contractor_daily_counts x where x.contractor_user_id = cp.user_id and x.log_date = d and x.source = 'contractor'),
    (select x.headcount from public.contractor_daily_counts x where x.contractor_user_id = cp.user_id and x.log_date = d and x.source = 'follow_up'),
    (select x.updated_at from public.contractor_daily_counts x where x.contractor_user_id = cp.user_id and x.log_date = d and x.source = 'follow_up'),
    d = app.baghdad_today() and not app.contractor_month_locked(d)
  from public.contractor_profiles cp
  join public.sectors s on s.id = cp.sector_id
  left join public.contractor_checkins c on c.contractor_user_id = cp.user_id and c.log_date = d
  where cp.is_active and cp.sector_id = any(ids)
  order by s.parent_sector, s.id;
end$$;
revoke all on function public.follow_up_contractors(date) from public, anon;
grant execute on function public.follow_up_contractors(date) to authenticated;

create or replace function public.follow_up_set_headcount(p_contractor uuid, p_headcount int)
returns public.contractor_daily_counts language plpgsql security definer set search_path = public, app as $$
declare f public.follow_up_profiles; cp public.contractor_profiles;
begin
  f := app.require_follow_up();
  select * into cp from public.contractor_profiles where user_id = p_contractor and is_active;
  if cp.user_id is null or not (cp.sector_id = any(app.follow_up_sectors(f.user_id))) then raise exception 'FOLLOW_UP_OUT_OF_SCOPE'; end if;
  if p_headcount is null or p_headcount < 0 then raise exception 'CONTRACTOR_COUNT_INVALID'; end if;
  return app.contractor_count_upsert(cp.user_id, app.baghdad_today(), 'follow_up', p_headcount);
end$$;
revoke all on function public.follow_up_set_headcount(uuid, int) from public, anon;
grant execute on function public.follow_up_set_headcount(uuid, int) to authenticated;
