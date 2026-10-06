-- 00187 · الراتب الشهري بالنسبة والتناسب + ضوابط الاستقطاع والمخالفات من بوابة التطوير المركزية
--
-- المشكلة: تصدير الشهر في يومه الخامس كان يُظهر الراتب الشهري كاملاً (500,000) مع استقطاعات 5 أيام فقط.
-- ① الفترة المشمولة بالتصدير = من أول الشهر (أو تاريخ التعيين) إلى آخر يوم مكتمل (أمس إن كان الشهر جارياً، أو نهاية
--    الشهر/تاريخ إنهاء الخدمة). الراتب الشهري يُستحق بنسبة الفترة المشمولة: الإجمالي = أجر اليوم × الأيام المشمولة
--    (والشهر المكتمل = الراتب كاملاً مهما كان عدد أيامه).
-- ② سياسة الراتب من بوابة التطوير المركزية (hr_policy):
--    salary_day_basis: fixed_30 (أجر اليوم = الأساسي ÷ 30) | calendar_days (الأساسي ÷ أيام الشهر الفعلية)
--    prorate_partial_month (افتراضي true) · prorate_allowances (افتراضي true)
--    auto_deduction_cap_ratio (0–1، افتراضي 1): سقف الاستقطاع التلقائي كنسبة من الإجمالي المستحق
-- ③ أنواع الكشوفات: حد أدنى/أقصى للمبلغ لكل نوع (IT) يُفرض على أي مبلغ يُحدَّد أو يُعدَّل (DISCLOSURE_AMOUNT_OUT_OF_RANGE).

-- ─── ② السياسة ────────────────────────────────────────────────────────────────
update public.hr_policy set settings = settings
  || jsonb_build_object('salary_day_basis', coalesce(settings ->> 'salary_day_basis', 'fixed_30'))
  || jsonb_build_object('prorate_partial_month', coalesce((settings ->> 'prorate_partial_month')::boolean, true))
  || jsonb_build_object('prorate_allowances', coalesce((settings ->> 'prorate_allowances')::boolean, true))
  || jsonb_build_object('auto_deduction_cap_ratio', coalesce((settings ->> 'auto_deduction_cap_ratio')::numeric, 1))
where id = 1;

