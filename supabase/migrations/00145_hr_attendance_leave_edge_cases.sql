-- ═══════════════════════════════════════════════════════════════
-- 00145 · تدقيق تداخلات الحضور والإجازات (حالات الحافة)
--   ① الإجازة المعتمدة تحكم اليوم: بصم أو لم يبصم → الحالة «إجازة» (لا غياب، لا نقص، لا استقطاع إلا إن كان النوع غير مدفوع).
--   ② زمنية معتمدة بلا أي بصمة في اليوم → غياب (الزمنية تغطي جزءاً من اليوم لا كله)؛ بصمة واحدة → ناقصة.
--   ③ الموظف بلا رقم بصمة لا يدخل اشتقاق الحضور إطلاقاً (لا صفوف غياب وهمية ولا استقطاعات)،
--      ولا يقدّم طلبات إجازة بنفسه (HR تُدخل نيابةً عند الحاجة) — رصيد الإجازات لموظفي البصمة.
--   ④ الحالة «إجازة» تحفظ أوقات البصمة إن وُجدت (للمراجعة) مع تصفير التأخير/المبكر.
-- ═══════════════════════════════════════════════════════════════

create or replace function app.hr_evaluate_day(p_employee uuid, p_date date)
returns void language plpgsql security definer set search_path = public, app as $$
declare
  sh record; tz interval := app.hr_tz();
  v_exp_in timestamptz; v_exp_out timestamptz; v_win_from timestamptz; v_win_to timestamptz;
  v_in timestamptz; v_out timestamptz; v_late int := 0; v_early int := 0; v_worked int := 0;
  v_rest boolean := false; v_status text; v_leave text; v_dow int; v_hired date; v_term date; v_pin text;
begin
  select hire_date, terminated_at, biometric_pin into v_hired, v_term, v_pin from public.employees where id = p_employee;
  if v_hired is null or p_date < v_hired or (v_term is not null and p_date > v_term) then return; end if;
  if v_pin is null then return; end if;   -- ③ بلا بصمة: لا حضور مشتق
  if exists (select 1 from public.hr_attendance_days where employee_id = p_employee and work_date = p_date and source = 'manual') then return; end if;

  select * into sh from app.hr_effective_shift(p_employee, p_date);
  v_dow := extract(dow from p_date)::int;
  if sh.shift_id is null then
    v_exp_in := (p_date::timestamp - tz); v_exp_out := v_exp_in + interval '24 hours';
    v_win_from := v_exp_in; v_win_to := v_exp_out;
  else
    v_rest := not (v_dow::smallint = any (sh.work_days));
    v_exp_in := (p_date + sh.start_time)::timestamp - tz;
    v_exp_out := (p_date + sh.end_time)::timestamp - tz;
    if v_exp_out <= v_exp_in then v_exp_out := v_exp_out + interval '1 day'; end if;
    v_win_from := v_exp_in - interval '4 hours'; v_win_to := v_exp_out + interval '4 hours';
  end if;

  select min(punched_at), max(punched_at) into v_in, v_out
  from public.biometric_punches where employee_id = p_employee and punched_at >= v_win_from and punched_at < v_win_to;
  if v_in = v_out then v_out := null; end if;

  select kind into v_leave from public.hr_leaves
  where employee_id = p_employee and status = 'approved' and p_date between start_date and end_date
  order by (kind = 'leave') desc limit 1;

  if sh.shift_id is not null and not v_rest then
    if v_in is not null then v_late := greatest(0, floor(extract(epoch from (v_in - v_exp_in)) / 60)::int - sh.grace_minutes); end if;
    if v_out is not null then v_early := greatest(0, floor(extract(epoch from (v_exp_out - v_out)) / 60)::int); end if;
  end if;
  if v_in is not null and v_out is not null then v_worked := floor(extract(epoch from (v_out - v_in)) / 60)::int; end if;

  v_status := app.hr_status_of(v_in, v_out, v_late, v_early, v_rest);
  if v_leave = 'leave' then
    -- ① الإجازة تحكم اليوم بصم أو لم يبصم
    v_status := 'leave'; v_late := 0; v_early := 0;
  elsif v_leave = 'time_permit' and v_in is not null and v_out is not null then
    -- ② الزمنية تُعتمد فقط مع حضور كامل (دخول+خروج)؛ بلا بصمة = غياب، بصمة واحدة = ناقصة
    v_status := 'time_permit'; v_late := 0; v_early := 0;
  end if;
  if v_rest and v_in is null then return; end if;   -- يوم راحة بلا بصمة: لا صف (حتى ضمن إجازة)

  insert into public.hr_attendance_days as d
    (employee_id, work_date, shift_name, expected_in, expected_out, check_in, check_out, late_minutes, early_minutes, worked_minutes, is_rest_day, status, source, updated_at)
  values (p_employee, p_date, sh.shift_name, case when sh.shift_id is null then null else v_exp_in end, case when sh.shift_id is null then null else v_exp_out end,
          v_in, v_out, v_late, v_early, v_worked, v_rest, v_status, 'auto', now())
  on conflict (employee_id, work_date) do update set
    shift_name = excluded.shift_name, expected_in = excluded.expected_in, expected_out = excluded.expected_out,
    check_in = excluded.check_in, check_out = excluded.check_out, late_minutes = excluded.late_minutes,
    early_minutes = excluded.early_minutes, worked_minutes = excluded.worked_minutes, is_rest_day = excluded.is_rest_day,
    status = excluded.status, updated_at = now()
  where d.source = 'auto';
