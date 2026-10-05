-- ═══════════════════════════════════════════════════════════════════════════════
-- 00179 · جاهزية الحضور والرواتب للإنتاج (الجولة 2)
--  ① إعدادات محرك البصمة من بوابة التطوير المركزية: نافذة التقاط البصمات (ساعات)، تفعيل الاحتساب التلقائي،
--     عدد أيام إعادة الاحتساب في الاحتساب اليومي — كانت ثوابت في الكود (4 ساعات / يومان)
--  ② كشف المالية مكتمل: كل موظف على الملاك خلال الشهر يظهر في الكشف حتى بلا بصمات (كان يسقط من الكشف
--     من لا صفوف حضور له فلا يستلم راتبه) — مع استثناء المؤرشفين ومن أُنهيت خدمته قبل الشهر أو عُيّن بعده
--  ③ تفاصيل أيام الموظف للشهر لجهة المالية/العمليات/HR (شفافية الكشف)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── ① الإعدادات ──────────────────────────────────────────────────────────────
update public.hr_policy set settings = settings
  || jsonb_build_object('punch_window_hours', coalesce((settings ->> 'punch_window_hours')::int, 4))
  || jsonb_build_object('auto_evaluate_enabled', coalesce((settings ->> 'auto_evaluate_enabled')::boolean, true))
  || jsonb_build_object('evaluate_lookback_days', coalesce((settings ->> 'evaluate_lookback_days')::int, 2))
where id = 1;