create or replace function public.hr_policy_set(p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare cur jsonb; t jsonb; i int := 0; prev_to int := 0;
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
  update public.hr_policy set settings = cur, updated_by = auth.uid(), updated_at = now() where id = 1;
  return cur;
end$$;

-- ─── ① الفترة المشمولة لكل موظف ─────────────────────────────────────────────────
-- covered_days: أيام تقويمية مشمولة بالتصدير · days_in_month · full_month: الفترة تغطي الشهر كله
create or replace function app.hr_month_period(p_month date)
returns table(employee_id uuid, period_from date, period_to date, covered_days int, days_in_month int, full_month boolean)
language sql stable security definer set search_path = public, app as $$
  with m as (select date_trunc('month', p_month)::date as f, (date_trunc('month', p_month) + interval '1 month - 1 day')::date as t, app.hr_local_date(now()) as today)
  select e.id,
         greatest(m.f, e.hire_date) as period_from,
         least(m.t, coalesce(e.terminated_at, m.t), case when m.today <= m.t then m.today - 1 else m.t end) as period_to,
         greatest(0, least(m.t, coalesce(e.terminated_at, m.t), case when m.today <= m.t then m.today - 1 else m.t end) - greatest(m.f, e.hire_date) + 1)::int as covered_days,
         (m.t - m.f + 1)::int as days_in_month,
         greatest(m.f, e.hire_date) = m.f and least(m.t, coalesce(e.terminated_at, m.t), case when m.today <= m.t then m.today - 1 else m.t end) = m.t as full_month
  from public.employees e, m
  where e.archived_at is null
$$;

alter table public.hr_month_export_rows
  add column if not exists period_from   date,
  add column if not exists period_to     date,
  add column if not exists covered_days  integer,
  add column if not exists days_in_month integer,
  add column if not exists day_rate      numeric(14, 4),
  add column if not exists proration_ratio numeric(8, 6),
  add column if not exists auto_deduction_capped boolean not null default false;

create or replace function public.ops_month_export(p_month date)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; v_id uuid; v_ver int; n int; n_eval int;
        v_basis text := coalesce(app.hr_policy() ->> 'salary_day_basis', 'fixed_30');
        v_prorate boolean := app.hr_policy_bool('prorate_partial_month', true);
        v_prorate_allow boolean := app.hr_policy_bool('prorate_allowances', true);
        v_cap numeric := app.hr_policy_num('auto_deduction_cap_ratio', 1);
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
    pay_type, base_salary, daily_rate, allowances_total, fixed_deductions_total, proposed_net, final_net)
  select v_id, e.id, e.employee_number, e.full_name, d.name, b.name, e.job_title, e.contract_type,
    s.working_days, s.days_present, s.days_late, s.days_absent, s.days_incomplete, s.days_leave, s.late_minutes, s.early_minutes,
    s.ded_amount, s.ded_days, s.ded_reasons,
    s.auto_minutes, s.auto_days, s.shift_minutes, s.overtime_minutes, s.shortfall_minutes, calc.auto_amount,
    s.days_leave_paid, s.days_leave_unpaid, s.auto_days_absence, s.auto_days_shortfall, calc.ops_days_amount, calc.payable_days, calc.gross, calc.deductions,
    s.scheduled_days, s.unevaluated_days, per.period_from, per.period_to, per.covered_days, per.days_in_month, calc.day_rate, calc.ratio, calc.capped,
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
      select x.day_rate, x.ratio, x.payable_days, x.ops_days_amount, x.allow,
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
          select rates.day_rate, rates.ratio,
            case when sp.pay_type = 'daily' then (s.days_present + s.days_leave_paid)::numeric else null end as payable_days,
            -- الأساسي المستحق: الشهر المكتمل = الأساسي كاملاً؛ الجزئي = أجر اليوم × الأيام المشمولة (بسقف الأساسي)
            case when sp.pay_type = 'daily' then 0
                 when per.full_month or not v_prorate then sp.base_salary
                 else least(sp.base_salary, round(rates.day_rate * per.covered_days, 2)) end as base_due,
            case when sp.pay_type = 'monthly' and v_prorate and v_prorate_allow and not per.full_month then round(al.total * rates.ratio, 2) else al.total end as allow,
            round(rates.minute_rate * s.auto_minutes + rates.day_rate * (case when sp.pay_type = 'daily' then s.auto_days_shortfall else s.auto_days end), 2) as auto_raw,
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
          ) rates) r) x) y) calc;
  get diagnostics n = row_count;
  update public.hr_month_exports set rows_count = n where id = v_id;
  insert into public.hr_attendance_audit (employee_id, work_date, action, after, reason, actor)
  select e.employee_id, m, 'export', jsonb_build_object('export_id', v_id, 'version', v_ver, 'days_evaluated', n_eval, 'salary_day_basis', v_basis, 'prorate', v_prorate), 'تصدير الشهر إلى المالية', auth.uid()
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
  period_from date, period_to date, covered_days int, days_in_month int, day_rate numeric, proration_ratio numeric, auto_deduction_capped boolean)
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
         r.period_from, r.period_to, r.covered_days, r.days_in_month, r.day_rate, r.proration_ratio, r.auto_deduction_capped
  from x join public.hr_month_export_rows r on r.export_id = x.id
  where app.has_role(array['finance_officer', 'super_admin'])
  order by r.department_name nulls last, app.hr_employee_sort_key(r.employee_number), r.full_name
$$;
grant execute on function public.finance_payroll_sheet(date) to authenticated;

-- ─── ③ حدود مبلغ المخالفة لكل نوع كشف ─────────────────────────────────────────
alter table public.disclosure_types
  add column if not exists min_amount numeric(14,2) check (min_amount is null or min_amount >= 0),
  add column if not exists max_amount numeric(14,2) check (max_amount is null or max_amount >= 0);

