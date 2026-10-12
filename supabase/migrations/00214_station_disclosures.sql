-- 00214 · المحطة التحويلية: وحدة «الكشوفات» (الجولة 4 من 5) — كشوفات على موظفي قسم المحطة فقط (بلا آليات)
-- نفس آلية الكراج (00206) ومسؤول القاطع (00210): النطاق = app.disclosure_scope_depts() (قسم المحطة وفروعه — 00211)،
-- المحطة ترى كشوفاتها فقط (RLS)، سلسلة الاعتماد كما هي (المعاون → المدير المفوض → استقطاع تلقائي). روابط الإشعارات: /transfer-station/disclosures.

-- ① الموظفون المرتبطون بمسؤول القاطع الحالي (null = دور غير مقيّد بهذا النطاق)
create or replace function app.sector_disclosure_emps() returns uuid[] language plpgsql stable security definer set search_path = public, app as $$
declare parents text[]; me uuid;
begin
  if app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin','central_garage_officer','transfer_station']) then return null; end if;
  if not app.has_role(array['admin_ops']) then return null; end if;
  parents := coalesce((select p.parent_sectors from public.sector_manager_profiles p where p.user_id = auth.uid()), '{}');
  if cardinality(parents) = 0 then raise exception 'SECTOR_MANAGER_NOT_ASSIGNED'; end if;
  me := app.current_employee_id();
  return coalesce((select array_agg(distinct e.id) from public.employees e
                   where e.archived_at is null and e.employment_status <> 'terminated' and e.user_id is distinct from auth.uid()
                     and ( (me is not null and e.manager_id = me)
                        or exists (select 1 from public.manager_profiles mp join public.sectors s on s.id = any(mp.sectors) where mp.user_id = e.user_id and s.parent_sector = any(parents))
                        or exists (select 1 from public.contractor_profiles cp join public.sectors s on s.id = cp.sector_id where cp.user_id = e.user_id and cp.is_active and s.parent_sector = any(parents)) )), '{}'::uuid[]);
end$$;
grant execute on function app.sector_disclosure_emps() to authenticated;

-- هل الدور الحالي مقيّد (كراج = قسم، مسؤول قاطع = موظفوه)؟ + فحص يُظهر الخطأ الواضح
create or replace function app.disclosure_restricted() returns boolean language sql stable security definer set search_path = public, app as
$$ select app.disclosure_scope_depts() is not null or app.sector_disclosure_emps() is not null $$;
create or replace function app.disclosure_scope_check() returns void language plpgsql stable security definer set search_path = public, app as $$
begin perform app.disclosure_scope_depts(); perform app.sector_disclosure_emps(); end$$;
create or replace function app.disclosure_employee_allowed(p_emp uuid) returns boolean language sql stable security definer set search_path = public, app as $$
  select case when p_emp is null then false
              when app.disclosure_scope_depts() is not null then exists (select 1 from public.employees e where e.id = p_emp and e.department_id = any(app.disclosure_scope_depts()))
              when app.sector_disclosure_emps() is not null then p_emp = any(app.sector_disclosure_emps())
              else true end $$;

create or replace function app.disclosure_in_scope(d public.disclosures) returns boolean language sql stable security definer set search_path = public, app as $$
  select case when not app.disclosure_restricted() then true
              else d.target_kind = 'employee' and app.disclosure_employee_allowed(d.employee_id) end $$;

create or replace function app.disclosure_is_ops() returns boolean language sql stable security definer set search_path = public, app as
$$ select app.has_role(array['ops_room','super_admin','central_garage_officer','transfer_station','admin_ops']) $$;

create or replace function app.disclosure_link_for(p_user uuid, p_tab text) returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.user_roles where user_id = p_user and role in ('ops_room','super_admin')) then '/ops-room/disclosures?tab=' || p_tab
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'central_garage_officer') then '/central-garage/disclosures?tab=' || p_tab
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'transfer_station') then '/transfer-station/disclosures?tab=' || p_tab
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'admin_ops') then '/admin-ops/disclosures?tab=' || p_tab
    else '/ops-room/disclosures?tab=' || p_tab end $$;

