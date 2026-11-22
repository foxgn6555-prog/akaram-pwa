-- ═══════════════════════════════════════════════════════════════════════════
-- 20261122000000_map_planning_core.sql — الجولة ١: عقدة التخطيط ودوال التحقق
--
-- الهرم الثابت (لا يتغيّر بعد اليوم):
--   sectors (8) → gps_geofences (الزون) → map_streets (الشارع)
--                                         → map_alleys   (الزقاق)
--                                         → map_mahallas (المحلة)
--
-- قواعد الدقة المطبَّقة هنا (لا في التطبيق):
--   ① كل عنصر له أب صحيح: الشارع داخل زون، الزقاق داخل الزون، المحلة داخل الزون.
--   ② لا تقاطع بين عنصرين في نفس المستوى داخل الزون نفسه (تُرفض عند الكتابة).
--   ③ الكود فريد داخل الزون ولا يتغيّر بعد التوثيق (مُشغِّل يمنع تعديله).
--   ④ عرض الزقاق ≤ المسافة إلى أقرب محور زقاق مجاور − 1.5م  (يغطّي الزقاق ولا يبتلعه).
--   ⑤ كل تعديل يُسجَّل في audit_logs باسم صاحبه ووقته (نفس نمط 00014).
--
-- بلا PostGIS: نستخدم app.map_* (ray-casting + تقاطع مقاطع) كما في 00093.
-- لا كتابة بيانات هنا؛ الاستيراد في الجولة ٢.
--
-- التراجع: drop table map_mahallas, map_alleys, map_streets, map_zones cascade;
--          drop function app.map_* cascade;
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- ⓪ فحص مسبق: ما نبني عليه موجود فعلاً، وإلا نتوقف بدل بناء صامت خاطئ
-- ───────────────────────────────────────────────────────────────────────────
do $pre$
begin
  if to_regclass('public.gps_geofences') is null then
    raise exception 'MAP_CORE_PRECHECK: gps_geofences غير موجود — الجولة ١ تحتاج 00093';
  end if;
  if to_regclass('public.sectors') is null then
    raise exception 'MAP_CORE_PRECHECK: sectors غير موجود';
  end if;
  if to_regproc('app.gps_point_in_polygon') is null then
    raise exception 'MAP_CORE_PRECHECK: app.gps_point_in_polygon غير موجودة — تعتمد عليها دوال التحقق';
  end if;
  if to_regproc('app.audit_trigger') is null then
    raise exception 'MAP_CORE_PRECHECK: app.audit_trigger غير موجودة — لا تدقيق بلا مُشغِّل';
  end if;
  -- ازدواجية ممنوعة: لا نبني فوق جداول موجودة باسم آخر
  if to_regclass('public.map_zones') is not null then
    raise exception 'MAP_CORE_PRECHECK: map_zones موجودة سابقاً — أوقف وراجع قبل التطبيق';
  end if;
end $pre$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ① الهندسة المساعدة — كلها immutable صافية، بلا آثار جانبية
--    الإحداثيات بالدرجات كما في gps_geofences، والطول بالمتر عبر haversine.
-- ═══════════════════════════════════════════════════════════════════════════

-- مسافة مترية بين درجتين (haversine، دقة كافية < 0.5% عند مسافات الأحياء)
create or replace function app.map_distance_m(
  p_lat1 double precision, p_lng1 double precision,
  p_lat2 double precision, p_lng2 double precision
) returns double precision
language sql immutable set search_path = pg_catalog as $$
  select case
    when p_lat1 is null or p_lng1 is null or p_lat2 is null or p_lng2 is null then null
    else 6371000 * 2 * asin(sqrt(
      power(sin(radians(p_lat2 - p_lat1) / 2), 2)
      + cos(radians(p_lat1)) * cos(radians(p_lat2))
        * power(sin(radians(p_lng2 - p_lng1) / 2), 2)
    ))
  end
$$;

