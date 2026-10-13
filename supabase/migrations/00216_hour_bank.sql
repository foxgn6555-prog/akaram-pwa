-- 00216 · بنك الساعات الشهري (Hours Bank) — بديل الاستقطاع اليومي المقترح على النقص
--   ① طريقة احتساب نقص جديدة في وحدة الاستقطاعات التلقائية (التطوير المركزية): shortfall_method = 'hour_bank'
--      + إعدادان: hour_bank_credit_cap_days (سقف تحويل الفائض إلى رصيد إجازة شهرياً، افتراضي 2 يوم)
--                 hour_bank_off_days_per_month (أيام الإجازة الشهرية المطروحة من المطلوب؛ فارغ ⇒ annual_leave_days_default ÷ 12)
--   ② المطلوب شهرياً = الأصغر بين (أيام الفترة المغطاة − الراحة − أيام الإجازة الشهرية × نسبة التغطية) وأيام الحضور الفعلي، × دقائق الشفت
--      الرصيد اليومي = المعمول − المطلوب (±): تأخير ضمن السماحية ⇒ اليوم كامل؛ تجاوزها ⇒ تُحتسب كل الدقائق، ويعوّضها البقاء الأطول في أي يوم
--      صافي الشهر سالب ⇒ تُستقطع ساعات العجز فقط (أجر الدقيقة = أجر اليوم ÷ دقائق الشفت)؛ موجب ⇒ لا استقطاع، والفائض رصيد إجازة (ساعات الشفت = يوم) بسقف
--      الغياب بلا إجازة = يوم كامل خارج البنك (كما كان). الإجازة المدفوعة/الزمنية المدفوعة لا تُستقطع (كما كان).
--   ③ المحرّك اليومي لا يقترح استقطاعاً على النقص في هذه الطريقة (السبب يوضّح أنه يُصفّى شهرياً)، والتصدير يحتسب الصافي ويكتب أعمدة البنك.

-- ── ① الإعدادات ──
create or replace function app.hr_deduction_keys() returns text[] language sql immutable as $$
  select array['auto_deduction_enabled','deduct_absence_enabled','deduct_shortfall_enabled','deduct_unpaid_leave_enabled','deduction_tiers','absent_day_deduction_days',
               'incomplete_punch_as_absent','grace_minutes_default','auto_deduction_amount_mode','fixed_absent_day_amount','fixed_shortfall_minute_amount',
               'max_auto_deduction_days_per_month','auto_deduction_cap_ratio','shortfall_method','shortfall_multiplier','shortfall_block_minutes',
               'hour_bank_credit_cap_days','hour_bank_off_days_per_month']
$$;
create or replace function app.hr_deduction_defaults() returns jsonb language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'auto_deduction_enabled', true, 'deduct_absence_enabled', true, 'deduct_shortfall_enabled', true, 'deduct_unpaid_leave_enabled', true,
    'deduction_tiers', '[{"from":1,"to":15,"minutes":0},{"from":16,"to":30,"minutes":30},{"from":31,"to":60,"minutes":60},{"from":61,"to":120,"minutes":120},{"from":121,"to":null,"day_fraction":0.5}]'::jsonb,
    'absent_day_deduction_days', 1, 'incomplete_punch_as_absent', false, 'grace_minutes_default', 15, 'auto_deduction_amount_mode', 'salary',
    'fixed_absent_day_amount', 0, 'fixed_shortfall_minute_amount', 0, 'max_auto_deduction_days_per_month', 0, 'auto_deduction_cap_ratio', 1,
    'shortfall_method', 'tiers', 'shortfall_multiplier', 1, 'shortfall_block_minutes', 30,
    'hour_bank_credit_cap_days', 2, 'hour_bank_off_days_per_month', null)
  || coalesce((select jsonb_object_agg(k, v) from jsonb_each(app.hr_policy()) kv(k, v) where k = any (app.hr_deduction_keys())), '{}'::jsonb)
$$;

create or replace function app.hr_deduction_validate(s jsonb) returns void language plpgsql immutable as $$
declare t jsonb; i int := 0; prev_to int := 0; n int; v_method text := coalesce(s ->> 'shortfall_method', 'tiers');
begin
  if s is null or jsonb_typeof(s) <> 'object' then raise exception 'HR_RULE_INVALID'; end if;
  if v_method not in ('tiers', 'actual', 'multiplier', 'blocks', 'hour_bank') then raise exception 'HR_RULE_INVALID'; end if;
  if coalesce((s ->> 'shortfall_multiplier')::numeric, 1) not between 0.25 and 5 then raise exception 'HR_RULE_INVALID'; end if;
  if coalesce((s ->> 'shortfall_block_minutes')::int, 30) not between 5 and 240 then raise exception 'HR_RULE_INVALID'; end if;
  if coalesce((s ->> 'hour_bank_credit_cap_days')::numeric, 2) not between 0 and 15 then raise exception 'HR_RULE_INVALID'; end if;
  if (s ->> 'hour_bank_off_days_per_month') is not null and (s ->> 'hour_bank_off_days_per_month')::numeric not between 0 and 15 then raise exception 'HR_RULE_INVALID'; end if;
  if jsonb_typeof(s -> 'deduction_tiers') <> 'array' or jsonb_array_length(s -> 'deduction_tiers') = 0 then raise exception 'HR_TIERS_INVALID'; end if;
  n := jsonb_array_length(s -> 'deduction_tiers');
  for t in select * from jsonb_array_elements(s -> 'deduction_tiers') loop
    i := i + 1;
    if (t ->> 'from')::int <> prev_to + 1 then raise exception 'HR_TIERS_INVALID'; end if;
    if (t ->> 'to') is not null then
      if (t ->> 'to')::int < (t ->> 'from')::int then raise exception 'HR_TIERS_INVALID'; end if;
      prev_to := (t ->> 'to')::int;
    elsif i <> n then raise exception 'HR_TIERS_INVALID'; end if;
    if coalesce((t ->> 'minutes')::int, 0) < 0 or coalesce((t ->> 'day_fraction')::numeric, 0) < 0 or coalesce((t ->> 'day_fraction')::numeric, 0) > 1 then raise exception 'HR_TIERS_INVALID'; end if;
  end loop;
  if (select (x ->> 'to') is not null from jsonb_array_elements(s -> 'deduction_tiers') x offset (n - 1) limit 1) then raise exception 'HR_TIERS_INVALID'; end if;
  if coalesce((s ->> 'absent_day_deduction_days')::numeric, 1) not between 0 and 3 then raise exception 'HR_RULE_INVALID'; end if;
  if coalesce((s ->> 'grace_minutes_default')::int, 15) not between 0 and 120 then raise exception 'HR_RULE_INVALID'; end if;
  if coalesce(s ->> 'auto_deduction_amount_mode', 'salary') not in ('salary', 'fixed') then raise exception 'HR_RULE_INVALID'; end if;
  if coalesce((s ->> 'fixed_absent_day_amount')::numeric, 0) < 0 or coalesce((s ->> 'fixed_shortfall_minute_amount')::numeric, 0) < 0 then raise exception 'HR_RULE_INVALID'; end if;
  if coalesce((s ->> 'max_auto_deduction_days_per_month')::numeric, 0) not between 0 and 31 then raise exception 'HR_RULE_INVALID'; end if;
  if coalesce((s ->> 'auto_deduction_cap_ratio')::numeric, 1) not between 0 and 1 then raise exception 'HR_RULE_INVALID'; end if;
