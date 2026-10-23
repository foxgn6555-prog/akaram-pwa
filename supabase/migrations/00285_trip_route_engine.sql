-- 00285 — مسارات الانطلاقيات (١ · 00342): محرّك المسار
-- المبدأ: لا يهمّنا «مسار الآلية» بل «مسار الانطلاقية». لكل انطلاقية (garage_departures) تُسحب نقاط LVN لفترتها بالضبط
-- (من المغادرة حتى العودة الفعلية، أو حتى الآن إن كانت مفتوحة) وتُخزَّن مرتبطة بالانطلاقية ومقطعها (vehicle_trip_legs)،
-- بعد تنظيف (قفزات مستحيلة، تكرار، اهتزاز)، مع كشف التوقفات وفجوات GPS ومقاييس لكل مقطع وللإجمالي.
-- الدالة الخادمية lvn-gps-sync (action trips/trip) تسحب وتستدعي trip_route_apply. العتبات من trip_route_settings (IT).

-- ─────────────── ① الإعدادات (IT) ───────────────
create table if not exists public.trip_route_settings (
  id                  smallint primary key default 1 check (id = 1),
  stop_speed_kmh      numeric(6,2) not null default 3   check (stop_speed_kmh between 0 and 30),      -- أقل من/يساوي ⇒ ساكن
  stop_min_seconds    int not null default 120           check (stop_min_seconds between 30 and 3600),  -- أقل مدة تُعدّ توقفاً
  gap_min_seconds     int not null default 300           check (gap_min_seconds between 60 and 7200),   -- انقطاع GPS
  max_speed_kmh       numeric(6,2) not null default 150  check (max_speed_kmh between 60 and 300),      -- فوقها = نقطة قفزة تُرفض
  jitter_meters       numeric(6,2) not null default 12   check (jitter_meters between 0 and 100),       -- حركة أقل من هذا أثناء السكون = اهتزاز
  live_pull_minutes   int not null default 15            check (live_pull_minutes between 2 and 120),   -- سحب جزئي أثناء الانطلاقية المفتوحة
  final_after_minutes int not null default 10            check (final_after_minutes between 0 and 180), -- بعد العودة بهذه المدة يُعتبر السحب نهائياً
  updated_by          uuid references auth.users(id) on delete set null,
  updated_at          timestamptz not null default now()
);
insert into public.trip_route_settings (id) values (1) on conflict (id) do nothing;
alter table public.trip_route_settings enable row level security;
drop policy if exists "trip_route_settings: read" on public.trip_route_settings;
create policy "trip_route_settings: read" on public.trip_route_settings for select to authenticated using (app.has_role(array['ops_room','it_admin','super_admin']));

create or replace function public.trip_route_settings_get() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
begin
  if auth.uid() is null or not app.has_role(array['ops_room','it_admin','super_admin']) then raise exception 'GPS_FORBIDDEN'; end if;
  return (select to_jsonb(s) - 'id' || jsonb_build_object('updated_by_name', app.user_display_name(s.updated_by)) from public.trip_route_settings s where s.id = 1);
end$$;
create or replace function public.trip_route_settings_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, app as $$
begin
  perform app.require_it();
  update public.trip_route_settings set
    stop_speed_kmh      = coalesce((p ->> 'stop_speed_kmh')::numeric, stop_speed_kmh),
    stop_min_seconds    = coalesce((p ->> 'stop_min_seconds')::int, stop_min_seconds),
    gap_min_seconds     = coalesce((p ->> 'gap_min_seconds')::int, gap_min_seconds),
    max_speed_kmh       = coalesce((p ->> 'max_speed_kmh')::numeric, max_speed_kmh),
    jitter_meters       = coalesce((p ->> 'jitter_meters')::numeric, jitter_meters),
    live_pull_minutes   = coalesce((p ->> 'live_pull_minutes')::int, live_pull_minutes),
    final_after_minutes = coalesce((p ->> 'final_after_minutes')::int, final_after_minutes),
    updated_by = auth.uid(), updated_at = now()
  where id = 1;
  return public.trip_route_settings_get();
