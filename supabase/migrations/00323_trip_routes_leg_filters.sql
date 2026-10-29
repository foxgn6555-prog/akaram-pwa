-- 00323 — 00378: فلاتر المقاطع في قائمة مسارات الانطلاقيات (leg_type / min_legs / leg_state) — الدالة كما في 00287 مع الشروط الجديدة فقط
create or replace function public.trip_routes_list(p_filters jsonb default '{}'::jsonb, p_limit int default 50, p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare f jsonb := coalesce(p_filters, '{}'::jsonb); d_from date; d_to date; t_from timestamptz; t_to timestamptz;
  v_sector int; v_vehicle uuid; v_driver text; v_shift text; v_status text; v_search text; v_has_gaps boolean; v_min_stops int; v_min_km double precision;
  p_from jsonb; p_to jsonb; p_via jsonb; v_order text; v_open text; v_leg_type text; v_min_legs int; v_leg_state text; rows_ jsonb; all_rows jsonb; total int; summary jsonb; lim int; off int;
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
  -- 00378: فلاتر المقاطع — نوع وجهة مرّت بها الانطلاقية، أدنى عدد مقاطع، حالة آخر مقطع
  v_leg_type := nullif(f ->> 'leg_type', ''); v_min_legs := nullif(f ->> 'min_legs', '')::int; v_leg_state := nullif(f ->> 'leg_state', '');
  if v_leg_type is not null and v_leg_type not in ('work_site', 'transfer_station', 'maintenance', 'garage') then raise exception 'TRIP_ROUTES_LEG_TYPE_INVALID'; end if;
  if v_leg_state is not null and v_leg_state not in ('arrived', 'en_route', 'none') then raise exception 'TRIP_ROUTES_LEG_STATE_INVALID'; end if;
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
      and (v_leg_type is null or exists (select 1 from public.vehicle_trip_legs l where l.departure_id = b.departure_id and l.destination_type = v_leg_type))
      and (v_min_legs is null or b.legs_count >= v_min_legs)
      and (v_leg_state is null or (v_leg_state = 'none' and b.legs_count = 0) or (v_leg_state = 'arrived' and b.last_leg_arrived) or (v_leg_state = 'en_route' and b.legs_count > 0 and not b.last_leg_arrived))
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
