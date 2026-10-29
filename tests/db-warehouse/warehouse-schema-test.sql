-- 00380 — مستودع GPS: البنية، الخصوصية (خادم فقط)، الفحص، مزامنة الآليات، جدولة الشهر
-- التشغيل: rm -rf /tmp/epgdata; MIGRATIONS_DIR=gps-warehouse/supabase/migrations node scripts/db-migrations-test.mjs tests/db-warehouse/warehouse-schema-test.sql
do $$
declare js jsonb; m date := date_trunc('month', (now() at time zone 'Asia/Baghdad'))::date; prev date := (m - interval '1 month')::date; days_prev int := extract(day from (m - interval '1 day'))::int; ok boolean;
begin
  -- W1: الإصدار والإعدادات الافتراضية
  if (select max(version) from public.wh_schema_version) <> 1 then raise exception 'W1 version'; end if;
  if (select min_stop_minutes || '/' || max_stop_minutes || '/' || fault_stop_hours from public.wh_settings where id = 1) <> '10/120/24' then raise exception 'W1 settings'; end if;
  begin update public.wh_settings set min_stop_minutes = 200 where id = 1; raise exception 'W1 order must fail'; exception when check_violation then null; end;
  -- W2: RLS مفعّل بلا سياسات وكل الجداول بلا صلاحيات للأدوار العامة
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname like 'wh\_%' and c.relkind = 'r' and not c.relrowsecurity) then raise exception 'W2 rls'; end if;
  if exists (select 1 from pg_policies where tablename like 'wh\_%') then raise exception 'W2 policies'; end if;
  if has_table_privilege('authenticated', 'public.wh_stops', 'select') or has_table_privilege('anon', 'public.wh_raw_points', 'select') then raise exception 'W2 grants'; end if;
  if has_function_privilege('authenticated', 'public.wh_ping()', 'execute') then raise exception 'W2 fn grant'; end if;
  -- W3: الفحص
  js := public.wh_ping();
  if not (js ->> 'ok')::boolean or (js ->> 'schema_version')::int <> 1 or (js ->> 'vehicles')::int <> 0 or (js -> 'settings' ->> 'min_stop_minutes')::int <> 10 or (js ->> 'db_bytes')::bigint <= 0 then raise exception 'W3 ping %', js; end if;
  -- W4: مزامنة الآليات — إدراج ثم تحديث ثم تعطيل من غاب
  js := public.wh_upsert_vehicles('[{"vehicle_id":"a0000000-0000-0000-0000-000000000001","db_number":"DB-1","vehicle_name":"كابسة 1","sector_id":3,"sector_name":"الكرادة","device_external_id":"d-1"},
                                    {"vehicle_id":"a0000000-0000-0000-0000-000000000002","db_number":"DB-2","vehicle_name":"كابسة 2","device_external_id":"d-2"},
                                    {"vehicle_id":"a0000000-0000-0000-0000-000000000003","vehicle_name":"بلا جهاز"}]'::jsonb);
  if (js ->> 'upserted')::int <> 3 or (js ->> 'active')::int <> 3 then raise exception 'W4 insert %', js; end if;
  js := public.wh_upsert_vehicles('[{"vehicle_id":"a0000000-0000-0000-0000-000000000001","db_number":"DB-1X","vehicle_name":"كابسة 1","device_external_id":"d-1"}]'::jsonb);
  if (js ->> 'upserted')::int <> 1 or (js ->> 'deactivated')::int <> 2 or (js ->> 'active')::int <> 1 then raise exception 'W4 deactivate %', js; end if;
  if (select db_number from public.wh_vehicles where vehicle_id = 'a0000000-0000-0000-0000-000000000001') <> 'DB-1X' then raise exception 'W4 update'; end if;
  if (select count(*) from public.wh_vehicles) <> 3 then raise exception 'W4 no delete'; end if;
  begin perform public.wh_upsert_vehicles('{"x":1}'::jsonb); raise exception 'W4 must fail'; exception when others then if sqlerrm <> 'WH_VEHICLES_INVALID' then raise; end if; end;
  -- W5: جدولة الشهر الماضي: الجهاز النشط الوحيد d-1 × كل أيام الشهر (الأجهزة المعطّلة/بلا جهاز لا تُجدول)
  js := public.wh_enqueue_month(prev + 10);
  if (js ->> 'queued')::int <> days_prev or (js ->> 'total')::int <> days_prev then raise exception 'W5 enqueue % expected %', js, days_prev; end if;
  if exists (select 1 from public.wh_pull_jobs where device_external_id <> 'd-1') then raise exception 'W5 inactive scheduled'; end if;
  -- إعادة الجدولة لا تكرّر، وتُعيد الفاشلة فقط إلى الطابور
  update public.wh_pull_jobs set status = 'done' where day = prev; update public.wh_pull_jobs set status = 'failed', error_code = 'X' where day = prev + 1;
  js := public.wh_enqueue_month(prev);
  if (js ->> 'queued')::int <> 1 or (js ->> 'total')::int <> days_prev then raise exception 'W5 requeue %', js; end if;
  if (select status || coalesce(error_code, '') from public.wh_pull_jobs where day = prev) <> 'done' then raise exception 'W5 done kept'; end if;
  if (select status || coalesce(error_code, '-') from public.wh_pull_jobs where day = prev + 1) <> 'queued-' then raise exception 'W5 failed requeued'; end if;
  -- الشهر الحالي: حتى أمس فقط؛ شهر مستقبلي مرفوض
  js := public.wh_enqueue_month(m);
  if (js ->> 'queued')::int <> greatest(0, (now() at time zone 'Asia/Baghdad')::date - m) then raise exception 'W5 current month %', js; end if;
  begin perform public.wh_enqueue_month((m + interval '1 month')::date); raise exception 'W5 must fail'; exception when others then if sqlerrm <> 'WH_MONTH_IN_FUTURE' then raise; end if; end;
  -- W6: قيود البيانات
  begin insert into public.wh_raw_points (device_external_id, t, lat, lng, day) values ('d-1', now(), 95, 44, current_date); raise exception 'W6 lat'; exception when check_violation then null; end;
  begin insert into public.wh_stops (device_external_id, day, month, started_at, ended_at, duration_s, lat, lng, class) values ('d-1', current_date, m, now(), now(), 0, 33, 44, 'weird'); raise exception 'W6 class'; exception when check_violation then null; end;
  insert into public.wh_stops (device_external_id, vehicle_id, day, month, started_at, ended_at, duration_s, lat, lng) values ('d-1', 'a0000000-0000-0000-0000-000000000001', current_date, m, now() - interval '20 minute', now(), 1200, 33.3, 44.4);
  js := public.wh_ping(); if (js ->> 'stops')::int <> 1 or (js ->> 'vehicles')::int <> 1 or (js -> 'jobs' ->> 'queued')::int < 1 then raise exception 'W6 ping counts %', js; end if;
  raise notice 'warehouse schema ok';
end $$;
