-- ═══════════════════════════════════════════════════════════════
-- 00144 · نظام الإجازات والزمنيات المتكامل + سياسة الحضور القابلة للتخصيص
--   ① hr_policy: سياسة واحدة قابلة للتخصيص من بوابة التطوير المركزية (رصيد سنوي افتراضي، الزمنيات، شرائح الاستقطاع حسب نقص الدقائق،
--      الإضافي → رصيد، عتبات التنبيه). ② hr_leave_types: أنواع الإجازات والزمنيات (مدفوعة/تستهلك الرصيد/تستقطع من الراتب).
--   ③ hr_leave_ledger: دفتر رصيد الإجازات (منح سنوي، تعديل HR بسبب، استهلاك إجازة، استهلاك زمنية = 1/N يوم، رصيد إضافي).
--   ④ الطلبات: hr_leave_request/decide/cancel — الموافقة للمدير المباشر حصراً (أو مدير المدير عند غيابه)، مع إشعارات.
--   ⑤ الحضور: نقص الدقائق = ساعات الشفت − المنجز − الزمنية المعتمدة؛ استقطاع مقترح بالشرائح (يُعتمد/يُلغى من غرفة العمليات بسبب)؛
--      الإضافي بعد نهاية الشفت يتراكم ويتحول أياماً في الرصيد عند تصدير الشهر. ⑥ تنبيهات تكرار التأخير/النقص/الغياب للمدير وHR.
--   ⑦ التصدير والمالية: الاستقطاع التلقائي (دقائق/أيام) يُدرج في كشف الشهر ويُحسب بأجر الدقيقة/اليوم.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- ① السياسة
-- ─────────────────────────────────────────────
create table if not exists public.hr_policy (
  id          smallint primary key default 1 check (id = 1),
  settings    jsonb not null,
  updated_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now()
);
insert into public.hr_policy (id, settings) values (1, jsonb_build_object(
  'annual_leave_days_default', 30,
  'balance_mode', 'annual_upfront',            -- annual_upfront | monthly_accrual
  'carry_over', true,
  'carry_over_max_days', 30,
  'permits_per_leave_day', 3,                  -- كل N زمنيات مدفوعة = يوم من الرصيد
  'permit_max_minutes', 180,
  'permits_max_per_month', null,
  'grace_minutes_default', 15,
  'deduction_basis', 'shortfall',              -- shortfall: نقص الدقائق اليومي (ساعات الشفت − المنجز − الزمنية المعتمدة)
  'deduction_tiers', jsonb_build_array(
    jsonb_build_object('from', 1,  'to', 15,  'minutes', 0),
    jsonb_build_object('from', 16, 'to', 25,  'minutes', 20),
    jsonb_build_object('from', 26, 'to', 35,  'minutes', 60),
    jsonb_build_object('from', 36, 'to', 60,  'minutes', 120),
    jsonb_build_object('from', 61, 'to', 120, 'day_fraction', 0.5),
    jsonb_build_object('from', 121, 'to', null, 'day_fraction', 1)),
  'absent_day_deduction_days', 1,
  'incomplete_punch_as_absent', false,
  'overtime_enabled', true,
  'overtime_min_block_minutes', 30,            -- لا يُحتسب إضافي أقل من هذا في اليوم
  'overtime_minutes_per_leave_day', null,      -- null = ساعات الشفت نفسه
  'alert_late_days_per_month', 3,
  'alert_shortfall_minutes_per_month', 120,
  'alert_absent_days_per_month', 2,
  'alert_balance_low_days', 2
)) on conflict (id) do nothing;
alter table public.hr_policy enable row level security;
create policy "hr_policy: قراءة" on public.hr_policy for select to authenticated using (true);

create or replace function app.hr_policy() returns jsonb
language sql stable security definer set search_path = public as $$ select settings from public.hr_policy where id = 1 $$;
create or replace function app.hr_policy_int(p_key text, p_default int) returns int
language sql stable security definer set search_path = public, app as $$ select coalesce(nullif(app.hr_policy() ->> p_key, '')::int, p_default) $$;
create or replace function app.hr_policy_num(p_key text, p_default numeric) returns numeric
language sql stable security definer set search_path = public, app as $$ select coalesce(nullif(app.hr_policy() ->> p_key, '')::numeric, p_default) $$;
create or replace function app.hr_policy_bool(p_key text, p_default boolean) returns boolean
language sql stable security definer set search_path = public, app as $$ select coalesce(nullif(app.hr_policy() ->> p_key, '')::boolean, p_default) $$;

create or replace function public.hr_policy_get() returns jsonb
language sql stable security definer set search_path = public, app as $$ select app.hr_policy() $$;
grant execute on function public.hr_policy_get() to authenticated;

