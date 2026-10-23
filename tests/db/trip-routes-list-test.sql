-- اختبار 00287 (00343): قائمة مسارات الانطلاقيات والفلاتر (من/إلى/مرّ بـ، التاريخ، القاطع، المركبة، السائق، الحالة، الفجوات، البحث، الترتيب، الترقيم، الملخص، الخيارات، الصلاحيات)
set client_min_messages = notice;
insert into auth.users (id, email) values ('e8000000-0000-0000-0000-000000000001', 'ops-trl@t.iq'), ('e8000000-0000-0000-0000-000000000003', 'hr-trl@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('e8000000-0000-0000-0000-000000000001', 'ops_room'), ('e8000000-0000-0000-0000-000000000003', 'hr_officer') on conflict do nothing;
insert into public.sectors (id, code, name, sort, parent_sector) values (96, 'S96', 'قاطع القائمة', 96, 'karrada'), (95, 'S95', 'قاطع آخر', 95, 'karrada') on conflict (id) do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false), set_config('auth.role', '', false) $$;
create or replace function pg_temp.as_service() returns void language sql as $$ select set_config('auth.user_id', '', false), set_config('auth.role', 'service_role', false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;
-- خط نقاط مستقيم من (lat0,lng0) إلى (lat1,lng1) بعدد n كل 30 ثانية ابتداءً من t0
create or replace function pg_temp.line(t0 timestamptz, lat0 float8, lng0 float8, lat1 float8, lng1 float8, n int) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('fix_time', t0 + make_interval(secs => 30 * g), 'lat', lat0 + (lat1 - lat0) * g / (n - 1), 'lng', lng0 + (lng1 - lng0) * g / (n - 1), 'speed', 20) order by g) from generate_series(0, n - 1) g $$;

insert into public.gps_providers (id, name, type) values ('e80db000-0000-0000-0000-000000000001', 'TRL provider', 'vendor_api') on conflict (id) do nothing;
insert into public.gps_devices (id, provider_id, external_id, name, online_status) values
  ('e80dc000-0000-0000-0000-000000000001', 'e80db000-0000-0000-0000-000000000001', 'TRL-1', 'جهاز TRL1', 'online'),
  ('e80dc000-0000-0000-0000-000000000002', 'e80db000-0000-0000-0000-000000000001', 'TRL-2', 'جهاز TRL2', 'online') on conflict (id) do nothing;
insert into public.garage_vehicles (id, vehicle_name, db_number, plate_number, chassis_number, image_path, driver_name, shift, sector_id, created_by) values
  ('e80da000-0000-0000-0000-000000000001', 'كابسة A', 'DB-A1', 'P-A1', 'CH-TRL001', 'g/a.jpg', 'سائق أ', 'morning', 96, 'e8000000-0000-0000-0000-000000000001'),
  ('e80da000-0000-0000-0000-000000000002', 'شفل B', 'DB-B2', 'P-B2', 'CH-TRL002', 'g/b.jpg', 'سائق ب', 'evening', 95, 'e8000000-0000-0000-0000-000000000001'),
  ('e80da000-0000-0000-0000-000000000003', 'كابسة C بلا GPS', 'DB-C3', 'P-C3', 'CH-TRL003', 'g/c.jpg', 'سائق ج', 'morning', 96, 'e8000000-0000-0000-0000-000000000001') on conflict (id) do nothing;
insert into public.gps_vehicle_bindings (device_id, garage_vehicle_id, match_method) values
  ('e80dc000-0000-0000-0000-000000000001', 'e80da000-0000-0000-0000-000000000001', 'manual'), ('e80dc000-0000-0000-0000-000000000002', 'e80da000-0000-0000-0000-000000000002', 'manual') on conflict do nothing;
-- زون الكراج حول (33.30,44.40)، زون المحطة حول (33.40,44.40)؛ معلم ورشة عند (33.35,44.45)
insert into public.gps_geofences (id, name, source, polygon, color, is_active) values
  ('e80d9000-0000-0000-0000-000000000001', 'زون الكراج', 'platform', '[{"lat":33.299,"lng":44.399},{"lat":33.301,"lng":44.399},{"lat":33.301,"lng":44.401},{"lat":33.299,"lng":44.401}]', '#0f0', true),
  ('e80d9000-0000-0000-0000-000000000002', 'زون المحطة', 'platform', '[{"lat":33.399,"lng":44.399},{"lat":33.401,"lng":44.399},{"lat":33.401,"lng":44.401},{"lat":33.399,"lng":44.401}]', '#00f', true) on conflict (id) do nothing;