end$$;

-- ── ② ميزان بنك الساعات لموظف في شهر ──
create or replace function app.hr_hour_bank(p_employee uuid, p_month date)
returns table(enabled boolean, shift_minutes int, off_days numeric, days_in_month int, covered_days int, rest_days int, required_days numeric,
              required_minutes int, credited_minutes int, net_minutes int, deduction_minutes int, surplus_minutes int,
              credit_days numeric, credit_cap_days numeric, credit_capped boolean, grace_minutes int,
              days_counted int, days_absent int, days_leave_paid int, days_leave_unpaid int, days_incomplete int)
language plpgsql stable security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; m_to date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
        rl jsonb := app.hr_deduction_rule_for(p_employee, m); per record; sh record;
        v_on boolean; v_grace int; v_cap numeric; v_off numeric; v_shift int; v_req_days numeric; v_req int; v_cred int := 0;
        v_rest int := 0; v_cnt int := 0; v_abs int := 0; v_lp int := 0; v_lu int := 0; v_inc int := 0; v_inc_pay boolean; v_net int; v_raw_days numeric;
begin
  v_on := coalesce(rl ->> 'shortfall_method', 'tiers') = 'hour_bank'
          and coalesce((rl ->> 'auto_deduction_enabled')::boolean, true) and coalesce((rl ->> 'deduct_shortfall_enabled')::boolean, true);
  v_grace := coalesce((rl ->> 'grace_minutes_default')::int, 15);
  v_cap := coalesce((rl ->> 'hour_bank_credit_cap_days')::numeric, 2);
  v_off := coalesce((rl ->> 'hour_bank_off_days_per_month')::numeric, round(app.hr_policy_num('annual_leave_days_default', 30) / 12, 4));
  v_inc_pay := app.hr_incomplete_payable(p_employee, m);
  select * into per from app.hr_month_period(m) p where p.employee_id = p_employee;
  if not found then per := null; end if;
  -- دقائق الشفت: أعلى «مطلوب» في أيام الشهر، وإلا شفت الموظف الفعّال (المرن: ساعاته المطلوبة)، وإلا 480
  select coalesce(nullif(max(a.required_minutes), 0), 0) into v_shift from public.hr_attendance_days a where a.employee_id = p_employee and a.work_date between m and m_to and not a.is_rest_day;
  if v_shift = 0 then
    select * into sh from app.hr_effective_shift(p_employee, coalesce(per.period_from, m));
    if found then
      v_shift := case when sh.kind = 'flexible' and sh.required_hours is not null then round(sh.required_hours * 60)::int
                      else floor(extract(epoch from (sh.end_time - sh.start_time)) / 60)::int end;
      if v_shift <= 0 then v_shift := v_shift + 1440; end if;
    end if;
    if coalesce(v_shift, 0) <= 0 then v_shift := 480; end if;
  end if;
  select count(*) filter (where a.is_rest_day), count(*) filter (where a.status = 'absent' and not a.is_rest_day),
         count(*) filter (where a.status = 'incomplete' and not a.is_rest_day),
         count(*) filter (where a.status = 'leave' and not a.is_rest_day and lp.paid), count(*) filter (where a.status = 'leave' and not a.is_rest_day and not lp.paid),
         count(*) filter (where a.status in ('present', 'late', 'early_leave', 'time_permit') and not a.is_rest_day),
         coalesce(sum(case
           when a.is_rest_day then 0
           when a.status in ('present', 'late', 'early_leave', 'time_permit') then
             -- رصيد اليوم: المطلوب − النقص (بعد الزمنية المدفوعة) + الفائض فوق المطلوب؛ نقصٌ ضمن السماحية أو إعفاء غرفة العمليات ⇒ يوم كامل
             case when a.shortfall_minutes <= v_grace or a.deduction_waived
                  then greatest(a.required_minutes, a.required_minutes - a.shortfall_minutes + greatest(0, a.worked_minutes - a.required_minutes))
                  else a.required_minutes - a.shortfall_minutes + greatest(0, a.worked_minutes - a.required_minutes) end
           when a.status = 'incomplete' and v_inc_pay then a.required_minutes   -- بصمة ناقصة تُعدّ حاضراً (حسب قاعدة الموظف)
           else 0 end), 0)::int
    into v_rest, v_abs, v_inc, v_lp, v_lu, v_cnt, v_cred
  from public.hr_attendance_days a
  cross join lateral (select exists (
      select 1 from public.hr_leaves l join public.hr_leave_types t on t.id = l.leave_type_id
      where l.employee_id = a.employee_id and l.status = 'approved' and l.kind = 'leave' and t.is_paid and a.work_date between l.start_date and l.end_date) as paid) lp
  where a.employee_id = p_employee and a.work_date between m and m_to;
  -- أيام المطلوب = الأصغر بين: (الأيام المغطاة − الراحة − أيام الإجازة الشهرية × نسبة التغطية) وبين الأيام التي حضرها فعلاً
  --   ⇒ من داوم كل أيام الشهر يكسب أيام الإجازة الشهرية فائضاً؛ ومن غاب/أخذ إجازة أكثر منها لا يُحاسَب مرتين (الغياب يوم كامل خارج البنك،
  --      والإجازة المدفوعة محسومة من رصيده، وغير المدفوعة تُستقطع يوماً كاملاً خارج البنك)
  v_req_days := greatest(0, least(coalesce(per.covered_days, 0) - v_rest - round(v_off * coalesce(per.covered_days, 0) / greatest(coalesce(per.days_in_month, 30), 1), 4),
                                  (v_cnt + case when v_inc_pay then v_inc else 0 end)::numeric));
  v_req := round(v_req_days * v_shift)::int;
  v_net := v_cred - v_req;
  v_raw_days := round(greatest(0, v_net)::numeric / greatest(v_shift, 1), 3);
  return query select v_on, v_shift, v_off, coalesce(per.days_in_month, 0), coalesce(per.covered_days, 0), v_rest, round(v_req_days, 4),
    v_req, v_cred, v_net, greatest(0, -v_net), greatest(0, v_net),
    least(v_raw_days, v_cap), v_cap, v_raw_days > v_cap, v_grace, v_cnt, v_abs, v_lp, v_lu, v_inc;
