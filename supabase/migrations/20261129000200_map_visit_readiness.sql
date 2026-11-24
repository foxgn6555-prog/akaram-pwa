-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 20261129000200 — تشخيص جاهزية الزيارات: «لماذا الصفحة فارغة؟» يُجاب برقم لا بحدس
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- المشكلة المقيسة على الإنتاج (2026-11-24):
--
--   · 26,749 نقطة GPS في اليوم، منها 18,928 (**٧٠.٨٪**) لأجهزة **غير مربوطة** بأي
--     آلية. ومحرّك الزيارات يبدأ من `gps_vehicle_bindings` فيتجاهلها كلها.
--   · صفر صفّ في `gps_visit_builds` (سجل الشهادات) ⇒ `gps_day_is_certified` ترجع
--     false دائماً ⇒ لا يوم محميّ من التفريغ، والتفريغ الليلي حذف ٤٧–٥٠ ألف صف/ليلة.
--   · صفحة «زيارات الآلية» تقول «لا آلية لها زيارات في هذا اليوم» بلا سبب — فيظنّ
--     المشرف أن السحب تعطّل، والحقيقة أن البيانات وصلت ولم تُربط.
--
-- ⚠ حدّ مهم في النموذج: **نقاط GPS ليست منسوبة إلى زون** (`gps_device_position_history`
--   لا يحمل `zone_id`)؛ نسبة النقطة إلى زون تحدث داخل المحرّك هندسياً. لذلك:
--     · مجاميع النقاط والربط والشهادة = **مستوى الأسطول** (صفّ واحد `level='fleet'`).
--     · مجاميع الزيارات وحالة البناء = **لكل زون**.
--   خلط الاثنين كان سيُظهر «٣١ نقطة» لكل زون — رقم واحد مكرّر عشرة مرات يُوهم
--   أن لكل زون نقاطه، وهو عكس الحقيقة.
--
-- رموز السبب (`reason`) وترتيب فحصها هو **نفس ترتيب المحرّك**:
--   ① no_points                 — لم يصل شيء من المزوّد لذلك اليوم
--   ② unbound_devices           — وصلت لكن أجهزتها بلا آلية ⇒ لا تدخل المحرّك أبداً
--   ③ needs_build               — نقاط مربوطة ولم يُستخرج منها شيء
--   ④ visits_without_certificate— زيارات موجودة بلا شهادة ⇒ اليوم غير محميّ
--   ⑤ built                     — الشهادة مسجّلة
--   ⑥ certificate_stale         — بُني، لكن وصلت نقاط **أحدث من البناء** ⇒ الشهادة
--                                 لا تُعتمد (`gps_day_is_certified` تشترط أن يشمل
--                                 البناء أحدث نقطة في اليوم). هذا هو حال الإنتاج:
--                                 صفوف بناء موجودة واليوم يبقى «غير محميّ»، فيبدو
--                                 الأمر تناقضاً بين شريحة البناء وشريحة الحماية.
--
-- ما لا تفعله: لا تبني، لا تحذف، لا تكتب صفاً واحداً. قراءة فقط بأدوار القراءة.
--
-- التراجع: drop function if exists public.map_visit_readiness(date, uuid);
-- ═══════════════════════════════════════════════════════════════════════════════════════

drop function if exists public.map_visit_readiness(date, uuid);

create or replace function public.map_visit_readiness(p_day date, p_zone uuid default null)
returns table (
  level          text,
  day            date,
  zone_id        uuid,
  zone_name      text,
  points_total   bigint,
  points_bound   bigint,
  points_unbound bigint,
  devices_total  bigint,
  devices_bound  bigint,
  visits_total   bigint,
  build_status   text,
  build_at       timestamptz,
  certified      boolean,
  reason         text,
  reason_label   text
)
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_from      timestamptz;
  v_to        timestamptz;
  v_pts       bigint := 0;
  v_pts_bound bigint := 0;
  v_devs      bigint := 0;
  v_devs_bnd  bigint := 0;
  v_cert      boolean := false;
  v_certs     int     := 0;
  v_zones     int     := 0;
  v_newest    timestamptz;
  v_built_to  timestamptz;
