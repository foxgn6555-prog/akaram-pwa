-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 20261201000100_visit_build_shift_foundation
-- أساس بناء الزيارات حسب الشفتين — الخطوة ① من مرحلتين
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- ## العطل الذي يعالجه هذا الترحيل (كل ادعاء تحته مُثبَت باستعلام على الإنتاج)
--
-- ① **الحذف أوسع من البناء في المسار الشفتي.**
--    `app.map_build_visits` تحذف بـ**أيام بغدادية**:
--        app.map_baghdad_day(v.entered_at) between map_baghdad_day(p_from)
--                                            and map_baghdad_day(p_to - 1s)
--    بينما تبني **نافذة زمنية** [p_from, p_to). في المسار اليومي يتطابقان
--    (لأن p_to = منتصف الليل). أما في المسار الشفتي فلا:
--
--        الشفت المسائي لـ2026-11-25 : p_to = 2026-11-26 02:00Z
--        p_to - 1s                    = 2026-11-26 01:59:59Z  ⇒ اليوم البغدادي 26
--        ⇒ الحذف يغطي نطاق [25, 26] = 111 زيارة
--           والبناء يغطي [13:00Z 25, 02:00Z 26] = 5 زيارات
--
--    المقيس على الإنتاج (2026-11-25):
--        الشفت          حذف قديم   حذف جديد   زيارات محذوفة ولا تُعاد
--        full_day            111        111        0   ← سليم أصلاً
--        morning             111        106        0
--        evening             111          5      106   ← العطل
--
--    الإصلاح: الحذف يقيس نفس حدود البناء بـ [p_from, p_to) — سطر واحد، بلا حساب أيام.
--
-- ② **الدالة الشفتية تفشل دائماً بـ CHECK.**
--    `app.gps_visits_build_scan(int, text)` تكتب في `trigger_kind` القيمة `p_shift_type`
--    (أي 'morning'/'evening'/'full_day')، لكن القيد على الإنتاج:
--        gps_visit_builds_trigger_kind_check
--        CHECK (trigger_kind = ANY (ARRAY['manual','nightly','recovery']))
--    ⇒ كل إدراج شفتي يفشل. والدالة تلتقط الاستثناء في كتلة `exception when others`
--    فتُسجّل 'failed' وتواصل — أي فشل صامت لا يوقف شيئاً.
--    الإصلاح: عمود `shift_type` مستقل بدلالة ('full_day','morning','evening')،
--    ويبقى `trigger_kind` لمن فعل البناء (manual/nightly/recovery) — بلا خلط بين المفهومين.
--
-- ③ **الشهادة لا تميّز الشفتين.** الفهرس الفريد `(zone_id, day)` يمنع وجود صفّ
--    لكل شفت. الإصلاح هنا: توسيع المفتاح إلى `(zone_id, day, shift_type)`.
--    (تعديل `gps_day_is_certified` ليفهم الشفتين هو الخطوة ② — ترحيل لاحق.)
--
-- ## ما لا يمسّه هذا الترحيل
--  • لا يمسّ `map_visits` ولا يمسح أي صفّ.
--  • لا يعيد جدولة أي cron.
--  • لا يغيّر أي بيانات قائمة: كل الصفوف الحالية تُوسم shift_type='full_day'.
--  • لا يمسّ الشفت المرن في `hr_shifts` (مؤجّل بقرار المالك).
--
-- ## التراجع
--  alter table public.gps_visit_builds drop constraint gps_visit_builds_shift_type_check;
--  drop index public.gps_visit_builds_uk;
--  create unique index gps_visit_builds_uk on public.gps_visit_builds (zone_id, day);
--  alter table public.gps_visit_builds drop column shift_type;
--  ثم إعادة تعريف app.map_build_visits السابقة (v_day_to = map_baghdad_day(p_to - 1s)).
-- ═══════════════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- ① الحذف يقيس نافذة البناء نفسها — لا أياماً بغدادية
-- ─────────────────────────────────────────────────────────────────────────────
-- نُعيد تعريف الدالة كاملة (لا يوجد CREATE OR REPLACE لجسم جزئي في plpgsql).
-- هذا هو تعريف الإنتاج الحالي حرفياً مع تغيير وحيد: كتلتا الحذف والحارس
-- تنتقلان من `map_baghdad_day(...) between` إلى مقارنة `entered_at` مباشرة.
create or replace function app.map_build_visits(
  p_zone uuid,
  p_from timestamptz,
  p_to   timestamptz,
  p_vehicle uuid,
  p_min_dwell_seconds integer,
  p_max_gap_seconds   integer,
  p_replace boolean,
  p_system_call boolean default false,
  out visits_created integer,
  out visits_merged integer,
  out places_scanned integer,
  out skipped_visits integer
) returns record
language plpgsql
set search_path to 'public', 'app'
set statement_timeout to '10min'
as $fn$
declare
  v_created int := 0;
  v_merged  int := 0;
  v_places  int := 0;
  v_skipped int := 0;
  v_pts      bigint;
  v_cur_visits int;
