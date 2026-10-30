-- ═══════════════════════════════════════════════════════════════
-- 00338 · الجولة 00392 — تدقيق حساب الراتب: التصدير قبل نهاية الشهر لا يُسقط الأيام المتبقية
--   العيب المُعاد إنتاجه: راتب 500,000 · شهر 31 يوماً · حضور كامل حتى يوم 29 · تصدير الكشف يوم 30 · إجازة مدفوعة يوم 31
--     ⇒ الإجمالي 467,742 (= 500,000 ÷ 31 × 29) لأن «الأيام المستحقة» عدّت الأيام المقيَّمة فقط (حتى الأمس)،
--     فسقط يوم التصدير نفسه وكل ما بعده (ومنها الإجازة المعتمدة مسبقاً).
--   القاعدة الصحيحة (الشهري): الراتب كامل ما لم يوجد ما يُنقصه. الأيام من يوم التصدير إلى آخر الشهر (أو آخر يوم عمل)
--     تُفترض مدفوعة إلا: إجازة غير مدفوعة معتمدة، يوم راحة بالشفت (ما لم تُفعَّل «pay_rest_days»)، أو يوم له تقييم فعلي
--     (يُحتسب بتقييمه). تُخزَّن في عمود مستقل days_presumed وتظهر في معادلة الكشف للشفافية.
--   اليومي (أجر باليوم) لا يُفترض له شيء — يُدفع ما عمله فقط.
--   النموذج القديم full_minus_absence: التغطية الفعلية = المغطّى + المتبقي ⇒ شهر كامل بلا تناسب عند التصدير المبكر.
--   لا تغيير في: أجر اليوم (÷ أيام الشهر الفعلية)، أجر الدقيقة (÷ دقائق الشفت الفعلية 360 للمسائي 6 س)، الاستقطاعات، الإعفاءات.
-- ═══════════════════════════════════════════════════════════════

alter table public.hr_month_export_rows add column if not exists days_presumed int not null default 0;

-- الأيام المتبقية المفترضة لكل موظف: من (آخر يوم مغطّى + 1) إلى نهاية الشهر/آخر يوم عمل
create or replace function app.hr_month_presumed(p_month date)
returns table(employee_id uuid, presumed_from date, presumed_to date, presumed_cal_days int, presumed_days int, presumed_unpaid_leave int, presumed_rest int)
language sql stable security definer set search_path = public, app as $$
  with m as (select date_trunc('month', p_month)::date as f, (date_trunc('month', p_month) + interval '1 month - 1 day')::date as t),
  per as (select p.*, e.terminated_at from app.hr_month_period(p_month) p join public.employees e on e.id = p.employee_id, m),
  rng as (
    select p.employee_id, greatest(p.period_to + 1, p.period_from) as d_from, least(m.t, coalesce(p.terminated_at, m.t)) as d_to
    from per p, m),
  days as (
    select r.employee_id, g::date as d from rng r cross join lateral generate_series(r.d_from, r.d_to, interval '1 day') g where r.d_from <= r.d_to),
  cls as (
    select x.employee_id, x.d,
      exists (select 1 from public.hr_attendance_days a where a.employee_id = x.employee_id and a.work_date = x.d) as evaluated,
      exists (select 1 from public.hr_leaves l join public.hr_leave_types t on t.id = l.leave_type_id
              where l.employee_id = x.employee_id and l.status = 'approved' and l.kind = 'leave' and not t.is_paid and x.d between l.start_date and l.end_date) as unpaid_leave,
      exists (select 1 from app.hr_effective_shift(x.employee_id, x.d) sh where sh.shift_id is not null and not (extract(dow from x.d)::smallint = any (sh.work_days))) as rest
    from days x)
  select r.employee_id, r.d_from, r.d_to,
         (select count(*)::int from cls c where c.employee_id = r.employee_id),
         (select count(*)::int from cls c where c.employee_id = r.employee_id and not c.evaluated and not c.unpaid_leave and (not c.rest or app.hr_policy_bool('pay_rest_days', false))),
         (select count(*)::int from cls c where c.employee_id = r.employee_id and not c.evaluated and c.unpaid_leave),
         (select count(*)::int from cls c where c.employee_id = r.employee_id and not c.evaluated and not c.unpaid_leave and c.rest)
  from rng r