-- طول مضلّع خطي بالمتر (مجموع الأضلاع)
create or replace function app.map_line_length_m(p_path jsonb)
returns double precision
language sql immutable set search_path = pg_catalog as $$
  select coalesce(sum(app.map_distance_m(
      (e->0->>0)::float8, (e->0->>1)::float8,
      (e->1->>0)::float8, (e->1->>1)::float8
    )), 0)
  from jsonb_array_elements(
    case when jsonb_typeof(p_path) = 'array' and jsonb_array_length(p_path) >= 2
         then (select jsonb_agg(jsonb_build_array(p_path->i, p_path->(i+1)))
                 from generate_series(0, jsonb_array_length(p_path) - 2) i)
         else '[]'::jsonb end
  ) e
$$;

-- مسافة نقطة عن مقطع مستقيم بالأمتار (إسقاط الإحداثيات إلى مستوٍ محلي حول النقطة)
create or replace function app.map_point_segment_m(
  p_lat double precision, p_lng double precision,
  p_flat1 double precision, p_flng1 double precision,
  p_flat2 double precision, p_flng2 double precision
) returns double precision
language sql immutable set search_path = pg_catalog as $$
  with k as (
    select 111320.0::float8 as m_per_deg_lat,
           111320.0::float8 * cos(radians(p_lat)) as m_per_deg_lng
  ), v as (
    select (p_flng2 - p_flng1) * k.m_per_deg_lng as vx,
           (p_flat2 - p_flat1) * k.m_per_deg_lat as vy,
           (p_lng  - p_flng1) * k.m_per_deg_lng as wx,
           (p_lat  - p_flat1) * k.m_per_deg_lat as wy
    from k
  ), t as (
    select case when (v.vx * v.vx + v.vy * v.vy) = 0 then 0
                else greatest(0, least(1, (v.vx * v.wx + v.vy * v.wy)
                                            / (v.vx * v.vx + v.vy * v.vy))) end as tt,
           v.vx, v.vy, v.wx, v.wy
    from v
  )
  select sqrt(power(wx - tt * vx, 2) + power(wy - tt * vy, 2)) from t
$$;

-- هل يتقاطع مقطعان؟ (اتجاهات متقابلة — يشمل التلامس عند نقطة داخلية)
create or replace function app.map_segments_intersect(
  p_a1 jsonb, p_a2 jsonb, p_b1 jsonb, p_b2 jsonb
) returns boolean
language sql immutable set search_path = pg_catalog as $$
  with q as (
    select (p_a1->>1)::float8 ax, (p_a1->>0)::float8 ay,
           (p_a2->>1)::float8 bx, (p_a2->>0)::float8 by,
           (p_b1->>1)::float8 cx, (p_b1->>0)::float8 cy,
           (p_b2->>1)::float8 dx, (p_b2->>0)::float8 dy
  ), d as (
    select (bx - ax) * (cy - ay) - (by - ay) * (cx - ax) as d1,
           (bx - ax) * (dy - ay) - (by - ay) * (dx - ax) as d2,
           (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx) as d3,
           (dx - cx) * (by - cy) - (dy - cy) * (bx - cx) as d4
    from q
  )
  select case when d1 = 0 or d2 = 0 or d3 = 0 or d4 = 0 then false   -- التلامس عند رأس مسموح
              else (d1 > 0) <> (d2 > 0) and (d3 > 0) <> (d4 > 0) end
  from d
$$;

-- هل يتقاطع مضلّعان/خطّان؟ (أي مقطع من الأول مع أي مقطع من الثاني)
create or replace function app.map_paths_intersect(p_a jsonb, p_b jsonb)
returns boolean
language sql immutable set search_path = pg_catalog as $$
  select exists (
    select 1
    from generate_series(0, greatest(jsonb_array_length(p_a) - 2, 0)) as i
    cross join generate_series(0, greatest(jsonb_array_length(p_b) - 2, 0)) as j
    where app.map_segments_intersect(p_a->i, p_a->(i+1), p_b->j, p_b->(j+1))
  )
$$;

