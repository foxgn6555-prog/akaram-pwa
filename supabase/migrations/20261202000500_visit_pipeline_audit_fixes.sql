-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 20261202000500 · تدقيق ما بعد التشغيل — ثلاث عيوب قاستها الاختبارات (المرحلة ⑤)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- بعد أن عمل الخطّ فعلياً على الإنتاج، شُغِّل تدقيق مستقلّ (tests/db/visit-pipeline-audit.sql)
-- فكشف ثلاثة عيوب لم تكشفها الاختبارات العقدية A1–A7، لأنها تظهر في **بيانات ناتجة**
-- لا في شرط برمجي. كل عيب هنا مرفق برقمه المقيس على القاعدة قبل الإصلاح.
--
-- ─── ① زيارة «سيارة متحركة» تُسجَّل زيارة مكوث (B2) ───────────────────────────────────────
--   القياس: زيارة واحدة (شارع، مكوث ٥٤ ثانية) تتقاطع مع زيارة أخرى لنفس الآلية في نفس
--   الزمن. سببها أن مرشّح «الزقاق المغطّى بشارع» يستثني الزقاق فقط:
--       case when c.place_kind = 'alley' and c.street_cover_s / c.dwell_s >= 0.95 ...
--   فإذا كانت الآلية **تعبر شارعاً** في نقاط متفرّقة، اجتمعت لها «جزيرة» على الشارع
--   بلا مكوث حقيقي، وسُجّلت زيارة شارع في نفس ثانية زيارة تانيه ⇒ تداخل مستحيل.
--   الإصلاح: شارع مقطوع بنقاط متفرّقة ليس مكوثاً. الشرط الجديد:
--       dwell <= 0  or  pts < 3  or  (street and dwell < min_dwell)  or  (alley …)
--   أي: زيارة الشارع لا تُسجَّل إلا إذا بلغ مكوثها الحدّ الأدنى (٦٠ ثانية افتراضياً).
--   الزقاق يبقى كما هو (له حدّه عبر pts/dwell/street_cover). والقرار مخزَّن في reason
--   ليظهر في الشاشة لا ليُخفى.
--
-- ─── ② seq يتكرّر عبر الزونات (B3) ────────────────────────────────────────────────────────
--   القياس: ٣ صفوف مكرّرة بـ seq = 1 لنفس (آلية × يوم). سببها أن إعادة الترقيم كانت
--   محدودة بالزون المبنيّ:
--       where zone_id = p_zone and placeday between …
--   والبناء يعمل زوناً زوناً، فكل بناء يرقّم زونَه من ١ ⇒ اليوم نفسه يحمل ١،١،١.
--   الإصلاح: الترقيم على مستوى (آلية × يوم) عبر كل الزونات — وهو تعريف seq الصحيح.
--
-- ─── ③ تنفيذ anon على دالتين في app (B12) ────────────────────────────────────────────────
--   القياس: has_function_privilege('anon', app.map_build_visits, 'execute') = true،
--   وكذلك app.visit_day_state. الثانية قراءة فقط وتكشف أعداد نقاط، والأولى definer
--   ولكنها محميّة بـ map_require_editor() داخلياً. ومع ذلك لا سبب لفتحها لغير المسجَّل:
--   الإصلاح إغلاقها، مع الإبقاء على المستخدم المسجَّل (الواجهة تحتاجه).
--
-- لا حذف بيانات في هذا الترحيل. الصفوف الزائدة الحالية تُصحَّح وحدها في البناء التالي
-- لنافذتها (البناء يُعيد كتابة نافذته بالكامل)، أو بحذف صفّ الشارع القصير مباشرةً أدناه.
--
-- التراجع: إعادة تعريف app.map_build_visits من 20261202000400، وإعادة المنح.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- إعادة تعريف المحرّك بعد الإصلاحين ① و②
-- ───────────────────────────────────────────────────────────────────────────────────────────
create or replace function app.map_build_visits(
  p_zone uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_vehicle uuid default null,
  p_min_dwell_seconds integer default 60,
  p_max_gap_seconds integer default 300,
  p_replace boolean default true,
  p_system_call boolean default false,
  out visits_created integer,
  out visits_merged integer,
  out places_scanned integer,
  out skipped_visits integer
)
language plpgsql security definer set search_path = public, app
set statement_timeout = '10min' as $$
declare
  v_created int := 0;
  v_merged  int := 0;
  v_places  int := 0;
  v_skipped int := 0;
  v_day_from date := app.map_baghdad_day(p_from);
  v_day_to   date := app.map_baghdad_day(p_to - interval '1 second');
  v_pts      bigint;
  v_cur_visits int;