drop policy if exists "disclosures: قراءة النشط" on public.disclosures;
create policy "disclosures: قراءة النشط" on public.disclosures for select to authenticated
  using (app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin'])
         or (app.has_role(array['central_garage_officer','transfer_station','admin_ops']) and app.disclosure_in_scope(disclosures)));
drop policy if exists "disclosure_events: staff read" on public.disclosure_events;
create policy "disclosure_events: staff read" on public.disclosure_events for select to authenticated
  using (app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin'])
         or (app.has_role(array['central_garage_officer','transfer_station','admin_ops']) and exists (select 1 from public.disclosures d where d.id = disclosure_id and app.disclosure_in_scope(d))));

-- ② الدوال بالنطاق المعمّم


create or replace function public.disclosure_employee_lookup(p_q text default null, p_limit int default 20) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'full_name', e.full_name, 'employee_number', e.employee_number, 'job_title', e.job_title, 'department_name', d.name) order by e.full_name), '[]'::jsonb)
  from (select * from public.employees x where x.archived_at is null and x.employment_status <> 'terminated'
          and app.disclosure_employee_allowed(x.id)
          and (nullif(trim(coalesce(p_q, '')), '') is null or x.full_name ilike '%' || trim(p_q) || '%' or x.employee_number ilike '%' || trim(p_q) || '%')
        order by x.full_name limit greatest(1, least(coalesce(p_limit, 20), 100))) e
  left join public.departments d on d.id = e.department_id
  where app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin','central_garage_officer','transfer_station','admin_ops']) $$;

