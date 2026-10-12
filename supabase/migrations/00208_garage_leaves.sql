-- 00208 · بوابة الكراج — وحدة «الطلبات» (إجازات وزمنيات موظفي قسم الكراج)
-- الكراج: يرى طلبات موظفي قسمه وفروعه، يُدخل طلباً نيابةً عنهم (يذهب لسلسلة الموافقات/المدير المباشر كما هي)،
-- يلغي ما أدخله وهو معلّق، ويبتّ فقط إن كان هو المعتمد وفق سلاسل التطوير المركزية. لا رواتب ولا بيانات حساسة.

create or replace function app.garage_can_act_on(p_employee uuid) returns boolean
language plpgsql stable security definer set search_path = public, app as $$
declare scope uuid[];
begin
  if not app.has_role(array['central_garage_officer']) then return false; end if;
  scope := app.disclosure_scope_depts();
  if scope is null then return true; end if;
  return exists (select 1 from public.employees e where e.id = p_employee and e.archived_at is null and e.department_id = any(scope));
end$$;

-- ① الطلب نيابةً عن موظف الكراج (+ إصلاح: موظف بلا مدير كان يتجاوز فحص الصلاحية بسبب null)
drop function if exists public.hr_leave_request(uuid, uuid, date, date, time, time, text, text);
create or replace function public.hr_leave_request(p_employee uuid, p_type uuid, p_start date, p_end date, p_start_time time default null, p_end_time time default null,
                                                   p_notes text default null, p_attachment text default null, p_backdated_reason text default null)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare lt record; e record; me uuid := app.current_employee_id(); v_days numeric; v_minutes int := 0; v_id uuid; bal jsonb; v_cost numeric; v_max_min int; v_month_permits int;
        chain public.approval_chains; v_chain uuid; v_today date := app.hr_local_date(now()); v_back int := 0; v_prior text; v_hr boolean := app.has_role(array['hr_officer', 'super_admin']);
        v_bd_max int := app.hr_policy_int('backdated_max_days', 7); v_bd_count int := 0; v_bd_alert int := app.hr_policy_int('backdated_alert_per_month', 3); v_mgr uuid; v_title text; u uuid;
