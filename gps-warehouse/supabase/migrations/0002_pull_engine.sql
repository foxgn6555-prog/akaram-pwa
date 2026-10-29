-- 0002 — 00381: محرّك السحب الشهري داخل المستودع: حجز المهام بقفل، إدخال النقاط، إنهاء المهمة، حساب توقفات اليوم فوراً،
-- الأرشفة، الصيانة (حذف الخام بعد مهلته)، والتقدّم. كل الدوال خادم فقط (مفتاح الخدمة).
insert into public.wh_schema_version (version, note) values (2, '00381 محرّك السحب') on conflict (version) do nothing;

alter table public.wh_pull_jobs add column if not exists cursor_until timestamptz;
alter table public.wh_pull_jobs add column if not exists source_points int not null default 0;
alter table public.wh_pull_jobs add column if not exists archived_at timestamptz;
alter table public.wh_settings add column if not exists pull_locked_until timestamptz;
alter table public.wh_settings add column if not exists max_attempts int not null default 6 check (max_attempts between 1 and 20);
alter table public.wh_settings add column if not exists paused boolean not null default false;
alter table public.wh_stops add column if not exists points int not null default 0;

-- دلو الأرشيف المضغوط (خاص)
insert into storage.buckets (id, name, public) values ('gps-archive', 'gps-archive', false) on conflict (id) do nothing;

create or replace function public.wh_haversine_m(a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision) returns double precision
language sql immutable as $$
  select 2 * 6371000 * asin(least(1, sqrt(power(sin(radians(b_lat - a_lat) / 2), 2) + cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2))))
$$;

-- حجز دفعة مهام: قفل عام قصير يمنع تداخل نداءين، تحرير المهام العالقة (running > 15 دقيقة)، ثم الأقدم أولاً
create or replace function public.wh_jobs_claim(p_limit int default 3) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.wh_settings; rows_ jsonb;
begin
  select * into s from public.wh_settings where id = 1 for update;
  if s.paused then return jsonb_build_object('locked', false, 'paused', true, 'jobs', '[]'::jsonb); end if;
  if s.pull_locked_until is not null and s.pull_locked_until > now() then return jsonb_build_object('locked', true, 'paused', false, 'jobs', '[]'::jsonb); end if;
  update public.wh_settings set pull_locked_until = now() + interval '2 minutes' where id = 1;
  update public.wh_pull_jobs set status = 'queued', next_try_at = now(), error_code = 'WH_JOB_STALE' where status = 'running' and started_at < now() - interval '15 minutes';
  with picked as (
    select id from public.wh_pull_jobs where status = 'queued' and next_try_at <= now() order by day asc, device_external_id asc limit greatest(1, least(coalesce(p_limit, 3), 20)) for update skip locked
  ), upd as (
    update public.wh_pull_jobs j set status = 'running', attempts = j.attempts + 1, started_at = now(), finished_at = null from picked where j.id = picked.id
    returning j.id, j.device_external_id, j.day, j.attempts, j.cursor_until, j.points
  ) select coalesce(jsonb_agg(to_jsonb(upd) order by upd.day, upd.device_external_id), '[]'::jsonb) into rows_ from upd;
  return jsonb_build_object('locked', false, 'paused', false, 'jobs', rows_, 'chunk_hours', 3);
end $$;

create or replace function public.wh_pull_release() returns void
language sql security definer set search_path = public as $$ update public.wh_settings set pull_locked_until = null where id = 1 $$;

