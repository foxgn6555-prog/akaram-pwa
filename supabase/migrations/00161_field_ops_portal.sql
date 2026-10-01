-- 00161 · بوابة العمليات الميدانية (الجولة 2)
-- العمليات الميدانية تعلو مسؤولي القواطع: نطاقها كل القواطع الأم (الكرادة + الزعفرانية) ولا تتلقى أي بيانات مالية.
-- التصميم: نطاق موحّد app.ops_scope() → مسؤول القاطع = قواطعه، العمليات الميدانية = كل القواطع؛ ودوال 00160 تُعاد كتابتها فوق هذا النطاق
-- (الأسماء ثابتة حتى لا تتأثر بوابة مسؤول القاطع). إضافات: تفصيل لكل قاطع أم، قائمة مسؤولي القواطع، التبليغ يشمل مسؤولي القواطع للعمليات الميدانية.

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'app' and t.typname = 'ops_scope_t') then
    create type app.ops_scope_t as (user_id uuid, parent_sectors text[], is_field_ops boolean);
  end if;
end $$;

-- النطاق: العمليات الميدانية → كل القواطع الأم؛ مسؤول القاطع → قواطعه (SECTOR_MANAGER_NOT_ASSIGNED إن لم تُسنَد)؛ غيرهما → PARENT_SECTOR_MANAGER_FORBIDDEN
create or replace function app.ops_scope() returns app.ops_scope_t
language plpgsql stable security definer set search_path = public, app as $$
declare r app.ops_scope_t; p public.sector_manager_profiles;
begin
  if auth.uid() is null then raise exception 'PARENT_SECTOR_MANAGER_FORBIDDEN'; end if;
  if app.has_role(array['field_ops']) then
    select auth.uid(), coalesce(array_agg(distinct s.parent_sector order by s.parent_sector), '{}'), true into r from public.sectors s where s.parent_sector is not null;
    return r;
  end if;
  if not app.has_role(array['admin_ops','super_admin']) then raise exception 'PARENT_SECTOR_MANAGER_FORBIDDEN'; end if;
  select * into p from public.sector_manager_profiles where user_id = auth.uid();
  if not found then raise exception 'SECTOR_MANAGER_NOT_ASSIGNED'; end if;
  r.user_id := p.user_id; r.parent_sectors := p.parent_sectors; r.is_field_ops := false;
  return r;
end$$;

create or replace function public.sector_manager_me()
returns table(user_id uuid, full_name text, parent_sectors text[], parent_names text[], areas int, department_managers int, contractors int, employee_id uuid, has_employee boolean)
language plpgsql stable security definer set search_path = public, app as $$
declare p app.ops_scope_t := app.ops_scope();
begin
  return query
  select p.user_id, app.manager_display_name(p.user_id), p.parent_sectors, (select array_agg(app.parent_sector_name(x) order by x) from unnest(p.parent_sectors) x),
    (select count(*)::int from public.sectors s where s.parent_sector = any(p.parent_sectors)),
    (select count(distinct mp.user_id)::int from public.manager_profiles mp join public.sectors s on s.id = any(mp.sectors) where s.parent_sector = any(p.parent_sectors)),
    (select count(*)::int from public.contractor_profiles cp join public.sectors s on s.id = cp.sector_id where cp.is_active and s.parent_sector = any(p.parent_sectors)),
    (select e.id from public.employees e where e.user_id = p.user_id and e.archived_at is null limit 1),
    exists (select 1 from public.employees e where e.user_id = p.user_id and e.archived_at is null);
end$$;

create or replace function public.sector_manager_team()
returns table(manager_user_id uuid, manager_name text, manager_phone text, shift text, parent_sector text, areas jsonb,
              contractors int, workers int, present_today int, absent_today int, presence_proved int, out_of_zone int, vehicles_now int, on_leave_today boolean)
