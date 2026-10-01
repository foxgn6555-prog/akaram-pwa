-- ═══════════════════════════════════════════════════════════════
-- 00165 · أنواع تقارير إضافية للتصميم المصور: يومي + أسبوعي
-- يومي: اليوم نفسه (تقويم بغداد) · أسبوعي: السبت → الجمعة من الأسبوع الحالي
-- (أسبوع العمل العراقي يبدأ السبت) · الأنواع السابقة تبقى كما هي.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1) قيود النوع ───
alter table public.media_designs drop constraint if exists media_designs_period_type_check;
alter table public.media_designs
  add constraint media_designs_period_type_check
  check (period_type in ('daily', 'weekly', 'first_half', 'second_half', 'monthly'));

alter table public.media_design_templates drop constraint if exists media_design_templates_period_type_check;
alter table public.media_design_templates
  add constraint media_design_templates_period_type_check
  check (period_type in ('daily', 'weekly', 'first_half', 'second_half', 'monthly'));

-- ─── 2) نطاق الدورة ───
create or replace function app.media_period_range(p_period_type text, p_month date default null)
returns table(period_start date, period_end date)
language sql stable
set search_path = public, app
as $$
  with m as (
    select
      coalesce(p_month, (now() at time zone 'Asia/Baghdad')::date) as ref_day,
      date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Baghdad')::date))::date as first_day
  ),
  w as (
    -- السبت = بداية الأسبوع: isodow السبت=6 → إزاحة 0، الأحد=7 → 1، الاثنين=1 → 2 … الجمعة=5 → 6
    select m.ref_day - ((extract(isodow from m.ref_day)::int + 1) % 7) as week_start from m
  )
  select
    case
      when p_period_type = 'daily' then m.ref_day
      when p_period_type = 'weekly' then w.week_start
      when p_period_type = 'first_half' then m.first_day
      when p_period_type = 'second_half' then m.first_day + 14
      else m.first_day
    end as period_start,
    case
      when p_period_type = 'daily' then m.ref_day
      when p_period_type = 'weekly' then w.week_start + 6
      when p_period_type = 'first_half' then m.first_day + 13
      else (m.first_day + interval '1 month')::date - 1
    end as period_end
  from m, w
$$;

-- ─── 3) دوال الإنشاء والتحديث (نفس المنطق مع قبول النوعين الجديدين) ───
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
     or p_period_type not in ('daily', 'weekly', 'first_half', 'second_half', 'monthly')
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
     or p_period_type not in ('daily', 'weekly', 'first_half', 'second_half', 'monthly') then
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

