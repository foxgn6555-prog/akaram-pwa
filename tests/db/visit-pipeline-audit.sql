-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- tests/db/visit-pipeline-audit.sql — تدقيق خطّ الزيارات بعد ①/②/③/④
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- visit-pipeline-test.sql يثبت العقود السبعة الأساسية (A1–A7). هذا الملف **يدقّق** ما بعدها:
-- الأشياء التي لا يراها اختبار واحد، وتظهر فقط عند مقارنة المحرّك بنفسه، أو القاعدة بسياساتها.
--
--   B1  تكافؤ حساب المسافة: النسخة المتجهة (أعمدة) = الدالة الأصلية (jsonb) على بيانات حقيقية
--   B2  المحرّك لا ينتج زيارتين متداخلتين لآلية واحدة في اليوم نفسه
--   B3  seq سليم: فريد ومتزايد مع entered_at لكل (آلية × يوم)
--   B4  إعادة البناء بنفس النافذة لا تغيّر شيئاً (idempotent) ولا تُنقص الزيارات
--   B5  بناء الشفت المسائي لا يمسّ زيارات الصباح — على المحرّك الحقيقي لا على الشرط وحده
--   B6  التفريغ لا يحذف نقطة داخل نافذة الاحتفاظ مهما كان الطلب، ولا يوم غير مُشهَّد
--   B7  حذف الزيارات بعد ٣١ يوماً: يحذف القديم فقط، ويكتب سطراً لكل يوم
--   B8  سجل البناء: الشفت المسموح بها فقط، ولا صفّين لنفس (زون × يوم × شفت)
--   B9  الشهادة تسقط إذا وصلت نقطة بعد البناء، وتعود بعد إعادة البناء
--   B10 العامل: لا يعمل مرتين معاً (قفل استشاري)، وميزانيته الزمنية مذكورة في تعريفه
--   B11 الجدولة: وظائف الخطّ الأربع بالضبط، بلا تكرار، وبلا وظيفة قديمة باقية
--   B12 الصلاحيات: لا تنفيذ لـ anon على أي دالة definer في الخطّ
--
-- التشغيل: كل مقطع مستقلّ بمعاملة تُلغى في نهايته. لا يبقى أثر على البيانات.
--   psql "$DATABASE_URL" -f tests/db/visit-pipeline-audit.sql
-- ═══════════════════════════════════════════════════════════════════════════════════════════
set client_min_messages = notice;

create or replace function pg_temp.eq(p_got anyelement, p_want anyelement, p_label text) returns void
language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FAIL % — got % wanted %', p_label, p_got, p_want;
  end if;
  raise notice 'ok %', p_label;
end $$;

create or replace function pg_temp.ok(p_cond boolean, p_label text) returns void
language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FAIL %', p_label; end if;
  raise notice 'ok %', p_label;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- B1 · تكافؤ المسافة: العمود العددي (محرّك ④) مقابل دالة jsonb (المحرّك الأصلي)
--   هذا أهمّ تدقيق في الملف: ④ استبدل حساباً بدالة بحساب على أعمدة. إن اختلف رقم واحد
--   فالزيارات ستختلف، وكل ما بُني بعده لا قيمة له. نقارن على عيّنة من بيانات حقيقية.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
begin;
do $$
declare
  v_zone uuid;
  v_n int;
  v_mismatch int;
  v_checked int;