language plpgsql stable security definer set search_path = public, app as $$
declare p app.ops_scope_t := app.ops_scope(); d date := app.baghdad_today();
begin
  return query
  with mgrs as (
    select distinct mp.user_id, mp.shift, mp.sectors, s.parent_sector
    from public.manager_profiles mp join public.sectors s on s.id = any(mp.sectors) where s.parent_sector = any(p.parent_sectors)
  )
  select m.user_id, app.manager_display_name(m.user_id), (select e.phone from public.employees e where e.user_id = m.user_id limit 1), m.shift, m.parent_sector,
    coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'contractor_user_id', cp.user_id, 'contractor_name', app.manager_display_name(cp.user_id),
                 'checked_in', c.id is not null, 'in_zone', c.in_zone,
                 'workers', (select count(*) from public.contractor_workers w where w.contractor_user_id = cp.user_id and w.is_active),
                 'present', (select count(*) from public.contractor_worker_attendance a where a.contractor_user_id = cp.user_id and a.log_date = d and a.status = 'present'),
                 'absent', (select count(*) from public.contractor_worker_attendance a where a.contractor_user_id = cp.user_id and a.log_date = d and a.status = 'absent')) order by s.id)
      from public.sectors s left join public.contractor_profiles cp on cp.sector_id = s.id and cp.manager_user_id = m.user_id and cp.is_active
      left join public.contractor_checkins c on c.contractor_user_id = cp.user_id and c.log_date = d
      where s.id = any(m.sectors) and s.parent_sector = m.parent_sector), '[]'::jsonb),
    (select count(*)::int from public.contractor_profiles cp where cp.manager_user_id = m.user_id and cp.is_active),
    (select count(*)::int from public.contractor_workers w join public.contractor_profiles cp on cp.user_id = w.contractor_user_id and cp.is_active where cp.manager_user_id = m.user_id and w.is_active),
    (select count(*)::int from public.contractor_worker_attendance a join public.contractor_profiles cp on cp.user_id = a.contractor_user_id and cp.is_active where cp.manager_user_id = m.user_id and a.log_date = d and a.status = 'present'),
    (select count(*)::int from public.contractor_worker_attendance a join public.contractor_profiles cp on cp.user_id = a.contractor_user_id and cp.is_active where cp.manager_user_id = m.user_id and a.log_date = d and a.status = 'absent'),
    (select count(*)::int from public.contractor_checkins c join public.contractor_profiles cp on cp.user_id = c.contractor_user_id and cp.is_active where cp.manager_user_id = m.user_id and c.log_date = d),
    (select count(*)::int from public.contractor_checkins c join public.contractor_profiles cp on cp.user_id = c.contractor_user_id and cp.is_active where cp.manager_user_id = m.user_id and c.log_date = d and c.in_zone = false),
    (select count(*)::int from public.garage_departures gd where gd.sector_id = any(m.sectors) and gd.returned_at is null and gd.arrived_at is not null and gd.site_departed_at is null),
    exists (select 1 from public.hr_leaves x join public.employees e on e.id = x.employee_id where e.user_id = m.user_id and x.status = 'approved' and x.kind = 'leave' and d between x.start_date and x.end_date)
  from mgrs m
  order by m.parent_sector, app.manager_display_name(m.user_id);
end$$;

