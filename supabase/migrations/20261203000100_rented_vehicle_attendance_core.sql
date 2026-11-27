-- 20261203000100 · حضوريات الآليات المؤجرة — الأساس (جدول الأيام + إعدادات التفريغ + الضريبة لكل آلية)
--   · النطاق: الآليات المؤجرة فقط (ownership_type='rented'). حضور الموظفين لا يُمسّ.
--   · قاعدة الحضور: **الانطلاق = حاضر**. يوم بلا انطلاقة واحدة = غائب. لا ساعات عمل ولا تأخير.
--   · المصدر الوحيد للحقيقة هو public.garage_departures (لا إدخال يدوي في الأساس).
--   · الضريبة: لكل آلية، إمّا مبلغ ثابت شهرياً أو نسبة من المستحق — يتحكم بها معاون المدير المفوض.
--   · التفريغ: نوع الآلية يحدد «طن لكل تفريغة» و«الطن المطلوب شهرياً» — على مستوى الآلية (transaction) لا النوع،
--     لأن مؤجرة واحدة قد تختلف عن أخرى من النوع نفسه.
--
-- يعتمد على: garage_vehicles.ownership_type/lessor_name (00074 + هجرة المؤجرة)،
--            station_external_drivers (00328)، garage_departures.driver_external_id (00322)،
--            vehicle_categories.min_tons/max_tons (00328).
--
-- ⚠️ لا تُطبَّق على الإنتاج إلا بموافقة صريحة من المستخدم.

-- ── ① صف اليوم: سائق × آلية × يوم ─────────────────────────────────────────────
-- المفتاح (driver_external_id, vehicle_id, day) — لا صف بلا سائق خارجي (نطاق المؤجرة).
create table if not exists public.rented_attendance_days (
  id                 uuid primary key default gen_random_uuid(),
  driver_external_id uuid not null references public.station_external_drivers(id) on delete restrict,
  vehicle_id         uuid not null references public.garage_vehicles(id) on delete restrict,
  day                date not null,
  shift              text check (shift is null or shift in ('morning', 'evening', 'night')),
  status             text not null default 'absent' check (status in ('present', 'absent')),
  first_departure_at timestamptz,
  departures_count   int not null default 0 check (departures_count >= 0),
  source             text not null default 'sync' check (source in ('sync', 'manual')),
  manual_reason      text check (manual_reason is null or length(trim(manual_reason)) between 3 and 300),
  manual_by          uuid references auth.users(id) on delete set null,
  manual_at          timestamptz,
  -- التفريغ: طن فعلي مسجّل مقابل الطن المطلوب (يُجمَّع شهرياً في الكشف)
  tons_discharged    numeric(10, 2) not null default 0 check (tons_discharged >= 0),
  trips_count        int not null default 0 check (trips_count >= 0),
  note               text check (note is null or length(note) <= 500),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint rented_attendance_days_uk unique (driver_external_id, vehicle_id, day),
  -- حاضر بلا انطلاقة غير مقبول، وغائب بانطلاقة غير مقبول — في الصفوف المُشتقّة آلياً.
  -- الصف اليدوي (source='manual') معفى: قد تُلغى انطلاقةٌ لأنها كانت لسائق آخر، فيصير حاضراً بلا انطلاقة،
  -- أو يُثبت حضوراً ورقياً بلا انطلاقة. الإعفاء مشروط بوجود سبب ومُعدِّل (rented_attendance_days_manual_check).
  constraint rented_attendance_days_presence_check check (
    source = 'manual'
    or (status = 'present' and departures_count > 0)
    or (status = 'absent' and departures_count = 0)
  ),
  constraint rented_attendance_days_manual_check check (
    (source = 'sync' and manual_reason is null and manual_by is null and manual_at is null)
    or (source = 'manual' and manual_reason is not null and manual_by is not null and manual_at is not null)
  )
);
create index if not exists idx_rented_att_days_month on public.rented_attendance_days (day desc, vehicle_id);
create index if not exists idx_rented_att_days_driver on public.rented_attendance_days (driver_external_id, day desc);

comment on table public.rented_attendance_days is
  '20261203000100: يوم حضور لسائق آلية مؤجرة. حاضر = انطلاقة واحدة على الأقل في اليوم (بتوقيت بغداد). غائب = صفر انطلاقات.';

