-- 00374 — بقع التوقف: التكرار (⭐/⭐⭐/⭐⭐⭐) + تعدّد أنواع الآليات + ترتيب «تحتاج دعماً»
--  • recurrence_tier: 1 = نفس الآلية ≥3 توقفات، 2 = ≥5 توقفات، 3 = توقفت في ≥3 أيام مختلفة (عادة يومية)؛ recurring_vehicles، top_recurring.
--  • type_count/types: الأنواع المختلفة (فئات الكراج) للآليات المربوطة التي توقفت في البقعة؛ unbound_vehicles للأجهزة غير المربوطة.
--  • support_rank/support_score: زمن التوقف (لوغاريتمي) × (1 + 0.5×(الأنواع−1)) × (1 + 0.25×(الآليات−1، حتى 8)) × (1 + 0.5×(الأيام−1)).
--  • totals: multi_type_spots، recurring_spots.

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
           count(distinct (started_at at time zone 'Asia/Baghdad')::date) days_active,
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
  ), pv as (   -- 00374: لكل بقعة × آلية: عدد التوقفات والأيام المختلفة والزمن + نوع الآلية
    select e.cy, e.cx, e.device_id, e.garage_vehicle_id, v.db_number, coalesce(v.vehicle_name, g.name) vehicle_name,
           v.vehicle_category cat, vc.label cat_label,
           count(*) stops, count(distinct (e.started_at at time zone 'Asia/Baghdad')::date) days, sum(e.duration_seconds) secs
    from e join public.gps_devices g on g.id = e.device_id
    left join public.garage_vehicles v on v.id = e.garage_vehicle_id
    left join public.vehicle_categories vc on vc.code = v.vehicle_category
    group by e.cy, e.cx, e.device_id, e.garage_vehicle_id, v.db_number, v.vehicle_name, g.name, v.vehicle_category, vc.label
  ), rec as (   -- التكرار: ⭐ نفس الآلية ≥3 مرات · ⭐⭐ ≥5 مرات · ⭐⭐⭐ في ≥3 أيام مختلفة (عادة يومية)
    select cy, cx,
           max(case when days >= 3 then 3 when stops >= 5 then 2 when stops >= 3 then 1 else 0 end) tier,
           count(*) filter (where stops >= 3 or days >= 3) recurring_vehicles,
           (array_agg(jsonb_build_object('vehicle_id', garage_vehicle_id, 'db_number', db_number, 'vehicle_name', vehicle_name, 'stops', stops, 'days', days, 'total_seconds', secs)
                      order by days desc, stops desc, secs desc))[1] top_recurring
    from pv group by cy, cx
  ), ty as (   -- تعدّد الأنواع: الأنواع المختلفة للآليات المربوطة التي توقفت هنا
    select cy, cx, count(distinct cat) filter (where cat is not null) type_count,
           count(*) filter (where cat is null) unbound_vehicles,
           coalesce(jsonb_agg(jsonb_build_object('code', cat, 'label', coalesce(cat_label, cat), 'vehicles', vcount, 'stops', vstops, 'total_seconds', vsecs) order by vsecs desc) filter (where cat is not null), '[]'::jsonb) types
    from (select cy, cx, cat, cat_label, count(*) vcount, sum(stops) vstops, sum(secs) vsecs from pv group by cy, cx, cat, cat_label) t
    group by cy, cx
  ), scored as (
    select c.*, r.tier, r.recurring_vehicles, r.top_recurring, t.type_count, t.unbound_vehicles, t.types,
           -- «تحتاج دعماً»: زمن التوقف (لوغاريتمي) × تنوّع الأنواع × عدد الآليات × الأيام المتكررة
           ln(1 + c.total_seconds / 60.0)
             * (1 + 0.5 * greatest(coalesce(t.type_count, 0) - 1, 0))
             * (1 + 0.25 * least(greatest(c.vehicles - 1, 0), 8))
             * (1 + 0.5 * greatest(c.days_active - 1, 0)) support_raw
    from c left join rec r on r.cy = c.cy and r.cx = c.cx left join ty t on t.cy = c.cy and t.cx = c.cx
  ), ranked as (
    select c.*, row_number() over (order by total_seconds desc, stops desc) rnk,
           percent_rank() over (order by total_seconds) pr,
           row_number() over (order by support_raw desc, total_seconds desc) support_rank,
           max(support_raw) over () top_support,
           max(total_seconds) over () top_seconds, count(*) over () n, sum(total_seconds) over () all_seconds
    from scored c
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
      -- 00374: التكرار وتعدّد الأنواع و«تحتاج دعماً»
      'days_active', r.days_active, 'recurrence_tier', coalesce(r.tier, 0), 'recurring_vehicles', coalesce(r.recurring_vehicles, 0), 'top_recurring', r.top_recurring,
      'type_count', coalesce(r.type_count, 0), 'unbound_vehicles', coalesce(r.unbound_vehicles, 0), 'types', coalesce(r.types, '[]'::jsonb),
      'support_rank', r.support_rank, 'support_score', round((r.support_raw / greatest(r.top_support, 0.0001))::numeric, 3),
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
  v_total := v_total || jsonb_build_object(
    'multi_type_spots', (select count(*) from jsonb_array_elements(v_spots) x where (x ->> 'type_count')::int >= 2),
    'recurring_spots', (select count(*) from jsonb_array_elements(v_spots) x where (x ->> 'recurrence_tier')::int >= 1));
  v_meta := jsonb_build_object('hours', case when v_minutes % 60 = 0 then to_jsonb(v_minutes / 60) else to_jsonb(round(v_minutes / 60.0, 4)) end, 'minutes', v_minutes, 'max_days', s.max_days, 'enabled', s.enabled, 'cluster_radius_m', s.cluster_radius_m,
    'last_refresh_at', s.last_refresh_at, 'refresh_minutes', s.refresh_minutes, 'generated_at', now(), 'needs_reeval', s.needs_reeval,
    'map_style', s.map_style, 'heat_intensity', s.heat_intensity, 'heat_size', s.heat_size,
    'excluded_zone_ids', to_jsonb(s.excluded_zone_ids), 'excluded_landmark_ids', to_jsonb(s.excluded_landmark_ids));
  return jsonb_build_object('spots', v_spots, 'totals', v_total, 'meta', v_meta);
end $$;
