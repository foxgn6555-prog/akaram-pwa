-- 00328 (00382-أ): التفريغ اليومي لنقاط GPS التفصيلية — لا أثر، لا تأثير على الانطلاقيات/آخر موقع، إثبات في سجل الأرشيف، IT فقط؛ ومساحة المستودع في لوحة المساحة
set client_min_messages = notice;
insert into auth.users (id, email) values ('e9200000-0000-0000-0000-000000000001', 'it-pg@t.iq'), ('e9200000-0000-0000-0000-000000000002', 'ops-pg@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('e9200000-0000-0000-0000-000000000001', 'it_admin'), ('e9200000-0000-0000-0000-000000000002', 'ops_room') on conflict do nothing;
insert into public.sectors (id, code, name, sort, parent_sector) values (93, 'S93', 'قاطع التفريغ', 93, 'karrada') on conflict (id) do nothing;
insert into public.gps_providers (id, name, type) values ('e920b000-0000-0000-0000-000000000001', 'PG provider', 'vendor_api') on conflict (id) do nothing;
insert into public.gps_devices (id, provider_id, external_id, name, online_status) values ('e920c000-0000-0000-0000-000000000001', 'e920b000-0000-0000-0000-000000000001', 'PG-1', 'جهاز PG1', 'online') on conflict (id) do nothing;
insert into public.garage_vehicles (id, vehicle_name, db_number, plate_number, chassis_number, image_path, driver_name, shift, sector_id, created_by) values
  ('e920a000-0000-0000-0000-000000000001', 'كابسة PG', 'DB-PG1', 'P-PG1', 'CH-PG001', 'g/pg.jpg', 'سائق', 'morning', 93, 'e9200000-0000-0000-0000-000000000001') on conflict (id) do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false), set_config('auth.role', '', false) $$;
