-- 00373 — بقع التوقف: ثلاثة أصناف + وسيط/توزيع المدد + دقة المدد الطويلة (الصمت في المكان نفسه لا يقطع التوقف)
--  • كل بقعة: class ∈ {long ≥60 د، loiter 10–60 د، light <10 د} بحسب الصنف المستحوذ على أكبر حصة من زمن التوقف،
--    median_seconds، buckets {light, loiter, long, over3h} (عدد/ثوانٍ)، والإجماليات تحمل عدد التوقفات لكل صنف.
--  • المسح: فجوة الصمت الطويلة بين نقطتي توقف في المكان نفسه (≤ نصف قطر التجميع) تُعدّ استمراراً للتوقف
--    (الجهاز ينام عند إطفاء المحرك) ⇒ توقف 12 ساعة يُحتسب 12 ساعة لا شظايا قصيرة.

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
           lag(p.spd <= s.stop_speed_kmh) over (order by p.fix_time) prev_stopped,
           lag(p.lat) over (order by p.fix_time) prev_lat,
           lag(p.lng) over (order by p.fix_time) prev_lng
    from p
  ), g as (
    -- 00373: الصمت الطويل (الجهاز نائم/مطفأ) بين نقطتي توقف في المكان نفسه لا يقطع التوقف — الآلية لم تتحرك؛
    -- يُقطع فقط إن سبقته حركة أو إن اختلف المكان (أبعد من نصف قطر التجميع)
    select q.*, sum(case when q.stopped and (q.prev_stopped is distinct from true
                               or (extract(epoch from q.fix_time - q.prev_time) > s.gap_split_seconds
                                   and app.trip_route_haversine_m(q.lat, q.lng, q.prev_lat, q.prev_lng) > s.cluster_radius_m)) then 1 else 0 end)
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
           -- 00373: صنف التوقف بمدته الحقيقية الكاملة (لا المقصوصة): خفيف < 10 د، تلكؤ 10–60 د، طويل ≥ 60 د
           case when e.duration_seconds >= 3600 then 'long' when e.duration_seconds >= 600 then 'loiter' else 'light' end cls,
           e.duration_seconds real_seconds,
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
           round(percentile_cont(0.5) within group (order by duration_seconds))::integer median_seconds,
           count(*) filter (where cls = 'light') light_stops, sum(duration_seconds) filter (where cls = 'light') light_seconds,
           count(*) filter (where cls = 'loiter') loiter_stops, sum(duration_seconds) filter (where cls = 'loiter') loiter_seconds,
           count(*) filter (where cls = 'long') long_stops, sum(duration_seconds) filter (where cls = 'long') long_seconds,
           count(*) filter (where real_seconds >= 10800) over3h_stops, sum(duration_seconds) filter (where real_seconds >= 10800) over3h_seconds,
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
      'total_seconds', r.total_seconds, 'avg_seconds', r.avg_seconds, 'max_seconds', r.max_seconds, 'median_seconds', r.median_seconds,
      -- الصنف الغالب = الصنف الذي يستحوذ على أكبر حصة من زمن التوقف في البقعة (توقف 12 ساعة واحد يغلب عشرات التوقفات القصيرة)
      'class', case when coalesce(r.long_seconds, 0) >= greatest(coalesce(r.loiter_seconds, 0), coalesce(r.light_seconds, 0)) and coalesce(r.long_seconds, 0) > 0 then 'long'
                    when coalesce(r.loiter_seconds, 0) >= coalesce(r.light_seconds, 0) and coalesce(r.loiter_seconds, 0) > 0 then 'loiter' else 'light' end,
      'buckets', jsonb_build_object(
        'light', jsonb_build_object('stops', r.light_stops, 'seconds', coalesce(r.light_seconds, 0)),
        'loiter', jsonb_build_object('stops', r.loiter_stops, 'seconds', coalesce(r.loiter_seconds, 0)),
        'long', jsonb_build_object('stops', r.long_stops, 'seconds', coalesce(r.long_seconds, 0)),
        'over3h', jsonb_build_object('stops', r.over3h_stops, 'seconds', coalesce(r.over3h_seconds, 0))),
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
      'light_stops', count(*) filter (where e.duration_seconds < 600),
      'loiter_stops', count(*) filter (where e.duration_seconds >= 600 and e.duration_seconds < 3600),
      'long_stops', count(*) filter (where e.duration_seconds >= 3600),
      'excluded', (select count(*) from public.gps_stop_events x where x.excluded and x.ended_at >= v_from))
  into v_total from public.gps_stop_events e where not e.excluded and e.ended_at >= v_from and e.started_at <= v_now;
  v_meta := jsonb_build_object('hours', case when v_minutes % 60 = 0 then to_jsonb(v_minutes / 60) else to_jsonb(round(v_minutes / 60.0, 4)) end, 'minutes', v_minutes, 'max_days', s.max_days, 'enabled', s.enabled, 'cluster_radius_m', s.cluster_radius_m,
    'last_refresh_at', s.last_refresh_at, 'refresh_minutes', s.refresh_minutes, 'generated_at', now(), 'needs_reeval', s.needs_reeval,
    'map_style', s.map_style, 'heat_intensity', s.heat_intensity, 'heat_size', s.heat_size,
    'excluded_zone_ids', to_jsonb(s.excluded_zone_ids), 'excluded_landmark_ids', to_jsonb(s.excluded_landmark_ids));
  return jsonb_build_object('spots', v_spots, 'totals', v_total, 'meta', v_meta);
end $$;