end$$;

-- ── ③ أعمدة البنك في كشف التصدير ──
alter table public.hr_month_export_rows
  add column if not exists hour_bank_enabled          boolean not null default false,
  add column if not exists hour_bank_required_minutes integer,
  add column if not exists hour_bank_credited_minutes integer,
  add column if not exists hour_bank_net_minutes      integer,
  add column if not exists hour_bank_credit_days      numeric(7, 3);

-- فائض البنك ⇒ رصيد إجازة (نفس دفتر «overtime» الشهري؛ إعادة التصدير تحدّث القيد، وزواله يحذفه)
create or replace function app.hr_hour_bank_credit(p_month date) returns int
language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; r record; hb record; n int := 0;
begin
  for r in select s.employee_id from app.hr_month_summary(m) s loop
    select * into hb from app.hr_hour_bank(r.employee_id, m);
    if not hb.enabled then continue; end if;
    if hb.credit_days > 0 then
      insert into public.hr_leave_ledger (employee_id, year, kind, days, period_month, note)
      values (r.employee_id, extract(year from m)::int, 'overtime', hb.credit_days, m,
              'بنك الساعات ' || to_char(m, 'YYYY-MM') || ': فائض ' || hb.surplus_minutes || ' دقيقة = ' || hb.credit_days || ' يوم'
              || case when hb.credit_capped then ' (بلغ السقف الشهري ' || hb.credit_cap_days || ' يوم)' else '' end)
      on conflict (employee_id, period_month) where kind = 'overtime' do update set days = excluded.days, note = excluded.note;
      n := n + 1;
    else
      delete from public.hr_leave_ledger l where l.employee_id = r.employee_id and l.period_month = m and l.kind = 'overtime' and l.note like 'بنك الساعات%';
    end if;
  end loop;
  return n;
end$$;

-- تطبيق البنك على صفوف التصدير: دقائق العجز الصافية فقط × أجر الدقيقة (أو المبلغ الثابت للدقيقة)، بسقف نسبة الاستقطاع نفسها
create or replace function app.hr_hour_bank_apply_export(p_export uuid, p_month date) returns int
language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; n int := 0;
begin
  update public.hr_month_export_rows r set
    hour_bank_enabled = true, hour_bank_required_minutes = c.required_minutes, hour_bank_credited_minutes = c.credited_minutes,
    hour_bank_net_minutes = c.net_minutes, hour_bank_credit_days = c.credit_days,
    auto_deduction_minutes = c.deduction_minutes, shift_minutes = c.shift_minutes,
    auto_deduction_amount = c.new_auto, auto_deduction_capped = c.capped,
    auto_deduction_basis = case when r.auto_deduction_basis = 'disabled' then 'disabled' else 'hour_bank' end,
    deductions_total = case when r.deductions_total is null then null else round(r.deductions_total - r.auto_deduction_amount + c.new_auto, 2) end,
    proposed_net = case when r.gross_amount is null then null else greatest(0, round(r.gross_amount - (r.deductions_total - r.auto_deduction_amount + c.new_auto), 2)) end,
    final_net = case when r.gross_amount is null then null else greatest(0, round(r.gross_amount - (r.deductions_total - r.auto_deduction_amount + c.new_auto), 2)) end
  from (
    select x.id, hb.*, y.raw > y.cap as capped, least(y.raw, y.cap) as new_auto
    from public.hr_month_export_rows x
    cross join lateral app.hr_hour_bank(x.employee_id, m) hb
    cross join lateral app.hr_deduction_rule_for(x.employee_id, m) rl(j)
    cross join lateral (
      select case when not coalesce((rl.j ->> 'auto_deduction_enabled')::boolean, true) then 0
                  when coalesce(rl.j ->> 'auto_deduction_amount_mode', 'salary') = 'fixed' then round(coalesce((rl.j ->> 'fixed_shortfall_minute_amount')::numeric, 0) * hb.deduction_minutes, 2)
                  else round(round(coalesce(x.day_rate, 0) / greatest(hb.shift_minutes, 1), 4) * hb.deduction_minutes, 2) end
             + coalesce(x.auto_deduction_amount, 0) as raw,   -- + ما احتُسب أصلاً (أيام الغياب/الإجازة غير المدفوعة)
             round(coalesce((rl.j ->> 'auto_deduction_cap_ratio')::numeric, 1) * coalesce(x.gross_amount, 0), 2) as cap) y
    where x.export_id = p_export and hb.enabled) c
  where r.id = c.id;
  get diagnostics n = row_count;
  return n;
end$$;

