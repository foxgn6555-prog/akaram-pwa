-- 00206 · وحدة الكشوفات في الكراج المركزي + عقوبة «غرامة مالية»
-- ① النطاق: حساب الكراج (central_garage_officer) يرى ويُنشئ كشوفات على الموظفين فقط، ضمن قسمه في الموارد البشرية (القسم وفروعه)
--    — القسم يُستدل من سجل الموظف الخاص بحساب الكراج نفسه (department_id). بلا سجل/قسم ⇒ GARAGE_NO_DEPARTMENT.
--    غرفة العمليات والإدارة العليا والتطوير: بلا تقييد (كما كان).
-- ② عقوبة جديدة 'fine' (غرامة مالية): مسموحة في أنواع الكشوفات؛ تُلزم مبلغاً > 0 عند الحفظ؛ تُضاف لكل الأنواع الحالية (التطوير المركزية يمكنها إزالتها من أي نوع).
-- ③ روابط التبليغات لمُعدّ الكشف تتبع بوابته (الكراج ← /central-garage/disclosures).

-- ═══════════ ① النطاق ═══════════
create or replace function app.disclosure_scope_depts() returns uuid[] language plpgsql stable security definer set search_path = public, app as $$
declare root uuid;
begin
  if app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin']) then return null; end if;
  if not app.has_role(array['central_garage_officer']) then return null; end if;
  select e.department_id into root from public.employees e where e.user_id = auth.uid() and e.archived_at is null order by e.created_at desc limit 1;
  if root is null then raise exception 'GARAGE_NO_DEPARTMENT'; end if;
  return (with recursive t as (select id from public.departments where id = root
                               union all select d.id from public.departments d join t on d.parent_id = t.id)
          select array_agg(id) from t);
end$$;

create or replace function app.disclosure_in_scope(d public.disclosures) returns boolean language sql stable security definer set search_path = public, app as $$
  select case when app.disclosure_scope_depts() is null then true
              else d.target_kind = 'employee' and d.employee_id is not null
                   and exists (select 1 from public.employees e where e.id = d.employee_id and e.department_id = any(app.disclosure_scope_depts())) end $$;

create or replace function app.disclosure_is_ops() returns boolean language sql stable security definer set search_path = public, app as
$$ select app.has_role(array['ops_room','super_admin','central_garage_officer']) $$;

-- رابط وحدة الكشوفات بحسب بوابة المستخدم
create or replace function app.disclosure_link_for(p_user uuid, p_tab text) returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.user_roles where user_id = p_user and role in ('ops_room','super_admin')) then '/ops-room/disclosures?tab=' || p_tab
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'central_garage_officer') then '/central-garage/disclosures?tab=' || p_tab
    else '/ops-room/disclosures?tab=' || p_tab end $$;

-- سياسات القراءة: الكراج ضمن نطاقه
drop policy if exists "disclosures: قراءة النشط" on public.disclosures;
create policy "disclosures: قراءة النشط" on public.disclosures for select to authenticated
  using (app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin'])
         or (app.has_role(array['central_garage_officer']) and app.disclosure_in_scope(disclosures)));
drop policy if exists "disclosure_events: staff read" on public.disclosure_events;
create policy "disclosure_events: staff read" on public.disclosure_events for select to authenticated
  using (app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin'])
         or (app.has_role(array['central_garage_officer']) and exists (select 1 from public.disclosures d where d.id = disclosure_id and app.disclosure_in_scope(d))));

-- ═══════════ ② غرامة مالية ═══════════
alter table public.disclosures drop constraint if exists disclosures_penalty_type_check;
alter table public.disclosures add constraint disclosures_penalty_type_check check (penalty_type is null or penalty_type in ('warning','reprimand','termination','fine'));
update public.disclosure_types set allowed_penalties = array_append(allowed_penalties, 'fine') where not ('fine' = any(allowed_penalties));

create or replace function public.disclosure_type_save(p_key text, p_label text, p_description text default null, p_allowed_penalties text[] default null, p_default_amount numeric default null,
                                                       p_is_active boolean default true, p_sort_order int default 100, p_min_amount numeric default null, p_max_amount numeric default null)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare v_key text := lower(trim(coalesce(p_key, ''))); pen text[] := coalesce(p_allowed_penalties, array['warning','reprimand','termination']);
