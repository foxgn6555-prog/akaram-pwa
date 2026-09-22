-- 00137 · GBS الحاويات — اللمسات الأخيرة: القاطع والمنطقة لكل حاوية + الزونات على الخريطة.
--   · عمود sector_id (1-8) مع اسم المنطقة والقاطع في القائمة والpopup والفلاتر.
--   · دالة gbs_zones_list تعرض زونات GPS التشغيلية نفسها على خريطة الحاويات
--     لغرفة العمليات ومسؤولي الأقسام (قراءة فقط — التحرير يبقى في وحدة GPS).

alter table public.gbs_containers
  add column if not exists sector_id smallint not null default 1
  references public.sectors(id);
create index if not exists gbs_containers_sector_idx on public.gbs_containers(sector_id);

-- ① القائمة: + sector_id + اسم المنطقة + القاطع الأب
drop function if exists public.gbs_containers_list(text, text);
create function public.gbs_containers_list(p_search text default null, p_status text default null,
                                           p_parent text default null, p_sector_id smallint default null)
returns table(id uuid, code text, label text, latitude float8, longitude float8,
              status text, image_path text, notes text, updated_at timestamptz, pending_count bigint,
              sector_id smallint, area_name text, parent_sector text)
language plpgsql stable security definer set search_path=public,app as $$
begin
  if not app.has_role(array['ops_room','department_manager','super_admin']) then
    raise exception 'GBS_FORBIDDEN';
  end if;
  if p_status is not null and p_status not in ('ok','damaged','replace','missing') then
    raise exception 'GBS_STATUS_INVALID';
  end if;
  if p_parent is not null and p_parent not in ('karrada','zaafaraniya') then
    raise exception 'GBS_PARENT_INVALID';
  end if;
  return query
  select c.id, c.code, c.label, c.latitude, c.longitude, c.status, c.image_path, c.notes, c.updated_at,
         (select count(*) from public.gbs_container_updates u
           where u.container_id = c.id and u.state = 'pending'),
         c.sector_id, s.name, s.parent_sector
  from public.gbs_containers c
  join public.sectors s on s.id = c.sector_id
  where (p_status is null or c.status = p_status)
    and (p_parent is null or s.parent_sector = p_parent)
    and (p_sector_id is null or c.sector_id = p_sector_id)
    and (nullif(trim(coalesce(p_search,'')),'') is null
         or c.code ilike '%' || trim(p_search) || '%'
         or c.label ilike '%' || trim(p_search) || '%'
         or s.name ilike '%' || trim(p_search) || '%'
         or coalesce(c.notes,'') ilike '%' || trim(p_search) || '%')
  order by c.code;
end$$;

-- ② الحفظ: + المنطقة (تحقق 1-8)
drop function if exists public.gbs_container_save(uuid, text, float8, float8, text, text, text);
create function public.gbs_container_save(
  p_id uuid, p_label text, p_latitude float8, p_longitude float8,
  p_status text, p_sector_id smallint default 1,
  p_image_path text default null, p_notes text default null)
returns table(id uuid, code text)
language plpgsql security definer set search_path=public,app as $$
declare u uuid := auth.uid(); cid uuid; ccode text;
begin
  if u is null or not app.has_role(array['ops_room','super_admin']) then
    raise exception 'GBS_FORBIDDEN';
  end if;
  if length(trim(coalesce(p_label,''))) not between 2 and 120 then
    raise exception 'GBS_LABEL_INVALID';
  end if;
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'GBS_POINT_INVALID';
  end if;
  if coalesce(p_status,'') not in ('ok','damaged','replace','missing') then
    raise exception 'GBS_STATUS_INVALID';
  end if;
  if p_sector_id is null or not exists(select 1 from public.sectors s where s.id = p_sector_id) then
    raise exception 'GBS_SECTOR_INVALID';
  end if;
  if length(trim(coalesce(p_notes,''))) > 500 then
    raise exception 'GBS_NOTES_INVALID';
  end if;
  if p_id is null then
    ccode := 'GBS-' || lpad(nextval('public.gbs_container_code_seq')::text, 4, '0');
    insert into public.gbs_containers(code, label, latitude, longitude, status, sector_id, image_path, notes, created_by)
    values(ccode, trim(p_label), p_latitude, p_longitude, p_status, p_sector_id,
           nullif(trim(coalesce(p_image_path,'')),''), nullif(trim(coalesce(p_notes,'')),''), u)
    returning gbs_containers.id into cid;
  else
    update public.gbs_containers
       set label = trim(p_label), latitude = p_latitude, longitude = p_longitude,
           status = p_status, sector_id = p_sector_id,
           image_path = nullif(trim(coalesce(p_image_path,'')),''),
           notes = nullif(trim(coalesce(p_notes,'')),''),
           updated_at = now()
     where gbs_containers.id = p_id returning gbs_containers.id, gbs_containers.code into cid, ccode;
    if cid is null then raise exception 'GBS_CONTAINER_NOT_FOUND'; end if;
  end if;
  return query select cid, ccode;
end$$;

-- ③ الزونات التشغيلية (نفس زونات GPS) لعرضها على خريطة الحاويات
create or replace function public.gbs_zones_list()
returns table(id uuid, name text, source text, color text, polygon jsonb)
language plpgsql stable security definer set search_path=public,app as $$
begin
  if auth.uid() is null or not app.has_role(array['ops_room','department_manager','super_admin']) then
    raise exception 'GBS_FORBIDDEN';
  end if;
  return query select g.id, g.name, g.source, g.color, g.polygon
  from public.gps_geofences g where g.is_active order by g.name;
end$$;

revoke all on function
  public.gbs_containers_list(text, text, text, smallint),
  public.gbs_container_save(uuid, text, float8, float8, text, smallint, text, text),
  public.gbs_zones_list()
from public, anon;
grant execute on function
  public.gbs_containers_list(text, text, text, smallint),
  public.gbs_container_save(uuid, text, float8, float8, text, smallint, text, text),
  public.gbs_zones_list()
to authenticated;