exception when check_violation then raise exception 'TRIP_ROUTE_SETTINGS_INVALID';
end$$;

-- ─────────────── ② الجداول ───────────────
create table if not exists public.trip_routes (
  departure_id     uuid primary key references public.garage_departures(id) on delete cascade,
  device_id        uuid references public.gps_devices(id) on delete set null,
  status           text not null default 'pending' check (status in ('pending','no_device','partial','complete','empty','failed')),
  is_final         boolean not null default false,
  range_from       timestamptz,
  range_to         timestamptz,
  points_source    int not null default 0,
  points_kept      int not null default 0,
  points_rejected  int not null default 0,
  distance_m       numeric(12,1) not null default 0,
  moving_seconds   int not null default 0,
  stopped_seconds  int not null default 0,
  max_speed_kmh    numeric(6,1),
  avg_speed_kmh    numeric(6,1),
  stops_count      int not null default 0,
  gaps_count       int not null default 0,
  gap_seconds      int not null default 0,
  first_fix        timestamptz,
  last_fix         timestamptz,
  legs             jsonb not null default '[]'::jsonb,   -- مقاييس كل مقطع
  pulled_at        timestamptz,
  next_pull_at     timestamptz not null default now(),
  pull_count       int not null default 0,
  error_code       text,
  updated_at       timestamptz not null default now()
);
create index if not exists trip_routes_queue_idx on public.trip_routes (next_pull_at) where not is_final;

create table if not exists public.trip_route_points (
  id               bigint generated by default as identity primary key,
  departure_id     uuid not null references public.garage_departures(id) on delete cascade,
  leg_id           uuid references public.vehicle_trip_legs(id) on delete set null,
  seq              int not null,
  fix_time         timestamptz not null,
  latitude         double precision not null,
  longitude        double precision not null,
  speed_kmh        numeric(6,1),
  course           numeric(6,1),
  address          text,
  dist_m           numeric(10,1) not null default 0,     -- من النقطة السابقة
  seconds          int not null default 0,                -- من النقطة السابقة
  state            text not null default 'moving' check (state in ('moving','stopped','gap')),  -- gap = فجوة قبل هذه النقطة
  unique (departure_id, fix_time)
);
create index if not exists trip_route_points_dep_seq_idx on public.trip_route_points (departure_id, seq);

create table if not exists public.trip_route_stops (
  id               bigint generated by default as identity primary key,
  departure_id     uuid not null references public.garage_departures(id) on delete cascade,
  leg_id           uuid references public.vehicle_trip_legs(id) on delete set null,
  seq              int not null,
  started_at       timestamptz not null,
  ended_at         timestamptz not null,
  duration_seconds int not null,
  latitude         double precision not null,
  longitude        double precision not null,
  address          text,
  address_source   text check (address_source in ('lvn','osm','zone')),
  geofence_id      uuid references public.gps_geofences(id) on delete set null,
  geofence_name    text,
  unique (departure_id, seq)
);
create table if not exists public.trip_route_gaps (
  id               bigint generated by default as identity primary key,
  departure_id     uuid not null references public.garage_departures(id) on delete cascade,
  leg_id           uuid references public.vehicle_trip_legs(id) on delete set null,
  seq              int not null,
  started_at       timestamptz not null,
  ended_at         timestamptz not null,
  seconds          int not null,
  from_lat         double precision, from_lng double precision,
  to_lat           double precision, to_lng double precision,
  unique (departure_id, seq)
);
alter table public.trip_routes enable row level security;
alter table public.trip_route_points enable row level security;
alter table public.trip_route_stops enable row level security;
alter table public.trip_route_gaps enable row level security;
do $$ declare t text; begin
  foreach t in array array['trip_routes','trip_route_points','trip_route_stops','trip_route_gaps'] loop
    execute format('drop policy if exists "%1$s: ops read" on public.%1$s', t);
    execute format('create policy "%1$s: ops read" on public.%1$s for select to authenticated using (app.has_role(array[''ops_room'',''it_admin'',''super_admin'']))', t);
  end loop;
end $$;

