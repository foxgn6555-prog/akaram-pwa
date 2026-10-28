-- 00366 — بقع التوقف: دقة الأوقات، أنماط العرض، سحب LVN ثنائي الاتجاه عبر المجدول الخادمي، ومهل القراءة
-- (1) دقة: بداية التوقف = منتصف المسافة الزمنية بين آخر نقطة حركة وأول نقطة توقف، ونهايته = منتصفها بين آخر نقطة توقف وأول نقطة حركة
--     بعدها (بدل أول/آخر نقطة توقف فقط التي كانت تُنقص المدة حتى فاصل عيّنة من كل طرف)؛ سياق قبل نافذة المسح كي تثبت البداية بين المسحات؛
--     استبدال الأحداث الملامسة للنافذة بدل التراكم ⇒ لا تكرار.
-- (2) عرض: نمط «توهّج» (افتراضي) أو «حرارة فقط» (مناطق غامقة بلا نقطة/نواة)، مع شدة وحجم قابلين للضبط من الإعدادات.
-- (3) سحب LVN: نافذة الجهاز تمتد للأمام (الأحدث أولاً) ثم للخلف حتى حد الاحتفاظ؛ ينفّذه المجدول الخادمي مع كل دورة دقيقة.

alter table public.gps_stop_hotspot_settings
  add column if not exists map_style text not null default 'glow' check (map_style in ('glow', 'heat')),
  add column if not exists heat_intensity numeric(3,2) not null default 0.70 check (heat_intensity between 0.2 and 1),
  add column if not exists heat_size numeric(3,2) not null default 1.00 check (heat_size between 0.5 and 2.5);
alter table public.gps_stop_scan_state add column if not exists lvn_pulled_from timestamptz;

-- ───────────── مسح جهاز واحد (دقة الأوقات) ─────────────
create or replace function app.gps_stop_scan_device(p_device_id uuid, p_from timestamptz, p_to timestamptz)
returns table (upserted integer, points integer, next_scan_from timestamptz, last_fix timestamptz)
language plpgsql volatile set search_path = public, app as $$
declare
  s public.gps_stop_hotspot_settings%rowtype;
  v_vehicle uuid; v_up integer := 0; v_points integer := 0; v_last timestamptz; v_open_start timestamptz; v_ctx interval;
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
  select count(*), max(h.fix_time) into v_points, v_last from public.gps_device_position_history h
   where h.device_id = p_device_id and h.fix_time >= p_from and h.fix_time <= p_to;
  -- توقف مفتوح: آخر مجموعة تنتهي عند آخر نقطة ⇒ المسح القادم يبدأ من أول نقطة فيها
  select t.first_fix into v_open_start from tmp_gps_stop_groups2 t where t.last_fix_at = v_last order by t.first_fix desc limit 1;
  -- استبدال الأحداث الملامسة للنافذة (لا تراكم)
  delete from public.gps_stop_events e where e.device_id = p_device_id and e.ended_at >= p_from;
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

-- ───────────── طابور السحب ثنائي الاتجاه ─────────────
-- للأمام أولاً (من آخر نقطة مسحوبة حتى الآن) ثم للخلف (قبل أول نقطة مسحوبة حتى أرضية الاحتفاظ)؛ نافذة ≤ 6 ساعات
drop function if exists public.gps_stop_pull_queue(integer);
create or replace function public.gps_stop_pull_queue(p_limit integer default 2)
returns table (device_id uuid, external_id text, device_name text, pull_from timestamptz, pull_to timestamptz, pulled_until timestamptz, direction text)
language plpgsql stable security definer set search_path = public, app as $$
declare s public.gps_stop_hotspot_settings%rowtype; v_floor timestamptz; v_edge timestamptz := now() - interval '2 minutes';
begin
  if auth.role() <> 'service_role' then raise exception 'GPS_SERVICE_ROLE_REQUIRED'; end if;
  select * into s from public.gps_stop_hotspot_settings where id = 1;
  if not s.enabled then return; end if;
  v_floor := now() - make_interval(days => s.max_days);
  return query
  with cand as (
    -- للأمام: جهاز لم يُسحب بعد يبدأ بآخر 6 ساعات؛ أو جهاز متأخر ≥ 10 دقائق
    select g.id, g.external_id, g.name, st.lvn_pulled_until,
           case when st.lvn_pulled_until is null then greatest(v_edge - interval '6 hours', v_floor) else st.lvn_pulled_until end f,
           least(v_edge, case when st.lvn_pulled_until is null then v_edge else st.lvn_pulled_until + interval '6 hours' end) t,
           'forward'::text dir, 0 pri
    from public.gps_devices g left join public.gps_stop_scan_state st on st.device_id = g.id
    where g.is_active and (st.lvn_pulled_until is null or st.lvn_pulled_until <= v_edge - interval '10 minutes')
    union all
    -- للخلف: ما قبل أول نقطة مسحوبة حتى الأرضية
    select g.id, g.external_id, g.name, st.lvn_pulled_until,
           greatest(st.lvn_pulled_from - interval '6 hours', v_floor) f, st.lvn_pulled_from t, 'backward'::text dir, 1 pri
    from public.gps_devices g join public.gps_stop_scan_state st on st.device_id = g.id
    where g.is_active and st.lvn_pulled_from is not null and st.lvn_pulled_from > v_floor + interval '10 minutes'
  )
  select c.id, c.external_id, c.name, c.f, c.t, c.lvn_pulled_until, c.dir
  from cand c where c.t - c.f >= interval '10 minutes'
  order by c.pri, c.lvn_pulled_until nulls first, c.name
  limit least(greatest(coalesce(p_limit, 2), 1), 20);
