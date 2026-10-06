-- 00188 · (أ) تحكم كامل بالاستقطاع التلقائي من بوابة التطوير المركزية
--         (ب) الكشوفات — الجولة B: تقرير شامل (أنواع/قواطع/مكرِّرون/سلسلة الاستقطاع) بمدى تاريخ
--         (ج) المتعهدون — الجولة 2: أجور عمال المتعهدين تُحدَّد من المالية (شهري/يومي) وكشف شهري بالحضور
--
-- ═══════════════ (أ) الاستقطاع التلقائي ═══════════════
-- المفاتيح الجديدة في hr_policy:
--   auto_deduction_enabled (true)            تشغيل/إيقاف كل الاستقطاعات التلقائية (الأيام تُحتسب وتُعرض، لكن لا يُقترح استقطاع)
--   deduct_absence_enabled (true)            استقطاع الغياب بلا إجازة (والبصمة الناقصة إن كانت تُعامل كغياب)
--   deduct_shortfall_enabled (true)          استقطاع نقص الدقائق حسب الشرائح
--   deduct_unpaid_leave_enabled (true)       استقطاع الإجازات غير المدفوعة
--   auto_deduction_amount_mode ('salary')    salary: أجر اليوم/الدقيقة من الراتب · fixed: مبالغ ثابتة بالدينار
--   fixed_absent_day_amount (0)              مبلغ ثابت لكل «يوم» استقطاع (غياب/شريحة بجزء يوم/إجازة غير مدفوعة) في وضع fixed
--   fixed_shortfall_minute_amount (0)        مبلغ ثابت لكل «دقيقة» استقطاع في وضع fixed
--   max_auto_deduction_days_per_month (0)    سقف أيام الاستقطاع التلقائي في الشهر (0 = بلا سقف)
--   (+ auto_deduction_cap_ratio من 00187: سقف نسبة من الإجمالي)
update public.hr_policy set settings = settings
  || jsonb_build_object('auto_deduction_enabled', coalesce((settings ->> 'auto_deduction_enabled')::boolean, true))
  || jsonb_build_object('deduct_absence_enabled', coalesce((settings ->> 'deduct_absence_enabled')::boolean, true))
  || jsonb_build_object('deduct_shortfall_enabled', coalesce((settings ->> 'deduct_shortfall_enabled')::boolean, true))
  || jsonb_build_object('deduct_unpaid_leave_enabled', coalesce((settings ->> 'deduct_unpaid_leave_enabled')::boolean, true))
  || jsonb_build_object('auto_deduction_amount_mode', coalesce(settings ->> 'auto_deduction_amount_mode', 'salary'))
  || jsonb_build_object('fixed_absent_day_amount', coalesce((settings ->> 'fixed_absent_day_amount')::numeric, 0))
  || jsonb_build_object('fixed_shortfall_minute_amount', coalesce((settings ->> 'fixed_shortfall_minute_amount')::numeric, 0))
  || jsonb_build_object('max_auto_deduction_days_per_month', coalesce((settings ->> 'max_auto_deduction_days_per_month')::numeric, 0))
where id = 1;

