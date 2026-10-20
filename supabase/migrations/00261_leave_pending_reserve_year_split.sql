-- 00261 · تدقيق الإجازات: (1) الطلبات المعلّقة لم تكن تُحجز من الرصيد ⇒ موظف رصيده 30 يقدّم 20 + 20 معلّقين ويُقبلان، ثم يفشل المدير بالموافقة على الثاني.
--   (2) إجازة تمتد بين سنتين (29/12 → 3/1) كانت تُخصم كلها من سنة البداية. الآن: تقسيم الكلفة على السنوات، وفحص الرصيد لكل سنة بعد خصم المعلّق.
--   «المتاح» = المتبقي − المحجوز للطلبات المعلّقة، ويظهر في الرصيد.

create or replace function app.hr_leave_cost_by_year(p_start date, p_end date, p_kind text) returns table(year int, days numeric)
language sql stable as $$
  select y::int, case when p_kind = 'leave' then count(*)::numeric else round(1.0 / app.hr_policy_int('permits_per_leave_day', 3), 3) end
  from generate_series(p_start, case when p_kind = 'leave' then p_end else p_start end, interval '1 day') d
  cross join lateral (select extract(year from d)::int as y) yy
  group by y order by y
$$;

create or replace function app.hr_leave_pending_reserved(p_employee uuid, p_year int, p_exclude uuid default null) returns numeric
language sql stable security definer set search_path = public, app as $$
  select coalesce(sum(c.days), 0)
  from public.hr_leaves l
  join public.hr_leave_types t on t.id = l.leave_type_id and t.consumes_balance
  cross join lateral app.hr_leave_cost_by_year(l.start_date, l.end_date, l.kind) c
  where l.employee_id = p_employee and l.status = 'pending' and c.year = p_year and (p_exclude is null or l.id <> p_exclude)
$$;

create or replace function app.hr_leave_check_balance(p_employee uuid, p_start date, p_end date, p_kind text, p_exclude uuid) returns void
language plpgsql security definer set search_path = public, app as $$
declare c record; bal jsonb; avail numeric;
begin
  for c in select * from app.hr_leave_cost_by_year(p_start, p_end, p_kind) loop
    bal := app.hr_balance_of(p_employee, c.year);
    avail := (bal ->> 'remaining')::numeric - app.hr_leave_pending_reserved(p_employee, c.year, p_exclude);
    if avail < c.days then raise exception 'HR_BALANCE_INSUFFICIENT'; end if;
  end loop;
end$$;

create or replace function app.hr_balance_of(p_employee uuid, p_year int) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare y int := coalesce(p_year, extract(year from current_date)::int); r record; v_mode text := app.hr_policy() ->> 'balance_mode'; v_accrued numeric;
begin
  perform app.hr_ensure_grant(p_employee, y);
  select
    coalesce(sum(days) filter (where kind = 'grant'), 0) as granted,
    coalesce(sum(days) filter (where kind = 'carry_over'), 0) as carried,
    coalesce(sum(days) filter (where kind = 'adjust'), 0) as adjusted,
    coalesce(-sum(days) filter (where kind = 'consume'), 0) as used_leave,
    coalesce(-sum(days) filter (where kind = 'permit'), 0) as used_permits_days,
    coalesce(sum(days) filter (where kind = 'overtime'), 0) as overtime_days,
    coalesce(sum(days) filter (where kind = 'reversal'), 0) as reversed,
    coalesce(sum(days), 0) as remaining
  into r from public.hr_leave_ledger where employee_id = p_employee and year = y;
  v_accrued := r.granted;
  if v_mode = 'monthly_accrual' and y = extract(year from current_date)::int then
    v_accrued := round(r.granted * extract(month from current_date) / 12, 2);
  end if;
  return jsonb_build_object('year', y, 'granted', r.granted, 'accrued', v_accrued, 'carried', r.carried, 'adjusted', r.adjusted,
    'used_leave_days', r.used_leave, 'used_permit_days', r.used_permits_days,
    'permits_count', (select count(*) from public.hr_leave_ledger where employee_id = p_employee and year = y and kind = 'permit'),
    'overtime_days', r.overtime_days, 'reversed', r.reversed,
    'remaining', case when v_mode = 'monthly_accrual' then r.remaining - (r.granted - v_accrued) else r.remaining end,
    'pending_reserved', app.hr_leave_pending_reserved(p_employee, y, null),
    'available', (case when v_mode = 'monthly_accrual' then r.remaining - (r.granted - v_accrued) else r.remaining end) - app.hr_leave_pending_reserved(p_employee, y, null),
    'permits_per_leave_day', app.hr_policy_int('permits_per_leave_day', 3));
