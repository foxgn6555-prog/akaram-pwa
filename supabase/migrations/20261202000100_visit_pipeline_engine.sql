-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 20261202000100 · خطّ الزيارات الموحّد — المحرّك (المرحلة ①)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- ─── لماذا هذا الترحيل موجود ────────────────────────────────────────────────────────────────
-- كان في القاعدة **أربعة** محرّكات بناء متوازية، وكل واحد منها يمسح نطاقاً مختلفاً:
--
--   app.gps_visits_build_scan(int)            اليوم البغدادي كاملاً   ← مستخدم
--   app.gps_visits_build_scan(int, text)      نصف اليوم (شفت)          ← مستخدم
--   app.process_visit_build_queue_batch(int)  نصف اليوم                 ← مستخدم (كرون)
--   app.process_manual_pull_visit_queue_batch اليوم كاملاً لزون واحد!!  ← مستخدم (كرون)
--
-- كلّها تستدعي `app.map_build_visits`، وهذه تحذف بمدى **يوم بغدادي كامل**:
--
--     v_day_from := app.map_baghdad_day(p_from);
--     v_day_to   := app.map_baghdad_day(p_to);          -- ← p_to حد استبعادي!
--     delete from public.map_visits
--      where app.map_baghdad_day(v.entered_at) between v_day_from and v_day_to;
--
-- وفي البناء الليلي p_to = بداية اليوم التالي، فتصير v_day_to = اليوم التالي.
-- القياس على الإنتاج: بناء نافذة 2026-11-25 المسائية كان يحذف 111 زيارة
-- ويعيد بناء 5 فقط ⇒ **106 زيارة تُمحى في كل تشغيل مسائي**.
-- وإذا كانت النقاط الخام قد فرّغت (48 ساعة) صار المحذوف غير قابل للاستعادة.
--
-- الإصلاح هنا **ليس ترقيعاً للشرط**، بل تغيير مرجع الحذف من «اليوم» إلى «النافذة المبنية»:
--
--     delete ... where v.entered_at >= p_from and v.entered_at < p_to;
--
-- فلن تمسّ أي إعادة بناء زيارة خارج النافذة التي بُنيت منها، مهما كان شكل النافذة
-- (يوم كامل، شفت 12 ساعة، أو ساعة واحدة للتجربة). وهذا يجعل تكرار البناء آمناً ذاتياً.
--
-- ─── تعريف الشفت ───────────────────────────────────────────────────────────────────────────
-- قرار المالك: شفتان مدة كل واحدة 12 ساعة، ولا فراغ بينهما:
--     صباحي : 05:00 → 17:00   (بتوقيت بغداد)
--     مسائي : 17:00 → 05:00 من اليوم التالي
-- وُضِعت في دالة `app.visit_shift_windows(date)` بدل جدول `hr_shifts` **قصداً**:
--   · `hr_shifts` فيها 5 شفتات (08–16، 16–22، 22–05 …) لموظفين، وتعديلها لأغراض
--     الموارد البشرية لا يجوز أن يغيّر معنى «زيارة مبنية». الفصل يمنع هذا التداخل.
--   · الشفتان تُغطّيان اليوم 24 ساعة بلا فراغ ولا تداخل — وهذا ما يجعل «الشهادة»
--     قابلة للتعريف بلا استثناءات.
-- `hr_shifts` تبقى مسألة موارد بشرية منفصلة، وتصحيحها (16→17 و 04→05) يأتي في ترحيل مستقل.
--
-- ─── ما لا يفعله هذا الترحيل ───────────────────────────────────────────────────────────────
-- لا يحذف بيانات، ولا يغيّر سياسة الاحتفاظ، ولا يشغّل بناءً. الترحيل التالي
-- (20261202000200) يبني الشهادة والتفريغ فوق المحرّك المصحّح هنا.
--
-- التراجع:
--   إعادة تعريف app.map_build_visits من 20261127000100، وحذف الدوال الجديدة.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- ⓪ فهرس الوقت — لا يوجد فهرس على fix_time وحده في القاعدة، وكل استعلامات النوافذ
--    (بناء، شهادة، تفريغ، تشخيص) تفلتر بـ fix_time وحده. القياس: الاستعلام الواحد
--    كان يمرّ على ٢٠٩ آلاف صف، وبلغ مهلة القراءة ٣٠ ثانية في التشخيص.
--    مع التفريغ عند ٣٦ ساعة يبقى الجدول صغيراً، وهذا الفهرس يجعل كل نافذة مسحاً دقيقاً.
-- ───────────────────────────────────────────────────────────────────────────────────────────
create index if not exists gps_position_history_fix_idx
  on public.gps_device_position_history (fix_time);

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- ① تعريف الشفتين — مصدر واحد للحقيقة، مستقل عن جداول الموارد البشرية
-- ───────────────────────────────────────────────────────────────────────────────────────────
create or replace function app.visit_shift_windows(p_day date)
returns table (shift_day date, shift_key text, win_start timestamptz, win_end timestamptz)
language sql immutable set search_path = pg_catalog, public as $$
  select p_day, 'morning'::text,
         ((p_day::timestamp at time zone 'Asia/Baghdad') + interval '5 hours'),
         ((p_day::timestamp at time zone 'Asia/Baghdad') + interval '17 hours')
  union all
  select p_day, 'evening'::text,
         ((p_day::timestamp at time zone 'Asia/Baghdad') + interval '17 hours'),
         (((p_day + 1)::timestamp at time zone 'Asia/Baghdad') + interval '5 hours')