create or replace function public.hr_policy_set(p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare cur jsonb; t jsonb; i int := 0; prev_to int := 0; v_reeval boolean := false;
begin
  if not app.has_role(array['it_admin', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'HR_POLICY_INVALID'; end if;
  cur := app.hr_policy() || p_patch;
  if (cur ->> 'annual_leave_days_default')::numeric < 0 or (cur ->> 'permits_per_leave_day')::int < 1 or (cur ->> 'permit_max_minutes')::int < 15 then raise exception 'HR_POLICY_INVALID'; end if;
  if (cur ->> 'balance_mode') not in ('annual_upfront', 'monthly_accrual') then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce((cur ->> 'punch_window_hours')::int, 4) not between 1 and 12 then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce((cur ->> 'evaluate_lookback_days')::int, 2) not between 1 and 31 then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce((cur ->> 'grace_minutes_default')::int, 15) not between 0 and 120 then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce(cur ->> 'salary_day_basis', 'fixed_30') not in ('fixed_30', 'calendar_days') then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce((cur ->> 'auto_deduction_cap_ratio')::numeric, 1) not between 0 and 1 then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce((cur ->> 'absent_day_deduction_days')::numeric, 1) not between 0 and 3 then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce(cur ->> 'auto_deduction_amount_mode', 'salary') not in ('salary', 'fixed') then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce((cur ->> 'fixed_absent_day_amount')::numeric, 0) < 0 or coalesce((cur ->> 'fixed_shortfall_minute_amount')::numeric, 0) < 0 then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce((cur ->> 'max_auto_deduction_days_per_month')::numeric, 0) not between 0 and 31 then raise exception 'HR_POLICY_INVALID'; end if;
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
  -- هل تغيّر شيء يؤثر في الاستقطاع المقترح لكل يوم؟ ⇒ يُعاد احتساب الشهر الجاري (غير المقفل) فوراً حتى لا تبقى أرقام قديمة في غرفة العمليات
  select bool_or(k in ('auto_deduction_enabled','deduct_absence_enabled','deduct_shortfall_enabled','deduct_unpaid_leave_enabled','deduction_tiers','absent_day_deduction_days','incomplete_punch_as_absent','grace_minutes_default'))
    into v_reeval from jsonb_object_keys(p_patch) k;
  update public.hr_policy set settings = cur, updated_by = auth.uid(), updated_at = now() where id = 1;
  if coalesce(v_reeval, false) and not app.hr_month_locked(date_trunc('month', app.hr_local_date(now()))::date) then
    perform app.hr_evaluate_month(date_trunc('month', app.hr_local_date(now()))::date);
  end if;
  return cur;
end$$;

-- مشتقات اليوم مع مفاتيح التشغيل/الإيقاف (بديل 00145)
create or replace function app.hr_compute_day_metrics(p_employee uuid, p_date date) returns void
language plpgsql security definer set search_path = public, app as $$
declare a record; v_req int := 0; v_permit int := 0; v_short int := 0; v_ot int := 0; v_min int := 0; v_days numeric := 0; v_reason text := null;
        lt record; v_ot_block int := app.hr_policy_int('overtime_min_block_minutes', 30); v_grace int;
        v_on boolean := app.hr_policy_bool('auto_deduction_enabled', true);
        v_abs boolean := app.hr_policy_bool('deduct_absence_enabled', true);
        v_sf boolean := app.hr_policy_bool('deduct_shortfall_enabled', true);
        v_ul boolean := app.hr_policy_bool('deduct_unpaid_leave_enabled', true);
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
    if lt.id is not null and not lt.is_paid and not a.is_rest_day and v_req > 0 and v_on and v_ul then v_days := lt.deduction_days_per_day; v_reason := lt.name; end if;
  elsif a.is_rest_day or v_req = 0 then
    v_short := 0;
  elsif a.status = 'absent' then
    v_short := v_req;
    if v_on and v_abs then v_days := app.hr_policy_num('absent_day_deduction_days', 1); v_reason := 'غياب بلا إجازة معتمدة'; end if;
  elsif a.status = 'incomplete' then
    v_short := 0;
    if v_on and v_abs and app.hr_policy_bool('incomplete_punch_as_absent', false) then v_days := app.hr_policy_num('absent_day_deduction_days', 1); v_reason := 'بصمة ناقصة تُعامل كغياب'; end if;
  else
    v_short := greatest(0, v_req - a.worked_minutes - v_permit);
    if v_short > 0 and v_on and v_sf then
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

alter table public.hr_month_export_rows
  add column if not exists auto_deduction_basis text,          -- salary | fixed | disabled
  add column if not exists auto_deduction_days_capped boolean not null default false;

create or replace function public.ops_month_export(p_month date)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; v_id uuid; v_ver int; n int; n_eval int;
        v_basis text := coalesce(app.hr_policy() ->> 'salary_day_basis', 'fixed_30');
        v_prorate boolean := app.hr_policy_bool('prorate_partial_month', true);
        v_prorate_allow boolean := app.hr_policy_bool('prorate_allowances', true);
        v_cap numeric := app.hr_policy_num('auto_deduction_cap_ratio', 1);
        v_auto_on boolean := app.hr_policy_bool('auto_deduction_enabled', true);
        v_mode text := coalesce(app.hr_policy() ->> 'auto_deduction_amount_mode', 'salary');
        v_fix_day numeric := app.hr_policy_num('fixed_absent_day_amount', 0);
        v_fix_min numeric := app.hr_policy_num('fixed_shortfall_minute_amount', 0);
        v_max_days numeric := app.hr_policy_num('max_auto_deduction_days_per_month', 0);
begin
  if not app.has_role(array['ops_room', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if app.hr_month_locked(m) then raise exception 'HR_MONTH_LOCKED'; end if;
  if m > date_trunc('month', current_date)::date then raise exception 'HR_MONTH_FUTURE'; end if;
  n_eval := app.hr_evaluate_month(m);
  update public.hr_month_exports set status = 'superseded' where period_month = m and status = 'exported';
  select coalesce(max(version), 0) + 1 into v_ver from public.hr_month_exports where period_month = m;
  insert into public.hr_month_exports (period_month, version, exported_by) values (m, v_ver, auth.uid()) returning id into v_id;
  perform app.hr_overtime_credit(m);

  insert into public.hr_month_export_rows (export_id, employee_id, employee_number, full_name, department_name, branch_name, job_title, contract_type,
    working_days, days_present, days_late, days_absent, days_incomplete, days_leave, late_minutes, early_minutes,
    ops_deduction_amount, ops_deduction_days, ops_deduction_reasons,
    auto_deduction_minutes, auto_deduction_days, shift_minutes, overtime_minutes, shortfall_minutes, auto_deduction_amount,
    days_leave_paid, days_leave_unpaid, auto_absence_days, auto_shortfall_days, ops_deduction_days_amount, payable_days, gross_amount, deductions_total,
    scheduled_days, unevaluated_days, period_from, period_to, covered_days, days_in_month, day_rate, proration_ratio, auto_deduction_capped,
    auto_deduction_basis, auto_deduction_days_capped,
    pay_type, base_salary, daily_rate, allowances_total, fixed_deductions_total, proposed_net, final_net)
  select v_id, e.id, e.employee_number, e.full_name, d.name, b.name, e.job_title, e.contract_type,
    s.working_days, s.days_present, s.days_late, s.days_absent, s.days_incomplete, s.days_leave, s.late_minutes, s.early_minutes,
    s.ded_amount, s.ded_days, s.ded_reasons,
    s.auto_minutes, s.auto_days, s.shift_minutes, s.overtime_minutes, s.shortfall_minutes, calc.auto_amount,
    s.days_leave_paid, s.days_leave_unpaid, s.auto_days_absence, s.auto_days_shortfall, calc.ops_days_amount, calc.payable_days, calc.gross, calc.deductions,
    s.scheduled_days, s.unevaluated_days, per.period_from, per.period_to, per.covered_days, per.days_in_month, calc.day_rate, calc.ratio, calc.capped,
    case when not v_auto_on then 'disabled' else v_mode end, calc.days_capped,
    sp.pay_type, sp.base_salary, sp.daily_rate, calc.allow, fd.total, calc.net, calc.net
  from public.employees e
  join app.hr_month_summary(m) s on s.employee_id = e.id
  join app.hr_month_period(m) per on per.employee_id = e.id
  left join public.departments d on d.id = e.department_id
  left join public.branches b on b.id = e.branch_id
  left join public.employee_salary_profiles sp on sp.employee_id = e.id and sp.status = 'defined'
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
               when sp.pay_type = 'daily' then round(v_cap * (sp.daily_rate * r.payable_days + r.allow), 2)
               else round(v_cap * (r.base_due + r.allow), 2) end as auto_cap
        from (
          select rates.day_rate, rates.ratio, dd.auto_days_eff, dd.days_capped,
            case when sp.pay_type = 'daily' then (s.days_present + s.days_leave_paid)::numeric else null end as payable_days,
            case when sp.pay_type = 'daily' then 0
                 when per.full_month or not v_prorate then sp.base_salary
                 else least(sp.base_salary, round(rates.day_rate * per.covered_days, 2)) end as base_due,
            case when sp.pay_type = 'monthly' and v_prorate and v_prorate_allow and not per.full_month then round(al.total * rates.ratio, 2) else al.total end as allow,
            -- مبلغ الاستقطاع التلقائي: متوقف ⇒ 0 · salary ⇒ أجر الدقيقة/اليوم من الراتب · fixed ⇒ مبالغ ثابتة من السياسة
            case when not v_auto_on then 0
                 when v_mode = 'fixed' then round(v_fix_min * s.auto_minutes + v_fix_day * dd.auto_days_eff, 2)
                 else round(rates.minute_rate * s.auto_minutes + rates.day_rate * dd.auto_days_eff, 2) end as auto_raw,
            round(rates.day_rate * s.ded_days, 2) as ops_days_amount
          from (
            select dr.day_rate,
              case when sp.employee_id is null then 0 when sp.pay_type = 'daily' then round(sp.daily_rate / greatest(s.shift_minutes, 1), 4) else round(dr.day_rate / greatest(s.shift_minutes, 1), 4) end as minute_rate,
              case when per.full_month or not v_prorate or sp.pay_type = 'daily' or sp.employee_id is null or sp.base_salary = 0 then 1
                   else least(1, round(least(sp.base_salary, dr.day_rate * per.covered_days) / sp.base_salary, 6)) end as ratio
            from (select case when sp.employee_id is null then 0
                              when sp.pay_type = 'daily' then sp.daily_rate
                              when v_basis = 'calendar_days' then round(sp.base_salary / per.days_in_month, 4)
                              else round(sp.base_salary / 30, 4) end as day_rate) dr
          ) rates,
          lateral (
            -- أيام الاستقطاع المؤثرة: اليومي لا يُخصم غيابه (غير مدفوع أصلاً)؛ سقف أيام شهري اختياري
            select case when v_max_days > 0 then least(base_days, v_max_days) else base_days end as auto_days_eff,
                   v_max_days > 0 and base_days > v_max_days as days_capped
            from (select case when sp.pay_type = 'daily' then s.auto_days_shortfall else s.auto_days end as base_days) bd
          ) dd) r) x) y) calc;
  get diagnostics n = row_count;
  update public.hr_month_exports set rows_count = n where id = v_id;
  insert into public.hr_attendance_audit (employee_id, work_date, action, after, reason, actor)
  select e.employee_id, m, 'export', jsonb_build_object('export_id', v_id, 'version', v_ver, 'days_evaluated', n_eval, 'salary_day_basis', v_basis, 'prorate', v_prorate, 'auto_deduction', case when v_auto_on then v_mode else 'disabled' end), 'تصدير الشهر إلى المالية', auth.uid()
  from public.hr_month_export_rows e where e.export_id = v_id;
  return v_id;
end$$;

drop function if exists public.finance_payroll_sheet(date);
create or replace function public.finance_payroll_sheet(p_month date)
returns table(export_id uuid, export_version int, export_status text, exported_at timestamptz, row_id uuid, employee_id uuid, employee_number text, full_name text,
  department_name text, branch_name text, job_title text, contract_type text, working_days int, days_present int, days_late int, days_absent int, days_incomplete int,
  days_leave int, late_minutes int, early_minutes int, ops_deduction_amount numeric, ops_deduction_days numeric, ops_deduction_reasons text,
  auto_deduction_minutes int, auto_deduction_days numeric, auto_deduction_amount numeric, overtime_minutes int, shortfall_minutes int,
  pay_type text, base_salary numeric, daily_rate numeric, allowances_total numeric, fixed_deductions_total numeric, proposed_net numeric, final_net numeric, finance_note text,
  days_leave_paid int, days_leave_unpaid int, auto_absence_days numeric, auto_shortfall_days numeric, ops_deduction_days_amount numeric,
  payable_days numeric, gross_amount numeric, deductions_total numeric, scheduled_days int, unevaluated_days int, shift_minutes int,
  period_from date, period_to date, covered_days int, days_in_month int, day_rate numeric, proration_ratio numeric, auto_deduction_capped boolean,
  auto_deduction_basis text, auto_deduction_days_capped boolean)
language sql stable security definer set search_path = public, app as $$
  with x as (select * from public.hr_month_exports where period_month = date_trunc('month', p_month)::date and status in ('exported', 'approved') order by version desc limit 1)
  select x.id, x.version, x.status, x.exported_at, r.id, r.employee_id, r.employee_number, r.full_name, r.department_name, r.branch_name, r.job_title, r.contract_type,
         r.working_days, r.days_present, r.days_late, r.days_absent, r.days_incomplete, r.days_leave, r.late_minutes, r.early_minutes,
         r.ops_deduction_amount, r.ops_deduction_days, r.ops_deduction_reasons,
         r.auto_deduction_minutes, r.auto_deduction_days, r.auto_deduction_amount, r.overtime_minutes, r.shortfall_minutes,
         r.pay_type, r.base_salary, r.daily_rate, r.allowances_total, r.fixed_deductions_total,
         r.proposed_net, r.final_net, r.finance_note,
         r.days_leave_paid, r.days_leave_unpaid, r.auto_absence_days, r.auto_shortfall_days, r.ops_deduction_days_amount,
         r.payable_days, r.gross_amount, r.deductions_total, r.scheduled_days, r.unevaluated_days, r.shift_minutes,
         r.period_from, r.period_to, r.covered_days, r.days_in_month, r.day_rate, r.proration_ratio, r.auto_deduction_capped,
         r.auto_deduction_basis, r.auto_deduction_days_capped
  from x join public.hr_month_export_rows r on r.export_id = x.id
  where app.has_role(array['finance_officer', 'super_admin'])
  order by r.department_name nulls last, app.hr_employee_sort_key(r.employee_number), r.full_name
$$;
grant execute on function public.finance_payroll_sheet(date) to authenticated;

-- ═══════════════ (ب) الكشوفات — تقرير شامل بمدى تاريخ ═══════════════
create or replace function public.disclosure_report(p_from date, p_to date, p_type text default null, p_sector text default null)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare f date := coalesce(p_from, date_trunc('month', current_date)::date); t date := coalesce(p_to, (date_trunc('month', current_date) + interval '1 month - 1 day')::date);
begin
  if not app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin']) then raise exception 'DISCLOSURE_FORBIDDEN'; end if;
  if t < f then raise exception 'DISCLOSURE_RANGE_INVALID'; end if;
  if t - f > 400 then raise exception 'DISCLOSURE_RANGE_TOO_WIDE'; end if;
  return (
    with d as (
      select x.*, app.disclosure_deduction_state(x) as ded_state
      from public.disclosures x
      where x.log_date between f and t and x.archived_at is null and x.status <> 'draft'
        and (p_type is null or x.violation_type = p_type) and (p_sector is null or x.sector = p_sector))
    select jsonb_build_object(
      'from', f, 'to', t,
      'totals', (select jsonb_build_object('count', count(*), 'pending', count(*) filter (where status = 'pending'), 'returned', count(*) filter (where status = 'returned'),
                   'approved', count(*) filter (where status = 'approved'), 'cancelled', count(*) filter (where status = 'cancelled'),
                   'amount_approved', coalesce(sum(amount) filter (where status = 'approved'), 0), 'amount_pending', coalesce(sum(amount) filter (where status in ('pending','returned')), 0),
                   'employees', count(distinct employee_id) filter (where target_kind = 'employee'), 'vehicles', count(distinct coalesce(vehicle_id::text, db_number)) filter (where target_kind = 'vehicle'),
                   'avg_decision_hours', round(coalesce(avg(extract(epoch from (approved_at - submitted_at)) / 3600) filter (where status = 'approved' and submitted_at is not null and approved_at is not null), 0)::numeric, 1))
                 from d),
      'by_type', (select coalesce(jsonb_agg(jsonb_build_object('key', k, 'label', coalesce(ty.label, k), 'count', n, 'approved', a, 'amount', amt) order by n desc, k), '[]'::jsonb)
                  from (select violation_type k, count(*) n, count(*) filter (where status = 'approved') a, coalesce(sum(amount) filter (where status = 'approved'), 0) amt from d group by violation_type) q
                  left join public.disclosure_types ty on ty.key = q.k),
      'by_penalty', (select coalesce(jsonb_agg(jsonb_build_object('key', coalesce(penalty_type, 'none'), 'count', n) order by n desc), '[]'::jsonb) from (select penalty_type, count(*) n from d group by penalty_type) q),
      'by_target', (select coalesce(jsonb_object_agg(target_kind, n), '{}'::jsonb) from (select target_kind, count(*) n from d group by target_kind) q),
      'by_sector', (select coalesce(jsonb_agg(jsonb_build_object('sector', coalesce(sector, 'غير محدد'), 'count', n, 'approved', a, 'amount', amt) order by n desc), '[]'::jsonb)
                    from (select sector, count(*) n, count(*) filter (where status = 'approved') a, coalesce(sum(amount) filter (where status = 'approved'), 0) amt from d group by sector) q),
      'by_shift', (select coalesce(jsonb_object_agg(coalesce(shift, 'morning'), n), '{}'::jsonb) from (select shift, count(*) n from d group by shift) q),
      'by_preparer', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(prepared_by_name, '—'), 'count', n, 'returned', r) order by n desc), '[]'::jsonb)
                      from (select prepared_by_name, count(*) n, count(*) filter (where resubmit_count > 0 or status = 'returned') r from d group by prepared_by_name) q),
      'by_month', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(pm, 'YYYY-MM'), 'count', n, 'approved', a, 'amount', amt) order by pm), '[]'::jsonb)
                   from (select date_trunc('month', log_date)::date pm, count(*) n, count(*) filter (where status = 'approved') a, coalesce(sum(amount) filter (where status = 'approved'), 0) amt from d group by 1) q),
      'top_employees', (select coalesce(jsonb_agg(jsonb_build_object('employee_id', employee_id, 'name', nm, 'employee_number', en, 'department', dp, 'count', n, 'approved', a, 'amount', amt) order by n desc, amt desc), '[]'::jsonb)
                        from (select employee_id, max(driver_name) nm, max(employee_number) en, max(department_name) dp, count(*) n, count(*) filter (where status = 'approved') a, coalesce(sum(amount) filter (where status = 'approved'), 0) amt
                              from d where target_kind = 'employee' and employee_id is not null group by employee_id order by n desc, amt desc limit 15) q),
      'top_vehicles', (select coalesce(jsonb_agg(jsonb_build_object('db_number', db, 'driver_name', dn, 'contractor_name', cn, 'count', n, 'approved', a, 'amount', amt) order by n desc, amt desc), '[]'::jsonb)
                       from (select db_number db, max(driver_name) dn, max(contractor_name) cn, count(*) n, count(*) filter (where status = 'approved') a, coalesce(sum(amount) filter (where status = 'approved'), 0) amt
                             from d where target_kind = 'vehicle' group by db_number order by n desc, amt desc limit 15) q),
      'deductions', (select jsonb_build_object(
                       'with_amount', count(*) filter (where status = 'approved' and amount > 0),
                       'posted', count(*) filter (where status = 'approved' and deduction_id is not null),
                       'awaiting_export', count(*) filter (where ded_state = 'awaiting_export'),
                       'exported', count(*) filter (where ded_state = 'exported'),
                       'approved_by_finance', count(*) filter (where ded_state = 'approved'),
                       'missing', count(*) filter (where ded_state = 'missing'),
                       'not_linked', count(*) filter (where status = 'approved' and amount > 0 and deduction_id is null),
                       'amount_posted', coalesce(sum(amount) filter (where status = 'approved' and deduction_id is not null), 0))
                     from d),
      'rows', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'ref_no', ref_no, 'log_date', log_date, 'target_kind', target_kind, 'db_number', db_number, 'driver_name', driver_name,
                        'employee_number', employee_number, 'department_name', department_name, 'sector', sector, 'shift', shift, 'violation_type', violation_type, 'penalty_type', penalty_type,
                        'status', status, 'amount', amount, 'prepared_by_name', prepared_by_name, 'deduction_state', ded_state, 'approved_at', approved_at) order by log_date desc, created_at desc), '[]'::jsonb)
               from (select * from d order by log_date desc limit 2000) r)
    ));