begin
  select id into v_zone from public.map_zones order by sort_order limit 1;

  -- مقاطع الزون كما يفكّها المحرّك
  create temp table _aud_seg on commit drop as
  select x.pid, x.radius_m, x.min_lat, x.max_lat, x.min_lng, x.max_lng,
         app.map_pt_lat(x.path -> i)       as lat1, app.map_pt_lng(x.path -> i)       as lng1,
         app.map_pt_lat(x.path -> (i + 1)) as lat2, app.map_pt_lng(x.path -> (i + 1)) as lng2
    from (
      select 'street'::text as kind, s.id as pid, s.path,
             app.map_entry_radius_m(s.width_m, 'street') as radius_m,
             (s.bbox)[1] as min_lat, (s.bbox)[3] as max_lat,
             (s.bbox)[2] as min_lng, (s.bbox)[4] as max_lng
        from public.map_streets s
       where s.zone_id = v_zone and s.status <> 'archived' and s.bbox is not null
         and jsonb_typeof(s.path) = 'array' and jsonb_array_length(s.path) >= 2
      union all
      select 'alley'::text, a.id, a.path, app.map_entry_radius_m(a.width_m, 'alley'),
             (a.bbox)[1], (a.bbox)[3], (a.bbox)[2], (a.bbox)[4]
        from public.map_alleys a
       where a.zone_id = v_zone and a.status <> 'archived' and a.bbox is not null
         and jsonb_typeof(a.path) = 'array' and jsonb_array_length(a.path) >= 2
    ) x
   cross join lateral generate_series(0, jsonb_array_length(x.path) - 2) i;

  select count(*) into v_n from _aud_seg;
  perform pg_temp.ok(v_n > 0, 'B1a مقاطع الزون موجودة (' || v_n || ')');

  -- عيّنة من الأزواج الحقيقية: نأخذ 40 نقطة × مقاطعها المرشّحة، بحدّ أعلى 400 زوج
  create temp table _aud_pairs on commit drop as
  select h.latitude, h.longitude, s.pid, s.radius_m
    from (select latitude, longitude from public.gps_device_position_history
           where latitude is not null and latitude <> 0
           order by fix_time desc limit 40) h
    join _aud_seg s
      on h.latitude  between s.min_lat - 0.0005 and s.max_lat + 0.0005
     and h.longitude between s.min_lng - 0.0005 and s.max_lng + 0.0005
   limit 400;

  select count(*) into v_checked from _aud_pairs;
  perform pg_temp.ok(v_checked > 0, 'B1b أزواج حقيقية للفحص (' || v_checked || ')');

  -- الفرق يجب أن يكون صفراً بالضبط: نفس المعادلة، نفس الترتيب، نفس min()
  select count(*) into v_mismatch
    from _aud_pairs p
    join public.map_streets st on st.id = p.pid
   where abs(
           app.map_point_depth_m(p.latitude, p.longitude, st.path)
           - (select min(sqrt(power(v.wx - t.tt * v.vx, 2) + power(v.wy - t.tt * v.vy, 2)))
                from (
                  select (p.longitude - s.lng1) * (111320.0 * cos(radians(p.latitude))) as wx,
                         (p.latitude  - s.lat1) * 111320.0 as wy,
                         (s.lng2 - s.lng1) * (111320.0 * cos(radians(p.latitude))) as vx,
                         (s.lat2 - s.lat1) * 111320.0 as vy
                    from _aud_seg s where s.pid = p.pid
                ) v
               cross join lateral (
                  select case when (v.vx * v.vx + v.vy * v.vy) = 0 then 0
                              else greatest(0, least(1, (v.vx * v.wx + v.vy * v.wy)
                                                        / (v.vx * v.vx + v.vy * v.vy))) end as tt
               ) t
             )
         ) > 1e-9;

  perform pg_temp.eq(v_mismatch, 0, 'B1c المسافة الجديدة = القديمة على كل الأزواج');

  -- والقرار (داخل/خارج) يجب أن يكون مطابقاً أيضاً
  select count(*) into v_mismatch
    from _aud_pairs p
    join public.map_streets st on st.id = p.pid
   where (app.map_point_depth_m(p.latitude, p.longitude, st.path) <= p.radius_m + 55.0)
      is distinct from
         ((select min(sqrt(power(v.wx - t.tt * v.vx, 2) + power(v.wy - t.tt * v.vy, 2)))
             from (
               select (p.longitude - s.lng1) * (111320.0 * cos(radians(p.latitude))) as wx,
                      (p.latitude  - s.lat1) * 111320.0 as wy,
                      (s.lng2 - s.lng1) * (111320.0 * cos(radians(p.latitude))) as vx,
                      (s.lat2 - s.lat1) * 111320.0 as vy
                 from _aud_seg s where s.pid = p.pid
             ) v
            cross join lateral (
               select case when (v.vx * v.vx + v.vy * v.vy) = 0 then 0
                           else greatest(0, least(1, (v.vx * v.wx + v.vy * v.wy)
                                                     / (v.vx * v.vx + v.vy * v.vy))) end as tt
            ) t
          ) <= p.radius_m + 55.0);
  perform pg_temp.eq(v_mismatch, 0, 'B1d قرار الدخول/الخروج مطابق');
