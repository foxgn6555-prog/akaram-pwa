-- 00260 · تدقيق السلف: قسط السلفة في كشف الرواتب كان يبقى مستقطَعاً من الموظف حتى لو سُدِّدت السلفة نقداً (أو تغيّرت) بين التصدير واعتماد المالية
--   مثال مؤكد: قسط 80,000 في الكشف → الموظف سدّد 240,000 نقداً بعد التصدير → المالية اعتمدت → الصافي ناقص 80,000 ولم يُسجَّل أي قسط (المال ضاع على الموظف).
--   الحل: دالة مطابقة أقساط السلف بين صفوف التصدير والواقع الحالي؛ تدخل في «يلزم إعادة التصدير»؛ والاعتماد يُرفض HR_ADVANCE_STALE بلا تجاوز بالقوة.

create or replace function app.advance_export_mismatch(p_export uuid) returns int
language sql stable security definer set search_path = public, app as $$
  with x as (select id, period_month from public.hr_month_exports where id = p_export),
  rows_due as (
    select r.id, coalesce(r.advance_installment, 0) as cur,
           coalesce((select floor(least(coalesce(r.proposed_net, 0) + coalesce(r.advance_installment, 0), coalesce(sum(app.advance_installment_amount(a, r.gross_amount)), 0)))
                     from public.advances a, x
                     where a.employee_id = r.employee_id and a.status = 'delivered' and a.start_month <= x.period_month and a.amount > a.repaid_total), 0) as due
    from public.hr_month_export_rows r, x
    where r.export_id = x.id and r.pay_type is not null)
  select count(*)::int from rows_due where cur <> greatest(0, due)
$$;
revoke all on function app.advance_export_mismatch(uuid) from public, anon;

create or replace function app.hr_month_export_status(p_month date) returns jsonb
language sql stable security definer set search_path = public, app as $$
  with m as (select date_trunc('month', p_month)::date as f, (date_trunc('month', p_month) + interval '1 month - 1 day')::date as t),
  x as (select * from public.hr_month_exports, m where period_month = m.f and status in ('exported', 'approved') order by version desc limit 1),
  cov as (select coalesce(sum(unevaluated_days), 0)::int as unevaluated, count(*) filter (where unevaluated_days > 0)::int as employees from app.hr_month_coverage(p_month))
  select case when x.id is null then jsonb_build_object('export_id', null, 'status', null, 'review_status', null, 'reviewed_at', null, 'changes_after', 0, 'deductions_after', 0, 'disclosure_deductions_after', 0, 'advance_changes', 0, 'needs_reexport', false,
                                                       'unevaluated_days', cov.unevaluated, 'unevaluated_employees', cov.employees)
    else jsonb_build_object(
      'export_id', x.id, 'version', x.version, 'status', x.status, 'exported_at', x.exported_at,
      'review_status', x.review_status, 'reviewed_at', x.reviewed_at, 'reviewed_by_name', case when x.reviewed_by is null then null else app.manager_display_name(x.reviewed_by) end,
      'changes_after', (select count(*) from public.hr_attendance_audit a, m where a.work_date between m.f and m.t and a.created_at > x.exported_at and a.action not in ('export', 'approve', 'deputy_approve')),
      'deductions_after', (select count(*) from public.hr_attendance_deductions d, m where d.period_month = m.f and d.created_at > x.exported_at),
      'disclosure_deductions_after', (select count(*) from public.hr_attendance_deductions d, m where d.period_month = m.f and d.created_at > x.exported_at and d.source_disclosure_id is not null),
      'advance_changes', case when x.status = 'exported' then app.advance_export_mismatch(x.id) else 0 end,
      'needs_reexport', x.status = 'exported' and app.advance_export_mismatch(x.id) > 0 or x.status = 'exported' and exists (select 1 from public.hr_attendance_audit a, m where a.work_date between m.f and m.t and a.created_at > x.exported_at and a.action not in ('export', 'approve', 'deputy_approve')),
      'unevaluated_days', case when x.status = 'approved' then 0 else cov.unevaluated end,
      'unevaluated_employees', case when x.status = 'approved' then 0 else cov.employees end)
    end
  from (select 1) one cross join cov left join x on true
$$;

create or replace function public.finance_payroll_approve(p_export uuid, p_force boolean default false)
returns void language plpgsql security definer set search_path = public, app as $$
declare x record; st jsonb; n_bad int;
begin
  if not app.has_role(array['finance_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  select * into x from public.hr_month_exports where id = p_export;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  if x.status <> 'exported' then raise exception 'HR_EXPORT_NOT_EDITABLE'; end if;
  if x.review_status <> 'approved' then raise exception 'HR_DEPUTY_REVIEW_PENDING'; end if;
  select count(*) into n_bad from public.finance_payroll_reconcile(x.period_month) rc where rc.row_id in (select id from public.hr_month_export_rows where export_id = p_export) and not rc.money_ok;
  if n_bad > 0 then raise exception 'HR_PAYROLL_RECONCILE_MISMATCH'; end if;
  if exists (select 1 from public.hr_month_export_rows where export_id = p_export and final_net is null) then raise exception 'HR_SALARY_MISSING'; end if;
  st := app.hr_month_export_status(x.period_month);
  if app.advance_export_mismatch(p_export) > 0 then raise exception 'HR_ADVANCE_STALE'; end if;   -- 00304: لا تجاوز بالقوة — أقساط السلف في الكشف لا تطابق الواقع
  if (st ->> 'needs_reexport')::boolean and not coalesce(p_force, false) then raise exception 'HR_EXPORT_STALE'; end if;
  update public.hr_month_exports set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_export;
  insert into public.hr_attendance_audit (employee_id, work_date, action, after, reason, actor)
  select r.employee_id, x.period_month, 'approve', jsonb_build_object('export_id', p_export, 'final_net', r.final_net, 'deputy_relief', r.review_relief_amount, 'forced_stale', (st ->> 'needs_reexport')::boolean and p_force), 'اعتماد راتب الشهر', auth.uid()
  from public.hr_month_export_rows r where r.export_id = p_export;
  perform app.advance_post_installments(p_export);
  perform app.payroll_carry_uncollected(p_export);   -- 00256
end$$;
