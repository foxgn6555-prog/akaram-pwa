-- 00251 · ضريبة الآليات المؤجرة (3٪) — استقطاع مستقل من راتب السائقين المرتبطين بآليات مؤجرة
--   · من يخضع: كل موظف مرتبط بآلية «مؤجرة» (ownership_type = rented) في قاعدة آليات غرفة العمليات — سائقها الأساسي أو سائق شفت فعّال — لحظة التصدير.
--   · الوعاء: الإجمالي المستحق للشهر (gross_amount = الأساسي المتناسب مع الأيام المستحقة [حضور + إجازة مدفوعة] + المخصصات) قبل أي استقطاع.
--     ⇒ لا يتأثر بالغرامات/السلف/الاستقطاعات الأخرى ولا يؤثر فيها؛ الغياب غير المدفوع لا يدخل في الوعاء أصلاً.
--   · المبلغ الدقيق بلا تقريب (فلسان). سطر مستقل في الكشف: deductions_total += الضريبة، proposed_net/final_net −= الضريبة. يُطبَّق قبل أقساط السلف.
--   · التعديل حصراً في بوابة معاون المدير المفوض: نسبة عامة (افتراضي 3٪) + نسبة خاصة لموظف + إعفاء كامل (بسبب ومدة اختيارية) + سجل تدقيق.
--   · التغييرات تسري على التصدير القادم؛ الكشوف المُصدَّرة لا تُعدَّل بأثر رجعي (إعادة التصدير من غرفة العمليات تعيد الاحتساب).
--   · ليست ضمن مراجعة الاستقطاعات الشهرية للمعاون (الأنواع الأربعة) ولا تُخفَّف بنسبة التخفيض العام.

-- ── ① الإعدادات العامة (صف واحد) ──
create table if not exists public.rented_vehicle_tax_settings (
  id          int primary key default 1 check (id = 1),
  pct         numeric(5, 2) not null default 3 check (pct >= 0 and pct <= 100),
  updated_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now()
);
insert into public.rented_vehicle_tax_settings (id) values (1) on conflict (id) do nothing;
alter table public.rented_vehicle_tax_settings enable row level security;
create policy "rented_tax_settings: قراءة" on public.rented_vehicle_tax_settings for select to authenticated
  using (app.has_role(array['deputy_director', 'finance_officer', 'executive_director', 'super_admin']));

-- ── ② استثناءات/نسب خاصة لموظف ──
create table if not exists public.rented_vehicle_tax_overrides (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  mode        text not null check (mode in ('exempt', 'custom')),
  pct         numeric(5, 2) check (pct is null or (pct >= 0 and pct <= 100)),
  reason      text not null check (length(trim(reason)) between 3 and 500),
  valid_from  date not null default current_date,
  valid_to    date check (valid_to is null or valid_to >= valid_from),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint rented_tax_override_pct_check check ((mode = 'exempt' and pct is null) or (mode = 'custom' and pct is not null))
);
alter table public.rented_vehicle_tax_overrides enable row level security;
create policy "rented_tax_overrides: قراءة" on public.rented_vehicle_tax_overrides for select to authenticated
  using (app.has_role(array['deputy_director', 'finance_officer', 'executive_director', 'super_admin']));