begin
  perform app.require_it();
  if v_key !~ '^[a-z][a-z0-9_]{1,40}$' then raise exception 'DISCLOSURE_TYPE_KEY_INVALID'; end if;
  if length(trim(coalesce(p_label, ''))) < 2 then raise exception 'DISCLOSURE_TYPE_LABEL_INVALID'; end if;
  if exists (select 1 from unnest(pen) x where x not in ('warning','reprimand','termination','fine')) then raise exception 'DISCLOSURE_PENALTY_INVALID'; end if;
  if p_default_amount is not null and p_default_amount < 0 then raise exception 'DISCLOSURE_AMOUNT_INVALID'; end if;
  if p_min_amount is not null and p_min_amount < 0 then raise exception 'DISCLOSURE_AMOUNT_INVALID'; end if;
  if p_max_amount is not null and p_max_amount < 0 then raise exception 'DISCLOSURE_AMOUNT_INVALID'; end if;
  if p_min_amount is not null and p_max_amount is not null and p_max_amount < p_min_amount then raise exception 'DISCLOSURE_AMOUNT_RANGE_INVALID'; end if;
  if p_default_amount is not null and ((p_min_amount is not null and p_default_amount < p_min_amount) or (p_max_amount is not null and p_default_amount > p_max_amount)) then raise exception 'DISCLOSURE_AMOUNT_RANGE_INVALID'; end if;
  insert into public.disclosure_types (key, label, description, allowed_penalties, default_amount, is_active, sort_order, min_amount, max_amount, updated_by, updated_at)
  values (v_key, trim(p_label), nullif(trim(coalesce(p_description, '')), ''), pen, p_default_amount, coalesce(p_is_active, true), coalesce(p_sort_order, 100), p_min_amount, p_max_amount, auth.uid(), now())
  on conflict (key) do update set label = excluded.label, description = excluded.description, allowed_penalties = excluded.allowed_penalties, default_amount = excluded.default_amount,
    is_active = excluded.is_active, sort_order = excluded.sort_order, min_amount = excluded.min_amount, max_amount = excluded.max_amount, updated_by = excluded.updated_by, updated_at = now();
  return public.disclosure_types_list();
end$$;


-- ═══════════ ③ الدوال بالنطاق الجديد ═══════════
create or replace function public.disclosure_employee_lookup(p_q text default null, p_limit int default 20) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'full_name', e.full_name, 'employee_number', e.employee_number, 'job_title', e.job_title, 'department_name', d.name) order by e.full_name), '[]'::jsonb)
  from (select * from public.employees x where x.archived_at is null and x.employment_status <> 'terminated'
          and (app.disclosure_scope_depts() is null or x.department_id = any(app.disclosure_scope_depts()))
          and (nullif(trim(coalesce(p_q, '')), '') is null or x.full_name ilike '%' || trim(p_q) || '%' or x.employee_number ilike '%' || trim(p_q) || '%')
        order by x.full_name limit greatest(1, least(coalesce(p_limit, 20), 100))) e
  left join public.departments d on d.id = e.department_id
  where app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin','central_garage_officer']) $$;


