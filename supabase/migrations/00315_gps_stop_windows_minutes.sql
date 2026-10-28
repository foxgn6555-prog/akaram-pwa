-- 00371 — بقع التوقف: نوافذ دقيقة (5 د … 7 أيام) + سحب LVN خادمي فقط
--  • gps_stop_hotspots_v2(p_minutes): النافذة بالدقائق، ومن كل توقف يُحتسب الجزء الواقع داخل النافذة فقط (قصّ دقيق بالثانية).
--    الدالة القديمة بالساعات تبقى غلافاً. gps_stop_hotspot_events_v2 كذلك.
--  • السحب من LVN: الخادم فقط (المجدول) — لا زر للموظفين؛ حالة السحب تبقى للعرض.

create or replace function public.gps_stop_hotspots_v2(p_minutes integer default 1440)
returns jsonb language plpgsql stable security definer set search_path = public, app set statement_timeout = '25s' as $$
declare
  s public.gps_stop_hotspot_settings%rowtype; v_minutes integer; v_from timestamptz; v_now timestamptz := now(); v_cell_lat float8; v_cell_lng float8;
  v_spots jsonb; v_total jsonb; v_meta jsonb;
begin
  if auth.uid() is null or not app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into s from public.gps_stop_hotspot_settings where id = 1;
  v_minutes := least(greatest(coalesce(p_minutes, 1440), 1), s.max_days * 1440);
  v_from := v_now - make_interval(mins => v_minutes);
  v_cell_lat := s.cluster_radius_m / 111320.0;
  v_cell_lng := s.cluster_radius_m / (111320.0 * cos(radians(33.3)));
  with e0 as (
    -- 00371: الدقة — يُحتسب من كل توقف الجزءُ الواقع داخل النافذة فقط (توقف بدأ قبلها يُقصّ عند بدايتها)
    select e.id, e.device_id, e.garage_vehicle_id, greatest(e.started_at, v_from) started_at, least(e.ended_at, v_now) ended_at,
           greatest(1, round(extract(epoch from least(e.ended_at, v_now) - greatest(e.started_at, v_from))))::integer duration_seconds,
           e.latitude, e.longitude, e.address,
           floor(e.latitude / v_cell_lat)::bigint cy0, floor(e.longitude / v_cell_lng)::bigint cx0
    from public.gps_stop_events e where not e.excluded and e.ended_at >= v_from and e.started_at <= v_now
  ), w as (
    select cy0, cx0, sum(duration_seconds) wsec from e0 group by cy0, cx0
  ), nb as (   -- كل خلية × جيرانها التسعة (مفاتيح مُفكَّكة ⇒ ربط تجزئي لا مترابط)
    select a.cy0, a.cx0, b.cy0 py, b.cx0 px, b.wsec
    from w a cross join lateral (values (-1), (0), (1)) dy(d) cross join lateral (values (-1), (0), (1)) dx(d)
    join w b on b.cy0 = a.cy0 + dy.d and b.cx0 = a.cx0 + dx.d
  ), parent as (
    select distinct on (cy0, cx0) cy0, cx0, py, px from nb order by cy0, cx0, wsec desc, py, px
  ), e as (
    select e0.*, p.py cy, p.px cx from e0 join parent p on p.cy0 = e0.cy0 and p.cx0 = e0.cx0
  ), c as (
    select cy, cx, count(*) stops, sum(duration_seconds)::bigint total_seconds, max(duration_seconds) max_seconds,
           round(avg(duration_seconds))::integer avg_seconds, count(distinct device_id) vehicles,
           sum(latitude * greatest(duration_seconds, 1)) / sum(greatest(duration_seconds, 1)) lat,
           sum(longitude * greatest(duration_seconds, 1)) / sum(greatest(duration_seconds, 1)) lng,
           max(ended_at) last_at, min(started_at) first_at,
           mode() within group (order by address) address,
           count(*) filter (where ended_at >= now() - interval '24 hours') stops_24h,
           bool_or(ended_at >= now() - interval '15 minutes') active_now,
           mode() within group (order by extract(hour from started_at at time zone 'Asia/Baghdad')::integer) peak_hour
    from e group by cy, cx
  ), hourly_g as (
    select cy, cx, extract(hour from started_at at time zone 'Asia/Baghdad')::integer h, sum(duration_seconds) sec from e group by 1, 2, 3
  ), hourly as (   -- توزيع زمن التوقف على ساعات اليوم (24 خانة) — تجميع واحد ثم ملء الأصفار
    select c.cy, c.cx, jsonb_agg(coalesce(hg.sec, 0) order by g.h) hours
    from c cross join generate_series(0, 23) g(h)
    left join hourly_g hg on hg.cy = c.cy and hg.cx = c.cx and hg.h = g.h
    group by c.cy, c.cx
  ), tv as (   -- أعلى 3 آليات لكل بقعة بتجميع واحد
    select cy, cx, jsonb_agg(jsonb_build_object('vehicle_id', garage_vehicle_id, 'db_number', db_number, 'vehicle_name', vehicle_name,
                                                'stops', stops, 'total_seconds', secs) order by secs desc) top_vehicles
    from (
      select e.cy, e.cx, e.garage_vehicle_id, v.db_number, coalesce(v.vehicle_name, g.name) vehicle_name, count(*) stops, sum(e.duration_seconds) secs,
             row_number() over (partition by e.cy, e.cx order by sum(e.duration_seconds) desc) rn
      from e join public.gps_devices g on g.id = e.device_id
      left join public.garage_vehicles v on v.id = e.garage_vehicle_id
      group by e.cy, e.cx, e.garage_vehicle_id, v.db_number, v.vehicle_name, g.name
    ) t where rn <= 3 group by cy, cx
  ), ranked as (
    select c.*, row_number() over (order by total_seconds desc, stops desc) rnk,
           percent_rank() over (order by total_seconds) pr,
           max(total_seconds) over () top_seconds, count(*) over () n, sum(total_seconds) over () all_seconds
    from c
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.cy || ':' || r.cx, 'rank', r.rnk, 'lat', r.lat, 'lng', r.lng,
      'stops', r.stops, 'stops_24h', r.stops_24h, 'vehicles', r.vehicles,
      'total_seconds', r.total_seconds, 'avg_seconds', r.avg_seconds, 'max_seconds', r.max_seconds,
      -- الحجم: لوغاريتمي كي لا تبتلع بقعة ضخمة الباقي؛ المئين: للتدرج اللوني
      'score', round((ln(1 + r.total_seconds) / ln(1 + greatest(r.top_seconds, 1)))::numeric, 3),
      'percentile', round(r.pr::numeric, 3),
      'level', case when r.n = 1 or r.pr >= 0.9 then 'high' when r.pr >= 0.6 then 'medium' else 'low' end,
      'share', round((r.total_seconds::numeric / greatest(r.all_seconds, 1)), 4),
      'first_at', r.first_at, 'last_at', r.last_at, 'active_now', r.active_now, 'peak_hour', r.peak_hour, 'address', r.address,
      'hourly', coalesce(h.hours, '[]'::jsonb),
      'top_vehicles', coalesce(t.top_vehicles, '[]'::jsonb)
    ) order by r.rnk), '[]'::jsonb)
  into v_spots
  from ranked r left join hourly h on h.cy = r.cy and h.cx = r.cx left join tv t on t.cy = r.cy and t.cx = r.cx;
  select jsonb_build_object(
      'stops', count(*), 'total_seconds', coalesce(sum(greatest(1, round(extract(epoch from least(e.ended_at, v_now) - greatest(e.started_at, v_from))))), 0),
      'vehicles', count(distinct device_id),
      'excluded', (select count(*) from public.gps_stop_events x where x.excluded and x.ended_at >= v_from))
  into v_total from public.gps_stop_events e where not e.excluded and e.ended_at >= v_from and e.started_at <= v_now;
  v_meta := jsonb_build_object('hours', case when v_minutes % 60 = 0 then to_jsonb(v_minutes / 60) else to_jsonb(round(v_minutes / 60.0, 4)) end, 'minutes', v_minutes, 'max_days', s.max_days, 'enabled', s.enabled, 'cluster_radius_m', s.cluster_radius_m,
    'last_refresh_at', s.last_refresh_at, 'refresh_minutes', s.refresh_minutes, 'generated_at', now(), 'needs_reeval', s.needs_reeval,
    'map_style', s.map_style, 'heat_intensity', s.heat_intensity, 'heat_size', s.heat_size,
    'excluded_zone_ids', to_jsonb(s.excluded_zone_ids), 'excluded_landmark_ids', to_jsonb(s.excluded_landmark_ids));
  return jsonb_build_object('spots', v_spots, 'totals', v_total, 'meta', v_meta);