end$$;

-- مشتقات اليوم: «إجازة» تُقيَّم قبل كل شيء (حتى لو بصم الموظف)
create or replace function app.hr_compute_day_metrics(p_employee uuid, p_date date) returns void
language plpgsql security definer set search_path = public, app as $$
declare a record; v_req int := 0; v_permit int := 0; v_short int := 0; v_ot int := 0; v_min int := 0; v_days numeric := 0; v_reason text := null;
        lt record; v_ot_block int := app.hr_policy_int('overtime_min_block_minutes', 30); v_grace int;
begin
  select * into a from public.hr_attendance_days where employee_id = p_employee and work_date = p_date;
  if not found then return; end if;
  if a.expected_in is not null and a.expected_out is not null then v_req := floor(extract(epoch from (a.expected_out - a.expected_in)) / 60)::int; end if;
  select coalesce(sum(l.minutes), 0) into v_permit from public.hr_leaves l join public.hr_leave_types t on t.id = l.leave_type_id
  where l.employee_id = p_employee and l.status = 'approved' and l.kind = 'time_permit' and l.start_date = p_date and t.is_paid;
  select t.* into lt from public.hr_leaves l join public.hr_leave_types t on t.id = l.leave_type_id
  where l.employee_id = p_employee and l.status = 'approved' and l.kind = 'leave' and p_date between l.start_date and l.end_date limit 1;

  if a.status = 'leave' then
    v_short := 0; v_permit := 0;
    if lt.id is not null and not lt.is_paid and not a.is_rest_day and v_req > 0 then v_days := lt.deduction_days_per_day; v_reason := lt.name; end if;
  elsif a.is_rest_day or v_req = 0 then
    v_short := 0;
  elsif a.status = 'absent' then
    v_short := v_req;
    v_days := app.hr_policy_num('absent_day_deduction_days', 1); v_reason := 'غياب بلا إجازة معتمدة';
  elsif a.status = 'incomplete' then
    v_short := 0;
    if app.hr_policy_bool('incomplete_punch_as_absent', false) then v_days := app.hr_policy_num('absent_day_deduction_days', 1); v_reason := 'بصمة ناقصة تُعامل كغياب'; end if;
  else
    v_short := greatest(0, v_req - a.worked_minutes - v_permit);
    if v_short > 0 then
      select o_minutes, o_days into v_min, v_days from app.hr_tier_for(v_short, v_req);
      if v_min > 0 or v_days > 0 then v_reason := 'نقص ' || v_short || ' دقيقة عن ساعات الشفت'; end if;
    end if;
    if app.hr_policy_bool('overtime_enabled', true) and a.check_out is not null and a.expected_out is not null and v_short = 0 then
      v_ot := greatest(0, a.worked_minutes + v_permit - v_req);
      if v_ot < v_ot_block then v_ot := 0; end if;
    end if;
  end if;
  v_grace := app.hr_policy_int('grace_minutes_default', 15);
  if a.status in ('present', 'late', 'early_leave', 'time_permit') and v_short <= v_grace then v_min := 0; v_days := 0; v_reason := null; end if;

  update public.hr_attendance_days set required_minutes = v_req, permit_minutes = v_permit, shortfall_minutes = v_short, overtime_minutes = v_ot,
    proposed_deduction_minutes = v_min, proposed_deduction_days = v_days, deduction_reason = v_reason
  where employee_id = p_employee and work_date = p_date;
end$$;

-- ③ الطلب الذاتي يتطلب رقم بصمة (HR تستطيع الإدخال نيابةً لأي موظف)
create or replace function public.hr_leave_request(p_employee uuid, p_type uuid, p_start date, p_end date, p_start_time time default null, p_end_time time default null,
                                                   p_notes text default null, p_attachment text default null)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare lt record; e record; me uuid := app.current_employee_id(); v_days numeric; v_minutes int := 0; v_id uuid; bal jsonb; v_cost numeric; v_max_min int; v_month_permits int;
