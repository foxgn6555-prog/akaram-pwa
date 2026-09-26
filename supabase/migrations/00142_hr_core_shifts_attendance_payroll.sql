-- ═══════════════════════════════════════════════════════════════
-- 00142 · منظومة الموارد البشرية الكاملة:
--   ① الشفتات المرنة (قوالب + تجاوز لكل موظف بتاريخ سريان)
--   ② ملف الموظف العراقي الكامل + المستمسكات (bucket خاص) + إنهاء الخدمات
--   ③ ملفات الرواتب — المالية فقط (HR ترى الحالة بلا أرقام) + إغلاق ثغرة payslips لـ HR
--   ④ الإجازات والزمنيات (عرض المعتمد؛ الدورة لاحقاً)
--   ⑤ الحضور اليومي المشتق من البصمة حسب الشفت (تأخير/خروج مبكر/غياب/ناقص/إجازة)
--   ⑥ تدقيق غرفة العمليات: تعديل بسبب + سجل + خصومات يدوية + تصدير الشهر (نسخة مجمّدة)
--   ⑦ كشف رواتب المالية: راتب مقترح قابل للتعديل + اعتماد يقفل الشهر
-- الأدوار: hr_officer · finance_officer · ops_room · super_admin
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- إعدادات HR (منطقة الشركة الزمنية لحدود اليوم)
-- ─────────────────────────────────────────────
create table if not exists public.hr_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
insert into public.hr_settings(key, value) values ('timezone_offset', '+03:00') on conflict (key) do nothing;
alter table public.hr_settings enable row level security;
create policy "hr_settings: قراءة للإدارات" on public.hr_settings for select to authenticated
  using (app.has_role(array['hr_officer', 'finance_officer', 'ops_room', 'super_admin']));
create policy "hr_settings: تعديل HR" on public.hr_settings for update to authenticated
  using (app.has_role(array['hr_officer', 'super_admin'])) with check (app.has_role(array['hr_officer', 'super_admin']));

create or replace function app.hr_tz() returns interval
language sql stable security definer set search_path = public as
$$ select coalesce((select value from public.hr_settings where key = 'timezone_offset'), '+03:00')::interval $$;

-- ─────────────────────────────────────────────
-- ① الشفتات
-- ─────────────────────────────────────────────
create table if not exists public.hr_shifts (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  start_time    time not null,
  end_time      time not null,                       -- إن كانت ≤ البداية فالشفت يعبر منتصف الليل
  grace_minutes integer not null default 10 check (grace_minutes between 0 and 180),
  work_days     smallint[] not null default '{0,1,2,3,4,5,6}', -- 0=الأحد … 6=السبت (لا عطل افتراضية)
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (cardinality(work_days) between 1 and 7)
);
alter table public.hr_shifts enable row level security;
create policy "hr_shifts: قراءة" on public.hr_shifts for select to authenticated
  using (app.has_role(array['hr_officer', 'finance_officer', 'ops_room', 'department_manager', 'super_admin']));
create policy "hr_shifts: إدارة HR" on public.hr_shifts for all to authenticated
  using (app.has_role(array['hr_officer', 'super_admin'])) with check (app.has_role(array['hr_officer', 'super_admin']));

insert into public.hr_shifts(name, start_time, end_time, grace_minutes) values
  ('صباحي', '08:00', '16:00', 10), ('مسائي', '16:00', '00:00', 10), ('ليلي', '00:00', '08:00', 10)
on conflict (name) do nothing;

-- إسناد الشفت للموظف بتاريخ سريان + تجاوزات اختيارية (الأوقات/السماحية/الأيام)
create table if not exists public.employee_shift_assignments (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employees (id) on delete cascade,
  shift_id       uuid not null references public.hr_shifts (id),
  effective_from date not null default current_date,
  start_override time,
  end_override   time,
  grace_override integer check (grace_override between 0 and 180),
  days_override  smallint[] check (days_override is null or cardinality(days_override) between 1 and 7),
  note           text,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (employee_id, effective_from)
);
create index if not exists idx_esa_emp_from on public.employee_shift_assignments (employee_id, effective_from desc);
alter table public.employee_shift_assignments enable row level security;
create policy "esa: قراءة" on public.employee_shift_assignments for select to authenticated
  using (app.has_role(array['hr_officer', 'finance_officer', 'ops_room', 'super_admin'])
         or employee_id = (select app.current_employee_id()));
create policy "esa: إدارة HR" on public.employee_shift_assignments for all to authenticated
  using (app.has_role(array['hr_officer', 'super_admin'])) with check (app.has_role(array['hr_officer', 'super_admin']));

-- الشفت الساري لموظف في يوم معيّن (بعد تطبيق التجاوزات)
create or replace function app.hr_effective_shift(p_employee uuid, p_date date)
returns table(shift_id uuid, shift_name text, start_time time, end_time time, grace_minutes integer, work_days smallint[])
language sql stable security definer set search_path = public as $$
  select s.id, s.name,
         coalesce(a.start_override, s.start_time), coalesce(a.end_override, s.end_time),
         coalesce(a.grace_override, s.grace_minutes), coalesce(a.days_override, s.work_days)
  from public.employee_shift_assignments a
  join public.hr_shifts s on s.id = a.shift_id
  where a.employee_id = p_employee and a.effective_from <= p_date
  order by a.effective_from desc limit 1
$$;