end $$;
revoke all on function public.gps_stop_pull_queue(integer) from public, anon, authenticated;
grant execute on function public.gps_stop_pull_queue(integer) to service_role;

drop function if exists public.gps_stop_pull_mark(uuid, timestamptz, integer, text);
create or replace function public.gps_stop_pull_mark(p_device_id uuid, p_from timestamptz, p_until timestamptz, p_points integer default 0, p_error text default null)
returns void language plpgsql volatile security definer set search_path = public, app as $$
begin
  if auth.role() <> 'service_role' then raise exception 'GPS_SERVICE_ROLE_REQUIRED'; end if;
  insert into public.gps_stop_scan_state (device_id, lvn_pulled_from, lvn_pulled_until, lvn_last_pull_at, lvn_last_error, lvn_points_total, last_scan_at)
  values (p_device_id, case when p_error is null then p_from end, case when p_error is null then p_until end, now(), p_error, greatest(coalesce(p_points, 0), 0), now())
  on conflict (device_id) do update set
    lvn_pulled_from = case when p_error is null then least(coalesce(gps_stop_scan_state.lvn_pulled_from, p_from), p_from) else gps_stop_scan_state.lvn_pulled_from end,
    lvn_pulled_until = case when p_error is null then greatest(coalesce(gps_stop_scan_state.lvn_pulled_until, p_until), p_until) else gps_stop_scan_state.lvn_pulled_until end,
    lvn_last_pull_at = now(), lvn_last_error = p_error,
    lvn_points_total = gps_stop_scan_state.lvn_points_total + greatest(coalesce(p_points, 0), 0),
    -- نقاط جديدة قد تسبق العلامة المائية للمسح ⇒ يعاد المسح من بداية النافذة المسحوبة
    scan_from = case when p_error is null and coalesce(p_points, 0) > 0 then least(coalesce(gps_stop_scan_state.scan_from, p_from), p_from) else gps_stop_scan_state.scan_from end;
end $$;
revoke all on function public.gps_stop_pull_mark(uuid, timestamptz, timestamptz, integer, text) from public, anon, authenticated;
grant execute on function public.gps_stop_pull_mark(uuid, timestamptz, timestamptz, integer, text) to service_role;

-- حالة السحب: + تغطية للخلف
create or replace function public.gps_stop_pull_status()
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare s public.gps_stop_hotspot_settings%rowtype; v_floor timestamptz; j jsonb;
begin
  if auth.uid() is null or not app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into s from public.gps_stop_hotspot_settings where id = 1;
  v_floor := now() - make_interval(days => s.max_days);
  select jsonb_build_object(
    'devices', count(*),
    'caught_up', count(*) filter (where st.lvn_pulled_until >= now() - interval '30 minutes'),
    'never_pulled', count(*) filter (where st.lvn_pulled_until is null),
    'full_depth', count(*) filter (where st.lvn_pulled_from <= v_floor + interval '10 minutes'),
    'errors', count(*) filter (where st.lvn_last_error is not null),
    'oldest_pulled_until', min(coalesce(st.lvn_pulled_until, v_floor)),
    'last_pull_at', max(st.lvn_last_pull_at),
    'points_total', coalesce(sum(st.lvn_points_total), 0),
    'last_error', (select x.lvn_last_error from public.gps_stop_scan_state x where x.lvn_last_error is not null order by x.lvn_last_pull_at desc nulls last limit 1),
    'pending_hours', coalesce(round((
        sum(greatest(extract(epoch from now() - coalesce(st.lvn_pulled_until, now())), 0))
      + sum(greatest(extract(epoch from coalesce(st.lvn_pulled_from, now()) - v_floor), 0))) / 3600.0, 1), 0),
    'covered_hours', coalesce(round(sum(greatest(extract(epoch from coalesce(st.lvn_pulled_until, v_floor) - coalesce(st.lvn_pulled_from, v_floor)), 0)) / 3600.0, 1), 0))
  into j
  from public.gps_devices g left join public.gps_stop_scan_state st on st.device_id = g.id where g.is_active;
  return j;
end $$;