create or replace function public.disclosure_save(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare d public.disclosures; t public.disclosure_types; v record; e record; v_id uuid; v_kind text := coalesce(p ->> 'target_kind', 'vehicle');
        v_db text; v_driver text; v_sector text; v_shift text; v_vehicle uuid; v_emp uuid; v_empno text; v_dept text; v_job text; v_amount numeric;
begin
  if not app.disclosure_is_ops() then raise exception 'DISCLOSURE_FORBIDDEN'; end if;
  if v_kind not in ('vehicle','employee') then raise exception 'DISCLOSURE_TARGET_INVALID'; end if;
  if app.disclosure_restricted() and v_kind <> 'employee' then raise exception 'DISCLOSURE_GARAGE_EMPLOYEE_ONLY'; end if;   -- الكراج ومسؤول القاطع: موظفون فقط
  select * into t from public.disclosure_types where key = p ->> 'violation_type';
  if t.key is null or not t.is_active then raise exception 'DISCLOSURE_TYPE_INVALID'; end if;
  if (p ->> 'penalty_type') is not null and not ((p ->> 'penalty_type') = any(t.allowed_penalties)) then raise exception 'DISCLOSURE_PENALTY_NOT_ALLOWED'; end if;
  if length(trim(coalesce(p ->> 'details', ''))) < 5 then raise exception 'DISCLOSURE_DETAILS_REQUIRED'; end if;
  if (p ->> 'log_date') is null or (p ->> 'log_date')::date > current_date then raise exception 'DISCLOSURE_DATE_INVALID'; end if;
  v_amount := nullif(p ->> 'amount', '')::numeric;
  if v_amount is not null and v_amount < 0 then raise exception 'DISCLOSURE_AMOUNT_INVALID'; end if;
  if (p ->> 'penalty_type') = 'fine' and coalesce(v_amount, 0) <= 0 then raise exception 'DISCLOSURE_FINE_AMOUNT_REQUIRED'; end if;

  if v_kind = 'vehicle' then
    v_vehicle := nullif(p ->> 'vehicle_id', '')::uuid;
    if v_vehicle is null then raise exception 'DISCLOSURE_VEHICLE_REQUIRED'; end if;
    select gv.*, s.name as sector_name into v from public.garage_vehicles gv left join public.sectors s on s.id = gv.sector_id where gv.id = v_vehicle and gv.archived_at is null;
    if v.id is null then raise exception 'DISCLOSURE_VEHICLE_NOT_FOUND'; end if;
    v_db := v.db_number; v_driver := coalesce(nullif(trim(coalesce(p ->> 'driver_name', '')), ''), v.driver_name); v_sector := coalesce(nullif(p ->> 'sector', ''), v.sector_name); v_shift := coalesce(nullif(p ->> 'shift', ''), v.shift);
    v_emp := v.driver_employee_id;
  else
    v_emp := nullif(p ->> 'employee_id', '')::uuid;
    if v_emp is null then raise exception 'DISCLOSURE_EMPLOYEE_REQUIRED'; end if;
    v_db := coalesce(nullif(p ->> 'db_number', ''), '—'); v_sector := nullif(p ->> 'sector', ''); v_shift := coalesce(nullif(p ->> 'shift', ''), 'morning');
  end if;
  if v_emp is not null then
    select x.full_name, x.employee_number, x.job_title, dp.name as dept into e from public.employees x left join public.departments dp on dp.id = x.department_id where x.id = v_emp and x.archived_at is null;
    if e.full_name is null then raise exception 'DISCLOSURE_EMPLOYEE_NOT_FOUND'; end if;
    if not app.disclosure_employee_allowed(v_emp) then raise exception 'DISCLOSURE_OUT_OF_SCOPE'; end if;
    v_empno := e.employee_number; v_dept := e.dept; v_job := e.job_title;
    if v_kind = 'employee' then v_driver := e.full_name; end if;
  end if;
  if v_shift not in ('morning','evening','night') then v_shift := 'morning'; end if;

  if p_id is null then
    insert into public.disclosures (ref_no, target_kind, vehicle_id, employee_id, employee_number, department_name, job_title, db_number, driver_name, vehicle_type, contractor_name, sector, shift, log_date, period_month,
      violation_type, penalty_type, details, amount, status, prepared_by, prepared_by_name, created_by)
    values (app.disclosure_ref_no(), v_kind, v_vehicle, v_emp, v_empno, v_dept, v_job, v_db, v_driver, nullif(p ->> 'vehicle_type', ''), nullif(p ->> 'contractor_name', ''), v_sector, v_shift, (p ->> 'log_date')::date, date_trunc('month', (p ->> 'log_date')::date)::date,
      t.key, nullif(p ->> 'penalty_type', ''), trim(p ->> 'details'), v_amount, 'draft', auth.uid(), app.manager_display_name(auth.uid()), auth.uid()) returning id into v_id;
    perform app.disclosure_event(v_id, 'created', null, v_amount);
  else
    select * into d from public.disclosures where id = p_id;
    if d.id is null then raise exception 'DISCLOSURE_NOT_FOUND'; end if;
    if d.status not in ('draft','returned') then raise exception 'DISCLOSURE_NOT_EDITABLE'; end if;
    if not app.disclosure_in_scope(d) then raise exception 'DISCLOSURE_OUT_OF_SCOPE'; end if;
    update public.disclosures set target_kind = v_kind, vehicle_id = v_vehicle, employee_id = v_emp, employee_number = v_empno, department_name = v_dept, job_title = v_job, db_number = v_db, driver_name = v_driver,
      vehicle_type = nullif(p ->> 'vehicle_type', ''), contractor_name = nullif(p ->> 'contractor_name', ''), sector = v_sector, shift = v_shift, log_date = (p ->> 'log_date')::date, period_month = date_trunc('month', (p ->> 'log_date')::date)::date,
      violation_type = t.key, penalty_type = nullif(p ->> 'penalty_type', ''), details = trim(p ->> 'details'), amount = v_amount
    where id = p_id;
    v_id := p_id;
    perform app.disclosure_event(v_id, 'updated', null, v_amount);
  end if;
  return public.disclosure_get(v_id);
end$$;

create or replace function public.disclosure_cancel(p_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare d public.disclosures; u uuid;
begin
  if not app.disclosure_is_ops() then raise exception 'DISCLOSURE_FORBIDDEN'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'DISCLOSURE_CANCEL_REASON_REQUIRED'; end if;
  select * into d from public.disclosures where id = p_id;
  if d.id is null then raise exception 'DISCLOSURE_NOT_FOUND'; end if;
  if not app.disclosure_in_scope(d) then raise exception 'DISCLOSURE_OUT_OF_SCOPE'; end if;
  if d.status not in ('draft','returned','pending') then raise exception 'DISCLOSURE_NOT_CANCELLABLE'; end if;
  update public.approval_tasks set status = 'skipped', note = 'أُلغي الكشف من ' || case when app.has_role(array['ops_room','super_admin']) then 'غرفة العمليات' when app.has_role(array['central_garage_officer']) then 'الكراج المركزي' when app.has_role(array['transfer_station']) then 'المحطة التحويلية' when app.has_role(array['admin_ops']) then 'مسؤول القاطع' else 'غرفة العمليات' end where request_kind = 'disclosure' and request_id = p_id and status in ('pending','waiting');
  update public.disclosures set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(), cancel_reason = trim(p_reason) where id = p_id;
  perform app.disclosure_event(p_id, 'cancelled', p_reason, d.amount);
  -- تبليغ المدير المفوض بالكشوفات الملغاة
  for u in select ur.user_id from public.user_roles ur where ur.role = 'super_admin' loop
    perform app.hr_notify(u, 'أُلغي الكشف ' || coalesce(d.ref_no, '') || ' — ' || app.disclosure_target_label(d), trim(p_reason) || ' · ألغاه ' || coalesce(app.manager_display_name(auth.uid()), ''), '/admin/disclosures?tab=cancelled', 'disclosure_cancelled:' || p_id::text, 'warning');
  end loop;
  return public.disclosure_get(p_id);
end$$;

create or replace function public.disclosure_get(p_id uuid) returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare d public.disclosures;
begin
  if not app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin','central_garage_officer','transfer_station','admin_ops']) then raise exception 'DISCLOSURE_FORBIDDEN'; end if;
  perform app.disclosure_scope_check();  -- الكراج بلا قسم ⇒ GARAGE_NO_DEPARTMENT · مسؤول قاطع بلا قواطع ⇒ SECTOR_MANAGER_NOT_ASSIGNED
  select * into d from public.disclosures where id = p_id;
  if d.id is null then raise exception 'DISCLOSURE_NOT_FOUND'; end if;
  if not app.disclosure_in_scope(d) then raise exception 'DISCLOSURE_OUT_OF_SCOPE'; end if;
  return app.disclosure_json(d) || jsonb_build_object(
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'action', e.action, 'actor_name', e.actor_name, 'note', e.note, 'amount', e.amount, 'at', e.created_at) order by e.id) from public.disclosure_events e where e.disclosure_id = p_id), '[]'::jsonb),
    'timeline', coalesce((select jsonb_agg(jsonb_build_object('step_no', t.step_no, 'label', t.step_label, 'status', t.status, 'decided_by', app.manager_display_name(t.decided_by), 'decided_at', t.decided_at, 'note', t.note,
        'approvers', (select coalesce(jsonb_agg(app.manager_display_name(a)), '[]'::jsonb) from unnest(t.approvers) a)) order by t.step_no) from public.approval_tasks t where t.request_kind = 'disclosure' and t.request_id = p_id), '[]'::jsonb));