begin
  select * into lt from public.hr_leave_types where id = p_type and is_active;
  if not found then raise exception 'HR_LEAVE_TYPE_INVALID'; end if;
  select * into e from public.employees where id = p_employee and archived_at is null;
  if not found or e.employment_status = 'terminated' then raise exception 'HR_NOT_FOUND'; end if;
  -- 00208: الكراج يقدّم الطلب نيابةً عن موظفي قسمه (سلسلة الموافقات كما هي)
  if not (app.has_role(array['hr_officer', 'super_admin']) or p_employee = me or (me is not null and e.manager_id is not distinct from me) or app.garage_can_act_on(p_employee)) then raise exception 'HR_FORBIDDEN'; end if;   -- is not distinct from: مدير فارغ لا يُسقط الفحص
  if e.biometric_pin is null and not app.has_role(array['hr_officer', 'super_admin']) then raise exception 'HR_NO_BIOMETRIC'; end if;
  chain := app.approval_chain_for(e.user_id, lt.kind);
  if e.manager_id is null and chain.id is null and not app.has_role(array['hr_officer', 'super_admin']) then raise exception 'HR_NO_MANAGER'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'HR_DATE_INVALID'; end if;
  if lt.requires_attachment and coalesce(p_attachment, '') = '' then raise exception 'HR_ATTACHMENT_REQUIRED'; end if;
  -- 00197 · طلب بأثر رجعي (ليوم سابق): مسموح بشروط — مفعَّل من التطوير المركزية، ضمن المهلة (HR بلا مهلة)، بسبب إلزامي، والشهر غير مقفل
  if p_start < v_today then
    v_back := v_today - p_start;
    if not app.hr_policy_bool('backdated_requests_enabled', true) then raise exception 'HR_BACKDATED_DISABLED'; end if;
    if not v_hr and v_back > v_bd_max then raise exception 'HR_BACKDATED_TOO_OLD'; end if;
    if length(trim(coalesce(p_backdated_reason, ''))) < 5 then raise exception 'HR_BACKDATED_REASON_REQUIRED'; end if;
    if app.hr_month_locked(p_start) or app.hr_month_locked(p_end) then raise exception 'HR_MONTH_LOCKED'; end if;
    select a.status into v_prior from public.hr_attendance_days a where a.employee_id = p_employee and a.work_date = p_start;
    select count(*) into v_bd_count from public.hr_leaves x where x.employee_id = p_employee and x.is_backdated and x.status in ('pending', 'approved')
      and date_trunc('month', x.created_at at time zone 'UTC') = date_trunc('month', now() at time zone 'UTC');
    v_bd_count := v_bd_count + 1;
  end if;

  if lt.kind = 'time_permit' then
    if p_start <> p_end or p_start_time is null or p_end_time is null or p_end_time <= p_start_time then raise exception 'HR_PERMIT_TIME_INVALID'; end if;
    v_minutes := extract(epoch from (p_end_time - p_start_time))::int / 60;
    v_max_min := coalesce(lt.max_minutes, app.hr_policy_int('permit_max_minutes', 180));
    if v_minutes > v_max_min then raise exception 'HR_PERMIT_TOO_LONG'; end if;
    if (app.hr_policy() ->> 'permits_max_per_month') is not null then
      select count(*) into v_month_permits from public.hr_leaves where employee_id = p_employee and kind = 'time_permit' and status in ('pending', 'approved')
        and date_trunc('month', start_date) = date_trunc('month', p_start);
      if v_month_permits >= app.hr_policy_int('permits_max_per_month', 999) then raise exception 'HR_PERMIT_MONTH_LIMIT'; end if;
    end if;
    v_days := 0;
  else
    v_days := (p_end - p_start) + 1;
    if lt.max_days_per_request is not null and v_days > lt.max_days_per_request then raise exception 'HR_LEAVE_TOO_LONG'; end if;
  end if;
  if exists (select 1 from public.hr_leaves x where x.employee_id = p_employee and x.status in ('pending', 'approved') and x.start_date <= p_end and x.end_date >= p_start
             and (x.kind = 'leave' or lt.kind = 'leave' or (x.start_time < p_end_time and x.end_time > p_start_time))) then
    raise exception 'HR_LEAVE_OVERLAP';
  end if;
  if lt.consumes_balance then
    bal := app.hr_balance_of(p_employee, extract(year from p_start)::int);
    v_cost := case when lt.kind = 'leave' then v_days else round(1.0 / app.hr_policy_int('permits_per_leave_day', 3), 3) end;
    if (bal ->> 'remaining')::numeric < v_cost then raise exception 'HR_BALANCE_INSUFFICIENT'; end if;
  end if;

  insert into public.hr_leaves (employee_id, kind, leave_type, leave_type_id, start_date, end_date, start_time, end_time, status, notes, created_by, requested_by, manager_id, days, minutes, attachment_path,
                                is_backdated, backdated_reason, backdated_days, backdated_prior_status)
  values (p_employee, lt.kind, lt.code, lt.id, p_start, p_end, p_start_time, p_end_time, 'pending', nullif(trim(coalesce(p_notes, '')), ''), auth.uid(), auth.uid(), e.manager_id, v_days, v_minutes, p_attachment,
          v_back > 0, case when v_back > 0 then trim(p_backdated_reason) end, v_back, case when v_back > 0 then v_prior end)
  returning id into v_id;
  if v_back > 0 then
    -- تنبيه HR عند تكرار الطلبات بأثر رجعي في الشهر (حد من التطوير المركزية)
    if v_bd_count >= v_bd_alert then
      for u in select ur.user_id from public.user_roles ur where ur.role = 'hr_officer' loop
        perform app.hr_notify(u, 'تكرار طلبات بأثر رجعي: ' || e.full_name, 'الطلب رقم ' || v_bd_count || ' بأثر رجعي هذا الشهر (الحد ' || v_bd_alert || ') — ' || lt.name || ' ليوم ' || p_start::text || ' · السبب: ' || trim(p_backdated_reason), '/hr/leaves', 'backdated_alert:' || v_id::text, 'warning');
      end loop;
    end if;
  end if;

  if chain.id is not null then
    v_chain := app.approval_open(lt.kind, v_id, e.user_id);
    update public.hr_leaves set chain_id = v_chain where id = v_id;
  else
    perform app.hr_notify(app.hr_manager_user(p_employee), case when v_back > 0 then '⚠ طلب بأثر رجعي: ' else 'طلب ' end || lt.name || ' بانتظار موافقتك',
      case when v_back > 0 then 'ليوم سابق قبل ' || v_back || ' يوم — السبب: ' || trim(p_backdated_reason) || ' · ' else '' end || e.full_name || ' · ' || p_start::text || case when lt.kind = 'leave' and p_end <> p_start then ' → ' || p_end::text else '' end
        || case when lt.kind = 'time_permit' then ' · ' || to_char(p_start_time, 'HH24:MI') || '–' || to_char(p_end_time, 'HH24:MI') else '' end,
      '/manager/leaves', 'leave_req:' || v_id::text, 'info');
  end if;
  return v_id;