create or replace function public.sector_manager_dashboard() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare p app.ops_scope_t := app.ops_scope(); d date := app.baghdad_today(); r jsonb;
begin
  select jsonb_build_object(
    'is_field_ops', p.is_field_ops,
    'sector_managers', (select coalesce(jsonb_agg(jsonb_build_object('user_id', smp.user_id, 'name', app.manager_display_name(smp.user_id), 'parent_names', (select array_agg(app.parent_sector_name(x) order by x) from unnest(smp.parent_sectors) x)) order by smp.user_id), '[]'::jsonb)
                          from public.sector_manager_profiles smp where smp.parent_sectors && p.parent_sectors),
    'parents_detail', (select coalesce(jsonb_agg(jsonb_build_object('code', x, 'name', app.parent_sector_name(x),
                          'sector_managers', (select string_agg(app.manager_display_name(smp.user_id), '، ') from public.sector_manager_profiles smp where x = any(smp.parent_sectors)),
                          'areas', (select count(*) from public.sectors s where s.parent_sector = x),
                          'department_managers', (select count(distinct mp.user_id) from public.manager_profiles mp join public.sectors s on s.id = any(mp.sectors) where s.parent_sector = x),
                          'contractors', (select count(*) from public.contractor_profiles cp join public.sectors s on s.id = cp.sector_id where cp.is_active and s.parent_sector = x),
                          'areas_without_contractor', (select count(*) from public.sectors s where s.parent_sector = x and not exists (select 1 from public.contractor_profiles cp where cp.sector_id = s.id and cp.is_active)),
                          'present_today', (select count(*) from public.contractor_worker_attendance a join public.sectors s on s.id = a.sector_id where a.log_date = d and a.status = 'present' and s.parent_sector = x),
                          'absent_today', (select count(*) from public.contractor_worker_attendance a join public.sectors s on s.id = a.sector_id where a.log_date = d and a.status = 'absent' and s.parent_sector = x),
                          'presence_proved', (select count(*) from public.contractor_checkins c join public.sectors s on s.id = c.sector_id where c.log_date = d and s.parent_sector = x),
                          'out_of_zone', (select count(*) from public.contractor_checkins c join public.sectors s on s.id = c.sector_id where c.log_date = d and c.in_zone = false and s.parent_sector = x),
                          'vehicles_now', (select count(*) from public.garage_departures gd join public.sectors s on s.id = gd.sector_id where gd.returned_at is null and gd.arrived_at is not null and gd.site_departed_at is null and s.parent_sector = x)) order by x), '[]'::jsonb)
                       from unnest(p.parent_sectors) x),
    'parent_sectors', (select jsonb_agg(jsonb_build_object('code', x, 'name', app.parent_sector_name(x))) from unnest(p.parent_sectors) x),
    'areas', (select count(*) from public.sectors s where s.parent_sector = any(p.parent_sectors)),
    'department_managers', (select count(distinct mp.user_id) from public.manager_profiles mp join public.sectors s on s.id = any(mp.sectors) where s.parent_sector = any(p.parent_sectors)),
    'contractors', (select count(*) from public.contractor_profiles cp join public.sectors s on s.id = cp.sector_id where cp.is_active and s.parent_sector = any(p.parent_sectors)),
    'areas_without_contractor', (select count(*) from public.sectors s where s.parent_sector = any(p.parent_sectors) and not exists (select 1 from public.contractor_profiles cp where cp.sector_id = s.id and cp.is_active)),
    'workers', (select count(*) from public.contractor_workers w join public.contractor_profiles cp on cp.user_id = w.contractor_user_id and cp.is_active join public.sectors s on s.id = cp.sector_id where w.is_active and s.parent_sector = any(p.parent_sectors)),
    'present_today', (select count(*) from public.contractor_worker_attendance a join public.sectors s on s.id = a.sector_id where a.log_date = d and a.status = 'present' and s.parent_sector = any(p.parent_sectors)),
    'absent_today', (select count(*) from public.contractor_worker_attendance a join public.sectors s on s.id = a.sector_id where a.log_date = d and a.status = 'absent' and s.parent_sector = any(p.parent_sectors)),
    'presence_proved', (select count(*) from public.contractor_checkins c join public.sectors s on s.id = c.sector_id where c.log_date = d and s.parent_sector = any(p.parent_sectors)),
    'out_of_zone', (select count(*) from public.contractor_checkins c join public.sectors s on s.id = c.sector_id where c.log_date = d and c.in_zone = false and s.parent_sector = any(p.parent_sectors)),
    'vehicles_now', (select count(*) from public.garage_departures gd join public.sectors s on s.id = gd.sector_id where gd.returned_at is null and gd.arrived_at is not null and gd.site_departed_at is null and s.parent_sector = any(p.parent_sectors)),
    'pending_requests', (select count(*) from public.approval_tasks t join public.hr_leaves l on l.id = t.request_id where t.status = 'pending' and auth.uid() = any(t.approvers) and l.status = 'pending'),
    'managers_on_leave', (select count(distinct e.user_id) from public.hr_leaves x join public.employees e on e.id = x.employee_id join public.manager_profiles mp on mp.user_id = e.user_id join public.sectors s on s.id = any(mp.sectors)
                           where s.parent_sector = any(p.parent_sectors) and x.status = 'approved' and x.kind = 'leave' and d between x.start_date and x.end_date),
    'notices_sent', (select count(*) from public.sector_notices n where n.sender_user_id = auth.uid()),
    'areas_detail', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'parent_sector', s.parent_sector, 'manager_name', app.manager_display_name(cp.manager_user_id),
                        'contractor_name', app.manager_display_name(cp.user_id), 'checked_in', c.id is not null, 'in_zone', c.in_zone,
                        'present', (select count(*) from public.contractor_worker_attendance a where a.sector_id = s.id and a.log_date = d and a.status = 'present'),
                        'absent', (select count(*) from public.contractor_worker_attendance a where a.sector_id = s.id and a.log_date = d and a.status = 'absent'),
                        'vehicles_now', (select count(*) from public.garage_departures gd where gd.sector_id = s.id and gd.returned_at is null and gd.arrived_at is not null and gd.site_departed_at is null)) order by s.parent_sector, s.id), '[]'::jsonb)
                      from public.sectors s left join public.contractor_profiles cp on cp.sector_id = s.id and cp.is_active left join public.contractor_checkins c on c.contractor_user_id = cp.user_id and c.log_date = d
                      where s.parent_sector = any(p.parent_sectors))
  ) into r;
  return r;
