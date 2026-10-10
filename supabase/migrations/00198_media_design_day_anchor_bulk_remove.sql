-- 00198 · بوابة الإعلام — إصلاحات التصميم:
--   1) تاريخ التصميم يبقى مثبّتاً: media_design_update كانت تعيد احتساب الفترة من «اليوم» عند كل حفظ
--      (حتى حفظ العنوان/الغلاف التلقائي) فيتغيّر يوم التقرير اليومي عند فتحه في يوم آخر.
--      الآن: الفترة تُحسب من p_ref_day إن أُرسل، وإلا من يوم بداية التصميم الحالي؛ ولا تتغير إن لم يتغير النوع ولا اليوم المرجعي.
--   2) media_design_create تقبل p_ref_day اختيارياً (يوم التقرير اليومي/أسبوع/شهر مرجعي).
--   3) media_design_photos_remove: حذف عدة صور من التصميم بضغطة واحدة (كل صور فقرة / كل الصور).
--   4) إلغاء قيد «تصميم واحد لكل قاطع وفترة»: كان إنشاء تقرير ثانٍ لليوم نفسه (مثل شفت صباحي + شفت ليلي،
--      أو إعادة إعداد التقرير) يفشل بخطأ خام "duplicate key". يبقى فهرس عادي للبحث بالفترة.

alter table public.media_designs drop constraint if exists media_designs_sector_parent_period_start_period_end_key;
create index if not exists media_designs_sector_period_idx on public.media_designs (sector_parent, period_start, period_end);

-- ─── 1) التحديث مع يوم مرجعي ───
drop function if exists public.media_design_update(uuid, text, text, text);
create or replace function public.media_design_update(
  p_id uuid,
  p_title text,
  p_period_type text,
  p_cover_path text,
  p_ref_day date default null
)
returns public.media_designs
language plpgsql volatile security definer
set search_path = public, app
as $$
declare
  d public.media_designs;
  v_start date;
  v_end date;
  v_ref date;
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

  if p_ref_day is null and p_period_type = d.period_type then
    -- لا تغيير في النوع ولا يوم مرجعي جديد ⇒ الفترة تبقى كما هي (لا تنزلق مع مرور الأيام)
    v_start := d.period_start; v_end := d.period_end;
  else
    v_ref := coalesce(p_ref_day, d.period_start, (now() at time zone 'Asia/Baghdad')::date);
    select period_start, period_end into v_start, v_end from app.media_period_range(p_period_type, v_ref);
  end if;

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

-- ─── 2) الإنشاء مع يوم مرجعي اختياري ───
drop function if exists public.media_design_create(text, text, text, text, jsonb);
create or replace function public.media_design_create(
  p_sector_parent text,
  p_period_type text,
  p_title text,
  p_cover_path text default null,
  p_photos jsonb default null,
  p_ref_day date default null
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
  from app.media_period_range(p_period_type, p_ref_day);

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

-- ─── 3) حذف عدة صور من تصميم واحد بضغطة ───
create or replace function public.media_design_photos_remove(p_photo_row_ids uuid[])
returns integer
language plpgsql volatile security definer
set search_path = public, app
as $$
declare
  v_design uuid;
  v_designs integer;
  d public.media_designs;
begin
  if not app.has_role(array['media_officer', 'super_admin']) then
    raise exception 'MEDIA_FORBIDDEN';
  end if;
  if p_photo_row_ids is null or cardinality(p_photo_row_ids) = 0 then
    raise exception 'MEDIA_DESIGN_PHOTOS_INVALID';
  end if;
  select count(distinct design_id), (array_agg(design_id))[1] into v_designs, v_design
    from public.media_design_photos where id = any(p_photo_row_ids);
  if v_designs <> 1 or (select count(*) from public.media_design_photos where id = any(p_photo_row_ids)) <> cardinality(p_photo_row_ids) then
    raise exception 'MEDIA_DESIGN_PHOTO_NOT_FOUND';
  end if;
  select * into d from public.media_designs where id = v_design for update;
  if d.status = 'completed' then
    raise exception 'MEDIA_DESIGN_LOCKED';
  end if;
  delete from public.media_design_photos where id = any(p_photo_row_ids);
  update public.media_designs
     set photo_count = (select count(*) from public.media_design_photos where design_id = d.id)
   where id = d.id;
  return (select photo_count from public.media_designs where id = d.id);
end;
$$;

revoke all on function public.media_design_update(uuid, text, text, text, date) from public;
revoke all on function public.media_design_create(text, text, text, text, jsonb, date) from public;
revoke all on function public.media_design_photos_remove(uuid[]) from public;
grant execute on function public.media_design_update(uuid, text, text, text, date),
  public.media_design_create(text, text, text, text, jsonb, date),
  public.media_design_photos_remove(uuid[]) to authenticated;