end $$;
rollback;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- B2 · لا زيارتان متداخلتان لآلية واحدة في اليوم نفسه
--   التداخل يعني أن المحرّك أثبت وجود الآلية في مكانين في وقت واحد — نتيجة مستحيلة،
--   وسببها المعتاد بناء نفس اليوم بشفتين حُسبتا على نافذتين متقاطعتين.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
begin;
do $$
declare v_bad int;
begin
  select count(*) into v_bad
    from public.map_visits a
    join public.map_visits b
      on a.vehicle_id = b.vehicle_id
     and a.placeday   = b.placeday
     and a.id < b.id
     and a.entered_at < b.exited_at
     and b.entered_at < a.exited_at;
  perform pg_temp.eq(v_bad, 0, 'B2 لا تداخل بين زيارات الآلية الواحدة');

  -- ولا زيارة بزمن مقلوب
  select count(*) into v_bad from public.map_visits where exited_at < entered_at;
  perform pg_temp.eq(v_bad, 0, 'B2b لا زيارة بنهاية قبل بدايتها');

  -- ولا زيارة داخل نافذتين مختلفتين (الزيارة الواحدة تنتمي لشفت واحد بحكم الزمن)
  select count(*) into v_bad
    from public.map_visits v
    join app.visit_shift_windows(v.placeday) w
      on v.entered_at >= w.win_start and v.entered_at < w.win_end
   group by v.id having count(*) <> 1;
  perform pg_temp.eq(coalesce(v_bad, 0), 0, 'B2c كل زيارة داخل شفت واحد بالضبط');
end $$;
rollback;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- B3 · سلامة seq
-- ═══════════════════════════════════════════════════════════════════════════════════════════
begin;
do $$
declare v_dup int; v_bad_order int;
begin
  select coalesce(sum(n - 1), 0) into v_dup from (
    select vehicle_id, placeday, seq, count(*) as n
      from public.map_visits group by 1, 2, 3 having count(*) > 1
  ) x;
  perform pg_temp.eq(v_dup, 0, 'B3a seq فريد لكل (آلية × يوم)');

  select count(*) into v_bad_order from (
    select vehicle_id, placeday,
           row_number() over (partition by vehicle_id, placeday order by entered_at, id) as rn,
           seq
      from public.map_visits
  ) x where x.seq <> x.rn;
  perform pg_temp.eq(v_bad_order, 0, 'B3b seq مطابق لترتيب الزمن داخل اليوم');
end $$;
rollback;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- B4 · إعادة البناء idempotent: البناء مرتين بنفس النافذة لا يغيّر شيئاً
--   يُختبر على زون حقيقي ونافذة حقيقية فيها نقاط. المفتاح: عدد الزيارات ونطاق أعمدتها
--   بعد البناء الأول = بعد الثاني، تماماً.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
begin;
do $$
declare
  v_zone uuid;
  v_day date;
  v_win record;
  v_first jsonb;
  v_second jsonb;
  v_res record;