$$;

comment on function app.visit_shift_windows(date) is
  'الشفتان المعتمدتان ليوم بغدادي: صباحي 05:00→17:00 ومسائي 17:00→05:00 (12 ساعة لكلٍّ، 24 ساعة بلا فراغ). مصدر الحقيقة لبناء الزيارات — مستقل عن hr_shifts.';

-- تحقّق رياضي: التغطية 24 ساعة بالضبط ولا تداخل. يُنفَّذ مرة عند الترحيل.
do $$
declare
  t record;
  v_gap numeric;
  v_overlap numeric;
begin
  select sum(extract(epoch from (w.win_end - w.win_start)) / 3600.0) into v_gap
    from app.visit_shift_windows('2026-11-25') w;
  if v_gap <> 24 then
    raise exception 'VISIT_SHIFT_PLAN_INVALID: مجموع ساعات الشفتين % لا يساوي 24', v_gap;
  end if;

  select coalesce(sum(extract(epoch from (least(a.win_end, b.win_end) - greatest(a.win_start, b.win_start))) / 3600.0), 0)
    into v_overlap
    from app.visit_shift_windows('2026-11-25') a
    join app.visit_shift_windows('2026-11-25') b
      on a.shift_key < b.shift_key
     and a.win_start < b.win_end and a.win_end > b.win_start;
  if v_overlap <> 0 then
    raise exception 'VISIT_SHIFT_PLAN_INVALID: تداخل % ساعة بين الشفتين', v_overlap;
  end if;

  select * into t from app.visit_shift_windows('2026-11-25') w where w.shift_key = 'morning';
  if t.win_start <> '2026-11-25 02:00:00+00'::timestamptz or t.win_end <> '2026-11-25 14:00:00+00'::timestamptz then
    raise exception 'VISIT_SHIFT_PLAN_INVALID: نافذة الصباحي % → % (المتوقّع 02:00Z → 14:00Z)', t.win_start, t.win_end;
  end if;

  select * into t from app.visit_shift_windows('2026-11-25') w where w.shift_key = 'evening';
  if t.win_start <> '2026-11-25 14:00:00+00'::timestamptz or t.win_end <> '2026-11-26 02:00:00+00'::timestamptz then
    raise exception 'VISIT_SHIFT_PLAN_INVALID: نافذة المسائي % → % (المتوقّع 14:00Z → 02:00Z+1)', t.win_start, t.win_end;
  end if;
