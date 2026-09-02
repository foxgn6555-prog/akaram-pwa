-- ═══════════════════════════════════════════════════════════════
-- 00044 · نظام «مسؤول القسم» حسب القاطع/الشفت
-- المدير (department_manager) يُسند إليه شفت واحد وقواطع (1..3).
-- العمال والآليات تُربط بقاطع → يعزل RLS بيانات كل مدير لقواطعه.
-- الوحدات: الرئيسية · فريقي · طلب مستلزمات · حضورية العمال ·
--          عطل آلية · إرسال صور · الأرشيف.
-- ═══════════════════════════════════════════════════════════════

-- ── القواطع الثمانية (مصدر واحد للحقيقة — الأسماء قابلة للتعديل) ──
create table public.sectors (
  id      smallint primary key,         -- 1..8
  code    text not null unique,         -- رمز ثابت S1..S8
  name    text not null,
  sort    smallint not null default 0,
  created_at timestamptz not null default now()
);
alter table public.sectors enable row level security;
-- قراءة القواطع متاحة لأي مستخدم دخول (لوحات/قوائم)
create policy "sectors: قراءة للمصادَقين" on public.sectors
  for select to authenticated using (true);
-- الكتابة للإدارة فقط
create policy "sectors: كتابة للإدارة" on public.sectors
  for all to authenticated
  using (app.has_role(array['it_admin','super_admin']))
  with check (app.has_role(array['it_admin','super_admin']));

insert into public.sectors (id, code, name, sort) values
  (1, 'S1', 'القاطع الأول', 1),
  (2, 'S2', 'القاطع الثاني', 2),
  (3, 'S3', 'القاطع الثالث', 3),
  (4, 'S4', 'القاطع الرابع', 4),
  (5, 'S5', 'القاطع الخامس', 5),
  (6, 'S6', 'القاطع السادس', 6),
  (7, 'S7', 'القاطع السابع', 7),
  (8, 'S8', 'القاطع الثامن', 8)
on conflict (id) do nothing;

-- ── إسناد المدير للشفت والقواطع (1..3) ──
create table public.manager_profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  shift      text not null default 'morning'
             check (shift in ('morning','evening','night')),
  sectors    smallint[] not null default '{}',   -- 1..8 (1 إلى 3)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint manager_sectors_count check (
    array_length(sectors, 1) is null or
    (array_length(sectors, 1) between 1 and 3)
  )
);
alter table public.manager_profiles enable row level security;

create policy "manager_profiles: المدير يرى ملفه" on public.manager_profiles
  for select to authenticated using (user_id = auth.uid());
create policy "manager_profiles: الإدارة تدير" on public.manager_profiles
  for all to authenticated
  using (app.has_role(array['it_admin','super_admin','hr_officer']))
  with check (app.has_role(array['it_admin','super_admin','hr_officer']));

create trigger trg_manager_profiles_updated
  before update on public.manager_profiles
  for each row execute function app.set_updated_at();

-- ── عمال القواطع (فريق المدير) ──
create table public.sector_workers (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null,
  phone        text,
  sector_id    smallint not null references public.sectors (id),
  shift        text not null default 'morning'
               check (shift in ('morning','evening','night')),
  job_title    text,
  created_by   uuid references auth.users (id),
  archived_at  timestamptz,
  archive_reason text,
  created_at   timestamptz not null default now()
);
alter table public.sector_workers enable row level security;
create index idx_sector_workers_sector on public.sector_workers (sector_id);
create index idx_sector_workers_active on public.sector_workers (archived_at);

-- ── آليات القواطع (DB) ──
create table public.sector_vehicles (
  id           uuid primary key default gen_random_uuid(),
  db_number    text not null,
  vehicle_type text,
  sector_id    smallint not null references public.sectors (id),
  shift        text not null default 'morning'
               check (shift in ('morning','evening','night')),
  driver_name  text,
  created_by   uuid references auth.users (id),
  archived_at  timestamptz,
  archive_reason text,
  created_at   timestamptz not null default now()
);
alter table public.sector_vehicles enable row level security;
create index idx_sector_vehicles_sector on public.sector_vehicles (sector_id);
create index idx_sector_vehicles_db on public.sector_vehicles (db_number);