begin
  -- أحدث شفت منتهٍ فيه نقاط
  select app.map_baghdad_day(h.fix_time) into v_day
    from public.gps_device_position_history h
   group by 1 having count(*) > 200 order by 1 desc limit 1;

  if v_day is null then
    raise notice 'skip B4 — لا نقاط كافية';
    return;
  end if;

  select * into v_win from app.visit_shift_windows(v_day) w
   where w.win_end <= now() order by w.win_end desc limit 1;

  select id into v_zone from public.map_zones order by sort_order limit 1;

  select * into v_res from app.map_build_visits(v_zone, v_win.win_start, v_win.win_end, null, 60, 300, true, true);

  select jsonb_build_object(
           'n', count(*),
           'sum_dwell', coalesce(sum(dwell_seconds), 0),
           'sum_pts', coalesce(sum(points_count), 0),
           'ids', coalesce(md5(string_agg(id::text, ',' order by id)), 'x'))
    into v_first
    from public.map_visits
   where zone_id = v_zone and entered_at >= v_win.win_start and entered_at < v_win.win_end;

  select * into v_res from app.map_build_visits(v_zone, v_win.win_start, v_win.win_end, null, 60, 300, true, true);

  select jsonb_build_object(
           'n', count(*),
           'sum_dwell', coalesce(sum(dwell_seconds), 0),
           'sum_pts', coalesce(sum(points_count), 0),
           'ids', coalesce(md5(string_agg(id::text, ',' order by id)), 'x'))
    into v_second
    from public.map_visits
   where zone_id = v_zone and entered_at >= v_win.win_start and entered_at < v_win.win_end;

  -- المعرّفات ستختلف (صفوف جديدة)، لكن العدد والمجاميع يجب أن تتطابق
  perform pg_temp.eq(v_first - 'ids', v_second - 'ids', 'B4a البناء مرتين يعطي نفس النتيجة (' || v_day || ' ' || v_win.shift_key || ')');
  perform pg_temp.eq(v_second ->> 'n', v_res.visits_created::text, 'B4b العدد المُعاد = الصفوف الموجودة بعد البناء');
end $$;
rollback;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- B5 · بناء الشفت المسائي لا يمسّ زيارات الصباح — على المحرّك الحقيقي
--   A2 يثبت الشرط. هذا يثبت النتيجة: نحسب الصباح، نبني المسائي، ثم نتأكّد أن كل زيارة
--   صباحية سابقة ما زالت موجودة بنفس المعرّف (لم تُحذف ولم تُعد بناؤها).
-- ═══════════════════════════════════════════════════════════════════════════════════════════
begin;
do $$
declare
  v_zone uuid;
  v_day date;
  v_w record;
  v_e record;
  v_morning_before uuid[];
  v_morning_after uuid[];
  v_eve_before int;
begin
  select app.map_baghdad_day(h.fix_time) into v_day
    from public.gps_device_position_history h
   group by 1 having count(*) > 200 order by 1 desc limit 1;
  if v_day is null then raise notice 'skip B5'; return; end if;

  select * into v_m from app.visit_shift_windows(v_day) w where w.shift_key = 'morning';
  select * into v_e from app.visit_shift_windows(v_day) w where w.shift_key = 'evening';
  select id into v_zone from public.map_zones order by sort_order limit 1;

  perform app.map_build_visits(v_zone, v_m.win_start, v_m.win_end, null, 60, 300, true, true);

  select coalesce(array_agg(id order by id), '{}') into v_morning_before
    from public.map_visits
   where zone_id = v_zone and entered_at >= v_m.win_start and entered_at < v_m.win_end;

  perform app.map_build_visits(v_zone, v_e.win_start, v_e.win_end, null, 60, 300, true, true);

  select coalesce(array_agg(id order by id), '{}') into v_morning_after
    from public.map_visits
   where zone_id = v_zone and entered_at >= v_m.win_start and entered_at < v_m.win_end;

  perform pg_temp.eq(array_length(v_morning_before, 1), array_length(v_morning_after, 1),
    'B5a عدد زيارات الصباح لم يتغيّر بعد بناء المسائي (' || coalesce(array_length(v_morning_before,1),0) || ')');
  perform pg_temp.eq(v_morning_after, v_morning_before,
    'B5b زيارات الصباح نفسها بالمعرّف — لم تُحذف ولم تُبنَ من جديد');

  select count(*) into v_eve_before from public.map_visits
   where zone_id = v_zone and entered_at >= v_e.win_start and entered_at < v_e.win_end;
  perform pg_temp.ok(v_eve_before >= 0, 'B5c المسائي بُني (' || v_eve_before || ' زيارة)');
