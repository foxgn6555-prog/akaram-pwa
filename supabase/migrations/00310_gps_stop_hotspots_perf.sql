-- 00365 — بقع التوقف: أداء وتصنيف
-- (1) لا عمل ثقيل داخل طلبات المستخدم: حفظ الإعدادات لا يعيد الحساب تزامنياً (يرفع علماً) ولا تحديث كسول داخل القراءة؛
--     التحديث يجري في cron/الحافة/زر «الآن» بمهلة تنفيذ مرفوعة.
-- (2) استعلام البقع بلا استعلامات مترابطة (كان O(بقع × أحداث) ⇒ statement timeout): تجميع واحد + دمج الجيران بمفاتيح مُفكَّكة.
-- (3) تصنيف نسبي بالمئين بدل نسبة القمة (بقعة ضخمة واحدة كانت تجعل الباقي أخضر): كثيفة = أعلى 10٪، متوسطة = 60–90٪، خفيفة = الباقي؛
--     + مئين متصل للتدرج اللوني، وحجم لوغاريتمي، وتوزيع ساعي (24 خانة) لكل بقعة.

alter table public.gps_stop_hotspot_settings add column if not exists needs_reeval boolean not null default false;

-- ── التحديث: إعادة تقييم الاستبعاد فقط عند تغيّر الإعدادات؛ مهلة تنفيذ خاصة
create or replace function app.gps_stop_hotspots_refresh(p_budget_ms integer default 120000)
returns table (devices integer, upserted integer, purged integer, took_ms integer, caught_up boolean)
language plpgsql volatile security definer set search_path = public, app set statement_timeout = '170s' as $$
declare
  s public.gps_stop_hotspot_settings%rowtype; d record; r record; t0 timestamptz := clock_timestamp();
  v_devices integer := 0; v_up integer := 0; v_purged integer := 0; v_floor timestamptz; v_from timestamptz; v_to timestamptz;
  v_done boolean := true;
begin
  select * into s from public.gps_stop_hotspot_settings where id = 1;
  if not s.enabled then return query select 0, 0, 0, 0, true; return; end if;
  v_floor := now() - make_interval(days => s.max_days);
  if s.needs_reeval then
    update public.gps_stop_events e set excluded = x.reason is not null, excluded_reason = x.reason
      from (select e2.id, app.gps_stop_is_excluded(e2.latitude, e2.longitude) reason from public.gps_stop_events e2 where e2.ended_at >= v_floor) x
      where x.id = e.id and (e.excluded <> (x.reason is not null) or e.excluded_reason is distinct from x.reason);
    update public.gps_stop_hotspot_settings set needs_reeval = false where id = 1;
  end if;
  for d in select g.id device_id, st.scan_from from public.gps_devices g
           left join public.gps_stop_scan_state st on st.device_id = g.id
           where g.is_active
           order by st.last_scan_at nulls first loop
    if extract(epoch from clock_timestamp() - t0) * 1000 > p_budget_ms then v_done := false; exit; end if;
    v_devices := v_devices + 1;
    v_from := greatest(coalesce(d.scan_from, v_floor), v_floor);
    v_to := least(now(), v_from + interval '24 hours');
    loop
      select * into r from app.gps_stop_scan_device(d.device_id, v_from, v_to);
      v_up := v_up + coalesce(r.upserted, 0);
      v_from := coalesce(r.next_scan_from, v_to);
      insert into public.gps_stop_scan_state (device_id, scan_from, last_fix_at, last_scan_at, last_points)
      values (d.device_id, v_from, r.last_fix, now(), coalesce(r.points, 0))
      on conflict (device_id) do update set scan_from = excluded.scan_from,
        last_fix_at = coalesce(excluded.last_fix_at, gps_stop_scan_state.last_fix_at), last_scan_at = now(), last_points = excluded.last_points;
      exit when v_to >= now();
      v_to := least(now(), v_to + interval '24 hours');
      if extract(epoch from clock_timestamp() - t0) * 1000 > p_budget_ms then v_done := false; exit; end if;
    end loop;
    exit when not v_done;
  end loop;
  delete from public.gps_stop_events where ended_at < v_floor;
  get diagnostics v_purged = row_count;
  update public.gps_stop_hotspot_settings set last_refresh_at = now(),
    last_refresh_ms = (extract(epoch from clock_timestamp() - t0) * 1000)::integer where id = 1;
  return query select v_devices, v_up, v_purged, (extract(epoch from clock_timestamp() - t0) * 1000)::integer, v_done;
end $$;

