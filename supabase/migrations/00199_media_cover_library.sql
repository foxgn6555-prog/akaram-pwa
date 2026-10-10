-- 00199 · بوابة الإعلام — مكتبة الغلافات:
--   أغلفة جاهزة (تصاميم احترافية) تُحفظ مرة واحدة ويُختار منها غلاف التصميم/القالب بضغطة بدل رفع الملف كل مرة.
--   كل غلاف: عنوان، مسار الصورة في المخزن، قاطع اختياري، نوع فترة اختياري، وسوم؛ أرشفة بدل حذف؛ عدّاد استخدام.
create table if not exists public.media_covers (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 200),
  storage_path text not null check (char_length(storage_path) between 3 and 500),
  sector_parent text check (sector_parent is null or sector_parent in ('karrada', 'zaafaraniya')),
  period_type text check (period_type is null or period_type in ('daily', 'weekly', 'first_half', 'second_half', 'monthly')),
  tags text not null default '' check (char_length(tags) <= 300),
  use_count integer not null default 0,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.media_covers is 'مكتبة غلافات التقارير المصورة (بوابة الإعلام)';
create index if not exists media_covers_status_idx on public.media_covers (status, created_at desc);
alter table public.media_covers enable row level security;
drop policy if exists media_covers_media on public.media_covers;
create policy media_covers_media on public.media_covers for select to authenticated
  using (app.has_role(array['media_officer', 'super_admin']));

create or replace function public.media_covers_list(p_include_archived boolean default false)
returns setof public.media_covers
language sql stable security definer
set search_path = public, app
as $$
  select c.* from public.media_covers c
  where app.has_role(array['media_officer', 'super_admin'])
    and (p_include_archived or c.status = 'active')
  order by c.status, c.use_count desc, c.created_at desc
$$;
grant execute on function public.media_covers_list(boolean) to authenticated;

create or replace function public.media_cover_add(
  p_title text, p_storage_path text, p_sector text default null, p_period_type text default null, p_tags text default ''
)
returns public.media_covers
language plpgsql volatile security definer
set search_path = public, app
as $$
declare c public.media_covers;
begin
  if not app.has_role(array['media_officer', 'super_admin']) then raise exception 'MEDIA_FORBIDDEN'; end if;
  if length(trim(coalesce(p_title, ''))) < 2 or length(trim(coalesce(p_storage_path, ''))) < 3 then
    raise exception 'MEDIA_COVER_INPUT_INVALID';
  end if;
  if p_sector is not null and p_sector not in ('karrada', 'zaafaraniya') then raise exception 'MEDIA_COVER_INPUT_INVALID'; end if;
  if p_period_type is not null and p_period_type not in ('daily', 'weekly', 'first_half', 'second_half', 'monthly') then
    raise exception 'MEDIA_COVER_INPUT_INVALID';
  end if;
  -- نفس الملف لا يُسجَّل مرتين: نعيد السجل الموجود (ونعيد تفعيله إن كان مؤرشفاً)
  select * into c from public.media_covers where storage_path = trim(p_storage_path) limit 1;
  if found then
    update public.media_covers set status = 'active', title = trim(p_title), updated_at = now() where id = c.id returning * into c;
    return c;
  end if;
  insert into public.media_covers (title, storage_path, sector_parent, period_type, tags, created_by)
  values (trim(p_title), trim(p_storage_path), p_sector, p_period_type, coalesce(trim(p_tags), ''), auth.uid())
  returning * into c;
  return c;
end $$;
grant execute on function public.media_cover_add(text, text, text, text, text) to authenticated;

create or replace function public.media_cover_update(p_id uuid, p_title text, p_sector text, p_period_type text, p_tags text)
returns public.media_covers
language plpgsql volatile security definer
set search_path = public, app
as $$
declare c public.media_covers;
begin
  if not app.has_role(array['media_officer', 'super_admin']) then raise exception 'MEDIA_FORBIDDEN'; end if;
  if length(trim(coalesce(p_title, ''))) < 2 then raise exception 'MEDIA_COVER_INPUT_INVALID'; end if;
  if p_sector is not null and p_sector not in ('karrada', 'zaafaraniya') then raise exception 'MEDIA_COVER_INPUT_INVALID'; end if;
  if p_period_type is not null and p_period_type not in ('daily', 'weekly', 'first_half', 'second_half', 'monthly') then
    raise exception 'MEDIA_COVER_INPUT_INVALID';
  end if;
  update public.media_covers
     set title = trim(p_title), sector_parent = p_sector, period_type = p_period_type, tags = coalesce(trim(p_tags), ''), updated_at = now()
   where id = p_id returning * into c;
  if not found then raise exception 'MEDIA_COVER_NOT_FOUND'; end if;
  return c;
end $$;
grant execute on function public.media_cover_update(uuid, text, text, text, text) to authenticated;

create or replace function public.media_cover_set_status(p_id uuid, p_status text)
returns public.media_covers
language plpgsql volatile security definer
set search_path = public, app
as $$
declare c public.media_covers;
begin
  if not app.has_role(array['media_officer', 'super_admin']) then raise exception 'MEDIA_FORBIDDEN'; end if;
  if p_status not in ('active', 'archived') then raise exception 'MEDIA_COVER_INPUT_INVALID'; end if;
  update public.media_covers set status = p_status, updated_at = now() where id = p_id returning * into c;
  if not found then raise exception 'MEDIA_COVER_NOT_FOUND'; end if;
  return c;
end $$;
grant execute on function public.media_cover_set_status(uuid, text) to authenticated;

-- يُستدعى عند اختيار غلاف من المكتبة لتصميم/قالب: يرفع عدّاد الاستخدام (الأكثر استخداماً أولاً)
create or replace function public.media_cover_touch(p_id uuid)
returns integer
language plpgsql volatile security definer
set search_path = public, app
as $$
declare n integer;
begin
  if not app.has_role(array['media_officer', 'super_admin']) then raise exception 'MEDIA_FORBIDDEN'; end if;
  update public.media_covers set use_count = use_count + 1, updated_at = now() where id = p_id and status = 'active' returning use_count into n;
  if not found then raise exception 'MEDIA_COVER_NOT_FOUND'; end if;
  return n;
end $$;
grant execute on function public.media_cover_touch(uuid) to authenticated;
