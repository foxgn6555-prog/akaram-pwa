-- 00225 · الحضور → غرفة العمليات → معاون المدير المفوض → المالية: إصلاح السلسلة كاملة
-- ① غرفة العمليات بلا أي صلاحية استقطاع (لا إضافة ولا حذف): الاستقطاعات تلقائية (قواعد وحدة التطوير) أو من الكشوفات المعتمدة؛ الإعفاء/التخفيض عند معاون المدير المفوض.
-- ② تعديل الحضور من غرفة العمليات يُبلَّغ به معاون المدير المفوض ووحدة التطوير المركزية معاً (إشعار + سجل تدقيق).
-- ③ تعريف المالية لراتب موظف بعد التصدير يحدّث صفّه في الكشف المفتوح تلقائياً (لا حاجة لإعادة التصدير من غرفة العمليات) — يزول «بلا ملف راتب» فوراً.
-- ④ قسط السلفة يُقرَّب للأسفل كي لا تتجاوز الاستقطاعات الإجمالي بفارق كسور (كان يوقف «التحقق الحسابي» في المالية).

-- ── ① لا استقطاع من غرفة العمليات ──
create or replace function public.ops_deduction_add(p_employee uuid, p_month date, p_amount numeric, p_days numeric, p_reason text)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_id uuid; m date := date_trunc('month', p_month)::date;
begin
  if not app.has_role(array['super_admin']) then raise exception 'OPS_DEDUCTION_DISABLED'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
  if app.hr_month_locked(m) then raise exception 'HR_MONTH_LOCKED'; end if;
  if app.hr_month_confirmed(m) then raise exception 'HR_ATTENDANCE_CONFIRMED'; end if;
  if coalesce(p_amount, 0) <= 0 and coalesce(p_days, 0) <= 0 then raise exception 'HR_DEDUCTION_INVALID'; end if;
  insert into public.hr_attendance_deductions (employee_id, period_month, amount, days, reason, created_by)
  values (p_employee, m, coalesce(p_amount, 0), coalesce(p_days, 0), trim(p_reason), auth.uid()) returning id into v_id;
  insert into public.hr_attendance_audit (employee_id, work_date, action, after, reason, actor)
  values (p_employee, m, 'deduction_add', jsonb_build_object('id', v_id, 'amount', p_amount, 'days', p_days), trim(p_reason), auth.uid());
  return v_id;
end$$;

create or replace function public.ops_deduction_delete(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, app as $$
declare d public.hr_attendance_deductions;
begin
  if not app.has_role(array['super_admin']) then raise exception 'OPS_DEDUCTION_DISABLED'; end if;
  select * into d from public.hr_attendance_deductions where id = p_id;
  if d.id is null then raise exception 'HR_NOT_FOUND'; end if;
  if d.source_disclosure_id is not null then raise exception 'HR_DEDUCTION_FROM_DISCLOSURE'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
  if app.hr_month_locked(d.period_month) then raise exception 'HR_MONTH_LOCKED'; end if;
  if app.hr_month_confirmed(d.period_month) then raise exception 'HR_ATTENDANCE_CONFIRMED'; end if;
  delete from public.hr_attendance_deductions where id = p_id;
  insert into public.hr_attendance_audit (employee_id, work_date, action, before, reason, actor)
  values (d.employee_id, d.period_month, 'deduction_delete', to_jsonb(d), trim(p_reason), auth.uid());
end$$;

-- ── ② تبليغ معاون المدير المفوض + التطوير المركزية بتعديلات غرفة العمليات ──
create or replace function app.notify_it_attendance_audit() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare v_name text; v_num text; v_action text; v_actor text;
begin
  if new.action not in ('edit', 'reset_auto', 'deduction_add', 'deduction_delete', 'waive', 'unwaive') then return new; end if;
  select e.full_name, e.employee_number into v_name, v_num from public.employees e where e.id = new.employee_id;
  v_actor := app.manager_display_name(new.actor);
  v_action := case new.action when 'edit' then 'تعديل يوم حضور' when 'reset_auto' then 'إعادة احتساب يوم'
                               when 'deduction_add' then 'إضافة استقطاع يدوي' when 'deduction_delete' then 'حذف استقطاع يدوي'
                               when 'waive' then 'إلغاء استقطاع مقترح' else 'إعادة استقطاع مقترح' end;
  insert into public.notifications (user_id, title, body, type, category, priority, link, entity_type, entity_id, action_label, dedupe_key)
  select distinct ur.user_id,
         left('تعديل حضور من غرفة العمليات — ' || coalesce(v_name, '—'), 160),
         left(format('%s · %s (%s) · يوم %s · السبب: %s · بواسطة %s', v_action, coalesce(v_name, '—'), coalesce(v_num, '—'), to_char(new.work_date, 'YYYY-MM-DD'), new.reason, coalesce(v_actor, '—')), 1000),
         'warning', 'hr', 'normal',
         case when ur.role = 'deputy_director' then '/deputy/deductions' else '/it/integrations/biometric/attendance-audit' end,
         'hr_attendance_audit', new.id, 'فتح سجل التعديلات', 'hr_audit:' || new.id::text
  from public.user_roles ur where ur.role in ('it_admin', 'deputy_director', 'super_admin') and ur.user_id is distinct from new.actor
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  return new;
end$$;

-- ── ③ بناء صفوف التصدير كدالة مستقلة (كل الموظفين أو موظف واحد) ──
drop function if exists app.hr_hour_bank_apply_export(uuid, date);
drop function if exists app.advance_apply_to_export(uuid, date);
create or replace function app.hr_hour_bank_apply_export(p_export uuid, p_month date, p_employee uuid default null) returns int
language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; n int := 0;
begin
  update public.hr_month_export_rows r set
    hour_bank_enabled = true, hour_bank_required_minutes = hb.required_minutes, hour_bank_credited_minutes = hb.credited_minutes,
    hour_bank_net_minutes = hb.net_minutes, hour_bank_credit_days = hb.credit_days, shift_minutes = hb.shift_minutes,
    auto_deduction_basis = case when r.auto_deduction_basis = 'disabled' then 'disabled' else 'hour_bank' end
  from (select x.id, hb.* from public.hr_month_export_rows x cross join lateral app.hr_hour_bank(x.employee_id, m) hb
        where x.export_id = p_export and hb.enabled and (p_employee is null or x.employee_id = p_employee)) hb
  where r.id = hb.id;
  get diagnostics n = row_count;
  return n;
end$$;

create or replace function app.advance_apply_to_export(p_export uuid, p_month date, p_employee uuid default null) returns int
language plpgsql security definer set search_path = public, app as $$
declare n int;
begin
  with due as (
    select r.id as row_id, least(coalesce(r.proposed_net, 0), sum(app.advance_installment_amount(a, r.gross_amount))) as inst
    from public.hr_month_export_rows r
    join public.advances a on a.employee_id = r.employee_id and a.status = 'delivered' and a.start_month <= p_month and a.amount > a.repaid_total
    where r.export_id = p_export and r.pay_type is not null and (p_employee is null or r.employee_id = p_employee)
    group by r.id, r.proposed_net)
  update public.hr_month_export_rows r
     set advance_installment = floor(d.inst),
         deductions_total = coalesce(r.deductions_total, 0) + floor(d.inst),
         proposed_net = greatest(0, coalesce(r.proposed_net, 0) - floor(d.inst)),
         final_net = greatest(0, coalesce(r.final_net, r.proposed_net, 0) - floor(d.inst))
  from due d where d.row_id = r.id and d.inst > 0;
  get diagnostics n = row_count;
  return n;
end$$;

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
    auto_deduction_basis, auto_deduction_days_capped, auto_deduction_rule, days_rest, salary_model,
    pay_type, base_salary, daily_rate, allowances_total, fixed_deductions_total, proposed_net, final_net)
  select p_export, e.id, e.employee_number, e.full_name, d.name, b.name, e.job_title, e.contract_type,
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
          ) dd) r) x) y) calc
  -- 00225: موظف واحد (تحديث صف بعد تعريف راتبه) أو الجميع
  where (p_employee is null or e.id = p_employee);
  get diagnostics n = row_count;
  return n;