-- إدخال نقاط قطعة: تكرار الزمن يُهمل؛ تحديث مؤشر الاستئناف
create or replace function public.wh_ingest_points(p_job_id bigint, p_points jsonb, p_cursor_until timestamptz, p_source int default 0) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j public.wh_pull_jobs; n int := 0;
begin
  select * into j from public.wh_pull_jobs where id = p_job_id for update;
  if j.id is null then raise exception 'WH_JOB_NOT_FOUND'; end if;
  if j.status <> 'running' then raise exception 'WH_JOB_NOT_RUNNING'; end if;
  if jsonb_typeof(coalesce(p_points, '[]'::jsonb)) <> 'array' then raise exception 'WH_POINTS_INVALID'; end if;
  with src as (
    select j.device_external_id dev, (x ->> 't')::timestamptz t, (x ->> 'lat')::double precision lat, (x ->> 'lng')::double precision lng,
           nullif(x ->> 'speed', '')::real speed, nullif(x ->> 'course', '')::real course
    from jsonb_array_elements(p_points) x
    where x ->> 't' is not null and x ->> 'lat' is not null and x ->> 'lng' is not null
  ), ins as (
    insert into public.wh_raw_points (device_external_id, t, lat, lng, speed, course, day)
    select dev, t, lat, lng, speed, course, j.day from src where lat between -90 and 90 and lng between -180 and 180
      and t >= (j.day::text || ' 00:00:00+03')::timestamptz and t < ((j.day + 1)::text || ' 00:00:00+03')::timestamptz
    on conflict (device_external_id, t) do nothing returning 1
  ) select count(*) into n from ins;
  update public.wh_pull_jobs set points = points + n, source_points = source_points + coalesce(p_source, 0), cursor_until = greatest(coalesce(cursor_until, p_cursor_until), p_cursor_until) where id = p_job_id;
  return jsonb_build_object('inserted', n, 'cursor_until', p_cursor_until);
end $$;