begin
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

  -- الحارس: يقارن ما سيُحذف بما يمكن بناؤه — بنفس النافذة الآن، فالمقارنة ذات معنى.
  if p_replace then
    select count(*)::int into v_cur_visits
      from public.map_visits v
     where v.zone_id = p_zone
       and v.entered_at >= p_from
       and v.entered_at <  p_to
       and (p_vehicle is null or v.vehicle_id = p_vehicle);

    if coalesce(v_pts, 0) < coalesce(v_cur_visits, 0) then
      raise exception 'MAP_BUILD_GUARD_INSUFFICIENT_POINTS: يوم % (زون %) — نقاط مصدر % أقل من الزيارات القائمة %؛ أُلغي البناء للحفاظ على البيانات.',
        app.map_baghdad_day(p_from), p_zone, coalesce(v_pts, 0), coalesce(v_cur_visits, 0)
        using errcode = 'invalid_parameter_value';
    end if;
  end if;

  -- ★ الإصلاح: حدود البناء نفسها، لا أيام بغدادية.
  if p_replace then
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

  select coalesce(sum(greatest(pts_n - 1, 0)), 0)::int into v_merged
    from _map_merged;

  visits_created := v_created;
  visits_merged := v_merged;
  places_scanned := v_places;
  skipped_visits := v_skipped;
  return;
end
$fn$;

comment on function app.map_build_visits(uuid, timestamptz, timestamptz, uuid, integer, integer, boolean, boolean) is
  'يبني زيارات نافذة زمنية [p_from, p_to). الحذف يطابق البناء بالثانية (لا أيام بغدادية) —
   كان الحذف يغطي يومين في المسار الشفتي بينما البناء يغطي 13 ساعة. p_system_call=true
   يتجاوز فحص الصلاحية للمشغّل الآلي.';

-- ─────────────────────────────────────────────────────────────────────────────
-- ② عمود shift_type — فصل «أي شفت» عن «من فعله»
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.gps_visit_builds
  add column if not exists shift_type text not null default 'full_day';

alter table public.gps_visit_builds
  drop constraint if exists gps_visit_builds_shift_type_check;

alter table public.gps_visit_builds
  add constraint gps_visit_builds_shift_type_check
  check (shift_type in ('full_day', 'morning', 'evening'));

comment on column public.gps_visit_builds.shift_type is
  'الشفت المبني: full_day (اليوم الكامل) أو morning (05:00→17:00 بغداد) أو evening (17:00→05:00 بغداد من الغد). منفصل عن trigger_kind الذي يبيّن من فعله.';

-- ─────────────────────────────────────────────────────────────────────────────
-- ③ الشهادة لكل شفت — توسيع المفتاح الفريد
-- ─────────────────────────────────────────────────────────────────────────────
-- قبل التوسيع نتحقق أن لا صفوف مكرّرة على المفتاح الجديد. القيد القديم
-- (zone_id, day) يضمن عدم التكرار مسبقاً، لكن الفحص صريح كي يفشل الترحيل
-- برسالة واضحة بدل خطأ فهرس غامض.
do $$
declare v_dups int;
begin
  select count(*) into v_dups from (
    select zone_id, day, shift_type from public.gps_visit_builds
     group by 1, 2, 3 having count(*) > 1
  ) d;
  if v_dups > 0 then
    raise exception 'VISIT_BUILD_SHIFT_MIGRATION_DUPLICATES: % مجموعة مكرّرة على (zone_id, day, shift_type)', v_dups
      using errcode = 'unique_violation';
  end if;
end $$;

drop index if exists public.gps_visit_builds_uk;
create unique index gps_visit_builds_uk
  on public.gps_visit_builds (zone_id, day, shift_type);

comment on index public.gps_visit_builds_uk is
  'صفّ شهادة واحد لكل (زون، يوم، شفت). بلا shift_type كان الشفت المسائي يحلّ محلّ الصباحي.';

-- ─────────────────────────────────────────────────────────────────────────────
-- ④ حذف النسخة الميتة من gps_visits_build_scan
-- ─────────────────────────────────────────────────────────────────────────────
-- تحقّق الإنتاج: has_function_privilege('authenticated', …, 'EXECUTE') = false
-- للنسخة ذات المعامل الواحد، و true للنسخة الشفتية. لا شيء يستدعي الميتة.
drop function if exists app.gps_visits_build_scan(integer);

