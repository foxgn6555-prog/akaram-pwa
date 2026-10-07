-- 00194 · المالية — التحقق الحسابي لكشف الرواتب (مطابقة كل صف من مكوناته + مطابقة الحضورية الحية + مطابقة استقطاعات العمليات + أقساط السلف)
--   finance_payroll_reconcile(p_month): صف لكل موظف في آخر تصدير مع القيم المخزَّنة والمُعاد احتسابها وقائمة المخالفات.
--   finance_payroll_approve: يرفض الاعتماد إن وُجدت مخالفة حسابية (HR_PAYROLL_RECONCILE_MISMATCH) — لا يُعتمد كشف أرقامه لا تتطابق.

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
           when coalesce(r.proration_ratio, 1) < 1 then round(least(coalesce(r.base_salary, 0), round(coalesce(r.day_rate, 0) * coalesce(r.covered_days, 0), 2)) + coalesce(r.allowances_total, 0), 2)
           else round(coalesce(r.base_salary, 0) + coalesce(r.allowances_total, 0), 2) end as g_exp,
      case when r.pay_type is null then null
           else round(coalesce(r.fixed_deductions_total, 0) + coalesce(r.ops_deduction_amount, 0) + coalesce(r.ops_deduction_days_amount, 0) + coalesce(r.auto_deduction_amount, 0) + coalesce(r.advance_installment, 0), 2) end as d_exp,
      la.working_days as l_working, la.days_present as l_present, la.days_absent as l_absent, la.days_leave as l_leave, la.days_incomplete as l_incomplete, la.auto_minutes as l_auto_min, la.auto_days as l_auto_days, la.auto_days_shortfall as l_auto_days_short,
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
        case when b.l_working is not null and (b.l_auto_min <> b.auto_deduction_minutes or (case when b.pay_type = 'daily' then b.l_auto_days_short else b.l_auto_days end) <> b.auto_deduction_days) and b.auto_deduction_basis is distinct from 'disabled' then 'AUTO_DEDUCTION_CHANGED' end,
        case when b.l_ded_amt <> b.ops_deduction_amount or b.l_ded_days <> b.ops_deduction_days then 'OPS_DEDUCTIONS_CHANGED' end
      ]::text[], null) as iss
    from base b)
  select c.id, c.employee_id, c.employee_number, c.full_name, c.department_name, c.branch_name, c.pay_type,
    c.gross_amount, c.g_exp, c.deductions_total, c.d_exp, c.proposed_net, c.n_exp, c.final_net,
    jsonb_build_object(
      'base_salary', c.base_salary, 'daily_rate', c.daily_rate, 'day_rate', c.day_rate, 'payable_days', c.payable_days, 'covered_days', c.covered_days, 'days_in_month', c.days_in_month, 'proration_ratio', c.proration_ratio,
      'allowances', c.allowances_total, 'fixed_deductions', c.fixed_deductions_total, 'ops_amount', c.ops_deduction_amount, 'ops_days', c.ops_deduction_days, 'ops_days_amount', c.ops_deduction_days_amount,
      'auto_minutes', c.auto_deduction_minutes, 'auto_days', c.auto_deduction_days, 'auto_amount', c.auto_deduction_amount, 'auto_basis', c.auto_deduction_basis, 'advance', c.advance_installment,
      'working_days', c.working_days, 'present', c.days_present, 'absent', c.days_absent, 'leave', c.days_leave, 'incomplete', c.days_incomplete, 'unevaluated', c.unevaluated_days),
    jsonb_build_object('working_days', c.l_working, 'present', c.l_present, 'absent', c.l_absent, 'leave', c.l_leave, 'incomplete', c.l_incomplete, 'auto_minutes', c.l_auto_min, 'auto_days', c.l_auto_days, 'ops_amount', c.l_ded_amt, 'ops_days', c.l_ded_days, 'ops_count', c.l_ded_n),
    c.iss,
    not (c.iss && array['GROSS_MISMATCH', 'DEDUCTIONS_MISMATCH', 'NET_MISMATCH', 'FINAL_NEGATIVE', 'NET_NOT_FLOORED']::text[]),
    not (c.iss && array['DAYS_UNCLASSIFIED', 'UNEVALUATED_DAYS', 'ATTENDANCE_CHANGED', 'AUTO_DEDUCTION_CHANGED', 'OPS_DEDUCTIONS_CHANGED']::text[]),
    coalesce(array_length(c.iss, 1), 0) = 0
  from chk c
  where app.has_role(array['finance_officer', 'super_admin'])
  order by c.branch_name nulls last, c.department_name nulls last, app.hr_employee_sort_key(c.employee_number), c.full_name
$$;
grant execute on function public.finance_payroll_reconcile(date) to authenticated;

-- الاعتماد يرفض أي كشف فيه مخالفة حسابية (لا يُفترض حدوثها؛ هي صمام أمان نهائي)
create or replace function public.finance_payroll_approve(p_export uuid, p_force boolean default false)
returns void language plpgsql security definer set search_path = public, app as $$
declare x record; st jsonb; n_bad int;
begin
  if not app.has_role(array['finance_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  select * into x from public.hr_month_exports where id = p_export;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  if x.status <> 'exported' then raise exception 'HR_EXPORT_NOT_EDITABLE'; end if;
  select count(*) into n_bad from public.finance_payroll_reconcile(x.period_month) rc where rc.row_id in (select id from public.hr_month_export_rows where export_id = p_export) and not rc.money_ok;
  if n_bad > 0 then raise exception 'HR_PAYROLL_RECONCILE_MISMATCH'; end if;
  if exists (select 1 from public.hr_month_export_rows where export_id = p_export and final_net is null) then raise exception 'HR_SALARY_MISSING'; end if;
  st := app.hr_month_export_status(x.period_month);
  if (st ->> 'needs_reexport')::boolean and not coalesce(p_force, false) then raise exception 'HR_EXPORT_STALE'; end if;
  update public.hr_month_exports set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_export;
  insert into public.hr_attendance_audit (employee_id, work_date, action, after, reason, actor)
  select r.employee_id, x.period_month, 'approve', jsonb_build_object('export_id', p_export, 'final_net', r.final_net, 'forced_stale', (st ->> 'needs_reexport')::boolean and p_force), 'اعتماد رواتب الشهر', auth.uid()
  from public.hr_month_export_rows r where r.export_id = p_export;
  perform app.advance_post_installments(p_export);
end$$;

-- تعديل المالية: الصافي المعتمد لا يكون سالباً ولا يتجاوز الإجمالي قبل الاستقطاع (حماية من خطأ إدخال)
create or replace function public.finance_payroll_adjust(p_row uuid, p_final_net numeric, p_note text)
returns void language plpgsql security definer set search_path = public, app as $$
declare r record;
begin
  if not app.has_role(array['finance_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  select er.*, x.status as x_status into r from public.hr_month_export_rows er join public.hr_month_exports x on x.id = er.export_id where er.id = p_row;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  if r.x_status <> 'exported' then raise exception 'HR_EXPORT_NOT_EDITABLE'; end if;
  if p_final_net is null or p_final_net < 0 then raise exception 'HR_AMOUNT_INVALID'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
  if r.pay_type is null then raise exception 'HR_SALARY_MISSING'; end if;
  if r.gross_amount is not null and p_final_net > r.gross_amount then raise exception 'HR_FINAL_ABOVE_GROSS'; end if;
  update public.hr_month_export_rows set final_net = round(p_final_net, 2), finance_note = trim(p_note), adjusted_by = auth.uid(), adjusted_at = now() where id = p_row;
end$$;