end$$;

create or replace function public.disclosures_list(p_scope text default 'active', p_from date default null, p_to date default null, p_type text default null, p_q text default null, p_month date default null, p_limit int default 500) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin','central_garage_officer','transfer_station','admin_ops']) then raise exception 'DISCLOSURE_FORBIDDEN'; end if;
  perform app.disclosure_scope_check();  -- الكراج بلا قسم ⇒ GARAGE_NO_DEPARTMENT · مسؤول قاطع بلا قواطع ⇒ SECTOR_MANAGER_NOT_ASSIGNED
  return coalesce((select jsonb_agg(app.disclosure_json(d) order by d.log_date desc, d.created_at desc) from (
    select * from public.disclosures x
    where x.archived_at is null and app.disclosure_in_scope(x)
      and case coalesce(p_scope, 'active') when 'active' then x.status in ('draft','pending','returned') when 'returned' then x.status = 'returned' when 'pending' then x.status = 'pending'
          when 'archive' then x.status in ('approved','cancelled') when 'approved' then x.status = 'approved' when 'cancelled' then x.status = 'cancelled' when 'draft' then x.status = 'draft' else true end
      and (p_from is null or x.log_date >= p_from) and (p_to is null or x.log_date <= p_to)
      and (p_month is null or x.period_month = date_trunc('month', p_month)::date)
      and (nullif(trim(coalesce(p_type, '')), '') is null or x.violation_type = p_type)
      and (nullif(trim(coalesce(p_q, '')), '') is null or x.ref_no ilike '%' || trim(p_q) || '%' or x.db_number ilike '%' || trim(p_q) || '%' or x.driver_name ilike '%' || trim(p_q) || '%' or x.details ilike '%' || trim(p_q) || '%' or coalesce(x.prepared_by_name, '') ilike '%' || trim(p_q) || '%')
    order by x.log_date desc, x.created_at desc limit greatest(1, least(coalesce(p_limit, 500), 5000))) d), '[]'::jsonb);