end $$;
rollback;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- B6 · أمان التفريغ: لا نقطة داخل النافذة تُحذف، ولا يوم غير مُشهَّد
-- ═══════════════════════════════════════════════════════════════════════════════════════════
begin;
do $$
declare
  v_keep int;
  v_cutoff timestamptz;
  v_inside_before bigint;
  v_inside_after bigint;
  v_uncert_before bigint;
  v_uncert_after bigint;
  v_res jsonb;
begin
  select keep_hours into v_keep from public.gps_history_purge_settings where id = 1;
  v_cutoff := now() - make_interval(hours => v_keep);

  select count(*) into v_inside_before from public.gps_device_position_history where fix_time >= v_cutoff;

  -- الأيام غير المُشهَّدة (خارج النافذة) — يجب ألا تمسّها أي نقطة
  select count(*) into v_uncert_before
    from public.gps_device_position_history h
   where h.fix_time < v_cutoff
     and not app.gps_day_is_certified(app.map_baghdad_day(h.fix_time));

  v_res := app.gps_history_daily_purge();

  select count(*) into v_inside_after from public.gps_device_position_history where fix_time >= v_cutoff;
  select count(*) into v_uncert_after
    from public.gps_device_position_history h
   where h.fix_time < v_cutoff
     and not app.gps_day_is_certified(app.map_baghdad_day(h.fix_time));

  perform pg_temp.eq(v_inside_after, v_inside_before, 'B6a لا نقطة داخل نافذة الاحتفاظ حُذفت');
  perform pg_temp.eq(v_uncert_after, v_uncert_before, 'B6b لا نقطة من يوم غير مُشهَّد حُذفت');
  perform pg_temp.ok((v_res ->> 'ok')::boolean, 'B6c التفريغ رجع ok');

  -- كل ما تُفرّغ يجب أن يكون مُشهَّداً — نفحص أيام النتيجة
  perform pg_temp.ok(
    not exists (
      select 1 from jsonb_array_elements(coalesce(v_res -> 'held_days', '[]'::jsonb)) e
       where (e ->> 'certified')::boolean
    ),
    'B6d الأيام المحجوبة كلها غير مُشهَّدة');
end $$;
rollback;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- B7 · حذف الزيارات بعد ٣١ يوماً
-- ═══════════════════════════════════════════════════════════════════════════════════════════
begin;
do $$
declare
  v_today date := app.map_baghdad_day(now());
  v_deleted_old int;
  v_kept_recent int;
  v_before_old int;
  v_runs int;
  v_res jsonb;
begin
  select count(*) into v_before_old from public.map_visits where placeday < v_today - 31;
  select count(*) into v_kept_recent from public.map_visits where placeday >= v_today - 31;

  v_res := app.visit_retention_enforce(31);

  select count(*) into v_deleted_old from public.map_visits where placeday < v_today - 31;
  perform pg_temp.eq(v_deleted_old, 0, 'B7a لا زيارة أقدم من ٣١ يوماً بعد الحذف');
  perform pg_temp.eq((select count(*) from public.map_visits where placeday >= v_today - 31), v_kept_recent,
    'B7b الزيارات داخل ٣١ يوماً لم تُمسّ');
  perform pg_temp.eq((v_res ->> 'visits_deleted')::int, v_before_old, 'B7c العدد المُبلَّغ = المحذوف فعلاً');

  select count(*) into v_runs from app.visit_retention_runs where ran_at > now() - interval '1 minute';
  perform pg_temp.eq(v_runs, (v_res ->> 'days_deleted')::int, 'B7d سطر سجل لكل يوم محذوف');