-- ── ③ سجل التدقيق ──
create table if not exists public.rented_vehicle_tax_audit (
  id          uuid primary key default gen_random_uuid(),
  seq         bigserial,
  employee_id uuid references public.employees (id) on delete cascade,
  action      text not null check (action in ('pct', 'exempt', 'custom', 'clear')),
  before      jsonb, after jsonb,
  reason      text,
  actor       uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_rented_tax_audit_at on public.rented_vehicle_tax_audit (created_at desc);
alter table public.rented_vehicle_tax_audit enable row level security;
create policy "rented_tax_audit: قراءة" on public.rented_vehicle_tax_audit for select to authenticated
  using (app.has_role(array['deputy_director', 'super_admin']));

-- ── ④ أعمدة الكشف ──
alter table public.hr_month_export_rows add column if not exists rented_tax_pct     numeric(5, 2)  not null default 0;
alter table public.hr_month_export_rows add column if not exists rented_tax_amount  numeric(14, 2) not null default 0;
alter table public.hr_month_export_rows add column if not exists rented_tax_vehicle text;
alter table public.hr_month_export_rows add column if not exists rented_tax_source  text check (rented_tax_source is null or rented_tax_source in ('auto', 'custom', 'exempt'));
comment on column public.hr_month_export_rows.rented_tax_amount is '00251: ضريبة الآلية المؤجرة = gross_amount × rented_tax_pct ÷ 100 (مستقلة عن باقي الاستقطاعات)';

-- ── ⑤ الآليات المؤجرة المرتبطة بموظف (السائق الأساسي أو سائق شفت فعّال) ──
create or replace function app.rented_vehicles_of(p_employee uuid) returns text
language sql stable security definer set search_path = public, app as $$
  select nullif(string_agg(distinct v.db_number || ' — ' || v.vehicle_name, ' · ' order by v.db_number || ' — ' || v.vehicle_name), '')
  from public.garage_vehicles v
  where v.archived_at is null and v.ownership_type = 'rented'
    and (v.driver_employee_id = p_employee
         or exists (select 1 from public.garage_vehicle_shift_assignments a where a.vehicle_id = v.id and a.ends_at is null and a.driver_employee_id = p_employee))
$$;

-- النسبة الفعّالة للموظف في تاريخ معيّن: {pct, source auto|custom|exempt|none, vehicle, reason}
create or replace function app.rented_tax_rate_for(p_employee uuid, p_on date default current_date) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare v text; o public.rented_vehicle_tax_overrides; g numeric;
begin
  v := app.rented_vehicles_of(p_employee);
  if v is null then return jsonb_build_object('pct', 0, 'source', 'none', 'vehicle', null, 'reason', null); end if;
  select * into o from public.rented_vehicle_tax_overrides where employee_id = p_employee and valid_from <= p_on and (valid_to is null or valid_to >= p_on);
  if found then
    return jsonb_build_object('pct', case when o.mode = 'exempt' then 0 else o.pct end, 'source', o.mode, 'vehicle', v, 'reason', o.reason, 'valid_to', o.valid_to);
  end if;
  select pct into g from public.rented_vehicle_tax_settings where id = 1;
  return jsonb_build_object('pct', coalesce(g, 3), 'source', 'auto', 'vehicle', v, 'reason', null);
end$$;

-- ── ⑥ تطبيق الضريبة على صفوف تصدير (بعد إدراج الصفوف وبنك الساعات، قبل السلف) ──
create or replace function app.rented_tax_apply_to_export(p_export uuid, p_month date, p_employee uuid default null) returns int
language plpgsql security definer set search_path = public, app as $$
declare n int;
begin
  with rate as (
    select r.id as row_id, j
    from public.hr_month_export_rows r
    cross join lateral app.rented_tax_rate_for(r.employee_id, current_date) j
    where r.export_id = p_export and r.pay_type is not null and (p_employee is null or r.employee_id = p_employee) and (j ->> 'source') <> 'none')
  update public.hr_month_export_rows r
     set rented_tax_pct = (rt.j ->> 'pct')::numeric,
         rented_tax_amount = round(coalesce(r.gross_amount, 0) * (rt.j ->> 'pct')::numeric / 100, 2),
         rented_tax_vehicle = rt.j ->> 'vehicle',
         rented_tax_source = rt.j ->> 'source',
         deductions_total = coalesce(r.deductions_total, 0) + round(coalesce(r.gross_amount, 0) * (rt.j ->> 'pct')::numeric / 100, 2),
         proposed_net = greatest(0, coalesce(r.proposed_net, 0) - round(coalesce(r.gross_amount, 0) * (rt.j ->> 'pct')::numeric / 100, 2)),
         final_net = greatest(0, coalesce(r.final_net, r.proposed_net, 0) - round(coalesce(r.gross_amount, 0) * (rt.j ->> 'pct')::numeric / 100, 2))
  from rate rt where rt.row_id = r.id;
  get diagnostics n = row_count;
  return n;
end$$;

-- ── ⑦ التصدير (نسخة 00226 + الضريبة) ──
create or replace function public.ops_month_export(p_month date)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; v_id uuid; v_ver int; n int; n_eval int;
        v_basis text := coalesce(app.hr_policy() ->> 'salary_day_basis', 'fixed_30');
        v_prorate boolean := app.hr_policy_bool('prorate_partial_month', true);
        v_model text := coalesce(app.hr_policy() ->> 'salary_model', 'earned_days');
        v_pay_rest boolean := app.hr_policy_bool('pay_rest_days', false);
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
  perform app.hr_hour_bank_credit(m);
  n := app.hr_export_insert_rows(v_id, m, null);
  perform app.hr_hour_bank_apply_export(v_id, m, null);
  perform app.rented_tax_apply_to_export(v_id, m, null);   -- 00251: ضريبة الآليات المؤجرة (سطر مستقل من الإجمالي المستحق)
  update public.hr_month_exports set rows_count = n where id = v_id;
  insert into public.hr_attendance_audit (employee_id, work_date, action, after, reason, actor)
  select e.employee_id, m, 'export', jsonb_build_object('export_id', v_id, 'version', v_ver, 'days_evaluated', n_eval, 'salary_day_basis', v_basis, 'salary_model', v_model, 'pay_rest_days', v_pay_rest, 'prorate', v_prorate, 'auto_deduction', coalesce(e.auto_deduction_basis, 'salary'), 'auto_deduction_rule', e.auto_deduction_rule, 'rented_tax_pct', e.rented_tax_pct, 'rented_tax_amount', e.rented_tax_amount), 'تصدير الشهر إلى معاون المدير المفوض (ثم المالية بعد اعتماده)', auth.uid()
  from public.hr_month_export_rows e where e.export_id = v_id;
  perform app.advance_apply_to_export(v_id, m, null);
  return v_id;
end$$;

-- تحديث صف موظف واحد بعد تعريف راتبه (نسخة 00225 + الضريبة)
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
    perform app.rented_tax_apply_to_export(x.id, x.period_month, p_employee);
    perform app.advance_apply_to_export(x.id, x.period_month, p_employee);
    update public.hr_month_export_rows set review_note = v_note where export_id = x.id and employee_id = p_employee and v_note is not null;
    perform app.deputy_recompute(x.id);
    insert into public.hr_attendance_audit (employee_id, work_date, action, after, reason, actor)
    values (p_employee, x.period_month, 'export', jsonb_build_object('export_id', x.id, 'refresh', 'salary_defined'), 'تحديث صف الكشف بعد تعريف الراتب من المالية', auth.uid());
    n := n + 1;
  end loop;
  return n;
end$$;

-- ── ⑧ كشف المالية: الأعمدة الجديدة ──
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
  rented_tax_pct numeric, rented_tax_amount numeric, rented_tax_vehicle text, rented_tax_source text)
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
         r.rented_tax_pct, r.rented_tax_amount, r.rented_tax_vehicle, r.rented_tax_source
  from x join public.hr_month_export_rows r on r.export_id = x.id
  where app.has_role(array['finance_officer', 'super_admin']) and app.hr_export_visible_to_finance(x)
  order by r.department_name nulls last, app.hr_employee_sort_key(r.employee_number), r.full_name
