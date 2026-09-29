-- 00158 · المتعهدون (الجولة 1): بوابة المتعهد + الأساس المشترك لغرفة العمليات والمالية
-- القرارات المعتمدة:
--   (أ) المتعهد موظف في HR بمسمى وظيفي معلَّم «متعهد» في الهيكل (خانة is_contractor_title) وغرفة العمليات تربطه بمنطقة (منطقة واحدة = متعهد واحد).
--   (ب) عمال المتعهد قائمة بسيطة (اسم + هاتف) — القاطع/المنطقة تُنسخ تلقائياً من المتعهد. ليسوا موظفي HR.
--   (ج) الحضورية: حاضر/غائب فقط. المتعهد يسجّل حضوره هو أولاً (موقع + سلفي + صورة العمال) ثم يعلّم عماله.
--       الموقع لا يمنع، لكن يُحسب «داخل/خارج نطاق المنطقة» من زونات المنطقة (gps_geofences.sector_id) لغرفة العمليات.
--   (د) غرفة العمليات تعدّل بسبب إلزامي وسجل تدقيق (الجولة 2)، والمالية تحدد أجراً شهرياً لكل عامل (الجولة 3) — الجداول هنا لتثبيت الأساس.
--   (هـ) العمال/الآليات القديمة لدى مسؤول القسم بيانات تجريبية — لا نقل. مسؤول القسم يرى: متعهد منطقته + عدد العمال + آليات تعمل الآن.

-- ═══════════════ (1) خانة «متعهد» على المسمى الوظيفي ═══════════════
alter table public.departments add column if not exists is_contractor_title boolean not null default false;
alter table public.departments drop constraint if exists departments_contractor_requires_title;
alter table public.departments add constraint departments_contractor_requires_title check (not is_contractor_title or is_job_title);
comment on column public.departments.is_contractor_title is 'المسمى الوظيفي «متعهد»: الموظفون عليه يظهرون في قائمة تعيين متعهدي المناطق (غرفة العمليات)';

-- ═══════════════ (2) الجداول ═══════════════
create table if not exists public.contractor_profiles (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  sector_id smallint not null references public.sectors(id),
  shift text not null default 'morning' check (shift in ('morning','evening','night')),
  is_active boolean not null default true,
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz not null default now(),
  notes text check (notes is null or length(notes) <= 500),
  updated_at timestamptz not null default now()
);
create unique index if not exists contractor_profiles_sector_active_uq on public.contractor_profiles(sector_id) where is_active;
alter table public.contractor_profiles enable row level security;
drop policy if exists "contractor_profiles: own or ops" on public.contractor_profiles;
create policy "contractor_profiles: own or ops" on public.contractor_profiles for select to authenticated
  using (employee_id = app.current_employee_id() or app.has_role(array['ops_room','finance_officer','department_manager','super_admin']));