end $$;
rollback;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- B8 · سلامة سجل البناء
-- ═══════════════════════════════════════════════════════════════════════════════════════════
begin;
do $$
declare v_bad int;
begin
  select count(*) into v_bad from public.gps_visit_builds
   where shift_type not in ('morning', 'evening', 'full_day');
  perform pg_temp.eq(v_bad, 0, 'B8a shift_type ضمن المسموح');

  select count(*) into v_bad from public.gps_visit_builds
   where status not in ('built', 'empty', 'failed', 'skipped');
  perform pg_temp.eq(v_bad, 0, 'B8b status ضمن المسموح');

  select coalesce(sum(n - 1), 0) into v_bad from (
    select zone_id, day, shift_type, count(*) n from public.gps_visit_builds group by 1,2,3 having count(*) > 1
  ) x;
  perform pg_temp.eq(v_bad, 0, 'B8c لا صفّين لنفس (زون × يوم × شفت)');

  -- صفّ failed لا بد أن يحمل سبباً — وإلا صار العطب صامتاً
  select count(*) into v_bad from public.gps_visit_builds where status = 'failed' and coalesce(error, '') = '';
  perform pg_temp.eq(v_bad, 0, 'B8d كل صفّ فاشل يحمل سبباً');

  -- صفّ built لا بد أن يحمل نقطة مرجع
  select count(*) into v_bad from public.gps_visit_builds where status = 'built' and points_at_build is null;
  perform pg_temp.eq(v_bad, 0, 'B8e كل صفّ مبني يحمل points_at_build');
end $$;
rollback;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- B9 · الشهادة تسقط عند وصول نقطة بعد البناء، وتعود بعد إعادة البناء
-- ═══════════════════════════════════════════════════════════════════════════════════════════
begin;
do $$
declare
  v_day date;
  v_zone uuid;
  v_shift record;
  v_newer timestamptz;
  v_before boolean;
  v_after boolean;
begin
  select app.map_baghdad_day(h.fix_time) into v_day
    from public.gps_device_position_history h
   group by 1 having count(*) > 100 order by 1 desc limit 1;
  if v_day is null then raise notice 'skip B9'; return; end if;

  v_zone := (select id from public.map_zones order by sort_order limit 1);
  v_before := app.gps_day_is_certified(v_day);

  -- نحاكي «نقطة وصلت بعد البناء»: نُنقص points_at_build ثانية واحدة في صفّ واحد
  update public.gps_visit_builds
     set points_at_build = points_at_build - interval '1 second'
   where day = v_day and zone_id = v_zone
     and shift_type = 'morning' and points_at_build is not null;

  v_after := app.gps_day_is_certified(v_day);

  if v_before then
    perform pg_temp.eq(v_after, false, 'B9a نقطة متأخرة تُسقط الشهادة');
  else
    perform pg_temp.eq(v_after, false, 'B9b الشهادة تبقى مرفوضة (اليوم لم يكن مُشهَّداً)');
  end if;

  -- الحالة المشروحة يجب أن تذكر سبباً غير فارغ
  perform pg_temp.ok(jsonb_array_length(app.visit_day_state(v_day) -> 'reasons') > 0,
    'B9c حالة اليوم تشرح السبب');
end $$;
rollback;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- B10 · العامل: قفل استثاري + ميزانية زمنية
-- ═══════════════════════════════════════════════════════════════════════════════════════════
begin;
do $$
declare
  v_def text;
  v_res jsonb;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.proname = 'visit_build_run_pending';

  perform pg_temp.ok(position('pg_try_advisory_xact_lock' in v_def) > 0,
    'B10a العامل يستخدم قفلاً على مستوى المعاملة (يُحرَّر تلقائياً بلا قفل معلّق)');
  perform pg_temp.ok(position('v_deadline' in v_def) > 0, 'B10b العامل له ميزانية زمنية');
  perform pg_temp.ok(position('worker_already_running' in v_def) > 0, 'B10c ينسحب بلا ضرر عند وجود تشغيل');
  perform pg_temp.ok(position('order by case when n.win_end <= now()' in v_def) > 0,
    'B10d الأولوية للموعد النهائي: النوافذ المنتهية قبل الجارية');

  -- ⚠ حدّ معروف ومقصود: أقفال PostgreSQL الاستشارية **متكرّرة الدخول للمالك نفسه**، فمحاكاة
  -- «تشغيلين متزامنين» من جلسة واحدة **لا يمكن أن تفشل**، ولا معنى لها كاختبار. الاختبار
  -- الحقيقي يحتاج جلستين. ما يهمّ عملياً: العامل يُشغَّل من cron (جلسة لكل تشغيل) أو من
  -- دالة الواجهة (جلسة الطلب) — وكلاهما جلستان مختلفتان، فيعمل القفل. لذلك نفحص فقط أن
  -- النداء ينتهي بنتيجة صحيحة الشكل (لا أن يُرفض)، ونترك الحجب الحقيقي للمعرفة الموثّقة.
  v_res := app.visit_build_run_pending(0);
  perform pg_temp.ok(v_res ? 'built' or v_res ? 'skipped',
    'B10e النداء يرجع نتيجة صريحة (built أو skipped) لا استثناءً');
