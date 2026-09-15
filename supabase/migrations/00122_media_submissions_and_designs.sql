-- ═══════════════════════════════════════════════════════════════════
-- 00122 · بوابة الإعلام: تذاكر الصور والتصاميم
--
--  · مسؤول القسم يرسل صوراً (حتى 500) بثلاث طرق:
--    street (اسم شارع) · campaign (حملة) · school (حملة مدارس)
--    القاطع والقسم يُشتقان تلقائياً من حساب المسؤول، والنوع لكل إرسال
--  · تصل الصور لبوابة الإعلام كتذكرات حسب القاطع، مفلترة حسب النوع
--  · مسؤول الإعلام: تعديل المعلومات + تحديد صور → إرسال للتصميم
--    (الصور المحددة فقط تدخل التصميم، والتذكرة كاملة تبقى في فولدر القاطع)
--  · التصميم: غلاف يدوي (الورقة الأولى) + تقرير تلقائي (الورقة الثانية)
--    + لوحات صور لكل نوع عمل — بدورة نصف شهري (1–14 / 15–آخر يوم) أو شهري
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1) تذاكر الصور ───
create table public.media_submissions (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('street', 'campaign', 'school')),
  title text not null check (length(trim(title)) between 2 and 200),
  work_type text,
  sector_parent text not null check (sector_parent in ('karrada', 'zaafaraniya')),
  sector_ids smallint[] not null,
  event_date date not null,
  notes text,
  photo_count integer not null default 0 check (photo_count >= 0),
  status text not null default 'submitted' check (status in ('submitted', 'archived')),
  submitted_by uuid not null references auth.users(id),
  submitted_by_name text not null,
  archived_at timestamptz,
  archived_by uuid references auth.users(id),
  archive_reason text,
  created_at timestamptz not null default now()
);

create index if not exists media_submissions_time
  on public.media_submissions (sector_parent, created_at desc);
create index if not exists media_submissions_work_type
  on public.media_submissions (work_type) where work_type is not null;

comment on table public.media_submissions is
  'تذكرات صور مسؤول القسم: شارع/حملة/حملة مدارس — القاطع والقسم من حساب المسؤول (حتى 500 صورة)';

alter table public.media_submissions enable row level security;
create policy "media submissions: قراءة" on public.media_submissions
  for select to authenticated
  using (
    app.has_role(array['media_officer', 'super_admin'])
    or submitted_by = auth.uid()
  );

create table public.media_submission_photos (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.media_submissions(id) on delete cascade,
  storage_path text not null check (length(storage_path) > 4),
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);

create index if not exists media_submission_photos_order
  on public.media_submission_photos (submission_id, sort_order);

alter table public.media_submission_photos enable row level security;
create policy "media submission photos: قراءة" on public.media_submission_photos
  for select to authenticated
  using (
    app.has_role(array['media_officer', 'super_admin'])
    or exists (
      select 1 from public.media_submissions s
      where s.id = submission_id and s.submitted_by = auth.uid()
    )
  );

create trigger trg_audit_media_submissions
  after insert or update or delete on public.media_submissions
  for each row execute function app.audit_trigger();

create trigger trg_audit_media_submission_photos
  after insert or update or delete on public.media_submission_photos
  for each row execute function app.audit_trigger();