-- ── ② إعدادات تفريغ لكل آلية ─────────────────────────────────────────────────
-- «كابسة كبيرة، 6 طن = تفريغة واحدة، المطلوب شهرياً 6 طن» ⇒ tons_per_trip=6, monthly_target_tons=6
-- «كابسة صغيرة 2 طن، المطلوب 6 طن» ⇒ tons_per_trip=2, monthly_target_tons=6 ⇒ يحتاج 3 ذهاب للمحطة.
create table if not exists public.rented_vehicle_discharge_settings (
  vehicle_id          uuid primary key references public.garage_vehicles(id) on delete cascade,
  vehicle_category    text,
  tons_per_trip       numeric(10, 2) check (tons_per_trip is null or tons_per_trip > 0),
  monthly_target_tons numeric(10, 2) not null default 0 check (monthly_target_tons >= 0),
  note                text check (note is null or length(note) <= 500),
  set_by              uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.rented_vehicle_discharge_settings is
  '20261203000100: إعدادات تفريغ الآلية المؤجرة. عدد الذهاب المطلوب = ceil(monthly_target_tons / tons_per_trip).';

-- ── ③ الضريبة لكل آلية (مبلغ ثابت أو نسبة) ───────────────────────────────────
create table if not exists public.rented_vehicle_taxes (
  vehicle_id      uuid primary key references public.garage_vehicles(id) on delete cascade,
  mode            text not null default 'fixed' check (mode in ('fixed', 'percent')),
  fixed_amount    numeric(14, 2) check (fixed_amount is null or fixed_amount >= 0),
  pct             numeric(5, 2) check (pct is null or (pct >= 0 and pct <= 100)),
  reason          text not null check (length(trim(reason)) between 3 and 500),
  set_by          uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint rented_vehicle_taxes_value_check check (
    (mode = 'fixed' and fixed_amount is not null and pct is null)
    or (mode = 'percent' and pct is not null and fixed_amount is null)
  )
);
comment on table public.rented_vehicle_taxes is
  '20261203000100: ضريبة الآلية المؤجرة. fixed = مبلغ شهري ثابت، percent = نسبة من المستحق. يضبطها معاون المدير المفوض.';

-- ── ④ راتب الشهر لكل سائق (تحدده المالية) ────────────────────────────────────
create table if not exists public.rented_driver_salaries (
  id                 uuid primary key default gen_random_uuid(),
  driver_external_id uuid not null references public.station_external_drivers(id) on delete restrict,
  vehicle_id         uuid not null references public.garage_vehicles(id) on delete restrict,
  month              date not null check (extract(day from month) = 1),
  salary_mode        text not null default 'monthly' check (salary_mode in ('monthly', 'daily')),
  monthly_amount     numeric(14, 2) not null default 0 check (monthly_amount >= 0),
  daily_amount       numeric(14, 2) not null default 0 check (daily_amount >= 0),
  note               text check (note is null or length(note) <= 500),
  set_by             uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint rented_driver_salaries_uk unique (driver_external_id, vehicle_id, month),
  constraint rented_driver_salaries_value_check check (
    (salary_mode = 'monthly' and monthly_amount > 0)
    or (salary_mode = 'daily' and daily_amount > 0)
  )
);
comment on table public.rented_driver_salaries is
  '20261203000100: راتب شهري أو يومي لكل سائق مؤجرة. monthly = يُحتسب كاملاً (أو منسوباً لأيام الحضور حسب السياسة)، daily = × أيام الحضور.';

-- ── ⑤ دورة الاعتماد الشهرية (معاون ← مالية) ─────────────────────────────────
create table if not exists public.rented_attendance_months (
  id            uuid primary key default gen_random_uuid(),
  month         date not null unique check (extract(day from month) = 1),
  status        text not null default 'draft' check (status in ('draft', 'deputy_approved', 'finance_paid', 'rejected')),
  garage_parent_sector text,
  submitted_by  uuid references auth.users(id) on delete set null,
  submitted_at  timestamptz,
  deputy_by     uuid references auth.users(id) on delete set null,
  deputy_at     timestamptz,
  deputy_note   text check (deputy_note is null or length(deputy_note) <= 500),
  finance_by    uuid references auth.users(id) on delete set null,
  finance_at    timestamptz,
  finance_note  text check (finance_note is null or length(finance_note) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.rented_attendance_months is
  '20261203000100: حالة اعتماد شهر حضوريات المؤجرة. draft → deputy_approved → finance_paid (أو rejected في أي مرحلة قبل الدفع).';

-- ── ⑥ سجل التدقيق ────────────────────────────────────────────────────────────
create table if not exists public.rented_attendance_audit (
  id          uuid primary key default gen_random_uuid(),
  seq         bigserial,
  entity      text not null check (entity in ('day', 'tax', 'discharge', 'salary', 'month')),
  entity_id   text,
  action      text not null,
  before      jsonb,
  after       jsonb,
  reason      text,
  actor       uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_rented_att_audit_at on public.rented_attendance_audit (created_at desc);

-- ── ⑦ RLS: كل الجداول مُقفلة مباشرة؛ القراءة تمرّ عبر الدوال ─────────────────
alter table public.rented_attendance_days            enable row level security;
alter table public.rented_vehicle_discharge_settings enable row level security;
alter table public.rented_vehicle_taxes              enable row level security;
alter table public.rented_driver_salaries            enable row level security;
alter table public.rented_attendance_months          enable row level security;
alter table public.rented_attendance_audit           enable row level security;

drop policy if exists "rented_att_days: read" on public.rented_attendance_days;
create policy "rented_att_days: read" on public.rented_attendance_days for select to authenticated
  using (app.has_role(array['ops_room', 'deputy_director', 'finance_officer', 'executive_director', 'super_admin']));
drop policy if exists "rented_discharge: read" on public.rented_vehicle_discharge_settings;
create policy "rented_discharge: read" on public.rented_vehicle_discharge_settings for select to authenticated
  using (app.has_role(array['ops_room', 'deputy_director', 'finance_officer', 'executive_director', 'super_admin']));
drop policy if exists "rented_taxes: read" on public.rented_vehicle_taxes;
create policy "rented_taxes: read" on public.rented_vehicle_taxes for select to authenticated
  using (app.has_role(array['ops_room', 'deputy_director', 'finance_officer', 'executive_director', 'super_admin']));
drop policy if exists "rented_salaries: read" on public.rented_driver_salaries;
create policy "rented_salaries: read" on public.rented_driver_salaries for select to authenticated
  using (app.has_role(array['deputy_director', 'finance_officer', 'executive_director', 'super_admin']));
drop policy if exists "rented_months: read" on public.rented_attendance_months;
create policy "rented_months: read" on public.rented_attendance_months for select to authenticated
  using (app.has_role(array['ops_room', 'deputy_director', 'finance_officer', 'executive_director', 'super_admin']));
drop policy if exists "rented_audit: read" on public.rented_attendance_audit;
create policy "rented_audit: read" on public.rented_attendance_audit for select to authenticated
  using (app.has_role(array['deputy_director', 'finance_officer', 'super_admin']));
