-- ═══════════════════════════════════════════════════════════════════════════
-- 20261122000400_map_geofence_format_fix.sql — عيب جوهري كشفه التحميل الحقيقي
--
-- العيب: دوالي الهندسية تفترض أن الإحداثيات مصفوفات [lat,lng]:
--         (p_polygon->i->>0)   ⇒ تُرجع NULL على الكائنات
--       لكن gps_geofences.polygon يخزّن **كائنات** {"lat":..,"lng":..}:
--         {"lat": 33.2983681, "lng": 44.4152382}
--
-- النتيجة المقيسة: app.map_distance_to_boundary_m على مضلّع حقيقي ⇒ **NULL**
--   فصار app.map_point_in_zone يُرجع false لكل نقطة على الحد،
--   فيرفض الحارسُ أزقةً بدايتها على حدّ الزون تماماً (٠.٠ متر).
--
-- الحل: دوال استخراج موحّدة تقبل **الشكلين** (كما تفعل app.gps_point_in_polygon
--       أصلاً عبر coalesce((p->>0),(p->>lat))). نتبع نفس النمط القائم.
--
-- التراجع: أعد تعريف الدوال من 20261122000000 §① و 20261122000300 §①
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- ① استخراج موحّد: يقبل [lat,lng] أو {lat,lng}
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_pt_lat(p_pt jsonb)
returns double precision
language sql immutable set search_path = pg_catalog as $$
  select coalesce(
    nullif(p_pt->>0, '')::float8,      -- [lat, lng]
    nullif(p_pt->>'lat', '')::float8   -- {lat, lng}
  )
$$;

create or replace function app.map_pt_lng(p_pt jsonb)
returns double precision
language sql immutable set search_path = pg_catalog as $$
  select coalesce(
    nullif(p_pt->>1, '')::float8,
    nullif(p_pt->>'lng', '')::float8
  )
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- ② map_path_valid — كان يفحص pt->>0 مباشرة فيرفض الكائنات
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_path_valid(p_path jsonb)
returns boolean
language sql immutable set search_path = pg_catalog as $$
  select coalesce(
    jsonb_typeof(p_path) = 'array'
    and jsonb_array_length(p_path) >= 2
    and not exists (
      select 1 from jsonb_array_elements(p_path) pt
      where app.map_pt_lat(pt) is null
         or app.map_pt_lng(pt) is null
         or app.map_pt_lat(pt) > 90 or app.map_pt_lat(pt) < -90
         or app.map_pt_lng(pt) > 180 or app.map_pt_lng(pt) < -180
    ), false)
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- ③ map_line_length_m — يفكّ كل نقطة بالدالة الموحّدة
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_line_length_m(p_path jsonb)
returns double precision
language sql immutable set search_path = pg_catalog as $$
  select coalesce(sum(app.map_distance_m(
      app.map_pt_lat(p_path->(pts.i - 1)), app.map_pt_lng(p_path->(pts.i - 1)),
      app.map_pt_lat(p_path->pts.i),       app.map_pt_lng(p_path->pts.i)
    )), 0)
  from (
    select i
    from generate_series(1, greatest(jsonb_array_length(p_path) - 1, 0)) as i
  ) pts
  where p_path->pts.i is not null
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- ④ map_segments_intersect — نفس العيب
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_segments_intersect(
  p_a1 jsonb, p_a2 jsonb, p_b1 jsonb, p_b2 jsonb
) returns boolean
language sql immutable set search_path = pg_catalog as $$
  with q as (
    select app.map_pt_lng(p_a1) ax, app.map_pt_lat(p_a1) ay,
           app.map_pt_lng(p_a2) bx, app.map_pt_lat(p_a2) by,
           app.map_pt_lng(p_b1) cx, app.map_pt_lat(p_b1) cy,
           app.map_pt_lng(p_b2) dx, app.map_pt_lat(p_b2) dy
  ), d as (
    select (bx - ax) * (cy - ay) - (by - ay) * (cx - ax) as d1,
           (bx - ax) * (dy - ay) - (by - ay) * (dx - ax) as d2,
           (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx) as d3,
           (dx - cx) * (by - cy) - (dy - cy) * (bx - cx) as d4
    from q
  )
  select case
    when d1 is null or d2 is null or d3 is null or d4 is null then false
    when d1 = 0 or d2 = 0 or d3 = 0 or d4 = 0 then false   -- التماس عند رأس مسموح
    else (d1 > 0) <> (d2 > 0) and (d3 > 0) <> (d4 > 0)
  end
  from d
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- ⑤ map_distance_to_boundary_m — تقبل الشكلين
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_distance_to_boundary_m(
  p_lat double precision, p_lng double precision, p_polygon jsonb
) returns double precision
language sql immutable set search_path = pg_catalog as $$
  select min(app.map_point_segment_m(
    p_lat, p_lng,
    app.map_pt_lat(p_polygon->i),     app.map_pt_lng(p_polygon->i),
    app.map_pt_lat(p_polygon->(i+1)), app.map_pt_lng(p_polygon->(i+1))
  ))
  from generate_series(0, greatest(jsonb_array_length(p_polygon) - 2, 0)) as i
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- ⑥ map_centroid — تقبل الشكلين
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_centroid(p_path jsonb)
returns jsonb
language sql immutable set search_path = pg_catalog as $$
  select jsonb_build_array(
    round(avg(app.map_pt_lat(pt))::numeric, 7)::float8,
    round(avg(app.map_pt_lng(pt))::numeric, 7)::float8)
  from jsonb_array_elements(p_path) pt
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- ⑦ map_is_vertex — تقبل الشكلين
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_is_vertex(p_pt jsonb, p_path jsonb, p_tol_m double precision default 0.5)
returns boolean
language sql immutable set search_path = pg_catalog as $$
  select exists (
    select 1 from jsonb_array_elements(p_path) v
    where app.map_distance_m(
      app.map_pt_lat(v), app.map_pt_lng(v),
      app.map_pt_lat(p_pt), app.map_pt_lng(p_pt)) <= p_tol_m
  )
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- ⑧ map_overlap_length_m — تقبل الشكلين
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_overlap_length_m(
  p_a jsonb, p_b jsonb, p_tol_m double precision default 1.5
) returns double precision
language plpgsql immutable set search_path = pg_catalog as $$
declare
  i int; j int;
  na int := jsonb_array_length(p_a);
  nb int := jsonb_array_length(p_b);
  seg_len double precision;
  steps int; k int;
  t double precision;
  px double precision; py double precision;
  d double precision; best double precision;
  hit_len double precision := 0;
  alat double precision; alng double precision;
  blat double precision; blng double precision;
  a1lat double precision; a1lng double precision;
  a2lat double precision; a2lng double precision;
  b1lat double precision; b1lng double precision;
  b2lat double precision; b2lng double precision;