$$;
grant execute on function public.finance_payroll_sheet(date) to authenticated;

-- ── ⑨ المطابقة: الضريبة جزء من الاستقطاعات المتوقعة (نسخة 00216 + rented_tax) ──
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
      case when r.pay_type is null then null
           when r.pay_type = 'daily' then round(coalesce(r.daily_rate, 0) * coalesce(r.payable_days, 0) + coalesce(r.allowances_total, 0), 2)
           when r.salary_model = 'earned_days' then round(least(coalesce(r.base_salary, 0), round(coalesce(r.day_rate, 0) * coalesce(r.payable_days, 0), 2)) + coalesce(r.allowances_total, 0), 2)
           when coalesce(r.proration_ratio, 1) < 1 then round(least(coalesce(r.base_salary, 0), round(coalesce(r.day_rate, 0) * coalesce(r.covered_days, 0), 2)) + coalesce(r.allowances_total, 0), 2)
           else round(coalesce(r.base_salary, 0) + coalesce(r.allowances_total, 0), 2) end as g_exp,
      case when r.pay_type is null then null
           else round(coalesce(r.fixed_deductions_total, 0) + coalesce(r.ops_deduction_amount, 0) + coalesce(r.ops_deduction_days_amount, 0) + coalesce(r.auto_deduction_amount, 0) + coalesce(r.advance_installment, 0) + coalesce(r.rented_tax_amount, 0), 2) end as d_exp,
      -- 00251: الضريبة المتوقعة من الصف نفسه = الإجمالي × النسبة المخزّنة
      round(coalesce(r.gross_amount, 0) * coalesce(r.rented_tax_pct, 0) / 100, 2) as tax_exp,
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
        case when b.pay_type is not null and round(coalesce(b.rented_tax_amount, 0), 2) <> b.tax_exp then 'RENTED_TAX_MISMATCH' end,
        case when b.pay_type is not null and round(coalesce(b.proposed_net, 0), 2) <> greatest(0, round(b.g_exp - b.d_exp, 2)) then 'NET_MISMATCH' end,
        case when b.pay_type is not null and b.final_net is not null and b.final_net < 0 then 'FINAL_NEGATIVE' end,
        case when b.pay_type is not null and coalesce(b.deductions_total, 0) > coalesce(b.gross_amount, 0) and coalesce(b.proposed_net, 0) <> 0 then 'NET_NOT_FLOORED' end,
        case when b.working_days <> b.days_present + b.days_absent + b.days_incomplete + b.days_leave then 'DAYS_UNCLASSIFIED' end,
        case when coalesce(b.unevaluated_days, 0) > 0 then 'UNEVALUATED_DAYS' end,
        case when b.l_working is not null and (b.l_present <> b.days_present or b.l_absent <> b.days_absent or b.l_leave <> b.days_leave or b.l_incomplete <> b.days_incomplete) then 'ATTENDANCE_CHANGED' end,
        case when b.l_working is not null and ((case when b.hour_bank_enabled then (select hb.deduction_minutes from app.hr_hour_bank(b.employee_id, p_month) hb) else b.l_auto_min end) <> b.auto_deduction_minutes or (case when b.pay_type = 'daily' or b.salary_model = 'earned_days' then b.l_auto_days_short else b.l_auto_days end) <> b.auto_deduction_days) and b.auto_deduction_basis is distinct from 'disabled' then 'AUTO_DEDUCTION_CHANGED' end,
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
      'rented_tax_pct', c.rented_tax_pct, 'rented_tax', c.rented_tax_amount, 'rented_tax_vehicle', c.rented_tax_vehicle,
      'working_days', c.working_days, 'present', c.days_present, 'absent', c.days_absent, 'leave', c.days_leave, 'incomplete', c.days_incomplete, 'unevaluated', c.unevaluated_days),
    jsonb_build_object('working_days', c.l_working, 'present', c.l_present, 'leave_paid', c.l_leave_paid, 'rest', c.l_rest, 'absent', c.l_absent, 'leave', c.l_leave, 'incomplete', c.l_incomplete, 'auto_minutes', c.l_auto_min, 'auto_days', c.l_auto_days, 'ops_amount', c.l_ded_amt, 'ops_days', c.l_ded_days, 'ops_count', c.l_ded_n),
    c.iss,
    not (c.iss && array['GROSS_MISMATCH', 'DEDUCTIONS_MISMATCH', 'RENTED_TAX_MISMATCH', 'NET_MISMATCH', 'FINAL_NEGATIVE', 'NET_NOT_FLOORED']::text[]),
    not (c.iss && array['DAYS_UNCLASSIFIED', 'UNEVALUATED_DAYS', 'ATTENDANCE_CHANGED', 'AUTO_DEDUCTION_CHANGED', 'OPS_DEDUCTIONS_CHANGED', 'PAYABLE_DAYS_CHANGED']::text[]),
    coalesce(array_length(c.iss, 1), 0) = 0
  from chk c
  where app.has_role(array['finance_officer', 'super_admin'])
  order by c.branch_name nulls last, c.department_name nulls last, app.hr_employee_sort_key(c.employee_number), c.full_name
