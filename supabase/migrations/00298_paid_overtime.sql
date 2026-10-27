-- 00298 (00353) — نظام الساعات الإضافية المدفوعة
--   • إعداد في وحدة سياسة الموارد البشرية (بوابة التطوير المركزية): تفعيل (افتراضياً متوقف)، وحدة الاحتساب (دقائق/ساعات كاملة)،
--     احتساب ما قبل الشفت و/أو ما بعده، أقل كتلة يومية تُحتسب.
--   • عند التفعيل يتوقف تحويل الإضافي إلى رصيد إجازات (لا ازدواج) — الدقائق تُصرف نقداً بقرار معاون المدير المفوض.
--   • أجر الساعة = أجر اليوم ÷ ساعات الشفت (نفس حساب الراتب الحالي)، أو مبلغ ثابت لكل ساعة يحدده المعاون لموظف بعينه.
--   • الصرف يظهر في كشف الرواتب سطراً مستقلاً «ساعات العمل الإضافي» يُضاف إلى الصافي فقط (لا يدخل الإجمالي ⇒ لا ضريبة ولا استقطاعات عليه).
--   • لا واجهة للموظف.

-- ── ① أعمدة الأيام والكشف ──
alter table public.hr_attendance_days add column if not exists ot_early_minutes int not null default 0;
alter table public.hr_attendance_days add column if not exists ot_late_minutes  int not null default 0;
alter table public.hr_month_export_rows add column if not exists overtime_amount       numeric(14, 2) not null default 0;
alter table public.hr_month_export_rows add column if not exists overtime_paid_minutes int            not null default 0;

-- ── ② الجداول ──
create table if not exists public.hr_overtime_rates (
  employee_id   uuid primary key references public.employees (id) on delete cascade,
  enabled       boolean not null default false,
  hourly_amount numeric(14, 2) not null default 0 check (hourly_amount >= 0),
  note          text,
  updated_by    uuid references auth.users (id) on delete set null,
  updated_at    timestamptz not null default now()
);
alter table public.hr_overtime_rates enable row level security;
create policy "hr_overtime_rates: قراءة" on public.hr_overtime_rates for select to authenticated
  using (app.has_role(array['deputy_director', 'finance_officer', 'super_admin']));

create table if not exists public.hr_overtime_payouts (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.employees (id) on delete cascade,
  period_month    date not null,          -- شهر العمل الذي حُسبت فيه الدقائق
  payroll_month   date not null,          -- شهر الراتب الذي يُصرف فيه المبلغ (أول شهر غير معتمد من المالية)
  status          text not null check (status in ('paid', 'rejected', 'cancelled')),
  early_minutes   int not null default 0,
  late_minutes    int not null default 0,
  counted_minutes int not null default 0,
  payable_minutes int not null default 0,
  unit            text not null check (unit in ('minutes', 'hours')),
  hour_rate       numeric(14, 2) not null default 0,
  rate_source     text not null check (rate_source in ('fixed', 'salary', 'none')),
  amount          numeric(14, 2) not null default 0 check (amount >= 0),
  note            text,
  decided_by      uuid references auth.users (id) on delete set null,
  decided_at      timestamptz not null default now(),
  cancelled_by    uuid references auth.users (id) on delete set null,
  cancelled_at    timestamptz,
  cancel_note     text,
  created_at      timestamptz not null default now()
);
create unique index if not exists uq_hr_overtime_payouts_active on public.hr_overtime_payouts (employee_id, period_month) where status in ('paid', 'rejected');
create index if not exists idx_hr_overtime_payouts_payroll on public.hr_overtime_payouts (payroll_month, status);
alter table public.hr_overtime_payouts enable row level security;
create policy "hr_overtime_payouts: قراءة" on public.hr_overtime_payouts for select to authenticated
  using (app.has_role(array['deputy_director', 'finance_officer', 'super_admin']));

-- ── ③ الإعدادات (داخل hr_policy.settings) ──
create or replace function app.paid_overtime_settings() returns jsonb
language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object(
    'enabled', coalesce((app.hr_policy() ->> 'paid_overtime_enabled')::boolean, false),
    'unit', coalesce(app.hr_policy() ->> 'paid_overtime_unit', 'hours'),
    'before_shift', coalesce((app.hr_policy() ->> 'paid_overtime_before_shift')::boolean, true),
    'after_shift', coalesce((app.hr_policy() ->> 'paid_overtime_after_shift')::boolean, true),
    'min_block_minutes', coalesce((app.hr_policy() ->> 'paid_overtime_min_block_minutes')::int, 30))
$$;
create or replace function app.paid_overtime_enabled() returns boolean
language sql stable security definer set search_path = public, app as $$
  select coalesce((app.hr_policy() ->> 'paid_overtime_enabled')::boolean, false)
$$;

