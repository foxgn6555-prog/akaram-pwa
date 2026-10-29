-- 00372 — بقع التوقف: أحداث دائمة مستقلة عن النقاط الخام + احتفاظ 3 أيام + تنظيف يومي
-- الجذر: نقاط GPS الخام تُحذف بالاحتفاظ (3 أيام) ثم إعادة المسح كانت تحذف الأحداث الملامسة للنافذة
-- وتعيد إدراج ما يمكن اشتقاقه فقط ⇒ اختفاء البقع (200 ← 17). الآن الحذف محصور بمدى النقاط الموجودة فعلاً.

create or replace function app.gps_stop_scan_device(p_device_id uuid, p_from timestamptz, p_to timestamptz)
returns table (upserted integer, points integer, next_scan_from timestamptz, last_fix timestamptz)
language plpgsql volatile set search_path = public, app as $$
declare
  s public.gps_stop_hotspot_settings%rowtype;
  v_vehicle uuid; v_up integer := 0; v_points integer := 0; v_first timestamptz; v_last timestamptz; v_open_start timestamptz; v_ctx interval;
begin
  select * into s from public.gps_stop_hotspot_settings where id = 1;
  v_ctx := make_interval(secs => s.gap_split_seconds);
  select b.garage_vehicle_id into v_vehicle from public.gps_vehicle_bindings b where b.device_id = p_device_id;
  create temp table if not exists tmp_gps_stop_groups2 (
    started_at timestamptz, ended_at timestamptz, first_fix timestamptz, last_fix_at timestamptz, lat float8, lng float8, address text, point_count integer
  ) on commit drop;
  truncate tmp_gps_stop_groups2;
  with p as (   -- نقاط النافذة + سياق قبلها (للحالة السابقة ومنتصف الفاصل) — السياق لا يُنتج مجموعات
    select h.fix_time, h.latitude lat, h.longitude lng, coalesce(h.speed, 0) spd, nullif(trim(h.address), '') address
    from public.gps_device_position_history h
    where h.device_id = p_device_id and h.fix_time >= p_from - v_ctx and h.fix_time <= p_to
      and h.latitude is not null and h.longitude is not null
      and not (abs(h.latitude) < 0.01 and abs(h.longitude) < 0.01)
  ), q as (
    select p.*, (p.spd <= s.stop_speed_kmh) stopped,
           lag(p.fix_time) over (order by p.fix_time) prev_time,
           lead(p.fix_time) over (order by p.fix_time) next_time,
           lag(p.spd <= s.stop_speed_kmh) over (order by p.fix_time) prev_stopped
    from p
  ), g as (
    select q.*, sum(case when q.stopped and (q.prev_stopped is distinct from true
                               or extract(epoch from q.fix_time - q.prev_time) > s.gap_split_seconds) then 1 else 0 end)
                over (order by q.fix_time) grp
    from q
  ), grp as (
    select grp, min(fix_time) first_fix, max(fix_time) last_fix_at, avg(lat) lat, avg(lng) lng,
           mode() within group (order by address) address, count(*) cnt,
           -- فاصل ما قبل أول نقطة توقف وما بعد آخرها (إن كان ضمن حد الفجوة)
           (array_agg(prev_time order by fix_time))[1] prev_time,
           (array_agg(next_time order by fix_time desc))[1] next_time
    from g where stopped group by grp
  )
  insert into tmp_gps_stop_groups2 (started_at, ended_at, first_fix, last_fix_at, lat, lng, address, point_count)
  select
    case when prev_time is not null and first_fix - prev_time <= v_ctx then first_fix - (first_fix - prev_time) / 2 else first_fix end,
    case when next_time is not null and next_time - last_fix_at <= v_ctx then last_fix_at + (next_time - last_fix_at) / 2 else last_fix_at end,
    first_fix, last_fix_at, lat, lng, address, cnt
  from grp where first_fix >= p_from;
  select count(*), min(h.fix_time), max(h.fix_time) into v_points, v_first, v_last from public.gps_device_position_history h
   where h.device_id = p_device_id and h.fix_time >= p_from and h.fix_time <= p_to;
  -- 00372: أحداث التوقف دائمة — لا نقاط في النافذة (حُذفت بالاحتفاظ أو لم تُسحب) ⇒ لا نمسّ الأحداث المحفوظة
  if v_points = 0 then
    return query select 0, 0, p_to, null::timestamptz;
    return;
  end if;
  -- توقف مفتوح: آخر مجموعة تنتهي عند آخر نقطة ⇒ المسح القادم يبدأ من أول نقطة فيها
  select t.first_fix into v_open_start from tmp_gps_stop_groups2 t where t.last_fix_at = v_last order by t.first_fix desc limit 1;
  -- استبدال الأحداث الملامسة لمدى النقاط الفعلية فقط (لا تراكم، ولا مسح لما لا نقاط له)
  delete from public.gps_stop_events e where e.device_id = p_device_id and e.ended_at >= v_first and e.started_at <= v_last;
  insert into public.gps_stop_events (device_id, garage_vehicle_id, started_at, ended_at, duration_seconds, latitude, longitude, address, point_count, excluded, excluded_reason)
  select p_device_id, v_vehicle, t.started_at, t.ended_at, round(extract(epoch from t.ended_at - t.started_at))::integer, t.lat, t.lng, t.address, t.point_count,
         x.reason is not null, x.reason
  from tmp_gps_stop_groups2 t cross join lateral (select app.gps_stop_is_excluded(t.lat, t.lng) reason) x
  where extract(epoch from t.ended_at - t.started_at) >= s.stop_min_seconds
  on conflict (device_id, started_at) do update set
    garage_vehicle_id = excluded.garage_vehicle_id, ended_at = excluded.ended_at, duration_seconds = excluded.duration_seconds,
    latitude = excluded.latitude, longitude = excluded.longitude, address = coalesce(excluded.address, gps_stop_events.address),
    point_count = excluded.point_count, excluded = excluded.excluded, excluded_reason = excluded.excluded_reason, updated_at = now();
  get diagnostics v_up = row_count;
  return query select v_up, v_points, coalesce(v_open_start, v_last), v_last;
end $$;

-- الاحتفاظ 3 أيام (نافذة الخريطة الوحيدة = max_days)
alter table public.gps_stop_hotspot_settings alter column max_days set default 3;
update public.gps_stop_hotspot_settings set max_days = 3, needs_reeval = true, updated_at = now() where id = 1 and max_days > 3;

-- التنظيف الصريح يومياً (03:30 بغداد) بدل الأسبوعي
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('gps_stop_events_weekly_purge', 'gps_stop_events_daily_purge');
    perform cron.schedule('gps_stop_events_daily_purge', '30 0 * * *', 'select app.gps_stop_events_weekly_purge()');
  end if;
end $$;