end$$;

create or replace function public.sector_manager_reports(p_from date default null, p_to date default null) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare p app.ops_scope_t := app.ops_scope(); f date := coalesce(p_from, app.baghdad_today() - 29); t date := coalesce(p_to, app.baghdad_today()); r jsonb;
begin
  if t < f then raise exception 'HR_DATE_INVALID'; end if;
  select jsonb_build_object(
    'from', f, 'to', t, 'days', (t - f) + 1,
    'totals', jsonb_build_object(
      'present', (select count(*) from public.contractor_worker_attendance a join public.sectors s on s.id = a.sector_id where a.log_date between f and t and a.status = 'present' and s.parent_sector = any(p.parent_sectors)),
      'absent', (select count(*) from public.contractor_worker_attendance a join public.sectors s on s.id = a.sector_id where a.log_date between f and t and a.status = 'absent' and s.parent_sector = any(p.parent_sectors)),
      'presence_proofs', (select count(*) from public.contractor_checkins c join public.sectors s on s.id = c.sector_id where c.log_date between f and t and s.parent_sector = any(p.parent_sectors)),
      'out_of_zone', (select count(*) from public.contractor_checkins c join public.sectors s on s.id = c.sector_id where c.log_date between f and t and c.in_zone = false and s.parent_sector = any(p.parent_sectors)),
      'trips', (select count(*) from public.garage_departures gd join public.sectors s on s.id = gd.sector_id where gd.departed_at::date between f and t and s.parent_sector = any(p.parent_sectors)),
      'manager_leaves', (select count(*) from public.hr_leaves x join public.employees e on e.id = x.employee_id join public.manager_profiles mp on mp.user_id = e.user_id
                          where x.status = 'approved' and x.start_date <= t and x.end_date >= f and exists (select 1 from public.sectors s where s.id = any(mp.sectors) and s.parent_sector = any(p.parent_sectors)))),
    'series', (select coalesce(jsonb_agg(jsonb_build_object('d', dd, 'present', (select count(*) from public.contractor_worker_attendance a join public.sectors s on s.id = a.sector_id where a.log_date = dd and a.status = 'present' and s.parent_sector = any(p.parent_sectors)),
                 'absent', (select count(*) from public.contractor_worker_attendance a join public.sectors s on s.id = a.sector_id where a.log_date = dd and a.status = 'absent' and s.parent_sector = any(p.parent_sectors)),
                 'proofs', (select count(*) from public.contractor_checkins c join public.sectors s on s.id = c.sector_id where c.log_date = dd and s.parent_sector = any(p.parent_sectors))) order by dd), '[]'::jsonb)
               from generate_series(f, t, interval '1 day') g(dd)),
    'contractors', (select coalesce(jsonb_agg(jsonb_build_object('user_id', cp.user_id, 'name', app.manager_display_name(cp.user_id), 'area', s.name, 'parent_sector', s.parent_sector, 'manager_name', app.manager_display_name(cp.manager_user_id), 'shift', cp.shift,
                       'workers', (select count(*) from public.contractor_workers w where w.contractor_user_id = cp.user_id and w.is_active),
                       'present', (select count(*) from public.contractor_worker_attendance a where a.contractor_user_id = cp.user_id and a.log_date between f and t and a.status = 'present'),
                       'absent', (select count(*) from public.contractor_worker_attendance a where a.contractor_user_id = cp.user_id and a.log_date between f and t and a.status = 'absent'),
                       'proof_days', (select count(*) from public.contractor_checkins c where c.contractor_user_id = cp.user_id and c.log_date between f and t),
                       'out_of_zone_days', (select count(*) from public.contractor_checkins c where c.contractor_user_id = cp.user_id and c.log_date between f and t and c.in_zone = false)) order by s.parent_sector, s.id), '[]'::jsonb)
                    from public.contractor_profiles cp join public.sectors s on s.id = cp.sector_id where cp.is_active and s.parent_sector = any(p.parent_sectors)),
    'managers', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', app.manager_display_name(m.user_id), 'shift', m.shift, 'parent_sector', m.parent_sector,
                    'areas', (select string_agg(s.name, '، ' order by s.id) from public.sectors s where s.id = any(m.sectors) and s.parent_sector = m.parent_sector),
                    'contractors', (select count(*) from public.contractor_profiles cp where cp.manager_user_id = m.user_id and cp.is_active),
                    'present', (select count(*) from public.contractor_worker_attendance a join public.contractor_profiles cp on cp.user_id = a.contractor_user_id where cp.manager_user_id = m.user_id and a.log_date between f and t and a.status = 'present'),
                    'absent', (select count(*) from public.contractor_worker_attendance a join public.contractor_profiles cp on cp.user_id = a.contractor_user_id where cp.manager_user_id = m.user_id and a.log_date between f and t and a.status = 'absent'),
                    'trips', (select count(*) from public.garage_departures gd where gd.sector_id = any(m.sectors) and gd.departed_at::date between f and t),
                    'leave_days', (select coalesce(sum(least(x.end_date, t) - greatest(x.start_date, f) + 1), 0) from public.hr_leaves x join public.employees e on e.id = x.employee_id where e.user_id = m.user_id and x.status = 'approved' and x.kind = 'leave' and x.start_date <= t and x.end_date >= f),
                    'permits', (select count(*) from public.hr_leaves x join public.employees e on e.id = x.employee_id where e.user_id = m.user_id and x.status = 'approved' and x.kind = 'time_permit' and x.start_date between f and t)) order by m.parent_sector, app.manager_display_name(m.user_id)), '[]'::jsonb)
                 from (select distinct mp.user_id, mp.shift, mp.sectors, s.parent_sector from public.manager_profiles mp join public.sectors s on s.id = any(mp.sectors) where s.parent_sector = any(p.parent_sectors)) m)
  ) into r;
  return r;