create table if not exists public.contractor_workers (
  id uuid primary key default gen_random_uuid(),
  contractor_employee_id uuid not null references public.contractor_profiles(employee_id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  phone text check (phone is null or length(trim(phone)) between 3 and 30),
  sector_id smallint not null references public.sectors(id),
  parent_sector text not null,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references auth.users(id),
  remove_reason text,
  updated_at timestamptz not null default now()
);
create index if not exists contractor_workers_contractor_idx on public.contractor_workers(contractor_employee_id) where is_active;
create index if not exists contractor_workers_sector_idx on public.contractor_workers(sector_id);
alter table public.contractor_workers enable row level security;
drop policy if exists "contractor_workers: own or ops" on public.contractor_workers;
create policy "contractor_workers: own or ops" on public.contractor_workers for select to authenticated
  using (contractor_employee_id = app.current_employee_id() or app.has_role(array['ops_room','finance_officer','department_manager','super_admin']));

create table if not exists public.contractor_checkins (
  id uuid primary key default gen_random_uuid(),
  contractor_employee_id uuid not null references public.contractor_profiles(employee_id) on delete cascade,
  sector_id smallint not null references public.sectors(id),
  log_date date not null default (now() at time zone 'Asia/Baghdad')::date,
  checked_at timestamptz not null default now(),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m double precision,
  in_zone boolean,                              -- null = لا زونات معرّفة للمنطقة
  selfie_path text not null check (length(trim(selfie_path)) > 4),
  team_photo_path text not null check (length(trim(team_photo_path)) > 4),
  workers_count_at_checkin int not null default 0,
  created_at timestamptz not null default now(),
  unique (contractor_employee_id, log_date)
);
create index if not exists contractor_checkins_date_idx on public.contractor_checkins(log_date desc);
alter table public.contractor_checkins enable row level security;
drop policy if exists "contractor_checkins: own or ops" on public.contractor_checkins;
create policy "contractor_checkins: own or ops" on public.contractor_checkins for select to authenticated
  using (contractor_employee_id = app.current_employee_id() or app.has_role(array['ops_room','finance_officer','department_manager','super_admin']));

create table if not exists public.contractor_worker_attendance (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.contractor_workers(id) on delete cascade,
  contractor_employee_id uuid not null references public.contractor_profiles(employee_id) on delete cascade,
  sector_id smallint not null references public.sectors(id),
  log_date date not null,
  status text not null check (status in ('present','absent')),
  marked_by uuid not null references auth.users(id),
  marked_at timestamptz not null default now(),
  edited_by uuid references auth.users(id),
  edited_at timestamptz,
  edit_reason text,
  updated_at timestamptz not null default now(),
  unique (worker_id, log_date)
);
create index if not exists contractor_attendance_sector_date_idx on public.contractor_worker_attendance(sector_id, log_date);
alter table public.contractor_worker_attendance enable row level security;
drop policy if exists "contractor_attendance: own or ops" on public.contractor_worker_attendance;
create policy "contractor_attendance: own or ops" on public.contractor_worker_attendance for select to authenticated
  using (contractor_employee_id = app.current_employee_id() or app.has_role(array['ops_room','finance_officer','department_manager','super_admin']));

-- أجور شهرية لكل عامل (المالية — الجولة 3) + سجل تدقيق تعديلات غرفة العمليات (الجولة 2)
create table if not exists public.contractor_worker_wages (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.contractor_workers(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  monthly_wage numeric(14,2) not null check (monthly_wage >= 0),
  set_by uuid not null references auth.users(id),
  set_at timestamptz not null default now(),
  unique (worker_id, month)
);
alter table public.contractor_worker_wages enable row level security;
drop policy if exists "contractor_wages: finance" on public.contractor_worker_wages;
create policy "contractor_wages: finance" on public.contractor_worker_wages for select to authenticated
  using (app.has_role(array['finance_officer','super_admin']));

create table if not exists public.contractor_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  action text not null,
  contractor_employee_id uuid,
  worker_id uuid,
  sector_id smallint,
  log_date date,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists contractor_audit_contractor_idx on public.contractor_audit_log(contractor_employee_id, created_at desc);
alter table public.contractor_audit_log enable row level security;
drop policy if exists "contractor_audit: ops" on public.contractor_audit_log;
create policy "contractor_audit: ops" on public.contractor_audit_log for select to authenticated
  using (app.has_role(array['ops_room','super_admin']));

do $$ begin
  create trigger trg_contractor_profiles_updated before update on public.contractor_profiles for each row execute function app.set_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger trg_contractor_workers_updated before update on public.contractor_workers for each row execute function app.set_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger trg_contractor_attendance_updated before update on public.contractor_worker_attendance for each row execute function app.set_updated_at();
exception when duplicate_object then null; end $$;

-- Storage: صور الحضور (سلفي + صورة العمال) — خاص
insert into storage.buckets (id, name, public) values ('contractor-photos', 'contractor-photos', false) on conflict (id) do nothing;
drop policy if exists "contractor-photos: upload own" on storage.objects;
create policy "contractor-photos: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'contractor-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "contractor-photos: read own or ops" on storage.objects;
create policy "contractor-photos: read own or ops" on storage.objects for select to authenticated
  using (bucket_id = 'contractor-photos' and ((storage.foldername(name))[1] = auth.uid()::text or app.has_role(array['ops_room','department_manager','super_admin'])));

-- ═══════════════ (3) مساعدات ═══════════════
create or replace function app.require_contractor()
returns public.contractor_profiles
language plpgsql stable security definer set search_path = public, app as $$
declare p public.contractor_profiles;
begin
  if auth.uid() is null then raise exception 'CONTRACTOR_FORBIDDEN'; end if;
  select cp.* into p from public.contractor_profiles cp where cp.employee_id = app.current_employee_id() and cp.is_active;
  if p.employee_id is null then raise exception 'CONTRACTOR_NOT_ASSIGNED'; end if;
  return p;
end$$;
revoke all on function app.require_contractor() from public, anon;

create or replace function app.baghdad_today() returns date language sql stable as $$ select (now() at time zone 'Asia/Baghdad')::date $$;

-- داخل نطاق المنطقة؟ null إن لم تُعرَّف زونات للمنطقة
create or replace function app.point_in_sector_zones(p_sector smallint, p_lat double precision, p_lng double precision)
returns boolean language plpgsql stable security definer set search_path = public, app as $$
declare n int;
begin
  select count(*) into n from public.gps_geofences g where g.sector_id = p_sector and g.is_active;
  if n = 0 then return null; end if;
  return exists (select 1 from public.gps_geofences g where g.sector_id = p_sector and g.is_active and app.gps_point_in_polygon(p_lat, p_lng, g.polygon));
end$$;
revoke all on function app.point_in_sector_zones(smallint, double precision, double precision) from public, anon;

-- ═══════════════ (4) تعيين المتعهدين (غرفة العمليات) ═══════════════
create or replace function public.contractor_candidates(p_search text default null)
returns table(employee_id uuid, full_name text, employee_number text, job_title text, phone text, employment_status text, sector_id smallint, area_name text, is_active boolean)
language plpgsql stable security definer set search_path = public, app as $$
declare q text := trim(coalesce(p_search, ''));
begin
  if not app.has_role(array['ops_room','super_admin']) then raise exception 'CONTRACTOR_FORBIDDEN'; end if;
  return query
  select e.id, e.full_name, e.employee_number, t.name, e.phone, e.employment_status, cp.sector_id, s.name, coalesce(cp.is_active, false)
  from public.employees e join public.departments t on t.id = e.job_title_id
  left join public.contractor_profiles cp on cp.employee_id = e.id
  left join public.sectors s on s.id = cp.sector_id
  where e.employment_status <> 'terminated' and e.archived_at is null and t.is_contractor_title and t.is_active
    and (q = '' or e.full_name ilike '%' || q || '%' or e.employee_number ilike '%' || q || '%')
  order by e.full_name limit 300;
end$$;
revoke all on function public.contractor_candidates(text) from public, anon;
grant execute on function public.contractor_candidates(text) to authenticated;

create or replace function public.contractor_assign(p_employee_id uuid, p_sector_id smallint, p_shift text default 'morning', p_notes text default null)
returns public.contractor_profiles
language plpgsql security definer set search_path = public, app as $$
declare u uuid := auth.uid(); p public.contractor_profiles; before_j jsonb;
begin
  if not app.has_role(array['ops_room','super_admin']) then raise exception 'CONTRACTOR_FORBIDDEN'; end if;
  if not exists (select 1 from public.employees e join public.departments t on t.id = e.job_title_id
                 where e.id = p_employee_id and t.is_contractor_title and e.employment_status <> 'terminated' and e.archived_at is null)
  then raise exception 'CONTRACTOR_NOT_CONTRACTOR_TITLE'; end if;
  if not exists (select 1 from public.sectors where id = p_sector_id) then raise exception 'CONTRACTOR_SECTOR_INVALID'; end if;
  if p_shift not in ('morning','evening','night') then raise exception 'CONTRACTOR_SHIFT_INVALID'; end if;
  if exists (select 1 from public.contractor_profiles cp where cp.sector_id = p_sector_id and cp.is_active and cp.employee_id <> p_employee_id)
  then raise exception 'CONTRACTOR_SECTOR_TAKEN'; end if;
  select to_jsonb(cp) into before_j from public.contractor_profiles cp where cp.employee_id = p_employee_id;
  insert into public.contractor_profiles(employee_id, sector_id, shift, is_active, assigned_by, notes)
  values (p_employee_id, p_sector_id, p_shift, true, u, nullif(trim(coalesce(p_notes,'')),''))
  on conflict (employee_id) do update set sector_id = excluded.sector_id, shift = excluded.shift, is_active = true, assigned_by = u, assigned_at = now(), notes = excluded.notes
  returning * into p;
  -- عمال المتعهد النشطون ينتقلون معه إلى منطقته الجديدة
  update public.contractor_workers w set sector_id = p_sector_id, parent_sector = s.parent_sector
  from public.sectors s where s.id = p_sector_id and w.contractor_employee_id = p_employee_id and w.is_active;
  insert into public.contractor_audit_log(actor_id, action, contractor_employee_id, sector_id, before_data, after_data)
  values (u, 'assign', p_employee_id, p_sector_id, before_j, to_jsonb(p));
  return p;
end$$;
revoke all on function public.contractor_assign(uuid, smallint, text, text) from public, anon;
grant execute on function public.contractor_assign(uuid, smallint, text, text) to authenticated;

create or replace function public.contractor_unassign(p_employee_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, app as $$
declare u uuid := auth.uid(); p public.contractor_profiles;
begin
  if not app.has_role(array['ops_room','super_admin']) then raise exception 'CONTRACTOR_FORBIDDEN'; end if;
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'CONTRACTOR_REASON_REQUIRED'; end if;
  update public.contractor_profiles set is_active = false, notes = trim(p_reason) where employee_id = p_employee_id and is_active returning * into p;
  if p.employee_id is null then raise exception 'CONTRACTOR_NOT_FOUND'; end if;
  insert into public.contractor_audit_log(actor_id, action, contractor_employee_id, sector_id, after_data, reason)
  values (u, 'unassign', p_employee_id, p.sector_id, to_jsonb(p), trim(p_reason));
end$$;
revoke all on function public.contractor_unassign(uuid, text) from public, anon;
grant execute on function public.contractor_unassign(uuid, text) to authenticated;

-- ═══════════════ (5) بوابة المتعهد ═══════════════
-- ملفي: من أنا، منطقتي، عدد عمالي، حالة حضور اليوم
create or replace function public.contractor_me()
returns table(employee_id uuid, full_name text, employee_number text, sector_id smallint, area_name text, parent_sector text, shift text,
              workers_count int, today date, checked_in_today boolean, checkin_at timestamptz, in_zone boolean, selfie_path text, team_photo_path text,
              today_present int, today_absent int, today_unmarked int, month_present int, month_absent int, zone_defined boolean)
language plpgsql stable security definer set search_path = public, app as $$
declare p public.contractor_profiles; d date := app.baghdad_today();
begin
  p := app.require_contractor();
  return query
  select p.employee_id, e.full_name, e.employee_number, p.sector_id, s.name, s.parent_sector, p.shift,
    (select count(*)::int from public.contractor_workers w where w.contractor_employee_id = p.employee_id and w.is_active),
    d, c.id is not null, c.checked_at, c.in_zone, c.selfie_path, c.team_photo_path,
    (select count(*)::int from public.contractor_worker_attendance a where a.contractor_employee_id = p.employee_id and a.log_date = d and a.status = 'present'),
    (select count(*)::int from public.contractor_worker_attendance a where a.contractor_employee_id = p.employee_id and a.log_date = d and a.status = 'absent'),
    (select count(*)::int from public.contractor_workers w where w.contractor_employee_id = p.employee_id and w.is_active
       and not exists (select 1 from public.contractor_worker_attendance a where a.worker_id = w.id and a.log_date = d)),
    (select count(*)::int from public.contractor_worker_attendance a where a.contractor_employee_id = p.employee_id and a.status = 'present' and date_trunc('month', a.log_date) = date_trunc('month', d)),
    (select count(*)::int from public.contractor_worker_attendance a where a.contractor_employee_id = p.employee_id and a.status = 'absent' and date_trunc('month', a.log_date) = date_trunc('month', d)),
    exists (select 1 from public.gps_geofences g where g.sector_id = p.sector_id and g.is_active)
  from public.employees e join public.sectors s on s.id = p.sector_id
  left join public.contractor_checkins c on c.contractor_employee_id = p.employee_id and c.log_date = d
  where e.id = p.employee_id;
end$$;
revoke all on function public.contractor_me() from public, anon;
grant execute on function public.contractor_me() to authenticated;

-- عمالي مع حالة اليوم (أو يوم محدد)
create or replace function public.contractor_my_workers(p_date date default null)
returns table(id uuid, full_name text, phone text, sector_id smallint, area_name text, parent_sector text, created_at timestamptz,
              status text, marked_at timestamptz, month_present int, month_absent int)
language plpgsql stable security definer set search_path = public, app as $$
declare p public.contractor_profiles; d date := coalesce(p_date, app.baghdad_today());
begin
  p := app.require_contractor();
  return query
  select w.id, w.full_name, w.phone, w.sector_id, s.name, w.parent_sector, w.created_at, a.status, a.marked_at,
    (select count(*)::int from public.contractor_worker_attendance x where x.worker_id = w.id and x.status = 'present' and date_trunc('month', x.log_date) = date_trunc('month', d)),
    (select count(*)::int from public.contractor_worker_attendance x where x.worker_id = w.id and x.status = 'absent' and date_trunc('month', x.log_date) = date_trunc('month', d))
  from public.contractor_workers w join public.sectors s on s.id = w.sector_id
  left join public.contractor_worker_attendance a on a.worker_id = w.id and a.log_date = d
  where w.contractor_employee_id = p.employee_id and w.is_active
  order by w.full_name;
end$$;
revoke all on function public.contractor_my_workers(date) from public, anon;
grant execute on function public.contractor_my_workers(date) to authenticated;

create or replace function public.contractor_add_worker(p_full_name text, p_phone text default null)
returns public.contractor_workers
language plpgsql security definer set search_path = public, app as $$
declare p public.contractor_profiles; w public.contractor_workers; ps text;
begin
  p := app.require_contractor();
  if length(trim(coalesce(p_full_name,''))) < 2 then raise exception 'CONTRACTOR_WORKER_NAME_INVALID'; end if;
  if exists (select 1 from public.contractor_workers x where x.contractor_employee_id = p.employee_id and x.is_active and lower(trim(x.full_name)) = lower(trim(p_full_name)))
  then raise exception 'CONTRACTOR_WORKER_DUPLICATE'; end if;
  select parent_sector into ps from public.sectors where id = p.sector_id;
  insert into public.contractor_workers(contractor_employee_id, full_name, phone, sector_id, parent_sector, created_by)
  values (p.employee_id, trim(p_full_name), nullif(trim(coalesce(p_phone,'')),''), p.sector_id, ps, auth.uid()) returning * into w;
  insert into public.contractor_audit_log(actor_id, action, contractor_employee_id, worker_id, sector_id, after_data)
  values (auth.uid(), 'worker_add', p.employee_id, w.id, w.sector_id, to_jsonb(w));
  return w;
end$$;
revoke all on function public.contractor_add_worker(text, text) from public, anon;
grant execute on function public.contractor_add_worker(text, text) to authenticated;

create or replace function public.contractor_remove_worker(p_worker_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public, app as $$
declare p public.contractor_profiles; w public.contractor_workers;
begin
  p := app.require_contractor();
  update public.contractor_workers set is_active = false, removed_at = now(), removed_by = auth.uid(), remove_reason = nullif(trim(coalesce(p_reason,'')),'')
  where id = p_worker_id and contractor_employee_id = p.employee_id and is_active returning * into w;
  if w.id is null then raise exception 'CONTRACTOR_WORKER_NOT_FOUND'; end if;
  insert into public.contractor_audit_log(actor_id, action, contractor_employee_id, worker_id, sector_id, after_data, reason)
  values (auth.uid(), 'worker_remove', p.employee_id, w.id, w.sector_id, to_jsonb(w), w.remove_reason);
end$$;
revoke all on function public.contractor_remove_worker(uuid, text) from public, anon;
grant execute on function public.contractor_remove_worker(uuid, text) to authenticated;

-- تسجيل حضور المتعهد نفسه: موقع + سلفي + صورة العمال (مرة واحدة يومياً)
create or replace function public.contractor_checkin(p_lat double precision, p_lng double precision, p_accuracy double precision, p_selfie_path text, p_team_photo_path text)
returns public.contractor_checkins
language plpgsql security definer set search_path = public, app as $$
declare p public.contractor_profiles; c public.contractor_checkins; d date := app.baghdad_today(); n int;
begin
  p := app.require_contractor();
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'CONTRACTOR_LOCATION_REQUIRED'; end if;
  if length(trim(coalesce(p_selfie_path,''))) < 5 then raise exception 'CONTRACTOR_SELFIE_REQUIRED'; end if;
  if length(trim(coalesce(p_team_photo_path,''))) < 5 then raise exception 'CONTRACTOR_TEAM_PHOTO_REQUIRED'; end if;
  if exists (select 1 from public.contractor_checkins x where x.contractor_employee_id = p.employee_id and x.log_date = d) then raise exception 'CONTRACTOR_ALREADY_CHECKED_IN'; end if;
  select count(*) into n from public.contractor_workers w where w.contractor_employee_id = p.employee_id and w.is_active;
  insert into public.contractor_checkins(contractor_employee_id, sector_id, log_date, latitude, longitude, accuracy_m, in_zone, selfie_path, team_photo_path, workers_count_at_checkin)
  values (p.employee_id, p.sector_id, d, p_lat, p_lng, p_accuracy, app.point_in_sector_zones(p.sector_id, p_lat, p_lng), trim(p_selfie_path), trim(p_team_photo_path), n)
  returning * into c;
  if c.in_zone is false then
    perform app.support_notify(app.ops_room_users(), 'حضور متعهد خارج نطاق منطقته',
      format('%s سجّل حضوره خارج زونات منطقة %s', (select full_name from public.employees where id = p.employee_id), (select name from public.sectors where id = p.sector_id)),
      'warning', '/ops-room/contractors', c.id, 'contractor_out_of_zone');
  end if;
  return c;
end$$;
revoke all on function public.contractor_checkin(double precision, double precision, double precision, text, text) from public, anon;
grant execute on function public.contractor_checkin(double precision, double precision, double precision, text, text) to authenticated;

-- تعليم حضور عامل (حاضر/غائب) لليوم — يتطلب تسجيل حضور المتعهد أولاً
create or replace function public.contractor_mark_attendance(p_worker_id uuid, p_status text, p_date date default null)
returns public.contractor_worker_attendance
language plpgsql security definer set search_path = public, app as $$
declare p public.contractor_profiles; w public.contractor_workers; a public.contractor_worker_attendance; d date := coalesce(p_date, app.baghdad_today());
begin
  p := app.require_contractor();
  if p_status not in ('present','absent') then raise exception 'CONTRACTOR_STATUS_INVALID'; end if;
  if d > app.baghdad_today() then raise exception 'CONTRACTOR_DATE_FUTURE'; end if;
  if d < app.baghdad_today() - 1 then raise exception 'CONTRACTOR_DATE_LOCKED'; end if;   -- اليوم أو أمس فقط؛ ما قبل ذلك من غرفة العمليات بسبب
  select * into w from public.contractor_workers where id = p_worker_id and contractor_employee_id = p.employee_id and is_active;
  if w.id is null then raise exception 'CONTRACTOR_WORKER_NOT_FOUND'; end if;
  if not exists (select 1 from public.contractor_checkins c where c.contractor_employee_id = p.employee_id and c.log_date = d) then raise exception 'CONTRACTOR_CHECKIN_REQUIRED'; end if;
  insert into public.contractor_worker_attendance(worker_id, contractor_employee_id, sector_id, log_date, status, marked_by)
  values (w.id, p.employee_id, w.sector_id, d, p_status, auth.uid())
  on conflict (worker_id, log_date) do update set status = excluded.status, marked_by = auth.uid(), marked_at = now()
  returning * into a;
  return a;
end$$;
revoke all on function public.contractor_mark_attendance(uuid, text, date) from public, anon;
grant execute on function public.contractor_mark_attendance(uuid, text, date) to authenticated;

-- تعليم الجميع دفعة واحدة (كلهم حاضرون ثم يستثني الغائبين)
create or replace function public.contractor_mark_all(p_status text, p_date date default null)
returns int language plpgsql security definer set search_path = public, app as $$
declare p public.contractor_profiles; w record; n int := 0;
begin
  p := app.require_contractor();
  for w in select id from public.contractor_workers x where x.contractor_employee_id = p.employee_id and x.is_active loop
    perform public.contractor_mark_attendance(w.id, p_status, p_date); n := n + 1;
  end loop;
  return n;
end$$;
revoke all on function public.contractor_mark_all(text, date) from public, anon;
grant execute on function public.contractor_mark_all(text, date) to authenticated;

-- شبكة الشهر للمتعهد (لصفحته الرئيسية): لكل عامل أيام الحضور/الغياب
create or replace function public.contractor_month_grid(p_month date default null)
returns table(worker_id uuid, full_name text, days jsonb, present_days int, absent_days int)
language plpgsql stable security definer set search_path = public, app as $$
declare p public.contractor_profiles; m date := date_trunc('month', coalesce(p_month, app.baghdad_today()))::date;
begin
  p := app.require_contractor();
  return query
  select w.id, w.full_name,
    coalesce((select jsonb_object_agg(extract(day from a.log_date)::int, a.status) from public.contractor_worker_attendance a
              where a.worker_id = w.id and a.log_date >= m and a.log_date < m + interval '1 month'), '{}'::jsonb),
    (select count(*)::int from public.contractor_worker_attendance a where a.worker_id = w.id and a.status = 'present' and a.log_date >= m and a.log_date < m + interval '1 month'),
    (select count(*)::int from public.contractor_worker_attendance a where a.worker_id = w.id and a.status = 'absent' and a.log_date >= m and a.log_date < m + interval '1 month')
  from public.contractor_workers w
  where w.contractor_employee_id = p.employee_id and (w.is_active or exists (select 1 from public.contractor_worker_attendance a where a.worker_id = w.id and a.log_date >= m and a.log_date < m + interval '1 month'))
  order by w.full_name;
end$$;
revoke all on function public.contractor_month_grid(date) from public, anon;
grant execute on function public.contractor_month_grid(date) to authenticated;

-- ═══════════════ (6) مسؤول القسم: فريقي = متعهد المنطقة + عدد العمال + آليات تعمل الآن ═══════════════
create or replace function public.manager_team_summary()
returns table(sector_id smallint, area_name text, parent_sector text, contractor_employee_id uuid, contractor_name text, contractor_phone text,
              workers_count int, today_present int, today_absent int, contractor_checked_in boolean, contractor_checkin_at timestamptz, in_zone boolean,
              vehicles_now int, vehicles jsonb)
language plpgsql stable security definer set search_path = public, app as $$
declare u uuid := auth.uid(); d date := app.baghdad_today();
begin
  if u is null or not app.has_role(array['department_manager','super_admin']) then raise exception 'MANAGER_FORBIDDEN'; end if;
  return query
  select s.id, s.name, s.parent_sector, cp.employee_id, e.full_name, e.phone,
    (select count(*)::int from public.contractor_workers w where w.contractor_employee_id = cp.employee_id and w.is_active),
    (select count(*)::int from public.contractor_worker_attendance a where a.contractor_employee_id = cp.employee_id and a.log_date = d and a.status = 'present'),
    (select count(*)::int from public.contractor_worker_attendance a where a.contractor_employee_id = cp.employee_id and a.log_date = d and a.status = 'absent'),
    c.id is not null, c.checked_at, c.in_zone,
    (select count(*)::int from public.garage_departures gd where gd.sector_id = s.id and gd.returned_at is null and gd.arrived_at is not null and gd.site_departed_at is null),
    coalesce((select jsonb_agg(jsonb_build_object('id', gd.id, 'db_number', v.db_number, 'vehicle_name', v.vehicle_name, 'driver_name', gd.driver_name, 'shift', gd.shift, 'arrived_at', gd.arrived_at, 'trip_status', app.trip_status(gd.id)) order by gd.arrived_at)
              from public.garage_departures gd join public.garage_vehicles v on v.id = gd.vehicle_id
              where gd.sector_id = s.id and gd.returned_at is null and gd.arrived_at is not null and gd.site_departed_at is null), '[]'::jsonb)
  from public.manager_profiles mp
  join public.sectors s on s.id = any(mp.sectors)
  left join public.contractor_profiles cp on cp.sector_id = s.id and cp.is_active
  left join public.employees e on e.id = cp.employee_id
  left join public.contractor_checkins c on c.contractor_employee_id = cp.employee_id and c.log_date = d
  where mp.user_id = u
  order by s.id;
end$$;
revoke all on function public.manager_team_summary() from public, anon;
grant execute on function public.manager_team_summary() to authenticated;

-- ═══════════════ (7) الهيكل: خانة «متعهد» في العرض والحفظ ═══════════════
drop function if exists public.hr_departments_overview();
create function public.hr_departments_overview()
returns table(id uuid, name text, code text, parent_id uuid, is_active boolean, manager_id uuid, manager_name text,
              employees_active int, employees_total int, children int, created_at timestamptz, is_job_title boolean, drives_vehicles boolean,
              maintenance_specialty text, is_contractor_title boolean)
language sql stable security definer set search_path = public, app as $$
  select d.id, d.name, d.code, d.parent_id, d.is_active, d.manager_id, m.full_name,
    (select count(*)::int from public.employees e where e.employment_status <> 'terminated' and e.archived_at is null
        and (case when d.is_job_title then e.job_title_id = d.id else e.department_id = d.id end)),
    (select count(*)::int from public.employees e where (case when d.is_job_title then e.job_title_id = d.id else e.department_id = d.id end)),
    (select count(*)::int from public.departments c where c.parent_id = d.id and c.is_active),
    d.created_at, d.is_job_title, d.drives_vehicles, d.maintenance_specialty, d.is_contractor_title
  from public.departments d
  left join public.employees m on m.id = d.manager_id
  where d.archived_at is null and app.has_role(array['hr_officer', 'super_admin', 'it_admin'])
  order by d.name;
$$;
grant execute on function public.hr_departments_overview() to authenticated;

drop function if exists public.hr_department_save(uuid, text, text, uuid, boolean, uuid, boolean, boolean, text);
create function public.hr_department_save(p_id uuid, p_name text, p_code text, p_parent uuid, p_is_active boolean default true, p_manager uuid default null,
                                          p_is_job_title boolean default false, p_drives_vehicles boolean default false, p_maintenance_specialty text default null, p_is_contractor_title boolean default false)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_id uuid := p_id; v_cur uuid; v_n int; v_code text := upper(trim(coalesce(p_code, ''))); v_title boolean := coalesce(p_is_job_title, false);
        v_drives boolean := coalesce(p_drives_vehicles, false) and coalesce(p_is_job_title, false); parent_rec public.departments;
        v_spec text := case when coalesce(p_is_job_title, false) then nullif(trim(coalesce(p_maintenance_specialty, '')), '') else null end;
        v_contr boolean := coalesce(p_is_contractor_title, false) and coalesce(p_is_job_title, false);
begin
  if not app.has_role(array['hr_officer', 'super_admin', 'it_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'HR_DEPT_NAME_REQUIRED'; end if;
  if v_code = '' then raise exception 'HR_DEPT_CODE_REQUIRED'; end if;
  if v_spec is not null and v_spec not in ('mechanical','electrical','bodywork','tires','hydraulic','ac','general') then raise exception 'HR_MAINTENANCE_SPECIALTY_INVALID'; end if;
  if exists (select 1 from public.departments d where d.code = v_code and (p_id is null or d.id <> p_id)) then raise exception 'HR_DEPT_CODE_TAKEN'; end if;
  if p_parent is not null then
    if p_id is not null and p_parent = p_id then raise exception 'HR_DEPT_CYCLE'; end if;
    select * into parent_rec from public.departments where id = p_parent and archived_at is null;
    if not found then raise exception 'HR_DEPT_PARENT_INVALID'; end if;
    if parent_rec.is_job_title then raise exception 'HR_DEPT_PARENT_IS_JOB_TITLE'; end if;
    if p_id is not null then
      v_cur := p_parent;
      for v_n in 1..64 loop
        exit when v_cur is null;
        if v_cur = p_id then raise exception 'HR_DEPT_CYCLE'; end if;
        select parent_id into v_cur from public.departments where id = v_cur;
      end loop;
    end if;
  end if;
  if v_title and p_parent is null then raise exception 'HR_JOB_TITLE_PARENT_REQUIRED'; end if;
  if v_title and exists (select 1 from public.departments d where d.parent_id = p_parent and d.is_job_title and d.archived_at is null
                          and lower(trim(d.name)) = lower(trim(p_name)) and (p_id is null or d.id <> p_id)) then raise exception 'HR_JOB_TITLE_NAME_TAKEN'; end if;
  if p_manager is not null and not exists (select 1 from public.employees where id = p_manager and employment_status <> 'terminated') then raise exception 'HR_DEPT_MANAGER_INVALID'; end if;

  if p_id is null then
    insert into public.departments (name, code, parent_id, is_active, manager_id, is_job_title, drives_vehicles, maintenance_specialty, is_contractor_title)
    values (trim(p_name), v_code, p_parent, coalesce(p_is_active, true), p_manager, v_title, v_drives, v_spec, v_contr) returning id into v_id;
  else
    if not exists (select 1 from public.departments where id = p_id) then raise exception 'HR_NOT_FOUND'; end if;
    if v_title and exists (select 1 from public.departments where parent_id = p_id and archived_at is null) then raise exception 'HR_JOB_TITLE_HAS_CHILDREN'; end if;
    if not v_title and exists (select 1 from public.employees where job_title_id = p_id and employment_status <> 'terminated') then raise exception 'HR_JOB_TITLE_IN_USE'; end if;
    if p_is_active is false then
      if exists (select 1 from public.employees where (department_id = p_id or job_title_id = p_id) and employment_status <> 'terminated') then raise exception 'HR_DEPT_HAS_EMPLOYEES'; end if;
      if exists (select 1 from public.departments where parent_id = p_id and is_active) then raise exception 'HR_DEPT_HAS_CHILDREN'; end if;
    end if;
    update public.departments set name = trim(p_name), code = v_code, parent_id = p_parent, is_active = coalesce(p_is_active, true), manager_id = p_manager,
                                  is_job_title = v_title, drives_vehicles = v_drives, maintenance_specialty = v_spec, is_contractor_title = v_contr, updated_at = now()
     where id = p_id;
  end if;
  return v_id;
end$$;
grant execute on function public.hr_department_save(uuid, text, text, uuid, boolean, uuid, boolean, boolean, text, boolean) to authenticated;