-- ─────────────── ③ أدوات ───────────────
create or replace function app.trip_route_haversine_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8) returns float8
language sql immutable set search_path = pg_catalog as $$
  select 2 * 6371000.0 * asin(least(1.0, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))))
$$;

-- الجهاز المرتبط بآلية الانطلاقية
create or replace function app.trip_route_device(p_departure uuid) returns uuid
language sql stable security definer set search_path = public, app as $$
  select b.device_id from public.garage_departures d join public.gps_vehicle_bindings b on b.garage_vehicle_id = d.vehicle_id
  join public.gps_devices g on g.id = b.device_id where d.id = p_departure order by b.bound_at desc nulls last limit 1
$$;

-- ضمان صف trip_routes لكل انطلاقية (يُستدعى من المشغّل ومن الطابور)
create or replace function app.trip_route_ensure(p_departure uuid) returns public.trip_routes
language plpgsql security definer set search_path = public, app as $$
declare r public.trip_routes; dev uuid;
begin
  dev := app.trip_route_device(p_departure);
  insert into public.trip_routes (departure_id, device_id, status, next_pull_at)
  values (p_departure, dev, case when dev is null then 'no_device' else 'pending' end, now())
  on conflict (departure_id) do update set device_id = coalesce(excluded.device_id, trip_routes.device_id),
    status = case when trip_routes.status = 'no_device' and excluded.device_id is not null then 'pending' else trip_routes.status end,
    updated_at = now()
  returning * into r;
  return r;
end$$;

-- مشغّل: انطلاقية جديدة ⇒ صف بالطابور؛ عودة فعلية ⇒ سحب فوري (next_pull_at = الآن) وإعادة فتح «النهائي»
create or replace function app.trip_route_on_departure() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  perform app.trip_route_ensure(new.id);
  if tg_op = 'UPDATE' and new.returned_at is distinct from old.returned_at then
    update public.trip_routes set is_final = false, next_pull_at = now(), updated_at = now() where departure_id = new.id;
  end if;
  return new;
end$$;
drop trigger if exists trg_trip_route_on_departure on public.garage_departures;
create trigger trg_trip_route_on_departure after insert or update of returned_at on public.garage_departures
  for each row execute function app.trip_route_on_departure();

-- ─────────────── ④ الطابور (service_role) ───────────────
-- ما يجب سحبه الآن: مفتوحة (كل live_pull_minutes) أو عادت ولم يكتمل سحبها النهائي. يعيد الفترة الدقيقة لكل انطلاقية.
create or replace function public.trip_route_pull_queue(p_limit int default 5) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare s public.trip_route_settings;
begin
  if auth.role() <> 'service_role' then raise exception 'GPS_SERVICE_ROLE_REQUIRED'; end if;
  select * into s from public.trip_route_settings where id = 1;
  -- انطلاقيات بلا صف بعد (قديمة قبل هذه الجولة): آخر 7 أيام فقط
  insert into public.trip_routes (departure_id, device_id, status)
    select d.id, app.trip_route_device(d.id), case when app.trip_route_device(d.id) is null then 'no_device' else 'pending' end
    from public.garage_departures d where d.departed_at >= now() - interval '7 day' and not exists (select 1 from public.trip_routes r where r.departure_id = d.id)
  on conflict do nothing;
  -- إعادة فحص الأجهزة لمن كان بلا جهاز
  update public.trip_routes r set device_id = app.trip_route_device(r.departure_id), status = 'pending', updated_at = now()
    where r.status = 'no_device' and app.trip_route_device(r.departure_id) is not null;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'departure_id', r.departure_id, 'device_id', r.device_id, 'external_id', g.external_id,
      'range_from', d.departed_at, 'range_to', coalesce(d.returned_at, now()),
      'final', d.returned_at is not null and now() >= d.returned_at + make_interval(mins => s.final_after_minutes)) order by r.next_pull_at)
    from (select * from public.trip_routes q where not q.is_final and q.device_id is not null and q.next_pull_at <= now() order by q.next_pull_at limit greatest(1, least(coalesce(p_limit, 5), 50))) r
    join public.garage_departures d on d.id = r.departure_id
    join public.gps_devices g on g.id = r.device_id), '[]'::jsonb);
end$$;

