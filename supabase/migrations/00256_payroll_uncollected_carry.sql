-- 00256 · تدقيق سلسلة الرواتب — الاستقطاعات التي تتجاوز الراتب كانت تُقتطع صامتةً (الصافي = 0 والباقي يضيع)
--   الآن: لكل صف تصدير «مبلغ غير مُحصَّل» = ما زاد من الاستقطاعات (بلا قسط السلفة، فله تأجيله الخاص، وبعد تخفيف المعاون) على الإجمالي،
--   يظهر للمالية في الكشف، وعند اعتماد المالية (القفل) يُرحَّل تلقائياً كاستقطاع إلى أول شهر مفتوح تالٍ بسبب موثّق،
--   ويُبلَّغ المالية وغرفة العمليات. لا تغيير في معادلة الراتب نفسها.

alter table public.hr_month_export_rows add column if not exists uncollected_amount numeric(14, 2) not null default 0;
alter table public.hr_attendance_deductions add column if not exists carried_from_row uuid references public.hr_month_export_rows(id) on delete set null;
create unique index if not exists hr_ded_carried_from_row_uq on public.hr_attendance_deductions (carried_from_row) where carried_from_row is not null;

create or replace function app.payroll_uncollected_fill() returns trigger language plpgsql as $$
begin
  if new.gross_amount is null or new.deductions_total is null then new.uncollected_amount := 0; return new; end if;
  new.uncollected_amount := greatest(0, round(new.deductions_total - coalesce(new.advance_installment, 0) - coalesce(new.review_relief_amount, 0) - new.gross_amount, 2));
  return new;
end$$;
drop trigger if exists trg_payroll_uncollected_fill on public.hr_month_export_rows;
create trigger trg_payroll_uncollected_fill before insert or update of gross_amount, deductions_total, advance_installment, review_relief_amount
  on public.hr_month_export_rows for each row execute function app.payroll_uncollected_fill();
update public.hr_month_export_rows set uncollected_amount = greatest(0, round(coalesce(deductions_total, 0) - coalesce(advance_installment, 0) - coalesce(review_relief_amount, 0) - coalesce(gross_amount, 0), 2))
 where gross_amount is not null and deductions_total is not null;

-- الترحيل عند اعتماد المالية: أول شهر تالٍ غير مقفل وغير معتمد الحضورية (حتى 12 شهراً)
create or replace function app.payroll_carry_uncollected(p_export uuid) returns int
language plpgsql security definer set search_path = public, app as $$
declare x public.hr_month_exports; r record; target date; i int; n int := 0; total numeric := 0; names text := '';
begin
  select * into x from public.hr_month_exports where id = p_export;
  if not found then return 0; end if;
  for r in select * from public.hr_month_export_rows where export_id = p_export and uncollected_amount > 0 loop
    if exists (select 1 from public.hr_attendance_deductions where carried_from_row = r.id) then continue; end if;
    target := (x.period_month + interval '1 month')::date; i := 0;
    while i < 12 and (app.hr_month_locked(target) or app.hr_month_confirmed(target)) loop target := (target + interval '1 month')::date; i := i + 1; end loop;
    insert into public.hr_attendance_deductions (employee_id, period_month, amount, days, reason, created_by, carried_from_row)
    values (r.employee_id, target, r.uncollected_amount, 0,
            format('رصيد مرحّل من راتب شهر %s: استقطاعات تجاوزت الراتب بمقدار %s د.ع (الإجمالي %s · الاستقطاعات %s)', to_char(x.period_month, 'YYYY-MM'), r.uncollected_amount, r.gross_amount, r.deductions_total),
            auth.uid(), r.id);
    n := n + 1; total := total + r.uncollected_amount; names := names || case when names = '' then '' else '، ' end || r.full_name;
  end loop;
  if n > 0 then
    insert into public.notifications (user_id, title, body, type, link)
    select ur.user_id, 'ترحيل استقطاعات غير مُحصَّلة إلى الشهر التالي',
           format('شهر %s: %s موظف/ين تجاوزت استقطاعاتهم الراتب — رُحِّل %s د.ع تلقائياً إلى أول شهر مفتوح (%s).', to_char(x.period_month, 'YYYY-MM'), n, total, names),
           'warning', case ur.role when 'finance_officer' then '/finance/payroll' else '/ops-room/attendance' end
    from public.user_roles ur where ur.role in ('finance_officer', 'ops_room');
  end if;
  return n;
end$$;

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
  if (st ->> 'needs_reexport')::boolean and not coalesce(p_force, false) then raise exception 'HR_EXPORT_STALE'; end if;
  update public.hr_month_exports set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_export;
  insert into public.hr_attendance_audit (employee_id, work_date, action, after, reason, actor)
  select r.employee_id, x.period_month, 'approve', jsonb_build_object('export_id', p_export, 'final_net', r.final_net, 'deputy_relief', r.review_relief_amount, 'forced_stale', (st ->> 'needs_reexport')::boolean and p_force), 'اعتماد راتب الشهر', auth.uid()
  from public.hr_month_export_rows r where r.export_id = p_export;
  perform app.advance_post_installments(p_export);
  perform app.payroll_carry_uncollected(p_export);   -- 00256
end$$;

drop function if exists public.finance_payroll_sheet(date);
create function public.finance_payroll_sheet(p_month date)
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
  uncollected_amount numeric)
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
         r.uncollected_amount
  from x join public.hr_month_export_rows r on r.export_id = x.id
  where app.has_role(array['finance_officer', 'super_admin']) and app.hr_export_visible_to_finance(x)
  order by r.department_name nulls last, app.hr_employee_sort_key(r.employee_number), r.full_name
$$;
grant execute on function public.finance_payroll_sheet(date) to authenticated;