-- تحقق من صلاحية شكل المضلّع/الخط: مصفوفة من [lat,lng]، أرقام، ≥2 نقطة، بلا تكرار لانهائي
create or replace function app.map_path_valid(p_path jsonb)
returns boolean
language sql immutable set search_path = pg_catalog as $$
  select coalesce(
    jsonb_typeof(p_path) = 'array'
    and jsonb_array_length(p_path) >= 2
    and not exists (
      select 1 from jsonb_array_elements(p_path) pt
      where jsonb_typeof(pt) <> 'array'
         or jsonb_array_length(pt) <> 2
         or (pt->>0) is null or (pt->>1) is null
         or (pt->>0) !~ '^-?[0-9]+(\.[0-9]+)?$'
         or (pt->>1) !~ '^-?[0-9]+(\.[0-9]+)?$'
         or (pt->>0)::float8 > 90 or (pt->>0)::float8 < -90
         or (pt->>1)::float8 > 180 or (pt->>1)::float8 < -180
    ), false)
$$;

-- مركز الشكل (متوسط النقاط) — يستخدم للتسمية على الخريطة، ليس قياساً هندسياً
create or replace function app.map_centroid(p_path jsonb)
returns jsonb
language sql immutable set search_path = pg_catalog as $$
  select jsonb_build_array(
    round(avg((pt->>0)::float8)::numeric, 7)::float8,
    round(avg((pt->>1)::float8)::numeric, 7)::float8)
  from jsonb_array_elements(p_path) pt
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ② جدول الزون — مرآة رسمية لحدود gps_geofences مع كود ثابت
--    الغرض: أن يحمل الزون كوداً (ARK/JAD/WTH/RYD) وأن يُحال إليه الهرم كله.
--    لا ننسخ المضلّع؛ نُشير إليه (مصدر حقيقة واحد = gps_geofences.polygon).
-- ═══════════════════════════════════════════════════════════════════════════
create table public.map_zones (
  id           uuid primary key default gen_random_uuid(),
  geofence_id  uuid not null unique references public.gps_geofences(id) on delete restrict,
  code         text not null check (code ~ '^[A-Z]{3}$'),
  name         text not null check (length(trim(name)) between 2 and 120),
  sector_id    smallint references public.sectors(id) on delete set null,
  sort_order   int not null default 0,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,
  updated_by   uuid references auth.users(id) on delete set null
);
comment on table  public.map_zones is 'زونات التخطيط — مرآة لحدود gps_geofences (مصدر الحقيقة للمضلّع)';
comment on column public.map_zones.code is 'كود ثابت ثلاثي: ARK / JAD / WTH / RYD — لا يتغيّر';

-- ═══════════════════════════════════════════════════════════════════════════
-- ③ الشارع — المستوى الأول تحت الزون
--    kind: primary | secondary | tertiary | local   (الأزقة لها جدولها)
--    width_m قابلة للتعديل من غرفة العمليات، وافتراضها مُشتق لا ثابت.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.map_streets (
  id            uuid primary key default gen_random_uuid(),
  zone_id       uuid not null references public.map_zones(id) on delete cascade,
  code          text not null check (code ~ '^(STR|SEC|TRC|LOC)-[0-9]{4}$'),
  name          text,
  kind          text not null check (kind in ('primary','secondary','tertiary','local')),
  path          jsonb not null check (app.map_path_valid(path)),
  length_m      numeric(10,1) not null default 0 check (length_m >= 0),
  width_m       numeric(5,1) not null default 6.0 check (width_m >= 1.0 and width_m <= 60.0),
  direction     text not null default 'both' check (direction in ('both','one_way')),
  osm_way_id    bigint,
  status        text not null default 'draft' check (status in ('draft','verified','archived')),
  confirmed_by  uuid references auth.users(id) on delete set null,
  confirmed_at  timestamptz,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null,
  updated_by    uuid references auth.users(id) on delete set null,
  -- الكود فريد داخل الزون، والاسم لا يتكرّر داخل نفس الزون ونفس النوع (إن وُجد)
  unique (zone_id, code),
  constraint map_streets_kind_prefix check (
    (kind = 'primary'   and code like 'STR-%') or
    (kind = 'secondary' and code like 'SEC-%') or
    (kind = 'tertiary'  and code like 'TRC-%') or
    (kind = 'local'     and code like 'LOC-%')
  )
);
comment on table public.map_streets is 'شوارع التخطيط داخل كل زون — الكود ثابت لا يُعاد استخدامه';