create or replace function public.disclosure_types_list() returns jsonb language sql stable security definer set search_path = public, app as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'description', description, 'allowed_penalties', allowed_penalties, 'default_amount', default_amount,
    'min_amount', min_amount, 'max_amount', max_amount,
    'is_active', is_active, 'sort_order', sort_order, 'updated_at', updated_at, 'updated_by_name', app.manager_display_name(updated_by),
    'used', (select count(*) from public.disclosures d where d.violation_type = t.key)) order by sort_order, label), '[]'::jsonb)
  from public.disclosure_types t $$;

drop function if exists public.disclosure_type_save(text, text, text, text[], numeric, boolean, int);
create or replace function public.disclosure_type_save(p_key text, p_label text, p_description text default null, p_allowed_penalties text[] default null, p_default_amount numeric default null,
                                                       p_is_active boolean default true, p_sort_order int default 100, p_min_amount numeric default null, p_max_amount numeric default null)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare v_key text := lower(trim(coalesce(p_key, ''))); pen text[] := coalesce(p_allowed_penalties, array['warning','reprimand','termination']);
begin
  perform app.require_it();
  if v_key !~ '^[a-z][a-z0-9_]{1,40}$' then raise exception 'DISCLOSURE_TYPE_KEY_INVALID'; end if;
  if length(trim(coalesce(p_label, ''))) < 2 then raise exception 'DISCLOSURE_TYPE_LABEL_INVALID'; end if;
  if exists (select 1 from unnest(pen) x where x not in ('warning','reprimand','termination')) then raise exception 'DISCLOSURE_PENALTY_INVALID'; end if;
  if p_default_amount is not null and p_default_amount < 0 then raise exception 'DISCLOSURE_AMOUNT_INVALID'; end if;
  if p_min_amount is not null and p_min_amount < 0 then raise exception 'DISCLOSURE_AMOUNT_INVALID'; end if;
  if p_max_amount is not null and p_max_amount < 0 then raise exception 'DISCLOSURE_AMOUNT_INVALID'; end if;
  if p_min_amount is not null and p_max_amount is not null and p_max_amount < p_min_amount then raise exception 'DISCLOSURE_AMOUNT_RANGE_INVALID'; end if;
  if p_default_amount is not null and ((p_min_amount is not null and p_default_amount < p_min_amount) or (p_max_amount is not null and p_default_amount > p_max_amount)) then raise exception 'DISCLOSURE_AMOUNT_RANGE_INVALID'; end if;
  insert into public.disclosure_types (key, label, description, allowed_penalties, default_amount, is_active, sort_order, min_amount, max_amount, updated_by, updated_at)
  values (v_key, trim(p_label), nullif(trim(coalesce(p_description, '')), ''), pen, p_default_amount, coalesce(p_is_active, true), coalesce(p_sort_order, 100), p_min_amount, p_max_amount, auth.uid(), now())
  on conflict (key) do update set label = excluded.label, description = excluded.description, allowed_penalties = excluded.allowed_penalties, default_amount = excluded.default_amount,
    is_active = excluded.is_active, sort_order = excluded.sort_order, min_amount = excluded.min_amount, max_amount = excluded.max_amount, updated_by = excluded.updated_by, updated_at = now();
  return public.disclosure_types_list();
end$$;
grant execute on function public.disclosure_type_save(text, text, text, text[], numeric, boolean, int, numeric, numeric) to authenticated;

-- الفرض عند أي تحديد/تعديل للمبلغ (الحفظ، قرار المعاون، تعديل المدير المفوض) — عبر trigger حتى لا يُلتف عليه
create or replace function app.disclosure_amount_bounds_check() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare t record;
begin
  if new.amount is null or (tg_op = 'UPDATE' and new.amount is not distinct from old.amount and new.violation_type = old.violation_type) then return new; end if;
  select min_amount, max_amount into t from public.disclosure_types where key = new.violation_type;
  if (t.min_amount is not null and new.amount < t.min_amount) or (t.max_amount is not null and new.amount > t.max_amount) then
    raise exception 'DISCLOSURE_AMOUNT_OUT_OF_RANGE';
  end if;
  return new;
end$$;
drop trigger if exists trg_disclosure_amount_bounds on public.disclosures;
create trigger trg_disclosure_amount_bounds before insert or update of amount, violation_type on public.disclosures
  for each row execute function app.disclosure_amount_bounds_check();
