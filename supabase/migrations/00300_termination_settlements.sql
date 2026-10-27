-- 00300 (الجولة 00355) · وحدة «المنتهية خدماتهم والتصفية النهائية» — كاملة عند الشؤون المالية.
--   · عند تنفيذ إنهاء الخدمة (من الإجراءات أو من HR مباشرة) يُفتح ملف تصفية تلقائياً (مشغّل على employees)،
--     ويُبلَّغ المدير المباشر للموظف (employees.manager_id ثم مدير القسم) والمالية.
--   · بنود التصفية (نفس معادلات الكشف بلا أي تغيير): راتب شهر الإنهاء التناسبي حتى آخر يوم (احتساب جاف عبر خط الكشف نفسه:
--     hr_export_insert_rows + بنك الساعات + الضريبة + الإضافي المصروف) + تعويض رصيد الإجازات المتبقي (أيام × أجر اليوم نفسه)
--     − السلف المسلَّمة غير المسددة. الاستقطاعات (ثابتة/عمليات/تلقائية) داخل صافي الراتب كما في الكشف.
--   · التصفية مستقلة عن كشف الشهر: ما إن يُفتح ملف تصفية يُستبعد الموظف من كشف شهر الإنهاء (hr_month_period) فلا يُصرف مرتين.
--     إن كان شهر الإنهاء مقفلاً (معتمداً) وفيه صف للموظف ⇒ بند الراتب = 0 بملاحظة «صُرف ضمن الكشف المعتمد».
--   · المالية: إعادة احتساب (معلّقة) → اعتماد (تجميد البنود) → تأكيد التسليم. صافٍ سالب ⇒ ذمة على الموظف: «تسديد» أو «إعفاء بسبب».
--   · عند التسليم/التسديد تُقفل السلف المشمولة (قسط نقدي بقيمة المتبقي) — عند الإعفاء تُقفل بملاحظة الإعفاء.

-- ── ① الجداول
create table if not exists public.hr_settlements (
  id               uuid primary key default gen_random_uuid(),
  ref_no           text not null unique,
  employee_id      uuid not null references public.employees (id),
  employee_number  text,
  full_name        text not null,
  department_name  text,
  job_title        text,
  termination_type text,
  last_day         date not null,
  reason           text,
  salary_month     date not null,
  status           text not null default 'pending' check (status in ('pending','approved','delivered','debt_open','debt_paid','debt_waived')),
  lines            jsonb not null default '{}'::jsonb,
  net_amount       numeric(14, 2) not null default 0,
  computed_at      timestamptz,
  approved_by      uuid references auth.users (id) on delete set null,
  approved_at      timestamptz,
  approve_note     text,
  delivered_by     uuid references auth.users (id) on delete set null,
  delivered_at     timestamptz,
  delivery_note    text,
  debt_amount      numeric(14, 2) not null default 0,
  debt_closed_by   uuid references auth.users (id) on delete set null,
  debt_closed_at   timestamptz,
  debt_note        text,
  manager_user_id  uuid,
  manager_name     text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists uq_hr_settlements_open on public.hr_settlements (employee_id) where status in ('pending','approved','debt_open');
create index if not exists idx_hr_settlements_status on public.hr_settlements (status, created_at desc);
alter table public.hr_settlements enable row level security;
drop policy if exists "hr_settlements: المالية" on public.hr_settlements;
create policy "hr_settlements: المالية" on public.hr_settlements for select to authenticated
  using (app.has_role(array['finance_officer', 'super_admin']));

create table if not exists public.hr_settlement_events (
  id            bigserial primary key,
  settlement_id uuid not null references public.hr_settlements (id) on delete cascade,
  action        text not null,
  actor         uuid references auth.users (id) on delete set null,
  actor_name    text,
  amount        numeric(14, 2),
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_hr_settlement_events on public.hr_settlement_events (settlement_id, id);
alter table public.hr_settlement_events enable row level security;
drop policy if exists "hr_settlement_events: المالية" on public.hr_settlement_events;
create policy "hr_settlement_events: المالية" on public.hr_settlement_events for select to authenticated
  using (app.has_role(array['finance_officer', 'super_admin']));

create sequence if not exists app.hr_settlement_ref_seq;

-- ── ② استبعاد الموظف صاحب ملف التصفية من كشف شهر الإنهاء (إلا أثناء الاحتساب الجاف نفسه)
create or replace function app.settlement_blocks_sheet(p_employee uuid, p_month date) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from public.hr_settlements s where s.employee_id = p_employee and s.salary_month = p_month)
     and coalesce(current_setting('app.settlement_calc', true), '') <> p_employee::text
$$;

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
    and not app.settlement_blocks_sheet(e.id, m.f)   -- 00300: صاحب ملف التصفية يُصرف من التصفية لا من الكشف
$$;

-- إشعار المعاون لا يُطلق للتصدير الجاف الخاص بالتصفية (version < 0)
create or replace function app.notify_deputy_on_export() returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if new.version < 0 then return new; end if;   -- 00300: احتساب جاف للتصفية — يُحذف فوراً
  perform app.notify_by_role(array['deputy_director'], 'كشف استقطاعات ' || to_char(new.period_month, 'YYYY-MM') || ' بانتظار مراجعتك',
    'صدّرت غرفة العمليات حضورية الشهر (إصدار ' || new.version || '). المالية لن ترى الكشف قبل اعتمادك.', 'warning', '/deputy/deductions');
  return new;
end$$;

-- ── ②أ بنك الساعات: موظف بلا صف في hr_month_period (ملف تصفية) لا يُسقط التصدير (نسخة 00218 + سطر القيم الآمنة)
create or replace function app.hr_hour_bank(p_employee uuid, p_month date)
returns table(enabled boolean, shift_minutes int, days_in_month int, covered_days int, rest_days int, required_days numeric,
              required_minutes int, credited_minutes int, net_minutes int, deduction_minutes int, surplus_minutes int,
              credit_days numeric, credit_cap_days numeric, credit_capped boolean, grace_minutes int,
              days_counted int, days_absent int, days_leave_paid int, days_leave_unpaid int, days_incomplete int, days_short int)
language plpgsql stable security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; m_to date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
        rl jsonb := app.hr_deduction_rule_for(p_employee, m); per record; sh record;
        v_on boolean; v_grace int; v_cap numeric; v_shift int; v_req int := 0; v_sf int := 0; v_sur int := 0;
        v_rest int := 0; v_cnt int := 0; v_abs int := 0; v_lp int := 0; v_lu int := 0; v_inc int := 0; v_nshort int := 0; v_inc_pay boolean; v_raw_days numeric;
begin
  v_on := coalesce(rl ->> 'shortfall_method', 'tiers') = 'hour_bank'
          and coalesce((rl ->> 'auto_deduction_enabled')::boolean, true) and coalesce((rl ->> 'deduct_shortfall_enabled')::boolean, true);
  v_grace := coalesce((rl ->> 'grace_minutes_default')::int, 15);
  v_cap := coalesce((rl ->> 'hour_bank_credit_cap_days')::numeric, 2);
  v_inc_pay := app.hr_incomplete_payable(p_employee, m);
  select * into per from app.hr_month_period(m) p where p.employee_id = p_employee;
  if not found then select m as period_from, m_to as period_to, 0 as covered_days, (m_to - m + 1)::int as days_in_month, false as full_month into per; end if;   -- 00300: موظف خارج فترة الكشف (ملف تصفية) ⇒ قيم آمنة بدل خطأ سجل غير معيَّن
  select coalesce(nullif(max(a.required_minutes), 0), 0) into v_shift from public.hr_attendance_days a where a.employee_id = p_employee and a.work_date between m and m_to and not a.is_rest_day;
  if v_shift = 0 then
    select * into sh from app.hr_effective_shift(p_employee, coalesce(per.period_from, m));
    if found then
      v_shift := case when sh.kind = 'flexible' and sh.required_hours is not null then round(sh.required_hours * 60)::int
                      else floor(extract(epoch from (sh.end_time - sh.start_time)) / 60)::int end;
      if v_shift <= 0 then v_shift := v_shift + 1440; end if;
    end if;
    if coalesce(v_shift, 0) <= 0 then v_shift := 480; end if;
  end if;
  select count(*) filter (where a.is_rest_day), count(*) filter (where a.status = 'absent' and not a.is_rest_day),
         count(*) filter (where a.status = 'incomplete' and not a.is_rest_day),
         count(*) filter (where a.status = 'leave' and not a.is_rest_day and lp.paid), count(*) filter (where a.status = 'leave' and not a.is_rest_day and not lp.paid),
         count(*) filter (where a.status in ('present', 'late', 'early_leave', 'time_permit') and not a.is_rest_day),
         count(*) filter (where a.status in ('present', 'late', 'early_leave', 'time_permit') and not a.is_rest_day and a.shortfall_minutes > 0 and not a.deduction_waived),
         coalesce(sum(a.required_minutes) filter (where not a.is_rest_day and (a.status in ('present', 'late', 'early_leave', 'time_permit') or (a.status = 'incomplete' and v_inc_pay))), 0)::int,
         -- النقص: مجموع نقص الأيام (قاعدة اليوم الواحد) — الإعفاء الموثّق يُصفّر يومه
         coalesce(sum(a.shortfall_minutes) filter (where a.status in ('present', 'late', 'early_leave', 'time_permit') and not a.is_rest_day and not a.deduction_waived), 0)::int,
         coalesce(sum(a.overtime_minutes) filter (where a.status in ('present', 'late', 'early_leave', 'time_permit') and not a.is_rest_day), 0)::int
    into v_rest, v_abs, v_inc, v_lp, v_lu, v_cnt, v_nshort, v_req, v_sf, v_sur
  from public.hr_attendance_days a
  cross join lateral (select exists (
      select 1 from public.hr_leaves l join public.hr_leave_types t on t.id = l.leave_type_id
      where l.employee_id = a.employee_id and l.status = 'approved' and l.kind = 'leave' and t.is_paid and a.work_date between l.start_date and l.end_date) as paid) lp
  where a.employee_id = p_employee and a.work_date between m and m_to;
  v_raw_days := round(v_sur::numeric / greatest(v_shift, 1), 3);
  return query select v_on, v_shift, coalesce(per.days_in_month, 0), coalesce(per.covered_days, 0), v_rest,
    (v_cnt + case when v_inc_pay then v_inc else 0 end)::numeric, v_req, v_req - v_sf + v_sur, v_sur - v_sf, v_sf, v_sur,
    least(v_raw_days, v_cap), v_cap, v_raw_days > v_cap, v_grace, v_cnt, v_abs, v_lp, v_lu, v_inc, v_nshort;
end$$;

-- ── ②ب ملخص الشهر: حصر أيام الحضور بين التعيين وآخر يوم عمل (نسخة 00186 + شرط التاريخ فقط)
create or replace function app.hr_month_summary(p_month date)
returns table(employee_id uuid, working_days int, days_present int, days_late int, days_absent int, days_incomplete int,
              days_leave int, late_minutes int, early_minutes int, ded_amount numeric, ded_days numeric, ded_reasons text,
              auto_minutes int, auto_days numeric, shift_minutes int, overtime_minutes int, shortfall_minutes int,
              days_leave_paid int, days_leave_unpaid int, auto_days_absence numeric, auto_days_shortfall numeric,
              scheduled_days int, unevaluated_days int)
language sql stable security definer set search_path = public, app as $$
  with m as (select date_trunc('month', p_month)::date as f, (date_trunc('month', p_month) + interval '1 month - 1 day')::date as t),
  staff as (
    select e.id as employee_id from public.employees e, m
    where e.archived_at is null and e.hire_date <= m.t
      and (e.employment_status <> 'terminated' or e.terminated_at is null or e.terminated_at >= m.f)),
  days as (
    select a.*,
      (a.status = 'leave' and exists (
         select 1 from public.hr_leaves l join public.hr_leave_types t on t.id = l.leave_type_id
         where l.employee_id = a.employee_id and l.status = 'approved' and l.kind = 'leave' and t.is_paid
           and a.work_date between l.start_date and l.end_date)) as leave_paid
    from public.hr_attendance_days a join public.employees e on e.id = a.employee_id, m
    -- 00300: أيام ما بعد آخر يوم عمل (أو قبل التعيين) لا تدخل في الكشف ولا في التصفية — حتى لو كانت مقيَّمة سابقاً
    where a.work_date between greatest(m.f, e.hire_date) and least(m.t, coalesce(e.terminated_at, m.t))),
  att as (
    select a.employee_id,
      count(*) filter (where not a.is_rest_day)::int as working_days,
      count(*) filter (where a.status in ('present', 'late', 'early_leave', 'time_permit'))::int as days_present,
      count(*) filter (where a.status = 'late')::int as days_late,
      count(*) filter (where a.status = 'absent')::int as days_absent,
      count(*) filter (where a.status = 'incomplete')::int as days_incomplete,
      count(*) filter (where a.status = 'leave')::int as days_leave,
      coalesce(sum(a.late_minutes), 0)::int as late_minutes, coalesce(sum(a.early_minutes), 0)::int as early_minutes,
      coalesce(sum(a.proposed_deduction_minutes) filter (where not a.deduction_waived), 0)::int as auto_minutes,
      coalesce(sum(a.proposed_deduction_days) filter (where not a.deduction_waived), 0) as auto_days,
      coalesce(nullif(max(a.required_minutes), 0), 480)::int as shift_minutes,
      coalesce(sum(a.overtime_minutes), 0)::int as overtime_minutes,
      coalesce(sum(a.shortfall_minutes), 0)::int as shortfall_minutes,
      count(*) filter (where a.leave_paid)::int as days_leave_paid,
      count(*) filter (where a.status = 'leave' and not a.leave_paid)::int as days_leave_unpaid,
      coalesce(sum(a.proposed_deduction_days) filter (where not a.deduction_waived and a.status not in ('present', 'late', 'early_leave', 'time_permit')), 0) as auto_days_absence,
      coalesce(sum(a.proposed_deduction_days) filter (where not a.deduction_waived and a.status in ('present', 'late', 'early_leave', 'time_permit')), 0) as auto_days_shortfall
    from days a group by a.employee_id),
  ded as (
    select d.employee_id, sum(d.amount) as amt, sum(d.days) as dys, string_agg(d.reason, ' · ' order by d.created_at) as reasons
    from public.hr_attendance_deductions d, m where d.period_month = m.f group by d.employee_id),
  cov as (select * from app.hr_month_coverage(p_month)),
  ids as (select employee_id from staff union select employee_id from att union select employee_id from ded)
  select ids.employee_id, coalesce(att.working_days, 0), coalesce(att.days_present, 0), coalesce(att.days_late, 0),
         coalesce(att.days_absent, 0), coalesce(att.days_incomplete, 0), coalesce(att.days_leave, 0), coalesce(att.late_minutes, 0),
         coalesce(att.early_minutes, 0), coalesce(ded.amt, 0), coalesce(ded.dys, 0), ded.reasons,
         coalesce(att.auto_minutes, 0), coalesce(att.auto_days, 0), coalesce(att.shift_minutes, 480), coalesce(att.overtime_minutes, 0), coalesce(att.shortfall_minutes, 0),
         coalesce(att.days_leave_paid, 0), coalesce(att.days_leave_unpaid, 0), coalesce(att.auto_days_absence, 0), coalesce(att.auto_days_shortfall, 0),
         coalesce(cov.scheduled_days, 0), coalesce(cov.unevaluated_days, 0)
  from ids left join att on att.employee_id = ids.employee_id left join ded on ded.employee_id = ids.employee_id left join cov on cov.employee_id = ids.employee_id
$$;

-- ── ③ رصيد الإجازات المتبقي (نفس معادلة hr_leave_balance، بلا فحص صلاحية لأنها داخلية)
create or replace function app.settlement_leave_remaining(p_employee uuid, p_year int) returns numeric
language plpgsql security definer set search_path = public, app as $$
declare r record; v_mode text := app.hr_policy() ->> 'balance_mode'; v_accrued numeric;
begin
  perform app.hr_ensure_grant(p_employee, p_year);
  select coalesce(sum(days) filter (where kind = 'grant'), 0) as granted, coalesce(sum(days), 0) as remaining
    into r from public.hr_leave_ledger where employee_id = p_employee and year = p_year;
  v_accrued := r.granted;
  if v_mode = 'monthly_accrual' and p_year = extract(year from current_date)::int then
    v_accrued := round(r.granted * extract(month from current_date) / 12, 2);
  end if;
  return greatest(0, case when v_mode = 'monthly_accrual' then r.remaining - (r.granted - v_accrued) else r.remaining end);
end$$;

-- ── ④ الاحتساب الجاف: نفس خط الكشف على تصدير مؤقت (version = -1) يُحذف في نهاية الدالة
create or replace function app.settlement_compute(p_employee uuid) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare e public.employees; m date; d date; v_export uuid; row_ public.hr_month_export_rows; v_paid_row public.hr_month_export_rows;
        v_salary jsonb; v_day_rate numeric := 0; v_leave_days numeric; v_leave_amount numeric; v_adv jsonb; v_adv_total numeric;
        v_prior text[]; v_net numeric; v_salary_net numeric := 0; v_has_profile boolean;
begin
  select * into e from public.employees where id = p_employee;
  if not found or e.terminated_at is null then raise exception 'SETTLEMENT_NOT_TERMINATED'; end if;
  m := date_trunc('month', e.terminated_at)::date;
  v_has_profile := exists (select 1 from public.employee_salary_profiles sp where sp.employee_id = e.id and sp.status = 'defined');

  -- صف معتمد سابقاً لنفس الشهر ⇒ الراتب صُرف ضمن الكشف
  select r.* into v_paid_row from public.hr_month_export_rows r join public.hr_month_exports x on x.id = r.export_id
   where r.employee_id = e.id and x.period_month = m and x.status = 'approved' limit 1;

  if found then
    v_day_rate := coalesce(v_paid_row.day_rate, 0);
    v_salary := jsonb_build_object('source', 'paid_in_sheet', 'export_version', (select version from public.hr_month_exports where id = v_paid_row.export_id),
      'gross', v_paid_row.gross_amount, 'deductions', v_paid_row.deductions_total, 'rented_tax', v_paid_row.rented_tax_amount, 'overtime', v_paid_row.overtime_amount,
      'net', 0, 'sheet_net', v_paid_row.final_net, 'covered_days', v_paid_row.covered_days, 'payable_days', v_paid_row.payable_days, 'day_rate', v_day_rate,
      'period_from', v_paid_row.period_from, 'period_to', v_paid_row.period_to, 'note', 'صُرف ضمن كشف الشهر المعتمد — لا يُكرَّر هنا');
  else
    -- تقييم أيام الشهر حتى آخر يوم (كما يفعل التصدير)
    if not app.hr_month_locked(m) then
      d := m;
      while d <= e.terminated_at loop perform app.hr_evaluate_day(e.id, d); d := d + 1; end loop;
    end if;
    perform set_config('app.settlement_calc', e.id::text, true);
    delete from public.hr_month_exports where period_month = m and version = -1;
    insert into public.hr_month_exports (period_month, version, status, exported_by) values (m, -1, 'superseded', null) returning id into v_export;
    perform app.hr_export_insert_rows(v_export, m, e.id);
    perform app.hr_hour_bank_apply_export(v_export, m, e.id);
    perform app.rented_tax_apply_to_export(v_export, m, e.id);
    perform app.overtime_apply_to_export(v_export, m, e.id);
    select r.* into row_ from public.hr_month_export_rows r where r.export_id = v_export and r.employee_id = e.id;
    delete from public.hr_month_exports where id = v_export;   -- يحذف الصف المؤقت بالتتابع
    perform set_config('app.settlement_calc', '', true);
    v_day_rate := coalesce(row_.day_rate, 0);
    v_salary_net := coalesce(row_.final_net, 0);
    v_salary := jsonb_build_object('source', case when v_has_profile then 'computed' else 'no_profile' end,
      'gross', coalesce(row_.gross_amount, 0), 'deductions', coalesce(row_.deductions_total, 0), 'rented_tax', coalesce(row_.rented_tax_amount, 0),
      'overtime', coalesce(row_.overtime_amount, 0), 'net', v_salary_net, 'covered_days', coalesce(row_.covered_days, 0), 'payable_days', row_.payable_days,
      'day_rate', v_day_rate, 'period_from', row_.period_from, 'period_to', row_.period_to, 'pay_type', row_.pay_type, 'base_salary', row_.base_salary,
      'daily_rate', row_.daily_rate, 'days_in_month', row_.days_in_month, 'days_present', row_.days_present, 'days_absent', row_.days_absent,
      'days_leave_paid', row_.days_leave_paid, 'note', case when v_has_profile then null else 'لا ملف راتب معرَّف — عرِّفوه من ملفات الرواتب ثم أعيدوا الاحتساب' end);
  end if;

  -- تعويض رصيد الإجازات
  v_leave_days := app.settlement_leave_remaining(e.id, extract(year from e.terminated_at)::int);
  v_leave_amount := round(v_leave_days * v_day_rate, 2);

  -- السلف المسلَّمة غير المسددة
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'ref_no', a.ref_no, 'type_name', a.type_name, 'amount', a.amount, 'repaid', a.repaid_total,
                 'remaining', greatest(0, a.amount - a.repaid_total)) order by a.created_at), '[]'::jsonb),
         coalesce(sum(greatest(0, a.amount - a.repaid_total)), 0)
    into v_adv, v_adv_total
  from public.advances a where a.employee_id = e.id and a.status = 'delivered';

  -- أشهر سابقة لم يُصدَّر كشفها بعد (تُصرف من كشفها عند صدوره — للعلم)
  select coalesce(array_agg(to_char(mm, 'YYYY-MM') order by mm), '{}') into v_prior
  from generate_series(greatest(date_trunc('month', e.hire_date), m - interval '6 months')::date, m - interval '1 month', interval '1 month') mm
  where not exists (select 1 from public.hr_month_exports x where x.period_month = mm::date and x.status in ('exported', 'approved'));

  v_net := round(v_salary_net + v_leave_amount - v_adv_total, 2);
  return jsonb_build_object('salary_month', m, 'salary', v_salary,
    'leave', jsonb_build_object('remaining_days', v_leave_days, 'day_rate', v_day_rate, 'amount', v_leave_amount, 'year', extract(year from e.terminated_at)::int),
    'advances', v_adv, 'advances_total', v_adv_total, 'prior_months_unexported', to_jsonb(v_prior),
    'total_due', round(v_salary_net + v_leave_amount, 2), 'total_deduct', v_adv_total, 'net', v_net, 'has_profile', v_has_profile, 'computed_at', now());