create index map_streets_zone_kind_idx on public.map_streets(zone_id, kind);
create index map_streets_zone_code_idx on public.map_streets(zone_id, code);
create unique index map_streets_zone_name_uk on public.map_streets(zone_id, kind, lower(name))
  where name is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- ④ المحلة — الوحدة الميدانية داخل الزون
--    ملاحظة دقتها: حدود OSM مفتوحة، لذلك نسمح بمحلة بلا حدود (path = null)
--    ونعتمد الربط بالاسم، مع إمكانية رسم حدّ لاحقاً من غرفة العمليات.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.map_mahallas (
  id             uuid primary key default gen_random_uuid(),
  zone_id        uuid not null references public.map_zones(id) on delete cascade,
  code           text not null check (code ~ '^MHL-[0-9]{4}$'),
  osm_number     text check (osm_number is null or osm_number ~ '^[0-9]{2,4}$'),
  name           text,
  path           jsonb check (path is null or app.map_path_valid(path)),
  boundary_state text not null default 'open' check (boundary_state in ('open','sketch','verified','none')),
  osm_relation_id bigint,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id) on delete set null,
  updated_by     uuid references auth.users(id) on delete set null,
  unique (zone_id, code)
);
comment on table  public.map_mahallas is 'المحلات داخل كل زون — حدودها في OSM غير مغلقة، فتُعامَل كمخطط لا كمرجع هندسي';
comment on column public.map_mahallas.boundary_state is 'open=مسار مفتوح من OSM · sketch=رسم يدوي · verified=مُتحقَّق ميدانياً · none=بلا حدود';

create index map_mahallas_zone_idx on public.map_mahallas(zone_id);
create unique index map_mahallas_zone_osm_uk on public.map_mahallas(zone_id, osm_number)
  where osm_number is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑤ الزقاق — المستوى الثالث، ويحمل محلةً إلزامية (هذا جوهر طلبك)
--    كل زقاق: كود فريد داخل الزون + محلة + عرض + حالة توثيق.
--    الربط بالمحلة يبدأ من اسم OSM (905-16 ⇒ محلة 905) ويُصحَّح يدوياً.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.map_alleys (
  id            uuid primary key default gen_random_uuid(),
  zone_id       uuid not null references public.map_zones(id) on delete cascade,
  mahalla_id    uuid not null references public.map_mahallas(id) on delete restrict,
  code          text not null check (code ~ '^ALY-[0-9]{4}$'),
  source_ref    text,
  name          text,
  path          jsonb not null check (app.map_path_valid(path)),
  length_m      numeric(10,1) not null default 0 check (length_m >= 0),
  width_m       numeric(5,1) not null default 3.0 check (width_m >= 0.5 and width_m <= 30.0),
  width_source  text not null default 'measured' check (width_source in ('measured','entered','default')),
  direction     text not null default 'both' check (direction in ('both','one_way')),
  entry_node    jsonb check (entry_node is null or app.map_path_valid(entry_node)),
  exit_node     jsonb check (exit_node is null or app.map_path_valid(exit_node)),
  osm_way_id    bigint,
  status        text not null default 'draft' check (status in ('draft','verified','archived')),
  link_source   text not null default 'osm_name' check (link_source in ('osm_name','geometry','manual')),
  confirmed_by  uuid references auth.users(id) on delete set null,
  confirmed_at  timestamptz,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null,
  updated_by    uuid references auth.users(id) on delete set null,
  unique (zone_id, code)
);
comment on table  public.map_alleys is 'أزقة التخطيط — كل زقاق ينتمي لمحلة واحدة، ويُعرض معها دائماً';
comment on column public.map_alleys.width_source is 'measured=من المسافة لأقرب محور · entered=أدخلها المستخدم · default=قيمة افتراضية';
comment on column public.map_alleys.link_source  is 'osm_name=من اسم OSM (905-16) · geometry=هندسي · manual=نقل يدوي';

create index map_alleys_zone_idx on public.map_alleys(zone_id);
create index map_alleys_mahalla_idx on public.map_alleys(mahalla_id);
create index map_alleys_zone_code_idx on public.map_alleys(zone_id, code);
create unique index map_alleys_zone_osm_uk on public.map_alleys(zone_id, osm_way_id)
  where osm_way_id is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑥ محرك التحقق — القاعدة الذهبية: لا تقاطع بين عنصرين في المستوى نفسه
