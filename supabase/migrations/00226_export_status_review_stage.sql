-- 00226 · مسار التصدير ظاهر بوضوح لغرفة العمليات: عمليات → معاون المدير المفوض → المالية
-- حالة التصدير (hr_month_export_status) تحمل مرحلة مراجعة المعاون (review_status/reviewed_at/reviewed_by_name) كي تعرض غرفة العمليات
-- «بانتظار مراجعة المعاون» أو «لدى المالية» بدقة؛ ونص سجل التدقيق عند التصدير يذكر المعاون. لا تغيير في المنطق.

create or replace function app.hr_month_export_status(p_month date) returns jsonb
language sql stable security definer set search_path = public, app as $$
  with m as (select date_trunc('month', p_month)::date as f, (date_trunc('month', p_month) + interval '1 month - 1 day')::date as t),
  x as (select * from public.hr_month_exports, m where period_month = m.f and status in ('exported', 'approved') order by version desc limit 1),
  cov as (select coalesce(sum(unevaluated_days), 0)::int as unevaluated, count(*) filter (where unevaluated_days > 0)::int as employees from app.hr_month_coverage(p_month))
  select case when x.id is null then jsonb_build_object('export_id', null, 'status', null, 'review_status', null, 'reviewed_at', null, 'changes_after', 0, 'deductions_after', 0, 'disclosure_deductions_after', 0, 'needs_reexport', false,
                                                       'unevaluated_days', cov.unevaluated, 'unevaluated_employees', cov.employees)
    else jsonb_build_object(
      'export_id', x.id, 'version', x.version, 'status', x.status, 'exported_at', x.exported_at,
      'review_status', x.review_status, 'reviewed_at', x.reviewed_at, 'reviewed_by_name', case when x.reviewed_by is null then null else app.manager_display_name(x.reviewed_by) end,
      'changes_after', (select count(*) from public.hr_attendance_audit a, m where a.work_date between m.f and m.t and a.created_at > x.exported_at and a.action not in ('export', 'approve', 'deputy_approve')),
      'deductions_after', (select count(*) from public.hr_attendance_deductions d, m where d.period_month = m.f and d.created_at > x.exported_at),
      'disclosure_deductions_after', (select count(*) from public.hr_attendance_deductions d, m where d.period_month = m.f and d.created_at > x.exported_at and d.source_disclosure_id is not null),
      'needs_reexport', x.status = 'exported' and exists (select 1 from public.hr_attendance_audit a, m where a.work_date between m.f and m.t and a.created_at > x.exported_at and a.action not in ('export', 'approve', 'deputy_approve')),
      'unevaluated_days', case when x.status = 'approved' then 0 else cov.unevaluated end,
      'unevaluated_employees', case when x.status = 'approved' then 0 else cov.employees end)
    end
  from (select 1) one cross join cov left join x on true
$$;

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
  select e.employee_id, m, 'export', jsonb_build_object('export_id', v_id, 'version', v_ver, 'days_evaluated', n_eval, 'salary_day_basis', v_basis, 'salary_model', v_model, 'pay_rest_days', v_pay_rest, 'prorate', v_prorate, 'auto_deduction', coalesce(e.auto_deduction_basis, 'salary'), 'auto_deduction_rule', e.auto_deduction_rule), 'تصدير الشهر إلى معاون المدير المفوض (ثم المالية بعد اعتماده)', auth.uid()
  from public.hr_month_export_rows e where e.export_id = v_id;
  perform app.advance_apply_to_export(v_id, m, null);
  return v_id;
end$$;