-- ─── 2) التصاميم ───
create table public.media_designs (
  id uuid primary key default gen_random_uuid(),
  sector_parent text not null check (sector_parent in ('karrada', 'zaafaraniya')),
  period_type text not null check (period_type in ('first_half', 'second_half', 'monthly')),
  period_start date not null,
  period_end date not null,
  title text not null check (length(trim(title)) between 2 and 300),
  cover_image_path text,
  status text not null default 'draft' check (status in ('draft', 'completed')),
  photo_count integer not null default 0 check (photo_count >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by uuid references auth.users(id),
  unique (sector_parent, period_start, period_end)
);

create index if not exists media_designs_status
  on public.media_designs (sector_parent, status, created_at desc);

comment on table public.media_designs is
  'تصاميم إعلامية: غلاف يدوي + تقرير تلقائي + لوحات صور — بدورة نصف شهري (1–14 / 15–آخر) أو شهري';

alter table public.media_designs enable row level security;
create policy "media designs: قراءة" on public.media_designs
  for select to authenticated
  using (app.has_role(array['media_officer', 'super_admin']));

create table public.media_design_photos (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.media_designs(id) on delete cascade,
  source_photo_id uuid references public.media_submission_photos(id),
  source_submission_id uuid references public.media_submissions(id),
  work_type text not null,
  storage_path text not null,
  caption text,
  sort_order integer not null default 0
);

create index if not exists media_design_photos_order
  on public.media_design_photos (design_id, work_type, sort_order);

alter table public.media_design_photos enable row level security;
create policy "media design photos: قراءة" on public.media_design_photos
  for select to authenticated
  using (app.has_role(array['media_officer', 'super_admin']));

create trigger trg_audit_media_designs
  after insert or update or delete on public.media_designs
  for each row execute function app.audit_trigger();

-- ─── 3) حاوية التخزين ───
insert into storage.buckets (id, name, public)
values ('media-photos', 'media-photos', false)
on conflict (id) do nothing;

create policy "media photos: رفع من مسؤول قسم"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media-photos'
    and app.has_role(array['department_manager'])
    and (name like auth.uid()::text || '/%')
  );

create policy "media photos: رفع غلاف من مسؤول الإعلام"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media-photos'
    and app.has_role(array['media_officer', 'super_admin'])
    and (name like 'media-officer/%')
  );

create policy "media photos: قراءة للإعلام والمرفوع"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'media-photos'
    and (
      app.has_role(array['media_officer', 'super_admin'])
      or (name like auth.uid()::text || '/%' and app.has_role(array['department_manager']))
    )
  );

-- ─── 4) نطاقات دورات التصميم ───
-- النصف الأول: 1–14 · النصف الثاني: 15–آخر يوم · شهري: أول–آخر (تقويم بغداد)
create or replace function app.media_period_range(p_period_type text, p_month date default null)
returns table(period_start date, period_end date)
language sql stable
set search_path = public, app
as $$
  with m as (
    select date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Baghdad')::date))::date as first_day
  )
  select
    case
      when p_period_type = 'first_half' then m.first_day
      when p_period_type = 'second_half' then m.first_day + 14
      else m.first_day
    end as period_start,
    case
      when p_period_type = 'first_half' then m.first_day + 13
      else (m.first_day + interval '1 month')::date - 1
    end as period_end
  from m
$$;

-- ─── 5) دوال الأعمال ───

-- إرسال تذاكر الصور (من بوابة مسؤول القسم)
create or replace function public.media_send_photos(
  p_mode text,
  p_title text,
  p_work_type text default null,
  p_notes text default null,
  p_photos jsonb default null
)
returns public.media_submissions
language plpgsql volatile security definer
set search_path = public, app
as $$
declare
  u uuid := auth.uid();
  mp public.manager_profiles;
  v_parent text;
  v_name text;
  v_row public.media_submissions;
  ph jsonb;
  v_path text;
  v_caption text;
  v_seq integer := 0;
  v_count integer := 0;