-- حساب توقفات جهاز × يوم من الخام: عناقيد حول نقطة ارتكاز (نصف القطر من الإعدادات)؛ المدة = من أول نقطة في العنقود إلى آخرها
-- (غياب النقاط أثناء الوقوف لا يقطع التوقف). التصنيف: < الأدنى يُهمل؛ valid؛ long (> الأقصى)؛ fault (≥ ساعات العطل).
-- يُدمج مع توقف اليوم السابق إن كان في المكان نفسه ومتصلاً زمنياً (توقف يعبر منتصف الليل = توقف واحد).
create or replace function public.wh_compute_day_stops(p_device text, p_day date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.wh_settings; p record; a_lat double precision; a_lng double precision; sum_lat double precision := 0; sum_lng double precision := 0; n int := 0;
  t_start timestamptz; t_last timestamptz; v_vehicle uuid; n_stops int := 0; n_short int := 0; v_month date := date_trunc('month', p_day)::date;
begin
  select * into s from public.wh_settings where id = 1;
  select vehicle_id into v_vehicle from public.wh_vehicles where device_external_id = p_device and active order by synced_at desc limit 1;
  delete from public.wh_stops where device_external_id = p_device and day = p_day;
  for p in select t, lat, lng from public.wh_raw_points where device_external_id = p_device and day = p_day order by t loop
    if a_lat is null then
      a_lat := p.lat; a_lng := p.lng; sum_lat := p.lat; sum_lng := p.lng; n := 1; t_start := p.t; t_last := p.t;
    elsif public.wh_haversine_m(a_lat, a_lng, p.lat, p.lng) <= s.cluster_radius_m then
      sum_lat := sum_lat + p.lat; sum_lng := sum_lng + p.lng; n := n + 1; t_last := p.t;
    else
      perform public.wh_close_run(p_device, v_vehicle, p_day, v_month, t_start, t_last, sum_lat / n, sum_lng / n, n, s);
      if extract(epoch from (t_last - t_start)) < s.min_stop_minutes * 60 then n_short := n_short + 1; end if;
      a_lat := p.lat; a_lng := p.lng; sum_lat := p.lat; sum_lng := p.lng; n := 1; t_start := p.t; t_last := p.t;
    end if;
  end loop;
  if a_lat is not null then
    perform public.wh_close_run(p_device, v_vehicle, p_day, v_month, t_start, t_last, sum_lat / n, sum_lng / n, n, s);
    if extract(epoch from (t_last - t_start)) < s.min_stop_minutes * 60 then n_short := n_short + 1; end if;
  end if;
  -- عدد توقفات اليوم = الصفوف المنسوبة لهذا اليوم (المدموج مع اليوم السابق يُحسب هناك)
  select count(*) into n_stops from public.wh_stops where device_external_id = p_device and day = p_day;
  return jsonb_build_object('device', p_device, 'day', p_day, 'stops', n_stops, 'short_runs', n_short);
end $$;

create or replace function public.wh_stop_class(p_seconds int, s public.wh_settings) returns text
language sql immutable as $$
  select case when p_seconds >= s.fault_stop_hours * 3600 then 'fault' when p_seconds > s.max_stop_minutes * 60 then 'long' when p_seconds >= s.min_stop_minutes * 60 then 'valid' else 'short' end
$$;

-- إغلاق عنقود: دمج مع آخر توقف سابق (نفس المكان، ومتصل خلال 30 دقيقة) وإلا إدراج إن بلغ الحد الأدنى
create or replace function public.wh_close_run(p_device text, p_vehicle uuid, p_day date, p_month date, p_start timestamptz, p_last timestamptz, p_lat double precision, p_lng double precision, p_n int, s public.wh_settings) returns void
language plpgsql security definer set search_path = public as $$
declare prev public.wh_stops; secs int;
begin
  -- توقف سابق (من يوم أسبق) متصل زمنياً: انتهى خلال 30 دقيقة قبل بداية العنقود، أو كان قد مُدّد ليغطيه (إعادة حساب)
  select * into prev from public.wh_stops where device_external_id = p_device and day < p_day and started_at < p_start and ended_at >= p_start - interval '30 minutes' order by ended_at desc limit 1;
  if prev.id is not null and public.wh_haversine_m(prev.lat, prev.lng, p_lat, p_lng) <= s.cluster_radius_m then
    secs := extract(epoch from (greatest(p_last, prev.ended_at) - prev.started_at))::int;
    update public.wh_stops set ended_at = greatest(p_last, prev.ended_at), duration_s = secs, class = public.wh_stop_class(secs, s), points = points + p_n, computed_at = now() where id = prev.id;
    return;
  end if;
  secs := extract(epoch from (p_last - p_start))::int;
  if secs < s.min_stop_minutes * 60 then return; end if;
  insert into public.wh_stops (device_external_id, vehicle_id, day, month, started_at, ended_at, duration_s, lat, lng, class, points)
  values (p_device, p_vehicle, p_day, p_month, p_start, p_last, secs, p_lat, p_lng, public.wh_stop_class(secs, s), p_n)
  on conflict (device_external_id, started_at) do update set ended_at = excluded.ended_at, duration_s = excluded.duration_s, class = excluded.class, lat = excluded.lat, lng = excluded.lng, points = excluded.points, computed_at = now();
end $$;

-- إنهاء مهمة: نجاح ⇒ done + حساب التوقفات؛ فشل ⇒ إعادة إلى الطابور بتراجع تدريجي حتى الحد الأقصى ثم failed
create or replace function public.wh_job_finish(p_job_id bigint, p_ok boolean, p_error text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j public.wh_pull_jobs; s public.wh_settings; st jsonb;
begin
  select * into j from public.wh_pull_jobs where id = p_job_id for update;
  if j.id is null then raise exception 'WH_JOB_NOT_FOUND'; end if;
  select * into s from public.wh_settings where id = 1;
  if p_ok then
    st := public.wh_compute_day_stops(j.device_external_id, j.day);
    update public.wh_pull_jobs set status = 'done', finished_at = now(), error_code = null, error_message = null, stops = (st ->> 'stops')::int, cursor_until = null where id = p_job_id;
    return jsonb_build_object('status', 'done', 'points', j.points, 'stops', (st ->> 'stops')::int);
  end if;
  if j.attempts >= s.max_attempts then
    update public.wh_pull_jobs set status = 'failed', finished_at = now(), error_code = left(coalesce(p_error, 'WH_PULL_FAILED'), 80), error_message = left(p_error, 600) where id = p_job_id;
    return jsonb_build_object('status', 'failed', 'attempts', j.attempts);
  end if;
  update public.wh_pull_jobs set status = 'queued', finished_at = now(), next_try_at = now() + (least(j.attempts, 6) * interval '10 minutes'), error_code = left(coalesce(p_error, 'WH_PULL_FAILED'), 80), error_message = left(p_error, 600) where id = p_job_id;
  return jsonb_build_object('status', 'queued', 'attempts', j.attempts, 'next_try_at', now() + (least(j.attempts, 6) * interval '10 minutes'));
end $$;

-- إعادة مهمة لم تكتمل ضمن ميزانية النداء إلى الطابور (تُستأنف من cursor_until)
create or replace function public.wh_job_release(p_job_id bigint) returns void
language sql security definer set search_path = public as $$
  update public.wh_pull_jobs set status = 'queued', next_try_at = now(), attempts = greatest(attempts - 1, 0) where id = p_job_id and status = 'running'
$$;

-- نقاط يوم للأرشفة (مضغوطة الأعمدة)
create or replace function public.wh_day_points(p_device text, p_day date) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_array(extract(epoch from t)::bigint, round(lat::numeric, 6), round(lng::numeric, 6), speed, course) order by t), '[]'::jsonb)
  from public.wh_raw_points where device_external_id = p_device and day = p_day