begin
  if p_to <= p_from then
    raise exception 'MAP_BUILD_WINDOW_INVALID: النهاية % ليست بعد البداية %', p_to, p_from
      using errcode = 'invalid_parameter_value';
  end if;

  if not p_system_call then
    perform public.map_require_editor();
  end if;

  select count(*)::bigint into v_pts
    from public.gps_device_position_history h
    join public.gps_vehicle_bindings vb on vb.device_id = h.device_id
   where h.fix_time >= p_from
     and h.fix_time <  p_to
     and h.latitude is not null
     and h.longitude is not null
     and (p_vehicle is null or vb.garage_vehicle_id = p_vehicle);

  if p_replace then
    select count(*)::int into v_cur_visits
      from public.map_visits v
     where v.zone_id = p_zone
       and v.entered_at >= p_from
       and v.entered_at <  p_to
       and (p_vehicle is null or v.vehicle_id = p_vehicle);

    if coalesce(v_pts, 0) < coalesce(v_cur_visits, 0) then
      raise exception 'MAP_BUILD_GUARD_INSUFFICIENT_POINTS: يوم % (زون %) — نقاط % أقل من الزيارات القائمة %; أُلغي البناء للحفاظ على البيانات.',
        v_day_from, p_zone, coalesce(v_pts, 0), coalesce(v_cur_visits, 0)
        using errcode = 'invalid_parameter_value';
    end if;

    delete from public.map_visits v
     where v.zone_id = p_zone
       and v.entered_at >= p_from
       and v.entered_at <  p_to
       and (p_vehicle is null or v.vehicle_id = p_vehicle);
  end if;

  select count(*)::int into v_places
    from (
      select 1 from public.map_streets s
       where s.zone_id = p_zone and s.status <> 'archived'
      union all
      select 1 from public.map_alleys a
       where a.zone_id = p_zone and a.status <> 'archived'
    ) x;

  create temp table if not exists _map_seg (
    place_kind text, place_id uuid, place_code text, place_name text,
    radius_m double precision,
    min_lat double precision, max_lat double precision,
    min_lng double precision, max_lng double precision,
    lat1 double precision, lng1 double precision,
    lat2 double precision, lng2 double precision
  );
  truncate _map_seg;

  insert into _map_seg
  select x.kind, x.pid, x.code, x.name, x.radius_m,
         x.min_lat, x.max_lat, x.min_lng, x.max_lng,
         app.map_pt_lat(x.path -> i),       app.map_pt_lng(x.path -> i),
         app.map_pt_lat(x.path -> (i + 1)), app.map_pt_lng(x.path -> (i + 1))
    from (
      select 'street'::text as kind, s.id as pid, s.code, s.name, s.path,
             app.map_entry_radius_m(s.width_m, 'street') as radius_m,
             (s.bbox)[1] as min_lat, (s.bbox)[3] as max_lat,
             (s.bbox)[2] as min_lng, (s.bbox)[4] as max_lng
        from public.map_streets s
       where s.zone_id = p_zone
         and s.status <> 'archived'
         and s.bbox is not null
         and jsonb_typeof(s.path) = 'array'
         and jsonb_array_length(s.path) >= 2
      union all
      select 'alley'::text, a.id, a.code, a.name, a.path,
             app.map_entry_radius_m(a.width_m, 'alley'),
             (a.bbox)[1], (a.bbox)[3], (a.bbox)[2], (a.bbox)[4]
        from public.map_alleys a
       where a.zone_id = p_zone
         and a.status <> 'archived'
         and a.bbox is not null
         and jsonb_typeof(a.path) = 'array'
         and jsonb_array_length(a.path) >= 2
    ) x
   cross join lateral generate_series(0, jsonb_array_length(x.path) - 2) i;

  create index if not exists _map_seg_bbox on _map_seg (min_lat, max_lat, min_lng, max_lng);

  create temp table if not exists _map_near (
    device_id uuid, vehicle_id uuid, place_kind text, place_id uuid,
    place_code text, place_name text, fix_time timestamptz,
    depth_m double precision, radius_m double precision, inside_n boolean
  );
  truncate _map_near;

  insert into _map_near
  select h.device_id, h.vehicle_id, s.place_kind, s.place_id, s.place_code, s.place_name,
         h.fix_time, m.depth, s.radius_m, m.depth <= s.radius_m
    from (
      select h.id as pos_id, h.device_id, h.latitude, h.longitude, h.fix_time,
             vb.garage_vehicle_id as vehicle_id
        from public.gps_device_position_history h
        join public.gps_vehicle_bindings vb on vb.device_id = h.device_id
       where h.fix_time >= p_from
         and h.fix_time <  p_to
         and h.latitude is not null
         and h.longitude is not null
         and (p_vehicle is null or vb.garage_vehicle_id = p_vehicle)
    ) h
    join _map_seg s
      on h.latitude  between s.min_lat - 0.0005 and s.max_lat + 0.0005
     and h.longitude between s.min_lng - 0.0005 and s.max_lng + 0.0005
   cross join lateral (
     select (h.longitude - s.lng1) * (111320.0 * cos(radians(h.latitude))) as wx,
            (h.latitude  - s.lat1) * 111320.0 as wy,
            (s.lng2 - s.lng1) * (111320.0 * cos(radians(h.latitude))) as vx,
            (s.lat2 - s.lat1) * 111320.0 as vy
   ) v
   cross join lateral (
     select case when (v.vx * v.vx + v.vy * v.vy) = 0 then 0
                 else greatest(0, least(1, (v.vx * v.wx + v.vy * v.wy)
                                           / (v.vx * v.vx + v.vy * v.vy))) end as tt
   ) t
   cross join lateral (
     select sqrt(power(v.wx - t.tt * v.vx, 2) + power(v.wy - t.tt * v.vy, 2)) as depth
   ) m
   where m.depth <= s.radius_m + 55.0;

  create index if not exists _map_near_place on _map_near (place_kind, place_id, vehicle_id, fix_time);

  create temp table if not exists _map_island (
    place_kind text, place_id uuid, place_code text, place_name text,
    vehicle_id uuid, device_id uuid, entered_at timestamptz, exited_at timestamptz,
    dwell_s integer, pts_n integer, max_depth double precision, min_gap_s integer
  );
  truncate _map_island;
  insert into _map_island
  select place_kind, place_id, place_code, place_name, vehicle_id,
         (array_agg(device_id  order by fix_time) filter (where inside_n))[1],
         min(fix_time) filter (where inside_n),
         max(fix_time) filter (where inside_n),
         extract(epoch from (max(fix_time) filter (where inside_n)
                           - min(fix_time) filter (where inside_n)))::int,
         count(*) filter (where inside_n)::int,
         round(max(depth_m) filter (where inside_n)::numeric, 1)::double precision,
         min(gap_s) filter (where inside_n)::int
  from (
    select n.*,
           sum(n.is_start) over (partition by n.place_kind, n.place_id, n.vehicle_id
                                 order by n.fix_time) as grp_id
    from (
      select m.*,
             extract(epoch from (m.fix_time - lag(m.fix_time) over (
                        partition by m.place_kind, m.place_id, m.vehicle_id
                        order by m.fix_time)))::int as gap_s,
             case when m.inside_n and (
                    lag(m.inside_n) over (
                        partition by m.place_kind, m.place_id, m.vehicle_id
                        order by m.fix_time) is distinct from true
                    or m.fix_time - lag(m.fix_time) over (
                        partition by m.place_kind, m.place_id, m.vehicle_id
                        order by m.fix_time) > make_interval(secs => p_max_gap_seconds)
                  ) then 1 else 0 end as is_start
        from _map_near m
    ) n
  ) g
  where grp_id > 0
  group by place_kind, place_id, place_code, place_name, vehicle_id, grp_id
  having count(*) filter (where inside_n) > 0;

  create temp table if not exists _map_merged (
    place_kind text, place_id uuid, place_code text, place_name text,
    vehicle_id uuid, device_id uuid, entered_at timestamptz, exited_at timestamptz,
    dwell_s integer, pts_n integer, max_depth double precision,
    min_gap_s integer, has_pair boolean
  );
  truncate _map_merged;
  insert into _map_merged
  select place_kind, place_id, place_code, place_name, vehicle_id,
         (array_agg(device_id order by entered_at))[1],
         min(entered_at), max(exited_at),
         sum(dwell_s)::int, sum(pts_n)::int, max(max_depth),
         least(min(min_gap_s), 100000)::int, bool_or(pts_n >= 2)
  from (
    select i.*,
           sum(i.is_new) over (partition by i.place_kind, i.place_id, i.vehicle_id
                               order by i.entered_at) as m_grp
    from (
      select i.*,
             case when extract(epoch from (i.entered_at - lag(i.exited_at) over (
                            partition by i.place_kind, i.place_id, i.vehicle_id
                            order by i.entered_at))) < 600
                   then 0 else 1 end as is_new
        from _map_island i
    ) i
  ) m
  group by place_kind, place_id, place_code, place_name, vehicle_id, m_grp;

  create temp table if not exists _map_kept (
    place_kind text, place_id uuid, place_code text, place_name text,
    vehicle_id uuid, device_id uuid, entered_at timestamptz, exited_at timestamptz,
    dwell_s integer, pts_n integer, max_depth double precision,
    min_gap_s integer, has_pair boolean
  );
  truncate _map_kept;

  -- ★ الإصلاح ①: دالة القرار صارت واحدة، وتُستخدم للتخزين والعدّ معاً — فلا يمكن أن
  --   يختلف «ما حُذف» عمّا أُبلغ عنه (كان هناك نسختان من نفس الشرط).
  --   وزيارة الشارع تحتاج مكوثاً حقيقياً: عبور الشارع بنقاط متفرّقة ليس مكوثاً.
  create temp table if not exists _map_cand (
    place_kind text, place_id uuid, place_code text, place_name text,
    vehicle_id uuid, device_id uuid, entered_at timestamptz, exited_at timestamptz,
    dwell_s integer, pts_n integer, max_depth double precision,
    min_gap_s integer, has_pair boolean, street_cover_s numeric, drop_code text
  );
  truncate _map_cand;

  insert into _map_cand
  with cand as (
    select m.*,
           coalesce((
             select sum(greatest(0, extract(epoch from (
                      least(m.exited_at, s.exited_at) - greatest(m.entered_at, s.entered_at)))))
               from _map_merged s
              where s.place_kind = 'street'
                and s.vehicle_id = m.vehicle_id
                and s.entered_at < m.exited_at
                and s.exited_at > m.entered_at
           ), 0) as street_cover_s
      from _map_merged m
  )
  select place_kind, place_id, place_code, place_name, vehicle_id, device_id,
         entered_at, exited_at, dwell_s, pts_n, max_depth, min_gap_s, has_pair,
         street_cover_s::numeric,
         case
           when dwell_s <= 0 then 'zero_dwell'
           when pts_n < 3    then 'too_few_points'
           -- ★ شارع بلا مكوث حقيقي = عبور. لا يُسجَّل زيارة مكوث.
           when place_kind = 'street' and dwell_s < p_min_dwell_seconds then 'street_transit'
           when place_kind = 'alley'
                and dwell_s > 0
                and street_cover_s::numeric / dwell_s >= 0.95 then 'street_covered'
           else null
         end as drop_code
    from cand;

  insert into _map_kept
  select place_kind, place_id, place_code, place_name, vehicle_id, device_id,
         entered_at, exited_at, dwell_s, pts_n, max_depth, min_gap_s, has_pair
    from _map_cand
   where drop_code is null;

  select count(*)::int into v_skipped from _map_cand where drop_code is not null;

  with decided as (
    select m.*,
           case when m.dwell_s >= p_min_dwell_seconds and m.pts_n >= 3 and m.has_pair
                then 'confirmed' else 'uncertain' end as v_status,
           case when m.pts_n < 3
                  then 'نقاط ' || m.pts_n || ' أقل من 3 — لا يتحقق شكل زيارة'
                when not m.has_pair
                  then 'لا تعاقب: كل الفاصل بين النقاط يتجاوز ' || p_max_gap_seconds || 'ث، فلا يمكن إثبات مكوث مستمر (زمن مكوث ' || m.dwell_s || 'ث)'
                when m.dwell_s < p_min_dwell_seconds
                  then 'مكوث ' || m.dwell_s || 'ث أقل من الحد ' || p_min_dwell_seconds || 'ث'
                else null end as v_reason
      from _map_kept m
  ), ins as (
    insert into public.map_visits
      (zone_id, vehicle_id, device_id, place_kind, place_id, place_code, place_name,
       placeday, seq, entered_at, exited_at, dwell_seconds, points_count,
       max_depth_m, status, reason)
    select p_zone, d.vehicle_id, d.device_id, d.place_kind, d.place_id, d.place_code, d.place_name,
           app.map_baghdad_day(d.entered_at),
           row_number() over (partition by d.vehicle_id, app.map_baghdad_day(d.entered_at)
                              order by d.entered_at)::smallint,
           d.entered_at, d.exited_at, d.dwell_s, d.pts_n,
           d.max_depth, d.v_status, d.v_reason
      from decided d
    on conflict (vehicle_id, place_kind, place_id, entered_at) do nothing
    returning 1
  )
  select count(*)::int into v_created from ins;

  -- ★ الإصلاح ②: الترقيم على مستوى (آلية × يوم) عبر **كل** الزونات.
  --   كان محدوداً بـ zone_id = p_zone، والبناء يعمل زوناً زوناً، فكل زون يبدأ من ١
  --   ويتكرّر seq داخل اليوم نفسه. seq معرَّفه أنه ترتيب الزمن لليوم، لا للزون.
  update public.map_visits v
     set seq = x.rn
    from (
      select id, row_number() over (partition by vehicle_id, placeday order by entered_at, id)::smallint as rn
        from public.map_visits
       where placeday between v_day_from and v_day_to
    ) x
   where v.id = x.id
     and v.seq is distinct from x.rn;

  select coalesce(sum(greatest(pts_n - 1, 0)), 0)::int into v_merged
    from _map_merged;

  visits_created := v_created;
  visits_merged := v_merged;
  places_scanned := v_places;
  skipped_visits := v_skipped;
  return;