-- ── ④ ميزان الشهر لكل الموظفين (غرفة العمليات تراه قبل التأكيد؛ المالية/الموارد/التطوير للاطلاع) ──
create or replace function public.ops_hour_bank_month(p_month date)
returns table(employee_id uuid, employee_number text, full_name text, department_name text, enabled boolean, shift_minutes int, off_days numeric,
              covered_days int, days_counted int, days_absent int, days_leave_paid int, days_leave_unpaid int, required_days numeric,
              required_minutes int, credited_minutes int, net_minutes int, deduction_minutes int, surplus_minutes int,
              credit_days numeric, credit_cap_days numeric, credit_capped boolean, grace_minutes int)
language sql stable security definer set search_path = public, app as $$
  select e.id, e.employee_number, e.full_name, d.name, hb.enabled, hb.shift_minutes, hb.off_days,
         hb.covered_days, hb.days_counted, hb.days_absent, hb.days_leave_paid, hb.days_leave_unpaid, hb.required_days,
         hb.required_minutes, hb.credited_minutes, hb.net_minutes, hb.deduction_minutes, hb.surplus_minutes,
         hb.credit_days, hb.credit_cap_days, hb.credit_capped, hb.grace_minutes
  from app.hr_month_summary(p_month) s
  join public.employees e on e.id = s.employee_id
  left join public.departments d on d.id = e.department_id
  cross join lateral app.hr_hour_bank(e.id, p_month) hb
  where app.has_role(array['ops_room', 'finance_officer', 'hr_officer', 'it_admin', 'super_admin'])
  order by d.name nulls last, app.hr_employee_sort_key(e.employee_number), e.full_name
$$;
grant execute on function public.ops_hour_bank_month(date) to authenticated;

-- ── ⑤ المحرّك اليومي (نسخة 00202 + فرع بنك الساعات) ──
create or replace function app.hr_compute_day_metrics(p_employee uuid, p_date date) returns void
language plpgsql security definer set search_path = public, app as $$
declare a record; v_req int := 0; v_permit int := 0; v_permit_unpaid int := 0; v_short int := 0; v_ot int := 0; v_min int := 0; v_days numeric := 0; v_reason text := null;
        lt record; v_ot_block int := app.hr_policy_int('overtime_min_block_minutes', 30); v_grace int; rl jsonb; v_missing int;
        v_on boolean; v_abs boolean; v_sf boolean; v_ul boolean;
begin
  select * into a from public.hr_attendance_days where employee_id = p_employee and work_date = p_date;
  if not found then return; end if;
  rl := app.hr_deduction_rule_for(p_employee, p_date);
  v_on := coalesce((rl ->> 'auto_deduction_enabled')::boolean, true); v_abs := coalesce((rl ->> 'deduct_absence_enabled')::boolean, true);
  v_sf := coalesce((rl ->> 'deduct_shortfall_enabled')::boolean, true); v_ul := coalesce((rl ->> 'deduct_unpaid_leave_enabled')::boolean, true);
  if a.expected_in is not null and a.expected_out is not null then v_req := floor(extract(epoch from (a.expected_out - a.expected_in)) / 60)::int; end if;
  select coalesce(sum(l.minutes) filter (where t.is_paid), 0), coalesce(sum(l.minutes) filter (where not t.is_paid), 0) into v_permit, v_permit_unpaid
  from public.hr_leaves l join public.hr_leave_types t on t.id = l.leave_type_id
  where l.employee_id = p_employee and l.status = 'approved' and l.kind = 'time_permit' and l.start_date = p_date;
  select t.* into lt from public.hr_leaves l join public.hr_leave_types t on t.id = l.leave_type_id
  where l.employee_id = p_employee and l.status = 'approved' and l.kind = 'leave' and p_date between l.start_date and l.end_date
  order by t.is_paid desc limit 1;   -- إن تداخلت إجازتان تُقدَّم المدفوعة (لا يُستقطع من موظف لديه إجازة مدفوعة معتمدة)

  if a.status = 'leave' then
    v_short := 0; v_permit := 0;
    if lt.id is not null and not lt.is_paid and not a.is_rest_day and v_req > 0 and v_on and v_ul then v_days := lt.deduction_days_per_day; v_reason := lt.name; end if;
  elsif a.is_rest_day or v_req = 0 then
    v_short := 0; v_permit := 0;
  elsif a.status = 'absent' then
    v_short := v_req; v_permit := 0;
    if v_on and v_abs then v_days := coalesce((rl ->> 'absent_day_deduction_days')::numeric, 1); v_reason := 'غياب بلا إجازة معتمدة'; end if;
  elsif a.status = 'incomplete' then
    v_short := 0;
    if v_on and v_abs and coalesce((rl ->> 'incomplete_punch_as_absent')::boolean, false) then v_days := coalesce((rl ->> 'absent_day_deduction_days')::numeric, 1); v_reason := 'بصمة ناقصة تُعامل كغياب'; end if;
  else
    -- الزمنية المدفوعة تغطي الدقائق الناقصة فعلاً فقط (داوم كاملاً رغم الزمنية ⇒ لا تُحتسب وقتاً إضافياً)
    v_missing := greatest(0, v_req - a.worked_minutes);
    v_short := greatest(0, v_missing - v_permit);
    if v_short > 0 and v_on and v_sf then
      select o_minutes, o_days into v_min, v_days from app.hr_shortfall_for_rule(rl, v_short, v_req);
      if v_min > 0 or v_days > 0 then
        v_reason := 'نقص ' || v_short || ' دقيقة عن ساعات الشفت';
        if v_permit_unpaid > 0 then v_reason := v_reason || ' — منها زمنية غير مدفوعة ' || least(v_permit_unpaid, v_short) || ' د'; end if;
      end if;
    end if;
    if app.hr_policy_bool('overtime_enabled', true) and a.check_out is not null and a.expected_out is not null and v_short = 0 then
      v_ot := greatest(0, a.worked_minutes - v_req);
      if v_ot < v_ot_block then v_ot := 0; end if;
    end if;
  end if;
  v_grace := coalesce((rl ->> 'grace_minutes_default')::int, 15);
  if a.status in ('present', 'late', 'early_leave', 'time_permit') and v_short <= v_grace then v_min := 0; v_days := 0; v_reason := null; end if;
  -- 00216: بنك الساعات الشهري — لا استقطاع يومي على النقص (يُصفّى شهرياً: فائض الأيام الأخرى يعوّضه)، ولا «وقت إضافي» منفصل (الفائض يدخل البنك)
  if coalesce(rl ->> 'shortfall_method', 'tiers') = 'hour_bank' and a.status in ('present', 'late', 'early_leave', 'time_permit') then
    v_min := 0; v_days := 0; v_ot := 0;
    v_reason := case when v_short > v_grace then 'نقص ' || v_short || ' دقيقة — يُصفّى شهرياً ضمن بنك الساعات' else null end;
  end if;
  if v_reason is not null and (rl ->> '_source') <> 'default' then v_reason := v_reason || ' (' || (rl ->> '_rule_name') || ')'; end if;

  -- 00202: نموذج «الأيام المستحقة» — الغياب/الإجازة غير المدفوعة/البصمة الناقصة المعاملة كغياب أيامٌ غير مدفوعة أصلاً، لا استقطاع مقترح عليها
  --   (حتى ترى غرفة العمليات نفس ما ستراه المالية؛ يبقى السبب للعلم بوسم «يوم غير مدفوع»)
  if coalesce(app.hr_policy() ->> 'salary_model', 'earned_days') = 'earned_days'
     and (select coalesce(sp.pay_type, 'monthly') from public.employee_salary_profiles sp where sp.employee_id = p_employee and sp.status = 'defined') is distinct from 'daily'
     and a.status in ('absent', 'leave', 'incomplete') and v_days > 0 then
    v_days := 0; v_min := 0; v_reason := v_reason || ' — يوم غير مدفوع (لا يدخل الراتب)';
  end if;
  update public.hr_attendance_days set required_minutes = v_req, permit_minutes = v_permit, shortfall_minutes = v_short, overtime_minutes = v_ot,
    proposed_deduction_minutes = v_min, proposed_deduction_days = v_days, deduction_reason = v_reason
  where employee_id = p_employee and work_date = p_date;