$$;

-- ── ⑩ واجهة المعاون ──
create or replace function app.rented_tax_require_deputy() returns void language plpgsql stable as $$
begin if not app.has_role(array['deputy_director', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if; end$$;

-- النظرة العامة: الإعداد + السائقون المرتبطون حالياً بآليات مؤجرة (+ أي موظف له استثناء) مع النسبة الفعّالة وآخر كشف
create or replace function public.deputy_rented_tax_overview() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare s public.rented_vehicle_tax_settings; rows jsonb; last_m date;
begin
  perform app.rented_tax_require_deputy();
  select * into s from public.rented_vehicle_tax_settings where id = 1;
  select max(period_month) into last_m from public.hr_month_exports where status in ('exported', 'approved');
  select coalesce(jsonb_agg(jsonb_build_object(
           'employee_id', e.id, 'employee_number', e.employee_number, 'full_name', e.full_name, 'department_name', d.name, 'job_title', e.job_title,
           'vehicles', app.rented_vehicles_of(e.id), 'linked', app.rented_vehicles_of(e.id) is not null,
           'pct', (j ->> 'pct')::numeric, 'source', j ->> 'source',
           'override', case when o.employee_id is null then null else jsonb_build_object('mode', o.mode, 'pct', o.pct, 'reason', o.reason, 'valid_from', o.valid_from, 'valid_to', o.valid_to, 'created_at', o.created_at, 'by', app.user_display_name(o.created_by)) end,
           'last_month', lr.period_month, 'last_gross', lr.gross_amount, 'last_tax', lr.rented_tax_amount, 'last_pct', lr.rented_tax_pct,
           'has_salary', exists (select 1 from public.employee_salary_profiles sp where sp.employee_id = e.id and sp.status = 'defined')
         ) order by (app.rented_vehicles_of(e.id) is null), d.name nulls last, app.hr_employee_sort_key(e.employee_number)), '[]'::jsonb)
    into rows
  from public.employees e
  left join public.departments d on d.id = e.department_id
  left join public.rented_vehicle_tax_overrides o on o.employee_id = e.id
  cross join lateral app.rented_tax_rate_for(e.id, current_date) j
  left join lateral (select r.gross_amount, r.rented_tax_amount, r.rented_tax_pct, x.period_month from public.hr_month_export_rows r join public.hr_month_exports x on x.id = r.export_id
                     where r.employee_id = e.id and x.status in ('exported', 'approved') order by x.period_month desc, x.version desc limit 1) lr on true
  where e.archived_at is null and e.employment_status <> 'terminated' and (app.rented_vehicles_of(e.id) is not null or o.employee_id is not null);
  return jsonb_build_object('pct', s.pct, 'updated_at', s.updated_at, 'updated_by', app.user_display_name(s.updated_by), 'last_export_month', last_m,
    'rented_vehicles', (select count(*) from public.garage_vehicles v where v.archived_at is null and v.ownership_type = 'rented'),
    'rented_vehicles_without_driver', (select count(*) from public.garage_vehicles v where v.archived_at is null and v.ownership_type = 'rented' and v.driver_employee_id is null
                                        and not exists (select 1 from public.garage_vehicle_shift_assignments a where a.vehicle_id = v.id and a.ends_at is null and a.driver_employee_id is not null)),
    'employees', rows);
end$$;
grant execute on function public.deputy_rented_tax_overview() to authenticated;

create or replace function public.deputy_rented_tax_set_pct(p_pct numeric, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare old numeric;
begin
  perform app.rented_tax_require_deputy();
  if p_pct is null or p_pct < 0 or p_pct > 100 then raise exception 'RENTED_TAX_PCT_INVALID'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'RENTED_TAX_REASON_REQUIRED'; end if;
  select pct into old from public.rented_vehicle_tax_settings where id = 1;
  update public.rented_vehicle_tax_settings set pct = p_pct, updated_by = auth.uid(), updated_at = now() where id = 1;
  insert into public.rented_vehicle_tax_audit (action, before, after, reason, actor) values ('pct', jsonb_build_object('pct', old), jsonb_build_object('pct', p_pct), trim(p_reason), auth.uid());
  return jsonb_build_object('pct', p_pct, 'previous', old);
end$$;
grant execute on function public.deputy_rented_tax_set_pct(numeric, text) to authenticated;

-- إعفاء كامل أو نسبة خاصة لموظف (مدة اختيارية)
create or replace function public.deputy_rented_tax_override_set(p_employee uuid, p_mode text, p_pct numeric, p_reason text, p_valid_to date default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare old public.rented_vehicle_tax_overrides; o public.rented_vehicle_tax_overrides;
begin
  perform app.rented_tax_require_deputy();
  if p_mode not in ('exempt', 'custom') then raise exception 'RENTED_TAX_MODE_INVALID'; end if;
  if p_mode = 'custom' and (p_pct is null or p_pct < 0 or p_pct > 100) then raise exception 'RENTED_TAX_PCT_INVALID'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'RENTED_TAX_REASON_REQUIRED'; end if;
  if not exists (select 1 from public.employees where id = p_employee and archived_at is null) then raise exception 'HR_NOT_FOUND'; end if;
  if p_valid_to is not null and p_valid_to < current_date then raise exception 'RENTED_TAX_DATE_INVALID'; end if;
  select * into old from public.rented_vehicle_tax_overrides where employee_id = p_employee;
  insert into public.rented_vehicle_tax_overrides (employee_id, mode, pct, reason, valid_from, valid_to, created_by)
  values (p_employee, p_mode, case when p_mode = 'exempt' then null else p_pct end, trim(p_reason), current_date, p_valid_to, auth.uid())
  on conflict (employee_id) do update set mode = excluded.mode, pct = excluded.pct, reason = excluded.reason, valid_from = current_date, valid_to = excluded.valid_to, created_by = auth.uid(), updated_at = now()
  returning * into o;
  insert into public.rented_vehicle_tax_audit (employee_id, action, before, after, reason, actor)
  values (p_employee, p_mode, case when old.employee_id is null then null else to_jsonb(old) end, to_jsonb(o), trim(p_reason), auth.uid());
  return to_jsonb(o);
end$$;
grant execute on function public.deputy_rented_tax_override_set(uuid, text, numeric, text, date) to authenticated;

create or replace function public.deputy_rented_tax_override_clear(p_employee uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, app as $$
declare old public.rented_vehicle_tax_overrides;
begin
  perform app.rented_tax_require_deputy();
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'RENTED_TAX_REASON_REQUIRED'; end if;
  delete from public.rented_vehicle_tax_overrides where employee_id = p_employee returning * into old;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  insert into public.rented_vehicle_tax_audit (employee_id, action, before, after, reason, actor) values (p_employee, 'clear', to_jsonb(old), null, trim(p_reason), auth.uid());
end$$;
grant execute on function public.deputy_rented_tax_override_clear(uuid, text) to authenticated;

create or replace function public.deputy_rented_tax_audit(p_limit int default 200) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select case when not app.has_role(array['deputy_director', 'super_admin']) then null else coalesce((
    select jsonb_agg(jsonb_build_object('id', a.id, 'employee_id', a.employee_id, 'employee_number', e.employee_number, 'full_name', e.full_name,
             'action', a.action, 'before', a.before, 'after', a.after, 'reason', a.reason, 'actor_name', app.user_display_name(a.actor), 'created_at', a.created_at) order by a.seq desc)
    from (select * from public.rented_vehicle_tax_audit order by seq desc limit greatest(1, least(coalesce(p_limit, 200), 1000))) a
    left join public.employees e on e.id = a.employee_id), '[]'::jsonb) end
$$;
grant execute on function public.deputy_rented_tax_audit(int) to authenticated;

-- محاكاة شهر (للمعاون): كم ستبلغ ضريبة كل سائق لو صُدِّر الشهر الآن — من آخر كشف إن وُجد (الإجمالي المستحق × النسبة الفعّالة الحالية)
create or replace function public.deputy_rented_tax_preview(p_month date) returns jsonb
language sql stable security definer set search_path = public, app as $$
  select case when not app.has_role(array['deputy_director', 'super_admin']) then null else coalesce((
    select jsonb_agg(jsonb_build_object('employee_id', r.employee_id, 'employee_number', r.employee_number, 'full_name', r.full_name, 'gross_amount', r.gross_amount,
             'stored_pct', r.rented_tax_pct, 'stored_tax', r.rented_tax_amount, 'current_pct', (j ->> 'pct')::numeric, 'current_source', j ->> 'source',
             'current_tax', round(coalesce(r.gross_amount, 0) * (j ->> 'pct')::numeric / 100, 2), 'export_status', x.status, 'version', x.version) order by r.full_name)
    from public.hr_month_exports x join public.hr_month_export_rows r on r.export_id = x.id
    cross join lateral app.rented_tax_rate_for(r.employee_id, current_date) j
    where x.period_month = date_trunc('month', p_month)::date and x.status in ('exported', 'approved') and x.version = (select max(version) from public.hr_month_exports y where y.period_month = x.period_month and y.status in ('exported', 'approved'))
      and ((j ->> 'source') <> 'none' or r.rented_tax_amount > 0)), '[]'::jsonb) end
$$;
grant execute on function public.deputy_rented_tax_preview(date) to authenticated;
