-- ═══════════════════════════════════════════════════════════════
-- 00029 · منظومة الأرشيف — لا حذف فعلي: كل شيء يذهب لمكانه المخصص
--   · أعمدة أرشفة على الجداول التشغيلية الستة
--   · RLS: المؤرشف يختفي من القراءة العادية ويظهر حصرياً لأرشيف IT
--   · RPCs: أرشفة (لماذا) · استعادة · عدادات
--   · app_errors.archived: الأخطاء المغلقة تؤرشف (تتبع تاريخي)
-- ═══════════════════════════════════════════════════════════════

-- ═══ ① أعمدة الأرشفة ═══
alter table public.employees
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users (id),
  add column if not exists archive_reason text;

alter table public.departments
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users (id),
  add column if not exists archive_reason text;

alter table public.branches
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users (id),
  add column if not exists archive_reason text;

alter table public.biometric_devices
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users (id),
  add column if not exists archive_reason text;

alter table public.vehicles
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users (id),
  add column if not exists archive_reason text;

alter table public.dynamic_portals
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users (id),
  add column if not exists archive_reason text;

-- أخطاء التطبيق: أرشفة بدل التلاشي
alter table public.app_errors
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users (id);

create index if not exists idx_employees_archived on public.employees (archived_at) where archived_at is not null;
create index if not exists idx_branches_archived  on public.branches (archived_at)  where archived_at is not null;
create index if not exists idx_devices_archived   on public.biometric_devices (archived_at) where archived_at is not null;
create index if not exists idx_vehicles_archived  on public.vehicles (archived_at) where archived_at is not null;

-- ═══ ② RLS محدث: القراءة العادية تستبعد المؤرشف ═══
-- (نستبدل سياسات select للجداول الشاملة بشرط archived_at is null)
do $$
declare
  t text;
  pol record;
begin
  foreach t in array array['employees','departments','branches','biometric_devices','vehicles','dynamic_portals']
  loop
    -- احذف سياسات select القائمة وأعد إنشاءها بشرط المؤرشف
    for pol in
      select policyname, cmd, roles, qual
      from pg_policies
      where schemaname='public' and tablename=t and cmd='SELECT'
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;
  end loop;
end $$;

-- إعادة إنشاء سياسات SELECT المحدثة (مع استثناء المؤرشف)
create policy "employees: قراءة غير المؤرشف" on public.employees
  for select to authenticated
  using (archived_at is null and (
    user_id = auth.uid()
    or app.has_role(array['hr_officer','finance_officer','it_admin','super_admin'])
    or (app.has_role(array['department_manager'])
        and department_id = app.current_department_id())
  ));

create policy "departments: قراءة غير المؤرشف" on public.departments
  for select to authenticated
  using (archived_at is null);

create policy "branches: قراءة غير المؤرشف" on public.branches
  for select to authenticated
  using (archived_at is null);

create policy "devices: قراءة غير المؤرشف (IT)" on public.biometric_devices
  for select to authenticated
  using (archived_at is null
         and app.has_role(array['it_admin','super_admin']));

create policy "vehicles: قراءة غير المؤرشف" on public.vehicles
  for select to authenticated
  using (archived_at is null);

create policy "portals: قراءة غير المؤرشف" on public.dynamic_portals
  for select to authenticated
  using (archived_at is null);

-- سياسة الأرشيف الحصرية: المؤرشف يظهر حصرياً لـ IT/Super Admin
create policy "employees: أرشيف IT فقط" on public.employees
  for select to authenticated
  using (archived_at is not null and app.has_role(array['it_admin','super_admin']));

create policy "departments: أرشيف IT فقط" on public.departments
  for select to authenticated
  using (archived_at is not null and app.has_role(array['it_admin','super_admin']));

create policy "branches: أرشيف IT فقط" on public.branches
  for select to authenticated
  using (archived_at is not null and app.has_role(array['it_admin','super_admin']));

create policy "devices: أرشيف IT فقط" on public.biometric_devices
  for select to authenticated
  using (archived_at is not null and app.has_role(array['it_admin','super_admin']));

create policy "vehicles: أرشيف IT فقط" on public.vehicles
  for select to authenticated
  using (archived_at is not null and app.has_role(array['it_admin','super_admin']));