end$$;
revoke all on function app.settlement_compute(uuid) from public, anon, authenticated;

-- ── ⑤ فتح ملف التصفية + التبليغات (مشغّل على employees)
create or replace function app.settlement_open(p_employee uuid) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare rec record; v_id uuid; v_lines jsonb; v_label text; v_ref text;
begin
  select e.*, d.name as dept_name, coalesce(me.user_id, dm.user_id) as mgr_user, coalesce(me.full_name, dm.full_name) as mgr_name
    into rec
  from public.employees e
  left join public.departments d on d.id = e.department_id
  left join public.employees me on me.id = e.manager_id and me.id <> e.id
  left join public.employees dm on dm.id = d.manager_id and dm.id <> e.id
  where e.id = p_employee;
  if not found or rec.terminated_at is null then return null; end if;
  if exists (select 1 from public.hr_settlements s where s.employee_id = p_employee and s.status in ('pending','approved','debt_open')) then return null; end if;
  v_label := coalesce(app.termination_type_label(rec.termination_type), 'إنهاء خدمة');
  v_ref := 'ST-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('app.hr_settlement_ref_seq')::text, 4, '0');
  insert into public.hr_settlements (ref_no, employee_id, employee_number, full_name, department_name, job_title, termination_type, last_day, reason, salary_month, manager_user_id, manager_name)
  values (v_ref, rec.id, rec.employee_number, rec.full_name, rec.dept_name, rec.job_title, rec.termination_type, rec.terminated_at, rec.termination_reason, date_trunc('month', rec.terminated_at)::date, rec.mgr_user, rec.mgr_name)
  returning id into v_id;
  begin
    v_lines := app.settlement_compute(p_employee);
    update public.hr_settlements set lines = v_lines, net_amount = (v_lines ->> 'net')::numeric, computed_at = now() where id = v_id;
  exception when others then
    insert into public.hr_settlement_events (settlement_id, action, actor, actor_name, note) values (v_id, 'compute_failed', auth.uid(), app.user_display_name(auth.uid()), sqlerrm);
  end;
  insert into public.hr_settlement_events (settlement_id, action, actor, actor_name, note)
  values (v_id, 'opened', auth.uid(), app.user_display_name(auth.uid()), v_label || ' · آخر يوم ' || rec.terminated_at::text);
  -- المدير المباشر
  if rec.mgr_user is not null then
    perform app.hr_notify(rec.mgr_user, 'أُنهيت خدمة ' || rec.full_name || ' من فريقك', v_label || ' · آخر يوم عمل ' || rec.terminated_at::text || coalesce(' · ' || nullif(rec.termination_reason, ''), ''),
      '/notifications', 'settlement_mgr:' || v_id::text, 'warning');
  end if;
  -- المالية
  perform app.notify_by_role(array['finance_officer'], 'تصفية نهاية خدمة جديدة: ' || rec.full_name, v_label || ' · آخر يوم ' || rec.terminated_at::text || ' · راجعوا بنود التصفية واعتمدوها', 'warning', '/finance/settlements');
  return v_id;
end$$;
revoke all on function app.settlement_open(uuid) from public, anon, authenticated;

create or replace function app.trg_employee_terminated() returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if new.employment_status = 'terminated' and coalesce(old.employment_status, '') <> 'terminated' and new.terminated_at is not null then
    perform app.settlement_open(new.id);
  end if;
  return new;
end$$;
drop trigger if exists trg_employee_terminated on public.employees;
create trigger trg_employee_terminated after update of employment_status on public.employees for each row execute function app.trg_employee_terminated();

