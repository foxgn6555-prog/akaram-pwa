-- 00381 — محرّك السحب: القفل والحجز، الإدخال، التوقفات (عناقيد/تصنيف/دمج عبر منتصف الليل)، الإنهاء والتراجع، الصيانة، التقدّم
-- depends: tests/db-warehouse/warehouse-schema-test.sql
create or replace function pg_temp.pts(p_from timestamptz, p_n int, p_step_s int, p_lat double precision, p_lng double precision, p_dlat double precision) returns jsonb
language sql as $$ select coalesce(jsonb_agg(jsonb_build_object('t', p_from + (i * p_step_s) * interval '1 second', 'lat', p_lat + i * p_dlat, 'lng', p_lng, 'speed', case when p_dlat = 0 then 0 else 30 end, 'course', 90) order by i), '[]'::jsonb) from generate_series(0, p_n - 1) i $$;
do $$
declare js jsonb; j1 bigint; j2 bigint; d1 date := (date_trunc('month', (now() at time zone 'Asia/Baghdad')) - interval '1 month')::date + 4; d0 date; t0 timestamptz; prev_id bigint; n int;
begin
  -- تهيئة: الجهاز d-1 نشط (من اختبار المخطط) + مهام الشهر الماضي مجدولة؛ نأخذ يومين متتاليين d0, d1
  d0 := d1 - 1;
  update public.wh_pull_jobs set status = 'done' where day not in (d0, d1);   -- نعزل المهمتين
  update public.wh_pull_jobs set status = 'queued', next_try_at = now() where day in (d0, d1);
  -- E1: الحجز يقفل، النداء الثاني يرى القفل، الإيقاف المؤقت يمنع
  js := public.wh_jobs_claim(1);
  if (js ->> 'locked')::boolean or jsonb_array_length(js -> 'jobs') <> 1 or (js -> 'jobs' -> 0 ->> 'day')::date <> d0 then raise exception 'E1 claim %', js; end if;
  j1 := (js -> 'jobs' -> 0 ->> 'id')::bigint;
  js := public.wh_jobs_claim(1); if not (js ->> 'locked')::boolean then raise exception 'E1 lock'; end if;
  perform public.wh_pull_release();
  perform public.wh_set_paused(true); js := public.wh_jobs_claim(1); if not (js ->> 'paused')::boolean then raise exception 'E1 paused'; end if; perform public.wh_set_paused(false);
  -- E2: إدخال نقاط d0: حركة 20 دقيقة ثم وقوف 50 دقيقة عند (33.30,44.40) ثم حركة ثم وقوف قصير 4 دقائق ثم وقوف يمتد حتى منتصف الليل (آخر 90 دقيقة من اليوم)
  t0 := (d0::text || ' 06:00:00+03')::timestamptz;
  js := public.wh_ingest_points(j1, pg_temp.pts(t0, 40, 30, 33.20, 44.40, 0.0005), t0 + interval '20 minute', 40);           -- حركة
  if (js ->> 'inserted')::int <> 40 then raise exception 'E2 moving %', js; end if;
  js := public.wh_ingest_points(j1, pg_temp.pts(t0 + interval '20 minute', 100, 30, 33.30, 44.40, 0), t0 + interval '70 minute', 100);  -- وقوف 50 د (≈ 49.5)
  js := public.wh_ingest_points(j1, pg_temp.pts(t0 + interval '70 minute', 40, 30, 33.30, 44.40, 0.0005), t0 + interval '90 minute', 40);  -- حركة
  js := public.wh_ingest_points(j1, pg_temp.pts(t0 + interval '90 minute', 9, 30, 33.35, 44.40, 0), t0 + interval '94 minute', 9);     -- وقوف 4 د (يُهمل)
  js := public.wh_ingest_points(j1, pg_temp.pts(t0 + interval '94 minute', 20, 30, 33.36, 44.40, 0.0005), t0 + interval '104 minute', 20); -- حركة
  js := public.wh_ingest_points(j1, pg_temp.pts(((d1::text || ' 00:00:00+03')::timestamptz - interval '90 minute'), 10, 600, 33.40, 44.40, 0), (d1::text || ' 00:00:00+03')::timestamptz, 10); -- وقوف يمتد لآخر اليوم (نقطة كل 10 د؛ نقطة منتصف الليل خارج اليوم تُرفض ⇒ 9 نقاط، 80 د)
  -- نقاط خارج اليوم تُرفض، والتكرار يُهمل
  js := public.wh_ingest_points(j1, pg_temp.pts((d1::text || ' 01:00:00+03')::timestamptz, 5, 30, 33.4, 44.4, 0), null, 5); if (js ->> 'inserted')::int <> 0 then raise exception 'E2 outside day'; end if;
  js := public.wh_ingest_points(j1, pg_temp.pts(t0, 40, 30, 33.20, 44.40, 0.0005), t0, 40); if (js ->> 'inserted')::int <> 0 then raise exception 'E2 dup'; end if;
  if (select points from public.wh_pull_jobs where id = j1) <> 217 then raise exception 'E2 points %', (select points from public.wh_pull_jobs where id = j1); end if;
  -- E3: إنهاء d0 ⇒ توقفان (50 د valid + 90 د valid حتى منتصف الليل)؛ القصير مهمل
  js := public.wh_job_finish(j1, true);
  if js ->> 'status' <> 'done' or (js ->> 'stops')::int <> 2 then raise exception 'E3 finish %', js; end if;
  if (select count(*) from public.wh_stops where device_external_id = 'd-1' and day = d0 and class = 'valid') <> 2 then raise exception 'E3 classes'; end if;
  select id into prev_id from public.wh_stops where device_external_id = 'd-1' and day = d0 order by started_at desc limit 1;
  if (select duration_s from public.wh_stops where id = prev_id) <> 4800 then raise exception 'E3 midnight stop %', (select duration_s from public.wh_stops where id = prev_id); end if;
  if (select vehicle_id from public.wh_stops where id = prev_id) <> 'a0000000-0000-0000-0000-000000000001' then raise exception 'E3 vehicle link'; end if;
  -- E4: d1 يبدأ بالوقوف في المكان نفسه 23 ساعة (نقطة كل 30 د) ⇒ يُدمج مع توقف d0 ⇒ 24.5 ساعة = fault؛ ثم حركة ثم وقوف 3 ساعات = long
  perform public.wh_pull_release(); js := public.wh_jobs_claim(1); j2 := (js -> 'jobs' -> 0 ->> 'id')::bigint;
  if (js -> 'jobs' -> 0 ->> 'day')::date <> d1 then raise exception 'E4 claim %', js; end if;
  t0 := (d1::text || ' 00:00:00+03')::timestamptz;
  js := public.wh_ingest_points(j2, pg_temp.pts(t0, 47, 1800, 33.40, 44.40, 0), t0 + interval '23 hour', 47);
  js := public.wh_ingest_points(j2, pg_temp.pts(t0 + interval '23 hour', 10, 30, 33.41, 44.40, 0.001), t0 + interval '23 hour 5 minute', 10);
  js := public.wh_ingest_points(j2, pg_temp.pts(t0 + interval '23 hour 5 minute', 7, 300, 33.45, 44.40, 0), t0 + interval '23 hour 35 minute', 7); -- 30 د valid
  js := public.wh_job_finish(j2, true);
  if (js ->> 'stops')::int <> 1 then raise exception 'E4 new stops %', js; end if;   -- المدموج لا يُعدّ جديداً؛ الجديد واحد (30 د)
  if (select class from public.wh_stops where id = prev_id) <> 'fault' or (select duration_s from public.wh_stops where id = prev_id) <> 5400 + 23 * 3600 then raise exception 'E4 merged fault % %', (select class from public.wh_stops where id = prev_id), (select duration_s from public.wh_stops where id = prev_id); end if;
  if (select count(*) from public.wh_stops where device_external_id = 'd-1' and day = d1) <> 1 then raise exception 'E4 d1 stops'; end if;
  -- إعادة الحساب لليوم نفسه لا تضاعف شيئاً
  js := public.wh_compute_day_stops('d-1', d1);
  if (select count(*) from public.wh_stops where device_external_id = 'd-1' and day in (d0, d1)) <> 3 or (select duration_s from public.wh_stops where id = prev_id) <> 5400 + 23 * 3600 then raise exception 'E4 idempotent % %', (select jsonb_agg(jsonb_build_object('d', day, 's', started_at, 'e', ended_at, 'c', class)) from public.wh_stops where device_external_id = 'd-1'), prev_id; end if;
  -- E5: تصنيف long: 3 ساعات وقوف في يوم منفصل
  update public.wh_pull_jobs set status = 'queued', next_try_at = now() where day = d1 + 1; perform public.wh_pull_release(); js := public.wh_jobs_claim(1); j2 := (js -> 'jobs' -> 0 ->> 'id')::bigint;
  t0 := ((d1 + 1)::text || ' 08:00:00+03')::timestamptz;
  js := public.wh_ingest_points(j2, pg_temp.pts(t0, 37, 300, 33.50, 44.40, 0), t0 + interval '3 hour', 37);
  js := public.wh_job_finish(j2, true);
  if (select class from public.wh_stops where device_external_id = 'd-1' and day = d1 + 1) <> 'long' then raise exception 'E5 long'; end if;
  -- E6: الفشل ⇒ عودة للطابور بتراجع؛ بعد الحد الأقصى ⇒ failed؛ التحرير يُعيد للطابور فوراً ويُرجع المحاولة
  update public.wh_pull_jobs set status = 'queued', next_try_at = now() where day = d1 + 2; perform public.wh_pull_release(); js := public.wh_jobs_claim(1); j2 := (js -> 'jobs' -> 0 ->> 'id')::bigint;
  js := public.wh_job_finish(j2, false, 'LVN_TIMEOUT');
  if js ->> 'status' <> 'queued' or (select next_try_at > now() + interval '5 minutes' and error_code = 'LVN_TIMEOUT' from public.wh_pull_jobs where id = j2) is not true then raise exception 'E6 backoff %', js; end if;
  update public.wh_pull_jobs set attempts = 6, next_try_at = now(), status = 'running' where id = j2;
  js := public.wh_job_finish(j2, false, 'LVN_TIMEOUT'); if js ->> 'status' <> 'failed' then raise exception 'E6 failed %', js; end if;
  update public.wh_pull_jobs set status = 'running', attempts = 2, started_at = now() where id = j2;
  perform public.wh_job_release(j2); if (select status || attempts from public.wh_pull_jobs where id = j2) <> 'queued1' then raise exception 'E6 release'; end if;
  -- المهمة العالقة تُحرَّر عند الحجز التالي
  update public.wh_pull_jobs set status = 'running', started_at = now() - interval '20 minutes' where id = j2;
  perform public.wh_pull_release(); js := public.wh_jobs_claim(1);
  if (js -> 'jobs' -> 0 ->> 'id')::bigint <> j2 then raise exception 'E6 stale reclaim %', js; end if;
  begin perform public.wh_ingest_points(j1, '[]'::jsonb, null, 0); raise exception 'E6 must fail'; exception when others then if sqlerrm <> 'WH_JOB_NOT_RUNNING' then raise; end if; end;
  -- E7: الأرشفة والصيانة: الأيام المنجزة بلا أرشيف تُدرج؛ بعد التعليم تختفي؛ الخام الأقدم من المهلة يُحذف فقط للمنجز
  js := public.wh_archive_pending(10);
  if not exists (select 1 from jsonb_array_elements(js) x where (x ->> 'day')::date = d0 and (x ->> 'points')::int = 217) then raise exception 'E7 pending %', js; end if;
  js := public.wh_day_points('d-1', d0); if jsonb_array_length(js) <> 217 or jsonb_array_length(js -> 0) <> 5 then raise exception 'E7 day points'; end if;
  perform public.wh_archive_mark('d-1', d0, format('%s/d-1.json.gz', d0), 1234, 217);
  if exists (select 1 from jsonb_array_elements(public.wh_archive_pending(10)) x where (x ->> 'day')::date = d0) then raise exception 'E7 still pending'; end if;
  if (select archived_at is null from public.wh_pull_jobs where id = j1) then raise exception 'E7 archived_at'; end if;
  js := public.wh_maintenance();
  if (js ->> 'raw_deleted')::int < 217 or exists (select 1 from public.wh_raw_points where day = d0) then raise exception 'E7 maintenance %', js; end if;
  if (select count(*) from public.wh_stops where device_external_id = 'd-1' and day = d0) <> 2 then raise exception 'E7 stops kept'; end if;
  -- E8: التقدّم والفحص
  js := public.wh_progress();
  if (js -> 'months' -> 0 ->> 'done')::int < 3 or (js -> 'stops_by_class' ->> 'fault')::int <> 1 or (js -> 'stops_by_class' ->> 'long')::int <> 1 or (js -> 'stops_by_class' ->> 'valid')::int <> 2 or (js -> 'stops_by_class' ->> 'pending')::int <> 1 then raise exception 'E8 progress %', js; end if;
  if not exists (select 1 from jsonb_array_elements(js -> 'errors') e where e ->> 'error_code' in ('LVN_TIMEOUT', 'WH_JOB_STALE')) then raise exception 'E8 errors'; end if;
  js := public.wh_ping(); if (js ->> 'schema_version')::int <> 2 or js -> 'progress' -> 'months' is null or (js ->> 'archive_files')::int <> 1 or js -> 'settings' ? 'pull_locked_until' then raise exception 'E8 ping %', js; end if;
  if has_function_privilege('authenticated', 'public.wh_jobs_claim(int)', 'execute') then raise exception 'E8 grant'; end if;
  raise notice 'pull engine ok';
end $$;
