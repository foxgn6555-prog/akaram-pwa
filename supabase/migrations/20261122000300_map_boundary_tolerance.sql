-- ═══════════════════════════════════════════════════════════════════════════
-- 20261122000300_map_boundary_tolerance.sql
-- تسامح الحد: نقطة على خط الزون ليست خارج الزون.
--
-- ما كشفه الاستيراد: الزقاق «زقاق 905-14» بدايته (33.3035687,44.4200109)
-- ومسافتها إلى حدّ الزون **٠.٠ متر** — أي على الحد تماماً. ray-casting يُرجع
-- false للنقاط على الحد لأن السلوك غير معرّف رياضياً عند التماس.
--
-- وبما أن الحدود مرسومة يدوياً في المنصة، فإن كل شارع يمرّ على حدّ الزون
-- سيُرفض بلا سبب. الحل المعتمد: تسامح ٥ أمتار (أقل من عرض أي زقاق، فلا يسمح
-- بإدخال عنصر خارج الزون فعلياً، لكنه يقبل التماس والتقريب).
--
-- يُستبدل app.map_alleys_guard و app.map_mahallas_guard بتسامح صريح.
--
-- التراجع: أعد تعريف الدالتين من 20261122000000_map_planning_core.sql §⑦
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- ① مسافة نقطة عن حدود مضلّع (بالمتر) — تستخدم map_point_segment_m الموجودة
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_distance_to_boundary_m(
  p_lat double precision, p_lng double precision, p_polygon jsonb
) returns double precision
language sql immutable set search_path = pg_catalog as $$
  select min(app.map_point_segment_m(
    p_lat, p_lng,
    (p_polygon->i->>0)::float8, (p_polygon->i->>1)::float8,
    (p_polygon->(i+1)->>0)::float8, (p_polygon->(i+1)->>1)::float8
  ))
  from generate_series(0, jsonb_array_length(p_polygon) - 2) as i
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- ② دالة موحّدة: «داخل الزون أو على حدّه بتسامح»
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_point_in_zone(
  p_lat double precision, p_lng double precision, p_polygon jsonb,
  p_tol_m double precision default 5.0
) returns boolean
language sql immutable set search_path = pg_catalog as $$
  select app.gps_point_in_polygon(p_lat, p_lng, p_polygon)
      or coalesce(app.map_distance_to_boundary_m(p_lat, p_lng, p_polygon) <= p_tol_m, false)
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- ③ حارس الزقاق بالتسامح
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_alleys_guard()
returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_mahalla_zone uuid;
  v_zone_poly    jsonb;
  v_first        jsonb;
  v_last         jsonb;
  v_tol constant double precision := 5.0;   -- متر: التماس على الحد مسموح
begin
  -- ① المحلة من نفس الزون
  select m.zone_id into v_mahalla_zone
  from public.map_mahallas m where m.id = new.mahalla_id;
  if v_mahalla_zone is null then
    raise exception 'MAP_PARENT: المحلة % غير موجودة', new.mahalla_id
      using errcode = 'foreign_key_violation';
  end if;
  if v_mahalla_zone <> new.zone_id then
    raise exception 'MAP_PARENT: الزقاق في زون % لكن المحلة في زون %',
      new.zone_id, v_mahalla_zone using errcode = 'check_violation';
  end if;

  -- ② الطرفان داخل الزون أو على حدّه
  select g.polygon into v_zone_poly
  from public.map_zones z join public.gps_geofences g on g.id = z.geofence_id
  where z.id = new.zone_id;

  if v_zone_poly is not null then
    v_first := new.path->0;
    v_last  := new.path->(jsonb_array_length(new.path) - 1);

    if not app.map_point_in_zone((v_first->>0)::float8, (v_first->>1)::float8,
                                 v_zone_poly, v_tol) then
      raise exception 'MAP_OUTSIDE: بداية الزقاق (%) خارج مضلّع الزون بأكثر من % م',
        concat(v_first->>0, ',', v_first->>1), v_tol::text
        using errcode = 'check_violation',
              hint = 'راجع الإحداثيات أو حدود الزون';
    end if;
    if not app.map_point_in_zone((v_last->>0)::float8, (v_last->>1)::float8,
                                 v_zone_poly, v_tol) then
      raise exception 'MAP_OUTSIDE: نهاية الزقاق (%) خارج مضلّع الزون بأكثر من % م',
        concat(v_last->>0, ',', v_last->>1), v_tol::text
        using errcode = 'check_violation';
    end if;
  end if;

  -- ③ الطول يُحسب دائماً من المسار
  new.length_m := round(app.map_line_length_m(new.path)::numeric, 1);

  return new;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- ④ حارس المحلة بالتسامح
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_mahallas_guard()
returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_zone_poly jsonb;
  v_pt jsonb;
  v_tol constant double precision := 5.0;
begin
  if new.path is null then return new; end if;
  select g.polygon into v_zone_poly
  from public.map_zones z join public.gps_geofences g on g.id = z.geofence_id
  where z.id = new.zone_id;
  if v_zone_poly is null then return new; end if;

  select pt into v_pt from jsonb_array_elements(new.path) pt
  where not app.map_point_in_zone((pt->>0)::float8, (pt->>1)::float8, v_zone_poly, v_tol)
  limit 1;
  if v_pt is not null then
    raise exception 'MAP_OUTSIDE: المحلة تحتوي نقطة (%) خارج الزون بأكثر من % م',
      v_pt::text, v_tol::text using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- ⑤ الصلاحيات
-- ───────────────────────────────────────────────────────────────────────────
revoke all on function app.map_distance_to_boundary_m(float8, float8, jsonb) from public, anon;
revoke all on function app.map_point_in_zone(float8, float8, jsonb, float8) from public, anon;
grant execute on function app.map_distance_to_boundary_m(float8, float8, jsonb) to authenticated;
grant execute on function app.map_point_in_zone(float8, float8, jsonb, float8) to authenticated;