end$$;

-- ── ⑥ التصدير (نسخة 00202 + قيد الفائض + تطبيق البنك على الصفوف) ──
create or replace function public.ops_month_export(p_month date)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; v_id uuid; v_ver int; n int; n_eval int;
        v_basis text := coalesce(app.hr_policy() ->> 'salary_day_basis', 'fixed_30');
        v_prorate boolean := app.hr_policy_bool('prorate_partial_month', true);
        v_prorate_allow boolean := app.hr_policy_bool('prorate_allowances', true);
        v_model text := coalesce(app.hr_policy() ->> 'salary_model', 'earned_days');
        v_pay_rest boolean := app.hr_policy_bool('pay_rest_days', false);
        m_to date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  if not app.has_role(array['ops_room', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if app.hr_month_locked(m) then raise exception 'HR_MONTH_LOCKED'; end if;
  if m > date_trunc('month', current_date)::date then raise exception 'HR_MONTH_FUTURE'; end if;
  if not coalesce((app.hr_attendance_confirmation(m) ->> 'can_export')::boolean, false) then raise exception 'HR_ATTENDANCE_NOT_CONFIRMED'; end if;
  n_eval := app.hr_evaluate_month(m);
  update public.hr_month_exports set status = 'superseded' where period_month = m and status = 'exported';
  select coalesce(max(version), 0) + 1 into v_ver from public.hr_month_exports where period_month = m;
  insert into public.hr_month_exports (period_month, version, exported_by) values (m, v_ver, auth.uid()) returning id into v_id;
  perform app.hr_overtime_credit(m);
  perform app.hr_hour_bank_credit(m);   -- 00216: فائض بنك الساعات ⇒ رصيد إجازات (بسقف شهري)

  insert into public.hr_month_export_rows (export_id, employee_id, employee_number, full_name, department_name, branch_name, job_title, contract_type,
    working_days, days_present, days_late, days_absent, days_incomplete, days_leave, late_minutes, early_minutes,
    ops_deduction_amount, ops_deduction_days, ops_deduction_reasons,
    auto_deduction_minutes, auto_deduction_days, shift_minutes, overtime_minutes, shortfall_minutes, auto_deduction_amount,
    days_leave_paid, days_leave_unpaid, auto_absence_days, auto_shortfall_days, ops_deduction_days_amount, payable_days, gross_amount, deductions_total,
    scheduled_days, unevaluated_days, period_from, period_to, covered_days, days_in_month, day_rate, proration_ratio, auto_deduction_capped,
    auto_deduction_basis, auto_deduction_days_capped, auto_deduction_rule, days_rest, salary_model,
    pay_type, base_salary, daily_rate, allowances_total, fixed_deductions_total, proposed_net, final_net)
  select v_id, e.id, e.employee_number, e.full_name, d.name, b.name, e.job_title, e.contract_type,
    s.working_days, s.days_present, s.days_late, s.days_absent, s.days_incomplete, s.days_leave, s.late_minutes, s.early_minutes,
    s.ded_amount, s.ded_days, s.ded_reasons,
    s.auto_minutes, case when sp.pay_type = 'daily' or v_model = 'earned_days' then s.auto_days_shortfall else s.auto_days end, s.shift_minutes, s.overtime_minutes, s.shortfall_minutes, calc.auto_amount,
    s.days_leave_paid, s.days_leave_unpaid, s.auto_days_absence, s.auto_days_shortfall, calc.ops_days_amount, calc.payable_days, calc.gross, calc.deductions,
    s.scheduled_days, s.unevaluated_days, per.period_from, per.period_to, per.covered_days, per.days_in_month, calc.day_rate, calc.ratio, calc.capped,
    case when not rl.auto_on then 'disabled' else rl.mode end, calc.days_capped, rl.rule_name, rs.days_rest, case when sp.pay_type = 'daily' then 'daily' else v_model end,
    sp.pay_type, sp.base_salary, sp.daily_rate, calc.allow, fd.total, calc.net, calc.net
  from public.employees e
  join app.hr_month_summary(m) s on s.employee_id = e.id
  join app.hr_month_period(m) per on per.employee_id = e.id
  left join public.departments d on d.id = e.department_id
  left join public.branches b on b.id = e.branch_id
  left join public.employee_salary_profiles sp on sp.employee_id = e.id and sp.status = 'defined'
  -- 00201: أيام الراحة المجدولة (تُدفع فقط إن فعّلت وحدة التطوير «pay_rest_days»)
  cross join lateral (select count(*)::int as days_rest from public.hr_attendance_days a where a.employee_id = e.id and a.is_rest_day and a.work_date between m and m_to) rs
  -- 00201: الأيام المستحقة = حضور (بما فيه البصمة الناقصة التي تُعدّ حاضراً) + إجازة مدفوعة من الرصيد (+ راحة إن فُعّلت)
  -- 00202: البصمة الناقصة تُدفع إلا إذا قالت قاعدة الموظف «تُعامل كغياب» (incomplete_punch_as_absent) — نفس القاعدة التي يراها الحضور
  cross join lateral (select (s.days_present + case when app.hr_incomplete_payable(e.id, m) then s.days_incomplete else 0 end + s.days_leave_paid + case when v_pay_rest then rs.days_rest else 0 end)::numeric as payable_days) pdx
  -- 00195: قاعدة الاستقطاع الفعّالة لكل موظف (وحدة الاستقطاعات التلقائية في التطوير المركزية: نطاق فرع/قسم/موظف + استثناءات)
  cross join lateral (
    select coalesce((j ->> 'auto_deduction_enabled')::boolean, true) as auto_on, coalesce(j ->> 'auto_deduction_amount_mode', 'salary') as mode,
           coalesce((j ->> 'fixed_absent_day_amount')::numeric, 0) as fix_day, coalesce((j ->> 'fixed_shortfall_minute_amount')::numeric, 0) as fix_min,
           coalesce((j ->> 'max_auto_deduction_days_per_month')::numeric, 0) as max_days, coalesce((j ->> 'auto_deduction_cap_ratio')::numeric, 1) as cap,
           j ->> '_rule_name' as rule_name
    from app.hr_deduction_rule_for(e.id, m) j) rl
  cross join lateral (select coalesce(sum((v.value)::numeric), 0) as total from jsonb_each_text(coalesce(sp.allowances, '{}'::jsonb)) v where v.value ~ '^\d+(\.\d+)?$') al
  cross join lateral (select coalesce(sum((v.value)::numeric), 0) as total from jsonb_each_text(coalesce(sp.fixed_deductions, '{}'::jsonb)) v where v.value ~ '^\d+(\.\d+)?$') fd
  cross join lateral (
    select y.*,
      case when sp.employee_id is null then null else greatest(0, round(y.gross - y.deductions, 2)) end as net
    from (
      select x.day_rate, x.ratio, x.payable_days, x.ops_days_amount, x.allow, x.auto_days_eff, x.days_capped,
        x.auto_raw > x.auto_cap as capped,
        least(x.auto_raw, x.auto_cap) as auto_amount,
        x.gross,
        case when sp.employee_id is null then null else round(fd.total + s.ded_amount + x.ops_days_amount + least(x.auto_raw, x.auto_cap), 2) end as deductions
      from (
        select r.*,
          case when sp.employee_id is null then null
               when sp.pay_type = 'daily' then round(sp.daily_rate * r.payable_days + r.allow, 2)
               else round(r.base_due + r.allow, 2) end as gross,
          case when sp.employee_id is null then 0
               when sp.pay_type = 'daily' then round(rl.cap * (sp.daily_rate * r.payable_days + r.allow), 2)
               else round(rl.cap * (r.base_due + r.allow), 2) end as auto_cap
        from (
          select rates.day_rate, rates.ratio, dd.auto_days_eff, dd.days_capped,
            case when sp.pay_type = 'daily' or v_model = 'earned_days' then pdx.payable_days else null end as payable_days,
            case when sp.pay_type = 'daily' then 0
                 -- نموذج الأيام المستحقة: الأساسي ÷ أيام الشهر × الأيام المستحقة (لا يتجاوز الأساسي)
                 when v_model = 'earned_days' then least(sp.base_salary, round(rates.day_rate * pdx.payable_days, 2))
                 when per.full_month or not v_prorate then sp.base_salary
                 else least(sp.base_salary, round(rates.day_rate * per.covered_days, 2)) end as base_due,
            case when sp.pay_type = 'monthly' and v_model = 'earned_days' then (case when v_prorate_allow then round(al.total * rates.ratio, 2) else al.total end)
                 when sp.pay_type = 'monthly' and v_prorate and v_prorate_allow and not per.full_month then round(al.total * rates.ratio, 2) else al.total end as allow,
            -- مبلغ الاستقطاع التلقائي: متوقف ⇒ 0 · salary ⇒ أجر الدقيقة/اليوم من الراتب · fixed ⇒ مبالغ ثابتة من السياسة
            case when not rl.auto_on then 0
                 when rl.mode = 'fixed' then round(rl.fix_min * s.auto_minutes + rl.fix_day * dd.auto_days_eff, 2)
                 else round(rates.minute_rate * s.auto_minutes + rates.day_rate * dd.auto_days_eff, 2) end as auto_raw,
            round(rates.day_rate * s.ded_days, 2) as ops_days_amount
          from (
            select dr.day_rate,
              case when sp.employee_id is null then 0 when sp.pay_type = 'daily' then round(sp.daily_rate / greatest(s.shift_minutes, 1), 4) else round(dr.day_rate / greatest(s.shift_minutes, 1), 4) end as minute_rate,
              case when sp.pay_type = 'daily' or sp.employee_id is null or sp.base_salary = 0 then 1
                   -- نسبة الاستحقاق في نموذج الأيام المستحقة = الأيام المستحقة ÷ أيام الشهر (تُستخدم للمخصصات)
                   when v_model = 'earned_days' then least(1, round(pdx.payable_days / per.days_in_month, 6))
                   when per.full_month or not v_prorate then 1
                   else least(1, round(least(sp.base_salary, dr.day_rate * per.covered_days) / sp.base_salary, 6)) end as ratio
            from (select case when sp.employee_id is null then 0
                              when sp.pay_type = 'daily' then sp.daily_rate
                              when v_basis = 'calendar_days' or v_model = 'earned_days' then round(sp.base_salary / per.days_in_month, 4)
                              else round(sp.base_salary / 30, 4) end as day_rate) dr
          ) rates,
          lateral (
            -- أيام الاستقطاع المؤثرة: اليومي لا يُخصم غيابه (غير مدفوع أصلاً)؛ سقف أيام شهري اختياري
            select case when rl.max_days > 0 then least(base_days, rl.max_days) else base_days end as auto_days_eff,
                   rl.max_days > 0 and base_days > rl.max_days as days_capped
            -- 00201: في نموذج الأيام المستحقة الغياب غير مدفوع أصلاً ⇒ لا يُخصم مرة ثانية؛ يبقى خصم نقص الدقائق/التأخير فقط
            from (select case when sp.pay_type = 'daily' or v_model = 'earned_days' then s.auto_days_shortfall else s.auto_days end as base_days) bd
          ) dd) r) x) y) calc;
  get diagnostics n = row_count;
  perform app.hr_hour_bank_apply_export(v_id, m);   -- 00216: استقطاع ساعات العجز الصافية فقط + أعمدة البنك
  update public.hr_month_exports set rows_count = n where id = v_id;
  insert into public.hr_attendance_audit (employee_id, work_date, action, after, reason, actor)
  select e.employee_id, m, 'export', jsonb_build_object('export_id', v_id, 'version', v_ver, 'days_evaluated', n_eval, 'salary_day_basis', v_basis, 'salary_model', v_model, 'pay_rest_days', v_pay_rest, 'prorate', v_prorate, 'auto_deduction', coalesce(e.auto_deduction_basis, 'salary'), 'auto_deduction_rule', e.auto_deduction_rule), 'تصدير الشهر إلى المالية', auth.uid()
  from public.hr_month_export_rows e where e.export_id = v_id;
  perform app.advance_apply_to_export(v_id, m);
  return v_id;
end$$;

-- ── ⑦ مطابقة المالية (نسخة 00202): الدقائق الحية لصفوف بنك الساعات = عجز البنك الصافي لا مجموع المقترح اليومي ──
create or replace function public.finance_payroll_reconcile(p_month date)
returns table(
  row_id uuid, employee_id uuid, employee_number text, full_name text, department_name text, branch_name text, pay_type text,
  gross_stored numeric, gross_expected numeric, deductions_stored numeric, deductions_expected numeric, net_stored numeric, net_expected numeric, final_net numeric,
  components jsonb, live jsonb, issues text[], money_ok boolean, attendance_ok boolean, ok boolean)
language sql stable security definer set search_path = public, app as $$
  with x as (select * from public.hr_month_exports where period_month = date_trunc('month', p_month)::date and status in ('exported', 'approved') order by version desc limit 1),
  m as (select date_trunc('month', p_month)::date as f, (date_trunc('month', p_month) + interval '1 month - 1 day')::date as t),
  live_att as (
    select a.employee_id,
      count(*) filter (where not a.is_rest_day)::int as working_days,
      count(*) filter (where a.status in ('present', 'late', 'early_leave', 'time_permit'))::int as days_present,
      count(*) filter (where a.status = 'absent')::int as days_absent,
      count(*) filter (where a.status = 'leave')::int as days_leave,
      count(*) filter (where a.status = 'incomplete')::int as days_incomplete,
      count(*) filter (where a.status = 'leave' and exists (
         select 1 from public.hr_leaves l join public.hr_leave_types t on t.id = l.leave_type_id
         where l.employee_id = a.employee_id and l.status = 'approved' and l.kind = 'leave' and t.is_paid and a.work_date between l.start_date and l.end_date))::int as days_leave_paid,
      count(*) filter (where a.is_rest_day)::int as days_rest,
      coalesce(sum(a.proposed_deduction_minutes) filter (where not a.deduction_waived), 0)::int as auto_minutes,
      coalesce(sum(a.proposed_deduction_days) filter (where not a.deduction_waived), 0) as auto_days,
      coalesce(sum(a.proposed_deduction_days) filter (where not a.deduction_waived and a.status in ('present', 'late', 'early_leave', 'time_permit')), 0) as auto_days_shortfall
    from public.hr_attendance_days a, m where a.work_date between m.f and m.t group by a.employee_id),
  live_ded as (select d.employee_id, coalesce(sum(d.amount), 0) as amt, coalesce(sum(d.days), 0) as dys, count(*)::int as n from public.hr_attendance_deductions d, m where d.period_month = m.f group by d.employee_id),
  base as (
    select r.*,
      -- الإجمالي المتوقع من المكوّنات المخزَّنة في الصف نفسه
      case when r.pay_type is null then null
           when r.pay_type = 'daily' then round(coalesce(r.daily_rate, 0) * coalesce(r.payable_days, 0) + coalesce(r.allowances_total, 0), 2)
           -- 00201: نموذج الأيام المستحقة — الأساسي ÷ أيام الشهر × الأيام المستحقة (≤ الأساسي) + المخصصات
           when r.salary_model = 'earned_days' then round(least(coalesce(r.base_salary, 0), round(coalesce(r.day_rate, 0) * coalesce(r.payable_days, 0), 2)) + coalesce(r.allowances_total, 0), 2)
           when coalesce(r.proration_ratio, 1) < 1 then round(least(coalesce(r.base_salary, 0), round(coalesce(r.day_rate, 0) * coalesce(r.covered_days, 0), 2)) + coalesce(r.allowances_total, 0), 2)
           else round(coalesce(r.base_salary, 0) + coalesce(r.allowances_total, 0), 2) end as g_exp,
      case when r.pay_type is null then null
           else round(coalesce(r.fixed_deductions_total, 0) + coalesce(r.ops_deduction_amount, 0) + coalesce(r.ops_deduction_days_amount, 0) + coalesce(r.auto_deduction_amount, 0) + coalesce(r.advance_installment, 0), 2) end as d_exp,
      la.working_days as l_working, la.days_present as l_present, la.days_leave_paid as l_leave_paid, la.days_rest as l_rest, la.days_absent as l_absent, la.days_leave as l_leave, la.days_incomplete as l_incomplete, la.auto_minutes as l_auto_min, la.auto_days as l_auto_days, la.auto_days_shortfall as l_auto_days_short,
      coalesce(ld.amt, 0) as l_ded_amt, coalesce(ld.dys, 0) as l_ded_days, coalesce(ld.n, 0) as l_ded_n
    from x join public.hr_month_export_rows r on r.export_id = x.id
    left join live_att la on la.employee_id = r.employee_id
    left join live_ded ld on ld.employee_id = r.employee_id),
  chk as (
    select b.*,
      case when b.pay_type is null then null else greatest(0, round(b.g_exp - b.d_exp, 2)) end as n_exp,
      array_remove(array[
        case when b.pay_type is null then 'SALARY_MISSING' end,
        case when b.pay_type is not null and round(coalesce(b.gross_amount, 0), 2) <> b.g_exp then 'GROSS_MISMATCH' end,
        case when b.pay_type is not null and round(coalesce(b.deductions_total, 0), 2) <> b.d_exp then 'DEDUCTIONS_MISMATCH' end,
        case when b.pay_type is not null and round(coalesce(b.proposed_net, 0), 2) <> greatest(0, round(b.g_exp - b.d_exp, 2)) then 'NET_MISMATCH' end,
        case when b.pay_type is not null and b.final_net is not null and b.final_net < 0 then 'FINAL_NEGATIVE' end,
        case when b.pay_type is not null and coalesce(b.deductions_total, 0) > coalesce(b.gross_amount, 0) and coalesce(b.proposed_net, 0) <> 0 then 'NET_NOT_FLOORED' end,
        case when b.working_days <> b.days_present + b.days_absent + b.days_incomplete + b.days_leave then 'DAYS_UNCLASSIFIED' end,
        case when coalesce(b.unevaluated_days, 0) > 0 then 'UNEVALUATED_DAYS' end,
        case when b.l_working is not null and (b.l_present <> b.days_present or b.l_absent <> b.days_absent or b.l_leave <> b.days_leave or b.l_incomplete <> b.days_incomplete) then 'ATTENDANCE_CHANGED' end,
        case when b.l_working is not null and ((case when b.hour_bank_enabled then (select hb.deduction_minutes from app.hr_hour_bank(b.employee_id, p_month) hb) else b.l_auto_min end) <> b.auto_deduction_minutes or (case when b.pay_type = 'daily' or b.salary_model = 'earned_days' then b.l_auto_days_short else b.l_auto_days end) <> b.auto_deduction_days) and b.auto_deduction_basis is distinct from 'disabled' then 'AUTO_DEDUCTION_CHANGED' end,
        -- 00201: الأيام المستحقة المخزّنة يجب أن تساوي الحية (حضور + ناقصة + إجازة مدفوعة [+ راحة إن كانت مدفوعة])
        case when b.l_working is not null and b.salary_model = 'earned_days' and b.payable_days is not null
                  and b.payable_days <> (b.l_present + case when app.hr_incomplete_payable(b.employee_id, p_month) then b.l_incomplete else 0 end + b.l_leave_paid + case when app.hr_policy_bool('pay_rest_days', false) then b.l_rest else 0 end) then 'PAYABLE_DAYS_CHANGED' end,
        case when b.l_ded_amt <> b.ops_deduction_amount or b.l_ded_days <> b.ops_deduction_days then 'OPS_DEDUCTIONS_CHANGED' end
      ]::text[], null) as iss
    from base b)
  select c.id, c.employee_id, c.employee_number, c.full_name, c.department_name, c.branch_name, c.pay_type,
    c.gross_amount, c.g_exp, c.deductions_total, c.d_exp, c.proposed_net, c.n_exp, c.final_net,
    jsonb_build_object(
      'salary_model', c.salary_model, 'base_salary', c.base_salary, 'daily_rate', c.daily_rate, 'day_rate', c.day_rate, 'payable_days', c.payable_days, 'covered_days', c.covered_days, 'days_in_month', c.days_in_month, 'proration_ratio', c.proration_ratio,
      'allowances', c.allowances_total, 'fixed_deductions', c.fixed_deductions_total, 'ops_amount', c.ops_deduction_amount, 'ops_days', c.ops_deduction_days, 'ops_days_amount', c.ops_deduction_days_amount,
      'auto_minutes', c.auto_deduction_minutes, 'auto_days', c.auto_deduction_days, 'auto_amount', c.auto_deduction_amount, 'auto_basis', c.auto_deduction_basis, 'advance', c.advance_installment,
      'working_days', c.working_days, 'present', c.days_present, 'absent', c.days_absent, 'leave', c.days_leave, 'incomplete', c.days_incomplete, 'unevaluated', c.unevaluated_days),
    jsonb_build_object('working_days', c.l_working, 'present', c.l_present, 'leave_paid', c.l_leave_paid, 'rest', c.l_rest, 'absent', c.l_absent, 'leave', c.l_leave, 'incomplete', c.l_incomplete, 'auto_minutes', c.l_auto_min, 'auto_days', c.l_auto_days, 'ops_amount', c.l_ded_amt, 'ops_days', c.l_ded_days, 'ops_count', c.l_ded_n),
    c.iss,
    not (c.iss && array['GROSS_MISMATCH', 'DEDUCTIONS_MISMATCH', 'NET_MISMATCH', 'FINAL_NEGATIVE', 'NET_NOT_FLOORED']::text[]),
    not (c.iss && array['DAYS_UNCLASSIFIED', 'UNEVALUATED_DAYS', 'ATTENDANCE_CHANGED', 'AUTO_DEDUCTION_CHANGED', 'OPS_DEDUCTIONS_CHANGED', 'PAYABLE_DAYS_CHANGED']::text[]),
    coalesce(array_length(c.iss, 1), 0) = 0
  from chk c
  where app.has_role(array['finance_officer', 'super_admin'])
  order by c.branch_name nulls last, c.department_name nulls last, app.hr_employee_sort_key(c.employee_number), c.full_name
$$;
