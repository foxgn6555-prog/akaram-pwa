-- 00386-ب — مراقبة السحب: ملخص الأخطاء، الأجهزة الفاشلة، العالقة، السرعة/التقدير، إعادة محاولة الفاشلة (داخل النافذة فقط)، الصلاحيات
-- depends: tests/db-warehouse/warehouse-schema-test.sql
do $$
declare js jsonb; m date := (date_trunc('month', (now() at time zone 'Asia/Baghdad')) - interval '1 month')::date; old date := (date_trunc('month', (now() at time zone 'Asia/Baghdad')) - interval '3 month')::date; n int;
begin
  if (select max(version) from public.wh_schema_version) < 6 then raise exception 'M0 version'; end if;
  -- تهيئة: جهازان، أيام فاشلة/قيد الإعادة/عالقة/منجزة
  insert into public.wh_vehicles (vehicle_id, vehicle_name, device_external_id) values (gen_random_uuid(), 'M1', 'm-1'), (gen_random_uuid(), 'M2', 'm-2');
  delete from public.wh_pull_jobs where device_external_id in ('m-1', 'm-2');
  insert into public.wh_pull_jobs (device_external_id, day, status, attempts, error_code, finished_at) values
    ('m-1', m + 1, 'failed', 6, 'LVN_TIMEOUT', now() - interval '2 hours'),
    ('m-1', m + 2, 'failed', 6, 'LVN_TIMEOUT', now() - interval '1 hour'),
    ('m-1', m + 3, 'failed', 6, 'LVN_HTTP_500', now() - interval '30 minutes'),
    ('m-2', m + 1, 'failed', 6, 'LVN_TIMEOUT', now() - interval '10 minutes'),
    ('m-2', m + 2, 'queued', 2, 'LVN_TIMEOUT', now() - interval '5 minutes'),
    ('m-2', old + 1, 'failed', 6, 'LVN_TIMEOUT', now() - interval '3 days');
  insert into public.wh_pull_jobs (device_external_id, day, status, attempts, started_at) values ('m-2', m + 3, 'running', 1, now() - interval '40 minutes');
  insert into public.wh_pull_jobs (device_external_id, day, status, attempts, points, started_at, finished_at) values ('m-2', m + 4, 'done', 1, 500, now() - interval '20 minutes', now() - interval '10 minutes'), ('m-2', m + 5, 'done', 1, 700, now() - interval '20 minutes', now() - interval '9 minutes');
  js := public.wh_progress();
  -- M1: ملخص الأخطاء حسب الرمز
  if (select x ->> 'failed' from jsonb_array_elements(js -> 'error_summary') x where x ->> 'error_code' = 'LVN_TIMEOUT')::int <> 4
     or (select x ->> 'retrying' from jsonb_array_elements(js -> 'error_summary') x where x ->> 'error_code' = 'LVN_TIMEOUT')::int <> 1
     or (select x ->> 'devices' from jsonb_array_elements(js -> 'error_summary') x where x ->> 'error_code' = 'LVN_TIMEOUT')::int <> 2
     or (js -> 'error_summary' -> 0 ->> 'error_code') <> 'LVN_TIMEOUT' then raise exception 'M1 summary %', js -> 'error_summary'; end if;
  -- M2: الأجهزة الأكثر فشلاً مع آخر رمز
  if (js -> 'failed_devices' -> 0 ->> 'device_external_id') <> 'm-1' or (js -> 'failed_devices' -> 0 ->> 'failed_days')::int <> 3 or (js -> 'failed_devices' -> 0 ->> 'last_error_code') <> 'LVN_HTTP_500' then raise exception 'M2 devices %', js -> 'failed_devices'; end if;
  if (js ->> 'failed_total')::int < 5 or (js ->> 'stale_running')::int <> 1 or (js ->> 'locked')::boolean then raise exception 'M2 totals %', js; end if;
  -- M3: السرعة والتقدير: منجزتان في الساعة، المتبقي ≥ 2 (queued + running) ⇒ eta = ceil(60*remaining/2)
  if (js -> 'throughput' ->> 'done_last_hour')::int < 2 or (js -> 'throughput' ->> 'points_last_hour')::int < 1200 or (js -> 'throughput' ->> 'eta_minutes') is null
     or (js -> 'throughput' ->> 'eta_minutes')::int <> ceil(60.0 * (js -> 'throughput' ->> 'remaining')::int / (js -> 'throughput' ->> 'done_last_hour')::int) then raise exception 'M3 throughput %', js -> 'throughput'; end if;
  -- M4: إعادة محاولة شهر محدد ثم الكل — القديم خارج النافذة لا يُعاد
  js := public.wh_retry_failed(m + 10);
  if (js ->> 'requeued')::int <> 4 or js ->> 'month' <> to_char(m, 'YYYY-MM') then raise exception 'M4 month %', js; end if;
  select count(*) into n from public.wh_pull_jobs where device_external_id in ('m-1', 'm-2') and status = 'queued' and attempts = 0 and error_code is null and next_try_at <= now();
  if n <> 4 then raise exception 'M4 reset %', n; end if;
  js := public.wh_retry_failed();
  if (js ->> 'requeued')::int <> 0 or js -> 'month' <> 'null'::jsonb then raise exception 'M4 all %', js; end if;
  if (select status from public.wh_pull_jobs where device_external_id = 'm-2' and day = old + 1) <> 'failed' then raise exception 'M4 expired kept failed'; end if;
  -- M5: الملخص صار فارغاً من الفاشلة داخل النافذة؛ wh_ping يحمل الإصدار 6
  js := public.wh_progress();
  if (select coalesce(sum((x ->> 'failed')::int), 0) from jsonb_array_elements(js -> 'error_summary') x) <> 1 then raise exception 'M5 summary after retry %', js -> 'error_summary'; end if;
  if (public.wh_ping() ->> 'schema_version')::int <> 6 then raise exception 'M5 ping'; end if;
  -- M6: الصلاحيات — خدمة فقط
  if has_function_privilege('authenticated', 'public.wh_retry_failed(date)', 'execute') or has_function_privilege('anon', 'public.wh_progress()', 'execute') then raise exception 'M6 grants'; end if;
  raise notice 'warehouse monitoring ok';
end $$;