end$$;

drop function if exists public.sector_manager_notify_targets();
create or replace function public.sector_manager_notify_targets()
returns table(user_id uuid, full_name text, role text, parent_sector text, areas text, shift text)
language plpgsql stable security definer set search_path = public, app as $$
declare p app.ops_scope_t := app.ops_scope();
begin
  return query
  select * from (
    select smp.user_id, app.manager_display_name(smp.user_id) as full_name, 'admin_ops'::text as role, smp.parent_sectors[1] as parent_sector,
           (select string_agg(app.parent_sector_name(x), '، ' order by x) from unnest(smp.parent_sectors) x) as areas, null::text as shift
    from public.sector_manager_profiles smp where p.is_field_ops and smp.parent_sectors && p.parent_sectors and smp.user_id <> auth.uid()
    union all
    select m.user_id, app.manager_display_name(m.user_id), 'department_manager'::text, m.parent_sector, (select string_agg(s.name, '، ' order by s.id) from public.sectors s where s.id = any(m.sectors) and s.parent_sector = m.parent_sector), m.shift
    from (select distinct mp.user_id, mp.shift, mp.sectors, s.parent_sector from public.manager_profiles mp join public.sectors s on s.id = any(mp.sectors) where s.parent_sector = any(p.parent_sectors)) m
  ) z order by (z.role = 'admin_ops') desc, z.parent_sector, z.full_name;
end$$;