end$$;

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
  if lt.consumes_balance then perform app.hr_leave_check_balance(p_employee, p_start, p_end, lt.kind, null); end if;   -- 00305: يحسب الطلبات المعلّقة ويقسم على السنوات

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

create or replace function public.hr_leave_decide(p_leave uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public, app as $$
declare l record; lt record; e record; v_cost numeric; bal jsonb; d date; final boolean := true; step_no int; u uuid;
begin
  select * into l from public.hr_leaves where id = p_leave;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  if l.status <> 'pending' then raise exception 'HR_LEAVE_NOT_PENDING'; end if;
  if not app.hr_can_decide(p_leave) then raise exception 'HR_FORBIDDEN'; end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
  select * into lt from public.hr_leave_types where id = l.leave_type_id;
  select * into e from public.employees where id = l.employee_id;

  if l.chain_id is not null then
    select t.step_no into step_no from public.approval_tasks t where t.request_kind = l.kind and t.request_id = l.id and t.status = 'pending' order by t.step_no limit 1;
    final := app.approval_decide(l.kind, l.id, p_approve, p_note);
    if p_approve and not final then
      perform app.hr_notify(e.user_id, 'وافقت خطوة ' || step_no || ' على طلب ' || lt.name, 'الطلب انتقل إلى الخطوة التالية في سلسلة الموافقات', '/employee/requests', 'approval_step:' || l.id::text || ':' || step_no, 'info');
      return;   -- الطلب يبقى معلّقاً حتى الخطوة الأخيرة
    end if;
  end if;

  if p_approve then
    if app.hr_month_locked(l.start_date) or app.hr_month_locked(l.end_date) then raise exception 'HR_MONTH_LOCKED'; end if;
    if lt.consumes_balance then
      perform app.hr_leave_check_balance(l.employee_id, l.start_date, l.end_date, lt.kind, l.id);   -- 00305
      insert into public.hr_leave_ledger (employee_id, year, kind, days, leave_id, note, created_by)
      select l.employee_id, c.year, case when lt.kind = 'leave' then 'consume' else 'permit' end, -c.days, l.id,
             lt.name || ' ' || l.start_date::text || case when l.end_date <> l.start_date then ' → ' || l.end_date::text else '' end, auth.uid()
      from app.hr_leave_cost_by_year(l.start_date, l.end_date, lt.kind) c;
    end if;
    update public.hr_leaves set status = 'approved', approved_by = auth.uid(), approved_at = now(), decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), '') where id = p_leave;
    d := l.start_date; while d <= l.end_date loop perform app.hr_evaluate_day(l.employee_id, d); d := d + 1; end loop;
    perform app.hr_refresh_alerts(l.employee_id, l.start_date); perform app.hr_refresh_alerts(l.employee_id, l.end_date);
    perform app.hr_notify(e.user_id, 'تمت الموافقة على ' || lt.name || case when l.is_backdated then ' (بأثر رجعي)' else '' end,
      l.start_date::text || case when l.end_date <> l.start_date then ' → ' || l.end_date::text else '' end || case when l.is_backdated then ' · صُحِّح سجل حضورك لذلك اليوم تلقائياً' else '' end, '/employee/requests', 'leave_dec:' || l.id::text, 'success');
    -- 00197 · بأثر رجعي: تبليغ غرفة العمليات لأن حضور يوم سابق تغيّر (قد يكون الشهر مدقَّقاً)
    if l.is_backdated then
      for u in select ur.user_id from public.user_roles ur where ur.role = 'ops_room' loop
        perform app.hr_notify(u, 'تصحيح حضور بأثر رجعي: ' || e.full_name, lt.name || ' ليوم ' || l.start_date::text || case when l.end_date <> l.start_date then ' → ' || l.end_date::text else '' end || ' اعتُمدت بأثر رجعي — تحقق من حضورية الشهر', '/ops/attendance', 'backdated_ops:' || l.id::text, 'info');
      end loop;
    end if;
  else
    update public.hr_leaves set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = trim(p_note) where id = p_leave;
    perform app.hr_notify(e.user_id, 'رُفض طلب ' || lt.name, trim(p_note), '/employee/requests', 'leave_dec:' || l.id::text, 'warning');
  end if;
end$$;