create or replace function public.hr_policy_set(p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare cur jsonb; t jsonb; i int := 0; prev_to int := 0;
begin
  if not app.has_role(array['it_admin', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'HR_POLICY_INVALID'; end if;
  cur := app.hr_policy() || p_patch;
  if (cur ->> 'annual_leave_days_default')::numeric < 0 or (cur ->> 'permits_per_leave_day')::int < 1 or (cur ->> 'permit_max_minutes')::int < 15 then raise exception 'HR_POLICY_INVALID'; end if;
  if (cur ->> 'balance_mode') not in ('annual_upfront', 'monthly_accrual') then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce((cur ->> 'punch_window_hours')::int, 4) not between 1 and 12 then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce((cur ->> 'evaluate_lookback_days')::int, 2) not between 1 and 31 then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce((cur ->> 'grace_minutes_default')::int, 15) not between 0 and 120 then raise exception 'HR_POLICY_INVALID'; end if;
  if jsonb_typeof(cur -> 'deduction_tiers') <> 'array' or jsonb_array_length(cur -> 'deduction_tiers') = 0 then raise exception 'HR_TIERS_INVALID'; end if;
  for t in select * from jsonb_array_elements(cur -> 'deduction_tiers') loop
    i := i + 1;
    if (t ->> 'from')::int <> prev_to + 1 then raise exception 'HR_TIERS_INVALID'; end if;
    if (t ->> 'to') is not null then
      if (t ->> 'to')::int < (t ->> 'from')::int then raise exception 'HR_TIERS_INVALID'; end if;
      prev_to := (t ->> 'to')::int;
    elsif i <> jsonb_array_length(cur -> 'deduction_tiers') then raise exception 'HR_TIERS_INVALID'; end if;
    if (t ->> 'minutes') is null and (t ->> 'day_fraction') is null then raise exception 'HR_TIERS_INVALID'; end if;
  end loop;
  if (select (x ->> 'to') is not null from jsonb_array_elements(cur -> 'deduction_tiers') x offset (jsonb_array_length(cur -> 'deduction_tiers') - 1) limit 1) then raise exception 'HR_TIERS_INVALID'; end if;
  update public.hr_policy set settings = cur, updated_by = auth.uid(), updated_at = now() where id = 1;
  return cur;
end$$;

-- نافذة البصمات من الإعدادات
create or replace function app.hr_evaluate_day(p_employee uuid, p_date date)
returns void language plpgsql security definer set search_path = public, app as $$
declare
  sh record; tz interval := app.hr_tz();
  v_exp_in timestamptz; v_exp_out timestamptz; v_win_from timestamptz; v_win_to timestamptz;
  v_in timestamptz; v_out timestamptz; v_late int := 0; v_early int := 0; v_worked int := 0;
  v_win_h int := greatest(1, least(12, app.hr_policy_int('punch_window_hours', 4)));
  v_rest boolean := false; v_status text; v_leave text; v_dow int; v_hired date; v_term date; v_pin text;
begin
  select hire_date, terminated_at, biometric_pin into v_hired, v_term, v_pin from public.employees where id = p_employee;
  if v_hired is null or p_date < v_hired or (v_term is not null and p_date > v_term) then
    -- ⑤ خارج مدة الخدمة: يُزال أي صف تلقائي قديم (مثلاً بعد تصحيح تاريخ التعيين أو إنهاء الخدمة بأثر رجعي)
    delete from public.hr_attendance_days where employee_id = p_employee and work_date = p_date and source = 'auto';
    return;
  end if;
  if v_pin is null then return; end if;   -- بلا بصمة: لا حضور مشتق
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
    -- نافذة التقاط البصمات حول الدوام: من إعدادات بوابة التطوير المركزية (punch_window_hours، افتراضي 4)
    v_win_from := v_exp_in - make_interval(hours => v_win_h); v_win_to := v_exp_out + make_interval(hours => v_win_h);
  end if;

  select min(punched_at), max(punched_at) into v_in, v_out
  from public.biometric_punches where employee_id = p_employee and punched_at >= v_win_from and punched_at < v_win_to;
  if v_in = v_out then v_out := null; end if;

  select kind into v_leave from public.hr_leaves
  where employee_id = p_employee and status = 'approved' and p_date between start_date and end_date
  order by (kind = 'leave') desc limit 1;

  -- ① الدوام لم ينتهِ بعد (اليوم أو المستقبل) وبلا بصمة وبلا إجازة → لا حكم بعد؛ ونزيل أي صف تلقائي سابق
  if v_in is null and v_out is null and v_leave is distinct from 'leave' and now() < v_exp_out then
    delete from public.hr_attendance_days where employee_id = p_employee and work_date = p_date and source = 'auto';
    return;
  end if;

  -- ② الزمنيات المعتمدة لهذا اليوم تغطي ما يقع داخلها فقط: التأخير = ما بين بداية الدوام والدخول خارج أي زمنية،
  --    والخروج المبكر = ما بين الخروج ونهاية الدوام خارج أي زمنية (زمنية في منتصف اليوم لا تعذر تأخيراً في بدايته)
  if sh.shift_id is not null and not v_rest then
    if v_in is not null and v_in > v_exp_in then
      v_late := floor(extract(epoch from (v_in - v_exp_in)) / 60)::int - app.hr_permit_cover_minutes(p_employee, p_date, v_exp_in, v_in, sh.start_time, sh.end_time);
      v_late := greatest(0, v_late - sh.grace_minutes);
    end if;
    if v_out is not null and v_out < v_exp_out then
      v_early := floor(extract(epoch from (v_exp_out - v_out)) / 60)::int - app.hr_permit_cover_minutes(p_employee, p_date, v_out, v_exp_out, sh.start_time, sh.end_time);
      v_early := greatest(0, v_early);
    end if;
  end if;
  if v_in is not null and v_out is not null then v_worked := floor(extract(epoch from (v_out - v_in)) / 60)::int; end if;

  -- ④ فترة السماح تنطبق على الخروج المبكر أيضاً عند تحديد الحالة (كان خروج قبل دقيقة واحدة يُصنَّف «خروج مبكر»)؛ الدقائق الحقيقية تُحفظ
  v_status := app.hr_status_of(v_in, v_out, v_late, case when v_early > coalesce(sh.grace_minutes, 0) then v_early else 0 end, v_rest);
  if v_leave = 'leave' then
    v_status := 'leave'; v_late := 0; v_early := 0;
  elsif v_leave = 'time_permit' and v_in is not null and v_out is not null then
    -- الزمنية مع حضور كامل: الحالة «زمنية» إن لم يبقَ تأخير/خروج مبكر خارج تغطيتها، وإلا تبقى الحالة الحقيقية
    if v_late = 0 and v_early <= coalesce(sh.grace_minutes, 0) then v_status := 'time_permit'; end if;
  end if;
  if v_rest and v_in is null then return; end if;

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

-- الاحتساب التلقائي قابل للإيقاف من الإعدادات (الاحتساب اليدوي من HR/العمليات يبقى متاحاً)
create or replace function app.trg_biometric_punches_evaluate() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare r record; m record;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if not app.hr_policy_bool('auto_evaluate_enabled', true) then return null; end if;
  for r in
    select distinct n.employee_id, d.work_date
    from new_punches n
    cross join lateral (values (app.hr_local_date(n.punched_at)), (app.hr_local_date(n.punched_at) - 1)) as d(work_date)
    where n.employee_id is not null
  loop
    perform app.hr_evaluate_day_safe(r.employee_id, r.work_date);
  end loop;
  for m in
    select distinct n.employee_id, date_trunc('month', app.hr_local_date(n.punched_at))::date as month
    from new_punches n where n.employee_id is not null
  loop
    begin perform app.hr_refresh_alerts(m.employee_id, m.month); exception when others then null; end;
  end loop;
  return null;
end$$;

create or replace function app.hr_evaluate_daily() returns integer
language plpgsql security definer set search_path = public, app as $$
declare today date := app.hr_local_date(now()); e record; d date; n int := 0; back int := greatest(1, least(31, app.hr_policy_int('evaluate_lookback_days', 2)));
begin
  if not app.hr_policy_bool('auto_evaluate_enabled', true) then
    insert into public.integration_logs (provider, direction, endpoint, status, payload)
    values ('biometric', 'inbound', 'hr_evaluate_daily', 'success', jsonb_build_object('skipped', true, 'reason', 'auto_evaluate_disabled', 'local_date', today));
    return 0;
  end if;
  for e in select id from public.employees
           where archived_at is null and biometric_pin is not null
             and (employment_status <> 'terminated' or (terminated_at is not null and terminated_at >= today - back)) loop
    d := today - back;
    while d <= today loop
      if app.hr_evaluate_day_safe(e.id, d) then n := n + 1; end if;
      d := d + 1;
    end loop;
    begin perform app.hr_refresh_alerts(e.id, today); exception when others then null; end;
    if extract(day from today) <= back then
      begin perform app.hr_refresh_alerts(e.id, today - back); exception when others then null; end;
    end if;
  end loop;
  insert into public.integration_logs (provider, direction, endpoint, status, payload)
  values ('biometric', 'inbound', 'hr_evaluate_daily', 'success', jsonb_build_object('days_evaluated', n, 'local_date', today, 'lookback_days', back));
  return n;
end$$;

-- ─── ② ملخص الشهر يشمل كل موظفي الملاك ─────────────────────────────────────────
create or replace function app.hr_month_summary(p_month date)
returns table(employee_id uuid, working_days int, days_present int, days_late int, days_absent int, days_incomplete int,
              days_leave int, late_minutes int, early_minutes int, ded_amount numeric, ded_days numeric, ded_reasons text,
              auto_minutes int, auto_days numeric, shift_minutes int, overtime_minutes int, shortfall_minutes int)
language sql stable security definer set search_path = public, app as $$
  with m as (select date_trunc('month', p_month)::date as f, (date_trunc('month', p_month) + interval '1 month - 1 day')::date as t),
  staff as (
    -- على الملاك خلال الشهر: عُيّن قبل نهايته ولم تُنهَ خدمته قبل بدايته، وغير مؤرشف
    select e.id as employee_id from public.employees e, m
    where e.archived_at is null and e.hire_date <= m.t
      and (e.employment_status <> 'terminated' or e.terminated_at is null or e.terminated_at >= m.f)),
  att as (
    select a.employee_id,
      count(*) filter (where not a.is_rest_day)::int as working_days,
      count(*) filter (where a.status in ('present', 'late', 'early_leave', 'time_permit'))::int as days_present,
      count(*) filter (where a.status = 'late')::int as days_late,
      count(*) filter (where a.status = 'absent')::int as days_absent,
      count(*) filter (where a.status = 'incomplete')::int as days_incomplete,
      count(*) filter (where a.status = 'leave')::int as days_leave,
      coalesce(sum(a.late_minutes), 0)::int as late_minutes, coalesce(sum(a.early_minutes), 0)::int as early_minutes,
      coalesce(sum(a.proposed_deduction_minutes) filter (where not a.deduction_waived), 0)::int as auto_minutes,
      coalesce(sum(a.proposed_deduction_days) filter (where not a.deduction_waived), 0) as auto_days,
      coalesce(nullif(max(a.required_minutes), 0), 480)::int as shift_minutes,
      coalesce(sum(a.overtime_minutes), 0)::int as overtime_minutes,
      coalesce(sum(a.shortfall_minutes), 0)::int as shortfall_minutes
    from public.hr_attendance_days a, m where a.work_date between m.f and m.t group by a.employee_id),
  ded as (
    select d.employee_id, sum(d.amount) as amt, sum(d.days) as dys, string_agg(d.reason, ' · ' order by d.created_at) as reasons
    from public.hr_attendance_deductions d, m where d.period_month = m.f group by d.employee_id),
  ids as (select employee_id from staff union select employee_id from att union select employee_id from ded)
  select ids.employee_id, coalesce(att.working_days, 0), coalesce(att.days_present, 0), coalesce(att.days_late, 0),
         coalesce(att.days_absent, 0), coalesce(att.days_incomplete, 0), coalesce(att.days_leave, 0), coalesce(att.late_minutes, 0),
         coalesce(att.early_minutes, 0), coalesce(ded.amt, 0), coalesce(ded.dys, 0), ded.reasons,
         coalesce(att.auto_minutes, 0), coalesce(att.auto_days, 0), coalesce(att.shift_minutes, 480), coalesce(att.overtime_minutes, 0), coalesce(att.shortfall_minutes, 0)
  from ids left join att on att.employee_id = ids.employee_id left join ded on ded.employee_id = ids.employee_id
$$;

-- ─── ③ تفاصيل أيام الموظف للشهر ──────────────────────────────────────────────
create or replace function public.hr_employee_month_days(p_employee uuid, p_month date)
returns table(work_date date, shift_name text, expected_in timestamptz, expected_out timestamptz, check_in timestamptz, check_out timestamptz,
  late_minutes int, early_minutes int, worked_minutes int, is_rest_day boolean, status text, source text, edit_reason text,
  permit_minutes int, shortfall_minutes int, overtime_minutes int, proposed_deduction_minutes int, proposed_deduction_days numeric, deduction_waived boolean, waive_reason text)
language sql stable security definer set search_path = public, app as $$
  select a.work_date, a.shift_name, a.expected_in, a.expected_out, a.check_in, a.check_out, a.late_minutes, a.early_minutes, a.worked_minutes, a.is_rest_day,
         a.status, a.source, a.edit_reason, a.permit_minutes, a.shortfall_minutes, a.overtime_minutes, a.proposed_deduction_minutes, a.proposed_deduction_days, a.deduction_waived, a.waive_reason
  from public.hr_attendance_days a
  where app.has_role(array['hr_officer', 'ops_room', 'finance_officer', 'it_admin', 'super_admin'])
    and a.employee_id = p_employee
    and a.work_date >= date_trunc('month', p_month)::date and a.work_date < (date_trunc('month', p_month) + interval '1 month')::date
  order by a.work_date
$$;
grant execute on function public.hr_employee_month_days(uuid, date) to authenticated;