-- ───────────── الإعدادات: + نمط العرض ─────────────
create or replace function public.gps_stop_hotspot_settings_save(p_patch jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, app as $$
declare s public.gps_stop_hotspot_settings%rowtype; v_zones uuid[]; v_landmarks uuid[];
begin
  if auth.uid() is null or not app.has_role(array['ops_room','it_admin','super_admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into s from public.gps_stop_hotspot_settings where id = 1 for update;
  if p_patch ? 'excluded_zone_ids' then
    select coalesce(array_agg(z.id), '{}') into v_zones from public.gps_geofences z
     where z.id in (select (jsonb_array_elements_text(p_patch->'excluded_zone_ids'))::uuid);
  else v_zones := s.excluded_zone_ids; end if;
  if p_patch ? 'excluded_landmark_ids' then
    select coalesce(array_agg(l.id), '{}') into v_landmarks from public.gps_map_landmarks l
     where l.id in (select (jsonb_array_elements_text(p_patch->'excluded_landmark_ids'))::uuid);
  else v_landmarks := s.excluded_landmark_ids; end if;
  update public.gps_stop_hotspot_settings set
    enabled = coalesce((p_patch->>'enabled')::boolean, enabled),
    max_days = coalesce((p_patch->>'max_days')::integer, max_days),
    stop_speed_kmh = coalesce((p_patch->>'stop_speed_kmh')::numeric, stop_speed_kmh),
    stop_min_seconds = coalesce((p_patch->>'stop_min_seconds')::integer, stop_min_seconds),
    gap_split_seconds = coalesce((p_patch->>'gap_split_seconds')::integer, gap_split_seconds),
    cluster_radius_m = coalesce((p_patch->>'cluster_radius_m')::integer, cluster_radius_m),
    refresh_minutes = coalesce((p_patch->>'refresh_minutes')::integer, refresh_minutes),
    landmark_exclude_radius_m = coalesce((p_patch->>'landmark_exclude_radius_m')::integer, landmark_exclude_radius_m),
    excluded_zone_ids = v_zones, excluded_landmark_ids = v_landmarks,
    map_style = coalesce(nullif(p_patch->>'map_style', ''), map_style),
    heat_intensity = coalesce((p_patch->>'heat_intensity')::numeric, heat_intensity),
    heat_size = coalesce((p_patch->>'heat_size')::numeric, heat_size),
    needs_reeval = true, updated_by = auth.uid(), updated_at = now()
  where id = 1;
  -- الحذف فوري وخفيف؛ إعادة تقييم الاستبعاد في التحديث القادم (cron / الحافة / زر الآن)
  delete from public.gps_stop_events where ended_at < now() - make_interval(days => (select max_days from public.gps_stop_hotspot_settings where id = 1));
  insert into public.audit_logs (table_name, record_id, operation, old_row, new_row, changed_fields, actor_id)
  values ('gps_stop_hotspot_settings', '1', 'UPDATE', to_jsonb(s) - 'updated_by',
          (select to_jsonb(x) - 'updated_by' from public.gps_stop_hotspot_settings x where x.id = 1), p_patch, auth.uid());
  return public.gps_stop_hotspot_settings_get();
end $$;


-- ───────────── القراءة: مهلة 25 ث + نمط العرض في meta ─────────────
create or replace function public.gps_stop_hotspots(p_hours integer default 24)
returns jsonb language plpgsql stable security definer set search_path = public, app set statement_timeout = '25s' as $$
declare
  s public.gps_stop_hotspot_settings%rowtype; v_hours integer; v_from timestamptz; v_cell_lat float8; v_cell_lng float8;
  v_spots jsonb; v_total jsonb; v_meta jsonb;
begin
  if auth.uid() is null or not app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into s from public.gps_stop_hotspot_settings where id = 1;
  v_hours := least(greatest(coalesce(p_hours, 24), 1), s.max_days * 24);
  v_from := now() - make_interval(hours => v_hours);
  v_cell_lat := s.cluster_radius_m / 111320.0;
  v_cell_lng := s.cluster_radius_m / (111320.0 * cos(radians(33.3)));
  with e0 as (
    select e.id, e.device_id, e.garage_vehicle_id, e.started_at, e.ended_at, e.duration_seconds, e.latitude, e.longitude, e.address,
           floor(e.latitude / v_cell_lat)::bigint cy0, floor(e.longitude / v_cell_lng)::bigint cx0
    from public.gps_stop_events e where not e.excluded and e.ended_at >= v_from
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
      'stops', count(*), 'total_seconds', coalesce(sum(duration_seconds), 0), 'vehicles', count(distinct device_id),
      'excluded', (select count(*) from public.gps_stop_events x where x.excluded and x.ended_at >= v_from))
  into v_total from public.gps_stop_events e where not e.excluded and e.ended_at >= v_from;
  v_meta := jsonb_build_object('hours', v_hours, 'max_days', s.max_days, 'enabled', s.enabled, 'cluster_radius_m', s.cluster_radius_m,
    'last_refresh_at', s.last_refresh_at, 'refresh_minutes', s.refresh_minutes, 'generated_at', now(), 'needs_reeval', s.needs_reeval,
    'map_style', s.map_style, 'heat_intensity', s.heat_intensity, 'heat_size', s.heat_size,
    'excluded_zone_ids', to_jsonb(s.excluded_zone_ids), 'excluded_landmark_ids', to_jsonb(s.excluded_landmark_ids));
  return jsonb_build_object('spots', v_spots, 'totals', v_total, 'meta', v_meta);
end $$;