end $$;

comment on function app.map_build_visits(uuid, timestamptz, timestamptz, uuid, integer, integer, boolean, boolean) is
  'بناء الزيارات لنافذة زمنية. الحذف بنطاق النافذة نفسها (entered_at) لا بنطاق اليوم البغدادي. ⑤: زيارة الشارع تحتاج مكوثاً ≥ الحد الأدنى (العبور ليس مكوثاً)، وseq يُرقَّم على مستوى الآلية×اليوم عبر كل الزونات.';

revoke all on function app.map_build_visits(uuid, timestamptz, timestamptz, uuid, integer, integer, boolean, boolean)
  from public, anon;
grant execute on function app.map_build_visits(uuid, timestamptz, timestamptz, uuid, integer, integer, boolean, boolean)
  to authenticated;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- ★ الإصلاح ③: app.visit_day_state قراءة فقط، لكنها ليست للزوّار غير المسجَّلين
-- ───────────────────────────────────────────────────────────────────────────────────────────
revoke all on function app.visit_day_state(date) from public, anon;
grant execute on function app.visit_day_state(date) to authenticated;

revoke all on function app.gps_history_daily_purge(boolean) from public, anon, authenticated;
revoke all on function app.gps_history_prune_unbuildable(int) from public, anon, authenticated;
revoke all on function app.visit_retention_enforce(int) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- تصحيح ما بُني بالفعل بعيوب ① و② — بلا حذف عشوائي:
--   · زيارة الشارع التي مكوثها أقل من ٦٠ ثانية: أُنتجت بقاعدة خاطئة، وتُبنى نافذتها من جديد.
--     نحذفها الآن لأنها قد لا تُعاد بناؤها إن كانت نافذتها قد انتهت وبُنيت.
--   · seq يُعاد حسابه ليوم كل زيارة موجودة.
-- ───────────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_transit int;
  v_seq_fixed int;