-- ─────────────────────────────────────────────
-- ② ملف الموظف الكامل + إنهاء الخدمة
-- ─────────────────────────────────────────────
alter table public.employees
  add column if not exists mother_name text,
  add column if not exists gender text check (gender in ('male', 'female')),
  add column if not exists birth_date date,
  add column if not exists birth_place text,
  add column if not exists marital_status text check (marital_status in ('single', 'married', 'divorced', 'widowed')),
  add column if not exists education text,
  add column if not exists national_id_number text,
  add column if not exists residence_card_number text,
  add column if not exists governorate text,
  add column if not exists address text,
  add column if not exists phone2 text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists blood_type text check (blood_type in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  add column if not exists contract_type text not null default 'monthly' check (contract_type in ('monthly', 'daily')),
  add column if not exists photo_path text,
  add column if not exists terminated_at date,
  add column if not exists termination_type text check (termination_type in ('resignation', 'dismissal', 'contract_end', 'retirement', 'death')),
  add column if not exists termination_reason text,
  add column if not exists termination_attachment_path text,
  add column if not exists terminated_by uuid references auth.users (id) on delete set null;

create unique index if not exists employees_national_id_uq on public.employees (national_id_number) where national_id_number is not null;

-- المستمسكات
create table if not exists public.employee_documents (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees (id) on delete cascade,
  doc_type     text not null check (doc_type in ('photo', 'national_id_front', 'national_id_back', 'residence_front', 'residence_back', 'other')),
  title        text,
  storage_path text not null unique,
  mime_type    text,
  size_bytes   integer,
  uploaded_by  uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_emp_docs_emp on public.employee_documents (employee_id);
alter table public.employee_documents enable row level security;
create policy "emp_docs: HR" on public.employee_documents for all to authenticated
  using (app.has_role(array['hr_officer', 'super_admin'])) with check (app.has_role(array['hr_officer', 'super_admin']));
create policy "emp_docs: الموظف يرى مستمسكاته" on public.employee_documents for select to authenticated
  using (employee_id = (select app.current_employee_id()));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('employee-documents', 'employee-documents', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;
create policy "emp docs storage: HR all" on storage.objects for all to authenticated
  using (bucket_id = 'employee-documents' and app.has_role(array['hr_officer', 'super_admin']))
  with check (bucket_id = 'employee-documents' and app.has_role(array['hr_officer', 'super_admin']));

-- ─────────────────────────────────────────────
-- ③ ملفات الرواتب — المالية فقط
-- ─────────────────────────────────────────────
create table if not exists public.employee_salary_profiles (
  employee_id      uuid primary key references public.employees (id) on delete cascade,
  status           text not null default 'pending' check (status in ('pending', 'defined')),
  pay_type         text not null default 'monthly' check (pay_type in ('monthly', 'daily')),
  base_salary      numeric(14, 2) not null default 0 check (base_salary >= 0),
  daily_rate       numeric(14, 2) not null default 0 check (daily_rate >= 0),
  allowances       jsonb not null default '{}'::jsonb,   -- {"نقل": 50000, ...}
  fixed_deductions jsonb not null default '{}'::jsonb,
  currency         text not null default 'IQD',
  notes            text,
  set_by           uuid references auth.users (id) on delete set null,
  set_at           timestamptz,
  updated_at       timestamptz not null default now()
);
alter table public.employee_salary_profiles enable row level security;
create policy "salary_profiles: المالية فقط" on public.employee_salary_profiles for all to authenticated
  using (app.has_role(array['finance_officer', 'super_admin'])) with check (app.has_role(array['finance_officer', 'super_admin']));

-- إغلاق ثغرة: HR كانت ترى/تدير قسائم الرواتب
drop policy if exists "payslips: قراءة للإدارات" on public.payslips;
drop policy if exists "payslips: إدارة بواسطة المالية" on public.payslips;
drop policy if exists "payrolls: قراءة للإدارات" on public.payrolls;
drop policy if exists "payrolls: إدارة بواسطة المالية" on public.payrolls;
create policy "payslips: المالية" on public.payslips for all to authenticated
  using (app.has_role(array['finance_officer', 'super_admin'])) with check (app.has_role(array['finance_officer', 'super_admin']));
create policy "payrolls: المالية" on public.payrolls for all to authenticated
  using (app.has_role(array['finance_officer', 'super_admin'])) with check (app.has_role(array['finance_officer', 'super_admin']));

-- إشعارات المالية (راتب جديد بانتظار التعريف / تسوية إنهاء خدمة)
create table if not exists public.finance_hr_notices (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  kind        text not null check (kind in ('salary_pending', 'termination_settlement')),
  payload     jsonb not null default '{}'::jsonb,
  is_done     boolean not null default false,
  created_at  timestamptz not null default now(),
  done_at     timestamptz,
  done_by     uuid references auth.users (id) on delete set null
);
alter table public.finance_hr_notices enable row level security;
create policy "finance_notices: المالية" on public.finance_hr_notices for all to authenticated
  using (app.has_role(array['finance_officer', 'super_admin'])) with check (app.has_role(array['finance_officer', 'super_admin']));

-- HR ترى حالة الراتب فقط (بلا أرقام)
create or replace function public.hr_salary_status(p_employee uuid)
returns text language sql stable security definer set search_path = public, app as $$
  select case when app.has_role(array['hr_officer', 'finance_officer', 'super_admin'])
              then coalesce((select status from public.employee_salary_profiles where employee_id = p_employee), 'pending')
              else null end
$$;

-- ─────────────────────────────────────────────
-- ④ الإجازات والزمنيات (البنية + عرض المعتمد)
-- ─────────────────────────────────────────────
create table if not exists public.hr_leaves (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees (id) on delete cascade,
  kind         text not null check (kind in ('leave', 'time_permit')),   -- إجازة أيام / زمنية ساعات
  leave_type   text not null default 'regular',                           -- اعتيادية/مرضية/بلا راتب…
  start_date   date not null,
  end_date     date not null,
  start_time   time,
  end_time     time,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  approved_by  uuid references auth.users (id) on delete set null,
  approved_at  timestamptz,
  notes        text,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  check (end_date >= start_date),
  check (kind = 'leave' or (start_time is not null and end_time is not null and start_date = end_date))
);
create index if not exists idx_hr_leaves_emp_dates on public.hr_leaves (employee_id, start_date, end_date);
alter table public.hr_leaves enable row level security;
create policy "hr_leaves: قراءة" on public.hr_leaves for select to authenticated
  using (app.has_role(array['hr_officer', 'finance_officer', 'ops_room', 'super_admin'])
         or employee_id = (select app.current_employee_id()));
create policy "hr_leaves: إدارة HR" on public.hr_leaves for all to authenticated
  using (app.has_role(array['hr_officer', 'super_admin'])) with check (app.has_role(array['hr_officer', 'super_admin']));

-- ─────────────────────────────────────────────
-- ⑤ الحضور اليومي حسب الشفت
-- ─────────────────────────────────────────────
create table if not exists public.hr_attendance_days (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.employees (id) on delete cascade,
  work_date       date not null,
  shift_name      text,
  expected_in     timestamptz,
  expected_out    timestamptz,
  check_in        timestamptz,
  check_out       timestamptz,
  late_minutes    integer not null default 0,
  early_minutes   integer not null default 0,
  worked_minutes  integer not null default 0,
  is_rest_day     boolean not null default false,
  status          text not null check (status in ('present', 'late', 'early_leave', 'absent', 'incomplete', 'leave', 'time_permit')),
  source          text not null default 'auto' check (source in ('auto', 'manual')),
  edited_by       uuid references auth.users (id) on delete set null,
  edited_at       timestamptz,
  edit_reason     text,
  updated_at      timestamptz not null default now(),
  unique (employee_id, work_date)
);
create index if not exists idx_hr_att_date on public.hr_attendance_days (work_date);
alter table public.hr_attendance_days enable row level security;
create policy "hr_att: قراءة" on public.hr_attendance_days for select to authenticated
  using (app.has_role(array['hr_officer', 'finance_officer', 'ops_room', 'super_admin'])
         or employee_id = (select app.current_employee_id()));
-- لا تعديل مباشر — عبر الدوال فقط

create or replace function app.hr_status_of(p_in timestamptz, p_out timestamptz, p_late int, p_early int, p_rest boolean)
returns text language sql immutable as $$
  select case
    when p_in is null and p_out is null then case when p_rest then 'present' else 'absent' end
    when p_in is null or p_out is null then 'incomplete'
    when p_late > 0 then 'late'
    when p_early > 0 then 'early_leave'
    else 'present' end
$$;

-- اشتقاق يوم واحد لموظف واحد (لا يلمس الصفوف المعدّلة يدوياً)
create or replace function app.hr_evaluate_day(p_employee uuid, p_date date)
returns void language plpgsql security definer set search_path = public, app as $$
declare
  sh record; tz interval := app.hr_tz();
  v_exp_in timestamptz; v_exp_out timestamptz; v_win_from timestamptz; v_win_to timestamptz;
  v_in timestamptz; v_out timestamptz; v_late int := 0; v_early int := 0; v_worked int := 0;
  v_rest boolean := false; v_status text; v_leave text; v_dow int; v_hired date; v_term date;
begin
  select hire_date, terminated_at into v_hired, v_term from public.employees where id = p_employee;
  if v_hired is null or p_date < v_hired or (v_term is not null and p_date > v_term) then return; end if;
  if exists (select 1 from public.hr_attendance_days where employee_id = p_employee and work_date = p_date and source = 'manual') then return; end if;

  select * into sh from app.hr_effective_shift(p_employee, p_date);
  v_dow := extract(dow from p_date)::int;
  if sh.shift_id is null then
    -- بلا شفت: يوم من 00:00 إلى 24:00 بالمنطقة المحلية، بلا تأخير
    v_exp_in := (p_date::timestamp - tz); v_exp_out := v_exp_in + interval '24 hours';
    v_win_from := v_exp_in; v_win_to := v_exp_out;
  else
    v_rest := not (v_dow::smallint = any (sh.work_days));
    v_exp_in := (p_date + sh.start_time)::timestamp - tz;
    v_exp_out := (p_date + sh.end_time)::timestamp - tz;
    if v_exp_out <= v_exp_in then v_exp_out := v_exp_out + interval '1 day'; end if;
    v_win_from := v_exp_in - interval '4 hours'; v_win_to := v_exp_out + interval '4 hours';
  end if;

  select min(punched_at), max(punched_at) into v_in, v_out
  from public.biometric_punches where employee_id = p_employee and punched_at >= v_win_from and punched_at < v_win_to;
  if v_in = v_out then v_out := null; end if;   -- بصمة واحدة = ناقصة

  -- إجازة/زمنية معتمدة
  select kind into v_leave from public.hr_leaves
  where employee_id = p_employee and status = 'approved' and p_date between start_date and end_date
  order by (kind = 'leave') desc limit 1;

  if sh.shift_id is not null and not v_rest then
    if v_in is not null then v_late := greatest(0, floor(extract(epoch from (v_in - v_exp_in)) / 60)::int - sh.grace_minutes); end if;
    if v_out is not null then v_early := greatest(0, floor(extract(epoch from (v_exp_out - v_out)) / 60)::int); end if;
  end if;
  if v_in is not null and v_out is not null then v_worked := floor(extract(epoch from (v_out - v_in)) / 60)::int; end if;

  v_status := app.hr_status_of(v_in, v_out, v_late, v_early, v_rest);
  if v_leave = 'leave' and v_in is null then v_status := 'leave'; v_late := 0; v_early := 0;
  elsif v_leave = 'time_permit' then v_status := 'time_permit'; v_late := 0; v_early := 0; end if;
  if v_rest and v_in is null then return; end if;   -- يوم راحة بلا بصمة: لا صف

  insert into public.hr_attendance_days as d
    (employee_id, work_date, shift_name, expected_in, expected_out, check_in, check_out, late_minutes, early_minutes, worked_minutes, is_rest_day, status, source, updated_at)
  values (p_employee, p_date, sh.shift_name, case when sh.shift_id is null then null else v_exp_in end, case when sh.shift_id is null then null else v_exp_out end,
          v_in, v_out, v_late, v_early, v_worked, v_rest, v_status, 'auto', now())
  on conflict (employee_id, work_date) do update set
    shift_name = excluded.shift_name, expected_in = excluded.expected_in, expected_out = excluded.expected_out,
    check_in = excluded.check_in, check_out = excluded.check_out, late_minutes = excluded.late_minutes,
    early_minutes = excluded.early_minutes, worked_minutes = excluded.worked_minutes, is_rest_day = excluded.is_rest_day,
    status = excluded.status, updated_at = now()
  where d.source = 'auto';
end$$;

-- اشتقاق نطاق (HR / غرفة العمليات / super) — يرفض إن كان الشهر مقفولاً بالمالية
create or replace function public.hr_attendance_evaluate(p_from date, p_to date, p_employee uuid default null)
returns integer language plpgsql security definer set search_path = public, app as $$
declare d date; e record; n int := 0;
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
  end loop;
  return n;
end$$;
grant execute on function public.hr_attendance_evaluate(date, date, uuid) to authenticated;

-- ─────────────────────────────────────────────
-- ⑥ غرفة العمليات: التدقيق + الخصومات + التصدير
-- ─────────────────────────────────────────────
create table if not exists public.hr_attendance_audit (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees (id) on delete cascade,
  work_date    date not null,
  action       text not null check (action in ('edit', 'deduction_add', 'deduction_delete', 'export', 'approve', 'reset_auto')),
  before       jsonb,
  after        jsonb,
  reason       text not null,
  actor        uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
alter table public.hr_attendance_audit enable row level security;
create policy "hr_audit: قراءة" on public.hr_attendance_audit for select to authenticated
  using (app.has_role(array['hr_officer', 'finance_officer', 'ops_room', 'super_admin']));

create table if not exists public.hr_attendance_deductions (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees (id) on delete cascade,
  period_month date not null check (period_month = date_trunc('month', period_month)::date),
  amount       numeric(14, 2) not null default 0 check (amount >= 0),
  days         numeric(6, 2) not null default 0 check (days >= 0),
  reason       text not null,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  check (amount > 0 or days > 0)
);
create index if not exists idx_hr_ded_month on public.hr_attendance_deductions (period_month, employee_id);
alter table public.hr_attendance_deductions enable row level security;
create policy "hr_ded: قراءة" on public.hr_attendance_deductions for select to authenticated
  using (app.has_role(array['hr_officer', 'finance_officer', 'ops_room', 'super_admin']));

create table if not exists public.hr_month_exports (
  id           uuid primary key default gen_random_uuid(),
  period_month date not null check (period_month = date_trunc('month', period_month)::date),
  version      integer not null default 1,
  status       text not null default 'exported' check (status in ('exported', 'superseded', 'approved')),
  rows_count   integer not null default 0,
  exported_by  uuid references auth.users (id) on delete set null,
  exported_at  timestamptz not null default now(),
  approved_by  uuid references auth.users (id) on delete set null,
  approved_at  timestamptz,
  unique (period_month, version)
);
alter table public.hr_month_exports enable row level security;
create policy "hr_exports: قراءة" on public.hr_month_exports for select to authenticated
  using (app.has_role(array['hr_officer', 'finance_officer', 'ops_room', 'super_admin']));

create table if not exists public.hr_month_export_rows (
  id                  uuid primary key default gen_random_uuid(),
  export_id           uuid not null references public.hr_month_exports (id) on delete cascade,
  employee_id         uuid not null references public.employees (id) on delete cascade,
  employee_number     text, full_name text, department_name text, branch_name text, job_title text,
  contract_type       text,
  working_days        integer not null default 0,
  days_present        integer not null default 0,
  days_late           integer not null default 0,
  days_absent         integer not null default 0,
  days_incomplete     integer not null default 0,
  days_leave          integer not null default 0,
  late_minutes        integer not null default 0,
  early_minutes       integer not null default 0,
  ops_deduction_amount numeric(14, 2) not null default 0,
  ops_deduction_days  numeric(6, 2) not null default 0,
  ops_deduction_reasons text,
  -- أعمدة المالية (لا تُعرض لغرفة العمليات)
  pay_type            text,
  base_salary         numeric(14, 2),
  daily_rate          numeric(14, 2),
  allowances_total    numeric(14, 2),
  fixed_deductions_total numeric(14, 2),
  proposed_net        numeric(14, 2),
  final_net           numeric(14, 2),
  finance_note        text,
  adjusted_by         uuid references auth.users (id) on delete set null,
  adjusted_at         timestamptz,
  unique (export_id, employee_id)
);
alter table public.hr_month_export_rows enable row level security;
create policy "hr_export_rows: المالية" on public.hr_month_export_rows for select to authenticated
  using (app.has_role(array['finance_officer', 'super_admin']));
-- غرفة العمليات/HR تقرأ عبر ops_month_export_rows (بلا أعمدة الرواتب)

create or replace function app.hr_month_locked(p_month date) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.hr_month_exports where period_month = date_trunc('month', p_month)::date and status = 'approved') $$;

-- تعديل يوم حضور (غرفة العمليات) بسبب إلزامي
create or replace function public.ops_attendance_edit(
  p_employee uuid, p_date date, p_check_in timestamptz, p_check_out timestamptz, p_status text, p_reason text)
returns void language plpgsql security definer set search_path = public, app as $$
declare b jsonb; v_late int := 0; v_early int := 0; v_worked int := 0; r record;
begin
  if not app.has_role(array['ops_room', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
  if app.hr_month_locked(p_date) then raise exception 'HR_MONTH_LOCKED'; end if;
  if p_status not in ('present', 'late', 'early_leave', 'absent', 'incomplete', 'leave', 'time_permit') then raise exception 'HR_STATUS_INVALID'; end if;
  if p_check_in is not null and p_check_out is not null and p_check_out <= p_check_in then raise exception 'HR_TIMES_INVALID'; end if;

  select to_jsonb(d) into b from public.hr_attendance_days d where d.employee_id = p_employee and d.work_date = p_date;
  select * into r from public.hr_attendance_days where employee_id = p_employee and work_date = p_date;
  if r.expected_in is not null and p_check_in is not null then
    v_late := greatest(0, floor(extract(epoch from (p_check_in - r.expected_in)) / 60)::int
                          - coalesce((select grace_minutes from app.hr_effective_shift(p_employee, p_date)), 0));
  end if;
  if r.expected_out is not null and p_check_out is not null then v_early := greatest(0, floor(extract(epoch from (r.expected_out - p_check_out)) / 60)::int); end if;
  if p_check_in is not null and p_check_out is not null then v_worked := floor(extract(epoch from (p_check_out - p_check_in)) / 60)::int; end if;
  if p_status in ('present', 'leave', 'time_permit', 'absent') then v_late := 0; v_early := 0; end if;

  insert into public.hr_attendance_days as d (employee_id, work_date, check_in, check_out, late_minutes, early_minutes, worked_minutes, status, source, edited_by, edited_at, edit_reason)
  values (p_employee, p_date, p_check_in, p_check_out, v_late, v_early, v_worked, p_status, 'manual', auth.uid(), now(), trim(p_reason))
  on conflict (employee_id, work_date) do update set
    check_in = excluded.check_in, check_out = excluded.check_out, late_minutes = excluded.late_minutes, early_minutes = excluded.early_minutes,
    worked_minutes = excluded.worked_minutes, status = excluded.status, source = 'manual',
    edited_by = auth.uid(), edited_at = now(), edit_reason = excluded.edit_reason, updated_at = now();

  insert into public.hr_attendance_audit (employee_id, work_date, action, before, after, reason, actor)
  select p_employee, p_date, 'edit', b, to_jsonb(d), trim(p_reason), auth.uid() from public.hr_attendance_days d where d.employee_id = p_employee and d.work_date = p_date;
end$$;
grant execute on function public.ops_attendance_edit(uuid, date, timestamptz, timestamptz, text, text) to authenticated;

-- إعادة الصف إلى الاشتقاق التلقائي
create or replace function public.ops_attendance_reset(p_employee uuid, p_date date, p_reason text)
returns void language plpgsql security definer set search_path = public, app as $$
declare b jsonb;
begin
  if not app.has_role(array['ops_room', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
  if app.hr_month_locked(p_date) then raise exception 'HR_MONTH_LOCKED'; end if;
  select to_jsonb(d) into b from public.hr_attendance_days d where d.employee_id = p_employee and d.work_date = p_date;
  delete from public.hr_attendance_days where employee_id = p_employee and work_date = p_date;
  perform app.hr_evaluate_day(p_employee, p_date);
  insert into public.hr_attendance_audit (employee_id, work_date, action, before, after, reason, actor)
  values (p_employee, p_date, 'reset_auto', b, (select to_jsonb(d) from public.hr_attendance_days d where d.employee_id = p_employee and d.work_date = p_date), trim(p_reason), auth.uid());
end$$;
grant execute on function public.ops_attendance_reset(uuid, date, text) to authenticated;

-- خصومات يدوية
create or replace function public.ops_deduction_add(p_employee uuid, p_month date, p_amount numeric, p_days numeric, p_reason text)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_id uuid; m date := date_trunc('month', p_month)::date;
begin
  if not app.has_role(array['ops_room', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
  if app.hr_month_locked(m) then raise exception 'HR_MONTH_LOCKED'; end if;
  if coalesce(p_amount, 0) <= 0 and coalesce(p_days, 0) <= 0 then raise exception 'HR_DEDUCTION_INVALID'; end if;
  insert into public.hr_attendance_deductions (employee_id, period_month, amount, days, reason, created_by)
  values (p_employee, m, coalesce(p_amount, 0), coalesce(p_days, 0), trim(p_reason), auth.uid()) returning id into v_id;
  insert into public.hr_attendance_audit (employee_id, work_date, action, after, reason, actor)
  values (p_employee, m, 'deduction_add', jsonb_build_object('id', v_id, 'amount', p_amount, 'days', p_days), trim(p_reason), auth.uid());
  return v_id;
end$$;
grant execute on function public.ops_deduction_add(uuid, date, numeric, numeric, text) to authenticated;

create or replace function public.ops_deduction_delete(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, app as $$
declare r record;
begin
  if not app.has_role(array['ops_room', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
  select * into r from public.hr_attendance_deductions where id = p_id;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  if app.hr_month_locked(r.period_month) then raise exception 'HR_MONTH_LOCKED'; end if;
  delete from public.hr_attendance_deductions where id = p_id;
  insert into public.hr_attendance_audit (employee_id, work_date, action, before, reason, actor)
  values (r.employee_id, r.period_month, 'deduction_delete', to_jsonb(r), trim(p_reason), auth.uid());
end$$;
grant execute on function public.ops_deduction_delete(uuid, text) to authenticated;

-- أقسام شجرة (القسم + فروعه)
create or replace function app.hr_department_tree(p_root uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  with recursive t as (select id from public.departments where id = p_root
                       union all select d.id from public.departments d join t on d.parent_id = t.id)
  select id from t
$$;

-- قائمة الحضوريات (غرفة العمليات + HR) بفلاتر دقيقة
create or replace function public.ops_attendance_list(
  p_from date, p_to date, p_branch uuid default null, p_department uuid default null,
  p_status text default null, p_search text default null, p_limit integer default 2000)
returns table(
  id uuid, employee_id uuid, employee_number text, full_name text, department_id uuid, department_name text,
  branch_id uuid, branch_name text, job_title text, work_date date, shift_name text, expected_in timestamptz, expected_out timestamptz,
  check_in timestamptz, check_out timestamptz, late_minutes integer, early_minutes integer, worked_minutes integer,
  is_rest_day boolean, status text, source text, edited_by uuid, edited_at timestamptz, edit_reason text)
language sql stable security definer set search_path = public, app as $$
  select a.id, e.id, e.employee_number, e.full_name, e.department_id, d.name, e.branch_id, b.name, e.job_title,
         a.work_date, a.shift_name, a.expected_in, a.expected_out, a.check_in, a.check_out, a.late_minutes, a.early_minutes,
         a.worked_minutes, a.is_rest_day, a.status, a.source, a.edited_by, a.edited_at, a.edit_reason
  from public.hr_attendance_days a
  join public.employees e on e.id = a.employee_id
  left join public.departments d on d.id = e.department_id
  left join public.branches b on b.id = e.branch_id
  where app.has_role(array['hr_officer', 'finance_officer', 'ops_room', 'super_admin'])
    and a.work_date between p_from and p_to
    and (p_branch is null or e.branch_id = p_branch)
    and (p_department is null or e.department_id in (select app.hr_department_tree(p_department)))
    and (p_status is null or a.status = p_status)
    and (p_search is null or e.full_name ilike '%' || p_search || '%' or e.employee_number ilike '%' || p_search || '%')
  order by a.work_date desc, d.name, e.full_name
  limit least(greatest(coalesce(p_limit, 2000), 1), 10000)
$$;
grant execute on function public.ops_attendance_list(date, date, uuid, uuid, text, text, integer) to authenticated;

-- ملخص الشهر لكل موظف (يُستخدم للتصدير وللعرض)
create or replace function app.hr_month_summary(p_month date)
returns table(employee_id uuid, working_days int, days_present int, days_late int, days_absent int, days_incomplete int,
              days_leave int, late_minutes int, early_minutes int, ded_amount numeric, ded_days numeric, ded_reasons text)
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
      coalesce(sum(a.late_minutes), 0)::int as late_minutes, coalesce(sum(a.early_minutes), 0)::int as early_minutes
    from public.hr_attendance_days a, m where a.work_date between m.f and m.t group by a.employee_id),
  ded as (
    select d.employee_id, sum(d.amount) as amt, sum(d.days) as dys, string_agg(d.reason, ' · ' order by d.created_at) as reasons
    from public.hr_attendance_deductions d, m where d.period_month = m.f group by d.employee_id)
  select coalesce(att.employee_id, ded.employee_id), coalesce(att.working_days, 0), coalesce(att.days_present, 0), coalesce(att.days_late, 0),
         coalesce(att.days_absent, 0), coalesce(att.days_incomplete, 0), coalesce(att.days_leave, 0), coalesce(att.late_minutes, 0),
         coalesce(att.early_minutes, 0), coalesce(ded.amt, 0), coalesce(ded.dys, 0), ded.reasons
  from att full join ded on ded.employee_id = att.employee_id
$$;

-- تصدير الشهر إلى المالية (نسخة مجمّدة + راتب مقترح) — يُسمح بإعادة التصدير ما لم تعتمد المالية
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

  insert into public.hr_month_export_rows (export_id, employee_id, employee_number, full_name, department_name, branch_name, job_title, contract_type,
    working_days, days_present, days_late, days_absent, days_incomplete, days_leave, late_minutes, early_minutes,
    ops_deduction_amount, ops_deduction_days, ops_deduction_reasons,
    pay_type, base_salary, daily_rate, allowances_total, fixed_deductions_total, proposed_net, final_net)
  select v_id, e.id, e.employee_number, e.full_name, d.name, b.name, e.job_title, e.contract_type,
    s.working_days, s.days_present, s.days_late, s.days_absent, s.days_incomplete, s.days_leave, s.late_minutes, s.early_minutes,
    s.ded_amount, s.ded_days, s.ded_reasons,
    sp.pay_type, sp.base_salary, sp.daily_rate, al.total, fd.total, calc.net, calc.net
  from public.employees e
  join app.hr_month_summary(m) s on s.employee_id = e.id
  left join public.departments d on d.id = e.department_id
  left join public.branches b on b.id = e.branch_id
  left join public.employee_salary_profiles sp on sp.employee_id = e.id and sp.status = 'defined'
  cross join lateral (select coalesce(sum((v.value)::numeric), 0) as total from jsonb_each_text(coalesce(sp.allowances, '{}'::jsonb)) v where v.value ~ '^\d+(\.\d+)?$') al
  cross join lateral (select coalesce(sum((v.value)::numeric), 0) as total from jsonb_each_text(coalesce(sp.fixed_deductions, '{}'::jsonb)) v where v.value ~ '^\d+(\.\d+)?$') fd
  cross join lateral (select case
      when sp.employee_id is null then null
      when sp.pay_type = 'daily' then greatest(0, sp.daily_rate * greatest(0, s.days_present - s.ded_days) - s.ded_amount)
      else greatest(0, sp.base_salary + al.total - fd.total - s.ded_amount
                        - case when s.working_days > 0 then round(sp.base_salary / 30 * s.ded_days, 2) else 0 end)
    end as net) calc;
  get diagnostics n = row_count;
  update public.hr_month_exports set rows_count = n where id = v_id;
  insert into public.hr_attendance_audit (employee_id, work_date, action, after, reason, actor)
  select e.employee_id, m, 'export', jsonb_build_object('export_id', v_id, 'version', v_ver), 'تصدير الشهر إلى المالية', auth.uid()
  from public.hr_month_export_rows e where e.export_id = v_id;
  return v_id;
end$$;
grant execute on function public.ops_month_export(date) to authenticated;

-- صفوف التصدير لغرفة العمليات/HR (بلا أعمدة الرواتب)
create or replace function public.ops_month_export_rows(p_export uuid)
returns table(id uuid, employee_id uuid, employee_number text, full_name text, department_name text, branch_name text, job_title text, contract_type text,
  working_days int, days_present int, days_late int, days_absent int, days_incomplete int, days_leave int, late_minutes int, early_minutes int,
  ops_deduction_amount numeric, ops_deduction_days numeric, ops_deduction_reasons text)
language sql stable security definer set search_path = public, app as $$
  select r.id, r.employee_id, r.employee_number, r.full_name, r.department_name, r.branch_name, r.job_title, r.contract_type,
         r.working_days, r.days_present, r.days_late, r.days_absent, r.days_incomplete, r.days_leave, r.late_minutes, r.early_minutes,
         r.ops_deduction_amount, r.ops_deduction_days, r.ops_deduction_reasons
  from public.hr_month_export_rows r
  where app.has_role(array['hr_officer', 'ops_room', 'finance_officer', 'super_admin']) and r.export_id = p_export
  order by r.department_name, r.full_name
$$;
grant execute on function public.ops_month_export_rows(uuid) to authenticated;

-- ─────────────────────────────────────────────
-- ⑦ المالية: كشف الرواتب
-- ─────────────────────────────────────────────
create or replace function public.finance_payroll_adjust(p_row uuid, p_final_net numeric, p_note text)
returns void language plpgsql security definer set search_path = public, app as $$
declare x record;
begin
  if not app.has_role(array['finance_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  select e.* into x from public.hr_month_export_rows r join public.hr_month_exports e on e.id = r.export_id where r.id = p_row;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  if x.status <> 'exported' then raise exception 'HR_EXPORT_NOT_EDITABLE'; end if;
  if p_final_net is null or p_final_net < 0 then raise exception 'HR_AMOUNT_INVALID'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
  update public.hr_month_export_rows set final_net = p_final_net, finance_note = trim(p_note), adjusted_by = auth.uid(), adjusted_at = now() where id = p_row;
end$$;
grant execute on function public.finance_payroll_adjust(uuid, numeric, text) to authenticated;

create or replace function public.finance_payroll_approve(p_export uuid)
returns void language plpgsql security definer set search_path = public, app as $$
declare x record;
begin
  if not app.has_role(array['finance_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  select * into x from public.hr_month_exports where id = p_export;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
  if x.status <> 'exported' then raise exception 'HR_EXPORT_NOT_EDITABLE'; end if;
  if exists (select 1 from public.hr_month_export_rows where export_id = p_export and final_net is null) then raise exception 'HR_SALARY_MISSING'; end if;
  update public.hr_month_exports set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_export;
  insert into public.hr_attendance_audit (employee_id, work_date, action, after, reason, actor)
  select r.employee_id, x.period_month, 'approve', jsonb_build_object('export_id', p_export, 'final_net', r.final_net), 'اعتماد رواتب الشهر', auth.uid()
  from public.hr_month_export_rows r where r.export_id = p_export;
end$$;
grant execute on function public.finance_payroll_approve(uuid) to authenticated;

-- تعريف/تعديل ملف راتب (المالية)
create or replace function public.finance_salary_set(
  p_employee uuid, p_pay_type text, p_base numeric, p_daily numeric, p_allowances jsonb, p_fixed_deductions jsonb, p_notes text default null)
returns void language plpgsql security definer set search_path = public, app as $$
begin
  if not app.has_role(array['finance_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if p_pay_type not in ('monthly', 'daily') then raise exception 'HR_PAY_TYPE_INVALID'; end if;
  if (p_pay_type = 'monthly' and coalesce(p_base, 0) <= 0) or (p_pay_type = 'daily' and coalesce(p_daily, 0) <= 0) then raise exception 'HR_AMOUNT_INVALID'; end if;
  insert into public.employee_salary_profiles as sp (employee_id, status, pay_type, base_salary, daily_rate, allowances, fixed_deductions, notes, set_by, set_at)
  values (p_employee, 'defined', p_pay_type, coalesce(p_base, 0), coalesce(p_daily, 0), coalesce(p_allowances, '{}'::jsonb), coalesce(p_fixed_deductions, '{}'::jsonb), p_notes, auth.uid(), now())
  on conflict (employee_id) do update set status = 'defined', pay_type = excluded.pay_type, base_salary = excluded.base_salary, daily_rate = excluded.daily_rate,
    allowances = excluded.allowances, fixed_deductions = excluded.fixed_deductions, notes = excluded.notes, set_by = auth.uid(), set_at = now(), updated_at = now();
  update public.employees set contract_type = p_pay_type where id = p_employee and contract_type <> p_pay_type;
  update public.finance_hr_notices set is_done = true, done_at = now(), done_by = auth.uid() where employee_id = p_employee and kind = 'salary_pending' and not is_done;
end$$;
grant execute on function public.finance_salary_set(uuid, text, numeric, numeric, jsonb, jsonb, text) to authenticated;

-- ─────────────────────────────────────────────
-- HR: إنشاء موظف كامل + إنهاء خدمة + قائمة + لوحة
-- ─────────────────────────────────────────────
create or replace function public.hr_employee_create(p jsonb)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_id uuid; v_shift uuid;
begin
  if not app.has_role(array['hr_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if coalesce(trim(p ->> 'full_name'), '') = '' then raise exception 'HR_NAME_REQUIRED'; end if;
  if coalesce(trim(p ->> 'employee_number'), '') = '' then raise exception 'HR_NUMBER_REQUIRED'; end if;
  if exists (select 1 from public.employees where employee_number = trim(p ->> 'employee_number')) then raise exception 'HR_NUMBER_TAKEN'; end if;
  if (p ->> 'biometric_pin') is not null and exists (select 1 from public.employees where biometric_pin = trim(p ->> 'biometric_pin')) then raise exception 'BIO_PIN_TAKEN'; end if;

  insert into public.employees (employee_number, full_name, email, phone, phone2, department_id, branch_id, manager_id, job_title, hire_date,
    mother_name, gender, birth_date, birth_place, marital_status, education, national_id_number, residence_card_number, governorate, address,
    emergency_contact_name, emergency_contact_phone, blood_type, contract_type, biometric_pin)
  values (trim(p ->> 'employee_number'), trim(p ->> 'full_name'), nullif(trim(coalesce(p ->> 'email', '')), ''), nullif(trim(coalesce(p ->> 'phone', '')), ''),
    nullif(trim(coalesce(p ->> 'phone2', '')), ''), (p ->> 'department_id')::uuid, (p ->> 'branch_id')::uuid, (p ->> 'manager_id')::uuid,
    nullif(trim(coalesce(p ->> 'job_title', '')), ''), coalesce((p ->> 'hire_date')::date, current_date),
    nullif(trim(coalesce(p ->> 'mother_name', '')), ''), nullif(p ->> 'gender', ''), (p ->> 'birth_date')::date, nullif(trim(coalesce(p ->> 'birth_place', '')), ''),
    nullif(p ->> 'marital_status', ''), nullif(trim(coalesce(p ->> 'education', '')), ''), nullif(trim(coalesce(p ->> 'national_id_number', '')), ''),
    nullif(trim(coalesce(p ->> 'residence_card_number', '')), ''), nullif(trim(coalesce(p ->> 'governorate', '')), ''), nullif(trim(coalesce(p ->> 'address', '')), ''),
    nullif(trim(coalesce(p ->> 'emergency_contact_name', '')), ''), nullif(trim(coalesce(p ->> 'emergency_contact_phone', '')), ''), nullif(p ->> 'blood_type', ''),
    coalesce(nullif(p ->> 'contract_type', ''), 'monthly'), nullif(trim(coalesce(p ->> 'biometric_pin', '')), ''))
  returning id into v_id;

  v_shift := (p ->> 'shift_id')::uuid;
  if v_shift is not null then
    insert into public.employee_shift_assignments (employee_id, shift_id, effective_from, start_override, end_override, grace_override, created_by)
    values (v_id, v_shift, coalesce((p ->> 'hire_date')::date, current_date), (p ->> 'shift_start_override')::time, (p ->> 'shift_end_override')::time,
            (p ->> 'shift_grace_override')::int, auth.uid());
  end if;

  -- ملف راتب بانتظار المالية + إشعار
  insert into public.employee_salary_profiles (employee_id, status, pay_type) values (v_id, 'pending', coalesce(nullif(p ->> 'contract_type', ''), 'monthly'));
  insert into public.finance_hr_notices (employee_id, kind, payload) values (v_id, 'salary_pending', jsonb_build_object('contract_type', coalesce(nullif(p ->> 'contract_type', ''), 'monthly')));
  return v_id;
end$$;
grant execute on function public.hr_employee_create(jsonb) to authenticated;

create or replace function public.hr_employee_update(p_id uuid, p jsonb)
returns void language plpgsql security definer set search_path = public, app as $$
declare k text; allowed text[] := array['full_name','email','phone','phone2','department_id','branch_id','manager_id','job_title','hire_date','mother_name','gender',
  'birth_date','birth_place','marital_status','education','national_id_number','residence_card_number','governorate','address','emergency_contact_name',
  'emergency_contact_phone','blood_type','biometric_pin','photo_path'];
begin
  if not app.has_role(array['hr_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  for k in select jsonb_object_keys(p) loop
    if not (k = any (allowed)) then raise exception 'HR_FIELD_NOT_ALLOWED: %', k; end if;
  end loop;
  if (p ->> 'biometric_pin') is not null and exists (select 1 from public.employees where biometric_pin = trim(p ->> 'biometric_pin') and id <> p_id) then raise exception 'BIO_PIN_TAKEN'; end if;
  update public.employees set
    full_name = coalesce(nullif(trim(p ->> 'full_name'), ''), full_name),
    email = case when p ? 'email' then nullif(trim(p ->> 'email'), '') else email end,
    phone = case when p ? 'phone' then nullif(trim(p ->> 'phone'), '') else phone end,
    phone2 = case when p ? 'phone2' then nullif(trim(p ->> 'phone2'), '') else phone2 end,
    department_id = case when p ? 'department_id' then (p ->> 'department_id')::uuid else department_id end,
    branch_id = case when p ? 'branch_id' then (p ->> 'branch_id')::uuid else branch_id end,
    manager_id = case when p ? 'manager_id' then (p ->> 'manager_id')::uuid else manager_id end,
    job_title = case when p ? 'job_title' then nullif(trim(p ->> 'job_title'), '') else job_title end,
    hire_date = case when p ? 'hire_date' then (p ->> 'hire_date')::date else hire_date end,
    mother_name = case when p ? 'mother_name' then nullif(trim(p ->> 'mother_name'), '') else mother_name end,
    gender = case when p ? 'gender' then nullif(p ->> 'gender', '') else gender end,
    birth_date = case when p ? 'birth_date' then (p ->> 'birth_date')::date else birth_date end,
    birth_place = case when p ? 'birth_place' then nullif(trim(p ->> 'birth_place'), '') else birth_place end,
    marital_status = case when p ? 'marital_status' then nullif(p ->> 'marital_status', '') else marital_status end,
    education = case when p ? 'education' then nullif(trim(p ->> 'education'), '') else education end,
    national_id_number = case when p ? 'national_id_number' then nullif(trim(p ->> 'national_id_number'), '') else national_id_number end,
    residence_card_number = case when p ? 'residence_card_number' then nullif(trim(p ->> 'residence_card_number'), '') else residence_card_number end,
    governorate = case when p ? 'governorate' then nullif(trim(p ->> 'governorate'), '') else governorate end,
    address = case when p ? 'address' then nullif(trim(p ->> 'address'), '') else address end,
    emergency_contact_name = case when p ? 'emergency_contact_name' then nullif(trim(p ->> 'emergency_contact_name'), '') else emergency_contact_name end,
    emergency_contact_phone = case when p ? 'emergency_contact_phone' then nullif(trim(p ->> 'emergency_contact_phone'), '') else emergency_contact_phone end,
    blood_type = case when p ? 'blood_type' then nullif(p ->> 'blood_type', '') else blood_type end,
    biometric_pin = case when p ? 'biometric_pin' then nullif(trim(p ->> 'biometric_pin'), '') else biometric_pin end,
    photo_path = case when p ? 'photo_path' then nullif(trim(p ->> 'photo_path'), '') else photo_path end,
    updated_at = now()
  where id = p_id;
  if not found then raise exception 'HR_NOT_FOUND'; end if;
end$$;
grant execute on function public.hr_employee_update(uuid, jsonb) to authenticated;

-- تغيير شفت الموظف بتاريخ سريان (مع تجاوزات)
create or replace function public.hr_employee_assign_shift(
  p_employee uuid, p_shift uuid, p_from date, p_start time default null, p_end time default null, p_grace int default null, p_days smallint[] default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_id uuid;
begin
  if not app.has_role(array['hr_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if app.hr_month_locked(p_from) then raise exception 'HR_MONTH_LOCKED'; end if;
  insert into public.employee_shift_assignments as a (employee_id, shift_id, effective_from, start_override, end_override, grace_override, days_override, note, created_by)
  values (p_employee, p_shift, coalesce(p_from, current_date), p_start, p_end, p_grace, p_days, p_note, auth.uid())
  on conflict (employee_id, effective_from) do update set shift_id = excluded.shift_id, start_override = excluded.start_override,
    end_override = excluded.end_override, grace_override = excluded.grace_override, days_override = excluded.days_override, note = excluded.note, created_by = auth.uid()
  returning id into v_id;
  return v_id;
end$$;
grant execute on function public.hr_employee_assign_shift(uuid, uuid, date, time, time, int, smallint[], text) to authenticated;

-- إنهاء الخدمة
create or replace function public.hr_employee_terminate(p_employee uuid, p_type text, p_last_day date, p_reason text, p_attachment text default null)
returns void language plpgsql security definer set search_path = public, app as $$
begin
  if not app.has_role(array['hr_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if p_type not in ('resignation', 'dismissal', 'contract_end', 'retirement', 'death') then raise exception 'HR_TERMINATION_TYPE_INVALID'; end if;
  if p_last_day is null then raise exception 'HR_DATE_INVALID'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
  update public.employees set employment_status = 'terminated', terminated_at = p_last_day, termination_type = p_type,
    termination_reason = trim(p_reason), termination_attachment_path = p_attachment, terminated_by = auth.uid(), updated_at = now()
  where id = p_employee and employment_status <> 'terminated';
  if not found then raise exception 'HR_ALREADY_TERMINATED'; end if;
  insert into public.finance_hr_notices (employee_id, kind, payload)
  values (p_employee, 'termination_settlement', jsonb_build_object('type', p_type, 'last_day', p_last_day, 'reason', trim(p_reason)));
end$$;
grant execute on function public.hr_employee_terminate(uuid, text, date, text, text) to authenticated;

-- قائمة الموظفين مع الشفت الحالي وحالة الراتب (بلا أرقام)
create or replace function public.hr_employees_list(
  p_search text default null, p_department uuid default null, p_branch uuid default null, p_status text default null, p_shift uuid default null, p_limit int default 1000)
returns table(id uuid, employee_number text, full_name text, job_title text, phone text, department_id uuid, department_name text, branch_id uuid, branch_name text,
  employment_status text, contract_type text, hire_date date, terminated_at date, biometric_pin text, photo_path text,
  shift_id uuid, shift_name text, salary_status text)
language sql stable security definer set search_path = public, app as $$
  select e.id, e.employee_number, e.full_name, e.job_title, e.phone, e.department_id, d.name, e.branch_id, b.name,
         e.employment_status, e.contract_type, e.hire_date, e.terminated_at, e.biometric_pin, e.photo_path,
         sh.shift_id, sh.shift_name, coalesce(sp.status, 'pending')
  from public.employees e
  left join public.departments d on d.id = e.department_id
  left join public.branches b on b.id = e.branch_id
  left join lateral app.hr_effective_shift(e.id, current_date) sh on true
  left join public.employee_salary_profiles sp on sp.employee_id = e.id
  where app.has_role(array['hr_officer', 'finance_officer', 'ops_room', 'super_admin'])
    and e.archived_at is null
    and (p_search is null or e.full_name ilike '%' || p_search || '%' or e.employee_number ilike '%' || p_search || '%' or e.phone ilike '%' || p_search || '%')
    and (p_department is null or e.department_id in (select app.hr_department_tree(p_department)))
    and (p_branch is null or e.branch_id = p_branch)
    and (p_status is null or e.employment_status = p_status)
    and (p_shift is null or sh.shift_id = p_shift)
  order by e.employment_status = 'terminated', d.name nulls last, e.full_name
  limit least(greatest(coalesce(p_limit, 1000), 1), 5000)
$$;
grant execute on function public.hr_employees_list(text, uuid, uuid, text, uuid, int) to authenticated;

-- لوحة HR
create or replace function public.hr_dashboard_stats()
returns jsonb language sql stable security definer set search_path = public, app as $$
  select case when not app.has_role(array['hr_officer', 'super_admin']) then null else jsonb_build_object(
    'employees_active', (select count(*) from public.employees where archived_at is null and employment_status <> 'terminated'),
    'employees_terminated', (select count(*) from public.employees where archived_at is null and employment_status = 'terminated'),
    'hired_this_month', (select count(*) from public.employees where archived_at is null and hire_date >= date_trunc('month', current_date)),
    'terminated_this_month', (select count(*) from public.employees where archived_at is null and terminated_at >= date_trunc('month', current_date)),
    'by_department', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(d.name, 'بلا قسم'), 'count', c) order by c desc), '[]'::jsonb)
                      from (select department_id, count(*) c from public.employees where archived_at is null and employment_status <> 'terminated' group by department_id) x
                      left join public.departments d on d.id = x.department_id),
    'by_branch', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(b.name, 'بلا فرع'), 'count', c) order by c desc), '[]'::jsonb)
                  from (select branch_id, count(*) c from public.employees where archived_at is null and employment_status <> 'terminated' group by branch_id) x
                  left join public.branches b on b.id = x.branch_id),
    'today', (select jsonb_build_object(
        'present', count(*) filter (where status in ('present', 'early_leave', 'time_permit')),
        'late', count(*) filter (where status = 'late'),
        'absent', count(*) filter (where status = 'absent'),
        'incomplete', count(*) filter (where status = 'incomplete'),
        'leave', count(*) filter (where status = 'leave'))
      from public.hr_attendance_days where work_date = current_date),
    'leaves_today', (select count(*) from public.hr_leaves where status = 'approved' and current_date between start_date and end_date),
    'salary_pending', (select count(*) from public.employee_salary_profiles sp join public.employees e on e.id = sp.employee_id
                       where sp.status = 'pending' and e.employment_status <> 'terminated'),
    'unmatched_punches', (select count(*) from public.biometric_punches where employee_id is null and punched_at >= now() - interval '30 days'),
    'shifts', (select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'count', (select count(*) from public.employees e
                 where e.archived_at is null and e.employment_status <> 'terminated' and (select shift_id from app.hr_effective_shift(e.id, current_date)) = s.id))), '[]'::jsonb)
               from public.hr_shifts s where s.is_active)
  ) end
$$;
grant execute on function public.hr_dashboard_stats() to authenticated;

-- كشف رواتب المالية (كل الأعمدة) لآخر تصدير للشهر
create or replace function public.finance_payroll_sheet(p_month date)
returns table(export_id uuid, export_version int, export_status text, exported_at timestamptz, row_id uuid, employee_id uuid, employee_number text, full_name text,
  department_name text, branch_name text, job_title text, contract_type text, working_days int, days_present int, days_late int, days_absent int, days_incomplete int,
  days_leave int, late_minutes int, early_minutes int, ops_deduction_amount numeric, ops_deduction_days numeric, ops_deduction_reasons text,
  pay_type text, base_salary numeric, daily_rate numeric, allowances_total numeric, fixed_deductions_total numeric, proposed_net numeric, final_net numeric, finance_note text)
language sql stable security definer set search_path = public, app as $$
  with x as (select * from public.hr_month_exports where period_month = date_trunc('month', p_month)::date and status in ('exported', 'approved') order by version desc limit 1)
  select x.id, x.version, x.status, x.exported_at, r.id, r.employee_id, r.employee_number, r.full_name, r.department_name, r.branch_name, r.job_title, r.contract_type,
         r.working_days, r.days_present, r.days_late, r.days_absent, r.days_incomplete, r.days_leave, r.late_minutes, r.early_minutes,
         r.ops_deduction_amount, r.ops_deduction_days, r.ops_deduction_reasons, r.pay_type, r.base_salary, r.daily_rate, r.allowances_total, r.fixed_deductions_total,
         r.proposed_net, r.final_net, r.finance_note
  from x join public.hr_month_export_rows r on r.export_id = x.id
  where app.has_role(array['finance_officer', 'super_admin'])
  order by r.department_name, r.full_name
$$;
grant execute on function public.finance_payroll_sheet(date) to authenticated;