-- ─────────────── ⑤ التطبيق: تنظيف + مقاطع + توقفات + فجوات + مقاييس (service_role) ───────────────
create or replace function public.trip_route_apply(p_departure uuid, p_points jsonb, p_source_points int, p_range_from timestamptz, p_range_to timestamptz, p_final boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare s public.trip_route_settings; d public.garage_departures; r public.trip_routes;
  pt record; prev record; keep_lat float8; keep_lng float8; keep_t timestamptz; keep_speed numeric;
  dist float8; secs float8; implied numeric; seq int := 0; rejected int := 0;
  st_start timestamptz; st_lat float8; st_lng float8; st_n int := 0; st_sum_lat float8 := 0; st_sum_lng float8 := 0; st_addr text; stop_seq int := 0; gap_seq int := 0;
  legs_json jsonb; tot_dist numeric := 0; tot_move int := 0; tot_stop int := 0; mx numeric := 0; first_t timestamptz; last_t timestamptz;
begin
  if auth.role() <> 'service_role' then raise exception 'GPS_SERVICE_ROLE_REQUIRED'; end if;
  select * into d from public.garage_departures where id = p_departure;
  if d.id is null then raise exception 'TRIP_ROUTE_DEPARTURE_NOT_FOUND'; end if;
  if jsonb_typeof(p_points) <> 'array' then raise exception 'GPS_HISTORY_POINTS_INVALID'; end if;
  if p_range_from is null or p_range_to is null or p_range_to <= p_range_from then raise exception 'TRIP_ROUTE_RANGE_INVALID'; end if;
  select * into s from public.trip_route_settings where id = 1;
  r := app.trip_route_ensure(p_departure);

  -- إعادة بناء كاملة لهذه الانطلاقية (السحب دائماً للفترة كلها ⇒ لا تراكم)
  delete from public.trip_route_points where departure_id = p_departure;
  delete from public.trip_route_stops  where departure_id = p_departure;
  delete from public.trip_route_gaps   where departure_id = p_departure;

  drop table if exists _raw; create temp table _raw on commit drop as
    select distinct on (fix_time) fix_time, lat, lng, speed, course, address from (
      select nullif(x ->> 'fix_time', '')::timestamptz fix_time,
             app.lvn_num(coalesce(x ->> 'latitude', x ->> 'lat')) lat, app.lvn_num(coalesce(x ->> 'longitude', x ->> 'lng')) lng,
             app.lvn_num(x ->> 'speed') speed, app.lvn_num(x ->> 'course') course, nullif(x ->> 'address', '') address
      from jsonb_array_elements(p_points) x) q
    where fix_time is not null and fix_time >= p_range_from and fix_time <= p_range_to
      and lat between -90 and 90 and lng between -180 and 180 and not (lat = 0 and lng = 0)
    order by fix_time;

  -- تنظيف تسلسلي: رفض القفزة المستحيلة (سرعة ضمنية > الحد) نسبةً لآخر نقطة مقبولة
  for pt in select * from _raw order by fix_time loop
    if keep_t is not null then
      dist := app.trip_route_haversine_m(keep_lat, keep_lng, pt.lat, pt.lng);
      secs := extract(epoch from (pt.fix_time - keep_t));
      implied := case when secs > 0 then (dist / secs) * 3.6 else 0 end;
      if implied > s.max_speed_kmh then rejected := rejected + 1; continue; end if;
      -- اهتزاز أثناء السكون: نبقي النقطة لكن نثبّت موقعها على موقع السكون
      if dist < s.jitter_meters and coalesce(pt.speed, implied) <= s.stop_speed_kmh then pt.lat := keep_lat; pt.lng := keep_lng; dist := 0; end if;
    else
      dist := 0; secs := 0; implied := 0;
    end if;
    seq := seq + 1;
    insert into public.trip_route_points (departure_id, seq, fix_time, latitude, longitude, speed_kmh, course, address, dist_m, seconds, state)
    values (p_departure, seq, pt.fix_time, pt.lat, pt.lng, round(coalesce(pt.speed, implied)::numeric, 1), round(pt.course::numeric, 1), pt.address,
            round(dist::numeric, 1), round(secs)::int,
            case when keep_t is not null and secs >= s.gap_min_seconds then 'gap'
                 when coalesce(pt.speed, implied) <= s.stop_speed_kmh then 'stopped' else 'moving' end);
    keep_lat := pt.lat; keep_lng := pt.lng; keep_t := pt.fix_time; keep_speed := pt.speed;
  end loop;

  -- ربط كل نقطة بمقطعها: المقطع الذي تقع النقطة بين انطلاقه و(وصوله أو انطلاق المقطع التالي أو نهاية الفترة)
  update public.trip_route_points p set leg_id = l.id
  from (select l1.id, l1.departed_at, coalesce(l1.arrived_at, lead(l1.departed_at) over (order by l1.sequence_no), p_range_to) ends_at
        from public.vehicle_trip_legs l1 where l1.departure_id = p_departure) l
  where p.departure_id = p_departure and p.fix_time >= l.departed_at and p.fix_time < l.ends_at + interval '1 second';

  -- الفجوات
  insert into public.trip_route_gaps (departure_id, leg_id, seq, started_at, ended_at, seconds, from_lat, from_lng, to_lat, to_lng)
  select p_departure, p.leg_id, row_number() over (order by p.fix_time), q.fix_time, p.fix_time, p.seconds, q.latitude, q.longitude, p.latitude, p.longitude
  from public.trip_route_points p join public.trip_route_points q on q.departure_id = p.departure_id and q.seq = p.seq - 1
  where p.departure_id = p_departure and p.state = 'gap';

  -- التوقفات: سلاسل متتالية من نقاط ساكنة (بلا فجوة داخلها) مدتها ≥ الحد
  for pt in select * from public.trip_route_points where departure_id = p_departure order by seq loop
    if pt.state = 'stopped' then
      if st_start is null then st_start := pt.fix_time; st_n := 0; st_sum_lat := 0; st_sum_lng := 0; st_addr := null; end if;
      st_n := st_n + 1; st_sum_lat := st_sum_lat + pt.latitude; st_sum_lng := st_sum_lng + pt.longitude; st_addr := coalesce(st_addr, pt.address);
      prev := pt;
    end if;
    if (pt.state <> 'stopped') and st_start is not null then
      -- أُغلقت السلسلة عند نقطة متحركة/فجوة: مدة التوقف حتى هذه النقطة إن لم تكن فجوة
      if extract(epoch from ((case when pt.state = 'gap' then prev.fix_time else pt.fix_time end) - st_start)) >= s.stop_min_seconds then
        stop_seq := stop_seq + 1;
        insert into public.trip_route_stops (departure_id, leg_id, seq, started_at, ended_at, duration_seconds, latitude, longitude, address, address_source)
        values (p_departure, prev.leg_id, stop_seq, st_start, case when pt.state = 'gap' then prev.fix_time else pt.fix_time end,
                extract(epoch from ((case when pt.state = 'gap' then prev.fix_time else pt.fix_time end) - st_start))::int,
                st_sum_lat / st_n, st_sum_lng / st_n, st_addr, case when st_addr is not null then 'lvn' end);
      end if;
      st_start := null;
    end if;
  end loop;
  if st_start is not null and prev.fix_time is not null and extract(epoch from (prev.fix_time - st_start)) >= s.stop_min_seconds then
    stop_seq := stop_seq + 1;
    insert into public.trip_route_stops (departure_id, leg_id, seq, started_at, ended_at, duration_seconds, latitude, longitude, address, address_source)
    values (p_departure, prev.leg_id, stop_seq, st_start, prev.fix_time, extract(epoch from (prev.fix_time - st_start))::int, st_sum_lat / st_n, st_sum_lng / st_n, st_addr, case when st_addr is not null then 'lvn' end);
  end if;
  -- اسم الزون للتوقف (إن وقع داخل زون نشط) — يُستخدم كعنوان احتياطي
  update public.trip_route_stops t set geofence_id = g.id, geofence_name = g.name,
    address = coalesce(t.address, g.name), address_source = coalesce(t.address_source, 'zone')
  from public.gps_geofences g where t.departure_id = p_departure and g.is_active and app.gps_point_in_polygon(t.latitude, t.longitude, g.polygon)
    and t.geofence_id is null;

  -- المقاييس: الإجمالي
  -- زمن الفاصل بين نقطتين يُنسب إلى حالة النقطة السابقة (ساكنة ⇒ زمن توقف، متحركة ⇒ زمن حركة)؛ الفجوات لا تُحسب في أيٍّ منهما
  drop table if exists _pts; create temp table _pts on commit drop as
    select p.*, lag(p.state) over (order by p.seq) prev_state from public.trip_route_points p where p.departure_id = p_departure;
  select coalesce(sum(dist_m), 0),
         coalesce(sum(seconds) filter (where state <> 'gap' and prev_state is not null and prev_state <> 'stopped'), 0),
         coalesce(sum(seconds) filter (where state <> 'gap' and prev_state = 'stopped'), 0),
         coalesce(max(speed_kmh), 0), min(fix_time), max(fix_time)
    into tot_dist, tot_move, tot_stop, mx, first_t, last_t
    from _pts;
  -- المقاييس: لكل مقطع (بترتيب المقاطع؛ النقاط خارج أي مقطع تُجمع تحت leg_id = null)
  select coalesce(jsonb_agg(jsonb_build_object(
      'leg_id', l.id, 'sequence_no', l.sequence_no, 'origin_type', l.origin_type, 'destination_type', l.destination_type,
      'departed_at', l.departed_at, 'arrived_at', l.arrived_at,
      'points', coalesce(m.points, 0), 'distance_m', coalesce(m.distance_m, 0), 'moving_seconds', coalesce(m.moving_seconds, 0),
      'stopped_seconds', coalesce(m.stopped_seconds, 0), 'max_speed_kmh', m.max_speed_kmh,
      'avg_speed_kmh', case when coalesce(m.moving_seconds, 0) > 0 then round((m.distance_m / m.moving_seconds * 3.6)::numeric, 1) end,
      'stops_count', (select count(*) from public.trip_route_stops st where st.departure_id = p_departure and st.leg_id = l.id),
      'gaps_count', (select count(*) from public.trip_route_gaps gp where gp.departure_id = p_departure and gp.leg_id = l.id),
      'first_fix', m.first_fix, 'last_fix', m.last_fix) order by l.sequence_no), '[]'::jsonb)
    into legs_json
    from public.vehicle_trip_legs l
    left join (select leg_id, count(*) points, sum(dist_m) distance_m,
                      sum(seconds) filter (where state <> 'gap' and prev_state is not null and prev_state <> 'stopped') moving_seconds,
                      sum(seconds) filter (where state <> 'gap' and prev_state = 'stopped') stopped_seconds, max(speed_kmh) max_speed_kmh, min(fix_time) first_fix, max(fix_time) last_fix
               from _pts group by leg_id) m on m.leg_id = l.id
    where l.departure_id = p_departure;

  update public.trip_routes set
    range_from = p_range_from, range_to = p_range_to, is_final = coalesce(p_final, false),
    points_source = greatest(coalesce(p_source_points, 0), 0), points_kept = seq, points_rejected = rejected + greatest(coalesce(p_source_points, 0) - (select count(*) from _raw)::int, 0),
    distance_m = round(tot_dist, 1), moving_seconds = tot_move, stopped_seconds = tot_stop,
    max_speed_kmh = nullif(mx, 0), avg_speed_kmh = case when tot_move > 0 then round((tot_dist / tot_move * 3.6)::numeric, 1) end,
    stops_count = stop_seq, gaps_count = (select count(*) from public.trip_route_gaps where departure_id = p_departure),
    gap_seconds = (select coalesce(sum(seconds), 0) from public.trip_route_gaps where departure_id = p_departure),
    first_fix = first_t, last_fix = last_t, legs = legs_json,
    status = case when seq = 0 then 'empty' when coalesce(p_final, false) then 'complete' else 'partial' end,
    pulled_at = now(), pull_count = pull_count + 1, error_code = null,
    next_pull_at = case when coalesce(p_final, false) then 'infinity'::timestamptz else now() + make_interval(mins => s.live_pull_minutes) end,
    updated_at = now()
  where departure_id = p_departure returning * into r;
  return public.trip_route_get(p_departure, 0);
end$$;

-- تسجيل فشل سحب (service_role): يؤجَّل ولا يُعاد فوراً
create or replace function public.trip_route_mark_failed(p_departure uuid, p_error text) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if auth.role() <> 'service_role' then raise exception 'GPS_SERVICE_ROLE_REQUIRED'; end if;
  perform app.trip_route_ensure(p_departure);
  update public.trip_routes set status = case when points_kept > 0 then status else 'failed' end, error_code = left(coalesce(p_error, 'UNKNOWN'), 120),
    next_pull_at = now() + interval '10 minute', updated_at = now() where departure_id = p_departure;
end$$;

-- عنوان توقف من التحويل العكسي (service_role) — تُستدعى من الدالة الخادمية لمن بلا عنوان
create or replace function public.trip_route_stops_without_address(p_limit int default 10) returns jsonb
language plpgsql security definer set search_path = public, app as $$
begin
  if auth.role() <> 'service_role' then raise exception 'GPS_SERVICE_ROLE_REQUIRED'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'latitude', s.latitude, 'longitude', s.longitude) order by s.started_at desc)
    from (select * from public.trip_route_stops where address is null order by started_at desc limit greatest(1, least(coalesce(p_limit, 10), 50))) s), '[]'::jsonb);