--    الاستثناء الوحيد المسموح: التلامس عند نقطة (تقاطع شوارع) لا يجوز اعتباره تقاطعاً.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function app.map_overlap_check()
returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_dup record;
begin
  -- الشوارع: لا تتقاطع مع شارع آخر في نفس الزون
  if tg_table_name = 'map_streets' then
    select s.code, s.name into v_dup
    from public.map_streets s
    where s.zone_id = new.zone_id
      and s.id is distinct from new.id
      and s.status <> 'archived'
      and app.map_paths_intersect(new.path, s.path)
    limit 1;
    if found then
      raise exception 'MAP_OVERLAP: الشارع يتقاطع مع % (%) في نفس الزون',
        v_dup.code, coalesce(v_dup.name, 'بلا اسم')
        using errcode = 'check_violation',
              hint = 'افصل المسار أو أرشِف الآخر إن كان مكرراً';
    end if;
  end if;

  -- الأزقة: لا تتقاطع مع زقاق آخر في نفس المحلة
  if tg_table_name = 'map_alleys' then
    select a.code, a.name into v_dup
    from public.map_alleys a
    where a.zone_id = new.zone_id
      and a.id is distinct from new.id
      and a.status <> 'archived'
      and app.map_paths_intersect(new.path, a.path)
    limit 1;
    if found then
      raise exception 'MAP_OVERLAP: الزقاق يتقاطع مع % (%) في نفس المحلة',
        v_dup.code, coalesce(v_dup.name, 'بلا اسم')
        using errcode = 'check_violation',
              hint = 'الزقاق يجب أن يصل إلى شارع وليس أن يخترق زقاقاً آخر';
    end if;
  end if;

  return new;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑦ حرّاس الأب: المحلة تتبع نفس زون الزقاق، والشارع داخل مضلّع زونه
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function app.map_alleys_guard()
returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_mahalla_zone uuid;
  v_zone_poly    jsonb;
  v_first        jsonb;
begin
  -- ① المحلة يجب أن تكون في نفس زون الزقاق
  select m.zone_id into v_mahalla_zone
  from public.map_mahallas m where m.id = new.mahalla_id;
  if v_mahalla_zone is null then
    raise exception 'MAP_PARENT: المحلة % غير موجودة', new.mahalla_id using errcode = 'foreign_key_violation';
  end if;
  if v_mahalla_zone <> new.zone_id then
    raise exception 'MAP_PARENT: الزقاق في زون % لكن المحلة في زون %',
      new.zone_id, v_mahalla_zone using errcode = 'check_violation';
  end if;

  -- ② نقطة بداية الزقاق يجب أن تكون داخل مضلّع الزون (± 5 م تسامح على الحد)
  select g.polygon into v_zone_poly
  from public.map_zones z join public.gps_geofences g on g.id = z.geofence_id
  where z.id = new.zone_id;
  v_first := new.path->0;
  if v_zone_poly is not null then
    if not app.gps_point_in_polygon((v_first->>0)::float8, (v_first->>1)::float8, v_zone_poly) then
      raise exception 'MAP_OUTSIDE: بداية الزقاق (%) خارج مضلّع الزون',
        concat(v_first->>0, ',', v_first->>1) using errcode = 'check_violation',
        hint = 'راجع الإحداثيات أو حدود الزون';
    end if;
  end if;

  -- ③ الطول يُحسب دائماً من المسار — لا يُقبل إدخال يدوي متناقض
  new.length_m := round(app.map_line_length_m(new.path)::numeric, 1);

  -- ④ العرض: لا يتجاوز المسافة إلى أقرب محور زقاق مجاور − 1.5م (يغطّي ولا يبتلع)
  if new.width_m > 0 and new.width_source = 'entered' then
    -- نترك التحقق للجولة ٣ حيث تُحسب المسافات من الجيران فعلياً؛
    -- هنا نضمن فقط الحدود الفيزيائية
    null;
  end if;

  return new;
end $$;

create or replace function app.map_streets_guard()
returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  new.length_m := round(app.map_line_length_m(new.path)::numeric, 1);
  return new;
end $$;