insert into public.gps_map_landmarks (id, name, category, latitude, longitude, created_by) values ('e80d8000-0000-0000-0000-000000000001', 'ورشة الصيانة', 'maintenance', 33.35, 44.45, 'e8000000-0000-0000-0000-000000000001') on conflict (id) do nothing;
insert into public.station_destinations (id, name, geofence_id, active, sort) values ('e80d7000-0000-0000-0000-000000000001', 'المحطة التحويلية', 'e80d9000-0000-0000-0000-000000000002', true, 1) on conflict (id) do nothing;

do $$
declare ops uuid := 'e8000000-0000-0000-0000-000000000001'; hr1 uuid := 'e8000000-0000-0000-0000-000000000003';
  d1 uuid := 'e80dd000-0000-0000-0000-000000000001'; d2 uuid := 'e80dd000-0000-0000-0000-000000000002'; d3 uuid := 'e80dd000-0000-0000-0000-000000000003';
  t1 timestamptz := date_trunc('day', now() at time zone 'Asia/Baghdad') at time zone 'Asia/Baghdad' - interval '3 day' + interval '8 hour';
  t2 timestamptz := date_trunc('day', now() at time zone 'Asia/Baghdad') at time zone 'Asia/Baghdad' - interval '1 day' + interval '8 hour';
  js jsonb; r jsonb; ids text; day1 text; day2 text; opts jsonb;
