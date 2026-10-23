-- 00287 (00343) — قائمة مسارات الانطلاقيات مع الفلاتر: من↔إلى (زون/معلم/وجهة محطة/دائرة حرة)، القاطع، المركبة، السائق، الشفت، الحالة، الفجوات، التوقفات، البحث، الترتيب، الترقيم، وملخص إجمالي.
-- الرؤية: غرفة العمليات (و IT) فقط.

-- هل النقطة داخل «مكان» الفلتر؟ المكان jsonb: {kind: zone|landmark|station|circle, id, lat, lng, radius_m}
create or replace function app.trip_route_place_hit(p_lat double precision, p_lng double precision, p_place jsonb) returns boolean
language plpgsql stable as $$
declare kind text := p_place ->> 'kind'; poly jsonb; clat double precision; clng double precision; rad double precision;
begin
  if p_lat is null or p_lng is null or p_place is null or jsonb_typeof(p_place) <> 'object' then return false; end if;
  if kind = 'zone' then
    select polygon into poly from public.gps_geofences where id = (p_place ->> 'id')::uuid;
    return poly is not null and app.gps_point_in_polygon(p_lat, p_lng, poly);
  elsif kind = 'station' then
    select g.polygon into poly from public.station_destinations d join public.gps_geofences g on g.id = d.geofence_id where d.id = (p_place ->> 'id')::uuid;
    return poly is not null and app.gps_point_in_polygon(p_lat, p_lng, poly);
  elsif kind = 'landmark' then
    select latitude, longitude into clat, clng from public.gps_map_landmarks where id = (p_place ->> 'id')::uuid;
    rad := coalesce(app.lvn_num(p_place ->> 'radius_m'), 200);
    return clat is not null and app.trip_route_haversine_m(p_lat, p_lng, clat, clng) <= rad;
  elsif kind = 'circle' then
    clat := app.lvn_num(p_place ->> 'lat'); clng := app.lvn_num(p_place ->> 'lng'); rad := coalesce(app.lvn_num(p_place ->> 'radius_m'), 300);
    return clat is not null and clng is not null and app.trip_route_haversine_m(p_lat, p_lng, clat, clng) <= rad;
  end if;
  return false;
end$$;

-- هل مرّ المسار بالمكان؟ (أي نقطة محفوظة داخله) — مع تصفية أولية بصندوق إحداثي للدوائر/المعالم
create or replace function app.trip_route_via_hit(p_departure uuid, p_place jsonb) returns boolean
language plpgsql stable as $$
declare kind text := p_place ->> 'kind'; clat double precision; clng double precision; rad double precision; dlat double precision; dlng double precision;
begin
  if kind = 'landmark' then
    select latitude, longitude into clat, clng from public.gps_map_landmarks where id = (p_place ->> 'id')::uuid; rad := coalesce(app.lvn_num(p_place ->> 'radius_m'), 200);
  elsif kind = 'circle' then
    clat := app.lvn_num(p_place ->> 'lat'); clng := app.lvn_num(p_place ->> 'lng'); rad := coalesce(app.lvn_num(p_place ->> 'radius_m'), 300);
  end if;
  if clat is not null then
    dlat := rad / 111320.0; dlng := rad / (111320.0 * greatest(cos(radians(clat)), 0.01));
    return exists (select 1 from public.trip_route_points p where p.departure_id = p_departure
                     and p.latitude between clat - dlat and clat + dlat and p.longitude between clng - dlng and clng + dlng
                     and app.trip_route_haversine_m(p.latitude, p.longitude, clat, clng) <= rad);
  end if;
  return exists (select 1 from public.trip_route_points p where p.departure_id = p_departure and app.trip_route_place_hit(p.latitude, p.longitude, p_place));
end$$;