create or replace function public.sector_manager_notify(p_title text, p_body text, p_targets uuid[] default null) returns int
language plpgsql security definer set search_path = public, app as $$
declare p app.ops_scope_t := app.ops_scope(); allowed uuid[]; rec uuid[]; u uuid; v_id uuid;
begin
  if length(trim(coalesce(p_title, ''))) < 3 then raise exception 'NOTICE_TITLE_REQUIRED'; end if;
  if length(trim(coalesce(p_body, ''))) < 3 then raise exception 'NOTICE_BODY_REQUIRED'; end if;
  select coalesce(array_agg(t.user_id), '{}') into allowed from public.sector_manager_notify_targets() t;
  if p_targets is not null and cardinality(p_targets) > 0 and exists (select 1 from unnest(p_targets) x where not (x = any(allowed))) then raise exception 'NOTICE_TARGET_FORBIDDEN'; end if;
  rec := case when p_targets is null or cardinality(p_targets) = 0 then allowed else (select coalesce(array_agg(x), '{}') from unnest(p_targets) x where x = any(allowed)) end;
  if cardinality(rec) = 0 then raise exception 'NOTICE_NO_RECIPIENTS'; end if;
  insert into public.sector_notices (sender_user_id, title, body, recipients) values (auth.uid(), trim(p_title), trim(p_body), rec) returning id into v_id;
  foreach u in array rec loop
    perform app.hr_notify(u, (case when p.is_field_ops then 'تبليغ من العمليات الميدانية: ' else 'تبليغ من مسؤول القاطع: ' end) || trim(p_title), trim(p_body),
      case when exists (select 1 from public.user_roles ur where ur.user_id = u and ur.role = 'admin_ops') then '/admin-ops' else '/manager' end,
      'sector_notice:' || v_id::text || ':' || u::text, 'warning');
  end loop;
  return cardinality(rec);
end$$;

create or replace function public.sector_manager_notices(p_limit int default 50)
returns table(id uuid, title text, body text, recipients_count int, recipient_names text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, app as $$
begin
  perform app.ops_scope();
  return query select n.id, n.title, n.body, cardinality(n.recipients), (select string_agg(app.manager_display_name(x), '، ') from unnest(n.recipients) x), n.created_at
  from public.sector_notices n where n.sender_user_id = auth.uid() order by n.created_at desc limit p_limit;
end$$;

-- مسؤولو القواطع (للعمليات الميدانية): من يشغل كل قاطع، حالته اليوم، وما ينتظره من طلبات
create or replace function public.field_ops_sector_managers()
returns table(user_id uuid, full_name text, phone text, parent_sectors text[], parent_names text[], department_managers int, contractors int,
              present_today int, absent_today int, presence_proved int, pending_tasks int, on_leave_today boolean, has_employee boolean)
language plpgsql stable security definer set search_path = public, app as $$
declare p app.ops_scope_t := app.ops_scope(); d date := app.baghdad_today();
begin
  if not p.is_field_ops then raise exception 'FIELD_OPS_FORBIDDEN'; end if;
  return query
  select smp.user_id, app.manager_display_name(smp.user_id), (select e.phone from public.employees e where e.user_id = smp.user_id limit 1), smp.parent_sectors,
    (select array_agg(app.parent_sector_name(x) order by x) from unnest(smp.parent_sectors) x),
    (select count(distinct mp.user_id)::int from public.manager_profiles mp join public.sectors s on s.id = any(mp.sectors) where s.parent_sector = any(smp.parent_sectors)),
    (select count(*)::int from public.contractor_profiles cp join public.sectors s on s.id = cp.sector_id where cp.is_active and s.parent_sector = any(smp.parent_sectors)),
    (select count(*)::int from public.contractor_worker_attendance a join public.sectors s on s.id = a.sector_id where a.log_date = d and a.status = 'present' and s.parent_sector = any(smp.parent_sectors)),
    (select count(*)::int from public.contractor_worker_attendance a join public.sectors s on s.id = a.sector_id where a.log_date = d and a.status = 'absent' and s.parent_sector = any(smp.parent_sectors)),
    (select count(*)::int from public.contractor_checkins c join public.sectors s on s.id = c.sector_id where c.log_date = d and s.parent_sector = any(smp.parent_sectors)),
    (select count(*)::int from public.approval_tasks t join public.hr_leaves l on l.id = t.request_id where t.status = 'pending' and smp.user_id = any(t.approvers) and l.status = 'pending'),
    exists (select 1 from public.hr_leaves x join public.employees e on e.id = x.employee_id where e.user_id = smp.user_id and x.status = 'approved' and x.kind = 'leave' and d between x.start_date and x.end_date),
    exists (select 1 from public.employees e where e.user_id = smp.user_id and e.archived_at is null)
  from public.sector_manager_profiles smp
  order by smp.parent_sectors[1], 2;
end$$;

revoke all on function public.sector_manager_notify_targets() from public, anon;
revoke all on function public.field_ops_sector_managers() from public, anon;
grant execute on function public.sector_manager_notify_targets(), public.field_ops_sector_managers() to authenticated;