$$;

create or replace function app.hr_export_insert_rows(p_export uuid, p_month date, p_employee uuid default null) returns int
language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; n int;
        v_basis text := coalesce(app.hr_policy() ->> 'salary_day_basis', 'fixed_30');
        v_prorate boolean := app.hr_policy_bool('prorate_partial_month', true);
        v_prorate_allow boolean := app.hr_policy_bool('prorate_allowances', true);
        v_model text := coalesce(app.hr_policy() ->> 'salary_model', 'earned_days');
        v_pay_rest boolean := app.hr_policy_bool('pay_rest_days', false);
        m_to date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  insert into public.hr_month_export_rows (export_id, employee_id, employee_number, full_name, department_name, branch_name, job_title, contract_type,
    working_days, days_present, days_late, days_absent, days_incomplete, days_leave, late_minutes, early_minutes,
    ops_deduction_amount, ops_deduction_days, ops_deduction_reasons,
    auto_deduction_minutes, auto_deduction_days, shift_minutes, overtime_minutes, shortfall_minutes, auto_deduction_amount,
    days_leave_paid, days_leave_unpaid, auto_absence_days, auto_shortfall_days, ops_deduction_days_amount, payable_days, gross_amount, deductions_total,
    scheduled_days, unevaluated_days, period_from, period_to, covered_days, days_in_month, day_rate, proration_ratio, auto_deduction_capped,
    auto_deduction_basis, auto_deduction_days_capped, auto_deduction_rule, days_rest, salary_model, days_presumed,
    pay_type, base_salary, daily_rate, allowances_total, fixed_deductions_total, proposed_net, final_net)
  select p_export, e.id, e.employee_number, e.full_name, d.name, b.name, e.job_title, e.contract_type,
    s.working_days, s.days_present, s.days_late, s.days_absent, s.days_incomplete, s.days_leave, s.late_minutes, s.early_minutes,
    s.ded_amount, s.ded_days, s.ded_reasons,
    s.auto_minutes, case when sp.pay_type = 'daily' or v_model = 'earned_days' then s.auto_days_shortfall else s.auto_days end, s.shift_minutes, s.overtime_minutes, s.shortfall_minutes, calc.auto_amount,
    s.days_leave_paid, s.days_leave_unpaid, s.auto_days_absence, s.auto_days_shortfall, calc.ops_days_amount, calc.payable_days, calc.gross, calc.deductions,
    s.scheduled_days, s.unevaluated_days, per.period_from, per.period_to, per.covered_days, per.days_in_month, calc.day_rate, calc.ratio, calc.capped,
    case when not rl.auto_on then 'disabled' else rl.mode end, calc.days_capped, rl.rule_name, rs.days_rest, case when sp.pay_type = 'daily' then 'daily' else v_model end, case when sp.pay_type = 'daily' then 0 else pr.presumed_days end,
    sp.pay_type, sp.base_salary, sp.daily_rate, calc.allow, fd.total, calc.net, calc.net
  from public.employees e
  join app.hr_month_summary(m) s on s.employee_id = e.id
  join app.hr_month_period(m) per on per.employee_id = e.id
  -- 00392: الأيام المتبقية من الشهر عند التصدير قبل نهايته (اليوم وما بعده) تُفترض مدفوعة للشهري ما لم تكن إجازة غير مدفوعة/راحة/مقيَّمة
  left join app.hr_month_presumed(m) pr0 on pr0.employee_id = e.id
  cross join lateral (select coalesce(pr0.presumed_days, 0) as presumed_days, coalesce(pr0.presumed_cal_days, 0) as presumed_cal_days,
                             (per.full_month or (per.period_from = m and per.period_to + coalesce(pr0.presumed_cal_days, 0) >= least(m_to, coalesce(e.terminated_at, m_to)))) as eff_full,
                             per.covered_days + coalesce(pr0.presumed_cal_days, 0) as eff_covered) pr
  left join public.departments d on d.id = e.department_id
  left join public.branches b on b.id = e.branch_id
  left join public.employee_salary_profiles sp on sp.employee_id = e.id and sp.status = 'defined'
  -- 00201: أيام الراحة المجدولة (تُدفع فقط إن فعّلت وحدة التطوير «pay_rest_days»)
  cross join lateral (select count(*)::int as days_rest from public.hr_attendance_days a where a.employee_id = e.id and a.is_rest_day and a.work_date between m and m_to) rs
  -- 00201: الأيام المستحقة = حضور (بما فيه البصمة الناقصة التي تُعدّ حاضراً) + إجازة مدفوعة من الرصيد (+ راحة إن فُعّلت)
  -- 00202: البصمة الناقصة تُدفع إلا إذا قالت قاعدة الموظف «تُعامل كغياب» (incomplete_punch_as_absent) — نفس القاعدة التي يراها الحضور
  cross join lateral (select (s.days_present + case when app.hr_incomplete_payable(e.id, m) then s.days_incomplete else 0 end + s.days_leave_paid + case when v_pay_rest then rs.days_rest else 0 end
                              + case when sp.pay_type = 'daily' then 0 else pr.presumed_days end)::numeric as payable_days) pdx
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
                 when pr.eff_full or not v_prorate then sp.base_salary
                 else least(sp.base_salary, round(rates.day_rate * pr.eff_covered, 2)) end as base_due,
            case when sp.pay_type = 'monthly' and v_model = 'earned_days' then (case when v_prorate_allow then round(al.total * rates.ratio, 2) else al.total end)
                 when sp.pay_type = 'monthly' and v_prorate and v_prorate_allow and not pr.eff_full then round(al.total * rates.ratio, 2) else al.total end as allow,
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
                   when pr.eff_full or not v_prorate then 1
                   else least(1, round(least(sp.base_salary, dr.day_rate * pr.eff_covered) / sp.base_salary, 6)) end as ratio
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
          ) dd) r) x) y) calc
  -- 00225: موظف واحد (تحديث صف بعد تعريف راتبه) أو الجميع
  where (p_employee is null or e.id = p_employee);
  get diagnostics n = row_count;
  return n;