-- ── ⑥ واجهات المالية
create or replace function app.settlement_require(p_action text) returns void
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.has_role(array['finance_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  perform app.require_can('finance.settlements', p_action);
end$$;
revoke all on function app.settlement_require(text) from public, anon, authenticated;

create or replace function app.settlement_status_label(p text) returns text language sql immutable as $$
  select case p when 'pending' then 'بانتظار الاعتماد' when 'approved' then 'معتمدة — بانتظار التسليم' when 'delivered' then 'مسلَّمة'
                when 'debt_open' then 'ذمة على الموظف' when 'debt_paid' then 'ذمة مسدَّدة' when 'debt_waived' then 'ذمة معفاة' else p end $$;

create or replace function public.finance_settlements_list(p_status text default null, p_q text default null, p_limit int default 300)
returns table (id uuid, ref_no text, employee_id uuid, employee_number text, full_name text, department_name text, job_title text, termination_type text, termination_label text,
               last_day date, salary_month date, status text, status_label text, net_amount numeric, debt_amount numeric, has_profile boolean, computed_at timestamptz,
               approved_at timestamptz, delivered_at timestamptz, debt_closed_at timestamptz, manager_name text, created_at timestamptz)
language sql stable security definer set search_path = public, app as $$
  select s.id, s.ref_no, s.employee_id, s.employee_number, s.full_name, s.department_name, s.job_title, s.termination_type, coalesce(app.termination_type_label(s.termination_type), 'إنهاء خدمة'),
         s.last_day, s.salary_month, s.status, app.settlement_status_label(s.status), s.net_amount, s.debt_amount, coalesce((s.lines ->> 'has_profile')::boolean, false), s.computed_at,
         s.approved_at, s.delivered_at, s.debt_closed_at, s.manager_name, s.created_at
  from public.hr_settlements s
  where app.has_role(array['finance_officer', 'super_admin'])
    and (p_status is null or p_status = '' or s.status = p_status or (p_status = 'open' and s.status in ('pending','approved','debt_open')) or (p_status = 'closed' and s.status in ('delivered','debt_paid','debt_waived')))
    and (p_q is null or p_q = '' or s.full_name ilike '%' || p_q || '%' or coalesce(s.employee_number, '') ilike '%' || p_q || '%' or s.ref_no ilike '%' || p_q || '%')
  order by case s.status when 'pending' then 0 when 'approved' then 1 when 'debt_open' then 2 else 3 end, s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 300), 1000))
$$;
grant execute on function public.finance_settlements_list(text, text, int) to authenticated;

create or replace function public.finance_settlements_summary() returns jsonb
language sql stable security definer set search_path = public, app as $$
  select case when app.has_role(array['finance_officer', 'super_admin']) then jsonb_build_object(
    'pending', (select count(*) from public.hr_settlements where status = 'pending'),
    'approved', (select count(*) from public.hr_settlements where status = 'approved'),
    'approved_amount', (select coalesce(sum(net_amount), 0) from public.hr_settlements where status = 'approved'),
    'debt_open', (select count(*) from public.hr_settlements where status = 'debt_open'),
    'debt_amount', (select coalesce(sum(debt_amount), 0) from public.hr_settlements where status = 'debt_open'),
    'delivered_total', (select coalesce(sum(net_amount), 0) from public.hr_settlements where status = 'delivered'),
    'closed', (select count(*) from public.hr_settlements where status in ('delivered','debt_paid','debt_waived')))
  else null end $$;
grant execute on function public.finance_settlements_summary() to authenticated;

create or replace function public.finance_settlement_get(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare s public.hr_settlements;
begin
  if not app.has_role(array['finance_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  select * into s from public.hr_settlements where id = p_id;
  if not found then raise exception 'SETTLEMENT_NOT_FOUND'; end if;
  return to_jsonb(s) || jsonb_build_object('termination_label', coalesce(app.termination_type_label(s.termination_type), 'إنهاء خدمة'), 'status_label', app.settlement_status_label(s.status),
    'month_locked', app.hr_month_locked(s.salary_month),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'action', v.action, 'actor_name', v.actor_name, 'amount', v.amount, 'note', v.note, 'created_at', v.created_at) order by v.id), '[]'::jsonb)
               from public.hr_settlement_events v where v.settlement_id = s.id));
end$$;
grant execute on function public.finance_settlement_get(uuid) to authenticated;