end$$;

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

  n := app.hr_export_insert_rows(v_id, m, null);
  perform app.hr_hour_bank_apply_export(v_id, m, null);   -- 00216: استقطاع ساعات العجز الصافية فقط + أعمدة البنك
  update public.hr_month_exports set rows_count = n where id = v_id;
  insert into public.hr_attendance_audit (employee_id, work_date, action, after, reason, actor)
  select e.employee_id, m, 'export', jsonb_build_object('export_id', v_id, 'version', v_ver, 'days_evaluated', n_eval, 'salary_day_basis', v_basis, 'salary_model', v_model, 'pay_rest_days', v_pay_rest, 'prorate', v_prorate, 'auto_deduction', coalesce(e.auto_deduction_basis, 'salary'), 'auto_deduction_rule', e.auto_deduction_rule), 'تصدير الشهر إلى المالية', auth.uid()
  from public.hr_month_export_rows e where e.export_id = v_id;
  perform app.advance_apply_to_export(v_id, m, null);
  return v_id;
end$$;

-- تحديث صف موظف واحد في كل تصدير مفتوح (غير معتمد من المالية) كان فيه «بلا ملف راتب»
create or replace function app.hr_export_refresh_salary_row(p_employee uuid) returns int
language plpgsql security definer set search_path = public, app as $$
declare x record; n int := 0; v_note text;
begin
  for x in select ex.id, ex.period_month, r.id as row_id, r.review_note
             from public.hr_month_exports ex join public.hr_month_export_rows r on r.export_id = ex.id
            where ex.status = 'exported' and r.employee_id = p_employee and r.pay_type is null
  loop
    if app.hr_month_locked(x.period_month) then continue; end if;
    v_note := x.review_note;
    delete from public.hr_month_export_rows where id = x.row_id;
    perform app.hr_export_insert_rows(x.id, x.period_month, p_employee);
    perform app.hr_hour_bank_apply_export(x.id, x.period_month, p_employee);
    perform app.advance_apply_to_export(x.id, x.period_month, p_employee);
    update public.hr_month_export_rows set review_note = v_note where export_id = x.id and employee_id = p_employee and v_note is not null;
    perform app.deputy_recompute(x.id);
    insert into public.hr_attendance_audit (employee_id, work_date, action, after, reason, actor)
    values (p_employee, x.period_month, 'export', jsonb_build_object('export_id', x.id, 'refresh', 'salary_defined'), 'تحديث صف الكشف بعد تعريف الراتب من المالية', auth.uid());
    n := n + 1;
  end loop;
  return n;
end$$;

create or replace function app.salary_profile_refresh_export() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if new.status = 'defined' then perform app.hr_export_refresh_salary_row(new.employee_id); end if;
  return new;
end$$;
drop trigger if exists trg_salary_profile_refresh_export on public.employee_salary_profiles;
create trigger trg_salary_profile_refresh_export after insert or update on public.employee_salary_profiles
  for each row execute function app.salary_profile_refresh_export();