begin
  select * into lt from public.hr_leave_types where id = p_type and is_active;
  if not found then raise exception 'HR_LEAVE_TYPE_INVALID'; end if;
  select * into e from public.employees where id = p_employee and archived_at is null;
  if not found or e.employment_status = 'terminated' then raise exception 'HR_NOT_FOUND'; end if;
  if not (app.has_role(array['hr_officer', 'super_admin']) or p_employee = me or (me is not null and e.manager_id = me)) then raise exception 'HR_FORBIDDEN'; end if;
  if e.biometric_pin is null and not app.has_role(array['hr_officer', 'super_admin']) then raise exception 'HR_NO_BIOMETRIC'; end if;
  if e.manager_id is null and not app.has_role(array['hr_officer', 'super_admin']) then raise exception 'HR_NO_MANAGER'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'HR_DATE_INVALID'; end if;
  if lt.requires_attachment and coalesce(p_attachment, '') = '' then raise exception 'HR_ATTACHMENT_REQUIRED'; end if;

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

  insert into public.hr_leaves (employee_id, kind, leave_type, leave_type_id, start_date, end_date, start_time, end_time, status, notes, created_by, requested_by, manager_id, days, minutes, attachment_path)
  values (p_employee, lt.kind, lt.code, lt.id, p_start, p_end, p_start_time, p_end_time, 'pending', nullif(trim(coalesce(p_notes, '')), ''), auth.uid(), auth.uid(), e.manager_id, v_days, v_minutes, p_attachment)
  returning id into v_id;

  perform app.hr_notify(app.hr_manager_user(p_employee), 'طلب ' || lt.name || ' بانتظار موافقتك',
    e.full_name || ' · ' || p_start::text || case when lt.kind = 'leave' and p_end <> p_start then ' → ' || p_end::text else '' end
      || case when lt.kind = 'time_permit' then ' · ' || to_char(p_start_time, 'HH24:MI') || '–' || to_char(p_end_time, 'HH24:MI') else '' end,
    '/manager/leaves', 'leave_req:' || v_id::text, 'info');
  return v_id;
end$$;

-- ⑤ الرصيد داخلياً بلا فحص صلاحية (تستخدمه الموافقة بالإنابة والطلب)، والواجهة العامة تفحص الصلاحية (تشمل مدير المدير)
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
    'permits_per_leave_day', app.hr_policy_int('permits_per_leave_day', 3));
end$$;

create or replace function public.hr_leave_balance(p_employee uuid, p_year int default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare me uuid := app.current_employee_id();
begin
  if not (app.has_role(array['hr_officer', 'finance_officer', 'ops_room', 'super_admin']) or p_employee = me
          or exists (select 1 from public.employees e left join public.employees m on m.id = e.manager_id
                     where e.id = p_employee and (e.manager_id = me or m.manager_id = me))) then
    raise exception 'HR_FORBIDDEN';
  end if;
  return app.hr_balance_of(p_employee, p_year);
end$$;

create or replace function public.hr_leave_decide(p_leave uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public, app as $$
declare l record; lt record; e record; v_cost numeric; bal jsonb; d date;
begin
  select * into l from public.hr_leaves where id = p_leave;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  if l.status <> 'pending' then raise exception 'HR_LEAVE_NOT_PENDING'; end if;
  if not app.hr_can_decide(p_leave) then raise exception 'HR_FORBIDDEN'; end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
  select * into lt from public.hr_leave_types where id = l.leave_type_id;
  select * into e from public.employees where id = l.employee_id;

  if p_approve then
    if app.hr_month_locked(l.start_date) or app.hr_month_locked(l.end_date) then raise exception 'HR_MONTH_LOCKED'; end if;
    if lt.consumes_balance then
      bal := app.hr_balance_of(l.employee_id, extract(year from l.start_date)::int);
      v_cost := case when lt.kind = 'leave' then l.days else round(1.0 / app.hr_policy_int('permits_per_leave_day', 3), 3) end;
      if (bal ->> 'remaining')::numeric < v_cost then raise exception 'HR_BALANCE_INSUFFICIENT'; end if;
      insert into public.hr_leave_ledger (employee_id, year, kind, days, leave_id, note, created_by)
      values (l.employee_id, extract(year from l.start_date)::int, case when lt.kind = 'leave' then 'consume' else 'permit' end, -v_cost, l.id, lt.name || ' ' || l.start_date::text, auth.uid());
    end if;
    update public.hr_leaves set status = 'approved', approved_by = auth.uid(), approved_at = now(), decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), '') where id = p_leave;
    d := l.start_date; while d <= l.end_date loop perform app.hr_evaluate_day(l.employee_id, d); d := d + 1; end loop;
    perform app.hr_refresh_alerts(l.employee_id, l.start_date); perform app.hr_refresh_alerts(l.employee_id, l.end_date);
    perform app.hr_notify(e.user_id, 'تمت الموافقة على ' || lt.name, l.start_date::text || case when l.end_date <> l.start_date then ' → ' || l.end_date::text else '' end, '/employee/requests', 'leave_dec:' || l.id::text, 'success');
  else
    update public.hr_leaves set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = trim(p_note) where id = p_leave;
    perform app.hr_notify(e.user_id, 'رُفض طلب ' || lt.name, trim(p_note), '/employee/requests', 'leave_dec:' || l.id::text, 'warning');
  end if;
end$$;