-- ── طلبات مستلزمات القاطع (تصل ككتاب رسمي للمعاون) ──
create table public.sector_supply_requests (
  id            uuid primary key default gen_random_uuid(),
  manager_id    uuid not null references auth.users (id),
  manager_name  text not null,
  shift         text not null check (shift in ('morning','evening','night')),
  sectors       smallint[] not null,
  supply_type   text not null,             -- نوع المستلزمات (نص يدوي)
  quantity      integer not null check (quantity > 0),
  notes         text,
  signed        boolean not null default false,  -- إقرار التوقيع الإلكتروني
  ref_no        text,
  status        text not null default 'submitted_to_deputy'
                check (status in ('draft','submitted_to_deputy','archived')),
  submitted_at  timestamptz,
  archived_at   timestamptz,
  archive_reason text,
  created_at    timestamptz not null default now()
);
alter table public.sector_supply_requests enable row level security;
create index idx_supply_mgr on public.sector_supply_requests (manager_id);

-- ── بلاغات أعطال الآليات ──
create table public.sector_breakdowns (
  id            uuid primary key default gen_random_uuid(),
  manager_id    uuid not null references auth.users (id),
  manager_name  text not null,
  shift         text not null check (shift in ('morning','evening','night')),
  sectors       smallint[] not null,
  db_number     text not null,
  fault_type    text not null,             -- نوع العطل
  notes         text,
  status        text not null default 'logged'
                check (status in ('logged','resolved','archived')),
  archived_at   timestamptz,
  archive_reason text,
  created_at    timestamptz not null default now()
);
alter table public.sector_breakdowns enable row level security;
create index idx_breakdown_mgr on public.sector_breakdowns (manager_id);

-- ── الصور المرفوعة (إرسال صور) — المسار في Storage ──
create table public.sector_photos (
  id            uuid primary key default gen_random_uuid(),
  manager_id    uuid not null references auth.users (id),
  manager_name  text not null,
  shift         text not null check (shift in ('morning','evening','night')),
  sectors       smallint[] not null,
  caption       text,
  storage_path  text not null,
  archived_at   timestamptz,
  archive_reason text,
  created_at    timestamptz not null default now()
);
alter table public.sector_photos enable row level security;
create index idx_photos_mgr on public.sector_photos (manager_id);

-- ── حضورية العمال (حاضر/غائب) — تخص المدير فقط (لا تُرسل للـ HR حالياً) ──
create table public.sector_attendance (
  id           uuid primary key default gen_random_uuid(),
  manager_id   uuid not null references auth.users (id),
  worker_id    uuid not null references public.sector_workers (id) on delete cascade,
  worker_name  text not null,
  sector_id    smallint not null references public.sectors (id),
  shift        text not null check (shift in ('morning','evening','night')),
  log_date     date not null default current_date,
  is_present   boolean not null default true,
  note         text,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (worker_id, log_date, shift)
);
alter table public.sector_attendance enable row level security;
create index idx_sector_att_date on public.sector_attendance (log_date);

-- ═══════════════════════════════════════════════════════════════
-- دوال مساعدة: قواطع المدير الحالي وهل الصف ضمنها
-- ═══════════════════════════════════════════════════════════════
create or replace function app.current_manager_sectors()
returns smallint[]
language sql stable security definer set search_path = app, public as $$
  select coalesce(
    (select sectors from public.manager_profiles where user_id = auth.uid()),
    array[]::smallint[]
  );
$$;