end$$;

create or replace function public.disclosure_stats(p_month date default null) returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare m date := date_trunc('month', coalesce(p_month, current_date))::date;
begin
  if not app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin','central_garage_officer','transfer_station','admin_ops']) then raise exception 'DISCLOSURE_FORBIDDEN'; end if;
  perform app.disclosure_scope_check();  -- الكراج بلا قسم ⇒ GARAGE_NO_DEPARTMENT · مسؤول قاطع بلا قواطع ⇒ SECTOR_MANAGER_NOT_ASSIGNED
  return jsonb_build_object(
    'month', to_char(m, 'YYYY-MM'),
    'total', (select count(*) from public.disclosures where period_month = m and archived_at is null and app.disclosure_in_scope(disclosures)),
    'by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from public.disclosures where period_month = m and archived_at is null and app.disclosure_in_scope(disclosures) group by status) s),
    'by_type', (select coalesce(jsonb_agg(jsonb_build_object('key', t.key, 'label', t.label, 'count', n) order by n desc), '[]'::jsonb) from (select violation_type, count(*) n from public.disclosures where period_month = m and archived_at is null and app.disclosure_in_scope(disclosures) group by violation_type) x join public.disclosure_types t on t.key = x.violation_type),
    'by_preparer', (select coalesce(jsonb_agg(jsonb_build_object('name', prepared_by_name, 'count', n) order by n desc), '[]'::jsonb) from (select prepared_by_name, count(*) n from public.disclosures where period_month = m and archived_at is null and app.disclosure_in_scope(disclosures) group by prepared_by_name) x),
    'amount_approved', (select coalesce(sum(amount), 0) from public.disclosures where period_month = m and status = 'approved' and app.disclosure_in_scope(disclosures)),
    'amount_pending', (select coalesce(sum(amount), 0) from public.disclosures where period_month = m and status = 'pending' and app.disclosure_in_scope(disclosures)),
    'deductions_posted', (select count(*) from public.disclosures where period_month = m and deduction_id is not null and app.disclosure_in_scope(disclosures)),
    'inbox', (select count(*) from public.disclosures d where d.status = 'pending' and exists (select 1 from public.approval_tasks t where t.request_kind = 'disclosure' and t.request_id = d.id and t.status = 'pending' and auth.uid() = any(t.approvers))),
    'months', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(pm, 'YYYY-MM'), 'count', n) order by pm desc), '[]'::jsonb) from (select period_month pm, count(*) n from public.disclosures where archived_at is null and app.disclosure_in_scope(disclosures) group by period_month order by pm desc limit 24) y));
end$$;