begin
  if not app.has_role(array['department_manager']) then
    raise exception 'MEDIA_FORBIDDEN';
  end if;
  if p_mode not in ('street', 'campaign', 'school')
     or length(trim(coalesce(p_title, ''))) < 2 or length(p_title) > 200 then
    raise exception 'MEDIA_SUBMISSION_INPUT_INVALID';
  end if;
  if p_photos is null or jsonb_typeof(p_photos) <> 'array'
     or jsonb_array_length(p_photos) < 1 or jsonb_array_length(p_photos) > 500 then
    raise exception 'MEDIA_PHOTOS_COUNT_INVALID';
  end if;

  select * into mp from public.manager_profiles where user_id = u;
  if mp is null then
    raise exception 'MEDIA_MANAGER_PROFILE_MISSING';
  end if;
  if not app.manager_owns_sectors(mp.sectors) then
    raise exception 'MEDIA_SECTORS_INVALID';
  end if;

  -- القاطع يُشتق تلقائياً من أقسام المسؤول
  select distinct s.parent_sector into v_parent
  from public.sectors s
  where s.id = any (mp.sectors)
  limit 1;
  if v_parent is null then
    raise exception 'MEDIA_SECTOR_DERIVE_FAILED';
  end if;

  select e.full_name into v_name
  from public.employees e where e.user_id = u limit 1;
  if v_name is null or trim(v_name) = '' then
    v_name := u::text;
  end if;

  insert into public.media_submissions
    (mode, title, work_type, sector_parent, sector_ids, event_date, notes,
     photo_count, submitted_by, submitted_by_name)
  values (
    p_mode, trim(p_title),
    nullif(trim(coalesce(p_work_type, '')), ''),
    v_parent, mp.sectors,
    (now() at time zone 'Asia/Baghdad')::date,
    nullif(trim(coalesce(p_notes, '')), ''),
    0, u, v_name
  ) returning * into v_row;

  for ph in select * from jsonb_array_elements(p_photos) loop
    v_path := ph->>'storage_path';
    v_caption := ph->>'caption';
    if length(coalesce(v_path, '')) < 5 or v_path not like u::text || '/%' then
      raise exception 'MEDIA_PHOTO_PATH_INVALID';
    end if;
    v_seq := v_seq + 1;
    v_count := v_count + 1;
    insert into public.media_submission_photos
      (submission_id, storage_path, caption, sort_order, created_by)
    values (
      v_row.id, v_path, nullif(trim(coalesce(v_caption, '')), ''),
      v_seq, u
    );
  end loop;

  update public.media_submissions
     set photo_count = v_count
   where id = v_row.id
   returning * into v_row;

  return v_row;
end;
$$;

-- قائمة التذكرات (بوابة الإعلام)
create or replace function public.media_submissions_list(
  p_sector_parent text default null,
  p_status text default 'active',
  p_work_type text default null
)
returns setof public.media_submissions
language plpgsql stable security definer
set search_path = public, app
as $$
begin
  if not app.has_role(array['media_officer', 'super_admin']) then
    raise exception 'MEDIA_FORBIDDEN';
  end if;
  return query
  select s.* from public.media_submissions s
   where (p_sector_parent is null or s.sector_parent = p_sector_parent)
     and (coalesce(p_status, 'active') = 'all'
          or (p_status = 'active' and s.status = 'submitted')
          or (p_status = 'archived' and s.status = 'archived'))
     and (p_work_type is null or s.work_type = p_work_type)
   order by s.created_at desc
   limit 200;
end;
$$;

-- صور التذكرة
create or replace function public.media_submission_photos_list(p_submission_id uuid)
returns setof public.media_submission_photos
language plpgsql stable security definer
set search_path = public, app
as $$
begin
  if not app.has_role(array['media_officer', 'super_admin']) then
    raise exception 'MEDIA_FORBIDDEN';
  end if;
  return query
  select p.* from public.media_submission_photos p
   where p.submission_id = p_submission_id
   order by p.sort_order;
end;
$$;

-- تعديل معلومات التذكرة (مسؤول الإعلام)
create or replace function public.media_submission_update(
  p_id uuid,
  p_title text,
  p_work_type text,
  p_event_date date,
  p_notes text
)
returns public.media_submissions
language plpgsql volatile security definer
set search_path = public, app
as $$
declare
  r public.media_submissions;
begin
  if not app.has_role(array['media_officer', 'super_admin']) then
    raise exception 'MEDIA_FORBIDDEN';
  end if;
  if length(trim(coalesce(p_title, ''))) < 2 or length(p_title) > 200 then
    raise exception 'MEDIA_SUBMISSION_INPUT_INVALID';
  end if;
  update public.media_submissions
     set title = trim(p_title),
         work_type = nullif(trim(coalesce(p_work_type, '')), ''),
         event_date = coalesce(p_event_date, event_date),
         notes = nullif(trim(coalesce(p_notes, '')), '')
   where id = p_id
   returning * into r;
  if not found then
    raise exception 'MEDIA_SUBMISSION_NOT_FOUND';
  end if;
  return r;
end;
$$;