end$$;
create or replace function public.trip_route_stop_address_set(p_stop bigint, p_address text) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if auth.role() <> 'service_role' then raise exception 'GPS_SERVICE_ROLE_REQUIRED'; end if;
  update public.trip_route_stops set address = nullif(left(trim(p_address), 240), ''), address_source = case when nullif(trim(p_address), '') is null then address_source else 'osm' end where id = p_stop;
end$$;

-- ─────────────── ⑥ القراءة (غرفة العمليات / IT) ───────────────
-- p_max_points: 0 = بلا نقاط؛ >0 = تخفيف منتظم مع الإبقاء على نقاط التوقف/الفجوات وأول/آخر نقطة
create or replace function public.trip_route_get(p_departure uuid, p_max_points int default 3000) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare r public.trip_routes; total int; step int; pts jsonb;
begin
  if auth.uid() is null or not app.has_role(array['ops_room','it_admin','super_admin']) then
    if auth.role() <> 'service_role' then raise exception 'GPS_FORBIDDEN'; end if;
  end if;
  select * into r from public.trip_routes where departure_id = p_departure;
  if r.departure_id is null then
    if not exists (select 1 from public.garage_departures where id = p_departure) then raise exception 'TRIP_ROUTE_DEPARTURE_NOT_FOUND'; end if;
    return jsonb_build_object('departure_id', p_departure, 'status', 'pending', 'points', '[]'::jsonb, 'stops', '[]'::jsonb, 'gaps', '[]'::jsonb, 'legs', '[]'::jsonb);
  end if;
  total := r.points_kept;
  step := case when coalesce(p_max_points, 0) <= 0 then 0 when total <= p_max_points then 1 else ceil(total::numeric / p_max_points)::int end;
  if step = 0 then pts := '[]'::jsonb;
  else
    select coalesce(jsonb_agg(jsonb_build_object('seq', p.seq, 't', p.fix_time, 'lat', p.latitude, 'lng', p.longitude, 'speed', p.speed_kmh, 'course', p.course,
                                                 'state', p.state, 'leg_id', p.leg_id, 'address', p.address, 'dist_m', p.dist_m, 'seconds', p.seconds) order by p.seq), '[]'::jsonb)
      into pts from public.trip_route_points p
      where p.departure_id = p_departure and (step = 1 or p.seq % step = 0 or p.seq = 1 or p.seq = total or p.state <> 'moving'
             or exists (select 1 from public.trip_route_points n where n.departure_id = p_departure and n.seq = p.seq + 1 and n.state = 'gap'));
  end if;
  return jsonb_build_object(
    'departure_id', r.departure_id, 'device_id', r.device_id, 'status', r.status, 'is_final', r.is_final,
    'range_from', r.range_from, 'range_to', r.range_to, 'points_source', r.points_source, 'points_kept', r.points_kept, 'points_rejected', r.points_rejected,
    'points_returned', jsonb_array_length(pts), 'downsample_step', step,
    'distance_m', r.distance_m, 'moving_seconds', r.moving_seconds, 'stopped_seconds', r.stopped_seconds,
    'max_speed_kmh', r.max_speed_kmh, 'avg_speed_kmh', r.avg_speed_kmh, 'stops_count', r.stops_count, 'gaps_count', r.gaps_count, 'gap_seconds', r.gap_seconds,
    'first_fix', r.first_fix, 'last_fix', r.last_fix, 'pulled_at', r.pulled_at, 'next_pull_at', nullif(r.next_pull_at, 'infinity'), 'pull_count', r.pull_count, 'error_code', r.error_code,
    'legs', r.legs,
    'stops', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'seq', s.seq, 'geofence_id', s.geofence_id, 'leg_id', s.leg_id, 'started_at', s.started_at, 'ended_at', s.ended_at, 'duration_seconds', s.duration_seconds,
                 'lat', s.latitude, 'lng', s.longitude, 'address', s.address, 'address_source', s.address_source, 'geofence_name', s.geofence_name) order by s.seq)
               from public.trip_route_stops s where s.departure_id = p_departure), '[]'::jsonb),
    'gaps', coalesce((select jsonb_agg(jsonb_build_object('seq', g.seq, 'leg_id', g.leg_id, 'started_at', g.started_at, 'ended_at', g.ended_at, 'seconds', g.seconds,
                 'from_lat', g.from_lat, 'from_lng', g.from_lng, 'to_lat', g.to_lat, 'to_lng', g.to_lng) order by g.seq)
               from public.trip_route_gaps g where g.departure_id = p_departure), '[]'::jsonb),
    'points', pts);