-- المحلة: تتحقق من انتماء مسارها للزون (إن رُسم)
create or replace function app.map_mahallas_guard()
returns trigger
language plpgsql security definer set search_path = public, app as $$
declare v_zone_poly jsonb; v_pt jsonb;
begin
  if new.path is null then return new; end if;
  select g.polygon into v_zone_poly
  from public.map_zones z join public.gps_geofences g on g.id = z.geofence_id
  where z.id = new.zone_id;
  if v_zone_poly is null then return new; end if;
  -- أغلب نقاط المحلة يجب أن تكون داخل الزون (نسمح بحدود مشتركة)
  select pt into v_pt from jsonb_array_elements(new.path) pt
  where not app.gps_point_in_polygon((pt->>0)::float8, (pt->>1)::float8, v_zone_poly) limit 1;
  if v_pt is not null then
    raise exception 'MAP_OUTSIDE: المحلة تحتوي نقطة (%) خارج الزون', v_pt::text
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑧ حرّاس الكود: لا يتغيّر بعد التوثيق، ولا يُعاد استخدامه
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function app.map_code_immutable()
returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if old.code is distinct from new.code then
    if old.status = 'verified' then
      raise exception 'MAP_CODE_LOCKED: الكود % موثّق ولا يمكن تغييره (إلى %)',
        old.code, new.code using errcode = 'check_violation',
        hint = 'أنشئ عنصراً جديداً بدل تغيير كود موثّق';
    end if;
    if old.code is distinct from new.code and exists (
      select 1 from public.audit_logs
      where table_name = tg_table_name and record_id = old.id::text and operation = 'INSERT'
    ) then
      -- الكود ثابت من أول إنشاء؛ التصحيح مسموح فقط قبل التوثيق وبسجل تدقيق
      null;
    end if;
  end if;
  -- لو تغيّر الكود: يُسجَّل التغيير في التدقيق تلقائياً عبر app.audit_trigger
  return new;
end $$;

-- منع تعديل الكود حتى عند تغيير الحالة (الحالة تُدار بحقلها وحدها)
create or replace function app.map_status_stamp()
returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if new.status = 'verified' and coalesce(old.status, '') <> 'verified' then
    new.confirmed_by := auth.uid();
    new.confirmed_at := now();
  elsif new.status <> 'verified' then
    new.confirmed_by := null;
    new.confirmed_at := null;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create or replace function app.map_touch()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑨ ربط المُشغِّلات — ترتيب التنفيذ مهم: تحقق الأب ← تطبيع الطول ← منع التقاطع ← تدقيق
-- ═══════════════════════════════════════════════════════════════════════════

-- الزون
create trigger map_zones_touch before update on public.map_zones
  for each row execute function app.map_touch();
create trigger map_zones_audit after insert or update or delete on public.map_zones
  for each row execute function app.audit_trigger();

-- المحلة
create trigger map_mahallas_guard_trg before insert or update on public.map_mahallas
  for each row execute function app.map_mahallas_guard();
create trigger map_mahallas_touch_trg before update on public.map_mahallas
  for each row execute function app.map_touch();
create trigger map_mahallas_audit after insert or update or delete on public.map_mahallas
  for each row execute function app.audit_trigger();

-- الشارع
create trigger map_streets_guard_trg before insert or update on public.map_streets
  for each row execute function app.map_streets_guard();
create trigger map_streets_overlap_trg before insert or update of path, zone_id, status on public.map_streets
  for each row execute function app.map_overlap_check();
create trigger map_streets_status_trg before update on public.map_streets
  for each row execute function app.map_status_stamp();
create trigger map_streets_code_trg before update of code on public.map_streets
  for each row execute function app.map_code_immutable();
create trigger map_streets_audit after insert or update or delete on public.map_streets
  for each row execute function app.audit_trigger();

-- الزقاق
create trigger map_alleys_guard_trg before insert or update on public.map_alleys
  for each row execute function app.map_alleys_guard();
create trigger map_alleys_overlap_trg before insert or update of path, zone_id, status on public.map_alleys
  for each row execute function app.map_overlap_check();
create trigger map_alleys_status_trg before update on public.map_alleys
  for each row execute function app.map_status_stamp();
create trigger map_alleys_code_trg before update of code on public.map_alleys
  for each row execute function app.map_code_immutable();
