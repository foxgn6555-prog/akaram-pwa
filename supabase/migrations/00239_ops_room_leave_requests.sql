-- 00239 — طلبات الإجازة من غرفة العمليات نيابةً عن أي موظف في ملاك HR (حتى بلا حساب أو بصمة)
-- الطلب يدخل سلسلة الموافقات الاعتيادية لذلك الموظف كما لو قدّمه بنفسه (لا اعتماد من غرفة العمليات)،
-- مع وسم «قُدِّم عبر غرفة العمليات» لكل من في السلسلة وفي القوائم + إشعار الموظف نفسه + تدقيق (requested_by).

-- ① جهة التقديم على الطلب
alter table public.hr_leaves add column if not exists requested_via text;
alter table public.hr_leaves drop constraint if exists hr_leaves_requested_via_check;
alter table public.hr_leaves add constraint hr_leaves_requested_via_check check (requested_via is null or requested_via in ('self','manager','hr','garage','ops_room','admin'));

create or replace function app.leave_via_label(p_via text) returns text language sql immutable as $$
  select case p_via when 'ops_room' then 'غرفة العمليات' when 'garage' then 'الكراج المركزي' when 'hr' then 'الموارد البشرية' when 'manager' then 'المدير المباشر' when 'admin' then 'إدارة النظام' else null end $$;
create or replace function app.leave_via_suffix(p_via text) returns text language sql immutable as $$
  select case when p_via in ('ops_room','garage','hr') then ' · قُدِّم عبر ' || app.leave_via_label(p_via) else '' end $$;

-- ② الطلب
CREATE OR REPLACE FUNCTION public.hr_leave_request(p_employee uuid, p_type uuid, p_start date, p_end date, p_start_time time without time zone DEFAULT NULL::time without time zone, p_end_time time without time zone DEFAULT NULL::time without time zone, p_notes text DEFAULT NULL::text, p_attachment text DEFAULT NULL::text, p_backdated_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
declare lt record; e record; me uuid := app.current_employee_id(); v_days numeric; v_minutes int := 0; v_id uuid; bal jsonb; v_cost numeric; v_max_min int; v_month_permits int;
        chain public.approval_chains; v_chain uuid; v_today date := app.hr_local_date(now()); v_back int := 0; v_prior text; v_hr boolean := app.has_role(array['hr_officer', 'super_admin']);
        v_bd_max int := app.hr_policy_int('backdated_max_days', 7); v_bd_count int := 0; v_bd_alert int := app.hr_policy_int('backdated_alert_per_month', 3); v_mgr uuid; v_title text; u uuid;
        v_ops boolean := app.has_role(array['ops_room']); v_via text;
begin
  select * into lt from public.hr_leave_types where id = p_type and is_active;
  if not found then raise exception 'HR_LEAVE_TYPE_INVALID'; end if;
  select * into e from public.employees where id = p_employee and archived_at is null;
  if not found or e.employment_status = 'terminated' then raise exception 'HR_NOT_FOUND'; end if;
  -- 00208: الكراج يقدّم الطلب نيابةً عن موظفي قسمه (سلسلة الموافقات كما هي)
  if not (app.has_role(array['hr_officer', 'super_admin']) or p_employee = me or (me is not null and e.manager_id is not distinct from me) or app.garage_can_act_on(p_employee) or v_ops) then raise exception 'HR_FORBIDDEN'; end if;   -- 00239: غرفة العمليات لأي موظف في الملاك   -- is not distinct from: مدير فارغ لا يُسقط الفحص
  if e.biometric_pin is null and not (app.has_role(array['hr_officer', 'super_admin']) or v_ops) then raise exception 'HR_NO_BIOMETRIC'; end if;   -- 00239: كـHR، غرفة العمليات تطلب لمن بلا بصمة أيضاً
  chain := app.approval_chain_for(e.user_id, lt.kind);
  if e.manager_id is null and chain.id is null and not app.has_role(array['hr_officer', 'super_admin']) then raise exception 'HR_NO_MANAGER'; end if;
  -- 00239: جهة التقديم (تظهر لكل من في السلسلة وفي القوائم)
  v_via := case when p_employee = me then 'self'
                when app.has_role(array['hr_officer']) then 'hr'
                when me is not null and e.manager_id is not distinct from me then 'manager'
                when app.garage_can_act_on(p_employee) then 'garage'
                when v_ops then 'ops_room'
                else 'admin' end;
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
                                is_backdated, backdated_reason, backdated_days, backdated_prior_status, requested_via)
  values (p_employee, lt.kind, lt.code, lt.id, p_start, p_end, p_start_time, p_end_time, 'pending', nullif(trim(coalesce(p_notes, '')), ''), auth.uid(), auth.uid(), e.manager_id, v_days, v_minutes, p_attachment,
          v_back > 0, case when v_back > 0 then trim(p_backdated_reason) end, v_back, case when v_back > 0 then v_prior end, v_via)
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
        || case when lt.kind = 'time_permit' then ' · ' || to_char(p_start_time, 'HH24:MI') || '–' || to_char(p_end_time, 'HH24:MI') else '' end || app.leave_via_suffix(v_via),
      '/manager/leaves', 'leave_req:' || v_id::text, 'info');
  end if;
  -- 00239: إعلام الموظف نفسه عندما يُقدَّم الطلب نيابةً عنه من غرفة العمليات
  if v_via = 'ops_room' and e.user_id is not null then
    perform app.hr_notify(e.user_id, 'قُدِّم طلب ' || lt.name || ' باسمك من غرفة العمليات', p_start::text || case when lt.kind = 'leave' and p_end <> p_start then ' → ' || p_end::text else '' end || ' · سيمرّ بسلسلة الموافقات المعتادة', '/employee/requests', 'leave_via_ops:' || v_id::text, 'info');
  end if;
  return v_id;