-- تعديل وصف صورة
create or replace function public.media_photo_update(p_photo_id uuid, p_caption text)
returns public.media_submission_photos
language plpgsql volatile security definer
set search_path = public, app
as $$
declare
  r public.media_submission_photos;
begin
  if not app.has_role(array['media_officer', 'super_admin']) then
    raise exception 'MEDIA_FORBIDDEN';
  end if;
  update public.media_submission_photos
     set caption = nullif(trim(coalesce(p_caption, '')), '')
   where id = p_photo_id
   returning * into r;
  if not found then
    raise exception 'MEDIA_PHOTO_NOT_FOUND';
  end if;
  return r;
end;
$$;

-- أرشفة التذكرة
create or replace function public.media_submission_archive(p_id uuid, p_reason text default null)
returns public.media_submissions
language plpgsql volatile security definer
set search_path = public, app
as $$
declare
  r public.media_submissions;
begin
  if not app.has_role(array['media_officer', 'super_admin']) then
    raise exception 'MEDIA_FORBIDDEN';
  end if;
  update public.media_submissions
     set status = 'archived',
         archived_at = now(),
         archived_by = auth.uid(),
         archive_reason = nullif(trim(coalesce(p_reason, '')), '')
   where id = p_id and status = 'submitted'
   returning * into r;
  if not found then
    raise exception 'MEDIA_SUBMISSION_NOT_ARCHIVABLE';
  end if;
  return r;
end;
$$;

-- إنشاء تصميم (الصور المحددة فقط)
create or replace function public.media_design_create(
  p_sector_parent text,
  p_period_type text,
  p_title text,
  p_cover_path text default null,
  p_photos jsonb default null
)
returns public.media_designs
language plpgsql volatile security definer
set search_path = public, app
as $$
declare
  u uuid := auth.uid();
  v_start date;
  v_end date;
  d public.media_designs;
  ph jsonb;
  src public.media_submission_photos;
  v_seq integer := 0;
  v_count integer := 0;
begin
  if not app.has_role(array['media_officer', 'super_admin']) then
    raise exception 'MEDIA_FORBIDDEN';
  end if;
  if p_sector_parent not in ('karrada', 'zaafaraniya')
     or p_period_type not in ('first_half', 'second_half', 'monthly')
     or length(trim(coalesce(p_title, ''))) < 2 or length(p_title) > 300 then
    raise exception 'MEDIA_DESIGN_INPUT_INVALID';
  end if;
  if p_photos is null or jsonb_typeof(p_photos) <> 'array'
     or jsonb_array_length(p_photos) < 1 or jsonb_array_length(p_photos) > 500 then
    raise exception 'MEDIA_DESIGN_PHOTOS_INVALID';
  end if;

  select period_start, period_end into v_start, v_end
  from app.media_period_range(p_period_type);

  insert into public.media_designs
    (sector_parent, period_type, period_start, period_end, title, cover_image_path, photo_count, created_by)
  values (
    p_sector_parent, p_period_type, v_start, v_end, trim(p_title),
    nullif(trim(coalesce(p_cover_path, '')), ''), 0, u
  ) returning * into d;

  for ph in select * from jsonb_array_elements(p_photos) loop
    select * into src from public.media_submission_photos
     where id = (ph->>'photo_id')::uuid;
    if not found then
      raise exception 'MEDIA_DESIGN_PHOTO_NOT_FOUND';
    end if;
    v_seq := v_seq + 1;
    v_count := v_count + 1;
    insert into public.media_design_photos
      (design_id, source_photo_id, source_submission_id, work_type, storage_path, caption, sort_order)
    values (
      d.id, src.id, src.submission_id,
      coalesce(nullif(trim(coalesce(ph->>'work_type', '')), ''), 'عام'),
      src.storage_path, nullif(trim(coalesce(ph->>'caption', '')), ''),
      v_seq
    );
  end loop;

  update public.media_designs set photo_count = v_count where id = d.id returning * into d;
  return d;
end;
$$;

