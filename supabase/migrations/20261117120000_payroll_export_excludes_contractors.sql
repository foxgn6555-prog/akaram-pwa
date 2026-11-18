-- ═══════════════════════════════════════════════════════════════
-- منع الدفع المزدوج: المتعهد يُحاسَب عبر «كشف أجور المتعهدين» فقط، لا عبر كشف الموظفين الشهري
--   الخلل: app.hr_export_insert_rows تُدرج كل صف في public.employees. فمتى عُرِّف للمتعهد راتب موظف (employee_salary_profiles)
--          صار له صف في كشف الموظفين، وفي الوقت نفسه يُحسب أجره في public.finance_contractor_wages_sheet ⇒ يُدفع مرتين.
--   القرار (المالك): يُستثنى المتعهدون من كشف الموظفين.
--   القاعدة: يُستثنى الموظف إن كان له ملف متعهد يدخل كشف أجور المتعهدين لذلك الشهر، أي بالشرط نفسه الذي يستعمله ذلك الكشف:
--          ملف فعّال، أو أجر يومي مُعرَّف للشهر (contractor_rates)، أو عدد يومي مسجّل فيه (contractor_daily_counts).
--          متعهد سابق صار موظفاً عادياً (ملفه غير فعّال ولا أجر ولا أعداد في الشهر) لا يُستثنى، فلا يضيع راتبه.
--   الأثر: ops_month_export لا يُدرج المتعهد في الكشف. settlement_compute (تسوية إنهاء الخدمة) تتعامل مع غياب صفه بـ coalesce
--          فتعطيه راتباً صفراً بلا خطأ. hr_export_refresh_salary_row لا يجد له صفاً فلا يفعل شيئاً.
--   لا تغيير في أي شيء آخر: نص الدالة مطابق (بعد تجاهل المسافات) للحي الآن ولـ 00338 عدا الشرط المضاف في آخر WHERE.
--   التراجع: أعد تنفيذ تعريف الدالة كما في 00338_payroll_presumed_remaining_days.sql.
-- ═══════════════════════════════════════════════════════════════

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
  where (p_employee is null or e.id = p_employee)
    -- منع الدفع المزدوج: المتعهد يُحاسَب عبر «كشف أجور المتعهدين» (finance_contractor_wages_sheet) لا عبر كشف الموظفين.
    -- الشرط نفسه الذي يدخل به ذلك الكشف لهذا الشهر: ملف فعّال، أو أجر يومي مُعرَّف للشهر، أو عدد يومي مسجّل فيه.
    and not exists (
      select 1 from public.contractor_profiles cp
       where cp.user_id = e.user_id
         and (cp.is_active
              or exists (select 1 from public.contractor_rates cr where cr.contractor_user_id = cp.user_id and cr.month = m)
              or exists (select 1 from public.contractor_daily_counts dc where dc.contractor_user_id = cp.user_id and dc.log_date between m and m_to)));
  get diagnostics n = row_count;
  return n;
end$$;