-- ── حفظ الإعدادات: خفيف — يرفع علم إعادة التقييم ويحذف ما تجاوز الحد فقط
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
    needs_reeval = true, updated_by = auth.uid(), updated_at = now()
  where id = 1;
  -- الحذف فوري وخفيف؛ إعادة تقييم الاستبعاد في التحديث القادم (cron / الحافة / زر الآن)
  delete from public.gps_stop_events where ended_at < now() - make_interval(days => (select max_days from public.gps_stop_hotspot_settings where id = 1));
  insert into public.audit_logs (table_name, record_id, operation, old_row, new_row, changed_fields, actor_id)
  values ('gps_stop_hotspot_settings', '1', 'UPDATE', to_jsonb(s) - 'updated_by',
          (select to_jsonb(x) - 'updated_by' from public.gps_stop_hotspot_settings x where x.id = 1), p_patch, auth.uid());
  return public.gps_stop_hotspot_settings_get();
end $$;

-- ── زر «الآن»: مهلة تنفيذ مرفوعة وميزانية 25 ث
create or replace function public.gps_stop_hotspots_refresh_now()
returns jsonb language plpgsql volatile security definer set search_path = public, app set statement_timeout = '60s' as $$
declare r record;
begin
  if auth.uid() is null or not app.has_role(array['ops_room','it_admin','super_admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not pg_try_advisory_xact_lock(hashtext('gps_stop_hotspots_refresh')) then
    return jsonb_build_object('ok', false, 'busy', true);
  end if;
  select * into r from app.gps_stop_hotspots_refresh(25000);
  return jsonb_build_object('ok', true, 'devices', r.devices, 'upserted', r.upserted, 'purged', r.purged, 'took_ms', r.took_ms, 'caught_up', r.caught_up);
end $$;

create or replace function public.gps_stop_hotspots_refresh_service(p_budget_ms integer default 15000)
returns jsonb language plpgsql volatile security definer set search_path = public, app set statement_timeout = '120s' as $$
declare r record;
begin
  if auth.role() <> 'service_role' then raise exception 'GPS_SERVICE_ROLE_REQUIRED'; end if;
  if not pg_try_advisory_xact_lock(hashtext('gps_stop_hotspots_refresh')) then return jsonb_build_object('ok', false, 'busy', true); end if;
  select * into r from app.gps_stop_hotspots_refresh(p_budget_ms);
  return jsonb_build_object('ok', true, 'devices', r.devices, 'upserted', r.upserted, 'purged', r.purged, 'took_ms', r.took_ms, 'caught_up', r.caught_up);
end $$;

-- ── طابور السحب من LVN: نوافذ 6 ساعات (حدود الحافة في CPU/الوقت)
create or replace function public.gps_stop_pull_queue(p_limit integer default 4)
returns table (device_id uuid, external_id text, device_name text, pull_from timestamptz, pull_to timestamptz, pulled_until timestamptz)
language plpgsql stable security definer set search_path = public, app as $$
declare s public.gps_stop_hotspot_settings%rowtype; v_floor timestamptz; v_edge timestamptz := now() - interval '2 minutes';
begin
  if auth.role() <> 'service_role' then raise exception 'GPS_SERVICE_ROLE_REQUIRED'; end if;
  select * into s from public.gps_stop_hotspot_settings where id = 1;
  if not s.enabled then return; end if;
  v_floor := now() - make_interval(days => s.max_days);
  return query
    select g.id, g.external_id, g.name,
           greatest(coalesce(st.lvn_pulled_until, v_floor), v_floor) pull_from,
           least(v_edge, greatest(coalesce(st.lvn_pulled_until, v_floor), v_floor) + interval '6 hours') pull_to,
           st.lvn_pulled_until
    from public.gps_devices g
    left join public.gps_stop_scan_state st on st.device_id = g.id
    where g.is_active
      and least(v_edge, greatest(coalesce(st.lvn_pulled_until, v_floor), v_floor) + interval '6 hours')
          - greatest(coalesce(st.lvn_pulled_until, v_floor), v_floor) >= interval '10 minutes'
    order by st.lvn_pulled_until nulls first, g.name
    limit least(greatest(coalesce(p_limit, 4), 1), 20);
end $$;

-- ── القراءة: سريعة، بلا تحديث كسول، تصنيف بالمئين، توزيع ساعي
create or replace function public.gps_stop_hotspots(p_hours integer default 24)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
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
    'excluded_zone_ids', to_jsonb(s.excluded_zone_ids), 'excluded_landmark_ids', to_jsonb(s.excluded_landmark_ids));
  return jsonb_build_object('spots', v_spots, 'totals', v_total, 'meta', v_meta);
end $$;

-- فهرس يخدم التجميع بالنافذة
create index if not exists gps_stop_events_active_window_idx on public.gps_stop_events (ended_at, device_id) include (duration_seconds, latitude, longitude) where not excluded;