-- قائمة التصاميم
create or replace function public.media_designs_list(p_sector_parent text default null)
returns setof public.media_designs
language plpgsql stable security definer
set search_path = public, app
as $$
begin
  if not app.has_role(array['media_officer', 'super_admin']) then
    raise exception 'MEDIA_FORBIDDEN';
  end if;
  return query
  select d.* from public.media_designs d
   where (p_sector_parent is null or d.sector_parent = p_sector_parent)
   order by d.created_at desc
   limit 100;
end;
$$;

-- تفاصيل تصميم (مع الصور)
create or replace function public.media_design_detail(p_id uuid)
returns table(
  design jsonb,
  photo_id uuid,
  source_photo_id uuid,
  source_submission_id uuid,
  work_type text,
  storage_path text,
  caption text,
  sort_order integer
)
language plpgsql stable security definer
set search_path = public, app
as $$
declare
  d public.media_designs;
begin
  if not app.has_role(array['media_officer', 'super_admin']) then
    raise exception 'MEDIA_FORBIDDEN';
  end if;
  select * into d from public.media_designs where id = p_id;
  if not found then
    raise exception 'MEDIA_DESIGN_NOT_FOUND';
  end if;
  return query
  select to_jsonb(d), dp.id, dp.source_photo_id, dp.source_submission_id,
         dp.work_type, dp.storage_path, dp.caption, dp.sort_order
    from public.media_design_photos dp
   where dp.design_id = p_id
   order by dp.work_type, dp.sort_order;
end;
$$;

-- تحديث تصميم (العنوان/الدورة/الغلاف)
create or replace function public.media_design_update(
  p_id uuid,
  p_title text,
  p_period_type text,
  p_cover_path text
)
returns public.media_designs
language plpgsql volatile security definer
set search_path = public, app
as $$
declare
  d public.media_designs;
  v_start date;
  v_end date;
begin
  if not app.has_role(array['media_officer', 'super_admin']) then
    raise exception 'MEDIA_FORBIDDEN';
  end if;
  if length(trim(coalesce(p_title, ''))) < 2 or length(p_title) > 300
     or p_period_type not in ('first_half', 'second_half', 'monthly') then
    raise exception 'MEDIA_DESIGN_INPUT_INVALID';
  end if;
  select * into d from public.media_designs where id = p_id for update;
  if not found then
    raise exception 'MEDIA_DESIGN_NOT_FOUND';
  end if;
  if d.status = 'completed' then
    raise exception 'MEDIA_DESIGN_LOCKED';
  end if;
  select period_start, period_end into v_start, v_end
  from app.media_period_range(p_period_type);

  update public.media_designs
     set title = trim(p_title),
         period_type = p_period_type,
         period_start = v_start,
         period_end = v_end,
         cover_image_path = nullif(trim(coalesce(p_cover_path, '')), '')
   where id = p_id
   returning * into d;
  return d;
end;
$$;

-- إضافة صور لتصميم مسودة
create or replace function public.media_design_add_photos(p_id uuid, p_photos jsonb)
returns public.media_designs
language plpgsql volatile security definer
set search_path = public, app
as $$
declare
  d public.media_designs;
  ph jsonb;
  src public.media_submission_photos;
  v_seq integer;
begin
  if not app.has_role(array['media_officer', 'super_admin']) then
    raise exception 'MEDIA_FORBIDDEN';
  end if;
  if p_photos is null or jsonb_typeof(p_photos) <> 'array'
     or jsonb_array_length(p_photos) < 1 or jsonb_array_length(p_photos) > 500 then
    raise exception 'MEDIA_DESIGN_PHOTOS_INVALID';
  end if;
  select * into d from public.media_designs where id = p_id for update;
  if not found then
    raise exception 'MEDIA_DESIGN_NOT_FOUND';
  end if;
  if d.status = 'completed' then
    raise exception 'MEDIA_DESIGN_LOCKED';
  end if;
  select coalesce(max(sort_order), 0) into v_seq from public.media_design_photos where design_id = d.id;

  for ph in select * from jsonb_array_elements(p_photos) loop
    select * into src from public.media_submission_photos
     where id = (ph->>'photo_id')::uuid;
    if not found then
      raise exception 'MEDIA_DESIGN_PHOTO_NOT_FOUND';
    end if;
    v_seq := v_seq + 1;
    insert into public.media_design_photos
      (design_id, source_photo_id, source_submission_id, work_type, storage_path, caption, sort_order)
    values (
      d.id, src.id, src.submission_id,
      coalesce(nullif(trim(coalesce(ph->>'work_type', '')), ''), 'عام'),
      src.storage_path, nullif(trim(coalesce(ph->>'caption', '')), ''),
      v_seq
    );
  end loop;

  update public.media_designs
     set photo_count = (select count(*) from public.media_design_photos where design_id = d.id)
   where id = d.id
   returning * into d;
  return d;