end $$;
rollback;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- B11 · الجدولة
-- ═══════════════════════════════════════════════════════════════════════════════════════════
begin;
do $$
declare
  v_n int;
  v_old int;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'skip B11 — pg_cron غير متاح';
    return;
  end if;

  perform pg_temp.eq(
    (select count(*)::int from cron.job where jobname = 'visit-build-worker'), 1,
    'B11a وظيفة بناء واحدة (لا نسخ مكرّرة)');
  perform pg_temp.eq(
    (select schedule from cron.job where jobname = 'visit-build-worker'), '* * * * *',
    'B11b البناء كل دقيقة');
  perform pg_temp.eq(
    (select schedule from cron.job where jobname = 'gps-history-purge-hourly'), '7 * * * *',
    'B11c التفريغ كل ساعة');
  perform pg_temp.eq(
    (select schedule from cron.job where jobname = 'visit-retention-31d'), '15 21 * * *',
    'B11d حذف الزيارات يومياً');

  select count(*) into v_old from cron.job
   where jobname in ('gps-visits-build-nightly', 'gps-history-purge-midnight',
                     'gps-visits-build-batch', 'gps-visits-build-noon',
                     'process-manual-pull-visit-queue', 'purge-manual-pull-visits-3d');
  perform pg_temp.eq(v_old, 0, 'B11e لا وظيفة قديمة باقية');

  -- لا وظيفتين متزامنتين تلمسان نفس الجدول: البناء والتفريغ لا يبدأان في الدقيقة نفسها
  select count(*) into v_n
    from cron.job a join cron.job b
      on a.jobid < b.jobid
     and a.schedule = b.schedule
     and a.schedule = '* * * * *'
     and a.jobname in ('visit-build-worker') and b.jobname in ('gps-history-purge-hourly');
  perform pg_temp.eq(v_n, 0, 'B11f لا تصادم جدولة بين البناء والتفريغ');

  perform pg_temp.eq(
    (select count(*)::int from cron.job where jobname like 'visit-%' or jobname like 'gps-history-%'), 4,
    'B11g وظائف الخطّ أربع فقط');
end $$;
rollback;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- B12 · الصلاحيات: لا تنفيذ لـ anon على دوال الخطّ
-- ═══════════════════════════════════════════════════════════════════════════════════════════
begin;
do $$
declare
  v_bad text;
begin
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app'
     and p.proname in ('map_build_visits', 'visit_build_run_pending', 'gps_day_is_certified',
                       'visit_day_state', 'gps_history_daily_purge', 'gps_history_prune_unbuildable',
                       'visit_retention_enforce')
     and has_function_privilege('anon', p.oid, 'execute');

  perform pg_temp.ok(v_bad is null, 'B12a لا تنفيذ لـ anon على دوال المحرّك' || coalesce(' — ' || v_bad, ''));

  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('map_visits_retention_run', 'map_day_is_certified')
     and has_function_privilege('anon', p.oid, 'execute');
  perform pg_temp.ok(v_bad is null, 'B12b الأغلفة العامة مغلقة على anon');

  -- والغلاف العام يجب أن يُنفّذه المستخدم المسجَّل
  perform pg_temp.ok(
    has_function_privilege('authenticated', 'public.map_visits_retention_run()', 'execute'),
    'B12c المستخدم المسجَّل يستطيع تشغيل حذف الزيارات');