create or replace function pg_temp.as_service() returns void language sql as $$ select set_config('auth.user_id', '', false), set_config('auth.role', 'service_role', false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if position(p_code in msg) = 0 then raise exception 'WRONG_ERROR: got % wanted %', msg, p_code; end if;
end $$;
do $$
declare it1 uuid := 'e9200000-0000-0000-0000-000000000001'; ops uuid := 'e9200000-0000-0000-0000-000000000002'; dev uuid := 'e920c000-0000-0000-0000-000000000001';
        dep uuid := gen_random_uuid(); js jsonb; n bigint; ev int;
begin
  -- بيانات: 50 نقطة تفصيلية + آخر موقع + انطلاقية بمسارها
  insert into public.gps_device_position_history (device_id, latitude, longitude, speed, fix_time)
    select dev, 33.3 + i * 0.001, 44.4, 10, now() - make_interval(mins => i) from generate_series(1, 50) i;
  insert into public.gps_device_positions (device_id, latitude, longitude, speed, fix_time) values (dev, 33.3, 44.4, 0, now()) on conflict (device_id) do update set fix_time = excluded.fix_time;
  insert into public.garage_departures (id, vehicle_id, driver_name, shift, sector_id, departed_at, departed_by) values (dep, 'e920a000-0000-0000-0000-000000000001', 'سائق', 'morning', 93, now() - interval '2 hours', ops);
  insert into public.trip_route_points (departure_id, seq, fix_time, latitude, longitude) select dep, i, now() - make_interval(mins => 120 - i), 33.3, 44.4 + i * 0.001 from generate_series(1, 10) i;
  select count(*) into ev from public.data_retention_events where data_key = 'gps_position_history';
  -- P1: الصلاحيات — IT فقط
  perform pg_temp.as_user(ops);
  perform pg_temp.expect_error('select public.gps_history_purge_get()', 'IT_FORBIDDEN');
  perform pg_temp.expect_error('select public.gps_history_purge_set(false)', 'IT_FORBIDDEN');
  perform pg_temp.expect_error('select public.gps_history_purge_run_now()', 'IT_FORBIDDEN');
  -- P2: الحالة الافتراضية مفعّلة وتعرض الحجم الحالي
  perform pg_temp.as_user(it1);
  js := public.gps_history_purge_get();
  if not (js ->> 'enabled')::boolean or (js ->> 'current_rows')::int < 50 or (js ->> 'current_bytes')::bigint <= 0 or (js ->> 'runs_count')::int <> 0 or js ->> 'runs_at' <> '00:00 بغداد' then raise exception 'P2 get %', js; end if;
  -- P3: التفريغ (كما يفعله المجدول): الجدول فارغ، الباقي سليم، الإعداد والإثبات محدَّثان
  js := app.gps_history_daily_purge();
  if not (js ->> 'ok')::boolean or (js ->> 'rows')::int < 50 then raise exception 'P3 run %', js; end if;
  select count(*) into n from public.gps_device_position_history; if n <> 0 then raise exception 'P3 history not empty %', n; end if;
  select count(*) into n from public.gps_device_positions where device_id = dev; if n <> 1 then raise exception 'P3 last position lost'; end if;
  select count(*) into n from public.trip_route_points where departure_id = dep; if n <> 10 then raise exception 'P3 trip route points lost %', n; end if;
  select count(*) into n from public.gps_devices where id = dev; if n <> 1 then raise exception 'P3 device lost'; end if;
  js := public.gps_history_purge_get();
  if (js ->> 'runs_count')::int <> 1 or js ->> 'last_run_at' is null or (js ->> 'last_rows')::int < 50 or (js ->> 'current_rows')::int <> 0 or js ->> 'last_error' is not null then raise exception 'P3 state %', js; end if;
  select count(*) into n from public.data_retention_events where data_key = 'gps_position_history' and action = 'daily_purge'; if n < 1 then raise exception 'P3 proof event'; end if;
  -- P4: الإيقاف من الأرشيف ⇒ المجدول لا يحذف؛ «تشغيل الآن» من IT يحذف رغم ذلك (قرار صريح)
  js := public.gps_history_purge_set(false); if (js ->> 'enabled')::boolean then raise exception 'P4 set'; end if;
  insert into public.gps_device_position_history (device_id, latitude, longitude, speed, fix_time) values (dev, 33.3, 44.4, 0, now());
  js := app.gps_history_daily_purge(); if (js ->> 'skipped')::boolean is distinct from true then raise exception 'P4 skipped %', js; end if;
  select count(*) into n from public.gps_device_position_history; if n <> 1 then raise exception 'P4 deleted while disabled'; end if;
  js := public.gps_history_purge_run_now(); if (js ->> 'current_rows')::int <> 0 or (js ->> 'runs_count')::int <> 2 then raise exception 'P4 run now %', js; end if;
  js := public.gps_history_purge_set(true); if not (js ->> 'enabled')::boolean then raise exception 'P4 re-enable'; end if;
  -- P5: الكتالوج يضم جدول الإعداد مقفلاً
  if not exists (select 1 from app.data_retention_catalog() c where c.data_key = 'gps_history_purge_settings' and not c.deletable and c.portal_key = 'gps') then raise exception 'P5 catalog'; end if;
  -- P6: لوحة المساحة — المستودع غير مهيأ ثم مهيأ بأرقام آخر فحص، مع تنبيه عند 80%+
  js := public.space_overview();
  if (js -> 'warehouse' ->> 'configured')::boolean is distinct from false then raise exception 'P6 not configured %', js -> 'warehouse'; end if;
  perform pg_temp.as_service();
  perform public.gps_warehouse_link_record('ping', true, jsonb_build_object('schema_version', 3, 'db_bytes', 450 * 1024 * 1024, 'storage_bytes', 2048, 'storage_objects', 1, 'raw_points', 100, 'stops', 7, 'vehicles', 227), 'ujfwtbzvpshtxzsjtcxz.supabase.co');
  perform pg_temp.as_user(it1);
  js := public.space_overview();
  if not (js -> 'warehouse' ->> 'configured')::boolean or (js -> 'warehouse' ->> 'db_bytes')::bigint <> 450 * 1024 * 1024 or (js -> 'warehouse' ->> 'db_pct')::numeric <> 90.0
     or (js -> 'warehouse' ->> 'storage_bytes')::bigint <> 2048 or (js -> 'warehouse' ->> 'stops')::int <> 7 or (js -> 'warehouse' ->> 'vehicles')::int <> 227 or js -> 'warehouse' ->> 'host' <> 'ujfwtbzvpshtxzsjtcxz.supabase.co'
     or (js -> 'warehouse' ->> 'db_free_bytes')::bigint <> 50 * 1024 * 1024 then raise exception 'P6 warehouse %', js -> 'warehouse'; end if;
  if not exists (select 1 from jsonb_array_elements(js -> 'alerts') a where a ->> 'kind' = 'warehouse_db' and a ->> 'level' = 'danger') then raise exception 'P6 alert %', js -> 'alerts'; end if;
  perform pg_temp.as_user(ops); perform pg_temp.expect_error('select public.space_overview()', 'IT_FORBIDDEN');
  raise notice 'gps history daily purge ok';
end $$;