end;
$$;

-- حذف صورة من تصميم
create or replace function public.media_design_photo_remove(p_photo_row_id uuid)
returns integer
language plpgsql volatile security definer
set search_path = public, app
as $$
declare
  d public.media_designs;
begin
  if not app.has_role(array['media_officer', 'super_admin']) then
    raise exception 'MEDIA_FORBIDDEN';
  end if;
  select d1.* into d from public.media_design_photos dp
    join public.media_designs d1 on d1.id = dp.design_id
   where dp.id = p_photo_row_id
   for update of dp;
  if not found then
    raise exception 'MEDIA_DESIGN_PHOTO_NOT_FOUND';
  end if;
  if d.status = 'completed' then
    raise exception 'MEDIA_DESIGN_LOCKED';
  end if;
  delete from public.media_design_photos where id = p_photo_row_id;
  update public.media_designs
     set photo_count = (select count(*) from public.media_design_photos where design_id = d.id)
   where id = d.id;
  return (select photo_count from public.media_designs where id = d.id);
end;
$$;

-- إكمال التصميم
create or replace function public.media_design_complete(p_id uuid)
returns public.media_designs
language plpgsql volatile security definer
set search_path = public, app
as $$
declare
  d public.media_designs;
begin
  if not app.has_role(array['media_officer', 'super_admin']) then
    raise exception 'MEDIA_FORBIDDEN';
  end if;
  update public.media_designs
     set status = 'completed', completed_at = now(), completed_by = auth.uid()
   where id = p_id and status = 'draft' and photo_count > 0
   returning * into d;
  if not found then
    raise exception 'MEDIA_DESIGN_NOT_COMPLETABLE';
  end if;
  return d;
end;
$$;

-- حذف تصميم مسودة
create or replace function public.media_design_delete(p_id uuid)
returns void
language plpgsql volatile security definer
set search_path = public, app
as $$
begin
  if not app.has_role(array['media_officer', 'super_admin']) then
    raise exception 'MEDIA_FORBIDDEN';
  end if;
  delete from public.media_designs where id = p_id and status = 'draft';
  if not found then
    raise exception 'MEDIA_DESIGN_NOT_DELETABLE';
  end if;
end;
$$;

-- ─── 6) الصلاحيات ───
revoke all on function
  public.media_send_photos(text, text, text, text, jsonb),
  public.media_submissions_list(text, text, text),
  public.media_submission_photos_list(uuid),
  public.media_submission_update(uuid, text, text, date, text),
  public.media_photo_update(uuid, text),
  public.media_submission_archive(uuid, text),
  public.media_design_create(text, text, text, text, jsonb),
  public.media_designs_list(text),
  public.media_design_detail(uuid),
  public.media_design_update(uuid, text, text, text),
  public.media_design_add_photos(uuid, jsonb),
  public.media_design_photo_remove(uuid),
  public.media_design_complete(uuid),
  public.media_design_delete(uuid)
  from public, anon;

grant execute on function
  public.media_send_photos(text, text, text, text, jsonb),
  public.media_submissions_list(text, text, text),
  public.media_submission_photos_list(uuid),
  public.media_submission_update(uuid, text, text, date, text),
  public.media_photo_update(uuid, text),
  public.media_submission_archive(uuid, text),
  public.media_design_create(text, text, text, text, jsonb),
  public.media_designs_list(text),
  public.media_design_detail(uuid),
  public.media_design_update(uuid, text, text, text),
  public.media_design_add_photos(uuid, jsonb),
  public.media_design_photo_remove(uuid),
  public.media_design_complete(uuid),
  public.media_design_delete(uuid)
  to authenticated;