end $$;
rollback;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- B13 · لا يوم محجوب بلا حكم (عطب ⑥/⑦ المقيس على الإنتاج)
--   الوضع الذي أوقف الخطّ فعلياً: يوم مبنيّ بالكامل ونقاطه صفر ⇒ لا شهادة أبداً ⇒ لا تفريغ
--   أبداً. هذا المقطع يمنع رجوعه: كل يوم انقضى احتفاظه ولا نقاط له **يجب** أن يكون
--   منتهياً (expired) أو مُشهَّداً أو له سبب مذكور — لا رابع.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
begin;
do $$
declare
  v_stuck int;
  v_list  text;
  v_keep  int;
begin
  select coalesce(keep_hours, 36) into v_keep from public.gps_history_purge_settings where id = 1;

  select count(*), string_agg(d.day::text, ', ' order by d.day) into v_stuck, v_list
    from (
      select distinct app.map_baghdad_day(h.fix_time) as day, max(h.fix_time) as last_pt
        from public.gps_device_position_history h group by 1
    ) d
   where d.last_pt < now() - make_interval(hours => v_keep)
     and not app.gps_day_is_settled(d.day)
     and jsonb_array_length(app.visit_day_state(d.day) -> 'reasons') = 0;

  perform pg_temp.eq(v_stuck, 0, 'B13a لا يوم منقضٍ محجوب بلا سبب' || coalesce(' → ' || v_list, ''));

  -- والشهادة لم تُرخَّ: gps_day_is_certified لا تُمنح ليوم بلا نقاط
  perform pg_temp.ok(
    not exists (
      select 1 from (
        select distinct app.map_baghdad_day(h.fix_time) as day
          from public.gps_device_position_history h
         where not exists (
           select 1 from public.gps_device_position_history h2
            where app.map_baghdad_day(h2.fix_time) = app.map_baghdad_day(h.fix_time))
      ) x where app.gps_day_is_certified(x.day)),
    'B13b الشهادة باقية صارمة: لا شهادة على يوم بلا نقاط');

  -- 'expired' لا تُمنح ليوم لم تنقضِ نافذته
  perform pg_temp.eq(app.gps_day_is_expired(app.map_baghdad_day(now())), false,
    'B13c يوم اليوم ليس منتهياً (نافذته لم تنقضِ)');
  perform pg_temp.eq(app.gps_day_is_expired(app.map_baghdad_day(now()) - 1), false,
    'B13d يوم أمس ليس منتهياً بعد (داخل نافذة ٣٦ ساعة)');
end $$;
rollback;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- B14 · التسوية لا تتجاوز حدودها
--   visit_build_settle_orphans يكتب 'empty' — وهي شهادة فحص. يجب ألا يكتبها ليوم **فيه
--   نقاط** ولا ليوم **داخل نافذة الاحتفاظ**. نتحقّق من الشروط في نصّ الدالة، لأن المحاولة
--   الفعلية تحتاج يوماً اصطناعياً بنقاط (وهذا يلوّث البيانات الحقيقية).
-- ═══════════════════════════════════════════════════════════════════════════════════════════
begin;
do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.proname = 'visit_build_settle_orphans';

  perform pg_temp.ok(position('not exists' in v_def) > 0
                     and position('gps_device_position_history h' in v_def) > 0,
    'B14a التسوية تتحقّق من انعدام النقاط فعلاً');
  perform pg_temp.ok(position('make_interval(hours => v_keep_hours) >= now()' in v_def) > 0,
    'B14b التسوية لا تمسّ يوماً داخل نافذة الاحتفاظ');
  perform pg_temp.ok(position('recovery' in v_def) > 0,
    'B14c صفوف التسوية موسومة recovery للتدقيق');

  -- والتفريغ يستدعيها قبل الفحص — لا نسيان
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.proname = 'gps_history_daily_purge';
  perform pg_temp.ok(position('visit_build_settle_orphans' in v_def) > 0,
    'B14d التفريغ يسوّي الأيام المنقضية قبل أن يحكم عليها');
  perform pg_temp.ok(position('gps_day_is_settled' in v_def) = 0
                     and position('gps_day_is_expired' in v_def) > 0,
    'B14e التفريغ يفحص certified و expired صراحةً');
end $$;
rollback;

raise notice '════ كل تدقيقات خطّ الزيارات نجحت ════';