end$$;
revoke all on function public.disclosure_report(date, date, text, text) from public, anon;
grant execute on function public.disclosure_report(date, date, text, text) to authenticated;

-- ═══════════════ (ج) أجور عمال المتعهدين — المالية ═══════════════
alter table public.contractor_worker_wages
  add column if not exists wage_mode text not null default 'monthly' check (wage_mode in ('monthly', 'daily')),
  add column if not exists daily_wage numeric(14,2) not null default 0 check (daily_wage >= 0),
  add column if not exists note text check (note is null or length(note) <= 300),
  add column if not exists updated_at timestamptz not null default now();

-- كشف الشهر: كل عامل نشط خلال الشهر (أو له حضور فيه) مع حضوره وأجره والمستحق
create or replace function public.finance_contractor_wages_sheet(p_month date default null)
returns table(contractor_user_id uuid, contractor_name text, sector_id smallint, area_name text, parent_sector text,
              worker_id uuid, full_name text, phone text, is_active boolean,
              present_days int, absent_days int, marked_days int, contractor_checkins int,
              wage_mode text, monthly_wage numeric, daily_wage numeric, payable numeric, note text, set_by_name text, set_at timestamptz)
language plpgsql stable security definer set search_path = public, app as $$
declare m date := date_trunc('month', coalesce(p_month, app.baghdad_today()))::date;
begin
  if not app.has_role(array['finance_officer', 'super_admin']) then raise exception 'FINANCE_FORBIDDEN'; end if;
  return query
  select cp.user_id, app.manager_display_name(cp.user_id), s.id, s.name, s.parent_sector,
    w.id, w.full_name, w.phone, w.is_active,
    att.present, att.absent, att.present + att.absent,
    (select count(*)::int from public.contractor_checkins c where c.contractor_user_id = cp.user_id and c.log_date >= m and c.log_date < m + interval '1 month'),
    coalesce(wg.wage_mode, 'monthly'), coalesce(wg.monthly_wage, 0), coalesce(wg.daily_wage, 0),
    case when wg.id is null then null
         when wg.wage_mode = 'daily' then round(wg.daily_wage * att.present, 2)
         else wg.monthly_wage end,
    wg.note, case when wg.id is null then null else app.manager_display_name(wg.set_by) end, wg.set_at
  from public.contractor_workers w
  join public.contractor_profiles cp on cp.user_id = w.contractor_user_id
  join public.sectors s on s.id = w.sector_id
  left join public.contractor_worker_wages wg on wg.worker_id = w.id and wg.month = m
  cross join lateral (
    select count(*) filter (where a.status = 'present')::int as present, count(*) filter (where a.status = 'absent')::int as absent
    from public.contractor_worker_attendance a where a.worker_id = w.id and a.log_date >= m and a.log_date < m + interval '1 month') att
  where (w.is_active and w.created_at < m + interval '1 month') or att.present + att.absent > 0 or wg.id is not null
  order by s.parent_sector, s.name, app.manager_display_name(cp.user_id), w.full_name;