end$$;
grant execute on function public.hr_leave_request(uuid, uuid, date, date, time, time, text, text, text) to authenticated;

-- ② الرصيد (لعرضه في نموذج الطلب)
create or replace function public.hr_leave_balance(p_employee uuid, p_year int default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare me uuid := app.current_employee_id();
begin
  if not (app.has_role(array['hr_officer', 'finance_officer', 'ops_room', 'super_admin']) or p_employee = me
          or exists (select 1 from public.employees e left join public.employees m on m.id = e.manager_id
                     where e.id = p_employee and (e.manager_id = me or m.manager_id = me))
          or app.garage_can_act_on(p_employee)) then
    raise exception 'HR_FORBIDDEN';
  end if;
  return app.hr_balance_of(p_employee, p_year);
end$$;

-- ③ القائمة: نطاق 'garage' = موظفو قسم الكراج وفروعه
drop function if exists public.hr_leaves_list(text, date, date, text, uuid, text, int);
create or replace function public.hr_leaves_list(p_scope text, p_from date default null, p_to date default null, p_status text default null, p_department uuid default null, p_search text default null, p_limit int default 500)
returns table(id uuid, employee_id uuid, employee_number text, full_name text, department_name text, kind text, type_code text, type_name text, is_paid boolean, consumes_balance boolean,
              start_date date, end_date date, start_time time, end_time time, days numeric, minutes int, status text, notes text, attachment_path text,
              manager_id uuid, manager_name text, requested_by uuid, decided_at timestamptz, decision_note text, cancelled_reason text, created_at timestamptz, can_decide boolean,
              is_backdated boolean, backdated_reason text, backdated_days int, can_cancel boolean)
language plpgsql stable security definer set search_path = public, app as $$
declare me uuid := app.current_employee_id(); g_scope uuid[];
begin
  if p_scope = 'garage' then
    if not app.has_role(array['central_garage_officer','ops_room','hr_officer','it_admin','super_admin','deputy_director','executive_director']) then raise exception 'GARAGE_FORBIDDEN'; end if;
    g_scope := app.disclosure_scope_depts();
  end if;
  return query
  select l.id, l.employee_id, e.employee_number, e.full_name, d.name, l.kind, lt.code, lt.name, lt.is_paid, lt.consumes_balance,
         l.start_date, l.end_date, l.start_time, l.end_time, l.days, l.minutes, l.status, l.notes, l.attachment_path,
         l.manager_id, m.full_name, l.requested_by, l.decided_at, l.decision_note, l.cancelled_reason, l.created_at,
         (l.status = 'pending' and app.hr_can_decide(l.id)), l.is_backdated, l.backdated_reason, l.backdated_days,
         (l.status = 'pending' and (l.requested_by = auth.uid() or app.has_role(array['hr_officer', 'super_admin']) or app.hr_can_decide(l.id)))
  from public.hr_leaves l
  join public.employees e on e.id = l.employee_id
  left join public.employees m on m.id = l.manager_id
  left join public.departments d on d.id = e.department_id
  left join public.hr_leave_types lt on lt.id = l.leave_type_id
  where case p_scope
          when 'mine' then l.employee_id = me
          when 'team' then (l.manager_id = me or e.manager_id = me or app.hr_can_decide(l.id))
          when 'garage' then (g_scope is null or e.department_id = any(g_scope))
          else app.has_role(array['hr_officer', 'ops_room', 'finance_officer', 'super_admin']) end
    and (p_from is null or l.end_date >= p_from) and (p_to is null or l.start_date <= p_to)
    and (p_status is null or l.status = p_status)
    and (p_department is null or e.department_id = p_department or e.department_id in (select dd.id from public.departments dd where dd.parent_id = p_department))
    and (p_search is null or e.full_name ilike '%' || p_search || '%' or e.employee_number ilike '%' || p_search || '%')
  order by (l.status = 'pending') desc, l.created_at desc
  limit p_limit;
end$$;
grant execute on function public.hr_leaves_list(text, date, date, text, uuid, text, int) to authenticated;

-- ④ الإلغاء: من أدخل الطلب (الكراج) يلغيه ما دام معلّقاً
create or replace function public.hr_leave_cancel(p_leave uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public, app as $$
declare l record; me uuid := app.current_employee_id(); d date;
begin
  select * into l from public.hr_leaves where id = p_leave;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  if l.status not in ('pending', 'approved') then raise exception 'HR_LEAVE_NOT_PENDING'; end if;
  if not (app.has_role(array['hr_officer', 'super_admin']) or l.employee_id = me or app.hr_can_decide(p_leave)
          or (l.status = 'pending' and l.requested_by = auth.uid())) then raise exception 'HR_FORBIDDEN'; end if;
  if l.status = 'approved' then
    if not app.has_role(array['hr_officer', 'super_admin']) and l.start_date <= current_date then raise exception 'HR_LEAVE_STARTED'; end if;
    if app.hr_month_locked(l.start_date) then raise exception 'HR_MONTH_LOCKED'; end if;
    if coalesce(trim(p_reason), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
    insert into public.hr_leave_ledger (employee_id, year, kind, days, leave_id, note, created_by)
    select employee_id, year, 'reversal', -days, leave_id, 'إلغاء: ' || trim(p_reason), auth.uid() from public.hr_leave_ledger where leave_id = p_leave and kind in ('consume', 'permit');
  end if;
  update public.hr_leaves set status = 'cancelled', cancelled_reason = nullif(trim(coalesce(p_reason, '')), ''), decided_by = coalesce(decided_by, auth.uid()) where id = p_leave;
  -- مهام سلسلة الموافقات المفتوحة تُغلق (لا تبقى معلّقة في لوحات المعتمِدين/الخط الزمني)
  update public.approval_tasks set status = 'skipped', note = coalesce(note, 'أُلغي الطلب من صاحبه/HR قبل اكتمال السلسلة')
   where request_kind = l.kind and request_id = l.id and status in ('pending', 'waiting');
  if l.status = 'approved' then
    d := l.start_date; while d <= l.end_date loop perform app.hr_evaluate_day(l.employee_id, d); d := d + 1; end loop;
    perform app.hr_refresh_alerts(l.employee_id, l.start_date); perform app.hr_refresh_alerts(l.employee_id, l.end_date);
  end if;
end$$;

-- ⑤ ملخص رأس الصفحة
create or replace function public.garage_leaves_summary() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare g_scope uuid[]; v_today date := app.hr_local_date(now()); r jsonb;
begin
  if not app.has_role(array['central_garage_officer','ops_room','hr_officer','it_admin','super_admin','deputy_director','executive_director']) then raise exception 'GARAGE_FORBIDDEN'; end if;
  g_scope := app.disclosure_scope_depts();
  select jsonb_build_object(
    'pending',        count(*) filter (where l.status = 'pending'),
    'my_decisions',   count(*) filter (where l.status = 'pending' and app.hr_can_decide(l.id)),
    'on_leave_today', count(*) filter (where l.status = 'approved' and l.kind = 'leave' and l.start_date <= v_today and l.end_date >= v_today),
    'permits_month',  count(*) filter (where l.status = 'approved' and l.kind = 'time_permit' and date_trunc('month', l.start_date) = date_trunc('month', v_today)),
    'scoped',         g_scope is not null)
  into r
  from public.hr_leaves l join public.employees e on e.id = l.employee_id
  where e.archived_at is null and (g_scope is null or e.department_id = any(g_scope))
    and l.end_date >= v_today - 60;
  return r;
end$$;
grant execute on function public.garage_leaves_summary() to authenticated;