$$;
create or replace function public.wh_archive_mark(p_device text, p_day date, p_path text, p_bytes bigint, p_points int) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.wh_archive_files (device_external_id, day, path, bytes, points) values (p_device, p_day, p_path, p_bytes, p_points)
  on conflict (device_external_id, day) do update set path = excluded.path, bytes = excluded.bytes, points = excluded.points, created_at = now();
  update public.wh_pull_jobs set archived_at = now() where device_external_id = p_device and day = p_day;
end $$;
-- أيام منجزة لم تُؤرشف بعد (الأقدم أولاً)
create or replace function public.wh_archive_pending(p_limit int default 5) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('device_external_id', device_external_id, 'day', day, 'points', points) order by day, device_external_id), '[]'::jsonb)
  from (select device_external_id, day, points from public.wh_pull_jobs where status = 'done' and archived_at is null and points > 0 order by day, device_external_id limit greatest(1, least(coalesce(p_limit, 5), 50))) x
$$;
-- ملفات أرشيف تجاوزت مدة الاحتفاظ (تُحذف من التخزين ثم من الجدول)
create or replace function public.wh_archive_expired(p_limit int default 50) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'path', f.path) order by f.day), '[]'::jsonb)
  from (select a.id, a.path, a.day from public.wh_archive_files a, public.wh_settings s where s.id = 1 and a.day < ((now() at time zone 'Asia/Baghdad')::date - (s.archive_retention_months * interval '1 month'))::date order by a.day limit greatest(1, least(coalesce(p_limit, 50), 500))) f
