-- 00383 — محرّك البقع: إسناد ضمن نصف القطر، الأصناف الثلاثة، التكرار، تعدد الآليات/القواطع، الملخص، إعادة البناء، التدوير
-- depends: tests/db-warehouse/warehouse-schema-test.sql
do $$
declare js jsonb; m date := (date_trunc('month', (now() at time zone 'Asia/Baghdad')) - interval '1 month')::date; t0 timestamptz; h1 bigint; h2 bigint; r record; s public.wh_settings;
begin
  select * into s from public.wh_settings where id = 1;
  -- آلية ثانية بجهاز d-2 في قاطع آخر
  perform public.wh_upsert_vehicles(jsonb_build_array(
    jsonb_build_object('vehicle_id', 'e8ad0000-0000-0000-0000-000000000001', 'db_number', 'DB-1', 'vehicle_name', 'كابسة 1', 'sector_id', 1, 'sector_name', 'قاطع أ', 'device_external_id', 'd-1', 'device_name', 'd-1'),
    jsonb_build_object('vehicle_id', 'e8ad0000-0000-0000-0000-000000000002', 'db_number', 'DB-2', 'vehicle_name', 'كابسة 2', 'sector_id', 2, 'sector_name', 'قاطع ب', 'device_external_id', 'd-2', 'device_name', 'd-2')));
  t0 := (m + 2)::timestamp at time zone 'Asia/Baghdad' + interval '8 hour';
  -- بقعة A: 5 توقفات صالحة ضمن 80 م، 4 أيام، جهازان: 15/30/90/25/12 دقيقة
  insert into public.wh_stops (device_external_id, day, month, started_at, ended_at, duration_s, lat, lng, class) values
    ('d-1', m + 2, m, t0, t0 + interval '15 min', 900, 33.30000, 44.40000, 'valid'),
    ('d-1', m + 3, m, t0 + interval '1 day', t0 + interval '1 day 30 min', 1800, 33.30030, 44.40000, 'valid'),     -- ≈33 م
    ('d-2', m + 3, m, t0 + interval '1 day 2 hour', t0 + interval '1 day 3 hour 30 min', 5400, 33.30000, 44.40040, 'valid'), -- ≈37 م
    ('d-2', m + 5, m, t0 + interval '3 day', t0 + interval '3 day 25 min', 1500, 33.29980, 44.40010, 'valid'),
    ('d-1', m + 9, m, t0 + interval '7 day', t0 + interval '7 day 12 min', 720, 33.30010, 44.39990, 'valid'),
  -- بقعة B: توقف واحد على بعد ≈ 330 م
    ('d-1', m + 4, m, t0 + interval '2 day', t0 + interval '2 day 40 min', 2400, 33.30300, 44.40000, 'valid'),
  -- مستبعدة: طويل وعطل
    ('d-1', m + 6, m, t0 + interval '4 day', t0 + interval '4 day 3 hour', 10800, 33.30000, 44.40000, 'long'),
    ('d-2', m + 7, m, t0 + interval '5 day', t0 + interval '6 day 1 hour', 90000, 33.30000, 44.40000, 'fault');
  -- H1: الإسناد والتجميع
  js := public.wh_hotspots_refresh(100);
  if (js ->> 'assigned')::int <> 6 or (js ->> 'created')::int <> 2 or (js ->> 'remaining')::int <> 0 or (js ->> 'dirty')::int <> 0 then raise exception 'H1 refresh %', js; end if;
  if exists (select 1 from public.wh_stops where class in ('long', 'fault') and hotspot_id is not null) then raise exception 'H1 excluded assigned'; end if;
  select * into r from public.wh_hotspots where month = m order by stops_count desc limit 1; h1 := r.id;
  if r.stops_count <> 5 or r.days_count <> 4 or r.vehicles_count <> 2 or r.light_count <> 2 or r.medium_count <> 2 or r.heavy_count <> 1 or r.dominant_class <> 'medium'
     or r.recurrence <> 'recurring' or r.total_minutes <> 172 or r.max_minutes <> 90 or jsonb_array_length(r.vehicles) <> 2 or cardinality(r.sector_ids) <> 2 or cardinality(r.days) <> 4 or cardinality(r.hours) <> 24
     or r.vehicles -> 0 ->> 'name' not in ('كابسة 1', 'كابسة 2') or public.wh_haversine_m(r.lat, r.lng, 33.3, 44.4) > 30 then raise exception 'H1 hotspot A %', to_jsonb(r); end if;
  if (select sum(x) from unnest(r.hours) x) <> 5 then raise exception 'H1 hours'; end if;
  select * into r from public.wh_hotspots where month = m and id <> h1; h2 := r.id;
  if r.stops_count <> 1 or r.recurrence <> 'once' or r.dominant_class <> 'medium' or r.vehicles_count <> 1 then raise exception 'H1 hotspot B %', to_jsonb(r); end if;
  -- H2: الملخص صفحات + الحقول
  js := public.wh_hotspots_summary(m, 1, 0);
  if (js ->> 'total')::int <> 2 or (js ->> 'pending')::int <> 0 or jsonb_array_length(js -> 'rows') <> 1 or js -> 'rows' -> 0 ? 'dirty' or not (js -> 'rows' -> 0 ? 'vehicles') then raise exception 'H2 summary %', js; end if;
  js := public.wh_hotspots_summary(m, 10, 1); if jsonb_array_length(js -> 'rows') <> 1 then raise exception 'H2 page 2'; end if;
  -- H3: حذف توقف (إعادة حساب يوم) يعلّم البقعة ويعاد تجميعها
  delete from public.wh_stops where hotspot_id = h1 and duration_s = 5400;
  if not (select dirty from public.wh_hotspots where id = h1) then raise exception 'H3 dirty'; end if;
  js := public.wh_hotspots_refresh(100);
  select * into r from public.wh_hotspots where id = h1;
  if r.stops_count <> 4 or r.heavy_count <> 0 or r.dominant_class <> 'medium' or r.days_count <> 4 then raise exception 'H3 reagg %', to_jsonb(r); end if;
  delete from public.wh_stops where hotspot_id = h2; perform public.wh_hotspots_refresh(100);
  if exists (select 1 from public.wh_hotspots where id = h2) then raise exception 'H3 empty hotspot kept'; end if;
  -- H4: التكرار المرتفع عند ≥ recur_high_days
  insert into public.wh_stops (device_external_id, day, month, started_at, ended_at, duration_s, lat, lng, class)
    select 'd-1', m + 10 + i, m, t0 + make_interval(days => 8 + i), t0 + make_interval(days => 8 + i) + interval '20 min', 1200, 33.30005, 44.40005, 'valid' from generate_series(1, 7) i;
  perform public.wh_hotspots_refresh(100);
  select * into r from public.wh_hotspots where id = h1; if r.days_count <> 11 or r.recurrence <> 'frequent' then raise exception 'H4 frequent %', to_jsonb(r); end if;
  -- H5: إعادة البناء ثم الإسناد من جديد يعطي النتيجة نفسها؛ الفحص يعدّ البقع
  js := public.wh_hotspots_rebuild(m);
  if exists (select 1 from public.wh_hotspots where month = m) or exists (select 1 from public.wh_stops where month = m and hotspot_id is not null) then raise exception 'H5 rebuild'; end if;
  js := public.wh_hotspots_refresh(100); if (js ->> 'created')::int <> 1 or (js ->> 'assigned')::int <> 11 then raise exception 'H5 refresh %', js; end if;
  js := public.wh_ping(); if (js ->> 'hotspots')::int <> 1 or (js -> 'hotspots_by_month' ->> to_char(m, 'YYYY-MM'))::int <> 1 or (js ->> 'schema_version')::int < 5 then raise exception 'H5 ping %', js; end if;
  -- H6: التدوير يمسح بقع ما قبل النافذة؛ الصيانة تستدعي التحديث
  insert into public.wh_hotspots (month, lat, lng) values (public.wh_cutoff() - 40, 33.3, 44.4);
  js := public.wh_maintenance();
  if (js -> 'rollover' ->> 'hotspots')::int <> 1 or js -> 'hotspots' ->> 'assigned' is null then raise exception 'H6 maintenance %', js; end if;
  if has_function_privilege('authenticated', 'public.wh_hotspots_summary(date, int, int)', 'execute') then raise exception 'H6 grant'; end if;
  raise notice 'warehouse hotspots ok';
end $$;