create policy "portals: أرشيف IT فقط" on public.dynamic_portals
  for select to authenticated
  using (archived_at is not null and app.has_role(array['it_admin','super_admin']));

-- ═══ ③ أخطاء التطبيق: أرشفة المُغلق ═══
create policy "app_errors: أرشيف IT" on public.app_errors
  for select to authenticated
  using (archived_at is not null and app.has_role(array['it_admin','super_admin']));

-- ═══ ④ دوال الأرشفة والاستعادة ═══
create or replace function app.archive_record(
  p_table text, p_id text, p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_allowed text[] := array['employees','departments','branches',
                            'biometric_devices','vehicles','dynamic_portals'];
begin
  if not app.has_role(array['it_admin','super_admin','hr_officer']) then
    raise exception 'ARCHIVE_FORBIDDEN: الأرشفة محصورة بالإدارات';
  end if;
  if not (p_table = any (v_allowed)) then
    raise exception 'ARCHIVE_INVALID_TABLE: جدول غير مؤرشف';
  end if;

  execute format(
    'update public.%I set archived_at = now(), archived_by = $1, archive_reason = $2
     where id = $3::uuid and archived_at is null', p_table)
  using auth.uid(), p_reason, p_id;

  insert into public.audit_logs (table_name, record_id, operation, new_row, actor_id, actor_role)
  values (p_table, p_id, 'ARCHIVE',
          jsonb_build_object('reason', p_reason), auth.uid(), app.current_role());
  return true;
end;
$$;

create or replace function app.archive_restore(p_table text, p_id text)
returns boolean
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_allowed text[] := array['employees','departments','branches',
                            'biometric_devices','vehicles','dynamic_portals'];
begin
  if not app.has_role(array['it_admin','super_admin']) then
    raise exception 'RESTORE_FORBIDDEN: الاستعادة محصورة بـ IT';
  end if;
  if not (p_table = any (v_allowed)) then
    raise exception 'ARCHIVE_INVALID_TABLE';
  end if;

  execute format(
    'update public.%I set archived_at = null, archived_by = null, archive_reason = null
     where id = $1::uuid and archived_at is not null', p_table)
  using p_id;

  insert into public.audit_logs (table_name, record_id, operation, actor_id, actor_role)
  values (p_table, p_id, 'RESTORE', auth.uid(), app.current_role());
  return true;
end;
$$;

-- عدادات الأرشيف (للوحة الأرشيف)
create or replace function app.archive_counts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not app.has_role(array['it_admin','super_admin','hr_officer']) then '[]'::jsonb
    else (
      select coalesce(jsonb_agg(jsonb_build_object(
        'table', t.name, 'count', t.cnt
      ) order by t.cnt desc), '[]'::jsonb)
      from (
        select 'employees' as name, count(*) as cnt from public.employees where archived_at is not null
        union all select 'departments', count(*) from public.departments where archived_at is not null
        union all select 'branches', count(*) from public.branches where archived_at is not null
        union all select 'biometric_devices', count(*) from public.biometric_devices where archived_at is not null
        union all select 'vehicles', count(*) from public.vehicles where archived_at is not null
        union all select 'dynamic_portals', count(*) from public.dynamic_portals where archived_at is not null
        union all select 'app_errors', count(*) from public.app_errors where archived_at is not null
      ) t
    )
  end;
$$;

-- ═══ ⑤ RLS app_errors المحدثة: النشط يظهر لـ IT · المؤرشف للأرشيف ═══
drop policy if exists "app_errors: قراءة بواسطة IT" on public.app_errors;
create policy "app_errors: النشط لـ IT" on public.app_errors
  for select to authenticated
  using (archived_at is null and app.has_role(array['it_admin','super_admin']));

revoke all on function app.archive_record(text,text,text) from public, anon, authenticated;
revoke all on function app.archive_restore(text,text)    from public, anon, authenticated;
revoke all on function app.archive_counts()              from public, anon, authenticated;
grant execute on function app.archive_record(text,text,text) to authenticated;
grant execute on function app.archive_restore(text,text)     to authenticated;
grant execute on function app.archive_counts()               to authenticated;