-- مدير يدير قاطعاً معيناً؟ (sectors مصفوفة smallint[] → any(array) وليس any(subquery))
create or replace function app.manager_manages_sector(p_sector smallint)
returns boolean
language sql stable security definer set search_path = app, public as $$
  select coalesce((
    select p_sector = any(mp.sectors)
    from public.manager_profiles mp
    where mp.user_id = auth.uid()
  ), false);
$$;

-- هل القواطع المسجلة في صف (smallint[]) ضمن قواطع المدير؟ (كلها مملوكة)
create or replace function app.manager_owns_sectors(p_sectors smallint[])
returns boolean
language sql stable security definer set search_path = app, public as $$
  select p_sectors is not null
    and coalesce(array_length(p_sectors,1),0) >= 1
    and coalesce((
      select p_sectors <@ mp.sectors
      from public.manager_profiles mp
      where mp.user_id = auth.uid()
    ), false);
$$;

-- ═══════════════════════════════════════════════════════════════
-- سياسات RLS — عزل صارم: المدير يرى/يكتب ما يخص قواطعه فقط
-- ═══════════════════════════════════════════════════════════════

-- الفريق (عمال): المدير يرى عمال قواطعه · الإدارة ترى الكل
create policy "workers: مدير يرى عمال قواطعه" on public.sector_workers
  for select to authenticated
  using (app.has_role(array['it_admin','super_admin','hr_officer'])
         or app.manager_manages_sector(sector_id));
-- الإدخال: الإدارة أو المدير (ضمن قواطعه)
create policy "workers: إدخال" on public.sector_workers
  for insert to authenticated
  with check (
    app.has_role(array['it_admin','super_admin','hr_officer'])
    or (app.has_role(array['department_manager']) and app.manager_manages_sector(sector_id))
  );
create policy "workers: تعديل" on public.sector_workers
  for update to authenticated
  using (app.has_role(array['it_admin','super_admin','hr_officer'])
         or (app.has_role(array['department_manager']) and app.manager_manages_sector(sector_id)))
  with check (app.has_role(array['it_admin','super_admin','hr_officer'])
         or (app.has_role(array['department_manager']) and app.manager_manages_sector(sector_id)));
create policy "workers: حذف للإدارة" on public.sector_workers
  for delete to authenticated
  using (app.has_role(array['it_admin','super_admin']));

-- الآليات: نفس نمط العمال
create policy "vehicles: مدير يرى آليات قواطعه" on public.sector_vehicles
  for select to authenticated
  using (app.has_role(array['it_admin','super_admin','hr_officer','maintenance'])
         or app.manager_manages_sector(sector_id));
create policy "vehicles: إدخال" on public.sector_vehicles
  for insert to authenticated
  with check (
    app.has_role(array['it_admin','super_admin','hr_officer'])
    or (app.has_role(array['department_manager']) and app.manager_manages_sector(sector_id))
  );
create policy "vehicles: تعديل" on public.sector_vehicles
  for update to authenticated
  using (app.has_role(array['it_admin','super_admin','hr_officer'])
         or (app.has_role(array['department_manager']) and app.manager_manages_sector(sector_id)))
  with check (app.has_role(array['it_admin','super_admin','hr_officer'])
         or (app.has_role(array['department_manager']) and app.manager_manages_sector(sector_id)));
create policy "vehicles: حذف للإدارة" on public.sector_vehicles
  for delete to authenticated
  using (app.has_role(array['it_admin','super_admin']));

-- طلبات المستلزمات: المدير يرى طلباته فقط · المعاون يرى كل المرفوعة
create policy "supply: صاحب الطلب" on public.sector_supply_requests
  for select to authenticated
  using (manager_id = auth.uid()
         or app.has_role(array['it_admin','super_admin','deputy_director','hr_officer']));
create policy "supply: إنشاء من مدير" on public.sector_supply_requests
  for insert to authenticated
  with check (
    app.has_role(array['department_manager'])
    and manager_id = auth.uid()
    and app.manager_owns_sectors(sectors)
  );