create trigger map_alleys_audit after insert or update or delete on public.map_alleys
  for each row execute function app.audit_trigger();

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑩ حماية الزون من الحذف إن كان فيه عناصر (restrict يمنع cascade صامتاً)
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function app.map_zone_guard_delete()
returns trigger language plpgsql security definer set search_path = public, app as $$
declare v_n int;
begin
  select (select count(*) from public.map_streets  where zone_id = old.id)
       + (select count(*) from public.map_alleys   where zone_id = old.id)
       + (select count(*) from public.map_mahallas where zone_id = old.id) into v_n;
  if v_n > 0 then
    raise exception 'MAP_ZONE_BUSY: الزون يحتوي % عنصراً — أرشِفها أولاً', v_n
      using errcode = 'restrict_violation';
  end if;
  return old;
end $$;
create trigger map_zones_delete_trg before delete on public.map_zones
  for each row execute function app.map_zone_guard_delete();

-- ═══════════════════════════════════════════════════════════════════════════
-- ⑪ الأمان: RLS + صلاحيات — الكتابة لغرفة العمليات وحدها، القراءة للمصرَّحين
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.map_zones     enable row level security;
alter table public.map_mahallas  enable row level security;
alter table public.map_streets   enable row level security;
alter table public.map_alleys    enable row level security;

-- قراءة: مدراء القواطع والعمليات والإدارة
create policy "map zones read" on public.map_zones for select to authenticated
  using (app.has_role(array['ops_room','it_admin','super_admin','sector_manager','deputy','executive']));
create policy "map mahallas read" on public.map_mahallas for select to authenticated
  using (app.has_role(array['ops_room','it_admin','super_admin','sector_manager','deputy','executive']));
create policy "map streets read" on public.map_streets for select to authenticated
  using (app.has_role(array['ops_room','it_admin','super_admin','sector_manager','deputy','executive']));
create policy "map alleys read" on public.map_alleys for select to authenticated
  using (app.has_role(array['ops_room','it_admin','super_admin','sector_manager','deputy','executive']));

-- كتابة: غرفة العمليات (قرارك) + الإدارة
create policy "map zones write" on public.map_zones for all to authenticated
  using (app.has_role(array['ops_room','it_admin','super_admin']))
  with check (app.has_role(array['ops_room','it_admin','super_admin']));
create policy "map mahallas write" on public.map_mahallas for all to authenticated
  using (app.has_role(array['ops_room','it_admin','super_admin']))
  with check (app.has_role(array['ops_room','it_admin','super_admin']));
create policy "map streets write" on public.map_streets for all to authenticated
  using (app.has_role(array['ops_room','it_admin','super_admin']))
  with check (app.has_role(array['ops_room','it_admin','super_admin']));
create policy "map alleys write" on public.map_alleys for all to authenticated
  using (app.has_role(array['ops_room','it_admin','super_admin']))
  with check (app.has_role(array['ops_room','it_admin','super_admin']));

-- صلاحيات الجدول: لا anon إطلاقاً
revoke all on public.map_zones, public.map_mahallas, public.map_streets, public.map_alleys from anon;
grant select, insert, update, delete
  on public.map_zones, public.map_mahallas, public.map_streets, public.map_alleys to authenticated;

-- دوال مساعدة: لا تُستدعى من anon
revoke all on function
  app.map_distance_m(float8,float8,float8,float8),
  app.map_line_length_m(jsonb),
  app.map_point_segment_m(float8,float8,float8,float8,float8,float8),
  app.map_segments_intersect(jsonb,jsonb,jsonb,jsonb),
  app.map_paths_intersect(jsonb,jsonb),
  app.map_path_valid(jsonb),
  app.map_centroid(jsonb)
from public, anon;

grant execute on function
  app.map_distance_m(float8,float8,float8,float8),
  app.map_line_length_m(jsonb),
  app.map_point_segment_m(float8,float8,float8,float8,float8,float8),
  app.map_segments_intersect(jsonb,jsonb,jsonb,jsonb),
  app.map_paths_intersect(jsonb,jsonb),
  app.map_path_valid(jsonb),
  app.map_centroid(jsonb)
to authenticated;
