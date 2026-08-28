-- ═══════════════════════════════════════════════════════════════
-- 00018 · RPCs البوابة التقنية (كلها SECURITY DEFINER بفحص دور صارم)
--  · list_platform_users : عرض المستخدمين + أدوارهم + موظفهم المرتبط
--  · set_user_role       : منح/سحب دور (مع منع تعديل الذات + تدقيق)
--  · db_stats/db_overview: أحجام الجداول وصحة القاعدة
-- إنشاء مستخدم auth نفسه يتم عبر Edge Function admin-users (يحتاج صلاحية admin API)
-- ═══════════════════════════════════════════════════════════════

-- ── قائمة المستخدمين المنصة مع أدوارهم ──
create or replace function app.list_platform_users(p_query text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not app.has_role(array['it_admin', 'super_admin', 'hr_officer']) then
    raise exception 'USERS_FORBIDDEN: إدارة المستخدمين محصورة بـ IT والموارد البشرية';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',               u.id,
      'email',            u.email,
      'created_at',       u.created_at,
      'last_sign_in_at',  u.last_sign_in_at,
      'roles',            coalesce(roles_agg.roles, '[]'::jsonb),
      'employee_name',    e.full_name,
      'employee_number',  e.employee_number
    ) order by u.created_at desc)
    from auth.users u
    left join lateral (
      select jsonb_agg(ur.role order by ur.role) as roles
      from public.user_roles ur
      where ur.user_id = u.id
    ) roles_agg on true
    left join public.employees e on e.user_id = u.id
    where p_query is null
       or u.email ilike '%' || p_query || '%'
       or e.full_name ilike '%' || p_query || '%'
  ), '[]'::jsonb);
end;
$$;

-- ── منح/سحب دور ──
create or replace function app.set_user_role(p_user_id uuid, p_role text, p_grant boolean)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
begin
  if not app.has_role(array['it_admin', 'super_admin', 'hr_officer']) then
    raise exception 'USERS_FORBIDDEN: لا تملك صلاحية تعديل الأدوار';
  end if;

  if p_role not in ('employee', 'hr_officer', 'department_manager',
                    'finance_officer', 'it_admin', 'super_admin') then
    raise exception 'ROLE_INVALID: دور غير معروف';
  end if;

  -- أمان: لا أحد يعدّل أدوار نفسه (منع قفل النظام أو تضليل التدقيق)
  if p_user_id = auth.uid() then
    raise exception 'SELF_MODIFY_FORBIDDEN: لا يمكنك تعديل أدوارك بنفسك';
  end if;

  if p_grant then
    insert into public.user_roles (user_id, role, granted_by)
    values (p_user_id, p_role, auth.uid())
    on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles
    where user_id = p_user_id and role = p_role;
  end if;

  -- تدقيق إلزامي لكل تغيير صلاحيات
  insert into public.audit_logs
    (table_name, record_id, operation, new_row, actor_id, actor_role)
  values
    ('user_roles', p_user_id::text,
     case when p_grant then 'INSERT' else 'DELETE' end,
     jsonb_build_object('role', p_role, 'granted', p_grant),
     auth.uid(), app.current_role());
end;
$$;

-- ── إحصائيات الجداول ──
create or replace function app.db_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not app.has_role(array['it_admin', 'super_admin']) then '[]'::jsonb
    else (
      select coalesce(jsonb_agg(jsonb_build_object(
        'table_name',   relname,
        'row_estimate', greatest(n_live_tup, 0),
        'total_bytes',  pg_total_relation_size(format('%I.%I', schemaname, relname)),
        'seq_scan',     seq_scan,
        'idx_scan',     idx_scan
      ) order by pg_total_relation_size(format('%I.%I', schemaname, relname)) desc), '[]'::jsonb)
      from pg_stat_user_tables
      where schemaname = 'public'
    )
  end;
$$;

-- ── نظرة عامة على صحة القاعدة ──
create or replace function app.db_overview()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not app.has_role(array['it_admin', 'super_admin']) then
      jsonb_build_object('allowed', false)
    else jsonb_build_object(
      'allowed',        true,
      'db_size_bytes',  pg_database_size(current_database()),
      'version',        current_setting('server_version'),
      'started_at',     pg_postmaster_start_time(),
      'tables_count',   (select count(*) from pg_stat_user_tables where schemaname = 'public'),
      'total_rows',     (select coalesce(sum(greatest(n_live_tup, 0)), 0) from pg_stat_user_tables where schemaname = 'public'),
      'open_errors',    (select count(*) from public.app_errors where not resolved)
    )
  end;
$$;

grant execute on function app.list_platform_users(text) to authenticated;
grant execute on function app.set_user_role(uuid, text, boolean)     to authenticated;
grant execute on function app.db_stats()                             to authenticated;
grant execute on function app.db_overview()                          to authenticated;