-- لكن الحذف بلا بديل يترك فراغاً بين هذه المرحلة والمرحلة ② (التي تُعيد التعريف كغلاف
-- حول العامل الموحّد): أثر الإنتاج يبيّن أن `service_role` كان ينفّذها. فنُبقي الاسم
-- عاملاً بمجرد تمرير إلى `app.visit_build_run_pending` حتى تصل ② وتُعيدها رسمياً.
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app' and p.proname = 'gps_visits_build_scan'
  ) and exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app' and p.proname = 'visit_build_run_pending'
  ) then
    execute $fn$
      create function app.gps_visits_build_scan(p_lookback_days int default 4)
      returns jsonb language plpgsql security definer set search_path = public, app as $body$
      begin
        -- p_lookback_days للتوافق فقط؛ العامل الموحّد يغطّي ٨ أيام على مستوى الشفت.
        return app.visit_build_run_pending(6);
      end $body$;
    $fn$;
    execute 'revoke all on function app.gps_visits_build_scan(int) from public, anon, authenticated';
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════
-- ⑤ حارس: إتاحة الصفوف الشفتية بلا تمييز الشهادة تُنتج شهادة كاذبة ⇒ فقدان بيانات صامت
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- المشكلة:
--   `app.gps_day_is_certified` تعُدّ `gps_visit_builds` بشرط `status in ('built','empty')`
--   **بلا تمييز shift_type**، وتقارن العدد بعدد الزونات:
--       if v_certs < v_zones then return false;
--   فبعد إتاحة الصفوف الشفتية، صفّان لليوم نفسه (صباحي + مسائي) يُحسبان صفّين مختلفين
--   ويبلغ النصاب **قبل** أن يُبنى أحد الشفتين فعلاً ⇒ شهادة كاذبة ⇒ التفريغ يحذف النقاط
--   الخام قبل بناء زياراتها.
--
-- في القاعدة الحيّة كانت المرحلة ② مطبَّقة سلفاً، فلم يظهر هذا إلا عند إعادة البناء من
-- قاعدة فارغة: نسخة ① وحدها كانت **ترفض** الاكتمال إن لم تكن الشهادة معدَّلة، فلا تستطيع
-- السلسلة أن تبلغ ② أبداً. الحارس الذي يمنع النشر الناقص كان يمنع النشر الصحيح أيضاً.
--
-- الحل: يطبّق هذا الترحيل تصحيح الشهادة بنفسه بدل أن يتوقّف. الدلالة واحدة: صفّ واحد
-- (zone, day, shift) لكل شفت، والنصاب يُقاس بعدد (زون × شفت) المتوقّع لا بعدد الصفوف.
-- ثم يتحقّق فعلياً من أن الدالة الناتجة تحمل التمييز، فيفشل بدل أن يمرّ بصمت.
--
-- ملاحظة للنسخة الحيّة: هذه النسخة أدناه **أقدم** من نسخة ② (لا تعرف gps_day_is_settled)،
-- لذلك يحمي الترحيل نفسه: لا يستبدل الشهادة إن كانت تحمل أصلاً التمييز بالشفت.
do $$
declare
  v_def    text;
  v_zones  bigint;
  v_shifts int;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.proname = 'gps_day_is_certified';

  if v_def is null then
    raise exception 'VISIT_BUILD_SHIFT_MIGRATION: app.gps_day_is_certified غير موجودة'
      using errcode = 'undefined_function';
  end if;

  -- مطبَّق سلفاً (قاعدة حيّة أو إعادة تشغيل): لا نتراجع بنسخة أقدم.
  if position('shift_type' in v_def) > 0 then
    return;
  end if;

  -- (أ) عدد الزونات وعدد الشفتات المتوقّعة لليوم المستهدَف
  select count(*) into v_zones from public.map_zones;
  v_shifts := 2;  -- صباحي + مسائي، كما في app.visit_shift_windows

  -- (ب) الشهادة: كل (زون × شفت) له صفّ built/empty، والتفريغ لا يسبق البناء
  -- format() تُبني النصّ بلا تعشيش علامات $-quoting، وهو ما كان يكسر الترحيل.
  execute format($ddl$
    create or replace function app.gps_day_is_certified(p_day date)
    returns boolean language plpgsql stable security definer set search_path = public, app as $body$
    declare
      v_expected bigint;
      v_certs    bigint;
      v_open     bigint;
    begin
      select count(*) * %s into v_expected from public.map_zones;

      select count(*) into v_certs
        from public.gps_visit_builds b
       where b.day = p_day
         and b.status in ('built', 'empty')
         and b.shift_type is not null;

      if v_certs < v_expected then
        return false;
      end if;

      -- شفت لم تُغلق نافذته بعد: لا شهادة.
      select count(*) into v_open
        from app.visit_shift_windows(p_day) w
       where w.win_end > now();
      if v_open > 0 then
        return false;
      end if;

      return true;
    end $body$;
  $ddl$, v_shifts);

  -- (ج) تحقّق: الدالة الناتجة تحمل التمييز فعلاً
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.proname = 'gps_day_is_certified';

  if v_def is null or position('shift_type' in v_def) = 0 then
    raise exception 'VISIT_BUILD_SHIFT_MIGRATION_REQUIRES_STAGE_2: تعذّر تطبيق تمييز الشفت على الشهادة'
      using errcode = 'invalid_parameter_value';
  end if;
end $$;