create or replace function public.hr_policy_set(p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare cur jsonb; t jsonb; i int := 0; prev_to int := 0;
begin
  if not app.has_role(array['it_admin', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'HR_POLICY_INVALID'; end if;
  cur := app.hr_policy() || p_patch;
  if (cur ->> 'annual_leave_days_default')::numeric < 0 or (cur ->> 'permits_per_leave_day')::int < 1 or (cur ->> 'permit_max_minutes')::int < 15 then raise exception 'HR_POLICY_INVALID'; end if;
  if (cur ->> 'balance_mode') not in ('annual_upfront', 'monthly_accrual') then raise exception 'HR_POLICY_INVALID'; end if;
  -- الشرائح: متتالية بلا فجوات تبدأ من 1، آخرها مفتوح (to = null)، ولكل شريحة minutes أو day_fraction
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
grant execute on function public.hr_policy_set(jsonb) to authenticated;

-- تطبيق الشرائح على نقص الدقائق → (دقائق استقطاع، كسور يوم)
create or replace function app.hr_tier_for(p_shortfall int, p_shift_minutes int, out o_minutes int, out o_days numeric)
language plpgsql stable security definer set search_path = public, app as $$
declare t jsonb;
begin
  o_minutes := 0; o_days := 0;
  if coalesce(p_shortfall, 0) <= 0 then return; end if;
  for t in select * from jsonb_array_elements(app.hr_policy() -> 'deduction_tiers') loop
    if p_shortfall >= (t ->> 'from')::int and ((t ->> 'to') is null or p_shortfall <= (t ->> 'to')::int) then
      o_minutes := coalesce((t ->> 'minutes')::int, 0);
      o_days := coalesce((t ->> 'day_fraction')::numeric, 0);
      return;
    end if;
  end loop;
end$$;

-- ─────────────────────────────────────────────
-- ② أنواع الإجازات والزمنيات
-- ─────────────────────────────────────────────
create table if not exists public.hr_leave_types (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,
  name                text not null,
  kind                text not null check (kind in ('leave', 'time_permit')),
  is_paid             boolean not null default true,           -- غير المدفوع يُستقطع من الراتب
  consumes_balance    boolean not null default false,          -- يخصم من رصيد الإجازات (إجازة: أيام، زمنية: 1/N يوم)
  deduction_days_per_day numeric(4, 2) not null default 1,     -- للإجازة غير المدفوعة: أيام تُستقطع لكل يوم
  requires_attachment boolean not null default false,
  max_days_per_request int,
  max_minutes         int,                                     -- للزمنيات: يتجاوز إعداد السياسة إن حُدد
  sort_order          int not null default 100,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);
alter table public.hr_leave_types enable row level security;
create policy "hr_leave_types: قراءة" on public.hr_leave_types for select to authenticated using (true);
insert into public.hr_leave_types (code, name, kind, is_paid, consumes_balance, requires_attachment, sort_order) values
  ('annual',        'إجازة اعتيادية (مدفوعة)', 'leave', true,  true,  false, 10),
  ('sick',          'إجازة مرضية',            'leave', true,  false, true,  20),
  ('emergency',     'إجازة طارئة',             'leave', true,  true,  false, 30),
  ('unpaid',        'إجازة بدون راتب',         'leave', false, false, false, 40),
  ('official',      'مهمة رسمية / إيفاد',      'leave', true,  false, false, 50),
  ('permit_paid',   'زمنية مدفوعة',            'time_permit', true,  true,  false, 60),
  ('permit_unpaid', 'زمنية بدون راتب',         'time_permit', false, false, false, 70),
  ('permit_official','زمنية عمل رسمي',         'time_permit', true,  false, false, 80)
on conflict (code) do nothing;

create or replace function public.hr_leave_type_save(p jsonb) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare v_id uuid := nullif(p ->> 'id', '')::uuid;
begin
  if not app.has_role(array['it_admin', 'hr_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if coalesce(trim(p ->> 'name'), '') = '' or coalesce(trim(p ->> 'code'), '') = '' then raise exception 'HR_LEAVE_TYPE_INVALID'; end if;
  if (p ->> 'kind') not in ('leave', 'time_permit') then raise exception 'HR_LEAVE_TYPE_INVALID'; end if;
  if v_id is null then
    insert into public.hr_leave_types (code, name, kind, is_paid, consumes_balance, deduction_days_per_day, requires_attachment, max_days_per_request, max_minutes, sort_order, is_active)
    values (lower(trim(p ->> 'code')), trim(p ->> 'name'), p ->> 'kind', coalesce((p ->> 'is_paid')::boolean, true), coalesce((p ->> 'consumes_balance')::boolean, false),
      coalesce((p ->> 'deduction_days_per_day')::numeric, 1), coalesce((p ->> 'requires_attachment')::boolean, false), (p ->> 'max_days_per_request')::int, (p ->> 'max_minutes')::int,
      coalesce((p ->> 'sort_order')::int, 100), coalesce((p ->> 'is_active')::boolean, true)) returning id into v_id;
  else
    update public.hr_leave_types set name = trim(p ->> 'name'), is_paid = coalesce((p ->> 'is_paid')::boolean, is_paid), consumes_balance = coalesce((p ->> 'consumes_balance')::boolean, consumes_balance),
      deduction_days_per_day = coalesce((p ->> 'deduction_days_per_day')::numeric, deduction_days_per_day), requires_attachment = coalesce((p ->> 'requires_attachment')::boolean, requires_attachment),
      max_days_per_request = (p ->> 'max_days_per_request')::int, max_minutes = (p ->> 'max_minutes')::int, sort_order = coalesce((p ->> 'sort_order')::int, sort_order),
      is_active = coalesce((p ->> 'is_active')::boolean, is_active)
    where id = v_id;
    if not found then raise exception 'HR_NOT_FOUND'; end if;
  end if;
  return v_id;
end$$;
grant execute on function public.hr_leave_type_save(jsonb) to authenticated;

-- ─────────────────────────────────────────────
-- ③ دفتر رصيد الإجازات
-- ─────────────────────────────────────────────
create table if not exists public.hr_leave_ledger (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  year        int not null,
  kind        text not null check (kind in ('grant', 'adjust', 'consume', 'permit', 'overtime', 'carry_over', 'reversal')),
  days        numeric(7, 3) not null,                  -- موجب يزيد الرصيد، سالب ينقصه
  leave_id    uuid references public.hr_leaves (id) on delete set null,
  period_month date,
  note        text,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_hr_ledger_emp_year on public.hr_leave_ledger (employee_id, year);
create unique index if not exists hr_ledger_overtime_month_uq on public.hr_leave_ledger (employee_id, period_month) where kind = 'overtime';
create unique index if not exists hr_ledger_grant_year_uq on public.hr_leave_ledger (employee_id, year) where kind = 'grant';
alter table public.hr_leave_ledger enable row level security;
create policy "hr_ledger: قراءة" on public.hr_leave_ledger for select to authenticated
  using (app.has_role(array['hr_officer', 'super_admin']) or employee_id = (select app.current_employee_id())
         or employee_id in (select id from public.employees where manager_id = (select app.current_employee_id())));

-- الرصيد المستحق للسنة (يُنشئ منحة السنة تلقائياً عند أول طلب إن لم توجد)
create or replace function app.hr_ensure_grant(p_employee uuid, p_year int) returns void
language plpgsql security definer set search_path = public, app as $$
declare v_default numeric := app.hr_policy_num('annual_leave_days_default', 30); v_hire date; v_days numeric; v_prev numeric; v_max numeric;
begin
  if exists (select 1 from public.hr_leave_ledger where employee_id = p_employee and year = p_year and kind = 'grant') then return; end if;
  select hire_date into v_hire from public.employees where id = p_employee;
  v_days := v_default;
  -- الموظف المعيّن خلال السنة: نسبة الأشهر المتبقية
  if v_hire is not null and extract(year from v_hire)::int = p_year then
    v_days := round(v_default * (13 - extract(month from v_hire)) / 12, 2);
  end if;
  insert into public.hr_leave_ledger (employee_id, year, kind, days, note) values (p_employee, p_year, 'grant', v_days, 'منحة السنة ' || p_year);
  -- ترحيل المتبقي من السنة السابقة
  if app.hr_policy_bool('carry_over', true) and exists (select 1 from public.hr_leave_ledger where employee_id = p_employee and year = p_year - 1) then
    select coalesce(sum(days), 0) into v_prev from public.hr_leave_ledger where employee_id = p_employee and year = p_year - 1;
    v_max := app.hr_policy_num('carry_over_max_days', 30);
    if v_prev > 0 then
      insert into public.hr_leave_ledger (employee_id, year, kind, days, note) values (p_employee, p_year, 'carry_over', least(v_prev, v_max), 'مرحّل من ' || (p_year - 1));
    end if;
  end if;
end$$;

create or replace function public.hr_leave_balance(p_employee uuid, p_year int default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare y int := coalesce(p_year, extract(year from current_date)::int); r record; v_mode text := app.hr_policy() ->> 'balance_mode'; v_accrued numeric;
begin
  if not (app.has_role(array['hr_officer', 'finance_officer', 'ops_room', 'super_admin']) or p_employee = app.current_employee_id()
          or exists (select 1 from public.employees where id = p_employee and manager_id = app.current_employee_id())) then
    raise exception 'HR_FORBIDDEN';
  end if;
  perform app.hr_ensure_grant(p_employee, y);
  select
    coalesce(sum(days) filter (where kind = 'grant'), 0) as granted,
    coalesce(sum(days) filter (where kind = 'carry_over'), 0) as carried,
    coalesce(sum(days) filter (where kind = 'adjust'), 0) as adjusted,
    coalesce(-sum(days) filter (where kind = 'consume'), 0) as used_leave,
    coalesce(-sum(days) filter (where kind = 'permit'), 0) as used_permits_days,
    coalesce(sum(days) filter (where kind = 'overtime'), 0) as overtime_days,
    coalesce(sum(days) filter (where kind = 'reversal'), 0) as reversed,
    coalesce(sum(days), 0) as remaining
  into r from public.hr_leave_ledger where employee_id = p_employee and year = y;
  v_accrued := r.granted;
  if v_mode = 'monthly_accrual' and y = extract(year from current_date)::int then
    v_accrued := round(r.granted * extract(month from current_date) / 12, 2);
  end if;
  return jsonb_build_object('year', y, 'granted', r.granted, 'accrued', v_accrued, 'carried', r.carried, 'adjusted', r.adjusted,
    'used_leave_days', r.used_leave, 'used_permit_days', r.used_permits_days,
    'permits_count', (select count(*) from public.hr_leave_ledger where employee_id = p_employee and year = y and kind = 'permit'),
    'overtime_days', r.overtime_days, 'reversed', r.reversed,
    'remaining', case when v_mode = 'monthly_accrual' then r.remaining - (r.granted - v_accrued) else r.remaining end,
    'permits_per_leave_day', app.hr_policy_int('permits_per_leave_day', 3));
end$$;
grant execute on function public.hr_leave_balance(uuid, int) to authenticated;

-- HR: تحديد المنحة السنوية لموظف (تستبدل منحة السنة) أو تعديل بسبب
create or replace function public.hr_balance_set_grant(p_employee uuid, p_year int, p_days numeric, p_note text default null) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.has_role(array['hr_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if p_days is null or p_days < 0 or p_days > 365 then raise exception 'HR_AMOUNT_INVALID'; end if;
  insert into public.hr_leave_ledger (employee_id, year, kind, days, note, created_by) values (p_employee, p_year, 'grant', p_days, coalesce(p_note, 'منحة السنة ' || p_year), auth.uid())
  on conflict (employee_id, year) where kind = 'grant' do update set days = excluded.days, note = excluded.note, created_by = auth.uid(), created_at = now();
end$$;
grant execute on function public.hr_balance_set_grant(uuid, int, numeric, text) to authenticated;

create or replace function public.hr_balance_adjust(p_employee uuid, p_year int, p_days numeric, p_reason text) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare v uuid;
begin
  if not app.has_role(array['hr_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if p_days is null or p_days = 0 or abs(p_days) > 365 then raise exception 'HR_AMOUNT_INVALID'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
  perform app.hr_ensure_grant(p_employee, p_year);
  insert into public.hr_leave_ledger (employee_id, year, kind, days, note, created_by) values (p_employee, p_year, 'adjust', p_days, trim(p_reason), auth.uid()) returning id into v;
  return v;
end$$;
grant execute on function public.hr_balance_adjust(uuid, int, numeric, text) to authenticated;

-- ─────────────────────────────────────────────
-- ④ الطلبات والموافقة (المدير المباشر حصراً)
-- ─────────────────────────────────────────────
alter table public.hr_leaves
  add column if not exists leave_type_id   uuid references public.hr_leave_types (id),
  add column if not exists days            numeric(6, 2) not null default 0,
  add column if not exists minutes         int not null default 0,
  add column if not exists requested_by    uuid references auth.users (id) on delete set null,
  add column if not exists manager_id      uuid references public.employees (id) on delete set null,   -- المدير المباشر وقت الطلب
  add column if not exists decided_by      uuid references auth.users (id) on delete set null,
  add column if not exists decided_at      timestamptz,
  add column if not exists decision_note   text,
  add column if not exists attachment_path text,
  add column if not exists cancelled_reason text;
create index if not exists idx_hr_leaves_manager_status on public.hr_leaves (manager_id, status);

-- المدير المباشر يقرأ طلبات فريقه مباشرة أيضاً
create policy "hr_leaves: قراءة المدير المباشر" on public.hr_leaves for select to authenticated
  using (manager_id = (select app.current_employee_id()) or employee_id in (select id from public.employees where manager_id = (select app.current_employee_id())));
-- مرفقات الطلب في employee-documents: المدير المباشر يقرأ مجلد موظفيه
create policy "storage-docs: قراءة المدير المباشر" on storage.objects for select to authenticated
  using (bucket_id = 'employee-documents' and (storage.foldername(name))[1] in
         (select e.id::text from public.employees e where e.manager_id = (select app.current_employee_id())));

create or replace function app.hr_manager_user(p_employee uuid) returns uuid
language sql stable security definer set search_path = public as
$$ select m.user_id from public.employees e join public.employees m on m.id = e.manager_id where e.id = p_employee $$;

-- هل المستخدم الحالي هو من يحق له البتّ؟ المدير المباشر، أو مدير المدير إن كان المباشر في إجازة معتمدة اليوم / منتهية خدمته / بلا حساب
create or replace function app.hr_can_decide(p_leave uuid) returns boolean
language plpgsql stable security definer set search_path = public, app as $$
declare l record; me uuid := app.current_employee_id(); mgr record;
begin
  if app.has_role(array['super_admin']) then return true; end if;
  if me is null then return false; end if;
  select * into l from public.hr_leaves where id = p_leave;
  if l.manager_id is null then return false; end if;
  if l.manager_id = me then return true; end if;
  select * into mgr from public.employees where id = l.manager_id;
  if mgr.manager_id = me and (mgr.user_id is null or mgr.employment_status = 'terminated'
     or exists (select 1 from public.hr_leaves x where x.employee_id = mgr.id and x.status = 'approved' and x.kind = 'leave' and current_date between x.start_date and x.end_date)) then
    return true;
  end if;
  return false;
end$$;

create or replace function app.hr_notify(p_user uuid, p_title text, p_body text, p_link text, p_key text, p_type text default 'info') returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications (user_id, title, body, type, category, priority, link, dedupe_key)
  values (p_user, p_title, p_body, p_type, 'system', 'normal', p_link, p_key)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
exception when others then null; -- الإشعار لا يُفشل العملية
end$$;

create or replace function public.hr_leave_request(p_employee uuid, p_type uuid, p_start date, p_end date, p_start_time time default null, p_end_time time default null,
                                                   p_notes text default null, p_attachment text default null)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare lt record; e record; me uuid := app.current_employee_id(); v_days numeric; v_minutes int := 0; v_id uuid; bal jsonb; v_cost numeric; v_max_min int; v_month_permits int;
begin
  select * into lt from public.hr_leave_types where id = p_type and is_active;
  if not found then raise exception 'HR_LEAVE_TYPE_INVALID'; end if;
  select * into e from public.employees where id = p_employee and archived_at is null;
  if not found or e.employment_status = 'terminated' then raise exception 'HR_NOT_FOUND'; end if;
  -- من يحق له الإدخال: الموظف نفسه، مديره المباشر، HR
  if not (app.has_role(array['hr_officer', 'super_admin']) or p_employee = me or (me is not null and e.manager_id = me)) then raise exception 'HR_FORBIDDEN'; end if;
  if e.manager_id is null and not app.has_role(array['hr_officer', 'super_admin']) then raise exception 'HR_NO_MANAGER'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'HR_DATE_INVALID'; end if;
  if lt.requires_attachment and coalesce(p_attachment, '') = '' then raise exception 'HR_ATTACHMENT_REQUIRED'; end if;

  if lt.kind = 'time_permit' then
    if p_start <> p_end or p_start_time is null or p_end_time is null or p_end_time <= p_start_time then raise exception 'HR_PERMIT_TIME_INVALID'; end if;
    v_minutes := extract(epoch from (p_end_time - p_start_time))::int / 60;
    v_max_min := coalesce(lt.max_minutes, app.hr_policy_int('permit_max_minutes', 180));
    if v_minutes > v_max_min then raise exception 'HR_PERMIT_TOO_LONG'; end if;
    if (app.hr_policy() ->> 'permits_max_per_month') is not null then
      select count(*) into v_month_permits from public.hr_leaves where employee_id = p_employee and kind = 'time_permit' and status in ('pending', 'approved')
        and date_trunc('month', start_date) = date_trunc('month', p_start);
      if v_month_permits >= app.hr_policy_int('permits_max_per_month', 999) then raise exception 'HR_PERMIT_MONTH_LIMIT'; end if;
    end if;
    v_days := 0;
  else
    v_days := (p_end - p_start) + 1;
    if lt.max_days_per_request is not null and v_days > lt.max_days_per_request then raise exception 'HR_LEAVE_TOO_LONG'; end if;
  end if;
  -- تداخل مع طلب قائم
  if exists (select 1 from public.hr_leaves x where x.employee_id = p_employee and x.status in ('pending', 'approved') and x.start_date <= p_end and x.end_date >= p_start
             and (x.kind = 'leave' or lt.kind = 'leave' or (x.start_time < p_end_time and x.end_time > p_start_time))) then
    raise exception 'HR_LEAVE_OVERLAP';
  end if;
  -- كفاية الرصيد
  if lt.consumes_balance then
    bal := public.hr_leave_balance(p_employee, extract(year from p_start)::int);
    v_cost := case when lt.kind = 'leave' then v_days else round(1.0 / app.hr_policy_int('permits_per_leave_day', 3), 3) end;
    if (bal ->> 'remaining')::numeric < v_cost then raise exception 'HR_BALANCE_INSUFFICIENT'; end if;
  end if;

  insert into public.hr_leaves (employee_id, kind, leave_type, leave_type_id, start_date, end_date, start_time, end_time, status, notes, created_by, requested_by, manager_id, days, minutes, attachment_path)
  values (p_employee, lt.kind, lt.code, lt.id, p_start, p_end, p_start_time, p_end_time, 'pending', nullif(trim(coalesce(p_notes, '')), ''), auth.uid(), auth.uid(), e.manager_id, v_days, v_minutes, p_attachment)
  returning id into v_id;

  perform app.hr_notify(app.hr_manager_user(p_employee), 'طلب ' || lt.name || ' بانتظار موافقتك',
    e.full_name || ' · ' || p_start::text || case when lt.kind = 'leave' and p_end <> p_start then ' → ' || p_end::text else '' end
      || case when lt.kind = 'time_permit' then ' · ' || to_char(p_start_time, 'HH24:MI') || '–' || to_char(p_end_time, 'HH24:MI') else '' end,
    '/manager/leaves', 'leave_req:' || v_id::text, 'info');
  return v_id;
end$$;
grant execute on function public.hr_leave_request(uuid, uuid, date, date, time, time, text, text) to authenticated;

create or replace function public.hr_leave_decide(p_leave uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public, app as $$
declare l record; lt record; e record; v_cost numeric; bal jsonb; d date;
begin
  select * into l from public.hr_leaves where id = p_leave;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  if l.status <> 'pending' then raise exception 'HR_LEAVE_NOT_PENDING'; end if;
  if not app.hr_can_decide(p_leave) then raise exception 'HR_FORBIDDEN'; end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
  select * into lt from public.hr_leave_types where id = l.leave_type_id;
  select * into e from public.employees where id = l.employee_id;

  if p_approve then
    if app.hr_month_locked(l.start_date) then raise exception 'HR_MONTH_LOCKED'; end if;
    if lt.consumes_balance then
      bal := public.hr_leave_balance(l.employee_id, extract(year from l.start_date)::int);
      v_cost := case when lt.kind = 'leave' then l.days else round(1.0 / app.hr_policy_int('permits_per_leave_day', 3), 3) end;
      if (bal ->> 'remaining')::numeric < v_cost then raise exception 'HR_BALANCE_INSUFFICIENT'; end if;
      insert into public.hr_leave_ledger (employee_id, year, kind, days, leave_id, note, created_by)
      values (l.employee_id, extract(year from l.start_date)::int, case when lt.kind = 'leave' then 'consume' else 'permit' end, -v_cost, l.id, lt.name || ' ' || l.start_date::text, auth.uid());
    end if;
    update public.hr_leaves set status = 'approved', approved_by = auth.uid(), approved_at = now(), decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), '') where id = p_leave;
    -- إعادة احتساب أيام الحضور المتأثرة (غير المعدّلة يدوياً)
    d := l.start_date; while d <= l.end_date loop perform app.hr_evaluate_day(l.employee_id, d); d := d + 1; end loop;
    perform app.hr_refresh_alerts(l.employee_id, l.start_date); perform app.hr_refresh_alerts(l.employee_id, l.end_date);
    perform app.hr_notify(e.user_id, 'تمت الموافقة على ' || lt.name, l.start_date::text || case when l.end_date <> l.start_date then ' → ' || l.end_date::text else '' end, '/employee/requests', 'leave_dec:' || l.id::text, 'success');
  else
    update public.hr_leaves set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = trim(p_note) where id = p_leave;
    perform app.hr_notify(e.user_id, 'رُفض طلب ' || lt.name, trim(p_note), '/employee/requests', 'leave_dec:' || l.id::text, 'warning');
  end if;
end$$;
grant execute on function public.hr_leave_decide(uuid, boolean, text) to authenticated;

create or replace function public.hr_leave_cancel(p_leave uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public, app as $$
declare l record; me uuid := app.current_employee_id(); d date;
begin
  select * into l from public.hr_leaves where id = p_leave;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  if l.status not in ('pending', 'approved') then raise exception 'HR_LEAVE_NOT_PENDING'; end if;
  if not (app.has_role(array['hr_officer', 'super_admin']) or l.employee_id = me or app.hr_can_decide(p_leave)) then raise exception 'HR_FORBIDDEN'; end if;
  if l.status = 'approved' then
    if not app.has_role(array['hr_officer', 'super_admin']) and l.start_date <= current_date then raise exception 'HR_LEAVE_STARTED'; end if;
    if app.hr_month_locked(l.start_date) then raise exception 'HR_MONTH_LOCKED'; end if;
    if coalesce(trim(p_reason), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
    -- إرجاع الرصيد
    insert into public.hr_leave_ledger (employee_id, year, kind, days, leave_id, note, created_by)
    select employee_id, year, 'reversal', -days, leave_id, 'إلغاء: ' || trim(p_reason), auth.uid() from public.hr_leave_ledger where leave_id = p_leave and kind in ('consume', 'permit');
  end if;
  update public.hr_leaves set status = 'cancelled', cancelled_reason = nullif(trim(coalesce(p_reason, '')), ''), decided_by = coalesce(decided_by, auth.uid()) where id = p_leave;
  if l.status = 'approved' then
    d := l.start_date; while d <= l.end_date loop perform app.hr_evaluate_day(l.employee_id, d); d := d + 1; end loop;
    perform app.hr_refresh_alerts(l.employee_id, l.start_date); perform app.hr_refresh_alerts(l.employee_id, l.end_date);
  end if;
end$$;
grant execute on function public.hr_leave_cancel(uuid, text) to authenticated;

-- قوائم: طلباتي · صندوق المدير · كل الطلبات (HR)
create or replace function public.hr_leaves_list(p_scope text, p_from date default null, p_to date default null, p_status text default null, p_department uuid default null, p_search text default null, p_limit int default 500)
returns table(id uuid, employee_id uuid, employee_number text, full_name text, department_name text, kind text, type_code text, type_name text, is_paid boolean, consumes_balance boolean,
              start_date date, end_date date, start_time time, end_time time, days numeric, minutes int, status text, notes text, attachment_path text,
              manager_id uuid, manager_name text, requested_by uuid, decided_at timestamptz, decision_note text, cancelled_reason text, created_at timestamptz, can_decide boolean)
language plpgsql stable security definer set search_path = public, app as $$
declare me uuid := app.current_employee_id();
begin
  return query
  select l.id, l.employee_id, e.employee_number, e.full_name, d.name, l.kind, lt.code, lt.name, lt.is_paid, lt.consumes_balance,
         l.start_date, l.end_date, l.start_time, l.end_time, l.days, l.minutes, l.status, l.notes, l.attachment_path,
         l.manager_id, m.full_name, l.requested_by, l.decided_at, l.decision_note, l.cancelled_reason, l.created_at,
         (l.status = 'pending' and app.hr_can_decide(l.id))
  from public.hr_leaves l
  join public.employees e on e.id = l.employee_id
  left join public.employees m on m.id = l.manager_id
  left join public.departments d on d.id = e.department_id
  left join public.hr_leave_types lt on lt.id = l.leave_type_id
  where case p_scope
          when 'mine' then l.employee_id = me
          when 'team' then (l.manager_id = me or e.manager_id = me or app.hr_can_decide(l.id))
          else app.has_role(array['hr_officer', 'ops_room', 'finance_officer', 'super_admin']) end
    and (p_from is null or l.end_date >= p_from) and (p_to is null or l.start_date <= p_to)
    and (p_status is null or l.status = p_status)
    and (p_department is null or e.department_id = p_department or e.department_id in (select dd.id from public.departments dd where dd.parent_id = p_department))
    and (p_search is null or e.full_name ilike '%' || p_search || '%' or e.employee_number ilike '%' || p_search || '%')
  order by (l.status = 'pending') desc, l.created_at desc
  limit p_limit;
end$$;
grant execute on function public.hr_leaves_list(text, date, date, text, uuid, text, int) to authenticated;

-- ─────────────────────────────────────────────
-- ⑤ الحضور: نقص الدقائق، الإضافي، الاستقطاع المقترح
-- ─────────────────────────────────────────────
alter table public.hr_attendance_days
  add column if not exists required_minutes  int not null default 0,
  add column if not exists permit_minutes    int not null default 0,
  add column if not exists shortfall_minutes int not null default 0,
  add column if not exists overtime_minutes  int not null default 0,
  add column if not exists proposed_deduction_minutes int not null default 0,
  add column if not exists proposed_deduction_days    numeric(5, 2) not null default 0,
  add column if not exists deduction_reason  text,
  add column if not exists deduction_waived  boolean not null default false,
  add column if not exists waive_reason      text,
  add column if not exists waived_by         uuid references auth.users (id) on delete set null;

alter table public.hr_attendance_audit drop constraint if exists hr_attendance_audit_action_check;
alter table public.hr_attendance_audit add constraint hr_attendance_audit_action_check
  check (action in ('edit', 'deduction_add', 'deduction_delete', 'export', 'approve', 'reset_auto', 'waive', 'unwaive'));

-- حساب مشتقات اليوم (تُستدعى بعد أي تحديث للصف — تلقائي أو يدوي)
create or replace function app.hr_compute_day_metrics(p_employee uuid, p_date date) returns void
language plpgsql security definer set search_path = public, app as $$
declare a record; v_req int := 0; v_permit int := 0; v_short int := 0; v_ot int := 0; v_min int := 0; v_days numeric := 0; v_reason text := null;
        lt record; v_ot_block int := app.hr_policy_int('overtime_min_block_minutes', 30); v_grace int;
begin
  select * into a from public.hr_attendance_days where employee_id = p_employee and work_date = p_date;
  if not found then return; end if;
  if a.expected_in is not null and a.expected_out is not null then v_req := floor(extract(epoch from (a.expected_out - a.expected_in)) / 60)::int; end if;
  -- الزمنيات المعتمدة (مدفوعة أو رسمية تُخصم من النقص؛ غير المدفوعة تبقى نقصاً وتُستقطع)
  select coalesce(sum(l.minutes), 0) into v_permit from public.hr_leaves l join public.hr_leave_types t on t.id = l.leave_type_id
  where l.employee_id = p_employee and l.status = 'approved' and l.kind = 'time_permit' and l.start_date = p_date and t.is_paid;
  -- نوع الإجازة المعتمدة (إن وُجدت)
  select t.* into lt from public.hr_leaves l join public.hr_leave_types t on t.id = l.leave_type_id
  where l.employee_id = p_employee and l.status = 'approved' and l.kind = 'leave' and p_date between l.start_date and l.end_date limit 1;

  if a.is_rest_day or v_req = 0 then
    v_short := 0;
  elsif a.status = 'leave' then
    v_short := 0;
    if lt.id is not null and not lt.is_paid then v_days := lt.deduction_days_per_day; v_reason := lt.name; end if;
  elsif a.status = 'absent' then
    v_short := v_req;
    v_days := app.hr_policy_num('absent_day_deduction_days', 1); v_reason := 'غياب بلا إجازة معتمدة';
  elsif a.status = 'incomplete' then
    v_short := 0;
    if app.hr_policy_bool('incomplete_punch_as_absent', false) then v_days := app.hr_policy_num('absent_day_deduction_days', 1); v_reason := 'بصمة ناقصة تُعامل كغياب'; end if;
  else
    v_short := greatest(0, v_req - a.worked_minutes - v_permit);
    if v_short > 0 then
      select o_minutes, o_days into v_min, v_days from app.hr_tier_for(v_short, v_req);
      if v_min > 0 or v_days > 0 then v_reason := 'نقص ' || v_short || ' دقيقة عن ساعات الشفت'; end if;
    end if;
    -- الإضافي: بعد نهاية الشفت فقط، وبعد تعويض أي نقص
    if app.hr_policy_bool('overtime_enabled', true) and a.check_out is not null and a.expected_out is not null and v_short = 0 then
      v_ot := greatest(0, a.worked_minutes + v_permit - v_req);
      if v_ot < v_ot_block then v_ot := 0; end if;
    end if;
  end if;
  -- السماحية الافتراضية للنقص إن لم تُغطِّها الشرائح (شريحة 1..grace = 0 موجودة أصلاً؛ هذا احتياط)
  v_grace := app.hr_policy_int('grace_minutes_default', 15);
  if a.status in ('present', 'late', 'early_leave', 'time_permit') and v_short <= v_grace then v_min := 0; v_days := 0; v_reason := null; end if;

  update public.hr_attendance_days set required_minutes = v_req, permit_minutes = v_permit, shortfall_minutes = v_short, overtime_minutes = v_ot,
    proposed_deduction_minutes = v_min, proposed_deduction_days = v_days, deduction_reason = v_reason
  where employee_id = p_employee and work_date = p_date;
end$$;

-- ربط الحساب بالاشتقاق التلقائي واليدوي عبر trigger
create or replace function app.trg_hr_day_metrics() returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  perform app.hr_compute_day_metrics(new.employee_id, new.work_date);
  return null;
end$$;
drop trigger if exists trg_hr_attendance_metrics on public.hr_attendance_days;
create trigger trg_hr_attendance_metrics after insert or update of check_in, check_out, worked_minutes, status, expected_in, expected_out, is_rest_day
  on public.hr_attendance_days for each row execute function app.trg_hr_day_metrics();

-- غرفة العمليات: إلغاء/إعادة الاستقطاع المقترح بسبب
create or replace function public.ops_deduction_waive(p_employee uuid, p_date date, p_waive boolean, p_reason text) returns void
language plpgsql security definer set search_path = public, app as $$
declare a record;
begin
  if not app.has_role(array['ops_room', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
  if app.hr_month_locked(p_date) then raise exception 'HR_MONTH_LOCKED'; end if;
  select * into a from public.hr_attendance_days where employee_id = p_employee and work_date = p_date;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  update public.hr_attendance_days set deduction_waived = p_waive, waive_reason = case when p_waive then trim(p_reason) else null end, waived_by = case when p_waive then auth.uid() else null end
  where id = a.id;
  insert into public.hr_attendance_audit (employee_id, work_date, action, before, after, reason, actor)
  values (p_employee, p_date, case when p_waive then 'waive' else 'unwaive' end,
    jsonb_build_object('proposed_minutes', a.proposed_deduction_minutes, 'proposed_days', a.proposed_deduction_days, 'waived', a.deduction_waived),
    jsonb_build_object('waived', p_waive), trim(p_reason), auth.uid());
  perform app.hr_refresh_alerts(p_employee, p_date);
end$$;
grant execute on function public.ops_deduction_waive(uuid, date, boolean, text) to authenticated;

-- قائمة الحضور: الأعمدة الجديدة
drop function if exists public.ops_attendance_list(date, date, uuid, uuid, text, text, int);
create or replace function public.ops_attendance_list(p_from date, p_to date, p_branch uuid default null, p_department uuid default null, p_status text default null, p_search text default null, p_limit int default 3000)
returns table(id uuid, employee_id uuid, employee_number text, full_name text, department_id uuid, department_name text, branch_id uuid, branch_name text, job_title text,
  work_date date, shift_name text, expected_in timestamptz, expected_out timestamptz, check_in timestamptz, check_out timestamptz,
  late_minutes int, early_minutes int, worked_minutes int, is_rest_day boolean, status text, source text, edited_by uuid, edited_at timestamptz, edit_reason text,
  required_minutes int, permit_minutes int, shortfall_minutes int, overtime_minutes int, proposed_deduction_minutes int, proposed_deduction_days numeric,
  deduction_reason text, deduction_waived boolean, waive_reason text)
language sql stable security definer set search_path = public, app as $$
  select a.id, a.employee_id, e.employee_number, e.full_name, e.department_id, d.name, e.branch_id, b.name, e.job_title,
         a.work_date, a.shift_name, a.expected_in, a.expected_out, a.check_in, a.check_out, a.late_minutes, a.early_minutes, a.worked_minutes, a.is_rest_day,
         a.status, a.source, a.edited_by, a.edited_at, a.edit_reason,
         a.required_minutes, a.permit_minutes, a.shortfall_minutes, a.overtime_minutes, a.proposed_deduction_minutes, a.proposed_deduction_days,
         a.deduction_reason, a.deduction_waived, a.waive_reason
  from public.hr_attendance_days a
  join public.employees e on e.id = a.employee_id
  left join public.departments d on d.id = e.department_id
  left join public.branches b on b.id = e.branch_id
  where app.has_role(array['hr_officer', 'ops_room', 'finance_officer', 'super_admin'])
    and a.work_date between p_from and p_to
    and (p_branch is null or e.branch_id = p_branch)
    and (p_department is null or e.department_id = p_department or e.department_id in (select id from public.departments where parent_id = p_department))
    and (p_status is null or a.status = p_status)
    and (p_search is null or e.full_name ilike '%' || p_search || '%' or e.employee_number ilike '%' || p_search || '%')
  order by a.work_date desc, d.name, e.full_name
  limit p_limit
$$;
grant execute on function public.ops_attendance_list(date, date, uuid, uuid, text, text, int) to authenticated;

-- ─────────────────────────────────────────────
-- ⑥ التنبيهات
-- ─────────────────────────────────────────────
create table if not exists public.hr_alerts (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees (id) on delete cascade,
  period_month date not null,
  kind         text not null check (kind in ('late_repeat', 'shortfall', 'absent_repeat', 'balance_low')),
  value        numeric not null,
  threshold    numeric not null,
  details      text,
  acknowledged_by uuid references auth.users (id) on delete set null,
  acknowledged_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (employee_id, period_month, kind)
);
alter table public.hr_alerts enable row level security;
create policy "hr_alerts: قراءة" on public.hr_alerts for select to authenticated
  using (app.has_role(array['hr_officer', 'ops_room', 'super_admin'])
         or employee_id in (select id from public.employees where manager_id = (select app.current_employee_id())));

create or replace function app.hr_refresh_alerts(p_employee uuid, p_month date) returns void
language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; s record; e record; v_thr numeric; v_new boolean;
begin
  select count(*) filter (where status = 'late') as late_days, coalesce(sum(shortfall_minutes) filter (where not deduction_waived), 0) as shortfall,
         count(*) filter (where status = 'absent') as absent_days
  into s from public.hr_attendance_days where employee_id = p_employee and work_date between m and (m + interval '1 month - 1 day')::date;
  select * into e from public.employees where id = p_employee;
  -- late_repeat
  v_thr := app.hr_policy_num('alert_late_days_per_month', 3);
  if s.late_days >= v_thr then
    insert into public.hr_alerts (employee_id, period_month, kind, value, threshold, details) values (p_employee, m, 'late_repeat', s.late_days, v_thr, 'تأخر ' || s.late_days || ' أيام هذا الشهر')
    on conflict (employee_id, period_month, kind) do update set value = excluded.value, details = excluded.details, updated_at = now() returning (xmax = 0) into v_new;
    if v_new then perform app.hr_notify(app.hr_manager_user(p_employee), 'تنبيه: تكرار تأخير', e.full_name || ' تأخر ' || s.late_days || ' أيام في ' || to_char(m, 'YYYY-MM'), '/manager/leaves', 'hr_alert:late:' || p_employee || ':' || m, 'warning'); end if;
  else delete from public.hr_alerts where employee_id = p_employee and period_month = m and kind = 'late_repeat'; end if;
  -- shortfall
  v_thr := app.hr_policy_num('alert_shortfall_minutes_per_month', 120);
  if s.shortfall >= v_thr then
    insert into public.hr_alerts (employee_id, period_month, kind, value, threshold, details) values (p_employee, m, 'shortfall', s.shortfall, v_thr, 'نقص ' || s.shortfall || ' دقيقة عن ساعات العمل هذا الشهر')
    on conflict (employee_id, period_month, kind) do update set value = excluded.value, details = excluded.details, updated_at = now() returning (xmax = 0) into v_new;
    if v_new then perform app.hr_notify(app.hr_manager_user(p_employee), 'تنبيه: نقص ساعات عمل', e.full_name || ' نقص ' || s.shortfall || ' دقيقة في ' || to_char(m, 'YYYY-MM'), '/manager/leaves', 'hr_alert:short:' || p_employee || ':' || m, 'warning'); end if;
  else delete from public.hr_alerts where employee_id = p_employee and period_month = m and kind = 'shortfall'; end if;
  -- absent_repeat
  v_thr := app.hr_policy_num('alert_absent_days_per_month', 2);
  if s.absent_days >= v_thr then
    insert into public.hr_alerts (employee_id, period_month, kind, value, threshold, details) values (p_employee, m, 'absent_repeat', s.absent_days, v_thr, 'غاب ' || s.absent_days || ' أيام بلا إجازة هذا الشهر')
    on conflict (employee_id, period_month, kind) do update set value = excluded.value, details = excluded.details, updated_at = now() returning (xmax = 0) into v_new;
    if v_new then perform app.hr_notify(app.hr_manager_user(p_employee), 'تنبيه: تكرار غياب', e.full_name || ' غاب ' || s.absent_days || ' أيام في ' || to_char(m, 'YYYY-MM'), '/manager/leaves', 'hr_alert:abs:' || p_employee || ':' || m, 'error'); end if;
  else delete from public.hr_alerts where employee_id = p_employee and period_month = m and kind = 'absent_repeat'; end if;
end$$;

-- الاشتقاق الجماعي يحدّث التنبيهات لأشهر النطاق
create or replace function public.hr_attendance_evaluate(p_from date, p_to date, p_employee uuid default null)
returns integer language plpgsql security definer set search_path = public, app as $$
declare d date; e record; n int := 0; m date;
begin
  if not app.has_role(array['hr_officer', 'ops_room', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then raise exception 'HR_RANGE_INVALID'; end if;
  if exists (select 1 from public.hr_month_exports x where x.status = 'approved'
             and x.period_month between date_trunc('month', p_from)::date and date_trunc('month', p_to)::date) then
    raise exception 'HR_MONTH_LOCKED';
  end if;
  for e in select id from public.employees
           where archived_at is null and (p_employee is null or id = p_employee)
             and (employment_status <> 'terminated' or (terminated_at is not null and terminated_at >= p_from)) loop
    d := p_from;
    while d <= p_to loop perform app.hr_evaluate_day(e.id, d); d := d + 1; n := n + 1; end loop;
    m := date_trunc('month', p_from)::date;
    while m <= p_to loop perform app.hr_refresh_alerts(e.id, m); m := (m + interval '1 month')::date; end loop;
  end loop;
  return n;
end$$;

create or replace function public.hr_alerts_list(p_month date default null, p_only_open boolean default true)
returns table(id uuid, employee_id uuid, employee_number text, full_name text, department_name text, manager_name text, period_month date, kind text, value numeric, threshold numeric, details text, acknowledged_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public, app as $$
  select a.id, a.employee_id, e.employee_number, e.full_name, d.name, m.full_name, a.period_month, a.kind, a.value, a.threshold, a.details, a.acknowledged_at, a.created_at
  from public.hr_alerts a join public.employees e on e.id = a.employee_id
  left join public.departments d on d.id = e.department_id left join public.employees m on m.id = e.manager_id
  where (app.has_role(array['hr_officer', 'ops_room', 'super_admin']) or e.manager_id = app.current_employee_id())
    and (p_month is null or a.period_month = date_trunc('month', p_month)::date)
    and (not p_only_open or a.acknowledged_at is null)
  order by a.created_at desc
$$;
grant execute on function public.hr_alerts_list(date, boolean) to authenticated;

create or replace function public.hr_alert_ack(p_alert uuid) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  update public.hr_alerts a set acknowledged_by = auth.uid(), acknowledged_at = now()
  where a.id = p_alert and (app.has_role(array['hr_officer', 'ops_room', 'super_admin']) or exists (select 1 from public.employees e where e.id = a.employee_id and e.manager_id = app.current_employee_id()));
  if not found then raise exception 'HR_FORBIDDEN'; end if;
end$$;
grant execute on function public.hr_alert_ack(uuid) to authenticated;

-- ─────────────────────────────────────────────
-- ⑦ التصدير والمالية: الاستقطاع التلقائي + رصيد الإضافي
-- ─────────────────────────────────────────────
alter table public.hr_month_export_rows
  add column if not exists auto_deduction_minutes int not null default 0,
  add column if not exists auto_deduction_days numeric(6, 2) not null default 0,
  add column if not exists shift_minutes int not null default 480,
  add column if not exists overtime_minutes int not null default 0,
  add column if not exists shortfall_minutes int not null default 0,
  add column if not exists auto_deduction_amount numeric(14, 2) not null default 0;

drop function if exists app.hr_month_summary(date);
create or replace function app.hr_month_summary(p_month date)
returns table(employee_id uuid, working_days int, days_present int, days_late int, days_absent int, days_incomplete int,
              days_leave int, late_minutes int, early_minutes int, ded_amount numeric, ded_days numeric, ded_reasons text,
              auto_minutes int, auto_days numeric, shift_minutes int, overtime_minutes int, shortfall_minutes int)
language sql stable security definer set search_path = public, app as $$
  with m as (select date_trunc('month', p_month)::date as f, (date_trunc('month', p_month) + interval '1 month - 1 day')::date as t),
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
      coalesce(sum(a.shortfall_minutes), 0)::int as shortfall_minutes
    from public.hr_attendance_days a, m where a.work_date between m.f and m.t group by a.employee_id),
  ded as (
    select d.employee_id, sum(d.amount) as amt, sum(d.days) as dys, string_agg(d.reason, ' · ' order by d.created_at) as reasons
    from public.hr_attendance_deductions d, m where d.period_month = m.f group by d.employee_id)
  select coalesce(att.employee_id, ded.employee_id), coalesce(att.working_days, 0), coalesce(att.days_present, 0), coalesce(att.days_late, 0),
         coalesce(att.days_absent, 0), coalesce(att.days_incomplete, 0), coalesce(att.days_leave, 0), coalesce(att.late_minutes, 0),
         coalesce(att.early_minutes, 0), coalesce(ded.amt, 0), coalesce(ded.dys, 0), ded.reasons,
         coalesce(att.auto_minutes, 0), coalesce(att.auto_days, 0), coalesce(att.shift_minutes, 480), coalesce(att.overtime_minutes, 0), coalesce(att.shortfall_minutes, 0)
  from att full join ded on ded.employee_id = att.employee_id
$$;

-- رصيد الإضافي للشهر (idempotent لكل موظف/شهر) — يُستدعى عند التصدير
create or replace function app.hr_overtime_credit(p_month date) returns int
language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; r record; n int := 0; per_day int; v_days numeric;
begin
  if not app.hr_policy_bool('overtime_enabled', true) then return 0; end if;
  for r in select employee_id, overtime_minutes, shift_minutes from app.hr_month_summary(m) where overtime_minutes > 0 loop
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

create or replace function public.ops_month_export(p_month date)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date; v_id uuid; v_ver int; n int;
begin
  if not app.has_role(array['ops_room', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if app.hr_month_locked(m) then raise exception 'HR_MONTH_LOCKED'; end if;
  if m > date_trunc('month', current_date)::date then raise exception 'HR_MONTH_FUTURE'; end if;
  update public.hr_month_exports set status = 'superseded' where period_month = m and status = 'exported';
  select coalesce(max(version), 0) + 1 into v_ver from public.hr_month_exports where period_month = m;
  insert into public.hr_month_exports (period_month, version, exported_by) values (m, v_ver, auth.uid()) returning id into v_id;
  perform app.hr_overtime_credit(m);

  insert into public.hr_month_export_rows (export_id, employee_id, employee_number, full_name, department_name, branch_name, job_title, contract_type,
    working_days, days_present, days_late, days_absent, days_incomplete, days_leave, late_minutes, early_minutes,
    ops_deduction_amount, ops_deduction_days, ops_deduction_reasons,
    auto_deduction_minutes, auto_deduction_days, shift_minutes, overtime_minutes, shortfall_minutes, auto_deduction_amount,
    pay_type, base_salary, daily_rate, allowances_total, fixed_deductions_total, proposed_net, final_net)
  select v_id, e.id, e.employee_number, e.full_name, d.name, b.name, e.job_title, e.contract_type,
    s.working_days, s.days_present, s.days_late, s.days_absent, s.days_incomplete, s.days_leave, s.late_minutes, s.early_minutes,
    s.ded_amount, s.ded_days, s.ded_reasons,
    s.auto_minutes, s.auto_days, s.shift_minutes, s.overtime_minutes, s.shortfall_minutes, calc.auto_amount,
    sp.pay_type, sp.base_salary, sp.daily_rate, al.total, fd.total, calc.net, calc.net
  from public.employees e
  join app.hr_month_summary(m) s on s.employee_id = e.id
  left join public.departments d on d.id = e.department_id
  left join public.branches b on b.id = e.branch_id
  left join public.employee_salary_profiles sp on sp.employee_id = e.id and sp.status = 'defined'
  cross join lateral (select coalesce(sum((v.value)::numeric), 0) as total from jsonb_each_text(coalesce(sp.allowances, '{}'::jsonb)) v where v.value ~ '^\d+(\.\d+)?$') al
  cross join lateral (select coalesce(sum((v.value)::numeric), 0) as total from jsonb_each_text(coalesce(sp.fixed_deductions, '{}'::jsonb)) v where v.value ~ '^\d+(\.\d+)?$') fd
  cross join lateral (
    select day_rate, minute_rate,
      round(minute_rate * s.auto_minutes + day_rate * s.auto_days, 2) as auto_amount,
      case
        when sp.employee_id is null then null
        when sp.pay_type = 'daily' then greatest(0, sp.daily_rate * greatest(0, s.days_present - s.ded_days) - s.ded_amount - round(minute_rate * s.auto_minutes + day_rate * s.auto_days, 2))
        else greatest(0, sp.base_salary + al.total - fd.total - s.ded_amount - round(day_rate * s.ded_days, 2) - round(minute_rate * s.auto_minutes + day_rate * s.auto_days, 2))
      end as net
    from (select
      case when sp.employee_id is null then 0 when sp.pay_type = 'daily' then sp.daily_rate else round(sp.base_salary / 30, 4) end as day_rate,
      case when sp.employee_id is null then 0 when sp.pay_type = 'daily' then round(sp.daily_rate / greatest(s.shift_minutes, 1), 4) else round(sp.base_salary / 30 / greatest(s.shift_minutes, 1), 4) end as minute_rate
    ) rates) calc;
  get diagnostics n = row_count;
  update public.hr_month_exports set rows_count = n where id = v_id;
  insert into public.hr_attendance_audit (employee_id, work_date, action, after, reason, actor)
  select e.employee_id, m, 'export', jsonb_build_object('export_id', v_id, 'version', v_ver), 'تصدير الشهر إلى المالية', auth.uid()
  from public.hr_month_export_rows e where e.export_id = v_id;
  return v_id;
end$$;

drop function if exists public.ops_month_export_rows(uuid);
create or replace function public.ops_month_export_rows(p_export uuid)
returns table(id uuid, employee_id uuid, employee_number text, full_name text, department_name text, branch_name text, job_title text, contract_type text,
  working_days int, days_present int, days_late int, days_absent int, days_incomplete int, days_leave int, late_minutes int, early_minutes int,
  ops_deduction_amount numeric, ops_deduction_days numeric, ops_deduction_reasons text,
  auto_deduction_minutes int, auto_deduction_days numeric, overtime_minutes int, shortfall_minutes int)
language sql stable security definer set search_path = public, app as $$
  select r.id, r.employee_id, r.employee_number, r.full_name, r.department_name, r.branch_name, r.job_title, r.contract_type,
         r.working_days, r.days_present, r.days_late, r.days_absent, r.days_incomplete, r.days_leave, r.late_minutes, r.early_minutes,
         r.ops_deduction_amount, r.ops_deduction_days, r.ops_deduction_reasons, r.auto_deduction_minutes, r.auto_deduction_days, r.overtime_minutes, r.shortfall_minutes
  from public.hr_month_export_rows r
  where app.has_role(array['hr_officer', 'ops_room', 'finance_officer', 'super_admin']) and r.export_id = p_export
  order by r.department_name, r.full_name
$$;
grant execute on function public.ops_month_export_rows(uuid) to authenticated;

drop function if exists public.finance_payroll_sheet(date);
create or replace function public.finance_payroll_sheet(p_month date)
returns table(export_id uuid, export_version int, export_status text, exported_at timestamptz, row_id uuid, employee_id uuid, employee_number text, full_name text,
  department_name text, branch_name text, job_title text, contract_type text, working_days int, days_present int, days_late int, days_absent int, days_incomplete int,
  days_leave int, late_minutes int, early_minutes int, ops_deduction_amount numeric, ops_deduction_days numeric, ops_deduction_reasons text,
  auto_deduction_minutes int, auto_deduction_days numeric, auto_deduction_amount numeric, overtime_minutes int, shortfall_minutes int,
  pay_type text, base_salary numeric, daily_rate numeric, allowances_total numeric, fixed_deductions_total numeric, proposed_net numeric, final_net numeric, finance_note text)
language sql stable security definer set search_path = public, app as $$
  with x as (select * from public.hr_month_exports where period_month = date_trunc('month', p_month)::date and status in ('exported', 'approved') order by version desc limit 1)
  select x.id, x.version, x.status, x.exported_at, r.id, r.employee_id, r.employee_number, r.full_name, r.department_name, r.branch_name, r.job_title, r.contract_type,
         r.working_days, r.days_present, r.days_late, r.days_absent, r.days_incomplete, r.days_leave, r.late_minutes, r.early_minutes,
         r.ops_deduction_amount, r.ops_deduction_days, r.ops_deduction_reasons,
         r.auto_deduction_minutes, r.auto_deduction_days, r.auto_deduction_amount, r.overtime_minutes, r.shortfall_minutes,
         r.pay_type, r.base_salary, r.daily_rate, r.allowances_total, r.fixed_deductions_total,
         r.proposed_net, r.final_net, r.finance_note
  from x join public.hr_month_export_rows r on r.export_id = x.id
  where app.has_role(array['finance_officer', 'super_admin'])
  order by r.department_name, r.full_name
$$;
grant execute on function public.finance_payroll_sheet(date) to authenticated;

-- لوحة HR: طلبات معلقة وتنبيهات مفتوحة
create or replace function public.hr_leaves_dashboard() returns jsonb
language sql stable security definer set search_path = public, app as $$
  select case when app.has_role(array['hr_officer', 'ops_room', 'super_admin']) then jsonb_build_object(
    'pending', (select count(*) from public.hr_leaves where status = 'pending'),
    'approved_today', (select count(*) from public.hr_leaves where status = 'approved' and current_date between start_date and end_date),
    'open_alerts', (select count(*) from public.hr_alerts where acknowledged_at is null),
    'permits_this_month', (select count(*) from public.hr_leaves where status = 'approved' and kind = 'time_permit' and date_trunc('month', start_date) = date_trunc('month', current_date))
  ) else null end
$$;
grant execute on function public.hr_leaves_dashboard() to authenticated;

-- بطاقة الموظف الحالي (لبوابتي الموظف والمدير): من أنا ومن مديري المباشر
create or replace function public.hr_my_employee() returns jsonb
language sql stable security definer set search_path = public, app as $$
  select jsonb_build_object('id', e.id, 'full_name', e.full_name, 'employee_number', e.employee_number, 'job_title', e.job_title,
    'department_id', e.department_id, 'department_name', d.name, 'manager_id', e.manager_id, 'manager_name', m.full_name,
    'has_biometric', e.biometric_pin is not null, 'reports_count', (select count(*) from public.employees r where r.manager_id = e.id and r.archived_at is null and r.employment_status <> 'terminated'))
  from public.employees e left join public.departments d on d.id = e.department_id left join public.employees m on m.id = e.manager_id
  where e.id = app.current_employee_id()
$$;
grant execute on function public.hr_my_employee() to authenticated;