end$function$;

-- ③ القائمة: عمودان جديدان (جهة التقديم + اسم المُقدِّم)
drop function if exists public.hr_leaves_list(text, date, date, text, uuid, text, int);
CREATE OR REPLACE FUNCTION public.hr_leaves_list(p_scope text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_status text DEFAULT NULL::text, p_department uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 500)
 RETURNS TABLE(id uuid, employee_id uuid, employee_number text, full_name text, department_name text, kind text, type_code text, type_name text, is_paid boolean, consumes_balance boolean, start_date date, end_date date, start_time time without time zone, end_time time without time zone, days numeric, minutes integer, status text, notes text, attachment_path text, manager_id uuid, manager_name text, requested_by uuid, decided_at timestamp with time zone, decision_note text, cancelled_reason text, created_at timestamp with time zone, can_decide boolean, is_backdated boolean, backdated_reason text, backdated_days integer, can_cancel boolean, requested_via text, requester_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
declare me uuid := app.current_employee_id(); g_scope uuid[];
begin
  if p_scope = 'garage' then
    if not app.has_role(array['central_garage_officer','transfer_station','maintenance','ops_room','hr_officer','it_admin','super_admin','deputy_director','executive_director']) then raise exception 'GARAGE_FORBIDDEN'; end if;
    g_scope := app.disclosure_scope_depts();
  end if;
  return query
  select l.id, l.employee_id, e.employee_number, e.full_name, d.name, l.kind, lt.code, lt.name, lt.is_paid, lt.consumes_balance,
         l.start_date, l.end_date, l.start_time, l.end_time, l.days, l.minutes, l.status, l.notes, l.attachment_path,
         l.manager_id, m.full_name, l.requested_by, l.decided_at, l.decision_note, l.cancelled_reason, l.created_at,
         (l.status = 'pending' and app.hr_can_decide(l.id)), l.is_backdated, l.backdated_reason, l.backdated_days,
         (l.status = 'pending' and (l.requested_by = auth.uid() or app.has_role(array['hr_officer', 'super_admin']) or app.hr_can_decide(l.id))),
         l.requested_via, case when l.requested_by is not null and l.requested_by is distinct from e.user_id then app.manager_display_name(l.requested_by) end
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
end$function$;

-- ④ إشعار خطوات السلسلة يحمل جهة التقديم
CREATE OR REPLACE FUNCTION app.approval_notify_step(p_kind text, p_request uuid, p_step integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
declare t record; l record; u uuid; title text; body text; link text;
begin
  select * into t from public.approval_tasks where request_kind = p_kind and request_id = p_request and step_no = p_step;
  if t.id is null then return; end if;
  if p_kind = 'advance' then
    select a.* into l from public.advances a where a.id = p_request;
    title := 'طلب سلفة بانتظار قرارك (خطوة ' || p_step || ') — ' || l.type_name;
    body := l.employee_name || ' · ' || to_char(l.amount, 'FM999,999,999') || ' د.ع · ' || app.advance_method_label(l.repayment_method) || ' · ' || l.ref_no;
  elsif p_kind = 'disclosure' then
    select d.*, ty.label as type_label into l from public.disclosures d join public.disclosure_types ty on ty.key = d.violation_type where d.id = p_request;
    title := 'كشف بانتظار قرارك (خطوة ' || p_step || ') — ' || l.type_label;
    body := app.disclosure_target_label((select x from public.disclosures x where x.id = p_request)) || ' · ' || l.log_date::text || case when l.amount is not null then ' · ' || to_char(l.amount, 'FM999,999,999') || ' د.ع' else '' end || ' · أعدّه ' || coalesce(l.prepared_by_name, '');
  elsif p_kind = 'supplies' then
    select r.* into l from public.sector_supply_requests r where r.id = p_request;
    title := 'طلب مستلزمات بانتظار موافقتك (خطوة ' || p_step || ')';
    body := l.manager_name || ' · ' || coalesce(l.ref_no, '') || ' · ' || coalesce(app.supply_summary(l.items), l.supply_type);
  elsif p_kind = 'termination' then
    select r.* into l from public.termination_requests r where r.id = p_request;
    title := 'طلب إنهاء خدمة بانتظار موافقتك (خطوة ' || p_step || ')';
    body := l.target_name || ' (' || l.target_label || ') · ' || app.termination_type_label(l.termination_type) || ' · آخر يوم ' || l.last_day::text || ' · طلبه ' || app.manager_display_name(l.requester_user_id);
  else
    select l1.*, e.full_name, lt.name as type_name into l from public.hr_leaves l1 join public.employees e on e.id = l1.employee_id left join public.hr_leave_types lt on lt.id = l1.leave_type_id where l1.id = p_request;
    title := 'طلب ' || coalesce(l.type_name, 'إجازة') || ' بانتظار موافقتك (خطوة ' || p_step || ')';
    body := l.full_name || ' · ' || l.start_date::text || case when l.end_date <> l.start_date then ' → ' || l.end_date::text else '' end
            || case when l.kind = 'time_permit' then ' · ' || to_char(l.start_time, 'HH24:MI') || '–' || to_char(l.end_time, 'HH24:MI') else '' end || app.leave_via_suffix(l.requested_via);
  end if;
  foreach u in array t.approvers loop
    link := case when p_kind = 'disclosure' then (case when exists (select 1 from public.user_roles where user_id = u and role = 'deputy_director') then '/deputy/statements' when exists (select 1 from public.user_roles where user_id = u and role = 'super_admin') then '/admin/disclosures' else app.approval_link_for(u) end) else app.approval_link_for(u) end;
    perform app.hr_notify(u, title, body, link, 'approval:' || t.id::text, 'info');
  end loop;
end$function$;

-- ⑤ ملخص غرفة العمليات + بحث الموظفين (كل الملاك)
create or replace function public.ops_leaves_summary() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare v_today date := app.hr_local_date(now()); r jsonb;
begin
  if not app.has_role(array['ops_room','super_admin']) then raise exception 'OPS_ROOM_FORBIDDEN'; end if;
  select jsonb_build_object(
    'pending',         count(*) filter (where l.status = 'pending'),
    'via_ops_pending', count(*) filter (where l.status = 'pending' and l.requested_via = 'ops_room'),
    'via_ops_month',   count(*) filter (where l.requested_via = 'ops_room' and date_trunc('month', l.created_at at time zone 'Asia/Baghdad') = date_trunc('month', v_today)),
    'on_leave_today',  count(*) filter (where l.status = 'approved' and l.kind = 'leave' and l.start_date <= v_today and l.end_date >= v_today))
  into r from public.hr_leaves l;
  return r;
end$$;

create or replace function public.ops_leave_employee_lookup(p_q text) returns jsonb language sql stable security definer set search_path = public, app as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'full_name', e.full_name, 'employee_number', e.employee_number, 'job_title', e.job_title, 'department_name', d.name,
           'has_account', e.user_id is not null, 'has_biometric', e.biometric_pin is not null, 'manager_name', m.full_name) order by e.full_name), '[]'::jsonb)
  from (select * from public.employees e where e.archived_at is null and (e.employment_status is null or e.employment_status <> 'terminated')
          and (trim(coalesce(p_q, '')) = '' or e.full_name ilike '%' || trim(p_q) || '%' or e.employee_number ilike '%' || trim(p_q) || '%') order by e.full_name limit 20) e
  left join public.departments d on d.id = e.department_id
  left join public.employees m on m.id = e.manager_id
  where app.has_role(array['ops_room','super_admin']) $$;

revoke all on function public.ops_leaves_summary(), public.ops_leave_employee_lookup(text) from public, anon;
grant execute on function public.ops_leaves_summary(), public.ops_leave_employee_lookup(text), public.hr_leaves_list(text, date, date, text, uuid, text, int) to authenticated;