begin
  perform public.map_require_reader();

  if p_day is null then
    raise exception 'MAP_VISIT_DAY_REQUIRED' using errcode = 'invalid_parameter_value';
  end if;

  select b.day_start, b.day_end into v_from, v_to from app.map_day_bounds(p_day) b;

  -- ── مجاميع الأسطول (غير منسوبة إلى زون بطبيعتها) ──
  select count(*),
         count(vb.id),
         count(distinct h.device_id),
         count(distinct vb.device_id)
    into v_pts, v_pts_bound, v_devs, v_devs_bnd
    from public.gps_device_position_history h
    left join public.gps_vehicle_bindings vb on vb.device_id = h.device_id
   where h.fix_time >= v_from and h.fix_time < v_to;

  v_cert := app.gps_day_is_certified(p_day);

  -- لماذا الشهادة غير معتمدة رغم وجود صفوف بناء؟ نقرأ الشرطين أنفسهما اللذين
  -- يقرأهما app.gps_day_is_certified، بدل تخمين السبب في الواجهة.
  select count(*) into v_zones from public.map_zones;
  select count(*) into v_certs from public.gps_visit_builds g
   where g.day = p_day and g.status in ('built', 'empty');
  select max(h.fix_time) into v_newest
    from public.gps_device_position_history h
   where app.map_baghdad_day(h.fix_time) = p_day;
  select min(coalesce(g.points_at_build, 'epoch'::timestamptz)) into v_built_to
    from public.gps_visit_builds g
   where g.day = p_day and g.status = 'built';

  -- ── صفّ الأسطول: سبب عام يشرح فراغ الشاشة قبل أي تفصيل ──
  return query
  select
    'fleet'::text,
    p_day,
    null::uuid,
    null::text,
    v_pts,
    v_pts_bound,
    v_pts - v_pts_bound,
    v_devs,
    v_devs_bnd,
    (select count(*) from public.map_visits v where v.placeday = p_day),
    (select string_agg(distinct g.status, ' · ') from public.gps_visit_builds g where g.day = p_day),
    (select max(coalesce(g.finished_at, g.started_at)) from public.gps_visit_builds g where g.day = p_day),
    v_cert,
    case
      when v_pts = 0 then 'no_points'
      when v_pts_bound = 0 then 'unbound_devices'
      when v_cert then 'ok'
      when v_certs > 0 and v_newest is not null and coalesce(v_built_to >= v_newest, false) is false
        then 'certificate_stale'
      when v_certs < v_zones then 'needs_build'
      else 'ok'
    end,
    case
      when v_pts = 0 then
        'لم تصل أي نقطة لهذا اليوم — راجع السحب من المزوّد (lvn-gps-sync كل دقيقة)'
      when v_pts_bound = 0 then
        format('%s نقطة وصلت من %s جهازاً، وكلها غير مربوطة بأي آلية — محرّك الزيارات يبدأ من الربط فلا يرى شيئاً. اربط الأجهزة من صفحة بيانات GPS',
               v_pts, v_devs)
      when not v_cert and v_certs > 0 and v_newest is not null
           and coalesce(v_built_to >= v_newest, false) is false then
        format('البناء مسجَّل لكن وصلت نقاط أحدث منه (%s) — الشهادة لا تُعتمد حتى يُعاد الاستخراج',
               to_char(v_newest at time zone 'Asia/Baghdad', 'HH24:MI'))
      when not v_cert and v_certs < v_zones then
        format('بُني %s من %s زوناً فقط لهذا اليوم — الشهادة تُمنح حين تُبنى كل الزونات', v_certs, v_zones)
      when v_pts_bound * 10 < v_pts * 7 then
        format('%s نقطة من %s غير مربوطة (%s%%) — ستُستثنى من الزيارات. اربط الأجهزة المتبقية ليكتمل التقرير',
               v_pts - v_pts_bound, v_pts,
               round(100.0 * (v_pts - v_pts_bound) / greatest(v_pts, 1), 1))
      else
        format('%s نقطة مربوطة من %s (%s%%) — الربط سليم',
               v_pts_bound, v_pts,
               round(100.0 * v_pts_bound / greatest(v_pts, 1), 1))
    end;

  -- ── صفوف الزونات: الزيارات وحالة البناء ──
  return query
  select
    'zone'::text,
    p_day,
    z.id,
    z.name,
    v_pts,                      -- مجاميع الأسطول (متطابقة في كل صف، بلا ادّعاء نسبة)
    v_pts_bound,
    v_pts - v_pts_bound,
    v_devs,
    v_devs_bnd,
    coalesce(vt.vn, 0),
    g.status,
    coalesce(g.finished_at, g.started_at),
    v_cert,
    case
      when v_pts = 0 then 'no_points'
      when v_pts_bound = 0 then 'unbound_devices'
      when g.status in ('built', 'empty') then 'built'
      when coalesce(vt.vn, 0) > 0 then 'visits_without_certificate'
      else 'needs_build'
    end,
    case
      when v_pts = 0 then 'لا نقاط لذلك اليوم — لا شيء يُبنى'
      when v_pts_bound = 0 then 'لا نقاط مربوطة — المحرّك لا يرى هذا الزون'
      when g.status = 'built' then
        format('بُني: %s زيارة، %s نقطة داخلة', coalesce(g.visits_created, 0), coalesce(g.points_in_day, 0))
      when g.status = 'empty' then 'بُني وشُهد أنه بلا نقاط'
      when g.status = 'failed' then format('فشل البناء: %s', coalesce(g.error, 'بلا سبب مسجَّل'))
      when coalesce(vt.vn, 0) > 0 then
        format('%s زيارة موجودة بلا شهادة بناء — اليوم غير محميّ من التفريغ، أعد الاستخراج ليُسجَّل', vt.vn)
      else 'جاهز ولم يُستخرج — اضغط «استخراج الزيارات»'
    end
  from public.map_zones z
  left join (
    select v.zone_id, count(*) as vn from public.map_visits v where v.placeday = p_day group by v.zone_id
  ) vt on vt.zone_id = z.id
  left join public.gps_visit_builds g on g.zone_id = z.id and g.day = p_day
  where p_zone is null or z.id = p_zone
  order by z.sort_order, z.name;
end $$;

comment on function public.map_visit_readiness(date, uuid) is
  'تشخيص سبب فراغ صفحة الزيارات: صفّ أسطول (نقاط/ربط/شهادة) + صف لكل زون (زيارات/بناء). قراءة فقط.';

revoke all on function public.map_visit_readiness(date, uuid) from public, anon;
grant execute on function public.map_visit_readiness(date, uuid) to authenticated;