create or replace function public.trip_routes_list(p_filters jsonb default '{}'::jsonb, p_limit int default 50, p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare f jsonb := coalesce(p_filters, '{}'::jsonb); d_from date; d_to date; t_from timestamptz; t_to timestamptz;
  v_sector int; v_vehicle uuid; v_driver text; v_shift text; v_status text; v_search text; v_has_gaps boolean; v_min_stops int; v_min_km double precision;
  p_from jsonb; p_to jsonb; p_via jsonb; v_order text; v_open text; rows_ jsonb; all_rows jsonb; total int; summary jsonb; lim int; off int;
begin
  if auth.uid() is null or not app.has_role(array['ops_room','it_admin','super_admin']) then raise exception 'GPS_FORBIDDEN'; end if;
  lim := least(greatest(coalesce(p_limit, 50), 1), 500); off := greatest(coalesce(p_offset, 0), 0);
  d_from := nullif(f ->> 'date_from', '')::date; d_to := nullif(f ->> 'date_to', '')::date;
  if d_from is not null then t_from := (d_from::text || ' 00:00:00+03')::timestamptz; end if;
  if d_to is not null then t_to := ((d_to + 1)::text || ' 00:00:00+03')::timestamptz; end if;
  if t_from is not null and t_to is not null and t_to <= t_from then raise exception 'TRIP_ROUTES_DATE_RANGE_INVALID'; end if;
  v_sector := nullif(f ->> 'sector_id', '')::int; v_vehicle := nullif(f ->> 'vehicle_id', '')::uuid;
  v_driver := nullif(trim(f ->> 'driver'), ''); v_shift := nullif(f ->> 'shift', ''); v_status := nullif(f ->> 'status', ''); v_open := nullif(f ->> 'trip', '');
  v_search := nullif(trim(f ->> 'search'), ''); v_has_gaps := (f ->> 'has_gaps')::boolean; v_min_stops := nullif(f ->> 'min_stops', '')::int; v_min_km := app.lvn_num(f ->> 'min_km');
  p_from := case when jsonb_typeof(f -> 'from_place') = 'object' then f -> 'from_place' end;
  p_to := case when jsonb_typeof(f -> 'to_place') = 'object' then f -> 'to_place' end;
  p_via := case when jsonb_typeof(f -> 'via_place') = 'object' then f -> 'via_place' end;
  v_order := coalesce(nullif(f ->> 'order', ''), 'departed_desc');
  if v_order not in ('departed_desc', 'departed_asc', 'distance_desc', 'stops_desc', 'duration_desc', 'gaps_desc') then raise exception 'TRIP_ROUTES_ORDER_INVALID'; end if;

  with base as (
    select d.id departure_id, d.vehicle_id, v.vehicle_name, v.db_number, v.plate_number, v.vehicle_category, d.driver_name, d.shift, d.sector_id, s.name sector_name,
           d.departed_at, d.returned_at, d.arrived_at site_arrived_at, d.site_departed_at,
           coalesce(r.status, 'pending') status, coalesce(r.is_final, false) is_final, coalesce(r.distance_m, 0) distance_m, coalesce(r.moving_seconds, 0) moving_seconds,
           coalesce(r.stopped_seconds, 0) stopped_seconds, coalesce(r.max_speed_kmh, 0) max_speed_kmh, coalesce(r.avg_speed_kmh, 0) avg_speed_kmh,
           coalesce(r.stops_count, 0) stops_count, coalesce(r.gaps_count, 0) gaps_count, coalesce(r.gap_seconds, 0) gap_seconds, coalesce(r.points_kept, 0) points_kept,
           coalesce(r.points_rejected, 0) points_rejected, r.first_fix, r.last_fix, r.pulled_at, nullif(r.next_pull_at, 'infinity') next_pull_at, r.error_code, r.device_id,
           (select count(*) from public.vehicle_trip_legs l where l.departure_id = d.id)::int legs_count,
           (select l.destination_type from public.vehicle_trip_legs l where l.departure_id = d.id order by l.sequence_no desc limit 1) last_destination,
           (select l.arrived_at is not null from public.vehicle_trip_legs l where l.departure_id = d.id order by l.sequence_no desc limit 1) last_leg_arrived,
           extract(epoch from (coalesce(d.returned_at, now()) - d.departed_at))::int trip_seconds,
           fp.latitude from_lat, fp.longitude from_lng, fp.address from_address, lp.latitude to_lat, lp.longitude to_lng, lp.address to_address
    from public.garage_departures d
    join public.garage_vehicles v on v.id = d.vehicle_id
    left join public.sectors s on s.id = d.sector_id
    left join public.trip_routes r on r.departure_id = d.id
    left join lateral (select latitude, longitude, address from public.trip_route_points p where p.departure_id = d.id order by seq asc limit 1) fp on true
    left join lateral (select latitude, longitude, address from public.trip_route_points p where p.departure_id = d.id order by seq desc limit 1) lp on true
    where (t_from is null or d.departed_at >= t_from) and (t_to is null or d.departed_at < t_to)
      and (v_sector is null or d.sector_id = v_sector) and (v_vehicle is null or d.vehicle_id = v_vehicle)
      and (v_driver is null or d.driver_name ilike '%' || v_driver || '%') and (v_shift is null or d.shift = v_shift)
      and (v_open is null or (v_open = 'open' and d.returned_at is null) or (v_open = 'returned' and d.returned_at is not null))
      and (v_search is null or v.db_number ilike '%' || v_search || '%' or v.plate_number ilike '%' || v_search || '%' or v.vehicle_name ilike '%' || v_search || '%' or d.driver_name ilike '%' || v_search || '%')
  )
  , flt as (
    select * from base b
    where (v_status is null or b.status = v_status)
      and (v_has_gaps is null or (v_has_gaps and b.gaps_count > 0) or (not v_has_gaps and b.gaps_count = 0))
      and (v_min_stops is null or b.stops_count >= v_min_stops) and (v_min_km is null or b.distance_m >= v_min_km * 1000)
      and (p_from is null or app.trip_route_place_hit(b.from_lat, b.from_lng, p_from))
      and (p_to is null or app.trip_route_place_hit(b.to_lat, b.to_lng, p_to))
      and (p_via is null or app.trip_route_via_hit(b.departure_id, p_via))
  )
  select coalesce(jsonb_agg(to_jsonb(t) order by
      case when v_order = 'departed_desc' then t.departed_at end desc,
      case when v_order = 'departed_asc' then t.departed_at end asc,
      case when v_order = 'distance_desc' then t.distance_m end desc,
      case when v_order = 'stops_desc' then t.stops_count end desc,
      case when v_order = 'duration_desc' then t.trip_seconds end desc,
      case when v_order = 'gaps_desc' then t.gap_seconds end desc,
      t.departed_at desc), '[]'::jsonb),
    count(*),
    jsonb_build_object('total', count(*), 'distance_m', coalesce(sum(t.distance_m), 0), 'stops', coalesce(sum(t.stops_count), 0), 'gaps', coalesce(sum(t.gaps_count), 0),
           'open', count(*) filter (where t.returned_at is null), 'complete', count(*) filter (where t.status = 'complete'), 'partial', count(*) filter (where t.status = 'partial'),
           'no_device', count(*) filter (where t.status = 'no_device'), 'pending', count(*) filter (where t.status in ('pending', 'failed')), 'empty', count(*) filter (where t.status = 'empty'),
           'moving_seconds', coalesce(sum(t.moving_seconds), 0), 'stopped_seconds', coalesce(sum(t.stopped_seconds), 0), 'max_speed_kmh', coalesce(max(t.max_speed_kmh), 0))
    into all_rows, total, summary from flt t;
  select coalesce(jsonb_agg(x order by i), '[]'::jsonb) into rows_ from jsonb_array_elements(all_rows) with ordinality as e(x, i) where i > off and i <= off + lim;
  return jsonb_build_object('total', total, 'limit', lim, 'offset', off, 'summary', summary, 'rows', rows_);
end$$;

-- خيارات الفلاتر: القواطع، المركبات، الزونات، المعالم (بفئتها)، وجهات المحطة
create or replace function public.trip_routes_filter_options() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
begin
  if auth.uid() is null or not app.has_role(array['ops_room','it_admin','super_admin']) then raise exception 'GPS_FORBIDDEN'; end if;
  return jsonb_build_object(
    'sectors', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by sort, id) from public.sectors), '[]'::jsonb),
    'vehicles', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.vehicle_name, 'db_number', v.db_number, 'plate_number', v.plate_number, 'sector_id', v.sector_id,
                   'has_gps', exists (select 1 from public.gps_vehicle_bindings b where b.garage_vehicle_id = v.id)) order by v.db_number, v.vehicle_name)
                 from public.garage_vehicles v where v.archived_at is null), '[]'::jsonb),
    'zones', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'source', g.source, 'color', g.color) order by g.name) from public.gps_geofences g where g.is_active), '[]'::jsonb),
    'landmarks', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'category', m.category, 'lat', m.latitude, 'lng', m.longitude, 'color', m.color) order by m.category, m.name)
                   from public.gps_map_landmarks m where m.is_active), '[]'::jsonb),
    'stations', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'geofence_id', d.geofence_id) order by d.sort, d.name) from public.station_destinations d where d.active and d.geofence_id is not null), '[]'::jsonb),
    'shifts', coalesce((select jsonb_agg(distinct shift) from public.garage_departures where shift is not null), '[]'::jsonb));
end$$;

revoke all on function app.trip_route_place_hit(double precision, double precision, jsonb), app.trip_route_via_hit(uuid, jsonb), public.trip_routes_list(jsonb, int, int), public.trip_routes_filter_options() from public, anon;
grant execute on function public.trip_routes_list(jsonb, int, int), public.trip_routes_filter_options() to authenticated;

create index if not exists trip_route_points_dep_latlng_idx on public.trip_route_points (departure_id, latitude, longitude);
create index if not exists garage_departures_departed_at_idx on public.garage_departures (departed_at desc);