end $$;

create or replace function public.gps_stop_hotspots(p_hours integer default 24)
returns jsonb language sql stable security definer set search_path = public, app as $$
  select public.gps_stop_hotspots_v2(coalesce(p_hours, 24) * 60)
$$;

create or replace function public.gps_stop_hotspot_events_v2(p_lat float8, p_lng float8, p_minutes integer default 1440, p_limit integer default 30)
returns table (id bigint, vehicle_id uuid, db_number text, vehicle_name text, started_at timestamptz, ended_at timestamptz, duration_seconds integer, address text)
language sql stable security definer set search_path = public, app as $$
  select e.id, e.garage_vehicle_id, v.db_number, coalesce(v.vehicle_name, g.name),
         greatest(e.started_at, w.from_at), least(e.ended_at, now()),
         greatest(1, round(extract(epoch from least(e.ended_at, now()) - greatest(e.started_at, w.from_at))))::integer, e.address
  from public.gps_stop_events e
  join public.gps_devices g on g.id = e.device_id
  left join public.garage_vehicles v on v.id = e.garage_vehicle_id
  cross join (select s.*, now() - make_interval(mins => least(greatest(coalesce(p_minutes, 1440), 1), s.max_days * 1440)) from_at from public.gps_stop_hotspot_settings s where s.id = 1) w
  where auth.uid() is not null and app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin'])
    and not e.excluded and e.ended_at >= w.from_at and e.started_at <= now()
    and app.trip_route_haversine_m(e.latitude, e.longitude, p_lat, p_lng) <= w.cluster_radius_m * 1.5
  order by e.ended_at desc limit least(greatest(coalesce(p_limit, 30), 1), 200)
