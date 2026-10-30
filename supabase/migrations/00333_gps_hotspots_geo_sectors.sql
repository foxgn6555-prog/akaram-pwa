-- 00387-ب — منطقة البقعة جغرافياً: كانت فلترة «القاطع» تعتمد على قاطع الآلية (غالباً غير مضبوط) فتُخفي كل البقع.
-- الآن تُحدَّد منطقة كل بقعة من موقعها داخل الزونات (gps_geofences.sector_id) عند النسخ، مع إبقاء قاطع الآلية احتياطاً.
alter table public.gps_hotspots
  add column if not exists geo_sector_id smallint,
  add column if not exists geo_sector_name text,
  add column if not exists geo_zone_name text;
create index if not exists gps_hotspots_geo_sector_idx on public.gps_hotspots (month, geo_sector_id);

-- أصغر زون نشط يحتوي النقطة (الأدق)؛ null إن كانت خارج كل الزونات
create or replace function app.gps_hotspot_locate(p_lat double precision, p_lng double precision, out sector_id smallint, out sector_name text, out zone_name text)
language sql stable set search_path = public, app as $$
  select g.sector_id, s.name, g.name
  from public.gps_geofences g
  left join public.sectors s on s.id = g.sector_id
  where g.is_active and g.sector_id is not null and app.gps_point_in_polygon(p_lat, p_lng, g.polygon)
  order by jsonb_array_length(g.polygon) desc, g.id
  limit 1
$$;
revoke all on function app.gps_hotspot_locate(double precision, double precision) from public, anon, authenticated;

create or replace function app.gps_hotspots_locate_trg() returns trigger language plpgsql set search_path = public, app as $$
declare r record;
begin
  select * into r from app.gps_hotspot_locate(new.lat, new.lng);
  new.geo_sector_id := r.sector_id; new.geo_sector_name := r.sector_name; new.geo_zone_name := r.zone_name;
  return new;
end $$;
drop trigger if exists gps_hotspots_locate on public.gps_hotspots;
create trigger gps_hotspots_locate before insert or update of lat, lng on public.gps_hotspots for each row execute function app.gps_hotspots_locate_trg();

-- إعادة تحديد البقع المنسوخة سابقاً
update public.gps_hotspots set lat = lat where id is not null;

-- القائمة: فلتر القاطع = المنطقة الجغرافية أولاً ثم قاطع الآلية احتياطاً؛ ويُعاد عدد البقع خارج الزونات
create or replace function public.gps_hotspots_list(p_month date default null, p_classes text[] default array['medium','heavy'], p_recurrence text[] default null,
  p_min_vehicles int default 1, p_sector_ids int[] default null) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare m date; rows_js jsonb; sync_js jsonb; months_js jsonb; unlocated int;
begin
  if auth.uid() is null or not app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin']) then raise exception 'GPS_FORBIDDEN'; end if;
  m := coalesce(date_trunc('month', p_month)::date, (select max(month) from public.gps_hotspots_sync), (date_trunc('month', (now() at time zone 'Asia/Baghdad')) - interval '1 month')::date);
  select coalesce(jsonb_agg(to_jsonb(h) - 'synced_at' order by h.total_minutes desc, h.stops_count desc), '[]'::jsonb) into rows_js
  from public.gps_hotspots h
  where h.month = m
    and (p_classes is null or h.dominant_class = any (p_classes))
    and (p_recurrence is null or h.recurrence = any (p_recurrence))
    and h.vehicles_count >= coalesce(p_min_vehicles, 1)
    and (p_sector_ids is null or h.geo_sector_id = any (p_sector_ids) or (h.geo_sector_id is null and h.sector_ids && p_sector_ids));
  select count(*) into unlocated from public.gps_hotspots h where h.month = m and h.geo_sector_id is null;
  select to_jsonb(s) into sync_js from public.gps_hotspots_sync s where s.month = m;
  select coalesce(jsonb_agg(jsonb_build_object('month', to_char(s.month, 'YYYY-MM'), 'rows', s.rows_count, 'synced_at', s.synced_at) order by s.month desc), '[]'::jsonb) into months_js from public.gps_hotspots_sync s;
  return jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'rows', rows_js, 'total', jsonb_array_length(rows_js), 'sync', sync_js, 'months', months_js, 'unlocated', unlocated);
end $$;