begin
  day1 := to_char(t1 at time zone 'Asia/Baghdad', 'YYYY-MM-DD'); day2 := to_char(t2 at time zone 'Asia/Baghdad', 'YYYY-MM-DD');
  -- d1: قبل 3 أيام، كراج → محطة (عادت)، 40 نقطة من زون الكراج إلى زون المحطة مروراً بالوسط
  insert into public.garage_departures (id, vehicle_id, driver_name, shift, sector_id, departed_at, departed_by, returned_at, returned_by) values (d1, 'e80da000-0000-0000-0000-000000000001', 'سائق أ', 'morning', 96, t1, ops, t1 + interval '30 minute', ops);
  -- d2: أمس، محطة → ورشة (مفتوحة)، 20 نقطة من زون المحطة إلى معلم الورشة
  insert into public.garage_departures (id, vehicle_id, driver_name, shift, sector_id, departed_at, departed_by) values (d2, 'e80da000-0000-0000-0000-000000000002', 'سائق ب', 'evening', 95, t2, ops);
  -- d3: أمس، بلا GPS
  insert into public.garage_departures (id, vehicle_id, driver_name, shift, sector_id, departed_at, departed_by) values (d3, 'e80da000-0000-0000-0000-000000000003', 'سائق ج', 'morning', 96, t2 + interval '1 hour', ops);
  perform pg_temp.as_service();
  js := public.trip_route_apply(d1, pg_temp.line(t1, 33.30, 44.40, 33.40, 44.40, 40), 40, t1, t1 + interval '30 minute', true);
  js := public.trip_route_apply(d2, pg_temp.line(t2, 33.40, 44.40, 33.35, 44.45, 20), 20, t2, t2 + interval '10 minute', false);

  -- L1: ممنوع لغير العمليات
  perform pg_temp.as_user(hr1);
  perform pg_temp.expect_error('select public.trip_routes_list(''{}'')', 'GPS_FORBIDDEN');
  perform pg_temp.expect_error('select public.trip_routes_filter_options()', 'GPS_FORBIDDEN');
  perform pg_temp.as_user(ops);

  -- L2: بلا فلاتر: الثلاثة موجودة، الترتيب الأحدث أولاً، الملخص صحيح
  js := public.trip_routes_list(jsonb_build_object('date_from', day1, 'date_to', day2));
  if (js ->> 'total')::int <> 3 or jsonb_array_length(js -> 'rows') <> 3 then raise exception 'L2 total %', js ->> 'total'; end if;
  if js -> 'rows' -> 0 ->> 'departure_id' <> d3::text or js -> 'rows' -> 2 ->> 'departure_id' <> d1::text then raise exception 'L2 order'; end if;
  if (js -> 'summary' ->> 'open')::int <> 2 or (js -> 'summary' ->> 'complete')::int <> 1 or (js -> 'summary' ->> 'partial')::int <> 1 or (js -> 'summary' ->> 'no_device')::int <> 1 then raise exception 'L2 summary %', js -> 'summary'; end if;
  if (js -> 'summary' ->> 'distance_m')::float8 not between 18000 and 20000 then raise exception 'L2 distance %', js -> 'summary' ->> 'distance_m'; end if;
  select x into r from jsonb_array_elements(js -> 'rows') x where x ->> 'departure_id' = d1::text;
  if r ->> 'status' <> 'complete' or not (r ->> 'is_final')::boolean or r ->> 'sector_name' <> 'قاطع القائمة' or r ->> 'db_number' <> 'DB-A1' or (r ->> 'points_kept')::int <> 40
     or abs((r ->> 'from_lat')::float8 - 33.30) > 0.001 or abs((r ->> 'to_lat')::float8 - 33.40) > 0.001 or (r ->> 'trip_seconds')::int <> 1800 then raise exception 'L2 row %', r; end if;

  -- L3: الترقيم
  js := public.trip_routes_list(jsonb_build_object('date_from', day1, 'date_to', day2), 2, 0);
  if jsonb_array_length(js -> 'rows') <> 2 or (js ->> 'total')::int <> 3 then raise exception 'L3 page1'; end if;
  js := public.trip_routes_list(jsonb_build_object('date_from', day1, 'date_to', day2), 2, 2);
  if jsonb_array_length(js -> 'rows') <> 1 or js -> 'rows' -> 0 ->> 'departure_id' <> d1::text then raise exception 'L3 page2'; end if;

  -- L4: التاريخ، القاطع، المركبة، السائق، الشفت، مفتوحة/عادت، الحالة، البحث
  js := public.trip_routes_list(jsonb_build_object('date_from', day2, 'date_to', day2)); if (js ->> 'total')::int <> 2 then raise exception 'L4 date'; end if;
  js := public.trip_routes_list(jsonb_build_object('date_from', day1, 'date_to', day1)); if (js ->> 'total')::int <> 1 then raise exception 'L4 date1'; end if;
  js := public.trip_routes_list(jsonb_build_object('sector_id', 96)); if (js ->> 'total')::int <> 2 then raise exception 'L4 sector'; end if;
  js := public.trip_routes_list(jsonb_build_object('vehicle_id', 'e80da000-0000-0000-0000-000000000002')); if (js ->> 'total')::int <> 1 then raise exception 'L4 vehicle'; end if;
  js := public.trip_routes_list(jsonb_build_object('driver', 'سائق ب')); if (js ->> 'total')::int <> 1 then raise exception 'L4 driver'; end if;
  js := public.trip_routes_list(jsonb_build_object('shift', 'evening')); if (js ->> 'total')::int <> 1 then raise exception 'L4 shift'; end if;
  js := public.trip_routes_list(jsonb_build_object('trip', 'open', 'date_from', day1)); if (js ->> 'total')::int <> 2 then raise exception 'L4 open'; end if;
  js := public.trip_routes_list(jsonb_build_object('trip', 'returned', 'date_from', day1)); if (js ->> 'total')::int <> 1 then raise exception 'L4 returned'; end if;
  js := public.trip_routes_list(jsonb_build_object('status', 'no_device')); if (js ->> 'total')::int <> 1 or js -> 'rows' -> 0 ->> 'departure_id' <> d3::text then raise exception 'L4 status'; end if;
  js := public.trip_routes_list(jsonb_build_object('search', 'DB-B')); if (js ->> 'total')::int <> 1 then raise exception 'L4 search db'; end if;
  js := public.trip_routes_list(jsonb_build_object('search', 'كابسة', 'date_from', day1)); if (js ->> 'total')::int <> 2 then raise exception 'L4 search name'; end if;
  js := public.trip_routes_list(jsonb_build_object('min_km', 10)); if (js ->> 'total')::int <> 1 or js -> 'rows' -> 0 ->> 'departure_id' <> d1::text then raise exception 'L4 min_km'; end if;
  js := public.trip_routes_list(jsonb_build_object('has_gaps', false, 'date_from', day1)); if (js ->> 'total')::int <> 3 then raise exception 'L4 has_gaps'; end if;
  js := public.trip_routes_list(jsonb_build_object('has_gaps', true)); if (js ->> 'total')::int <> 0 then raise exception 'L4 has_gaps true'; end if;

  -- L5: من/إلى/مرّ بـ: زون، وجهة محطة، معلم، دائرة
  js := public.trip_routes_list(jsonb_build_object('from_place', jsonb_build_object('kind', 'zone', 'id', 'e80d9000-0000-0000-0000-000000000001')));
  if (js ->> 'total')::int <> 1 or js -> 'rows' -> 0 ->> 'departure_id' <> d1::text then raise exception 'L5 from zone'; end if;
  js := public.trip_routes_list(jsonb_build_object('to_place', jsonb_build_object('kind', 'station', 'id', 'e80d7000-0000-0000-0000-000000000001')));
  if (js ->> 'total')::int <> 1 or js -> 'rows' -> 0 ->> 'departure_id' <> d1::text then raise exception 'L5 to station'; end if;
  js := public.trip_routes_list(jsonb_build_object('from_place', jsonb_build_object('kind', 'station', 'id', 'e80d7000-0000-0000-0000-000000000001')));
  if (js ->> 'total')::int <> 1 or js -> 'rows' -> 0 ->> 'departure_id' <> d2::text then raise exception 'L5 from station'; end if;
  js := public.trip_routes_list(jsonb_build_object('to_place', jsonb_build_object('kind', 'landmark', 'id', 'e80d8000-0000-0000-0000-000000000001', 'radius_m', 150)));
  if (js ->> 'total')::int <> 1 or js -> 'rows' -> 0 ->> 'departure_id' <> d2::text then raise exception 'L5 to landmark'; end if;
  -- من زون الكراج إلى المحطة معاً
  js := public.trip_routes_list(jsonb_build_object('from_place', jsonb_build_object('kind', 'zone', 'id', 'e80d9000-0000-0000-0000-000000000001'), 'to_place', jsonb_build_object('kind', 'zone', 'id', 'e80d9000-0000-0000-0000-000000000002')));
  if (js ->> 'total')::int <> 1 then raise exception 'L5 from-to'; end if;
  js := public.trip_routes_list(jsonb_build_object('from_place', jsonb_build_object('kind', 'zone', 'id', 'e80d9000-0000-0000-0000-000000000002'), 'to_place', jsonb_build_object('kind', 'zone', 'id', 'e80d9000-0000-0000-0000-000000000001')));
  if (js ->> 'total')::int <> 0 then raise exception 'L5 reverse should be empty'; end if;
  -- دائرة حرة في منتصف طريق d1 (33.35,44.40) نصف قطر 300م: d1 مرّت بها، d2 لا
  js := public.trip_routes_list(jsonb_build_object('via_place', jsonb_build_object('kind', 'circle', 'lat', 33.35, 'lng', 44.40, 'radius_m', 300)));
  if (js ->> 'total')::int <> 1 or js -> 'rows' -> 0 ->> 'departure_id' <> d1::text then raise exception 'L5 via circle %', js ->> 'total'; end if;
  js := public.trip_routes_list(jsonb_build_object('via_place', jsonb_build_object('kind', 'zone', 'id', 'e80d9000-0000-0000-0000-000000000002')));
  if (js ->> 'total')::int <> 2 then raise exception 'L5 via station zone %', js ->> 'total'; end if;
  js := public.trip_routes_list(jsonb_build_object('via_place', jsonb_build_object('kind', 'circle', 'lat', 33.0, 'lng', 44.0, 'radius_m', 500)));
  if (js ->> 'total')::int <> 0 then raise exception 'L5 via far'; end if;
  -- نوع مكان مجهول ⇒ لا تطابق (بلا خطأ)
  js := public.trip_routes_list(jsonb_build_object('from_place', jsonb_build_object('kind', 'xx'))); if (js ->> 'total')::int <> 0 then raise exception 'L5 unknown kind'; end if;

  -- L6: الترتيب
  js := public.trip_routes_list(jsonb_build_object('order', 'distance_desc', 'date_from', day1));
  if js -> 'rows' -> 0 ->> 'departure_id' <> d1::text then raise exception 'L6 distance'; end if;
  js := public.trip_routes_list(jsonb_build_object('order', 'departed_asc', 'date_from', day1));
  if js -> 'rows' -> 0 ->> 'departure_id' <> d1::text or js -> 'rows' -> 2 ->> 'departure_id' <> d3::text then raise exception 'L6 asc'; end if;
  perform pg_temp.expect_error('select public.trip_routes_list(''{"order":"bogus"}'')', 'TRIP_ROUTES_ORDER_INVALID');
  perform pg_temp.expect_error(format('select public.trip_routes_list(%L)', jsonb_build_object('date_from', day2, 'date_to', day1)::text), 'TRIP_ROUTES_DATE_RANGE_INVALID');

  -- L7: الخيارات
  opts := public.trip_routes_filter_options();
  if not exists (select 1 from jsonb_array_elements(opts -> 'zones') z where z ->> 'name' = 'زون المحطة') then raise exception 'L7 zones'; end if;
  if not exists (select 1 from jsonb_array_elements(opts -> 'landmarks') z where z ->> 'category' = 'maintenance' and z ->> 'name' = 'ورشة الصيانة') then raise exception 'L7 landmarks'; end if;
  if not exists (select 1 from jsonb_array_elements(opts -> 'stations') z where z ->> 'id' = 'e80d7000-0000-0000-0000-000000000001') then raise exception 'L7 stations'; end if;
  select x into r from jsonb_array_elements(opts -> 'vehicles') x where x ->> 'id' = 'e80da000-0000-0000-0000-000000000003';
  if r is null or (r ->> 'has_gps')::boolean then raise exception 'L7 vehicle has_gps'; end if;
  if not exists (select 1 from jsonb_array_elements(opts -> 'sectors') z where (z ->> 'id')::int = 96) then raise exception 'L7 sectors'; end if;
  raise notice 'trip routes list ok';
end $$;