create policy "supply: تعديل من صاحبه" on public.sector_supply_requests
  for update to authenticated
  using (manager_id = auth.uid()
         or app.has_role(array['it_admin','super_admin','deputy_director']))
  with check (manager_id = auth.uid()
         or app.has_role(array['it_admin','super_admin','deputy_director']));

-- أعطال الآليات
create policy "breakdown: صاحب البلاغ" on public.sector_breakdowns
  for select to authenticated
  using (manager_id = auth.uid()
         or app.has_role(array['it_admin','super_admin','maintenance','deputy_director','hr_officer']));
create policy "breakdown: إنشاء من مدير" on public.sector_breakdowns
  for insert to authenticated
  with check (
    app.has_role(array['department_manager'])
    and manager_id = auth.uid()
    and app.manager_owns_sectors(sectors)
  );
create policy "breakdown: تحديث" on public.sector_breakdowns
  for update to authenticated
  using (manager_id = auth.uid()
         or app.has_role(array['it_admin','super_admin','maintenance']))
  with check (manager_id = auth.uid()
         or app.has_role(array['it_admin','super_admin','maintenance']));

-- الصور
create policy "photos: صاحب الرفع" on public.sector_photos
  for select to authenticated
  using (manager_id = auth.uid()
         or app.has_role(array['it_admin','super_admin','deputy_director','hr_officer']));
create policy "photos: رفع من مدير" on public.sector_photos
  for insert to authenticated
  with check (
    app.has_role(array['department_manager'])
    and manager_id = auth.uid()
    and app.manager_owns_sectors(sectors)
  );

-- الحضورية: المدير يرى/يكتب سجلاته فقط
create policy "attendance: صاحب السجل" on public.sector_attendance
  for select to authenticated
  using (manager_id = auth.uid()
         or app.has_role(array['it_admin','super_admin','hr_officer']));
create policy "attendance: إنشاء من مدير" on public.sector_attendance
  for insert to authenticated
  with check (
    app.has_role(array['department_manager'])
    and manager_id = auth.uid()
    and app.manager_manages_sector(sector_id)
  );

-- ═══════════════════════════════════════════════════════════════
-- Storage: bucket لصور القطاع (private) + سياسات وصول المدير
-- ═══════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('sector-photos', 'sector-photos', false)
on conflict (id) do nothing;

-- قراءة/رفع الصور: مدير داخل مجلد خاص بمعرّفه (أو إدارة)
create policy "sector-photos: read own/admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'sector-photos'
         and (auth.uid()::text = (storage.foldername(name))[1]
              or app.has_role(array['it_admin','super_admin','deputy_director'])));
create policy "sector-photos: insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'sector-photos'
         and app.has_role(array['department_manager'])
         and auth.uid()::text = (storage.foldername(name))[1]);

-- ═══════════════════════════════════════════════════════════════
-- RPC: إرسال طلب المستلزمات (يولّد رقم كتاب + ختم الإرسال)
-- ═══════════════════════════════════════════════════════════════
create or replace function public.sector_supply_submit(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_mgr uuid;
  v_ref text;
  v_num int;
begin
  select manager_id into v_mgr from public.sector_supply_requests where id = p_id;
  if v_mgr is null or v_mgr <> auth.uid() then
    if not app.has_role(array['it_admin','super_admin']) then
      raise exception 'غير مصرح بإرسال هذا الطلب';
    end if;
  end if;
  -- رقم كتاب تسلسلي بالسنة
  select count(*) + 1 into v_num from public.sector_supply_requests
    where extract(year from created_at) = extract(year from now());
  v_ref := 'كتاب/مستلزمات/' || extract(year from now())::text || '/' || lpad(v_num::text, 4, '0');
  update public.sector_supply_requests
     set status = 'submitted_to_deputy', submitted_at = now(), ref_no = v_ref
   where id = p_id;
end;
$$;