end$$;
revoke all on function public.finance_contractor_wages_sheet(date) from public, anon;
grant execute on function public.finance_contractor_wages_sheet(date) to authenticated;

create or replace function public.finance_contractor_wage_set(p_worker uuid, p_month date, p_mode text, p_amount numeric, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; w record; before_j jsonb; after_j jsonb;
begin
  if not app.has_role(array['finance_officer', 'super_admin']) then raise exception 'FINANCE_FORBIDDEN'; end if;
  if p_mode not in ('monthly', 'daily') then raise exception 'CONTRACTOR_WAGE_MODE_INVALID'; end if;
  if p_amount is null or p_amount < 0 or p_amount > 100000000 then raise exception 'CONTRACTOR_WAGE_INVALID'; end if;
  if m > date_trunc('month', app.baghdad_today())::date then raise exception 'CONTRACTOR_WAGE_FUTURE_MONTH'; end if;
  select * into w from public.contractor_workers where id = p_worker;
  if not found then raise exception 'CONTRACTOR_WORKER_NOT_FOUND'; end if;
  select to_jsonb(x) - 'id' into before_j from public.contractor_worker_wages x where x.worker_id = p_worker and x.month = m;
  insert into public.contractor_worker_wages (worker_id, month, wage_mode, monthly_wage, daily_wage, note, set_by, set_at, updated_at)
  values (p_worker, m, p_mode, case when p_mode = 'monthly' then p_amount else 0 end, case when p_mode = 'daily' then p_amount else 0 end, nullif(trim(coalesce(p_note, '')), ''), auth.uid(), now(), now())
  on conflict (worker_id, month) do update set wage_mode = excluded.wage_mode, monthly_wage = excluded.monthly_wage, daily_wage = excluded.daily_wage, note = excluded.note, set_by = excluded.set_by, set_at = now(), updated_at = now();
  select to_jsonb(x) - 'id' into after_j from public.contractor_worker_wages x where x.worker_id = p_worker and x.month = m;
  insert into public.contractor_audit_log (actor_id, action, contractor_user_id, worker_id, sector_id, log_date, before_data, after_data, reason)
  values (auth.uid(), 'wage_set', w.contractor_user_id, p_worker, w.sector_id, m, before_j, after_j, p_note);
  return after_j;
end$$;
revoke all on function public.finance_contractor_wage_set(uuid, date, text, numeric, text) from public, anon;
grant execute on function public.finance_contractor_wage_set(uuid, date, text, numeric, text) to authenticated;

-- نسخ أجور الشهر السابق للعمال الذين لا أجر لهم في هذا الشهر (يرجع عدد المنسوخ)
create or replace function public.finance_contractor_wages_copy_previous(p_month date)
returns integer language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; n int;
begin
  if not app.has_role(array['finance_officer', 'super_admin']) then raise exception 'FINANCE_FORBIDDEN'; end if;
  if m > date_trunc('month', app.baghdad_today())::date then raise exception 'CONTRACTOR_WAGE_FUTURE_MONTH'; end if;
  insert into public.contractor_worker_wages (worker_id, month, wage_mode, monthly_wage, daily_wage, note, set_by)
  select p.worker_id, m, p.wage_mode, p.monthly_wage, p.daily_wage, 'منسوخ من الشهر السابق', auth.uid()
  from public.contractor_worker_wages p
  join public.contractor_workers w on w.id = p.worker_id and w.is_active
  where p.month = (m - interval '1 month')::date
    and not exists (select 1 from public.contractor_worker_wages c where c.worker_id = p.worker_id and c.month = m);
  get diagnostics n = row_count;
  insert into public.contractor_audit_log (actor_id, action, log_date, after_data) values (auth.uid(), 'wages_copy_previous', m, jsonb_build_object('copied', n));
  return n;
end$$;
revoke all on function public.finance_contractor_wages_copy_previous(date) from public, anon;
grant execute on function public.finance_contractor_wages_copy_previous(date) to authenticated;