-- ── ④ أجر الساعة: ثابت (قرار المعاون) أو من الراتب (أجر اليوم ÷ دقائق الشفت × 60 — نفس حساب الراتب) ──
create or replace function app.overtime_hour_rate(p_employee uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; fr public.hr_overtime_rates; sp record; v_shift int; v_dim int; v_day numeric; v_rate numeric;
        v_basis text := coalesce(app.hr_policy() ->> 'salary_day_basis', 'fixed_30');
        v_model text := coalesce(app.hr_policy() ->> 'salary_model', 'earned_days');
begin
  select coalesce(nullif(max(a.required_minutes), 0), 480)::int into v_shift from public.hr_attendance_days a where a.employee_id = p_employee and a.work_date >= m and a.work_date < m + interval '1 month';
  v_shift := coalesce(v_shift, 480);
  select * into fr from public.hr_overtime_rates where employee_id = p_employee;
  if found and fr.enabled then
    return jsonb_build_object('hour_rate', fr.hourly_amount, 'source', 'fixed', 'shift_minutes', v_shift, 'day_rate', null, 'pay_type', null);
  end if;
  select s.pay_type, s.base_salary, s.daily_rate into sp from public.employee_salary_profiles s where s.employee_id = p_employee and s.status = 'defined';
  if not found then return jsonb_build_object('hour_rate', 0, 'source', 'none', 'shift_minutes', v_shift, 'day_rate', null, 'pay_type', null); end if;
  v_dim := extract(day from (m + interval '1 month - 1 day'))::int;
  if sp.pay_type = 'daily' then v_day := coalesce(sp.daily_rate, 0);
  elsif v_basis = 'calendar_days' or v_model = 'earned_days' then v_day := round(coalesce(sp.base_salary, 0) / v_dim, 4);
  else v_day := round(coalesce(sp.base_salary, 0) / 30, 4);
  end if;
  v_rate := round(v_day / greatest(v_shift, 1) * 60, 2);
  return jsonb_build_object('hour_rate', v_rate, 'source', 'salary', 'shift_minutes', v_shift, 'day_rate', round(v_day, 2), 'pay_type', sp.pay_type);
end$$;

-- ── ⑤ دقائق الشهر لكل موظف وفق الإعداد (قبل/بعد الشفت، أقل كتلة يومية، الوحدة) ──
create or replace function app.paid_overtime_month(p_month date, p_employee uuid default null)
returns table(employee_id uuid, days_count int, early_minutes int, late_minutes int, counted_minutes int, payable_minutes int, hour_rate numeric, rate_source text, amount numeric, shift_minutes int)
language sql stable security definer set search_path = public, app as $$
  with s as (select app.paid_overtime_settings() j),
  d as (
    select a.employee_id, a.ot_early_minutes, a.ot_late_minutes,
           (case when (s.j ->> 'before_shift')::boolean then a.ot_early_minutes else 0 end) + (case when (s.j ->> 'after_shift')::boolean then a.ot_late_minutes else 0 end) as raw_min
    from public.hr_attendance_days a, s
    where a.work_date >= date_trunc('month', p_month)::date and a.work_date < (date_trunc('month', p_month) + interval '1 month')::date
      and (p_employee is null or a.employee_id = p_employee) and (a.ot_early_minutes > 0 or a.ot_late_minutes > 0)),
  agg as (
    select d.employee_id, count(*) filter (where d.raw_min >= (s.j ->> 'min_block_minutes')::int and d.raw_min > 0)::int as days_count,
           sum(d.ot_early_minutes)::int as early_minutes, sum(d.ot_late_minutes)::int as late_minutes,
           sum(case when d.raw_min >= (s.j ->> 'min_block_minutes')::int then d.raw_min else 0 end)::int as counted_minutes
    from d, s group by d.employee_id),
  calc as (
    select a.*, case when (s.j ->> 'unit') = 'hours' then (a.counted_minutes / 60) * 60 else a.counted_minutes end as payable_minutes,
           app.overtime_hour_rate(a.employee_id, p_month) as hr
    from agg a, s)
  select c.employee_id, c.days_count, c.early_minutes, c.late_minutes, c.counted_minutes, c.payable_minutes,
         (c.hr ->> 'hour_rate')::numeric, c.hr ->> 'source',
         round(c.payable_minutes::numeric / 60 * (c.hr ->> 'hour_rate')::numeric, 2), (c.hr ->> 'shift_minutes')::int
  from calc c
$$;

-- شهر الراتب الذي يُصرف فيه: شهر العمل إن لم تعتمده المالية بعد، وإلا أول شهر لاحق غير معتمد (حتى الشهر الحالي)
create or replace function app.overtime_payroll_month(p_month date) returns date
language plpgsql stable security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; cur date := date_trunc('month', app.hr_local_date(now()))::date;
begin
  while app.hr_month_locked(m) loop
    m := (m + interval '1 month')::date;
    if m > cur then raise exception 'OVERTIME_NO_OPEN_MONTH'; end if;
  end loop;
  return m;
end$$;

-- ── ⑥ تطبيق الصرف على صفوف الكشف (idempotent: يُثبّت المبلغ ويُعدّل الصافي بالفرق فقط؛ لا يمسّ الإجمالي ولا الاستقطاعات) ──
create or replace function app.overtime_apply_to_export(p_export uuid, p_month date, p_employee uuid default null) returns int
language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; n int;
begin
  with s as (
    select x.id as row_id,
           coalesce((select sum(p.amount) from public.hr_overtime_payouts p where p.employee_id = x.employee_id and p.payroll_month = m and p.status = 'paid'), 0) as amt,
           coalesce((select sum(p.payable_minutes) from public.hr_overtime_payouts p where p.employee_id = x.employee_id and p.payroll_month = m and p.status = 'paid'), 0)::int as mins
    from public.hr_month_export_rows x
    where x.export_id = p_export and x.pay_type is not null and (p_employee is null or x.employee_id = p_employee))
  update public.hr_month_export_rows r
     set overtime_amount = s.amt, overtime_paid_minutes = s.mins,
         proposed_net = round(coalesce(r.proposed_net, 0) - coalesce(r.overtime_amount, 0) + s.amt, 2),
         final_net = case when r.final_net is null then null else round(r.final_net - coalesce(r.overtime_amount, 0) + s.amt, 2) end
  from s where s.row_id = r.id and (s.amt <> coalesce(r.overtime_amount, 0) or s.mins <> coalesce(r.overtime_paid_minutes, 0));
  get diagnostics n = row_count;
  return n;
end$$;

-- مزامنة الكشف المفتوح (إن وُجد) لشهر الراتب بعد قرار المعاون
create or replace function app.overtime_sync_open_export(p_employee uuid, p_payroll_month date) returns int
language plpgsql security definer set search_path = public, app as $$
declare x record; n int := 0;
begin
  for x in select id from public.hr_month_exports where period_month = p_payroll_month and status = 'exported' loop
    n := n + app.overtime_apply_to_export(x.id, p_payroll_month, p_employee);
  end loop;
  return n;
end$$;

-- ── ⑦ الدوال المُعاد تعريفها (نسخ مطابقة للأحدث + تغييرات 00353 المعلَّمة) ──
-- ■ hr_compute_day_metrics (نسخة 00268 + الدقائق الخام)
create or replace function app.hr_compute_day_metrics(p_employee uuid, p_date date) returns void
language plpgsql security definer set search_path = public, app as $$
declare a record; v_req int := 0; v_permit int := 0; v_permit_unpaid int := 0; v_short int := 0; v_ot int := 0; v_min int := 0; v_days numeric := 0; v_reason text := null;
        lt record; v_ot_block int := app.hr_policy_int('overtime_min_block_minutes', 30); v_grace int; rl jsonb; v_missing int;
        v_on boolean; v_abs boolean; v_sf_on boolean; v_ul boolean; v_pe int := 0; v_pl int := 0; v_plate int;   -- 00353
begin
  select * into a from public.hr_attendance_days where employee_id = p_employee and work_date = p_date;
  if not found then return; end if;
  rl := app.hr_deduction_rule_for(p_employee, p_date);
  v_on := coalesce((rl ->> 'auto_deduction_enabled')::boolean, true); v_abs := coalesce((rl ->> 'deduct_absence_enabled')::boolean, true);
  v_sf_on := coalesce((rl ->> 'deduct_shortfall_enabled')::boolean, true); v_ul := coalesce((rl ->> 'deduct_unpaid_leave_enabled')::boolean, true);
  if a.expected_in is not null and a.expected_out is not null then v_req := floor(extract(epoch from (a.expected_out - a.expected_in)) / 60)::int; end if;
  select coalesce(sum(l.minutes) filter (where t.is_paid), 0), coalesce(sum(l.minutes) filter (where not t.is_paid), 0) into v_permit, v_permit_unpaid
  from public.hr_leaves l join public.hr_leave_types t on t.id = l.leave_type_id
  where l.employee_id = p_employee and l.status = 'approved' and l.kind = 'time_permit' and l.start_date = p_date;
  select t.* into lt from public.hr_leaves l join public.hr_leave_types t on t.id = l.leave_type_id
  where l.employee_id = p_employee and l.status = 'approved' and l.kind = 'leave' and p_date between l.start_date and l.end_date
  order by t.is_paid desc limit 1;   -- إن تداخلت إجازتان تُقدَّم المدفوعة (لا يُستقطع من موظف لديه إجازة مدفوعة معتمدة)

  if a.status = 'leave' then
    v_short := 0; v_permit := 0;
    if lt.id is not null and not lt.is_paid and not a.is_rest_day and v_req > 0 and v_on and v_ul then v_days := lt.deduction_days_per_day; v_reason := lt.name; end if;
  elsif a.is_rest_day or v_req = 0 then
    v_short := 0; v_permit := 0;
  elsif a.status = 'absent' then
    v_short := v_req; v_permit := 0;
    if v_on and v_abs then v_days := coalesce((rl ->> 'absent_day_deduction_days')::numeric, 1); v_reason := 'غياب بلا إجازة معتمدة'; end if;
  elsif a.status = 'incomplete' then
    v_short := 0;
    if v_on and v_abs and coalesce((rl ->> 'incomplete_punch_as_absent')::boolean, false) then v_days := coalesce((rl ->> 'absent_day_deduction_days')::numeric, 1); v_reason := 'بصمة ناقصة تُعامل كغياب'; end if;
  else
    -- الزمنية المدفوعة تغطي الدقائق الناقصة فعلاً فقط (داوم كاملاً رغم الزمنية ⇒ لا تُحتسب وقتاً إضافياً)
    v_missing := greatest(0, v_req - a.worked_minutes);
    v_short := greatest(0, v_missing - v_permit);
    if v_short > 0 and v_on and v_sf_on then
      select o_minutes, o_days into v_min, v_days from app.hr_shortfall_for_rule(rl, v_short, v_req);
      if v_min > 0 or v_days > 0 then
        v_reason := 'نقص ' || v_short || ' دقيقة عن ساعات الشفت';
        if v_permit_unpaid > 0 then v_reason := v_reason || ' — منها زمنية غير مدفوعة ' || least(v_permit_unpaid, v_short) || ' د'; end if;
      end if;
    end if;
    if app.hr_policy_bool('overtime_enabled', true) and a.check_out is not null and a.expected_out is not null and v_short = 0 then
      -- 00248: الوقت الإضافي خارج بنك الساعات يخضع للشرائح نفسها (مجيء مبكر/بقاء بعد النهاية)
      -- 00268: البقاء بعد النهاية يغطي تأخير اليوم نفسه أولاً (فوق السماحية) ثم ما زاد فقط يُحتسب إضافياً — لا ازدواج
      declare v_ot_late int := case when a.check_in is not null and a.expected_in is not null then greatest(0, floor(extract(epoch from (a.check_in - a.expected_in)) / 60)::int) else 0 end;
              v_ot_grace int := coalesce((rl ->> 'grace_minutes_default')::int, 15);
      begin
        if v_ot_late <= v_ot_grace then v_ot_late := 0; end if;
        v_ot := app.hr_credit_tiered(case when a.check_in is not null and a.expected_in is not null then greatest(0, floor(extract(epoch from (a.expected_in - a.check_in)) / 60)::int) else 0 end, app.hr_credit_tiers('early_in'))
              + app.hr_credit_tiered(greatest(0, floor(extract(epoch from (a.check_out - a.expected_out)) / 60)::int - v_ot_late), app.hr_credit_tiers('late_out'));
      end;
      if v_ot < v_ot_block then v_ot := 0; end if;
    end if;
  end if;
  v_grace := coalesce((rl ->> 'grace_minutes_default')::int, 15);
  if a.status in ('present', 'late', 'early_leave', 'time_permit') and v_short <= v_grace then v_min := 0; v_days := 0; v_reason := null; end if;
  -- 00218: بنك الساعات — قاعدة اليوم الواحد (لا تعويض بين الأيام):
  --   نقص اليوم = max(0, التأخير فوق السماحية − البقاء بعد نهاية الشفت في نفس اليوم) + الخروج المبكر − الزمنية المدفوعة
  --   فائض اليوم = ما زاد من البقاء بعد تغطية تأخير اليوم + المجيء المبكر  ⇒ رصيد إجازة شهرياً (دقائق الشفت = يوم) بسقف
  --   التأخير ضمن السماحية = صفر؛ فوقها تُحتسب كل دقائقه. الاستقطاع المقترح لليوم = نقصه (يُجمع شهرياً × أجر الدقيقة).
  if coalesce(rl ->> 'shortfall_method', 'tiers') = 'hour_bank' and a.status in ('present', 'late', 'early_leave', 'time_permit')
     and not a.is_rest_day and a.expected_in is not null and a.expected_out is not null and a.check_in is not null and a.check_out is not null then
    declare v_late_raw int := greatest(0, floor(extract(epoch from (a.check_in - a.expected_in)) / 60)::int);
            v_early_in int := greatest(0, floor(extract(epoch from (a.expected_in - a.check_in)) / 60)::int);
            v_early_out int := greatest(0, floor(extract(epoch from (a.expected_out - a.check_out)) / 60)::int);
            v_extra int := greatest(0, floor(extract(epoch from (a.check_out - a.expected_out)) / 60)::int);
            v_late_eff int; v_sf int; v_sur int;
    begin
      v_late_eff := case when v_late_raw <= v_grace then 0 else v_late_raw end;
      v_sf := greatest(0, greatest(0, v_late_eff - v_extra) + v_early_out - v_permit);
      -- 00248: الفائض بالشرائح — البقاء يغطي تأخير اليوم 100% أولاً، ثم الزائد والمجيء المبكر كلٌّ بشرائحه (ما بعد آخر شريحة = 0)
      v_sur := app.hr_credit_tiered(greatest(0, v_extra - v_late_eff), app.hr_credit_tiers('late_out')) + app.hr_credit_tiered(v_early_in, app.hr_credit_tiers('early_in'));
      v_short := v_sf; v_ot := v_sur; v_days := 0;
      v_min := case when v_on and v_sf_on then v_sf else 0 end;
      v_reason := case when v_sf > 0 then 'نقص ' || v_sf || ' دقيقة (تأخير ' || v_late_eff || ' − بقاء ' || least(v_extra, v_late_eff) || ' + خروج مبكر ' || v_early_out || case when v_permit > 0 then ' − زمنية ' || v_permit else '' end || ') — بنك الساعات' else null end;
    end;
  end if;
  if v_reason is not null and (rl ->> '_source') <> 'default' then v_reason := v_reason || ' (' || (rl ->> '_rule_name') || ')'; end if;

  -- 00202: نموذج «الأيام المستحقة» — الغياب/الإجازة غير المدفوعة/البصمة الناقصة المعاملة كغياب أيامٌ غير مدفوعة أصلاً، لا استقطاع مقترح عليها
  --   (حتى ترى غرفة العمليات نفس ما ستراه المالية؛ يبقى السبب للعلم بوسم «يوم غير مدفوع»)
  if coalesce(app.hr_policy() ->> 'salary_model', 'earned_days') = 'earned_days'
     and (select coalesce(sp.pay_type, 'monthly') from public.employee_salary_profiles sp where sp.employee_id = p_employee and sp.status = 'defined') is distinct from 'daily'
     and a.status in ('absent', 'leave', 'incomplete') and v_days > 0 then
    v_days := 0; v_min := 0; v_reason := v_reason || ' — يوم غير مدفوع (لا يدخل الراتب)';
  end if;
  -- 00353: دقائق الإضافي الخام للصرف المدفوع (قبل الشفت / بعده) — بلا شرائح؛ البقاء بعد النهاية يغطي تأخير اليوم (فوق السماحية) أولاً؛
  --   لا تُحتسب إلا إذا كان اليوم بلا نقص (نفس قاعدة الإضافي الحالية) وبصمتا الدخول والخروج موجودتان وليس يوم راحة؛ المجيء المبكر يغطي الخروج المبكر أولاً
  if a.status in ('present', 'late', 'early_leave', 'time_permit') and not a.is_rest_day and v_short = 0
     and a.check_in is not null and a.check_out is not null and a.expected_in is not null and a.expected_out is not null then
    v_plate := greatest(0, floor(extract(epoch from (a.check_in - a.expected_in)) / 60)::int);
    if v_plate <= v_grace then v_plate := 0; end if;
    -- المجيء المبكر يغطي الخروج المبكر في اليوم نفسه أولاً (كما يغطي البقاءُ التأخيرَ) — لا يُدفع إلا ما زاد فعلاً على ساعات الشفت
    v_pe := greatest(0, floor(extract(epoch from (a.expected_in - a.check_in)) / 60)::int - greatest(0, floor(extract(epoch from (a.expected_out - a.check_out)) / 60)::int));
    v_pl := greatest(0, floor(extract(epoch from (a.check_out - a.expected_out)) / 60)::int - v_plate);
  end if;
  update public.hr_attendance_days set required_minutes = v_req, permit_minutes = v_permit, shortfall_minutes = v_short, overtime_minutes = v_ot,
    proposed_deduction_minutes = v_min, proposed_deduction_days = v_days, deduction_reason = v_reason, ot_early_minutes = v_pe, ot_late_minutes = v_pl
  where employee_id = p_employee and work_date = p_date;
end$$;

-- ■ hr_policy_set (نسخة 00255 + تحقق مفاتيح الإضافي المدفوع)
create or replace function public.hr_policy_set(p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare cur jsonb; t jsonb; i int := 0; prev_to int := 0; v_reeval boolean := false;
begin
  if not app.has_role(array['it_admin', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'HR_POLICY_INVALID'; end if;
  cur := app.hr_policy() || p_patch;
  if (cur ->> 'annual_leave_days_default')::numeric < 0 or (cur ->> 'permits_per_leave_day')::int < 1 or (cur ->> 'permit_max_minutes')::int < 15 then raise exception 'HR_POLICY_INVALID'; end if;
  if (cur ->> 'balance_mode') not in ('annual_upfront', 'monthly_accrual') then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce((cur ->> 'backdated_max_days')::int, 7) not between 0 and 365 or coalesce((cur ->> 'backdated_alert_per_month')::int, 3) not between 1 and 31 then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce((cur ->> 'punch_window_hours')::int, 4) not between 1 and 12 then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce((cur ->> 'min_punch_gap_minutes')::int, 30) not between 0 and 240 then raise exception 'HR_POLICY_INVALID'; end if;   -- 00255
  if jsonb_typeof(coalesce(cur -> 'punch_window_auto_cap', 'true'::jsonb)) <> 'boolean' then raise exception 'HR_POLICY_INVALID'; end if;   -- 00255
  if coalesce((cur ->> 'evaluate_lookback_days')::int, 2) not between 1 and 31 then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce((cur ->> 'grace_minutes_default')::int, 15) not between 0 and 120 then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce(cur ->> 'salary_day_basis', 'fixed_30') not in ('fixed_30', 'calendar_days') then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce(cur ->> 'salary_model', 'earned_days') not in ('earned_days', 'full_minus_absence') then raise exception 'HR_POLICY_INVALID'; end if;
  if jsonb_typeof(coalesce(cur -> 'pay_rest_days', 'false'::jsonb)) <> 'boolean' then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce((cur ->> 'auto_deduction_cap_ratio')::numeric, 1) not between 0 and 1 then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce((cur ->> 'absent_day_deduction_days')::numeric, 1) not between 0 and 3 then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce(cur ->> 'auto_deduction_amount_mode', 'salary') not in ('salary', 'fixed') then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce((cur ->> 'fixed_absent_day_amount')::numeric, 0) < 0 or coalesce((cur ->> 'fixed_shortfall_minute_amount')::numeric, 0) < 0 then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce((cur ->> 'max_auto_deduction_days_per_month')::numeric, 0) not between 0 and 31 then raise exception 'HR_POLICY_INVALID'; end if;
  -- 00353: الساعات الإضافية المدفوعة
  if jsonb_typeof(coalesce(cur -> 'paid_overtime_enabled', 'false'::jsonb)) <> 'boolean' then raise exception 'HR_POLICY_INVALID'; end if;
  if jsonb_typeof(coalesce(cur -> 'paid_overtime_before_shift', 'true'::jsonb)) <> 'boolean' or jsonb_typeof(coalesce(cur -> 'paid_overtime_after_shift', 'true'::jsonb)) <> 'boolean' then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce(cur ->> 'paid_overtime_unit', 'hours') not in ('minutes', 'hours') then raise exception 'HR_POLICY_INVALID'; end if;
  if coalesce((cur ->> 'paid_overtime_min_block_minutes')::int, 30) not between 0 and 480 then raise exception 'HR_POLICY_INVALID'; end if;
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
  -- هل تغيّر شيء يؤثر في الاستقطاع المقترح لكل يوم؟ ⇒ يُعاد احتساب الشهر الجاري (غير المقفل) فوراً حتى لا تبقى أرقام قديمة في غرفة العمليات
  select bool_or(k in ('auto_deduction_enabled','deduct_absence_enabled','deduct_shortfall_enabled','deduct_unpaid_leave_enabled','deduction_tiers','absent_day_deduction_days','incomplete_punch_as_absent','grace_minutes_default','min_punch_gap_minutes','punch_window_auto_cap','punch_window_hours'))
    into v_reeval from jsonb_object_keys(p_patch) k;
  update public.hr_policy set settings = cur, updated_by = auth.uid(), updated_at = now() where id = 1;
  if coalesce(v_reeval, false) and not app.hr_month_locked(date_trunc('month', app.hr_local_date(now()))::date) then
    perform app.hr_evaluate_month(date_trunc('month', app.hr_local_date(now()))::date);
  end if;
  return cur;
end$$;

-- ■ تحويل الإضافي إلى رصيد يتوقف عند تفعيل الصرف (نسخة 00218)
create or replace function app.hr_overtime_credit(p_month date) returns int
language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; r record; n int := 0; per_day int; v_days numeric;
begin
  if app.paid_overtime_enabled() then delete from public.hr_leave_ledger l where l.period_month = m and l.kind = 'overtime'; return 0; end if;   -- 00353: الإضافي يُصرف نقداً لا رصيداً
  if not app.hr_policy_bool('overtime_enabled', true) then return 0; end if;
  for r in select employee_id, overtime_minutes, shift_minutes from app.hr_month_summary(m) where overtime_minutes > 0 loop
    if (select hb.enabled from app.hr_hour_bank(r.employee_id, m) hb) then continue; end if;
    per_day := coalesce(app.hr_policy_int('overtime_minutes_per_leave_day', 0), 0);
    if per_day <= 0 then per_day := r.shift_minutes; end if;
    v_days := round(r.overtime_minutes::numeric / per_day, 3);
    if v_days > 0 then
      insert into public.hr_leave_ledger (employee_id, year, kind, days, period_month, note)
      values (r.employee_id, extract(year from m)::int, 'overtime', v_days, m, 'دوام إضافي ' || r.overtime_minutes || ' دقيقة في ' || to_char(m, 'YYYY-MM'))
      on conflict (employee_id, period_month) where kind = 'overtime' do update set days = excluded.days, note = excluded.note;
      n := n + 1;
    end if;
  end loop;
  return n;
end$$;

create or replace function app.hr_hour_bank_credit(p_month date) returns int
language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; r record; hb record; n int := 0;
begin
  if app.paid_overtime_enabled() then delete from public.hr_leave_ledger l where l.period_month = m and l.kind = 'overtime'; return 0; end if;   -- 00353
  for r in select s.employee_id from app.hr_month_summary(m) s loop
    select * into hb from app.hr_hour_bank(r.employee_id, m);
    if not hb.enabled then continue; end if;
    if hb.credit_days > 0 then
      insert into public.hr_leave_ledger (employee_id, year, kind, days, period_month, note)
      values (r.employee_id, extract(year from m)::int, 'overtime', hb.credit_days, m,
              'بنك الساعات ' || to_char(m, 'YYYY-MM') || ': فائض ' || hb.surplus_minutes || ' دقيقة = ' || hb.credit_days || ' يوم'
              || case when hb.credit_capped then ' (بلغ السقف الشهري ' || hb.credit_cap_days || ' يوم)' else '' end)
      on conflict (employee_id, period_month) where kind = 'overtime' do update set days = excluded.days, note = excluded.note;
      n := n + 1;
    else
      delete from public.hr_leave_ledger l where l.employee_id = r.employee_id and l.period_month = m and l.kind = 'overtime';
    end if;
  end loop;
  return n;
end$$;

-- ■ بنك الساعات في الكشف (نسخة 00225)
create or replace function app.hr_hour_bank_apply_export(p_export uuid, p_month date, p_employee uuid default null) returns int
language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; n int := 0;
begin
  update public.hr_month_export_rows r set
    hour_bank_enabled = true, hour_bank_required_minutes = hb.required_minutes, hour_bank_credited_minutes = hb.credited_minutes,
    hour_bank_net_minutes = hb.net_minutes, hour_bank_credit_days = case when app.paid_overtime_enabled() then 0 else hb.credit_days end,   -- 00353 shift_minutes = hb.shift_minutes,
    auto_deduction_basis = case when r.auto_deduction_basis = 'disabled' then 'disabled' else 'hour_bank' end
  from (select x.id, hb.* from public.hr_month_export_rows x cross join lateral app.hr_hour_bank(x.employee_id, m) hb
        where x.export_id = p_export and hb.enabled and (p_employee is null or x.employee_id = p_employee)) hb
  where r.id = hb.id;
  get diagnostics n = row_count;
  return n;
end$$;

-- ■ التصدير وتحديث الصف (نسخة 00251)
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
  perform app.overtime_apply_to_export(v_id, m, null);   -- 00353: ساعات العمل الإضافي المصروفة (تُضاف للصافي، لا للإجمالي ولا للاستقطاعات)
  update public.hr_month_exports set rows_count = n where id = v_id;
  insert into public.hr_attendance_audit (employee_id, work_date, action, after, reason, actor)
  select e.employee_id, m, 'export', jsonb_build_object('export_id', v_id, 'version', v_ver, 'days_evaluated', n_eval, 'salary_day_basis', v_basis, 'salary_model', v_model, 'pay_rest_days', v_pay_rest, 'prorate', v_prorate, 'auto_deduction', coalesce(e.auto_deduction_basis, 'salary'), 'auto_deduction_rule', e.auto_deduction_rule, 'rented_tax_pct', e.rented_tax_pct, 'rented_tax_amount', e.rented_tax_amount, 'overtime_amount', e.overtime_amount), 'تصدير الشهر إلى معاون المدير المفوض (ثم المالية بعد اعتماده)', auth.uid()
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
    perform app.overtime_apply_to_export(x.id, x.period_month, p_employee);   -- 00353
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

-- ■ تفكيك المعاون (نسخة 00219)
create or replace function app.deputy_row_breakdown(p_row public.hr_month_export_rows, p_pct numeric) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare r public.hr_month_export_rows := p_row;
        v_minute_rate numeric; v_short numeric; v_abs numeric; v_ops numeric; v_fines numeric; v_fix_min numeric;
        k text; orig numeric; rel numeric; mode text; total_rel numeric := 0; remaining numeric := 0; pct_rel numeric; j jsonb := '{}'::jsonb; e jsonb;
begin
  -- نقص الساعات: أجر الدقيقة × الدقائق (أو المبلغ الثابت للدقيقة إن كانت القاعدة ثابتة)، ولا يتجاوز مبلغ الاستقطاع التلقائي كله
  v_minute_rate := case when coalesce(r.pay_type, '') = 'daily' then round(coalesce(r.daily_rate, 0) / greatest(coalesce(r.shift_minutes, 480), 1), 4)
                        else round(coalesce(r.day_rate, 0) / greatest(coalesce(r.shift_minutes, 480), 1), 4) end;
  if r.auto_deduction_basis = 'fixed' then
    select coalesce((x ->> 'fixed_shortfall_minute_amount')::numeric, 0) into v_fix_min from app.hr_deduction_rule_for(r.employee_id, (select period_month from public.hr_month_exports where id = r.export_id)) x;
    v_short := round(coalesce(v_fix_min, 0) * coalesce(r.auto_deduction_minutes, 0), 2);
  elsif r.auto_deduction_basis = 'disabled' then v_short := 0;
  else v_short := round(v_minute_rate * coalesce(r.auto_deduction_minutes, 0), 2);
  end if;
  v_short := least(v_short, coalesce(r.auto_deduction_amount, 0));
  v_abs := greatest(0, round(coalesce(r.auto_deduction_amount, 0) - v_short, 2));
  -- اليدوية والغرامات من سجل استقطاعات الشهر (المصدر نفسه الذي قرأه التصدير)
  select coalesce(sum(case when d.source_disclosure_id is null then d.amount + round(d.days * coalesce(r.day_rate, 0), 2) else 0 end), 0),
         coalesce(sum(case when d.source_disclosure_id is not null then d.amount + round(d.days * coalesce(r.day_rate, 0), 2) else 0 end), 0)
    into v_ops, v_fines
  from public.hr_attendance_deductions d join public.hr_month_exports x on x.id = r.export_id
  where d.employee_id = r.employee_id and d.period_month = x.period_month and d.created_at <= x.exported_at;
  -- إن اختلف السجل الحي عن المخزَّن (استقطاع أُضيف بعد التصدير) نلتزم بالمخزَّن في الصف
  if round(v_ops + v_fines, 2) <> round(coalesce(r.ops_deduction_amount, 0) + coalesce(r.ops_deduction_days_amount, 0), 2) then
    v_ops := greatest(0, round(coalesce(r.ops_deduction_amount, 0) + coalesce(r.ops_deduction_days_amount, 0) - v_fines, 2));
  end if;

  foreach k in array array['shortfall', 'absence', 'ops', 'fines'] loop
    orig := case k when 'shortfall' then v_short when 'absence' then v_abs when 'ops' then v_ops else v_fines end;
    e := coalesce(r.review_relief -> k, '{}'::jsonb);
    mode := e ->> 'mode';
    rel := case when mode = 'waive' then orig when mode = 'amount' then greatest(0, orig - coalesce((e ->> 'amount')::numeric, orig)) else 0 end;
    rel := least(rel, orig);
    total_rel := total_rel + rel; remaining := remaining + (orig - rel);
    j := j || jsonb_build_object(k, jsonb_build_object('original', orig, 'relief', rel, 'after', round(orig - rel, 2), 'mode', coalesce(mode, 'none'), 'reason', e ->> 'reason', 'set_amount', (e ->> 'amount')::numeric));
  end loop;
  pct_rel := round(remaining * coalesce(p_pct, 0) / 100, 2);
  total_rel := round(total_rel + pct_rel, 2);
  return j || jsonb_build_object(
    'pct', coalesce(p_pct, 0), 'pct_relief', pct_rel,
    'reviewable_total', round(v_short + v_abs + v_ops + v_fines, 2),
    'relief_total', total_rel,
    'deductions_after', greatest(0, round(coalesce(r.deductions_total, 0) - total_rel, 2)),
    'final_net_after', case when r.pay_type is null then null else greatest(0, round(coalesce(r.gross_amount, 0) - (coalesce(r.deductions_total, 0) - total_rel), 2)) + coalesce(r.overtime_amount, 0) end,   -- 00353
    'overtime_amount', coalesce(r.overtime_amount, 0),
    'minute_rate', v_minute_rate);
end$$;

-- ■ المطابقة (نسخة 00251) — الدالة مغلّفة بحارس 00291 ⇒ يُعاد تعريف الأصل app.finance_payroll_reconcile__raw لا الغلاف العام
create or replace function app.finance_payroll_reconcile__raw(p_month date)
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
      -- 00353: الإضافي الحي = مجموع ما صرفه المعاون لهذا الشهر الرواتبي
      (select coalesce(sum(p.amount), 0) from public.hr_overtime_payouts p where p.employee_id = r.employee_id and p.payroll_month = x.period_month and p.status = 'paid') as ot_live,
      la.working_days as l_working, la.days_present as l_present, la.days_leave_paid as l_leave_paid, la.days_rest as l_rest, la.days_absent as l_absent, la.days_leave as l_leave, la.days_incomplete as l_incomplete, la.auto_minutes as l_auto_min, la.auto_days as l_auto_days, la.auto_days_shortfall as l_auto_days_short,
      coalesce(ld.amt, 0) as l_ded_amt, coalesce(ld.dys, 0) as l_ded_days, coalesce(ld.n, 0) as l_ded_n
    from x join public.hr_month_export_rows r on r.export_id = x.id
    left join live_att la on la.employee_id = r.employee_id
    left join live_ded ld on ld.employee_id = r.employee_id),
  chk as (
    select b.*,
      case when b.pay_type is null then null else greatest(0, round(b.g_exp - b.d_exp, 2)) + coalesce(b.overtime_amount, 0) end as n_exp,   -- 00353
      array_remove(array[
        case when b.pay_type is null then 'SALARY_MISSING' end,
        case when b.pay_type is not null and round(coalesce(b.gross_amount, 0), 2) <> b.g_exp then 'GROSS_MISMATCH' end,
        case when b.pay_type is not null and round(coalesce(b.deductions_total, 0), 2) <> b.d_exp then 'DEDUCTIONS_MISMATCH' end,
        case when b.pay_type is not null and round(coalesce(b.rented_tax_amount, 0), 2) <> b.tax_exp then 'RENTED_TAX_MISMATCH' end,
        case when b.pay_type is not null and round(coalesce(b.proposed_net, 0), 2) <> greatest(0, round(b.g_exp - b.d_exp, 2)) + coalesce(b.overtime_amount, 0) then 'NET_MISMATCH' end,
        case when b.pay_type is not null and round(coalesce(b.overtime_amount, 0), 2) <> b.ot_live then 'OVERTIME_CHANGED' end,   -- 00353
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
      'rented_tax_pct', c.rented_tax_pct, 'rented_tax', c.rented_tax_amount, 'rented_tax_vehicle', c.rented_tax_vehicle, 'overtime', c.overtime_amount, 'overtime_minutes', c.overtime_paid_minutes,
      'working_days', c.working_days, 'present', c.days_present, 'absent', c.days_absent, 'leave', c.days_leave, 'incomplete', c.days_incomplete, 'unevaluated', c.unevaluated_days),
    jsonb_build_object('working_days', c.l_working, 'present', c.l_present, 'leave_paid', c.l_leave_paid, 'rest', c.l_rest, 'absent', c.l_absent, 'leave', c.l_leave, 'incomplete', c.l_incomplete, 'auto_minutes', c.l_auto_min, 'auto_days', c.l_auto_days, 'ops_amount', c.l_ded_amt, 'ops_days', c.l_ded_days, 'ops_count', c.l_ded_n),
    c.iss,
    not (c.iss && array['GROSS_MISMATCH', 'DEDUCTIONS_MISMATCH', 'RENTED_TAX_MISMATCH', 'NET_MISMATCH', 'FINAL_NEGATIVE', 'NET_NOT_FLOORED']::text[]),
    not (c.iss && array['DAYS_UNCLASSIFIED', 'UNEVALUATED_DAYS', 'ATTENDANCE_CHANGED', 'AUTO_DEDUCTION_CHANGED', 'OPS_DEDUCTIONS_CHANGED', 'PAYABLE_DAYS_CHANGED', 'OVERTIME_CHANGED']::text[]),
    coalesce(array_length(c.iss, 1), 0) = 0
  from chk c
  where app.has_role(array['finance_officer', 'super_admin'])
  order by c.branch_name nulls last, c.department_name nulls last, app.hr_employee_sort_key(c.employee_number), c.full_name
$$;

-- ■ كشف المالية (نسخة 00256 + عمودان)
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
  uncollected_amount numeric,
  overtime_amount numeric, overtime_paid_minutes int)
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
         r.overtime_amount, r.overtime_paid_minutes
  from x join public.hr_month_export_rows r on r.export_id = x.id
  where app.has_role(array['finance_officer', 'super_admin']) and app.hr_export_visible_to_finance(x)
  order by r.department_name nulls last, app.hr_employee_sort_key(r.employee_number), r.full_name
$$;
grant execute on function public.finance_payroll_sheet(date) to authenticated;

-- ── ⑨ واجهات معاون المدير المفوض ──
create or replace function app.overtime_require_deputy(p_action text) returns void
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.has_role(app.deputy_roles()) then raise exception 'HR_FORBIDDEN'; end if;
  perform app.require_can('deputy.overtime', p_action);
end$$;
revoke all on function app.overtime_require_deputy(text) from public, anon, authenticated;

-- النظرة العامة لشهر: الإعداد + صف لكل موظف لديه دقائق أو قرار أو أجر ثابت
create or replace function public.deputy_overtime_overview(p_month date) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; s jsonb := app.paid_overtime_settings(); rows jsonb; pm date; v_locked boolean; x record;
begin
  perform app.overtime_require_deputy('view');
  begin pm := app.overtime_payroll_month(m); exception when others then pm := null; end;
  select * into x from public.hr_month_exports where period_month = m and status in ('exported', 'approved') order by version desc limit 1;
  v_locked := app.hr_month_locked(m);
  with calc as (select * from app.paid_overtime_month(m, null)),
  po as (select p.* from public.hr_overtime_payouts p where p.period_month = m and p.status in ('paid', 'rejected')),
  ids as (select employee_id from calc union select employee_id from po union select employee_id from public.hr_overtime_rates where enabled)
  select coalesce(jsonb_agg(jsonb_build_object(
      'employee_id', e.id, 'employee_number', e.employee_number, 'full_name', e.full_name, 'department_name', d.name, 'job_title', e.job_title,
      'days_count', coalesce(c.days_count, 0), 'early_minutes', coalesce(c.early_minutes, 0), 'late_minutes', coalesce(c.late_minutes, 0),
      'counted_minutes', coalesce(c.counted_minutes, 0), 'payable_minutes', coalesce(c.payable_minutes, 0),
      'hour_rate', coalesce(c.hour_rate, (hrj ->> 'hour_rate')::numeric, 0), 'rate_source', coalesce(c.rate_source, hrj ->> 'source', 'none'),
      'shift_minutes', coalesce(c.shift_minutes, (hrj ->> 'shift_minutes')::int, 480), 'day_rate', (hrj ->> 'day_rate')::numeric,
      'amount', coalesce(c.amount, 0),
      'fixed_rate', case when fr.employee_id is null then null else jsonb_build_object('enabled', fr.enabled, 'hourly_amount', fr.hourly_amount, 'note', fr.note) end,
      'payout', case when p.id is null then null else jsonb_build_object('id', p.id, 'status', p.status, 'amount', p.amount, 'payable_minutes', p.payable_minutes, 'counted_minutes', p.counted_minutes,
          'hour_rate', p.hour_rate, 'rate_source', p.rate_source, 'unit', p.unit, 'payroll_month', p.payroll_month, 'note', p.note, 'decided_at', p.decided_at,
          'decided_by_name', app.manager_display_name(p.decided_by), 'settled', app.hr_month_locked(p.payroll_month),
          'changed_since', p.status = 'paid' and (coalesce(c.counted_minutes, 0) <> p.counted_minutes)) end
    ) order by d.name nulls last, app.hr_employee_sort_key(e.employee_number), e.full_name), '[]'::jsonb)
  into rows
  from ids i join public.employees e on e.id = i.employee_id
  left join public.departments d on d.id = e.department_id
  left join calc c on c.employee_id = e.id
  left join po p on p.employee_id = e.id
  left join public.hr_overtime_rates fr on fr.employee_id = e.id
  cross join lateral app.overtime_hour_rate(e.id, m) hrj;
  return jsonb_build_object('month', m, 'settings', s, 'payroll_month', pm, 'month_locked', v_locked,
    'export_status', x.status, 'export_review_status', x.review_status, 'employees', rows);
end$$;
grant execute on function public.deputy_overtime_overview(date) to authenticated;

-- تفصيل أيام موظف في شهر
create or replace function public.deputy_overtime_days(p_employee uuid, p_month date)
returns table(work_date date, shift_name text, expected_in timestamptz, expected_out timestamptz, check_in timestamptz, check_out timestamptz, status text,
              early_minutes int, late_minutes int, counted_minutes int, shortfall_minutes int)
language plpgsql stable security definer set search_path = public, app as $$
declare s jsonb := app.paid_overtime_settings(); m date := date_trunc('month', p_month)::date;
begin
  perform app.overtime_require_deputy('view');
  return query
  select a.work_date, a.shift_name, a.expected_in, a.expected_out, a.check_in, a.check_out, a.status, a.ot_early_minutes, a.ot_late_minutes,
         case when ((case when (s ->> 'before_shift')::boolean then a.ot_early_minutes else 0 end) + (case when (s ->> 'after_shift')::boolean then a.ot_late_minutes else 0 end)) >= (s ->> 'min_block_minutes')::int
              then (case when (s ->> 'before_shift')::boolean then a.ot_early_minutes else 0 end) + (case when (s ->> 'after_shift')::boolean then a.ot_late_minutes else 0 end) else 0 end,
         a.shortfall_minutes
  from public.hr_attendance_days a
  where a.employee_id = p_employee and a.work_date >= m and a.work_date < (m + interval '1 month')::date and (a.ot_early_minutes > 0 or a.ot_late_minutes > 0)
  order by a.work_date;
end$$;
grant execute on function public.deputy_overtime_days(uuid, date) to authenticated;

-- صرف ساعات موظف عن شهر
create or replace function public.deputy_overtime_pay(p_employee uuid, p_month date, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; s jsonb := app.paid_overtime_settings(); c record; pm date; p public.hr_overtime_payouts;
begin
  perform app.overtime_require_deputy('decide');
  if not (s ->> 'enabled')::boolean then raise exception 'OVERTIME_DISABLED'; end if;
  if m > date_trunc('month', app.hr_local_date(now()))::date then raise exception 'HR_MONTH_FUTURE'; end if;
  select * into c from app.paid_overtime_month(m, p_employee);
  if not found or c.payable_minutes <= 0 then raise exception 'OVERTIME_NOTHING_TO_PAY'; end if;
  if c.rate_source = 'none' or c.hour_rate <= 0 then raise exception 'OVERTIME_NO_RATE'; end if;
  if exists (select 1 from public.hr_overtime_payouts where employee_id = p_employee and period_month = m and status in ('paid', 'rejected')) then raise exception 'OVERTIME_ALREADY_DECIDED'; end if;
  pm := app.overtime_payroll_month(m);
  insert into public.hr_overtime_payouts (employee_id, period_month, payroll_month, status, early_minutes, late_minutes, counted_minutes, payable_minutes, unit, hour_rate, rate_source, amount, note, decided_by)
  values (p_employee, m, pm, 'paid', c.early_minutes, c.late_minutes, c.counted_minutes, c.payable_minutes, s ->> 'unit', c.hour_rate, c.rate_source, c.amount, nullif(trim(p_note), ''), auth.uid())
  returning * into p;
  perform app.overtime_sync_open_export(p_employee, pm);
  return to_jsonb(p);
end$$;
grant execute on function public.deputy_overtime_pay(uuid, date, text) to authenticated;

-- رفض صرف ساعات موظف عن شهر (بسبب)
create or replace function public.deputy_overtime_reject(p_employee uuid, p_month date, p_note text) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; s jsonb := app.paid_overtime_settings(); c record; p public.hr_overtime_payouts;
begin
  perform app.overtime_require_deputy('decide');
  if coalesce(length(trim(p_note)), 0) < 3 then raise exception 'OVERTIME_REASON_REQUIRED'; end if;
  if exists (select 1 from public.hr_overtime_payouts where employee_id = p_employee and period_month = m and status in ('paid', 'rejected')) then raise exception 'OVERTIME_ALREADY_DECIDED'; end if;
  select * into c from app.paid_overtime_month(m, p_employee);
  insert into public.hr_overtime_payouts (employee_id, period_month, payroll_month, status, early_minutes, late_minutes, counted_minutes, payable_minutes, unit, hour_rate, rate_source, amount, note, decided_by)
  values (p_employee, m, m, 'rejected', coalesce(c.early_minutes, 0), coalesce(c.late_minutes, 0), coalesce(c.counted_minutes, 0), coalesce(c.payable_minutes, 0), s ->> 'unit', coalesce(c.hour_rate, 0), coalesce(c.rate_source, 'none'), 0, trim(p_note), auth.uid())
  returning * into p;
  return to_jsonb(p);
end$$;
grant execute on function public.deputy_overtime_reject(uuid, date, text) to authenticated;

-- إلغاء قرار (صرف أو رفض) ما دام شهر الراتب لم تعتمده المالية — يعيد الحالة إلى «بانتظار القرار»
create or replace function public.deputy_overtime_cancel(p_payout uuid, p_note text) returns void
language plpgsql security definer set search_path = public, app as $$
declare p public.hr_overtime_payouts;
begin
  perform app.overtime_require_deputy('decide');
  if coalesce(length(trim(p_note)), 0) < 3 then raise exception 'OVERTIME_REASON_REQUIRED'; end if;
  select * into p from public.hr_overtime_payouts where id = p_payout;
  if not found or p.status = 'cancelled' then raise exception 'HR_NOT_FOUND'; end if;
  if p.status = 'paid' and app.hr_month_locked(p.payroll_month) then raise exception 'HR_MONTH_LOCKED'; end if;
  update public.hr_overtime_payouts set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(), cancel_note = trim(p_note) where id = p_payout;
  if p.status = 'paid' then perform app.overtime_sync_open_export(p.employee_id, p.payroll_month); end if;
end$$;
grant execute on function public.deputy_overtime_cancel(uuid, text) to authenticated;

-- أجر ساعة ثابت لموظف (افتراضياً متوقف ⇒ يُحسب من راتبه)
create or replace function public.deputy_overtime_rate_set(p_employee uuid, p_enabled boolean, p_amount numeric, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare r public.hr_overtime_rates;
begin
  perform app.overtime_require_deputy('edit');
  if not exists (select 1 from public.employees where id = p_employee) then raise exception 'HR_NOT_FOUND'; end if;
  if p_enabled and coalesce(p_amount, 0) <= 0 then raise exception 'OVERTIME_RATE_INVALID'; end if;
  insert into public.hr_overtime_rates (employee_id, enabled, hourly_amount, note, updated_by, updated_at)
  values (p_employee, coalesce(p_enabled, false), greatest(coalesce(p_amount, 0), 0), nullif(trim(p_note), ''), auth.uid(), now())
  on conflict (employee_id) do update set enabled = excluded.enabled, hourly_amount = excluded.hourly_amount, note = excluded.note, updated_by = excluded.updated_by, updated_at = now()
  returning * into r;
  return to_jsonb(r);
end$$;
grant execute on function public.deputy_overtime_rate_set(uuid, boolean, numeric, text) to authenticated;

-- قائمة الموظفين الفعّالين مع أجر الساعة الثابت (إن وُجد) وأجر الساعة من الراتب للشهر الحالي
create or replace function public.deputy_overtime_rates()
returns table(employee_id uuid, employee_number text, full_name text, department_name text, job_title text, enabled boolean, hourly_amount numeric, note text, updated_at timestamptz, salary_hour_rate numeric, salary_source text)
language plpgsql stable security definer set search_path = public, app as $$
declare m date := date_trunc('month', app.hr_local_date(now()))::date;
begin
  perform app.overtime_require_deputy('view');
  return query
  select e.id, e.employee_number, e.full_name, d.name, e.job_title, coalesce(fr.enabled, false), coalesce(fr.hourly_amount, 0), fr.note, fr.updated_at,
         (hrj ->> 'hour_rate')::numeric, hrj ->> 'source'
  from public.employees e
  left join public.departments d on d.id = e.department_id
  left join public.hr_overtime_rates fr on fr.employee_id = e.id
  cross join lateral app.overtime_hour_rate(e.id, m) hrj
  where e.archived_at is null
  order by d.name nulls last, app.hr_employee_sort_key(e.employee_number), e.full_name;
end$$;
grant execute on function public.deputy_overtime_rates() to authenticated;

-- سجل القرارات (آخر N)
create or replace function public.deputy_overtime_history(p_limit int default 200)
returns table(id uuid, employee_id uuid, employee_number text, full_name text, period_month date, payroll_month date, status text, payable_minutes int, hour_rate numeric, rate_source text, amount numeric,
              note text, decided_at timestamptz, decided_by_name text, cancelled_at timestamptz, cancelled_by_name text, cancel_note text)
language plpgsql stable security definer set search_path = public, app as $$
begin
  perform app.overtime_require_deputy('view');
  return query
  select p.id, p.employee_id, e.employee_number, e.full_name, p.period_month, p.payroll_month, p.status, p.payable_minutes, p.hour_rate, p.rate_source, p.amount,
         p.note, p.decided_at, app.manager_display_name(p.decided_by), p.cancelled_at, case when p.cancelled_by is null then null else app.manager_display_name(p.cancelled_by) end, p.cancel_note
  from public.hr_overtime_payouts p join public.employees e on e.id = p.employee_id
  order by coalesce(p.cancelled_at, p.decided_at) desc limit greatest(coalesce(p_limit, 200), 1);
end$$;
grant execute on function public.deputy_overtime_history(int) to authenticated;

-- ── ⑩ تعبئة الدقائق الخام للأيام القائمة (الأشهر غير المقفلة حتى 3 أشهر للخلف) ──
do $$ declare r record; begin
  for r in select a.employee_id, a.work_date from public.hr_attendance_days a
            where a.work_date >= (date_trunc('month', current_date) - interval '3 months')::date and a.check_in is not null and a.check_out is not null
              and a.expected_in is not null and a.expected_out is not null and not a.is_rest_day and a.shortfall_minutes = 0
              and (a.check_in < a.expected_in or a.check_out > a.expected_out)
              and not app.hr_month_locked(date_trunc('month', a.work_date)::date)
  loop perform app.hr_compute_day_metrics(r.employee_id, r.work_date); end loop;
end $$;

-- ── ⑪ كتالوج الاحتفاظ: تسجيل الجدولين الجديدين (مولَّد بـ scripts/gen-retention-catalog.py) ──
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

-- ── ⑫ كتالوج الصلاحيات: وحدة «الساعات الإضافية المدفوعة» للمعاون (view/decide/edit) ──
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
  ('finance.purchases', 'finance', '/finance/purchases', 'مشتريات قطع الصيانة', null, '{view,decide}', 29),
  ('finance.budget', 'finance', '/finance/budget', 'القاصة', null, '{view,create,edit,decide}', 30),
  ('finance.announcements', 'finance', '/finance/announcements', 'التبليغات', null, '{view,create}', 31),
  ('it', 'it', '/it', 'الرئيسية', null, '{view}', 32),
  ('it.user-management', 'it', '/it/user-management', 'إدارة المستخدمين', null, '{view}', 33),
  ('it.user-management.list', 'it', '/it/user-management/list', 'المستخدمون', 'it.user-management', '{view,edit}', 34),
  ('it.user-management.create', 'it', '/it/user-management/create', 'إنشاء مستخدم', 'it.user-management', '{view,create}', 35),
  ('it.user-management.approval-chains', 'it', '/it/user-management/approval-chains', 'سلاسل الموافقات', 'it.user-management', '{view,edit,delete}', 36),
  ('it.user-management.approval-performance', 'it', '/it/user-management/approval-performance', 'أداء الموافقات', 'it.user-management', '{view}', 37),
  ('it.approvals', 'it', '/it/approvals', 'طلبات الموافقة', 'it.user-management', '{view,decide}', 38),
  ('it.user-management.disclosure-types', 'it', '/it/user-management/disclosure-types', 'أنواع الكشوفات', 'it.user-management', '{view,edit}', 39),
  ('it.user-management.maintenance-workshops', 'it', '/it/user-management/maintenance-workshops', 'ورش الصيانة', 'it.user-management', '{view,edit}', 40),
  ('it.database', 'it', '/it/database', 'قاعدة البيانات', null, '{view}', 41),
  ('it.database.tables', 'it', '/it/database/tables', 'الجداول والأعمدة', 'it.database', '{view}', 42),
  ('it.branches', 'it', '/it/branches', 'فروع الشركة', null, '{view,create,edit}', 43),
  ('it.permissions', 'it', '/it/permissions', 'قوالب الصلاحيات', null, '{view,edit}', 44),
  ('it.integrations', 'it', '/it/integrations', 'التكاملات', null, '{view}', 45),
  ('it.integrations.biometric', 'it', '/it/integrations/biometric', 'أجهزة البصمة', 'it.integrations', '{view,edit,execute}', 46),
  ('it.integrations.biometric.unmatched', 'it', '/it/integrations/biometric/unmatched', 'الأشخاص غير المطابقين', 'it.integrations', '{view}', 47),
  ('it.integrations.biometric.attendance-audit', 'it', '/it/integrations/biometric/attendance-audit', 'سجل تعديلات الحضور', 'it.integrations', '{view}', 48),
  ('it.integrations.gps', 'it', '/it/integrations/gps', 'تتبع الشاحنات', 'it.integrations', '{view,edit,execute}', 49),
  ('it.integrations.gps-health', 'it', '/it/integrations/gps-health', 'سلامة تكامل GPS', 'it.integrations', '{view}', 50),
  ('it.integrations.hr-policy', 'it', '/it/integrations/hr-policy', 'سياسة الحضور والإجازات', 'it.integrations', '{view,edit}', 51),
  ('it.integrations.auto-deductions', 'it', '/it/integrations/auto-deductions', 'الاستقطاعات التلقائية', 'it.integrations', '{view,edit}', 52),
  ('it.integrations.advances', 'it', '/it/integrations/advances', 'السلف — الأنواع والسياسة', 'it.integrations', '{view,edit}', 53),
  ('it.integrations.live-tracking', 'it', '/it/integrations/live-tracking', 'البث المباشر — الإعدادات', 'it.integrations', '{view,edit}', 54),
  ('it.notification-policies', 'it', '/it/notification-policies', 'سياسات الإشعارات والانطلاقات', null, '{view,edit,delete}', 55),
  ('it.updates', 'it', '/it/updates', 'التحديثات والمراقبة', null, '{view,execute}', 56),
  ('it.archive', 'it', '/it/archive', 'الأرشيف', null, '{view,delete}', 57),
  ('it.central-garage-approvals', 'it', '/it/central-garage-approvals', 'موافقات تصفير خزانات الكراج', 'it.archive', '{view,decide}', 58),
  ('it.cold-archive', 'it', '/it/cold-archive', 'الأرشيف البارد', 'it.archive', '{view,create,decide,delete}', 59),
  ('it.data-retention', 'it', '/it/data-retention', 'الاحتفاظ بالبيانات', 'it.archive', '{view,edit,delete}', 60),
  ('it.console', 'it', '/it/console', 'Console — رصد الأخطاء', null, '{view}', 61),
  ('it.devops', 'it', '/it/devops', 'دليل التشغيل التقني', null, '{view}', 62),
  ('it.devops.git', 'it', '/it/devops/git', 'Git ورفع التحديثات', 'it.devops', '{view}', 63),
  ('it.devops.database', 'it', '/it/devops/database', 'قاعدة البيانات والترحيلات', 'it.devops', '{view}', 64),
  ('it.devops.tests', 'it', '/it/devops/tests', 'الاختبارات', 'it.devops', '{view}', 65),
  ('it.devops.hosting', 'it', '/it/devops/hosting', 'الاستضافة والبصمة في الإنتاج', 'it.devops', '{view}', 66),
  ('it.devops.status', 'it', '/it/devops/status', 'لوحة الحالة الحية', 'it.devops', '{view}', 67),
  ('admin', 'admin', '/admin', 'الرئيسية', null, '{view}', 68),
  ('admin.reports', 'admin', '/admin/reports', 'التقارير', null, '{view}', 69),
  ('admin.announcements', 'admin', '/admin/announcements', 'التبليغات', null, '{view,create}', 70),
  ('admin.approvals', 'admin', '/admin/approvals', 'طلبات الموافقة', null, '{view,decide}', 71),
  ('admin.approval-performance', 'admin', '/admin/approval-performance', 'أداء الموافقات', null, '{view}', 72),
  ('admin.procedures', 'admin', '/admin/procedures', 'الإجراءات', null, '{view,execute}', 73),
  ('admin.disclosures', 'admin', '/admin/disclosures', 'الكشوفات', null, '{view,decide}', 74),
  ('field-ops', 'field-ops', '/field-ops', 'الرئيسية', null, '{view}', 75),
  ('field-ops.requests', 'field-ops', '/field-ops/requests', 'طلبات فريقي', null, '{view,decide}', 76),
  ('field-ops.sectors', 'field-ops', '/field-ops/sectors', 'القواطع والمسؤولون', null, '{view}', 77),
  ('field-ops.reports', 'field-ops', '/field-ops/reports', 'التقارير', null, '{view}', 78),
  ('field-ops.notify', 'field-ops', '/field-ops/notify', 'التبليغ', null, '{view,create}', 79),
  ('field-ops.procedures', 'field-ops', '/field-ops/procedures', 'الإجراءات', null, '{view,execute}', 80),
  ('field-ops.my-requests', 'field-ops', '/field-ops/my-requests', 'طلباتي', null, '{view,create}', 81),
  ('admin-ops', 'admin-ops', '/admin-ops', 'الرئيسية', null, '{view}', 82),
  ('admin-ops.requests', 'admin-ops', '/admin-ops/requests', 'طلبات فريقي', null, '{view,create,decide}', 83),
  ('admin-ops.reports', 'admin-ops', '/admin-ops/reports', 'التقارير', null, '{view}', 84),
  ('admin-ops.notify', 'admin-ops', '/admin-ops/notify', 'التبليغ', null, '{view,create}', 85),
  ('admin-ops.procedures', 'admin-ops', '/admin-ops/procedures', 'الإجراءات', null, '{view,create,execute}', 86),
  ('admin-ops.disclosures', 'admin-ops', '/admin-ops/disclosures', 'الكشوفات', null, '{view,create,decide}', 87),
  ('admin-ops.contractors', 'admin-ops', '/admin-ops/contractors', 'متابعة المتعهدين والعمال', null, '{view,decide}', 88),
  ('admin-ops.my-requests', 'admin-ops', '/admin-ops/my-requests', 'طلباتي', null, '{view,create}', 89),
  ('maintenance', 'maintenance', '/maintenance', 'الرئيسية', null, '{view}', 90),
  ('maintenance.purchases', 'maintenance', '/maintenance/purchases', 'مشتريات قطع الصيانة', null, '{view,create}', 91),
  ('maintenance.inventory', 'maintenance', '/maintenance/inventory', 'مخزون قطع الصيانة', null, '{view,create,edit}', 92),
  ('maintenance.vehicle-cases', 'maintenance', '/maintenance/vehicle-cases', 'صيانة الآليات', null, '{view,create,decide,execute}', 93),
  ('maintenance.employees', 'maintenance', '/maintenance/employees', 'الموظفون', null, '{view,edit}', 94),
  ('maintenance.requests', 'maintenance', '/maintenance/requests', 'الطلبات', null, '{view,create}', 95),
  ('maintenance.procedures', 'maintenance', '/maintenance/procedures', 'الإجراءات', null, '{view,create,execute}', 96),
  ('maintenance.archive', 'maintenance', '/maintenance/archive', 'أرشيف الصيانة', null, '{view,delete}', 97),
  ('transfer-station', 'transfer-station', '/transfer-station', 'الرئيسية', null, '{view}', 98),
  ('transfer-station.weights', 'transfer-station', '/transfer-station/weights', 'الأوزان', null, '{view,create,execute}', 99),
  ('transfer-station.weights.log', 'transfer-station', '/transfer-station/weights/log', 'تسجيل الأوزان', 'transfer-station.weights', '{view,export}', 100),
  ('transfer-station.saksat', 'transfer-station', '/transfer-station/saksat', 'السكسات والنسافات الخارجة', null, '{view,create,export}', 101),
  ('transfer-station.carrier', 'transfer-station', '/transfer-station/carrier', 'ناقلات الحاويات المكبسية', null, '{view,create,export}', 102),
  ('transfer-station.vehicle-movements', 'transfer-station', '/transfer-station/vehicle-movements', 'حركة آليات المواقع', null, '{view,execute}', 103),
  ('transfer-station.employees', 'transfer-station', '/transfer-station/employees', 'الموظفون', null, '{view,edit}', 104),
  ('transfer-station.requests', 'transfer-station', '/transfer-station/requests', 'الطلبات', null, '{view,create}', 105),
  ('transfer-station.procedures', 'transfer-station', '/transfer-station/procedures', 'الإجراءات', null, '{view,create,execute}', 106),
  ('transfer-station.disclosures', 'transfer-station', '/transfer-station/disclosures', 'الكشوفات', null, '{view,create}', 107),
  ('transfer-station.fines', 'transfer-station', '/transfer-station/fines', 'الغرامات', null, '{view,create}', 108),
  ('transfer-station.archive', 'transfer-station', '/transfer-station/archive', 'أرشيف المحطة', null, '{view,delete}', 109),
  ('executive', 'executive', '/executive', 'الرئيسية', null, '{view}', 110),
  ('executive.reports', 'executive', '/executive/reports', 'التقارير', null, '{view,export}', 111),
  ('executive.announcements', 'executive', '/executive/announcements', 'التبليغات', null, '{view,create}', 112),
  ('executive.approvals', 'executive', '/executive/approvals', 'طلبات الموافقة', null, '{view,decide}', 113),
  ('executive.procedures', 'executive', '/executive/procedures', 'الإجراءات', null, '{view,execute}', 114),
  ('executive.receivables', 'executive', '/executive/receivables', 'مستحقات الشركة', null, '{view,create,edit,execute}', 115),
  ('executive.gps-payments', 'executive', '/executive/gps-payments', 'تسديد مستحقات GPS', null, '{view,create,edit}', 116),
  ('executive.rewards', 'executive', '/executive/rewards', 'المكافآت', null, '{view,create}', 117),
  ('executive.events', 'executive', '/executive/events', 'فعاليات الشركة', null, '{view,create}', 118),
  ('executive.behavior', 'executive', '/executive/behavior', 'تقارير سلوك الموظفين', null, '{view,export}', 119),
  ('deputy', 'deputy', '/deputy', 'الرئيسية', null, '{view}', 120),
  ('deputy.reports', 'deputy', '/deputy/reports', 'التقارير', null, '{view,export}', 121),
  ('deputy.announcements', 'deputy', '/deputy/announcements', 'التبليغات', null, '{view,create}', 122),
  ('deputy.statements', 'deputy', '/deputy/statements', 'الكشوفات', null, '{view,decide}', 123),
  ('deputy.deductions', 'deputy', '/deputy/deductions', 'مراجعة الاستقطاعات', null, '{view,decide,edit}', 124),
  ('deputy.rented-tax', 'deputy', '/deputy/rented-tax', 'ضريبة الآليات المؤجرة', null, '{view,edit}', 125),
  ('deputy.overtime', 'deputy', '/deputy/overtime', 'الساعات الإضافية المدفوعة', null, '{view,decide,edit}', 126),
  ('deputy.sector-supplies', 'deputy', '/deputy/sector-supplies', 'كتب مستلزمات القواطع', null, '{view,decide}', 127),
  ('deputy.station-folders', 'deputy', '/deputy/station-folders', 'فولدرات المحطة', null, '{view}', 128),
  ('deputy.data-analysis', 'deputy', '/deputy/data-analysis', 'تحليل البيانات', null, '{view}', 129),
  ('deputy.rewards', 'deputy', '/deputy/rewards', 'المكافآت', null, '{view,create}', 130),
  ('deputy.approvals', 'deputy', '/deputy/approvals', 'طلبات الموافقة', null, '{view,decide}', 131),
  ('deputy.procedures', 'deputy', '/deputy/procedures', 'الإجراءات', null, '{view,execute}', 132),
  ('deputy.behavior', 'deputy', '/deputy/behavior', 'تقارير سلوك الموظفين', null, '{view,export}', 133),
  ('ops-room', 'ops-room', '/ops-room', 'الرئيسية', null, '{view}', 134),
  ('ops-room.operations-data', 'ops-room', '/ops-room/operations-data', 'بيانات وتقارير العمليات', null, '{view,edit,export}', 135),
  ('ops-room.station-daily', 'ops-room', '/ops-room/station-daily', 'التقرير اليومي للمحطة', null, '{view,create,export}', 136),
  ('ops-room.station-fleet', 'ops-room', '/ops-room/station-fleet', 'أسطول المحطة التحويلية', null, '{view,create,edit}', 137),
  ('ops-room.station-outbound', 'ops-room', '/ops-room/station-outbound', 'متابعة خروج آليات المحطة', null, '{view,execute}', 138),
  ('ops-room.vehicles-database', 'ops-room', '/ops-room/vehicles-database', 'قاعدة بيانات الآليات', null, '{view,create,edit,export}', 139),
  ('ops-room.vehicles-archive', 'ops-room', '/ops-room/vehicles-archive', 'أرشيف الآليات', null, '{view,delete}', 140),
  ('ops-room.gps', 'ops-room', '/ops-room/gps', 'بيانات أجهزة GPS', null, '{view,edit,execute,export}', 141),
  ('ops-room.gbs-containers', 'ops-room', '/ops-room/gbs-containers', 'GBS الحاويات', null, '{view,edit}', 142),
  ('ops-room.attendance', 'ops-room', '/ops-room/attendance', 'الحضوريات', null, '{view,edit,decide,export}', 143),
  ('ops-room.store', 'ops-room', '/ops-room/store', 'المخزن', null, '{view,create,edit,execute}', 144),
  ('ops-room.campaigns', 'ops-room', '/ops-room/campaigns', 'متابعة الحملات', null, '{view,create,export}', 145),
  ('ops-room.citizen-complaints', 'ops-room', '/ops-room/citizen-complaints', 'استقبال الشكاوى', null, '{view,execute,delete}', 146),
  ('ops-room.disclosures', 'ops-room', '/ops-room/disclosures', 'الكشوفات', null, '{view,create,decide}', 147),
  ('ops-room.advances', 'ops-room', '/ops-room/advances', 'السلف', null, '{view,create}', 148),
  ('ops-room.contractor-headcounts', 'ops-room', '/ops-room/contractor-headcounts', 'حضوريات العمال', null, '{view,decide}', 149),
  ('ops-room.leaves', 'ops-room', '/ops-room/leaves', 'طلبات الإجازة', null, '{view,decide}', 150),
  ('ops-room.live-tracking', 'ops-room', '/ops-room/live-tracking', 'البث المباشر', null, '{view}', 151),
  ('ops-room.live-tracking.data', 'ops-room', '/ops-room/live-tracking/data', 'بيانات البث المباشر', null, '{view}', 152),
  ('complaints', 'complaints', '/complaints', 'الرئيسية', null, '{view}', 153),
  ('complaints.karrada-sector', 'complaints', '/complaints/karrada-sector', 'قاطع الكرادة', null, '{view,create,edit}', 154),
  ('complaints.zaafaraniya-sector', 'complaints', '/complaints/zaafaraniya-sector', 'قاطع الزعفرانية', null, '{view,create,edit}', 155),
  ('complaints.assignment', 'complaints', '/complaints/assignment', 'فرز وإسناد الشكاوى', null, '{view,create,edit}', 156),
  ('complaints.processing', 'complaints', '/complaints/processing', 'معالجة الشكاوى', null, '{view,decide,execute}', 157),
  ('complaints.templates', 'complaints', '/complaints/templates', 'القوالب', null, '{view,edit}', 158),
  ('complaints.data', 'complaints', '/complaints/data', 'بيانات الشكاوى', null, '{view,export}', 159),
  ('complaints.database', 'complaints', '/complaints/database', 'قاعدة بيانات الشكاوى', null, '{view,export}', 160),
  ('complaints.pages-contact-settings', 'complaints', '/complaints/pages-contact-settings', 'إعدادات الصفحات والتواصل', null, '{view,edit}', 161),
  ('complaints.archive', 'complaints', '/complaints/archive', 'أرشيف الشكاوى', null, '{view,execute,delete}', 162),
  ('complaints.technical-support', 'complaints', '/complaints/technical-support', 'الدعم الفني', null, '{view,create}', 163),
  ('media', 'media', '/media', 'الرئيسية', null, '{view}', 164),
  ('media.karrada-sector', 'media', '/media/karrada-sector', 'قاطع الكرادة', null, '{view,create}', 165),
  ('media.zaafaraniya-sector', 'media', '/media/zaafaraniya-sector', 'الزعفرانية', null, '{view,create}', 166),
  ('media.zaafaraniya-folder', 'media', '/media/zaafaraniya-folder', 'فولدر الزعفرانية', null, '{view,create,export}', 167),
  ('media.karrada-folder', 'media', '/media/karrada-folder', 'فولدر الكرادة', null, '{view,create,export}', 168),
  ('media.design-templates', 'media', '/media/design-templates', 'قوالب التصميم', null, '{view,create,edit,delete}', 169),
  ('media.archive', 'media', '/media/archive', 'الأرشيف', null, '{view,delete}', 170),
  ('central-garage', 'central-garage', '/central-garage', 'الرئيسية', null, '{view}', 171),
  ('central-garage.drivers-dispatch', 'central-garage', '/central-garage/drivers-dispatch', 'انطلاقية السائقين', null, '{view,create,execute}', 172),
  ('central-garage.maintenance-coordination', 'central-garage', '/central-garage/maintenance-coordination', 'تنسيق حركات الصيانة', null, '{view,create,decide,execute}', 173),
  ('central-garage.vehicles-database', 'central-garage', '/central-garage/vehicles-database', 'قاعدة بيانات الآليات', null, '{view,create,edit}', 174),
  ('central-garage.fuel', 'central-garage', '/central-garage/fuel', 'الوقود', null, '{view,create}', 175),
  ('central-garage.fuel.gas-oil', 'central-garage', '/central-garage/fuel/gas-oil', 'الكاز', 'central-garage.fuel', '{view,create}', 176),
  ('central-garage.fuel.hydraulic', 'central-garage', '/central-garage/fuel/hydraulic', 'الهيدروليك', 'central-garage.fuel', '{view,create}', 177),
  ('central-garage.fuel.grease', 'central-garage', '/central-garage/fuel/grease', 'الدهن', 'central-garage.fuel', '{view,create}', 178),
  ('central-garage.fuel.c-oil', 'central-garage', '/central-garage/fuel/c-oil', 'C-Oil', 'central-garage.fuel', '{view,create}', 179),
  ('central-garage.employees', 'central-garage', '/central-garage/employees', 'الموظفون', null, '{view,edit}', 180),
  ('central-garage.requests', 'central-garage', '/central-garage/requests', 'الطلبات', null, '{view,create}', 181),
  ('central-garage.procedures', 'central-garage', '/central-garage/procedures', 'الإجراءات', null, '{view,create,execute}', 182),
  ('central-garage.disclosures', 'central-garage', '/central-garage/disclosures', 'الكشوفات', null, '{view,create}', 183),
  ('central-garage.reports', 'central-garage', '/central-garage/reports', 'تقارير الكراج', null, '{view,export}', 184),
  ('central-garage.archive', 'central-garage', '/central-garage/archive', 'الأرشيف', null, '{view,delete}', 185),
  ('follow-up', 'follow-up', '/follow-up', 'الرئيسية', null, '{view}', 186),
  ('follow-up.containers', 'follow-up', '/follow-up/containers', 'متابعة الحاويات', null, '{view,edit}', 187),
  ('follow-up.workers', 'follow-up', '/follow-up/workers', 'متابعة العمال', null, '{view,edit}', 188)
on conflict (key) do update set portal = excluded.portal, path = excluded.path, label = excluded.label, parent_key = excluded.parent_key, actions = excluded.actions, sort = excluded.sort;
delete from public.permission_units where key not in ('employee', 'employee.attendance', 'employee.photos', 'hr', 'hr.recruitment', 'hr.hire-requests', 'hr.employees', 'hr.attendance', 'hr.leaves', 'hr.biometric', 'hr.org', 'hr.behavior', 'manager', 'manager.team', 'manager.request', 'manager.leaves', 'manager.breakdown', 'manager.vehicle-trips', 'manager.support', 'manager.gbs-containers', 'manager.complaints', 'manager.citizen-complaints', 'manager.photos', 'manager.archive', 'finance', 'finance.reports', 'finance.payroll', 'finance.contractor-wages', 'finance.advances', 'finance.purchases', 'finance.budget', 'finance.announcements', 'it', 'it.user-management', 'it.user-management.list', 'it.user-management.create', 'it.user-management.approval-chains', 'it.user-management.approval-performance', 'it.approvals', 'it.user-management.disclosure-types', 'it.user-management.maintenance-workshops', 'it.database', 'it.database.tables', 'it.branches', 'it.permissions', 'it.integrations', 'it.integrations.biometric', 'it.integrations.biometric.unmatched', 'it.integrations.biometric.attendance-audit', 'it.integrations.gps', 'it.integrations.gps-health', 'it.integrations.hr-policy', 'it.integrations.auto-deductions', 'it.integrations.advances', 'it.integrations.live-tracking', 'it.notification-policies', 'it.updates', 'it.archive', 'it.central-garage-approvals', 'it.cold-archive', 'it.data-retention', 'it.console', 'it.devops', 'it.devops.git', 'it.devops.database', 'it.devops.tests', 'it.devops.hosting', 'it.devops.status', 'admin', 'admin.reports', 'admin.announcements', 'admin.approvals', 'admin.approval-performance', 'admin.procedures', 'admin.disclosures', 'field-ops', 'field-ops.requests', 'field-ops.sectors', 'field-ops.reports', 'field-ops.notify', 'field-ops.procedures', 'field-ops.my-requests', 'admin-ops', 'admin-ops.requests', 'admin-ops.reports', 'admin-ops.notify', 'admin-ops.procedures', 'admin-ops.disclosures', 'admin-ops.contractors', 'admin-ops.my-requests', 'maintenance', 'maintenance.purchases', 'maintenance.inventory', 'maintenance.vehicle-cases', 'maintenance.employees', 'maintenance.requests', 'maintenance.procedures', 'maintenance.archive', 'transfer-station', 'transfer-station.weights', 'transfer-station.weights.log', 'transfer-station.saksat', 'transfer-station.carrier', 'transfer-station.vehicle-movements', 'transfer-station.employees', 'transfer-station.requests', 'transfer-station.procedures', 'transfer-station.disclosures', 'transfer-station.fines', 'transfer-station.archive', 'executive', 'executive.reports', 'executive.announcements', 'executive.approvals', 'executive.procedures', 'executive.receivables', 'executive.gps-payments', 'executive.rewards', 'executive.events', 'executive.behavior', 'deputy', 'deputy.reports', 'deputy.announcements', 'deputy.statements', 'deputy.deductions', 'deputy.rented-tax', 'deputy.overtime', 'deputy.sector-supplies', 'deputy.station-folders', 'deputy.data-analysis', 'deputy.rewards', 'deputy.approvals', 'deputy.procedures', 'deputy.behavior', 'ops-room', 'ops-room.operations-data', 'ops-room.station-daily', 'ops-room.station-fleet', 'ops-room.station-outbound', 'ops-room.vehicles-database', 'ops-room.vehicles-archive', 'ops-room.gps', 'ops-room.gbs-containers', 'ops-room.attendance', 'ops-room.store', 'ops-room.campaigns', 'ops-room.citizen-complaints', 'ops-room.disclosures', 'ops-room.advances', 'ops-room.contractor-headcounts', 'ops-room.leaves', 'ops-room.live-tracking', 'ops-room.live-tracking.data', 'complaints', 'complaints.karrada-sector', 'complaints.zaafaraniya-sector', 'complaints.assignment', 'complaints.processing', 'complaints.templates', 'complaints.data', 'complaints.database', 'complaints.pages-contact-settings', 'complaints.archive', 'complaints.technical-support', 'media', 'media.karrada-sector', 'media.zaafaraniya-sector', 'media.zaafaraniya-folder', 'media.karrada-folder', 'media.design-templates', 'media.archive', 'central-garage', 'central-garage.drivers-dispatch', 'central-garage.maintenance-coordination', 'central-garage.vehicles-database', 'central-garage.fuel', 'central-garage.fuel.gas-oil', 'central-garage.fuel.hydraulic', 'central-garage.fuel.grease', 'central-garage.fuel.c-oil', 'central-garage.employees', 'central-garage.requests', 'central-garage.procedures', 'central-garage.disclosures', 'central-garage.reports', 'central-garage.archive', 'follow-up', 'follow-up.containers', 'follow-up.workers');
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