create or replace function public.disclosure_save(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare g_scope uuid[] := app.disclosure_scope_depts(); d public.disclosures; t public.disclosure_types; v record; e record; v_id uuid; v_kind text := coalesce(p ->> 'target_kind', 'vehicle');
        v_db text; v_driver text; v_sector text; v_shift text; v_vehicle uuid; v_emp uuid; v_empno text; v_dept text; v_job text; v_amount numeric;
begin
  if not app.disclosure_is_ops() then raise exception 'DISCLOSURE_FORBIDDEN'; end if;
  if v_kind not in ('vehicle','employee') then raise exception 'DISCLOSURE_TARGET_INVALID'; end if;
  if g_scope is not null and v_kind <> 'employee' then raise exception 'DISCLOSURE_GARAGE_EMPLOYEE_ONLY'; end if;
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
    if g_scope is not null and not exists (select 1 from public.employees z where z.id = v_emp and z.department_id = any(g_scope)) then raise exception 'DISCLOSURE_OUT_OF_SCOPE'; end if;
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

create or replace function public.disclosure_submit(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare d public.disclosures; v_chain uuid; who uuid[]; who2 uuid[];
begin
  if not app.disclosure_is_ops() then raise exception 'DISCLOSURE_FORBIDDEN'; end if;
  select * into d from public.disclosures where id = p_id;
  if d.id is null then raise exception 'DISCLOSURE_NOT_FOUND'; end if;
  if not app.disclosure_in_scope(d) then raise exception 'DISCLOSURE_OUT_OF_SCOPE'; end if;
  if d.status not in ('draft','returned') then raise exception 'DISCLOSURE_NOT_SUBMITTABLE'; end if;
  delete from public.approval_tasks where request_kind = 'disclosure' and request_id = p_id;  -- سلسلة جديدة عند إعادة الرفع
  v_chain := app.approval_open('disclosure', p_id, auth.uid());
  if v_chain is null then
    -- بلا سلسلة مضبوطة: المعاون ثم المدير المفوض (الافتراضي)
    select coalesce(array_agg(distinct ur.user_id), '{}') into who  from public.user_roles ur where ur.role = 'deputy_director' and ur.user_id <> auth.uid();
    select coalesce(array_agg(distinct ur.user_id), '{}') into who2 from public.user_roles ur where ur.role = 'super_admin' and ur.user_id <> auth.uid();
    if cardinality(who) = 0 and cardinality(who2) = 0 then raise exception 'APPROVAL_NO_APPROVER'; end if;
    insert into public.approval_tasks (request_kind, request_id, step_no, step_label, approvers, status, note) values
      ('disclosure', p_id, 1, 'معاون المدير المفوض (افتراضي)', who, case when cardinality(who) = 0 then 'skipped' else 'pending' end, case when cardinality(who) = 0 then 'لا يوجد معاون — تُخطّيت' end),
      ('disclosure', p_id, 2, 'المدير المفوض (افتراضي)', who2, case when cardinality(who2) = 0 then 'skipped' when cardinality(who) = 0 then 'pending' else 'waiting' end, case when cardinality(who2) = 0 then 'لا يوجد مدير مفوض — تُخطّيت' end);
    perform app.approval_notify_step('disclosure', p_id, (select min(step_no) from public.approval_tasks where request_kind = 'disclosure' and request_id = p_id and status = 'pending'));
  end if;
  update public.disclosures set status = 'pending', submitted_at = now(), chain_id = v_chain, return_reason = null, returned_by = null, returned_at = null,
    resubmit_count = case when d.status = 'returned' then resubmit_count + 1 else resubmit_count end where id = p_id;
  perform app.disclosure_event(p_id, case when d.status = 'returned' then 'resubmitted' else 'submitted' end, null, d.amount);
  return public.disclosure_get(p_id);
end$$;

create or replace function public.disclosure_decide(p_id uuid, p_approve boolean, p_note text default null, p_amount numeric default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare d public.disclosures; fin boolean; t public.disclosure_types; m date; v_ded uuid; tries int := 0; u uuid; ops uuid[];
begin
  select * into d from public.disclosures where id = p_id;
  if d.id is null then raise exception 'DISCLOSURE_NOT_FOUND'; end if;
  if d.status <> 'pending' then raise exception 'DISCLOSURE_NOT_PENDING'; end if;
  if not (auth.uid() = any(app.approval_current_approvers('disclosure', p_id)) or app.has_role(array['super_admin'])) then raise exception 'DISCLOSURE_FORBIDDEN'; end if;
  if not p_approve and length(trim(coalesce(p_note, ''))) < 3 then raise exception 'DISCLOSURE_RETURN_REASON_REQUIRED'; end if;
  if p_amount is not null and p_amount < 0 then raise exception 'DISCLOSURE_AMOUNT_INVALID'; end if;
  if p_approve and p_amount is not null and p_amount is distinct from d.amount then
    update public.disclosures set amount = p_amount, amount_by = auth.uid(), amount_note = nullif(trim(coalesce(p_note, '')), '') where id = p_id;
    perform app.disclosure_event(p_id, 'amount_set', p_note, p_amount);
    d.amount := p_amount;
  end if;
  fin := app.approval_decide('disclosure', p_id, p_approve, p_note);
  select coalesce(array_agg(distinct ur.user_id), '{}') into ops from public.user_roles ur where ur.role = 'ops_room';
  if not p_approve then
    update public.disclosures set status = 'returned', return_reason = trim(p_note), returned_by = auth.uid(), returned_at = now() where id = p_id;
    perform app.disclosure_event(p_id, 'returned', p_note, d.amount);
    foreach u in array (ops || coalesce(array[d.prepared_by], '{}')) loop
      perform app.hr_notify(u, 'أُعيد الكشف ' || coalesce(d.ref_no, '') || ' — ' || app.disclosure_target_label(d), trim(p_note) || ' · أعاده ' || coalesce(app.manager_display_name(auth.uid()), ''), app.disclosure_link_for(u, 'returned'), 'disclosure_returned:' || p_id::text || ':' || now()::text, 'warning');
    end loop;
    return public.disclosure_get(p_id);
  end if;
  perform app.disclosure_event(p_id, 'step_approved', p_note, d.amount);
  if not fin then return public.disclosure_get(p_id); end if;

  -- ── الاعتماد النهائي ──
  update public.disclosures set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_id;
  perform app.disclosure_event(p_id, 'approved', p_note, d.amount);
  select * into t from public.disclosure_types where key = d.violation_type;
  if coalesce(d.amount, 0) > 0 and d.employee_id is not null then
    -- شهر المخالفة؛ وإن كان مقفلاً من المالية ← أول شهر مفتوح بعده (لا يُخلط بين الأشهر، ويُسجَّل الشهر في الكشف)
    m := d.period_month;
    while app.hr_month_locked(m) and tries < 24 loop m := (m + interval '1 month')::date; tries := tries + 1; end loop;
    if app.hr_month_locked(m) then raise exception 'HR_MONTH_LOCKED'; end if;
    insert into public.hr_attendance_deductions (employee_id, period_month, amount, days, reason, created_by, source_disclosure_id)
    values (d.employee_id, m, d.amount, 0, 'كشف ' || coalesce(d.ref_no, '') || ' — ' || t.label || ' (' || d.log_date::text || ')', auth.uid(), p_id) returning id into v_ded;
    insert into public.hr_attendance_audit (employee_id, work_date, action, after, reason, actor)
    values (d.employee_id, m, 'deduction_add', jsonb_build_object('id', v_ded, 'amount', d.amount, 'days', 0, 'disclosure', p_id), 'كشف ' || coalesce(d.ref_no, ''), auth.uid());
    update public.disclosures set deduction_id = v_ded, deduction_month = m,
      deduction_note = case when m <> d.period_month then 'شهر المخالفة مقفل من المالية — رُحّل الاستقطاع إلى ' || to_char(m, 'YYYY-MM') end where id = p_id;
    perform app.disclosure_event(p_id, 'deduction_posted', case when m <> d.period_month then 'رُحّل إلى ' || to_char(m, 'YYYY-MM') else to_char(m, 'YYYY-MM') end, d.amount);
  elsif coalesce(d.amount, 0) > 0 then
    update public.disclosures set deduction_note = 'المكشوف عليه غير مرتبط بموظف في النظام — المبلغ مسجَّل على الكشف فقط' where id = p_id;
  end if;
  foreach u in array (ops || coalesce(array[d.prepared_by], '{}')) loop
    perform app.hr_notify(u, 'اعتُمد الكشف ' || coalesce(d.ref_no, '') || ' — ' || app.disclosure_target_label(d),
      case when coalesce(d.amount, 0) > 0 then 'المبلغ ' || to_char(d.amount, 'FM999,999,999') || ' د.ع' || case when v_ded is not null then ' · أُضيف للاستقطاعات (' || to_char(m, 'YYYY-MM') || ')' else '' end else 'بلا مبلغ' end,
      app.disclosure_link_for(u, 'archive'), 'disclosure_approved:' || p_id::text, 'success');
  end loop;
  return public.disclosure_get(p_id);
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
  update public.approval_tasks set status = 'skipped', note = 'أُلغي الكشف من ' || case when app.has_role(array['central_garage_officer']) and not app.has_role(array['ops_room','super_admin']) then 'الكراج المركزي' else 'غرفة العمليات' end where request_kind = 'disclosure' and request_id = p_id and status in ('pending','waiting');
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
  if not app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin','central_garage_officer']) then raise exception 'DISCLOSURE_FORBIDDEN'; end if;
  perform app.disclosure_scope_depts();  -- الكراج بلا قسم ⇒ GARAGE_NO_DEPARTMENT
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
  if not app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin','central_garage_officer']) then raise exception 'DISCLOSURE_FORBIDDEN'; end if;
  perform app.disclosure_scope_depts();  -- الكراج بلا قسم ⇒ GARAGE_NO_DEPARTMENT
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
  if not app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin','central_garage_officer']) then raise exception 'DISCLOSURE_FORBIDDEN'; end if;
  perform app.disclosure_scope_depts();  -- الكراج بلا قسم ⇒ GARAGE_NO_DEPARTMENT
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

grant execute on function app.disclosure_scope_depts() to authenticated;