create or replace function public.finance_settlement_recompute(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare s public.hr_settlements; v jsonb;
begin
  perform app.settlement_require('decide');
  select * into s from public.hr_settlements where id = p_id for update;
  if not found then raise exception 'SETTLEMENT_NOT_FOUND'; end if;
  if s.status <> 'pending' then raise exception 'SETTLEMENT_FROZEN'; end if;
  v := app.settlement_compute(s.employee_id);
  update public.hr_settlements set lines = v, net_amount = (v ->> 'net')::numeric, computed_at = now(), updated_at = now() where id = p_id;
  insert into public.hr_settlement_events (settlement_id, action, actor, actor_name, amount) values (p_id, 'recomputed', auth.uid(), app.user_display_name(auth.uid()), (v ->> 'net')::numeric);
  return public.finance_settlement_get(p_id);
end$$;
grant execute on function public.finance_settlement_recompute(uuid) to authenticated;

create or replace function public.finance_settlement_approve(p_id uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare s public.hr_settlements; v jsonb; v_net numeric; v_status text;
begin
  perform app.settlement_require('decide');
  select * into s from public.hr_settlements where id = p_id for update;
  if not found then raise exception 'SETTLEMENT_NOT_FOUND'; end if;
  if s.status <> 'pending' then raise exception 'SETTLEMENT_FROZEN'; end if;
  v := app.settlement_compute(s.employee_id);   -- أحدث الأرقام لحظة الاعتماد
  if not coalesce((v ->> 'has_profile')::boolean, false) then raise exception 'SETTLEMENT_NO_SALARY_PROFILE'; end if;
  v_net := (v ->> 'net')::numeric;
  v_status := case when v_net < 0 then 'debt_open' else 'approved' end;
  update public.hr_settlements set lines = v, net_amount = v_net, computed_at = now(), status = v_status, approved_by = auth.uid(), approved_at = now(),
    approve_note = nullif(trim(coalesce(p_note, '')), ''), debt_amount = case when v_net < 0 then -v_net else 0 end, updated_at = now() where id = p_id;
  update public.finance_hr_notices set is_done = true, done_at = now(), done_by = auth.uid() where employee_id = s.employee_id and kind = 'termination_settlement' and not is_done;
  insert into public.hr_settlement_events (settlement_id, action, actor, actor_name, amount, note)
  values (p_id, case when v_net < 0 then 'approved_debt' else 'approved' end, auth.uid(), app.user_display_name(auth.uid()), v_net, nullif(trim(coalesce(p_note, '')), ''));
  return public.finance_settlement_get(p_id);
end$$;
grant execute on function public.finance_settlement_approve(uuid, text) to authenticated;

-- إقفال السلف المشمولة في التصفية
create or replace function app.settlement_close_advances(p_settlement uuid, p_mode text, p_note text) returns int
language plpgsql security definer set search_path = public, app as $$
declare s public.hr_settlements; a record; n int := 0; v_rem numeric;
begin
  select * into s from public.hr_settlements where id = p_settlement;
  for a in select x.* from public.advances x where x.employee_id = s.employee_id and x.status = 'delivered'
             and x.id in (select (j ->> 'id')::uuid from jsonb_array_elements(coalesce(s.lines -> 'advances', '[]'::jsonb)) j) loop
    v_rem := greatest(0, a.amount - a.repaid_total);
    if v_rem > 0 and p_mode <> 'waived' then
      insert into public.advance_installments (advance_id, period_month, amount, source, note, created_by)
      values (a.id, date_trunc('month', app.hr_local_date(now()))::date, v_rem, 'cash', 'تصفية نهاية الخدمة ' || s.ref_no || coalesce(' · ' || p_note, ''), auth.uid());
    end if;
    update public.advances set repaid_total = case when p_mode = 'waived' then repaid_total else amount end, status = 'settled', settled_at = now(), updated_at = now() where id = a.id;
    insert into public.advance_events (advance_id, action, actor, actor_name, amount, note)
    values (a.id, case when p_mode = 'waived' then 'settlement_waived' else 'settlement_closed' end, auth.uid(), app.user_display_name(auth.uid()), v_rem,
            'تصفية نهاية الخدمة ' || s.ref_no || coalesce(' · ' || p_note, ''));
    n := n + 1;
  end loop;
  return n;
end$$;
revoke all on function app.settlement_close_advances(uuid, text, text) from public, anon, authenticated;

create or replace function public.finance_settlement_deliver(p_id uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare s public.hr_settlements; n int;
begin
  perform app.settlement_require('execute');
  select * into s from public.hr_settlements where id = p_id for update;
  if not found then raise exception 'SETTLEMENT_NOT_FOUND'; end if;
  if s.status <> 'approved' then raise exception 'SETTLEMENT_NOT_APPROVED'; end if;
  update public.hr_settlements set status = 'delivered', delivered_by = auth.uid(), delivered_at = now(), delivery_note = nullif(trim(coalesce(p_note, '')), ''), updated_at = now() where id = p_id;
  n := app.settlement_close_advances(p_id, 'paid', nullif(trim(coalesce(p_note, '')), ''));
  insert into public.hr_settlement_events (settlement_id, action, actor, actor_name, amount, note)
  values (p_id, 'delivered', auth.uid(), app.user_display_name(auth.uid()), s.net_amount, coalesce(nullif(trim(coalesce(p_note, '')), ''), '') || case when n > 0 then ' · أُقفلت ' || n || ' سلفة' else '' end);
  return public.finance_settlement_get(p_id);
end$$;
grant execute on function public.finance_settlement_deliver(uuid, text) to authenticated;

create or replace function public.finance_settlement_debt_close(p_id uuid, p_mode text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare s public.hr_settlements; n int;
begin
  perform app.settlement_require('execute');
  if p_mode not in ('paid', 'waived') then raise exception 'SETTLEMENT_DEBT_MODE_INVALID'; end if;
  if p_mode = 'waived' and length(trim(coalesce(p_note, ''))) < 3 then raise exception 'SETTLEMENT_REASON_REQUIRED'; end if;
  select * into s from public.hr_settlements where id = p_id for update;
  if not found then raise exception 'SETTLEMENT_NOT_FOUND'; end if;
  if s.status <> 'debt_open' then raise exception 'SETTLEMENT_NOT_DEBT'; end if;
  update public.hr_settlements set status = case when p_mode = 'paid' then 'debt_paid' else 'debt_waived' end, debt_closed_by = auth.uid(), debt_closed_at = now(),
    debt_note = nullif(trim(coalesce(p_note, '')), ''), updated_at = now() where id = p_id;
  n := app.settlement_close_advances(p_id, p_mode, nullif(trim(coalesce(p_note, '')), ''));
  insert into public.hr_settlement_events (settlement_id, action, actor, actor_name, amount, note)
  values (p_id, case when p_mode = 'paid' then 'debt_paid' else 'debt_waived' end, auth.uid(), app.user_display_name(auth.uid()), s.debt_amount,
          coalesce(nullif(trim(coalesce(p_note, '')), ''), '') || case when n > 0 then ' · أُقفلت ' || n || ' سلفة' else '' end);
  return public.finance_settlement_get(p_id);
end$$;
grant execute on function public.finance_settlement_debt_close(uuid, text, text) to authenticated;

-- ── ⑦ ملفات لمن أُنهيت خدمته قبل هذا الترحيل ولم تُعتمد تسويته بعد (إشعار المالية المعلّق)
do $$ declare r record; begin
  for r in select distinct n.employee_id from public.finance_hr_notices n join public.employees e on e.id = n.employee_id
           where n.kind = 'termination_settlement' and not n.is_done and e.employment_status = 'terminated' and e.terminated_at is not null loop
    perform app.settlement_open(r.employee_id);
  end loop;
end $$;

-- ── ⑧ كتالوج الاحتفاظ: الجدولان الجديدان (مولَّد بـ scripts/gen-retention-catalog.py)
create or replace function app.data_retention_catalog()
returns table (data_key text, portal_key text, label text, description text, table_name text, time_column text, keep_where text, safety_lock text,
               deletable boolean, default_months int, default_export_required boolean)
language sql immutable as $$
  values
    ('audit_logs', 'it', 'سجل التدقيق العام', 'كل تعديل على الجداول (قبل/بعد). يُستثنى ما يخص الرواتب والمالية.', 'audit_logs', 'created_at', 'table_name in (''payrolls'',''payslips'',''employee_salary_profiles'',''hr_month_exports'',''hr_month_export_rows'',''treasury_transactions'',''advances'',''advance_installments'',''hr_attendance_deductions'',''disclosures'')', 'سجلات التدقيق المتعلقة بالرواتب والمالية والخصومات محمية دائماً', true, 36, true),
    ('app_errors', 'it', 'أخطاء التطبيق', 'أخطاء الواجهة والخادم المسجَّلة تلقائياً.', 'app_errors', 'created_at', 'resolved is not true and archived_at is null', 'الأخطاء غير المحلولة وغير المؤرشفة محمية', true, 6, false),
    ('integration_logs', 'it', 'سجل التكاملات الخارجية', 'طلبات/ردود مزوّدي GPS والبريد وغيرها.', 'integration_logs', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 6, false),
    ('login_attempts', 'it', 'محاولات تسجيل الدخول', 'ناجحة وفاشلة، مع العنوان والوقت.', 'login_attempts', 'attempted_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 12, false),
    ('connection_samples', 'it', 'عينات جودة الاتصال', 'قياسات زمن الاستجابة من أجهزة المستخدمين.', 'connection_samples', 'sampled_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 3, false),
    ('biometric_pulls', 'it', 'سجل سحب البصمات من الأجهزة', 'كل عملية سحب يدوية/آلية ونتيجتها. البصمات نفسها نوع مستقل.', 'biometric_pulls', 'started_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 6, false),
    ('biometric_pushes', 'it', 'سجل دفع الموظفين إلى الأجهزة', 'كل عملية إرسال موظف لجهاز بصمة.', 'biometric_pushes', 'received_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 6, false),
    ('biometric_device_commands', 'it', 'أوامر أجهزة البصمة', 'الأوامر المرسلة للأجهزة (ADMS).', 'biometric_device_commands', 'created_at', 'acked_at is null', 'الأوامر التي لم يؤكدها الجهاز بعد محمية', true, 3, false),
    ('biometric_raw_punches', 'it', 'البصمات الخام من الأجهزة', 'كل لمسة إصبع كما وصلت من الجهاز. سجل الحضور المحسوب والخصومات لا يُمسّان.', 'biometric_punches', 'punched_at', null, 'لا تُحذف بصمات شهر لم تعتمده المالية (راتب معتمد أو مدفوع)', true, 6, true),
    ('biometric_devices', 'it', 'أجهزة البصمة', '', 'biometric_devices', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('biometric_device_users', 'it', 'موظفو أجهزة البصمة (المسجَّلون على كل جهاز)', '', 'biometric_device_users', null, null, 'حالة حالية تُحدَّث ولا تتراكم — لا معنى لحذفها زمنياً', false, 0, false),
    ('biometric_adms_endpoints', 'it', 'نقاط ADMS', '', 'biometric_adms_endpoints', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('it_assets', 'it', 'أصول تقنية المعلومات', '', 'it_assets', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('it_tickets', 'it', 'تذاكر الدعم الفني', '', 'it_tickets', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('system_settings', 'it', 'إعدادات النظام', '', 'system_settings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('dynamic_portals', 'it', 'البوابات الديناميكية', '', 'dynamic_portals', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('portal_units', 'it', 'وحدات البوابات', '', 'portal_units', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('portal_hidden_units', 'it', 'الوحدات المخفية لكل مستخدم', '', 'portal_hidden_units', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('role_page_permissions', 'it', 'صلاحيات الصفحات حسب الدور', '', 'role_page_permissions', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('user_page_overrides', 'it', 'استثناءات صلاحيات المستخدمين', '', 'user_page_overrides', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('permission_units', 'it', 'وحدات الصلاحيات (كتالوج 00350)', '', 'permission_units', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('permission_portal_roles', 'it', 'دور كل بوابة (صلاحيات 00350)', '', 'permission_portal_roles', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('permission_templates', 'it', 'قوالب الصلاحيات', '', 'permission_templates', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('permission_template_rules', 'it', 'قواعد قوالب الصلاحيات', '', 'permission_template_rules', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('user_permission_template', 'it', 'قالب الصلاحيات لكل مستخدم', '', 'user_permission_template', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('user_permission_overrides', 'it', 'استثناءات الصلاحيات الفردية', '', 'user_permission_overrides', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('permission_audit', 'it', 'سجل تدقيق الصلاحيات', '', 'permission_audit', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false),
    ('permission_write_bindings', 'it', 'ربط دوال الكتابة بالصلاحيات (00350-B)', '', 'permission_write_bindings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('user_roles', 'it', 'أدوار المستخدمين', '', 'user_roles', null, null, 'حسابات/هويات مستخدمين — لا تُحذف زمنياً', false, 0, false),
    ('manager_profiles', 'it', 'ملفات المديرين', '', 'manager_profiles', null, null, 'حسابات/هويات مستخدمين — لا تُحذف زمنياً', false, 0, false),
    ('documents', 'it', 'المستندات العامة', '', 'documents', null, null, 'الصور والملفات تُدار عبر الأرشيف البارد؛ السجل النصي يبقى', false, 0, false),
    ('notifications', 'notifications', 'الإشعارات', 'إشعارات الجرس لكل مستخدم.', 'notifications', 'created_at', 'is_read is not true and read_at is null and dismissed_at is null', 'الإشعارات غير المقروءة محمية', true, 6, false),
    ('notification_push_deliveries', 'notifications', 'سجل تسليم إشعارات الدفع', 'محاولات إرسال Push لكل اشتراك ونتيجتها.', 'notification_push_deliveries', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 3, false),
    ('notification_push_admin_actions', 'notifications', 'إجراءات IT على إشعارات الدفع', 'إعادة إرسال/إيقاف من بوابة IT.', 'notification_push_admin_actions', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 12, false),
    ('notification_push_subscriptions', 'notifications', 'اشتراكات Push للأجهزة', '', 'notification_push_subscriptions', null, null, 'حالة حالية تُحدَّث ولا تتراكم — لا معنى لحذفها زمنياً', false, 0, false),
    ('notification_preferences', 'notifications', 'تفضيلات الإشعارات', '', 'notification_preferences', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('notification_workflow_policies', 'notifications', 'سياسات إشعارات سير العمل', '', 'notification_workflow_policies', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('announcements', 'notifications', 'التعميمات', '', 'announcements', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('announcement_receipts', 'notifications', 'إيصالات قراءة التعميمات', '', 'announcement_receipts', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('gps_position_history', 'gps', 'نقاط GPS التفصيلية للآليات', 'إحداثيات كل آلية كل ثوانٍ. ملخصات الرحلات والتنبيهات تبقى.', 'gps_device_position_history', 'fix_time', null, 'لا تُحذف نقاط رحلة عليها تحقيق مفتوح', true, 3, false),
    ('vehicle_positions', 'gps', 'مواقع المركبات (النظام القديم)', 'نقاط موقع من التكامل الأول قبل مزوّدي GPS.', 'vehicle_positions', 'fix_time', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 3, false),
    ('gps_events', 'gps', 'أحداث GPS العامة', 'تشغيل/إطفاء/سرعة وغيرها كما وصلت.', 'gps_events', 'occurred_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 6, false),
    ('gps_vendor_events', 'gps', 'أحداث مزوّد GPS الخام', 'الأحداث كما أرسلها المزوّد.', 'gps_vendor_events', 'occurred_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 6, false),
    ('gps_zone_events', 'gps', 'أحداث دخول/خروج المناطق', 'دخول وخروج الآليات من المناطق الجغرافية.', 'gps_zone_events', 'occurred_at', 'departure_id in (select ti.departure_id from public.gps_trip_investigations ti where ti.status <> ''resolved'')', 'أحداث رحلة عليها تحقيق مفتوح محمية', true, 6, false),
    ('gps_sync_runs', 'gps', 'سجل مزامنات GPS', 'كل دورة مزامنة مع المزوّد ونتيجتها.', 'gps_sync_runs', 'started_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 3, false),
    ('gps_history_import_runs', 'gps', 'سجل استيراد تاريخ GPS', 'عمليات استيراد المسارات القديمة.', 'gps_history_import_runs', 'started_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 6, false),
    ('gps_operational_alerts', 'gps', 'تنبيهات GPS التشغيلية', 'توقف طويل، خروج عن المسار… المحلولة فقط.', 'gps_operational_alerts', 'opened_at', 'resolved_at is null', 'التنبيهات غير المحلولة محمية', true, 12, false),
    ('live_track_points', 'gps', 'نقاط المشاركة الحية للموظفين', 'إحداثيات مشاركة الموقع من هواتف الميدان.', 'live_track_points', 'recorded_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 3, false),
    ('live_track_sessions', 'gps', 'جلسات المشاركة الحية', 'كل جلسة مشاركة موقع (بداية/نهاية/عدد النقاط).', 'live_track_sessions', 'started_at', 'ended_at is null', 'الجلسات الجارية محمية', true, 12, false),
    ('trip_route_points', 'gps', 'نقاط مسارات الانطلاقيات', 'النقاط المنظَّفة لكل انطلاقية (00342). ملخص المسار والتوقفات تبقى.', 'trip_route_points', 'fix_time', 'departure_id in (select ti.departure_id from public.gps_trip_investigations ti where ti.status <> ''resolved'')', 'نقاط انطلاقية عليها تحقيق مفتوح محمية', true, 12, false),
    ('trip_route_gaps', 'gps', 'فجوات GPS في مسارات الانطلاقيات', 'فترات انقطاع الإشارة لكل انطلاقية.', 'trip_route_gaps', 'started_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 24, false),
    ('trip_routes', 'gps', 'ملخصات مسارات الانطلاقيات', '', 'trip_routes', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('trip_route_stops', 'gps', 'توقفات مسارات الانطلاقيات', '', 'trip_route_stops', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('trip_route_settings', 'gps', 'إعدادات محرّك المسار', '', 'trip_route_settings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('gps_devices', 'gps', 'أجهزة GPS', '', 'gps_devices', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('gps_providers', 'gps', 'مزوّدو GPS', '', 'gps_providers', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('gps_device_positions', 'gps', 'آخر موقع لكل جهاز', '', 'gps_device_positions', null, null, 'حالة حالية تُحدَّث ولا تتراكم — لا معنى لحذفها زمنياً', false, 0, false),
    ('gps_geofences', 'gps', 'المناطق الجغرافية', '', 'gps_geofences', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('gps_vehicle_geofences', 'gps', 'ربط الآليات بالمناطق', '', 'gps_vehicle_geofences', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('gps_vehicle_bindings', 'gps', 'ربط الأجهزة بالآليات', '', 'gps_vehicle_bindings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('gps_map_landmarks', 'gps', 'معالم الخريطة', '', 'gps_map_landmarks', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('gps_route_deviation_settings', 'gps', 'إعدادات الانحراف عن المسار', '', 'gps_route_deviation_settings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('gps_route_presence_state', 'gps', 'حالة التواجد على المسار', '', 'gps_route_presence_state', null, null, 'حالة حالية تُحدَّث ولا تتراكم — لا معنى لحذفها زمنياً', false, 0, false),
    ('gps_zone_presence_state', 'gps', 'حالة التواجد في المناطق', '', 'gps_zone_presence_state', null, null, 'حالة حالية تُحدَّث ولا تتراكم — لا معنى لحذفها زمنياً', false, 0, false),
    ('gps_alert_notification_policies', 'gps', 'سياسات إشعارات تنبيهات GPS', '', 'gps_alert_notification_policies', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('gps_trip_investigations', 'gps', 'تحقيقات الرحلات', '', 'gps_trip_investigations', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('live_track_settings', 'gps', 'إعدادات المشاركة الحية', '', 'live_track_settings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('hr_attendance_audit', 'hr', 'سجل تدقيق تعديلات الحضور', 'من عدّل ماذا ولماذا في أيام الحضور.', 'hr_attendance_audit', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 36, true),
    ('hr_deduction_review_audit', 'hr', 'سجل مراجعة الخصومات', 'قرارات نائب المدير على الخصومات.', 'hr_deduction_review_audit', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 36, true),
    ('hr_deduction_rule_audit', 'hr', 'سجل تعديل قواعد الخصم', 'تاريخ تغيير قواعد الخصم.', 'hr_deduction_rule_audit', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 36, true),
    ('rented_vehicle_tax_audit', 'hr', 'سجل تدقيق ضريبة المركبات المستأجرة', 'تعديلات إعدادات/استثناءات الضريبة.', 'rented_vehicle_tax_audit', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 36, true),
    ('hr_alerts', 'hr', 'تنبيهات الموارد البشرية', 'تنبيهات تجاوز العتبات (غياب/تأخير). المؤكَّدة فقط.', 'hr_alerts', 'created_at', 'acknowledged_at is null', 'التنبيهات غير المؤكَّدة محمية', true, 24, false),
    ('finance_hr_notices', 'hr', 'إشعارات HR إلى المالية', 'تبليغات تغيّر الراتب/الإنهاء. المنجَزة فقط.', 'finance_hr_notices', 'created_at', 'is_done is not true', 'الإشعارات غير المنجَزة محمية', true, 24, false),
    ('employees', 'hr', 'الموظفون', '', 'employees', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('departments', 'hr', 'الأقسام', '', 'departments', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('branches', 'hr', 'الفروع', '', 'branches', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('employee_documents', 'hr', 'وثائق الموظفين', '', 'employee_documents', null, null, 'الصور والملفات تُدار عبر الأرشيف البارد؛ السجل النصي يبقى', false, 0, false),
    ('hr_shifts', 'hr', 'الورديات', '', 'hr_shifts', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('employee_shift_assignments', 'hr', 'تعيين الورديات', '', 'employee_shift_assignments', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('hr_leave_types', 'hr', 'أنواع الإجازات', '', 'hr_leave_types', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('hr_leaves', 'hr', 'الإجازات', '', 'hr_leaves', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('hr_leave_ledger', 'hr', 'رصيد الإجازات', '', 'hr_leave_ledger', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('termination_requests', 'hr', 'طلبات إنهاء الخدمة', '', 'termination_requests', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('hire_requests', 'hr', 'طلبات تعيين الموظفين (00348)', '', 'hire_requests', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('requests', 'hr', 'الطلبات العامة للموظفين', '', 'requests', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('attendance_records', 'hr', 'سجلات الحضور (القديمة)', '', 'attendance_records', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_attendance_days', 'hr', 'أيام الحضور المحسوبة', '', 'hr_attendance_days', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_attendance_confirmations', 'hr', 'تأكيدات شهر الحضور', '', 'hr_attendance_confirmations', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_attendance_pending_auto', 'hr', 'الخصومات الآلية بانتظار التأكيد', '', 'hr_attendance_pending_auto', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_attendance_deductions', 'hr', 'خصومات الحضور', '', 'hr_attendance_deductions', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_deduction_rules', 'hr', 'قواعد الخصم', '', 'hr_deduction_rules', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('hr_deduction_rule_targets', 'hr', 'نطاق قواعد الخصم', '', 'hr_deduction_rule_targets', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('hr_deduction_exemptions', 'hr', 'إعفاءات الخصم', '', 'hr_deduction_exemptions', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_month_exports', 'hr', 'تصدير الشهر إلى المالية', '', 'hr_month_exports', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_month_export_rows', 'hr', 'صفوف تصدير الشهر', '', 'hr_month_export_rows', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_policy', 'hr', 'سياسة الموارد البشرية', '', 'hr_policy', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('hr_settings', 'hr', 'إعدادات الموارد البشرية', '', 'hr_settings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('rented_vehicle_tax_settings', 'hr', 'إعدادات ضريبة المركبات المستأجرة', '', 'rented_vehicle_tax_settings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('rented_vehicle_tax_overrides', 'hr', 'استثناءات ضريبة المركبات المستأجرة', '', 'rented_vehicle_tax_overrides', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_overtime_rates', 'hr', 'أجر الساعة الثابت للإضافي المدفوع', '', 'hr_overtime_rates', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_overtime_payouts', 'hr', 'صرف الساعات الإضافية', '', 'hr_overtime_payouts', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_overtime_members', 'hr', 'الموظفون المشمولون بالإضافي المدفوع', '', 'hr_overtime_members', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_overtime_member_events', 'hr', 'سجل إدراج/إزالة المشمولين بالإضافي المدفوع', '', 'hr_overtime_member_events', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_settlements', 'finance', 'تصفيات نهاية الخدمة', '', 'hr_settlements', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_settlement_events', 'finance', 'سجل أحداث تصفيات نهاية الخدمة', '', 'hr_settlement_events', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('advance_events', 'finance', 'سجل أحداث السلف', 'مسار كل سلفة (طلب/موافقة/تسليم/تسديد). السلف غير المسدَّدة محمية.', 'advance_events', 'created_at', 'advance_id in (select a.id from public.advances a where a.settled_at is null and a.cancelled_at is null)', 'أحداث السلف غير المسدَّدة محمية', true, 36, true),
    ('disclosure_events', 'finance', 'سجل أحداث الكشوفات', 'مسار كل كشف (إرسال/موافقة/إرجاع). الكشوفات غير المنتهية محمية.', 'disclosure_events', 'created_at', 'disclosure_id in (select d.id from public.disclosures d where d.approved_at is null and d.cancelled_at is null)', 'أحداث الكشوفات غير المنتهية محمية', true, 36, true),
    ('payrolls', 'finance', 'الرواتب الشهرية', '', 'payrolls', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('payslips', 'finance', 'قسائم الرواتب', '', 'payslips', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('employee_salary_profiles', 'finance', 'ملفات الرواتب', '', 'employee_salary_profiles', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('advances', 'finance', 'السلف', '', 'advances', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('advance_installments', 'finance', 'أقساط السلف', '', 'advance_installments', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('advance_types', 'finance', 'أنواع السلف', '', 'advance_types', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('budget_allocations', 'finance', 'مخصصات الموازنة', '', 'budget_allocations', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('treasury_transactions', 'finance', 'حركات الخزينة', '', 'treasury_transactions', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('treasury_receivable_types', 'finance', 'أنواع المقبوضات', '', 'treasury_receivable_types', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('disclosures', 'finance', 'الكشوفات', '', 'disclosures', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('disclosure_types', 'finance', 'أنواع الكشوفات', '', 'disclosure_types', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('approval_delegations', 'approvals', 'تفويضات الموافقة', 'تفويض مؤقت لصلاحية الموافقة. السارية محمية.', 'approval_delegations', 'created_at', 'cancelled_at is null and ends_on >= current_date', 'التفويضات السارية محمية', true, 24, false),
    ('approval_chains', 'approvals', 'سلاسل الموافقات', '', 'approval_chains', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('approval_chain_versions', 'approvals', 'تاريخ تعديل سلاسل الموافقات', '', 'approval_chain_versions', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false),
    ('approval_tasks', 'approvals', 'مهام الموافقة', '', 'approval_tasks', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false),
    ('sector_notices', 'ops', 'بلاغات غرفة العمليات للقطاعات', 'رسائل مرسلة من غرفة العمليات إلى مديري القطاعات.', 'sector_notices', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 12, false),
    ('deputy_daily_reports', 'ops', 'التقارير اليومية لنائب المدير', 'لقطة التقرير اليومي المرسَل.', 'deputy_daily_reports', 'sent_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 24, true),
    ('gbs_container_updates', 'ops', 'طلبات تحديث الحاويات', 'طلبات تغيير حالة/موقع حاوية. غير المراجَعة محمية.', 'gbs_container_updates', 'created_at', 'reviewed_at is null', 'الطلبات غير المراجَعة محمية', true, 12, false),
    ('vehicles', 'ops', 'المركبات (الأسطول)', '', 'vehicles', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('vehicle_categories', 'ops', 'فئات المركبات', '', 'vehicle_categories', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('garage_vehicles', 'ops', 'آليات الكراج', '', 'garage_vehicles', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('garage_departures', 'ops', 'خروج ورجوع الآليات', '', 'garage_departures', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('garage_driver_assignments', 'ops', 'تعيين السائقين', '', 'garage_driver_assignments', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('garage_vehicle_shift_assignments', 'ops', 'ورديات الآليات', '', 'garage_vehicle_shift_assignments', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('garage_tanks', 'ops', 'خزانات الوقود', '', 'garage_tanks', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('garage_inventory_movements', 'ops', 'حركات الوقود والمخزون', '', 'garage_inventory_movements', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('garage_tank_zero_requests', 'ops', 'طلبات تصفير الخزان', '', 'garage_tank_zero_requests', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('garage_user_profiles', 'ops', 'حسابات الكراج', '', 'garage_user_profiles', null, null, 'حسابات/هويات مستخدمين — لا تُحذف زمنياً', false, 0, false),
    ('vehicle_trip_legs', 'ops', 'أرجل الرحلات', '', 'vehicle_trip_legs', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('ops_store_items', 'ops', 'مواد مخزن العمليات', '', 'ops_store_items', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('ops_store_movements', 'ops', 'حركات مخزن العمليات', '', 'ops_store_movements', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('gbs_containers', 'ops', 'الحاويات', '', 'gbs_containers', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('follow_up_profiles', 'ops', 'حسابات المتابعة الميدانية', '', 'follow_up_profiles', null, null, 'حسابات/هويات مستخدمين — لا تُحذف زمنياً', false, 0, false),
    ('sectors', 'ops', 'القطاعات', '', 'sectors', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('vehicle_maintenance_updates', 'maintenance', 'تحديثات حالات الصيانة', 'التحديثات التفصيلية (تشخيص/عمل). الحالات غير المكتملة محمية.', 'vehicle_maintenance_updates', 'created_at', 'case_id in (select c.id from public.vehicle_maintenance_cases c where c.completed_at is null)', 'تحديثات الحالات غير المكتملة محمية', true, 24, false),
    ('vehicle_maintenance_stages', 'maintenance', 'مراحل حالات الصيانة', 'مراحل الوصول/التشخيص/الإصلاح/الفحص/التسليم. الحالات غير المكتملة محمية.', 'vehicle_maintenance_stages', 'created_at', 'case_id in (select c.id from public.vehicle_maintenance_cases c where c.completed_at is null)', 'مراحل الحالات غير المكتملة محمية', true, 24, false),
    ('vehicle_maintenance_cases', 'maintenance', 'حالات الصيانة', '', 'vehicle_maintenance_cases', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('vehicle_maintenance_parts', 'maintenance', 'قطع الغيار المستخدمة', '', 'vehicle_maintenance_parts', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('vehicle_maintenance_attachments', 'maintenance', 'مرفقات الصيانة', '', 'vehicle_maintenance_attachments', null, null, 'الصور والملفات تُدار عبر الأرشيف البارد؛ السجل النصي يبقى', false, 0, false),
    ('vehicle_maintenance_case_technicians', 'maintenance', 'فنيو الحالات', '', 'vehicle_maintenance_case_technicians', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('maintenance_workshops', 'maintenance', 'الورش', '', 'maintenance_workshops', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('maintenance_workshop_accounts', 'maintenance', 'حسابات الورش', '', 'maintenance_workshop_accounts', null, null, 'حسابات/هويات مستخدمين — لا تُحذف زمنياً', false, 0, false),
    ('maintenance_inventory_items', 'maintenance', 'مواد مخزن الصيانة', '', 'maintenance_inventory_items', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('maintenance_inventory_movements', 'maintenance', 'حركات مخزن الصيانة', '', 'maintenance_inventory_movements', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('maintenance_purchase_orders', 'maintenance', 'أوامر الشراء', '', 'maintenance_purchase_orders', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('maintenance_purchase_items', 'maintenance', 'بنود أوامر الشراء', '', 'maintenance_purchase_items', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('complaint_email_events', 'complaints', 'أحداث البريد الإلكتروني للشكاوى', 'إشعارات المزوّد (تسليم/فتح/ارتداد).', 'complaint_email_events', 'event_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 12, false),
    ('complaint_media_revisions', 'complaints', 'سجل استبدال صور الشكاوى', 'من استبدل أي صورة ولماذا.', 'complaint_media_revisions', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 24, false),
    ('complaint_inbox_messages', 'complaints', 'رسائل صندوق وارد الشكاوى', 'الرسائل الواردة بالبريد. المؤرشفة فقط.', 'complaint_inbox_messages', 'received_at', 'archived_at is null', 'الرسائل غير المؤرشفة محمية', true, 12, false),
    ('complaints', 'complaints', 'الشكاوى', '', 'complaints', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('complaint_items', 'complaints', 'بنود الشكاوى', '', 'complaint_items', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('complaint_status_history', 'complaints', 'تاريخ حالات الشكاوى', '', 'complaint_status_history', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('complaint_media', 'complaints', 'صور الشكاوى', '', 'complaint_media', null, null, 'الصور والملفات تُدار عبر الأرشيف البارد؛ السجل النصي يبقى', false, 0, false),
    ('complaint_reports', 'complaints', 'تقارير الشكاوى', '', 'complaint_reports', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('complaint_report_items', 'complaints', 'بنود تقارير الشكاوى', '', 'complaint_report_items', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('complaint_templates', 'complaints', 'قوالب الشكاوى', '', 'complaint_templates', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('complaint_settings', 'complaints', 'إعدادات الشكاوى', '', 'complaint_settings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('complaint_contacts', 'complaints', 'جهات اتصال الشكاوى', '', 'complaint_contacts', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('complaint_neighborhoods', 'complaints', 'الأحياء', '', 'complaint_neighborhoods', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('complaint_sender_rules', 'complaints', 'قواعد المرسلين', '', 'complaint_sender_rules', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('complaint_archive_folders', 'complaints', 'مجلدات أرشيف الشكاوى', '', 'complaint_archive_folders', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('complaint_deletion_requests', 'complaints', 'طلبات حذف الشكاوى', '', 'complaint_deletion_requests', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false),
    ('complaint_email_deliveries', 'complaints', 'إرسالات البريد للتقارير', '', 'complaint_email_deliveries', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('citizen_complaint_events', 'citizen', 'أحداث شكاوى المواطنين', 'مسار كل شكوى مواطن. الشكاوى غير المحلولة محمية.', 'citizen_complaint_events', 'created_at', 'complaint_id in (select c.id from public.citizen_complaints c where c.resolved_at is null)', 'أحداث الشكاوى غير المحلولة محمية', true, 24, false),
    ('citizen_chat_messages', 'citizen', 'رسائل محادثات المواطنين', 'نصوص المحادثة. الجلسات المفتوحة محمية.', 'citizen_chat_messages', 'created_at', 'session_id in (select s.id from public.citizen_chat_sessions s where s.closed_at is null)', 'رسائل الجلسات المفتوحة محمية', true, 12, false),
    ('citizen_chat_sessions', 'citizen', 'جلسات محادثات المواطنين', 'جلسة المحادثة (طلب/قبول/إغلاق/تقييم). المفتوحة محمية.', 'citizen_chat_sessions', 'requested_at', 'closed_at is null', 'الجلسات المفتوحة محمية', true, 12, false),
    ('citizen_accounts', 'citizen', 'حسابات المواطنين', '', 'citizen_accounts', null, null, 'حسابات/هويات مستخدمين — لا تُحذف زمنياً', false, 0, false),
    ('citizen_complaints', 'citizen', 'شكاوى المواطنين', '', 'citizen_complaints', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('citizen_complaint_photos', 'citizen', 'صور شكاوى المواطنين', '', 'citizen_complaint_photos', null, null, 'الصور والملفات تُدار عبر الأرشيف البارد؛ السجل النصي يبقى', false, 0, false),
    ('citizen_portal_settings', 'citizen', 'إعدادات بوابة المواطن', '', 'citizen_portal_settings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('contractor_audit_log', 'contractors', 'سجل تدقيق المقاولين', 'تعديلات العمال/الأعداد وأسبابها.', 'contractor_audit_log', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 36, true),
    ('contractor_checkins', 'contractors', 'تسجيلات حضور المقاولين الميدانية', 'موقع + سيلفي + صورة الفريق عند الحضور. الأشهر غير المعتمدة مالياً محمية.', 'contractor_checkins', 'checked_at', 'not exists (select 1 from public.contractor_month_approvals a where a.month = date_trunc(''month'', log_date)::date and a.approved_at is not null)', 'تسجيلات شهر لم تعتمده المالية محمية', true, 24, true),
    ('contractor_profiles', 'contractors', 'حسابات المقاولين', '', 'contractor_profiles', null, null, 'حسابات/هويات مستخدمين — لا تُحذف زمنياً', false, 0, false),
    ('contractor_workers', 'contractors', 'عمال المقاولين', '', 'contractor_workers', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('contractor_worker_attendance', 'contractors', 'حضور عمال المقاولين', '', 'contractor_worker_attendance', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('contractor_daily_counts', 'contractors', 'الأعداد اليومية', '', 'contractor_daily_counts', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('contractor_rates', 'contractors', 'أجور المقاولين', '', 'contractor_rates', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('contractor_worker_wages', 'contractors', 'أجور العمال', '', 'contractor_worker_wages', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('contractor_month_approvals', 'contractors', 'اعتماد أشهر المقاولين', '', 'contractor_month_approvals', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('sector_manager_profiles', 'sectors', 'حسابات مديري القطاعات', '', 'sector_manager_profiles', null, null, 'حسابات/هويات مستخدمين — لا تُحذف زمنياً', false, 0, false),
    ('sector_workers', 'sectors', 'عمال القطاعات', '', 'sector_workers', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('sector_vehicles', 'sectors', 'آليات القطاعات', '', 'sector_vehicles', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('sector_attendance', 'sectors', 'حضور عمال القطاعات', '', 'sector_attendance', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('sector_photos', 'sectors', 'صور القطاعات', '', 'sector_photos', null, null, 'الصور والملفات تُدار عبر الأرشيف البارد؛ السجل النصي يبقى', false, 0, false),
    ('sector_breakdowns', 'sectors', 'أعطال القطاعات', '', 'sector_breakdowns', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('sector_supply_requests', 'sectors', 'طلبات التجهيز', '', 'sector_supply_requests', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('sector_support_requests', 'sectors', 'طلبات الإسناد', '', 'sector_support_requests', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('sector_support_assignments', 'sectors', 'تعيينات الإسناد', '', 'sector_support_assignments', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('ts_attendance_records', 'station', 'حضور المحطة التحويلية', '', 'ts_attendance_records', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('ts_carrier_records', 'station', 'سجلات الناقلات', '', 'ts_carrier_records', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('ts_saksat_records', 'station', 'سجلات السكسات', '', 'ts_saksat_records', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('ts_trips_records', 'station', 'سجلات رحلات المحطة', '', 'ts_trips_records', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('ts_weight_records', 'station', 'سجلات الوزن', '', 'ts_weight_records', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('ts_visit_weighing_steps', 'station', 'خطوات الوزن', '', 'ts_visit_weighing_steps', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('ts_violations', 'station', 'مخالفات الحد الأدنى', '', 'ts_violations', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('ts_unit_capacities', 'station', 'سعات الوحدات', '', 'ts_unit_capacities', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('station_destinations', 'station', 'وجهات المحطة', '', 'station_destinations', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('station_external_drivers', 'station', 'السائقون الخارجيون', '', 'station_external_drivers', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('media_submissions', 'media', 'إرسالات الإعلام', '', 'media_submissions', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('media_submission_photos', 'media', 'صور الإرسالات', '', 'media_submission_photos', null, null, 'الصور والملفات تُدار عبر الأرشيف البارد؛ السجل النصي يبقى', false, 0, false),
    ('media_designs', 'media', 'تصاميم التقارير', '', 'media_designs', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('media_design_sheets', 'media', 'صفحات التصاميم', '', 'media_design_sheets', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('media_design_photos', 'media', 'صور التصاميم', '', 'media_design_photos', null, null, 'الصور والملفات تُدار عبر الأرشيف البارد؛ السجل النصي يبقى', false, 0, false),
    ('media_design_templates', 'media', 'قوالب التصاميم', '', 'media_design_templates', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('media_covers', 'media', 'أغلفة التقارير', '', 'media_covers', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('cold_archive_settings', 'archive', 'إعدادات الأرشيف البارد', '', 'cold_archive_settings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('cold_archive_packages', 'archive', 'حزم الأرشيف البارد', '', 'cold_archive_packages', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false),
    ('cold_archive_items', 'archive', 'عناصر الأرشيف البارد', '', 'cold_archive_items', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false),
    ('cold_archive_copies', 'archive', 'النسخ الموثَّقة', '', 'cold_archive_copies', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false),
    ('cold_archive_events', 'archive', 'سجل أحداث الأرشيف البارد', '', 'cold_archive_events', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false),
    ('data_retention_policies', 'archive', 'سياسات الاحتفاظ', '', 'data_retention_policies', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('data_retention_requests', 'archive', 'طلبات حذف الاحتفاظ', '', 'data_retention_requests', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false),
    ('data_retention_events', 'archive', 'سجل أحداث الاحتفاظ', '', 'data_retention_events', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false)
$$;

-- ── ⑨ كتالوج الصلاحيات: وحدة «المنتهية خدماتهم والتصفية» (مولَّد بـ scripts/gen-permission-catalog.ts)
-- <<catalog>>  (مولَّد — لا يُحرَّر يدوياً: npx vite-node scripts/gen-permission-catalog.ts)
-- upsert (لا حذف+إدراج) كي لا تُفقد قواعد القوالب والاستثناءات المرتبطة بالوحدات الباقية
insert into public.permission_units (key, portal, path, label, parent_key, actions, sort) values
  ('employee', 'employee', '/employee', 'الرئيسية', null, '{view}', 0),
  ('employee.attendance', 'employee', '/employee/attendance', 'إثبات التواجد والعدد', null, '{view,create}', 1),
  ('employee.photos', 'employee', '/employee/photos', 'إرسال الصور', null, '{view,create}', 2),
  ('hr', 'hr', '/hr', 'الرئيسية', null, '{view}', 3),
  ('hr.recruitment', 'hr', '/hr/recruitment', 'التوظيف وإنهاء الخدمات', null, '{view,create,execute}', 4),
  ('hr.hire-requests', 'hr', '/hr/hire-requests', 'تعيينات بانتظار الإكمال', null, '{view,execute}', 5),
  ('hr.employees', 'hr', '/hr/employees', 'الموظفون', null, '{view,create,edit,export,execute}', 6),
  ('hr.attendance', 'hr', '/hr/attendance', 'الحضور والانصراف', null, '{view,edit,export}', 7),
  ('hr.leaves', 'hr', '/hr/leaves', 'الإجازات والزمنيات', null, '{view,create,decide,export}', 8),
  ('hr.biometric', 'hr', '/hr/biometric', 'دفتر البصمة', null, '{view,export}', 9),
  ('hr.org', 'hr', '/hr/org', 'الهيكل التنظيمي', null, '{view,create,edit,delete}', 10),
  ('hr.behavior', 'hr', '/hr/behavior', 'تقارير سلوك الموظفين', null, '{view,export}', 11),
  ('manager', 'manager', '/manager', 'الرئيسية', null, '{view}', 12),
  ('manager.team', 'manager', '/manager/team', 'فريقي', null, '{view}', 13),
  ('manager.request', 'manager', '/manager/request', 'إنشاء طلب', null, '{view,create}', 14),
  ('manager.leaves', 'manager', '/manager/leaves', 'إجازات فريقي', null, '{view,create,decide}', 15),
  ('manager.breakdown', 'manager', '/manager/breakdown', 'عطل آلية', null, '{view,create}', 16),
  ('manager.vehicle-trips', 'manager', '/manager/vehicle-trips', 'حركة آليات الوردية', null, '{view,execute}', 17),
  ('manager.support', 'manager', '/manager/support', 'طلبات الدعم', null, '{view,create}', 18),
  ('manager.gbs-containers', 'manager', '/manager/gbs-containers', 'حاويات GBS', null, '{view}', 19),
  ('manager.complaints', 'manager', '/manager/complaints', 'الشكاوى المسندة', null, '{view,create,execute}', 20),
  ('manager.citizen-complaints', 'manager', '/manager/citizen-complaints', 'شكاوى المواطنين', null, '{view,execute}', 21),
  ('manager.photos', 'manager', '/manager/photos', 'إرسال صور', null, '{view,create}', 22),
  ('manager.archive', 'manager', '/manager/archive', 'الأرشيف', null, '{view}', 23),
  ('finance', 'finance', '/finance', 'الرئيسية', null, '{view}', 24),
  ('finance.reports', 'finance', '/finance/reports', 'التقارير', null, '{view,export}', 25),
  ('finance.payroll', 'finance', '/finance/payroll', 'الرواتب', null, '{view,edit,decide,execute,export}', 26),
  ('finance.contractor-wages', 'finance', '/finance/contractor-wages', 'أجور المتعهدين', null, '{view,edit,decide,export}', 27),
  ('finance.advances', 'finance', '/finance/advances', 'السلف', null, '{view,execute,export}', 28),
  ('finance.settlements', 'finance', '/finance/settlements', 'المنتهية خدماتهم والتصفية', null, '{view,decide,execute,export}', 29),
  ('finance.purchases', 'finance', '/finance/purchases', 'مشتريات قطع الصيانة', null, '{view,decide}', 30),
  ('finance.budget', 'finance', '/finance/budget', 'القاصة', null, '{view,create,edit,decide}', 31),
  ('finance.announcements', 'finance', '/finance/announcements', 'التبليغات', null, '{view,create}', 32),
  ('it', 'it', '/it', 'الرئيسية', null, '{view}', 33),
  ('it.user-management', 'it', '/it/user-management', 'إدارة المستخدمين', null, '{view}', 34),
  ('it.user-management.list', 'it', '/it/user-management/list', 'المستخدمون', 'it.user-management', '{view,edit}', 35),
  ('it.user-management.create', 'it', '/it/user-management/create', 'إنشاء مستخدم', 'it.user-management', '{view,create}', 36),
  ('it.user-management.approval-chains', 'it', '/it/user-management/approval-chains', 'سلاسل الموافقات', 'it.user-management', '{view,edit,delete}', 37),
  ('it.user-management.approval-performance', 'it', '/it/user-management/approval-performance', 'أداء الموافقات', 'it.user-management', '{view}', 38),
  ('it.approvals', 'it', '/it/approvals', 'طلبات الموافقة', 'it.user-management', '{view,decide}', 39),
  ('it.user-management.disclosure-types', 'it', '/it/user-management/disclosure-types', 'أنواع الكشوفات', 'it.user-management', '{view,edit}', 40),
  ('it.user-management.maintenance-workshops', 'it', '/it/user-management/maintenance-workshops', 'ورش الصيانة', 'it.user-management', '{view,edit}', 41),
  ('it.database', 'it', '/it/database', 'قاعدة البيانات', null, '{view}', 42),
  ('it.database.tables', 'it', '/it/database/tables', 'الجداول والأعمدة', 'it.database', '{view}', 43),
  ('it.branches', 'it', '/it/branches', 'فروع الشركة', null, '{view,create,edit}', 44),
  ('it.permissions', 'it', '/it/permissions', 'قوالب الصلاحيات', null, '{view,edit}', 45),
  ('it.integrations', 'it', '/it/integrations', 'التكاملات', null, '{view}', 46),
  ('it.integrations.biometric', 'it', '/it/integrations/biometric', 'أجهزة البصمة', 'it.integrations', '{view,edit,execute}', 47),
  ('it.integrations.biometric.unmatched', 'it', '/it/integrations/biometric/unmatched', 'الأشخاص غير المطابقين', 'it.integrations', '{view}', 48),
  ('it.integrations.biometric.attendance-audit', 'it', '/it/integrations/biometric/attendance-audit', 'سجل تعديلات الحضور', 'it.integrations', '{view}', 49),
  ('it.integrations.gps', 'it', '/it/integrations/gps', 'تتبع الشاحنات', 'it.integrations', '{view,edit,execute}', 50),
  ('it.integrations.gps-health', 'it', '/it/integrations/gps-health', 'سلامة تكامل GPS', 'it.integrations', '{view}', 51),
  ('it.integrations.hr-policy', 'it', '/it/integrations/hr-policy', 'سياسة الحضور والإجازات', 'it.integrations', '{view,edit}', 52),
  ('it.integrations.auto-deductions', 'it', '/it/integrations/auto-deductions', 'الاستقطاعات التلقائية', 'it.integrations', '{view,edit}', 53),
  ('it.integrations.advances', 'it', '/it/integrations/advances', 'السلف — الأنواع والسياسة', 'it.integrations', '{view,edit}', 54),
  ('it.integrations.live-tracking', 'it', '/it/integrations/live-tracking', 'البث المباشر — الإعدادات', 'it.integrations', '{view,edit}', 55),
  ('it.notification-policies', 'it', '/it/notification-policies', 'سياسات الإشعارات والانطلاقات', null, '{view,edit,delete}', 56),
  ('it.updates', 'it', '/it/updates', 'التحديثات والمراقبة', null, '{view,execute}', 57),
  ('it.archive', 'it', '/it/archive', 'الأرشيف', null, '{view,delete}', 58),
  ('it.central-garage-approvals', 'it', '/it/central-garage-approvals', 'موافقات تصفير خزانات الكراج', 'it.archive', '{view,decide}', 59),
  ('it.cold-archive', 'it', '/it/cold-archive', 'الأرشيف البارد', 'it.archive', '{view,create,decide,delete}', 60),
  ('it.data-retention', 'it', '/it/data-retention', 'الاحتفاظ بالبيانات', 'it.archive', '{view,edit,delete}', 61),
  ('it.console', 'it', '/it/console', 'Console — رصد الأخطاء', null, '{view}', 62),
  ('it.devops', 'it', '/it/devops', 'دليل التشغيل التقني', null, '{view}', 63),
  ('it.devops.git', 'it', '/it/devops/git', 'Git ورفع التحديثات', 'it.devops', '{view}', 64),
  ('it.devops.database', 'it', '/it/devops/database', 'قاعدة البيانات والترحيلات', 'it.devops', '{view}', 65),
  ('it.devops.tests', 'it', '/it/devops/tests', 'الاختبارات', 'it.devops', '{view}', 66),
  ('it.devops.hosting', 'it', '/it/devops/hosting', 'الاستضافة والبصمة في الإنتاج', 'it.devops', '{view}', 67),
  ('it.devops.status', 'it', '/it/devops/status', 'لوحة الحالة الحية', 'it.devops', '{view}', 68),
  ('admin', 'admin', '/admin', 'الرئيسية', null, '{view}', 69),
  ('admin.reports', 'admin', '/admin/reports', 'التقارير', null, '{view}', 70),
  ('admin.announcements', 'admin', '/admin/announcements', 'التبليغات', null, '{view,create}', 71),
  ('admin.approvals', 'admin', '/admin/approvals', 'طلبات الموافقة', null, '{view,decide}', 72),
  ('admin.approval-performance', 'admin', '/admin/approval-performance', 'أداء الموافقات', null, '{view}', 73),
  ('admin.procedures', 'admin', '/admin/procedures', 'الإجراءات', null, '{view,execute}', 74),
  ('admin.disclosures', 'admin', '/admin/disclosures', 'الكشوفات', null, '{view,decide}', 75),
  ('field-ops', 'field-ops', '/field-ops', 'الرئيسية', null, '{view}', 76),
  ('field-ops.requests', 'field-ops', '/field-ops/requests', 'طلبات فريقي', null, '{view,decide}', 77),
  ('field-ops.sectors', 'field-ops', '/field-ops/sectors', 'القواطع والمسؤولون', null, '{view}', 78),
  ('field-ops.reports', 'field-ops', '/field-ops/reports', 'التقارير', null, '{view}', 79),
  ('field-ops.notify', 'field-ops', '/field-ops/notify', 'التبليغ', null, '{view,create}', 80),
  ('field-ops.procedures', 'field-ops', '/field-ops/procedures', 'الإجراءات', null, '{view,execute}', 81),
  ('field-ops.my-requests', 'field-ops', '/field-ops/my-requests', 'طلباتي', null, '{view,create}', 82),
  ('admin-ops', 'admin-ops', '/admin-ops', 'الرئيسية', null, '{view}', 83),
  ('admin-ops.requests', 'admin-ops', '/admin-ops/requests', 'طلبات فريقي', null, '{view,create,decide}', 84),
  ('admin-ops.reports', 'admin-ops', '/admin-ops/reports', 'التقارير', null, '{view}', 85),
  ('admin-ops.notify', 'admin-ops', '/admin-ops/notify', 'التبليغ', null, '{view,create}', 86),
  ('admin-ops.procedures', 'admin-ops', '/admin-ops/procedures', 'الإجراءات', null, '{view,create,execute}', 87),
  ('admin-ops.disclosures', 'admin-ops', '/admin-ops/disclosures', 'الكشوفات', null, '{view,create,decide}', 88),
  ('admin-ops.contractors', 'admin-ops', '/admin-ops/contractors', 'متابعة المتعهدين والعمال', null, '{view,decide}', 89),
  ('admin-ops.my-requests', 'admin-ops', '/admin-ops/my-requests', 'طلباتي', null, '{view,create}', 90),
  ('maintenance', 'maintenance', '/maintenance', 'الرئيسية', null, '{view}', 91),
  ('maintenance.purchases', 'maintenance', '/maintenance/purchases', 'مشتريات قطع الصيانة', null, '{view,create}', 92),
  ('maintenance.inventory', 'maintenance', '/maintenance/inventory', 'مخزون قطع الصيانة', null, '{view,create,edit}', 93),
  ('maintenance.vehicle-cases', 'maintenance', '/maintenance/vehicle-cases', 'صيانة الآليات', null, '{view,create,decide,execute}', 94),
  ('maintenance.employees', 'maintenance', '/maintenance/employees', 'الموظفون', null, '{view,edit}', 95),
  ('maintenance.requests', 'maintenance', '/maintenance/requests', 'الطلبات', null, '{view,create}', 96),
  ('maintenance.procedures', 'maintenance', '/maintenance/procedures', 'الإجراءات', null, '{view,create,execute}', 97),
  ('maintenance.archive', 'maintenance', '/maintenance/archive', 'أرشيف الصيانة', null, '{view,delete}', 98),
  ('transfer-station', 'transfer-station', '/transfer-station', 'الرئيسية', null, '{view}', 99),
  ('transfer-station.weights', 'transfer-station', '/transfer-station/weights', 'الأوزان', null, '{view,create,execute}', 100),
  ('transfer-station.weights.log', 'transfer-station', '/transfer-station/weights/log', 'تسجيل الأوزان', 'transfer-station.weights', '{view,export}', 101),
  ('transfer-station.saksat', 'transfer-station', '/transfer-station/saksat', 'السكسات والنسافات الخارجة', null, '{view,create,export}', 102),
  ('transfer-station.carrier', 'transfer-station', '/transfer-station/carrier', 'ناقلات الحاويات المكبسية', null, '{view,create,export}', 103),
  ('transfer-station.vehicle-movements', 'transfer-station', '/transfer-station/vehicle-movements', 'حركة آليات المواقع', null, '{view,execute}', 104),
  ('transfer-station.employees', 'transfer-station', '/transfer-station/employees', 'الموظفون', null, '{view,edit}', 105),
  ('transfer-station.requests', 'transfer-station', '/transfer-station/requests', 'الطلبات', null, '{view,create}', 106),
  ('transfer-station.procedures', 'transfer-station', '/transfer-station/procedures', 'الإجراءات', null, '{view,create,execute}', 107),
  ('transfer-station.disclosures', 'transfer-station', '/transfer-station/disclosures', 'الكشوفات', null, '{view,create}', 108),
  ('transfer-station.fines', 'transfer-station', '/transfer-station/fines', 'الغرامات', null, '{view,create}', 109),
  ('transfer-station.archive', 'transfer-station', '/transfer-station/archive', 'أرشيف المحطة', null, '{view,delete}', 110),
  ('executive', 'executive', '/executive', 'الرئيسية', null, '{view}', 111),
  ('executive.reports', 'executive', '/executive/reports', 'التقارير', null, '{view,export}', 112),
  ('executive.announcements', 'executive', '/executive/announcements', 'التبليغات', null, '{view,create}', 113),
  ('executive.approvals', 'executive', '/executive/approvals', 'طلبات الموافقة', null, '{view,decide}', 114),
  ('executive.procedures', 'executive', '/executive/procedures', 'الإجراءات', null, '{view,execute}', 115),
  ('executive.receivables', 'executive', '/executive/receivables', 'مستحقات الشركة', null, '{view,create,edit,execute}', 116),
  ('executive.gps-payments', 'executive', '/executive/gps-payments', 'تسديد مستحقات GPS', null, '{view,create,edit}', 117),
  ('executive.rewards', 'executive', '/executive/rewards', 'المكافآت', null, '{view,create}', 118),
  ('executive.events', 'executive', '/executive/events', 'فعاليات الشركة', null, '{view,create}', 119),
  ('executive.behavior', 'executive', '/executive/behavior', 'تقارير سلوك الموظفين', null, '{view,export}', 120),
  ('deputy', 'deputy', '/deputy', 'الرئيسية', null, '{view}', 121),
  ('deputy.reports', 'deputy', '/deputy/reports', 'التقارير', null, '{view,export}', 122),
  ('deputy.announcements', 'deputy', '/deputy/announcements', 'التبليغات', null, '{view,create}', 123),
  ('deputy.statements', 'deputy', '/deputy/statements', 'الكشوفات', null, '{view,decide}', 124),
  ('deputy.deductions', 'deputy', '/deputy/deductions', 'مراجعة الاستقطاعات', null, '{view,decide,edit}', 125),
  ('deputy.rented-tax', 'deputy', '/deputy/rented-tax', 'ضريبة الآليات المؤجرة', null, '{view,edit}', 126),
  ('deputy.overtime', 'deputy', '/deputy/overtime', 'الساعات الإضافية المدفوعة', null, '{view,decide,edit}', 127),
  ('deputy.sector-supplies', 'deputy', '/deputy/sector-supplies', 'كتب مستلزمات القواطع', null, '{view,decide}', 128),
  ('deputy.station-folders', 'deputy', '/deputy/station-folders', 'فولدرات المحطة', null, '{view}', 129),
  ('deputy.data-analysis', 'deputy', '/deputy/data-analysis', 'تحليل البيانات', null, '{view}', 130),
  ('deputy.rewards', 'deputy', '/deputy/rewards', 'المكافآت', null, '{view,create}', 131),
  ('deputy.approvals', 'deputy', '/deputy/approvals', 'طلبات الموافقة', null, '{view,decide}', 132),
  ('deputy.procedures', 'deputy', '/deputy/procedures', 'الإجراءات', null, '{view,execute}', 133),
  ('deputy.behavior', 'deputy', '/deputy/behavior', 'تقارير سلوك الموظفين', null, '{view,export}', 134),
  ('ops-room', 'ops-room', '/ops-room', 'الرئيسية', null, '{view}', 135),
  ('ops-room.operations-data', 'ops-room', '/ops-room/operations-data', 'بيانات وتقارير العمليات', null, '{view,edit,export}', 136),
  ('ops-room.station-daily', 'ops-room', '/ops-room/station-daily', 'التقرير اليومي للمحطة', null, '{view,create,export}', 137),
  ('ops-room.station-fleet', 'ops-room', '/ops-room/station-fleet', 'أسطول المحطة التحويلية', null, '{view,create,edit}', 138),
  ('ops-room.station-outbound', 'ops-room', '/ops-room/station-outbound', 'متابعة خروج آليات المحطة', null, '{view,execute}', 139),
  ('ops-room.vehicles-database', 'ops-room', '/ops-room/vehicles-database', 'قاعدة بيانات الآليات', null, '{view,create,edit,export}', 140),
  ('ops-room.vehicles-archive', 'ops-room', '/ops-room/vehicles-archive', 'أرشيف الآليات', null, '{view,delete}', 141),
  ('ops-room.gps', 'ops-room', '/ops-room/gps', 'بيانات أجهزة GPS', null, '{view,edit,execute,export}', 142),
  ('ops-room.gbs-containers', 'ops-room', '/ops-room/gbs-containers', 'GBS الحاويات', null, '{view,edit}', 143),
  ('ops-room.attendance', 'ops-room', '/ops-room/attendance', 'الحضوريات', null, '{view,edit,decide,export}', 144),
  ('ops-room.store', 'ops-room', '/ops-room/store', 'المخزن', null, '{view,create,edit,execute}', 145),
  ('ops-room.campaigns', 'ops-room', '/ops-room/campaigns', 'متابعة الحملات', null, '{view,create,export}', 146),
  ('ops-room.citizen-complaints', 'ops-room', '/ops-room/citizen-complaints', 'استقبال الشكاوى', null, '{view,execute,delete}', 147),
  ('ops-room.disclosures', 'ops-room', '/ops-room/disclosures', 'الكشوفات', null, '{view,create,decide}', 148),
  ('ops-room.advances', 'ops-room', '/ops-room/advances', 'السلف', null, '{view,create}', 149),
  ('ops-room.contractor-headcounts', 'ops-room', '/ops-room/contractor-headcounts', 'حضوريات العمال', null, '{view,decide}', 150),
  ('ops-room.leaves', 'ops-room', '/ops-room/leaves', 'طلبات الإجازة', null, '{view,decide}', 151),
  ('ops-room.live-tracking', 'ops-room', '/ops-room/live-tracking', 'البث المباشر', null, '{view}', 152),
  ('ops-room.live-tracking.data', 'ops-room', '/ops-room/live-tracking/data', 'بيانات البث المباشر', null, '{view}', 153),
  ('complaints', 'complaints', '/complaints', 'الرئيسية', null, '{view}', 154),
  ('complaints.karrada-sector', 'complaints', '/complaints/karrada-sector', 'قاطع الكرادة', null, '{view,create,edit}', 155),
  ('complaints.zaafaraniya-sector', 'complaints', '/complaints/zaafaraniya-sector', 'قاطع الزعفرانية', null, '{view,create,edit}', 156),
  ('complaints.assignment', 'complaints', '/complaints/assignment', 'فرز وإسناد الشكاوى', null, '{view,create,edit}', 157),
  ('complaints.processing', 'complaints', '/complaints/processing', 'معالجة الشكاوى', null, '{view,decide,execute}', 158),
  ('complaints.templates', 'complaints', '/complaints/templates', 'القوالب', null, '{view,edit}', 159),
  ('complaints.data', 'complaints', '/complaints/data', 'بيانات الشكاوى', null, '{view,export}', 160),
  ('complaints.database', 'complaints', '/complaints/database', 'قاعدة بيانات الشكاوى', null, '{view,export}', 161),
  ('complaints.pages-contact-settings', 'complaints', '/complaints/pages-contact-settings', 'إعدادات الصفحات والتواصل', null, '{view,edit}', 162),
  ('complaints.archive', 'complaints', '/complaints/archive', 'أرشيف الشكاوى', null, '{view,execute,delete}', 163),
  ('complaints.technical-support', 'complaints', '/complaints/technical-support', 'الدعم الفني', null, '{view,create}', 164),
  ('media', 'media', '/media', 'الرئيسية', null, '{view}', 165),
  ('media.karrada-sector', 'media', '/media/karrada-sector', 'قاطع الكرادة', null, '{view,create}', 166),
  ('media.zaafaraniya-sector', 'media', '/media/zaafaraniya-sector', 'الزعفرانية', null, '{view,create}', 167),
  ('media.zaafaraniya-folder', 'media', '/media/zaafaraniya-folder', 'فولدر الزعفرانية', null, '{view,create,export}', 168),
  ('media.karrada-folder', 'media', '/media/karrada-folder', 'فولدر الكرادة', null, '{view,create,export}', 169),
  ('media.design-templates', 'media', '/media/design-templates', 'قوالب التصميم', null, '{view,create,edit,delete}', 170),
  ('media.archive', 'media', '/media/archive', 'الأرشيف', null, '{view,delete}', 171),
  ('central-garage', 'central-garage', '/central-garage', 'الرئيسية', null, '{view}', 172),
  ('central-garage.drivers-dispatch', 'central-garage', '/central-garage/drivers-dispatch', 'انطلاقية السائقين', null, '{view,create,execute}', 173),
  ('central-garage.maintenance-coordination', 'central-garage', '/central-garage/maintenance-coordination', 'تنسيق حركات الصيانة', null, '{view,create,decide,execute}', 174),
  ('central-garage.vehicles-database', 'central-garage', '/central-garage/vehicles-database', 'قاعدة بيانات الآليات', null, '{view,create,edit}', 175),
  ('central-garage.fuel', 'central-garage', '/central-garage/fuel', 'الوقود', null, '{view,create}', 176),
  ('central-garage.fuel.gas-oil', 'central-garage', '/central-garage/fuel/gas-oil', 'الكاز', 'central-garage.fuel', '{view,create}', 177),
  ('central-garage.fuel.hydraulic', 'central-garage', '/central-garage/fuel/hydraulic', 'الهيدروليك', 'central-garage.fuel', '{view,create}', 178),
  ('central-garage.fuel.grease', 'central-garage', '/central-garage/fuel/grease', 'الدهن', 'central-garage.fuel', '{view,create}', 179),
  ('central-garage.fuel.c-oil', 'central-garage', '/central-garage/fuel/c-oil', 'C-Oil', 'central-garage.fuel', '{view,create}', 180),
  ('central-garage.employees', 'central-garage', '/central-garage/employees', 'الموظفون', null, '{view,edit}', 181),
  ('central-garage.requests', 'central-garage', '/central-garage/requests', 'الطلبات', null, '{view,create}', 182),
  ('central-garage.procedures', 'central-garage', '/central-garage/procedures', 'الإجراءات', null, '{view,create,execute}', 183),
  ('central-garage.disclosures', 'central-garage', '/central-garage/disclosures', 'الكشوفات', null, '{view,create}', 184),
  ('central-garage.reports', 'central-garage', '/central-garage/reports', 'تقارير الكراج', null, '{view,export}', 185),
  ('central-garage.archive', 'central-garage', '/central-garage/archive', 'الأرشيف', null, '{view,delete}', 186),
  ('follow-up', 'follow-up', '/follow-up', 'الرئيسية', null, '{view}', 187),
  ('follow-up.containers', 'follow-up', '/follow-up/containers', 'متابعة الحاويات', null, '{view,edit}', 188),
  ('follow-up.workers', 'follow-up', '/follow-up/workers', 'متابعة العمال', null, '{view,edit}', 189)
on conflict (key) do update set portal = excluded.portal, path = excluded.path, label = excluded.label, parent_key = excluded.parent_key, actions = excluded.actions, sort = excluded.sort;
delete from public.permission_units where key not in ('employee', 'employee.attendance', 'employee.photos', 'hr', 'hr.recruitment', 'hr.hire-requests', 'hr.employees', 'hr.attendance', 'hr.leaves', 'hr.biometric', 'hr.org', 'hr.behavior', 'manager', 'manager.team', 'manager.request', 'manager.leaves', 'manager.breakdown', 'manager.vehicle-trips', 'manager.support', 'manager.gbs-containers', 'manager.complaints', 'manager.citizen-complaints', 'manager.photos', 'manager.archive', 'finance', 'finance.reports', 'finance.payroll', 'finance.contractor-wages', 'finance.advances', 'finance.settlements', 'finance.purchases', 'finance.budget', 'finance.announcements', 'it', 'it.user-management', 'it.user-management.list', 'it.user-management.create', 'it.user-management.approval-chains', 'it.user-management.approval-performance', 'it.approvals', 'it.user-management.disclosure-types', 'it.user-management.maintenance-workshops', 'it.database', 'it.database.tables', 'it.branches', 'it.permissions', 'it.integrations', 'it.integrations.biometric', 'it.integrations.biometric.unmatched', 'it.integrations.biometric.attendance-audit', 'it.integrations.gps', 'it.integrations.gps-health', 'it.integrations.hr-policy', 'it.integrations.auto-deductions', 'it.integrations.advances', 'it.integrations.live-tracking', 'it.notification-policies', 'it.updates', 'it.archive', 'it.central-garage-approvals', 'it.cold-archive', 'it.data-retention', 'it.console', 'it.devops', 'it.devops.git', 'it.devops.database', 'it.devops.tests', 'it.devops.hosting', 'it.devops.status', 'admin', 'admin.reports', 'admin.announcements', 'admin.approvals', 'admin.approval-performance', 'admin.procedures', 'admin.disclosures', 'field-ops', 'field-ops.requests', 'field-ops.sectors', 'field-ops.reports', 'field-ops.notify', 'field-ops.procedures', 'field-ops.my-requests', 'admin-ops', 'admin-ops.requests', 'admin-ops.reports', 'admin-ops.notify', 'admin-ops.procedures', 'admin-ops.disclosures', 'admin-ops.contractors', 'admin-ops.my-requests', 'maintenance', 'maintenance.purchases', 'maintenance.inventory', 'maintenance.vehicle-cases', 'maintenance.employees', 'maintenance.requests', 'maintenance.procedures', 'maintenance.archive', 'transfer-station', 'transfer-station.weights', 'transfer-station.weights.log', 'transfer-station.saksat', 'transfer-station.carrier', 'transfer-station.vehicle-movements', 'transfer-station.employees', 'transfer-station.requests', 'transfer-station.procedures', 'transfer-station.disclosures', 'transfer-station.fines', 'transfer-station.archive', 'executive', 'executive.reports', 'executive.announcements', 'executive.approvals', 'executive.procedures', 'executive.receivables', 'executive.gps-payments', 'executive.rewards', 'executive.events', 'executive.behavior', 'deputy', 'deputy.reports', 'deputy.announcements', 'deputy.statements', 'deputy.deductions', 'deputy.rented-tax', 'deputy.overtime', 'deputy.sector-supplies', 'deputy.station-folders', 'deputy.data-analysis', 'deputy.rewards', 'deputy.approvals', 'deputy.procedures', 'deputy.behavior', 'ops-room', 'ops-room.operations-data', 'ops-room.station-daily', 'ops-room.station-fleet', 'ops-room.station-outbound', 'ops-room.vehicles-database', 'ops-room.vehicles-archive', 'ops-room.gps', 'ops-room.gbs-containers', 'ops-room.attendance', 'ops-room.store', 'ops-room.campaigns', 'ops-room.citizen-complaints', 'ops-room.disclosures', 'ops-room.advances', 'ops-room.contractor-headcounts', 'ops-room.leaves', 'ops-room.live-tracking', 'ops-room.live-tracking.data', 'complaints', 'complaints.karrada-sector', 'complaints.zaafaraniya-sector', 'complaints.assignment', 'complaints.processing', 'complaints.templates', 'complaints.data', 'complaints.database', 'complaints.pages-contact-settings', 'complaints.archive', 'complaints.technical-support', 'media', 'media.karrada-sector', 'media.zaafaraniya-sector', 'media.zaafaraniya-folder', 'media.karrada-folder', 'media.design-templates', 'media.archive', 'central-garage', 'central-garage.drivers-dispatch', 'central-garage.maintenance-coordination', 'central-garage.vehicles-database', 'central-garage.fuel', 'central-garage.fuel.gas-oil', 'central-garage.fuel.hydraulic', 'central-garage.fuel.grease', 'central-garage.fuel.c-oil', 'central-garage.employees', 'central-garage.requests', 'central-garage.procedures', 'central-garage.disclosures', 'central-garage.reports', 'central-garage.archive', 'follow-up', 'follow-up.containers', 'follow-up.workers');
insert into public.permission_portal_roles (portal, role) values
  ('employee', 'employee'),
  ('hr', 'hr_officer'),
  ('manager', 'department_manager'),
  ('finance', 'finance_officer'),
  ('it', 'it_admin'),
  ('admin', 'super_admin'),
  ('field-ops', 'field_ops'),
  ('admin-ops', 'admin_ops'),
  ('maintenance', 'maintenance'),
  ('transfer-station', 'transfer_station'),
  ('executive', 'executive_director'),
  ('deputy', 'deputy_director'),
  ('ops-room', 'ops_room'),
  ('complaints', 'complaints_officer'),
  ('media', 'media_officer'),
  ('central-garage', 'central_garage_officer'),
  ('follow-up', 'follow_up')
on conflict (portal) do update set role = excluded.role;
delete from public.permission_portal_roles where portal not in ('employee', 'hr', 'manager', 'finance', 'it', 'admin', 'field-ops', 'admin-ops', 'maintenance', 'transfer-station', 'executive', 'deputy', 'ops-room', 'complaints', 'media', 'central-garage', 'follow-up');
-- <<catalog/>>

-- <<bindings>>  (مولَّد — لا يُحرَّر يدوياً: npx vite-node scripts/gen-permission-catalog.ts)
delete from public.permission_write_bindings;
insert into public.permission_write_bindings (fn, unit_key, action) values
  ('hr_employee_create', 'hr.employees', 'create'),
  ('hr_employee_terminate', 'hr.recruitment', 'execute'),
  ('hire_request_complete', 'hr.hire-requests', 'execute'),
  ('supply_request_deliver', 'ops-room.store', 'execute'),
  ('advance_request_create', 'ops-room.advances', 'create'),
  ('ops_attendance_confirm', 'ops-room.attendance', 'decide'),
  ('ops_contractor_month_approve', 'ops-room.contractor-headcounts', 'decide'),
  ('advance_deliver', 'finance.advances', 'execute'),
  ('advance_settle_cash', 'finance.advances', 'execute'),
  ('finance_payroll_approve', 'finance.payroll', 'decide'),
  ('finance_payroll_adjust', 'finance.payroll', 'edit'),
  ('finance_payroll_reconcile', 'finance.payroll', 'execute'),
  ('finance_treasury_confirm', 'finance.budget', 'decide'),
  ('cold_archive_package_create', 'it.cold-archive', 'create'),
  ('cold_archive_purge_request', 'it.cold-archive', 'delete'),
  ('cold_archive_purge_approve', 'it.cold-archive', 'decide'),
  ('cold_archive_purge_confirm', 'it.cold-archive', 'delete'),
  ('it_deduction_exemption_add', 'it.integrations.auto-deductions', 'edit'),
  ('garage_decide_tank_zero', 'it.central-garage-approvals', 'decide'),
  ('complaint_approve_report', 'complaints.processing', 'decide'),
  ('complaint_create_item_from_inbox', 'complaints.assignment', 'create'),
  ('complaint_batch_create_items_from_inbox', 'complaints.assignment', 'create'),
  ('complaint_start_assignment_ticket', 'manager.complaints', 'execute'),
  ('complaint_complete_assignment_ticket', 'manager.complaints', 'execute'),
  ('sector_confirm_vehicle_arrival', 'manager.vehicle-trips', 'execute'),
  ('sector_confirm_vehicle_site_return', 'manager.vehicle-trips', 'execute'),
  ('sector_submit_breakdown', 'manager.breakdown', 'create'),
  ('sector_support_request_create', 'manager.support', 'create'),
  ('garage_record_departure', 'central-garage.drivers-dispatch', 'execute'),
  ('garage_record_return', 'central-garage.drivers-dispatch', 'execute'),
  ('garage_record_shift_departure', 'central-garage.drivers-dispatch', 'execute'),
  ('garage_decide_maintenance_dispatch', 'central-garage.maintenance-coordination', 'decide'),
  ('station_confirm_vehicle_arrival', 'transfer-station.vehicle-movements', 'execute'),
  ('station_record_exit', 'transfer-station.vehicle-movements', 'execute'),
  ('maintenance_approve_readiness', 'maintenance.vehicle-cases', 'decide'),
  ('maintenance_complete_case', 'maintenance.vehicle-cases', 'execute'),
  ('maintenance_confirm_arrival', 'maintenance.vehicle-cases', 'execute'),
  ('maintenance_inventory_create', 'maintenance.inventory', 'create'),
  ('maintenance_purchase_create', 'maintenance.purchases', 'create'),
  ('media_template_create', 'media.design-templates', 'create');
-- <<bindings/>>