end$$;

-- طلب سحب الآن (غرفة العمليات): يقدّم الانطلاقية في الطابور؛ الدالة الخادمية تلتقطها خلال دقيقة أو تُستدعى مباشرة بزر الصفحة
create or replace function public.trip_route_request_pull(p_departure uuid) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare r public.trip_routes;
begin
  -- العمليات/IT من الواجهة، أو دالة الحافة (service_role) نيابة عن المستخدم بعد تحققها من دوره
  if auth.role() <> 'service_role' and (auth.uid() is null or not app.has_role(array['ops_room','it_admin','super_admin'])) then raise exception 'GPS_FORBIDDEN'; end if;
  if not exists (select 1 from public.garage_departures where id = p_departure) then raise exception 'TRIP_ROUTE_DEPARTURE_NOT_FOUND'; end if;
  r := app.trip_route_ensure(p_departure);
  if r.device_id is null then raise exception 'TRIP_ROUTE_NO_DEVICE'; end if;
  update public.trip_routes set is_final = false, next_pull_at = now(), updated_at = now() where departure_id = p_departure returning * into r;
  return public.trip_route_get(p_departure, 0);
end$$;

revoke all on function public.trip_route_settings_get(), public.trip_route_settings_save(jsonb), public.trip_route_pull_queue(int),
  public.trip_route_apply(uuid, jsonb, int, timestamptz, timestamptz, boolean), public.trip_route_mark_failed(uuid, text),
  public.trip_route_stops_without_address(int), public.trip_route_stop_address_set(bigint, text), public.trip_route_get(uuid, int), public.trip_route_request_pull(uuid) from public, anon;
grant execute on function public.trip_route_settings_get(), public.trip_route_settings_save(jsonb), public.trip_route_get(uuid, int), public.trip_route_request_pull(uuid) to authenticated;
grant execute on function public.trip_route_pull_queue(int), public.trip_route_apply(uuid, jsonb, int, timestamptz, timestamptz, boolean), public.trip_route_mark_failed(uuid, text),
  public.trip_route_stops_without_address(int), public.trip_route_stop_address_set(bigint, text), public.trip_route_get(uuid, int), public.trip_route_request_pull(uuid) to service_role;