$$;
create or replace function public.wh_archive_forget(p_ids bigint[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int; begin delete from public.wh_archive_files where id = any(p_ids); get diagnostics n = row_count; return n; end $$;

-- الصيانة: حذف الخام للأيام المنجزة الأقدم من مهلة الاحتفاظ (التوقفات محسوبة وملف الأرشيف — إن نجح — محفوظ)
create or replace function public.wh_maintenance() returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.wh_settings; n int; cutoff date;
begin
  select * into s from public.wh_settings where id = 1;
  cutoff := (now() at time zone 'Asia/Baghdad')::date - s.raw_retention_days;
  delete from public.wh_raw_points r where r.day < cutoff and r.device_external_id is not null
    and exists (select 1 from public.wh_pull_jobs j where j.device_external_id = r.device_external_id and j.day = r.day and j.status = 'done');
  get diagnostics n = row_count;
  return jsonb_build_object('raw_deleted', n, 'cutoff', cutoff);
end $$;

-- التقدّم لكل شهر (لبطاقة IT): مهام/نقاط/توقفات/أخطاء + آخر 10 أخطاء
create or replace function public.wh_progress() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'months', coalesce((select jsonb_agg(m order by m ->> 'month' desc) from (
        select jsonb_build_object('month', to_char(date_trunc('month', day), 'YYYY-MM'), 'total', count(*), 'done', count(*) filter (where status = 'done'),
          'queued', count(*) filter (where status = 'queued'), 'running', count(*) filter (where status = 'running'), 'failed', count(*) filter (where status = 'failed'),
          'points', coalesce(sum(points), 0), 'stops', coalesce(sum(stops), 0), 'devices', count(distinct device_external_id),
          'first_started_at', min(started_at), 'last_finished_at', max(finished_at) filter (where status = 'done'),
          'done_last_hour', count(*) filter (where status = 'done' and finished_at > now() - interval '1 hour')) m
        from public.wh_pull_jobs group by date_trunc('month', day)) x), '[]'::jsonb),
    'errors', coalesce((select jsonb_agg(jsonb_build_object('device_external_id', device_external_id, 'day', day, 'error_code', error_code, 'attempts', attempts, 'at', finished_at) order by finished_at desc)
        from (select * from public.wh_pull_jobs where error_code is not null order by finished_at desc nulls last limit 10) e), '[]'::jsonb),
    'paused', (select paused from public.wh_settings where id = 1),
    'locked', (select pull_locked_until is not null and pull_locked_until > now() from public.wh_settings where id = 1),
    'stops_by_class', coalesce((select jsonb_object_agg(class, c) from (select class, count(*) c from public.wh_stops group by class) y), '{}'::jsonb));
$$;

-- wh_ping يضم التقدّم
create or replace function public.wh_ping() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ok', true,
    'schema_version', (select max(version) from public.wh_schema_version),
    'vehicles', (select count(*) from public.wh_vehicles where active),
    'jobs', jsonb_build_object(
      'queued', (select count(*) from public.wh_pull_jobs where status = 'queued'),
      'running', (select count(*) from public.wh_pull_jobs where status = 'running'),
      'done', (select count(*) from public.wh_pull_jobs where status = 'done'),
      'failed', (select count(*) from public.wh_pull_jobs where status = 'failed')),
    'raw_points', (select count(*) from public.wh_raw_points),
    'stops', (select count(*) from public.wh_stops),
    'archive_files', (select count(*) from public.wh_archive_files),
    'db_bytes', pg_database_size(current_database()),
    'settings', (select to_jsonb(s) - 'id' - 'pull_locked_until' from public.wh_settings s where id = 1),
    'progress', public.wh_progress(),
    'server_time', now());
$$;

create or replace function public.wh_set_paused(p_paused boolean) returns jsonb
language sql security definer set search_path = public as $$
  update public.wh_settings set paused = coalesce(p_paused, false), updated_at = now() where id = 1 returning jsonb_build_object('paused', paused)
$$;

revoke all on function public.wh_haversine_m(double precision, double precision, double precision, double precision), public.wh_jobs_claim(int), public.wh_pull_release(), public.wh_ingest_points(bigint, jsonb, timestamptz, int),
  public.wh_compute_day_stops(text, date), public.wh_stop_class(int, public.wh_settings), public.wh_close_run(text, uuid, date, date, timestamptz, timestamptz, double precision, double precision, int, public.wh_settings),
  public.wh_job_finish(bigint, boolean, text), public.wh_job_release(bigint), public.wh_day_points(text, date), public.wh_archive_mark(text, date, text, bigint, int), public.wh_archive_pending(int), public.wh_archive_expired(int),
  public.wh_archive_forget(bigint[]), public.wh_maintenance(), public.wh_progress(), public.wh_ping(), public.wh_set_paused(boolean) from public, anon, authenticated;