$$;

revoke all on function public.gps_stop_hotspots_v2(integer) from public, anon;
revoke all on function public.gps_stop_hotspot_events_v2(float8, float8, integer, integer) from public, anon;
grant execute on function public.gps_stop_hotspots_v2(integer) to authenticated;
grant execute on function public.gps_stop_hotspot_events_v2(float8, float8, integer, integer) to authenticated;

-- ───────────── 00371: تنظيف أسبوعي صريح لنقاط التوقف الأقدم من max_days (افتراضياً 7 أيام) ─────────────
-- التحديث الدوري يحذف القديم أصلاً؛ هذه شبكة أمان أسبوعية تضمن ألا يبقى شيء أقدم من المدة حتى لو توقف التحديث.
create or replace function app.gps_stop_events_weekly_purge()
returns integer language plpgsql security definer set search_path = public, app as $$
declare n integer; v_days integer;
begin
  select max_days into v_days from public.gps_stop_hotspot_settings where id = 1;
  delete from public.gps_stop_events where ended_at < now() - make_interval(days => coalesce(v_days, 7));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function app.gps_stop_events_weekly_purge() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'gps_stop_events_weekly_purge';
    -- كل جمعة 03:30 بتوقيت بغداد (00:30 UTC)
    perform cron.schedule('gps_stop_events_weekly_purge', '30 0 * * 5', 'select app.gps_stop_events_weekly_purge()');
  end if;
end $$;