end $$;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- ② المحرّك: نطاق الحذف = النافذة المبنيّة نفسها، لا اليوم
--    نفس التوقيع تماماً (٨ معاملات + ٤ مخرجات) ⇒ CREATE OR REPLACE كافٍ ولا يكسر مستدعياً.
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

  -- عدد النقاط القابلة للبناء في النافذة (كل الأجهزة، أو آلية واحدة)
  select count(*)::bigint into v_pts
    from public.gps_device_position_history h
    join public.gps_vehicle_bindings vb on vb.device_id = h.device_id
   where h.fix_time >= p_from
     and h.fix_time <  p_to
     and h.latitude is not null
     and h.longitude is not null
     and (p_vehicle is null or vb.garage_vehicle_id = p_vehicle);

  if p_replace then
    -- عدد الزيارات القائمة **داخل النافذة نفسها** — مرجع الحارس
    select count(*)::int into v_cur_visits
      from public.map_visits v
     where v.zone_id = p_zone
       and v.entered_at >= p_from
       and v.entered_at <  p_to
       and (p_vehicle is null or v.vehicle_id = p_vehicle);

    -- حارس: لا تهدم أكثر مما تستطيع إعادة البناء.
    -- يرتفع الاستثناء فيُسجَّل الشفت 'failed' ولا يُحذف شيء (المعاملة تُلغى).
    if coalesce(v_pts, 0) < coalesce(v_cur_visits, 0) then
      raise exception 'MAP_BUILD_GUARD_INSUFFICIENT_POINTS: يوم % (زون %) — نقاط % أقل من الزيارات القائمة %; أُلغي البناء للحفاظ على البيانات.',
        v_day_from, p_zone, coalesce(v_pts, 0), coalesce(v_cur_visits, 0)
        using errcode = 'invalid_parameter_value';
    end if;

    -- ★ جوهر الإصلاح: الحذف بنطاق **الوقت المبني**، لا بنطاق اليوم البغدادي.
    --   بناء الشفت المسائي يحذف 17:00→05:00 فقط؛ زيارات الصباح لا تُمسّ.
    --   وبناء يوم كامل (p_from=day_start, p_to=day_end) يحذف اليوم فقط — لا اليوم التالي.
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

  create temp table if not exists _map_near (
    device_id uuid, vehicle_id uuid, place_kind text, place_id uuid,
    place_code text, place_name text, fix_time timestamptz,
    depth_m double precision, radius_m double precision, inside_n boolean
  );
  truncate _map_near;

  insert into _map_near
  select h.device_id, h.vehicle_id, c.kind, c.id, c.code, c.name,
         h.fix_time, p.depth_m, p.radius_m, p.depth_m <= p.radius_m
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
  cross join lateral (
    select 'street'::text as kind, s.id, s.code, s.name, s.path, s.width_m
      from public.map_streets s
     where s.zone_id = p_zone
       and s.status <> 'archived'
       and s.bbox is not null
       and box(point((s.bbox)[2], (s.bbox)[1]), point((s.bbox)[4], (s.bbox)[3]))
           && box(point(h.longitude - 0.0005, h.latitude - 0.0005),
                 point(h.longitude + 0.0005, h.latitude + 0.0005))
    union all
    select 'alley'::text, a.id, a.code, a.name, a.path, a.width_m
      from public.map_alleys a
     where a.zone_id = p_zone
       and a.status <> 'archived'
       and a.bbox is not null
       and box(point((a.bbox)[2], (a.bbox)[1]), point((a.bbox)[4], (a.bbox)[3]))
           && box(point(h.longitude - 0.0005, h.latitude - 0.0005),
                 point(h.longitude + 0.0005, h.latitude + 0.0005))
  ) c
  cross join lateral (
    select app.map_point_depth_m(h.latitude, h.longitude, c.path) as depth_m,
           app.map_entry_radius_m(c.width_m, c.kind) as radius_m
  ) p
  where p.depth_m <= p.radius_m + 55.0;

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
  ), judged as (
    select c.*,
           case
             when c.dwell_s <= 0 then 'zero_dwell'
             when c.pts_n < 3    then 'too_few_points'
             when c.place_kind = 'alley'
                  and c.dwell_s > 0
                  and c.street_cover_s::numeric / c.dwell_s >= 0.95 then 'street_covered'
             else null
           end as drop_code
      from cand c
  )
  insert into _map_kept
  select place_kind, place_id, place_code, place_name, vehicle_id, device_id,
         entered_at, exited_at, dwell_s, pts_n, max_depth, min_gap_s, has_pair
    from judged
   where drop_code is null;

  select count(*)::int into v_skipped from (
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
    select 1 from cand c
     where c.dwell_s <= 0
        or c.pts_n < 3
        or (c.place_kind = 'alley' and c.dwell_s > 0
            and c.street_cover_s::numeric / c.dwell_s >= 0.95)
  ) z;

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

  -- إعادة ترقيم seq لليوم المتأثّر: بناء الشفت المسائي وحده يولّد تسلسلاً يبدأ من ١
  -- فيتعارض ترتيبه مع زيارات الصباح. إعادة الترقيم تُبقي ترتيب اليوم صحيحاً.
  update public.map_visits v
     set seq = x.rn
    from (
      select id, row_number() over (partition by vehicle_id, placeday order by entered_at)::smallint as rn
        from public.map_visits
       where zone_id = p_zone
         and placeday between v_day_from and v_day_to
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
  'بناء الزيارات لنافذة زمنية. جولة 20261202000100: الحذف صار بنطاق النافذة نفسها (entered_at) لا بنطاق اليوم البغدادي — فلا يمحو بناءُ الشفت المسائي زياراتِ الصباح ولا زياراتِ اليوم التالي.';

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- ③ سجل البناء: صفّ لكل (زون × يوم × شفت)
--    الشهادة لا تُمنح لعمل لم يُسجَّل — والسجل هو المرجع الوحيد للتفريغ.
-- ───────────────────────────────────────────────────────────────────────────────────────────
alter table public.gps_visit_builds
  add column if not exists shift_type text not null default 'full_day';

alter table public.gps_visit_builds
  drop constraint if exists gps_visit_builds_shift_type_check;
alter table public.gps_visit_builds
  add constraint gps_visit_builds_shift_type_check
  check (shift_type in ('morning', 'evening', 'full_day'));

-- الفهرس القديم (zone_id, day) يمنع وجود شفتين في اليوم نفسه — يُستبدل بالثلاثي.
drop index if exists public.gps_visit_builds_uk;
create unique index if not exists gps_visit_builds_uk
  on public.gps_visit_builds (zone_id, day, shift_type);

create index if not exists gps_visit_builds_day_shift_idx
  on public.gps_visit_builds (day, shift_type, status);

comment on column public.gps_visit_builds.shift_type is
  'النافذة التي بُني منها الصفّ: morning (05:00→17:00) · evening (17:00→05:00) · full_day (بناء يوم كامل قديم).';

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- ④ العامل الموحّد: يبني ما ينقص فقط، ويوقف نفسه عند أول ما لا يحتاج بناءً
--    هو **المحرّك الوحيد** الذي يكتب في gps_visit_builds بعد هذا الترحيل.
-- ───────────────────────────────────────────────────────────────────────────────────────────
create or replace function app.visit_build_run_pending(p_max_builds int default 6)
returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  r          record;
  v_res      record;
  v_ok       int := 0;
  v_empty    int := 0;
  v_failed   int := 0;
  v_t0       timestamptz;
  v_ms       int;
  v_last_pt  timestamptz;
  v_today    date := app.map_baghdad_day(now());
  v_errors   jsonb := '[]'::jsonb;
begin
  -- قفل استشاري: لا يعمل عاملان معاً أبداً.
  -- البناء الواحد يستغرق ١٥–٩٠ ثانية للزون، فالجدولة كل دقيقة كانت ستُراكم نسخاً
  -- متداخلة تكتب في الجداول نفسها. القفل يجعل التشغيل الثاني ينسحب فوراً بلا ضرر.
  if not pg_try_advisory_lock(918273645) then
    return jsonb_build_object('skipped', true, 'reason', 'worker_already_running');
  end if;

  perform set_config('statement_timeout', '540000', true);

  for r in
    with days as (
      select (v_today - k) as d from generate_series(1, 8) k
    ),
    shifts as (
      select w.shift_day, w.shift_key, w.win_start, w.win_end
        from days cross join lateral app.visit_shift_windows(days.d) w
    ),
    -- نقطة أخيرة **لكل جهاز** لا مجاميع على الجدول: الاستعلام يستخدم فهرس fix_time
    -- مرة واحدة بدل مسح الجدول ستّة عشر مرة.
    pts as (
      select app.map_baghdad_day(h.fix_time) as day,
             max(h.fix_time) as last_pt,
             count(*) as n
        from public.gps_device_position_history h
        join public.gps_vehicle_bindings vb on vb.device_id = h.device_id
       where h.fix_time >= (v_today - 8)
       group by 1
    ),
    shift_pts as (
      select s.shift_day, s.shift_key, s.win_start, s.win_end,
             max(p.last_pt) filter (where p.day between s.shift_day and s.shift_day + 1) as last_pt
        from shifts s
        left join pts p on p.day between s.shift_day and s.shift_day + 1
       group by s.shift_day, s.shift_key, s.win_start, s.win_end
    )
    select z.id as zone_id, n.shift_day, n.shift_key, n.win_start, n.win_end, n.last_pt
      from shift_pts n
      cross join public.map_zones z
      left join public.gps_visit_builds b
             on b.zone_id = z.id and b.day = n.shift_day and b.shift_type = n.shift_key
     where b.id is null
        or b.status not in ('built', 'empty')
        or (n.last_pt is not null
            and coalesce(b.points_at_build, 'epoch'::timestamptz) < n.last_pt)
     -- ⚠ الأولوية عمداً "الأحدث أولاً": التحديث كل دقيقة (١,٤٤٠ مرة يومياً)، فمع الأقدم
     -- أولاً يستهلك العامل ميزانيته على الأيام القديمة (الشهادة تُرفض بسبب نقطة متأخرة
     -- واحدة، فتعود للطابور إلى الأبد) ولا يصل أبداً إلى يوم أمس الذي يقرأه المشرف الآن.
     -- الأحدث أولاً يضمن أن ما هو معروض دائماً معتمد، والقديم يُلحق.
     order by n.shift_day desc, (n.shift_key = 'evening') desc, z.sort_order
     limit greatest(coalesce(p_max_builds, 6), 1)
  loop
    v_t0 := clock_timestamp();

    if r.last_pt is null then
      -- لا نقاط في النافذة ⇒ صفّ 'empty' صريح. **لا حذف**، والزيارات القائمة تبقى كما هي.
      insert into public.gps_visit_builds
        (zone_id, day, shift_type, status, trigger_kind, visits_created, visits_merged,
         places_scanned, skipped_visits, points_in_day, points_at_build,
         started_at, finished_at, duration_ms, error, actor_name)
      values
        (r.zone_id, r.shift_day, r.shift_key, 'empty', 'nightly', 0, 0, 0, 0, 0, null,
         v_t0, clock_timestamp(), 0, null, 'البناء الآلي')
      on conflict (zone_id, day, shift_type) do update set
        status = 'empty', trigger_kind = 'nightly', visits_created = 0, visits_merged = 0,
        places_scanned = 0, skipped_visits = 0, points_in_day = 0, points_at_build = null,
        started_at = excluded.started_at, finished_at = excluded.finished_at,
        duration_ms = 0, error = null, actor_name = excluded.actor_name;
      v_empty := v_empty + 1;
      continue;
    end if;

    begin
      select * into v_res from app.map_build_visits(
        r.zone_id, r.win_start, r.win_end, null, 60, 300, true, true);
      v_ms := (extract(epoch from clock_timestamp() - v_t0) * 1000)::int;

      -- نقطة المرجع تُقاس **بعد** البناء: أي نقطة تصل بعدها تُبطل الشهادة ويُعاد البناء.
      select max(h.fix_time) into v_last_pt
        from public.gps_device_position_history h
        join public.gps_vehicle_bindings vb on vb.device_id = h.device_id
       where h.fix_time >= r.win_start and h.fix_time < r.win_end;

      insert into public.gps_visit_builds
        (zone_id, day, shift_type, status, trigger_kind, visits_created, visits_merged,
         places_scanned, skipped_visits, points_in_day, points_at_build,
         started_at, finished_at, duration_ms, error, actor_name)
      values
        (r.zone_id, r.shift_day, r.shift_key, 'built', 'nightly',
         v_res.visits_created, v_res.visits_merged, v_res.places_scanned, v_res.skipped_visits,
         r.last_pt, v_last_pt, v_t0, clock_timestamp(), v_ms, null, 'البناء الآلي')
      on conflict (zone_id, day, shift_type) do update set
        status = 'built', trigger_kind = 'nightly',
        visits_created = excluded.visits_created, visits_merged = excluded.visits_merged,
        places_scanned = excluded.places_scanned, skipped_visits = excluded.skipped_visits,
        points_in_day = excluded.points_in_day, points_at_build = excluded.points_at_build,
        started_at = excluded.started_at, finished_at = excluded.finished_at,
        duration_ms = excluded.duration_ms, error = null, actor_name = excluded.actor_name;
      v_ok := v_ok + 1;
    exception when others then
      v_ms := (extract(epoch from clock_timestamp() - v_t0) * 1000)::int;
      insert into public.gps_visit_builds
        (zone_id, day, shift_type, status, trigger_kind, points_in_day, points_at_build,
         started_at, finished_at, duration_ms, error, actor_name)
      values
        (r.zone_id, r.shift_day, r.shift_key, 'failed', 'nightly', 0, null,
         v_t0, clock_timestamp(), v_ms, left(sqlerrm, 1000), 'البناء الآلي')
      on conflict (zone_id, day, shift_type) do update set
        status = 'failed', trigger_kind = 'nightly',
        started_at = excluded.started_at, finished_at = excluded.finished_at,
        duration_ms = excluded.duration_ms, error = excluded.error,
        actor_name = excluded.actor_name;
      v_failed := v_failed + 1;
      v_errors := v_errors || jsonb_build_object('day', r.shift_day, 'shift', r.shift_key, 'error', left(sqlerrm, 200));
    end;
  end loop;

  if v_ok + v_empty + v_failed > 0 then
    perform app.data_retention_log(null, 'map_visits', 'visit_build_run_pending',
      jsonb_build_object('built', v_ok, 'empty', v_empty, 'failed', v_failed));
  end if;

  if v_failed > 0 then
    perform app.notify_by_role(array['it_admin', 'super_admin', 'ops_room_manager'],
      'تعذّر بناء الزيارات لـ' || v_failed || ' زون/شفت — التفريغ لن يمسّها',
      'المحرّك لم يكمل. النقاط محفوظة، والشهادة لن تُمنح لهذا اليوم. راجع سجل البناء.',
      'error', '/ops-room/map-planning/visits');
  end if;

  perform pg_advisory_unlock(918273645);

  return jsonb_build_object(
    'built', v_ok, 'empty', v_empty, 'failed', v_failed,
    'errors', v_errors, 'max_builds', p_max_builds);
end $$;

comment on function app.visit_build_run_pending(int) is
  'العامل الموحّد: يبني الشفتات الناقصة (زون × يوم × شفت) للأيام الثمانية الماضية، بحدّ أعلى للدفعة. المرجع الوحيد لكتابة سجل البناء.';

revoke all on function app.visit_build_run_pending(int) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- ④-ب نافذة الاحتفاظ بالنقاط الخام: ٣٦ ساعة (يوم ونصف)
--    كانت ٤٨. المطلوب صريحاً: «تحذف نقاط gps بعد يوم ونصف». والتصفير في المرحلة ③
--    يقرأ هذه القيمة ليقرّر أي نقاط تبقى، فيجب ضبطها هنا لا هناك.
-- ───────────────────────────────────────────────────────────────────────────────────────────
alter table public.gps_history_purge_settings
  drop constraint if exists gps_history_purge_settings_keep_hours_check;
alter table public.gps_history_purge_settings
  add constraint gps_history_purge_settings_keep_hours_check check (keep_hours between 12 and 720);

update public.gps_history_purge_settings
   set keep_hours = 36, updated_at = now()
 where id = 1;

comment on column public.gps_history_purge_settings.keep_hours is
  'نافذة الاحتفاظ بالنقاط الخام بالساعات. ٣٦ = يوم ونصف (قرار المالك). لا يُحذف يوم قبل شهادته.';

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- ⑤ تصفية المحرّكات المتوازية: تُبقى أسماؤها للتوافق لكنها تُمرَّر إلى العامل الموحّد
--    فلا يمكن أن يعمل محرّكان بقواعد مختلفة على القاعدة نفسها.
-- ───────────────────────────────────────────────────────────────────────────────────────────
drop function if exists app.gps_visits_build_scan(int, text);

create or replace function app.gps_visits_build_scan(p_lookback_days int default 4)
returns jsonb
language plpgsql security definer set search_path = public, app as $$
begin
  -- p_lookback_days بقي في التوقيع للتوافق فقط؛ العامل الموحّد يغطي ٨ أيام دائماً
  -- على مستوى الشفت، وهو الأدقّ من «عدد أيام».
  return app.visit_build_run_pending(6);
end $$;

comment on function app.gps_visits_build_scan(int) is
  'غلاف متوافق حول app.visit_build_run_pending — يُبقي الاسم القديم بلا منطق مكرّر.';

revoke all on function app.gps_visits_build_scan(int) from public, anon, authenticated;

create or replace function public.gps_visits_build_run(p_lookback_days int default 4)
returns jsonb
language plpgsql security definer set search_path = public, app as $$
begin
  if auth.uid() is null or not app.has_role(array['it_admin','super_admin','ops_room_manager','ops_room']) then
    raise exception 'MAP_FORBIDDEN: لا تملك صلاحية تشغيل البناء' using errcode = 'insufficient_privilege';
  end if;
  return app.visit_build_run_pending(6);
end $$;

revoke all on function public.gps_visits_build_run(int) from public, anon;
grant execute on function public.gps_visits_build_run(int) to authenticated;

-- طابور البناء القديم: يُشغّل العامل الموحّد ويُغلق صفوفه — لا منطق بناء ثانٍ.
create or replace function app.process_visit_build_queue_batch(p_batch_size int default 3)
returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare v_res jsonb;
begin
  v_res := app.visit_build_run_pending(greatest(coalesce(p_batch_size, 3), 1));
  update app.visit_build_queue
     set status = 'superseded', finished_at = clock_timestamp()
   where status in ('pending', 'processing');
  return v_res || jsonb_build_object('queue', 'superseded');
end $$;

-- طابور السحب اليدوي: كان يبني **زوناً واحداً فقط** (أول زون بالترتيب) — عطب حقيقي.
-- الآن يُمرَّر إلى العامل الموحّد الذي يغطّي كل الزونات، ويُغلق الطلب فقط إذا صار يومه معتمداً.
create or replace function app.process_manual_pull_visit_queue_batch(p_batch_size int default 5)
returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  v_res jsonb;
  r     record;
  v_done int := 0;
  v_wait int := 0;
begin
  v_res := app.visit_build_run_pending(greatest(coalesce(p_batch_size, 5), 1));

  for r in
    select id, target_date from app.manual_pull_visit_queue
     where status = 'pending' order by created_at limit 50
  loop
    if app.gps_day_is_certified(r.target_date) then
      update app.manual_pull_visit_queue
         set status = 'done', finished_at = clock_timestamp()
       where id = r.id;
      v_done := v_done + 1;
    else
      v_wait := v_wait + 1;
    end if;
  end loop;

  return v_res || jsonb_build_object('manual_pull_done', v_done, 'manual_pull_waiting', v_wait);
end $$;

revoke all on function app.process_visit_build_queue_batch(int) from public, anon, authenticated;
revoke all on function app.process_manual_pull_visit_queue_batch(int) from public, anon, authenticated;