begin
  if na < 2 or nb < 2 then return 0; end if;

  for i in 0..na - 2 loop
    a1lat := app.map_pt_lat(p_a->i);        a1lng := app.map_pt_lng(p_a->i);
    a2lat := app.map_pt_lat(p_a->(i+1));    a2lng := app.map_pt_lng(p_a->(i+1));
    if a1lat is null or a2lat is null then continue; end if;
    seg_len := app.map_distance_m(a1lat, a1lng, a2lat, a2lng);
    if seg_len is null or seg_len <= 0 then continue; end if;
    steps := least(greatest(ceil(seg_len / 2.0)::int, 1), 200);

    for k in 0..steps loop
      t := k::float8 / steps;
      px := a1lat + (a2lat - a1lat) * t;
      py := a1lng + (a2lng - a1lng) * t;
      best := null;
      for j in 0..nb - 2 loop
        b1lat := app.map_pt_lat(p_b->j);      b1lng := app.map_pt_lng(p_b->j);
        b2lat := app.map_pt_lat(p_b->(j+1));  b2lng := app.map_pt_lng(p_b->(j+1));
        if b1lat is null or b2lat is null then continue; end if;
        d := app.map_point_segment_m(px, py, b1lat, b1lng, b2lat, b2lng);
        if best is null or d < best then best := d; end if;
        exit when best <= p_tol_m;
      end loop;
      if best is not null and best <= p_tol_m then
        hit_len := hit_len + (seg_len / steps);
      end if;
    end loop;
  end loop;
  return hit_len;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- ⑨ الصلاحيات
-- ───────────────────────────────────────────────────────────────────────────
revoke all on function app.map_pt_lat(jsonb), app.map_pt_lng(jsonb) from public, anon;
grant execute on function app.map_pt_lat(jsonb), app.map_pt_lng(jsonb) to authenticated;