begin
  delete from public.map_visits v
   where v.place_kind = 'street'
     and coalesce(v.dwell_seconds, 0) < 60;
  get diagnostics v_transit = row_count;

  update public.map_visits v
     set seq = x.rn
    from (
      select id, row_number() over (partition by vehicle_id, placeday order by entered_at, id)::smallint as rn
        from public.map_visits
    ) x
   where v.id = x.id
     and v.seq is distinct from x.rn;
  get diagnostics v_seq_fixed = row_count;

  raise notice '⑤ تصحيح بيانات قائم: % زيارة عبور حُذفت، % seq صُحّح', v_transit, v_seq_fixed;
end $$;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- إثبات الإصلاحات — يفشل الترحيل إن عاد أي عيب
-- ───────────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_bad int;
  v_def text;
begin
  -- ① لا زيارة شارع بمكوث أقل من الحدّ
  select count(*) into v_bad from public.map_visits
   where place_kind = 'street' and coalesce(dwell_seconds, 0) < 60;
  if v_bad > 0 then
    raise exception 'FIX1_INCOMPLETE: بقي % زيارة شارع بأقل من ٦٠ ثانية', v_bad;
  end if;

  -- ② لا seq مكرّر لنفس (آلية × يوم)
  select coalesce(sum(n - 1), 0) into v_bad from (
    select vehicle_id, placeday, seq, count(*) n
      from public.map_visits group by 1, 2, 3 having count(*) > 1
  ) x;
  if v_bad > 0 then
    raise exception 'FIX2_INCOMPLETE: % تكرار في seq', v_bad;
  end if;

  -- ③ لا تنفيذ لـ anon
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app'
     and p.proname in ('map_build_visits', 'visit_day_state', 'visit_build_run_pending',
                       'gps_day_is_certified', 'gps_history_daily_purge',
                       'gps_history_prune_unbuildable', 'visit_retention_enforce')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_bad > 0 then
    raise exception 'FIX3_INCOMPLETE: % دالة ما زالت مفتوحة لـ anon', v_bad;
  end if;

  -- ④ الإصلاح نفسه موجود في كود الدالة، لا في البيانات وحدها
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.proname = 'map_build_visits';
  if position('street_transit' in v_def) = 0 then
    raise exception 'FIX1_NOT_IN_ENGINE: قاعدة العبور غير موجودة في تعريف المحرّك';
  end if;
  if position('where placeday between v_day_from and v_day_to' in v_def) = 0 then
    raise exception 'FIX2_NOT_IN_ENGINE: ترقيم seq ما زال محدوداً بالزون';
  end if;
  v_def := regexp_replace(v_def, '\s+', ' ', 'g');
  if position('v.entered_at >= p_from' in v_def) = 0
     or position('v.entered_at < p_to' in v_def) = 0 then
    raise exception 'BUILD_DELETE_SCOPE_LOST: نطاق الحذف لم يعد مربوطاً بالنافذة';
  end if;
end $$;