end$$;

-- ── كشف المالية: عمود الأيام المفترضة ──
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
  auto_deduction_basis text, auto_deduction_days_capped boolean, advance_installment numeric, auto_deduction_rule text, days_rest int, salary_model text,
  hour_bank_enabled boolean, hour_bank_required_minutes int, hour_bank_credited_minutes int, hour_bank_net_minutes int, hour_bank_credit_days numeric,
  review_status text, reviewed_at timestamptz, review_pct numeric, review_relief_amount numeric, review_note text, review_relief jsonb,
  rented_tax_pct numeric, rented_tax_amount numeric, rented_tax_vehicle text, rented_tax_source text,
  uncollected_amount numeric,
  overtime_amount numeric, overtime_paid_minutes int,
  days_presumed int)
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
         r.auto_deduction_basis, r.auto_deduction_days_capped, r.advance_installment, r.auto_deduction_rule, r.days_rest, r.salary_model,
         r.hour_bank_enabled, r.hour_bank_required_minutes, r.hour_bank_credited_minutes, r.hour_bank_net_minutes, r.hour_bank_credit_days,
         x.review_status, x.reviewed_at, x.review_pct, r.review_relief_amount, r.review_note, r.review_relief,
         r.rented_tax_pct, r.rented_tax_amount, r.rented_tax_vehicle, r.rented_tax_source,
         r.uncollected_amount,
         r.overtime_amount, r.overtime_paid_minutes,
         r.days_presumed
  from x join public.hr_month_export_rows r on r.export_id = x.id
  where app.has_role(array['finance_officer', 'super_admin']) and app.hr_export_visible_to_finance(x)
  order by r.department_name nulls last, app.hr_employee_sort_key(r.employee_number), r.full_name
$$;
grant execute on function public.finance_payroll_sheet(date) to authenticated;
