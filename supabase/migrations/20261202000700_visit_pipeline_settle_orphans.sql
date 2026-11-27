-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 20261202000700 · تسوية الأيام التي نفدت نقاطها قبل بنائها (المرحلة ⑦)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- ─── الحالة التي بقيت مفتوحة بعد ⑥ ────────────────────────────────────────────────────────
-- ⑥ أغلق الأيام التي **بُنيت بالكامل** ثم نفدت نقاطها. بقي نوع ثانٍ، قِيس على الإنتاج:
--
--   app.visit_day_state('2026-11-24') →
--     { certified: false, expired: false, settled: false,
--       shift_rows_built: 6, shift_rows_empty: 0, shift_rows_missing: 10,
--       raw_points: 0,
--       reasons: [not_built ×10, no_points] }
--
--   اليوم فيه ٦ صفوف بناء و١٠ شفتات لم تُبنَ، ونقاطه **صفر**. الشفتات العشرة لا يمكن
--   أن تُبنى — لا مادة لها. ولا تصير 'empty' لأن العامل لا يراها أبداً: استعلامه يستثني
--   ما لا نقاط له (`left join pts` ثم `last_pt is null` ⇒ كان يجب أن يكتب 'empty')،
--   لكنه يكتب 'empty' فقط للأيام داخل نطاقه (٨ أيام) وحين تكون النافذة في القائمة.
--   يوم ٢٤ نوفمبر داخل النطاق فعلاً… لكن نافذته **لم تعد تحتوي نقاطاً** لأن التصفير ③
--   حذف نقاطه لأنه أقدم من ٣٦ ساعة، قبل أن يبنيها المحرّك الجديد. فالوضع: لا نقاط،
--   ولا يمكن بناء شيء، ولا شهادة، ولا انتهاء (لأن الانتهاء يشترط اكتمال الصفوف).
--
--   النتيجة prácticas: أيام كهذه تبقى محجوبة إلى الأبد. عددها محدود (أيام الانتقال)،
--   لكن قاعدة «لا حجب أبدي» التي بُني عليها الخطّ كلّه تنكسر إن تُركت.
--
-- ─── الحلّ: تسوية صريحة، لا صمت ────────────────────────────────────────────────────────────
-- دالة `app.visit_build_settle_orphans()` تكتب صفوف 'empty' للشفتات **التي لا نقاط لها
-- إطلاقاً** في يوم انقضت نافذته. شرطان لا يُخترقان:
--   ① اليوم انقضت نافذة احتفاظه (لا تسوية ليوم قد تصل نقاطه).
--   ② الشفت **صفر نقاط** فعلاً، مُقاساً في نفس اللحظة.
-- فالتسوية ليست تجاوزاً للشهادة: هي تسجيل نتيجة فحص حقيقي — نفس ما كان العامل سيكتبه
-- لو رآه في وقته. والصفوف 'empty' تُكتب بـ trigger_kind = 'recovery' لتُعرف في التدقيق.
--
-- والصفوف 'built' الباقية لذلك اليوم تُترك كما هي: زياراتها بُنيت من نقاط كانت موجودة،
-- وهي صحيحة. لا تُمسّ.
--
-- بعد التسوية يصبح اليوم «منتهياً» (⑥) فيُفرَّغ ويُغلق، وتعود القاعدة سارية.
--
-- تُستدعى من التفريغ نفسه (قبل الفحص) — فلا حاجة لجدولة إضافية ولا لمهمة يدوية.
--
-- ─── ملاحظة تصميمية ────────────────────────────────────────────────────────────────────────
-- لماذا داخل التفريغ لا في العامل؟ لأن العامل يعمل كل دقيقة على نطاق ٨ أيام؛ ولو كتب
-- 'empty' لأيام خارج نطاقه لوسّع نطاقه بلا حدّ. التفريغ يعمل على **كل** الأيام المنقضية
-- أصلاً، فهو الموضع الطبيعي للتسوية.
--
-- التراجع: إسقاط الدالة، وإعادة app.gps_history_daily_purge من 20261202000600.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

create or replace function app.visit_build_settle_orphans(p_max_age_days int default 400)
returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  v_keep_hours int;
  v_cutoff     timestamptz;
  v_rows       int := 0;
  v_days       int := 0;
  r            record;
  v_n          int;
begin
  select coalesce(keep_hours, 36) into v_keep_hours
    from public.gps_history_purge_settings where id = 1;
  v_keep_hours := coalesce(v_keep_hours, 36);

  -- نافذة الأيام المسموح تسويتها: كل ما انقضى احتفاظه، وبحدّ أعلى للعمر (حماية من مسح تاريخي)
  v_cutoff := now() - make_interval(hours => v_keep_hours);

  for r in
    select distinct app.map_baghdad_day(v.placeday) as day
      from public.map_visits v
     where v.placeday >= app.map_baghdad_day(now()) - greatest(coalesce(p_max_age_days, 400), 1)
    union
    select distinct b.day
      from public.gps_visit_builds b
     where b.day >= app.map_baghdad_day(now()) - greatest(coalesce(p_max_age_days, 400), 1)
  loop
    -- ① لا تسوية ليوم لم تنقضِ نافذته
    continue when ((r.day + 1)::timestamp at time zone 'Asia/Baghdad')
                 + make_interval(hours => v_keep_hours) >= now();

    v_n := 0;
    -- ② تُكتب 'empty' فقط للشفت الذي **صفر نقاط** فعلاً، ولكل زون
    insert into public.gps_visit_builds
      (zone_id, day, shift_type, status, trigger_kind, visits_created, visits_merged,
       places_scanned, skipped_visits, points_in_day, points_at_build,
       started_at, finished_at, duration_ms, error, actor_name)
    select z.id, r.day, w.shift_key, 'empty', 'recovery', 0, 0, 0, 0, 0, null,
           clock_timestamp(), clock_timestamp(), 0, null, 'تسوية الأيام المنقضية'
      from app.visit_shift_windows(r.day) w
     cross join public.map_zones z
     where not exists (
             select 1
               from public.gps_device_position_history h
              where h.fix_time >= w.win_start and h.fix_time < w.win_end
           )
       and not exists (
             select 1
               from public.gps_visit_builds b
              where b.zone_id = z.id and b.day = r.day and b.shift_type = w.shift_key
                and b.status in ('built', 'empty')
           )
    on conflict (zone_id, day, shift_type) do nothing;
    get diagnostics v_n = row_count;

    if v_n > 0 then
      v_rows := v_rows + v_n;
      v_days := v_days + 1;
    end if;
  end loop;

  if v_rows > 0 then
    perform app.data_retention_log(null, 'gps_position_history', 'settle_orphan_shifts',
      jsonb_build_object('rows', v_rows, 'days', v_days, 'keep_hours', v_keep_hours,
                         'rule', 'شفت بلا نقاط في يوم انقضى احتفاظه يُسجَّل empty — نتيجة فحص لا تجاوز'));
  end if;

  return jsonb_build_object('ok', true, 'rows_settled', v_rows, 'days', v_days);
end $$;

comment on function app.visit_build_settle_orphans(int) is
  'تسوية الأيام المنقضية: يكتب صفوف empty للشفتات التي لا نقاط لها إطلاقاً، بعد انقضاء نافذة الاحتفاظ. نتيجة فحص حقيقي — لا تجاوز للشهادة.';

revoke all on function app.visit_build_settle_orphans(int) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- التفريغ يُسوّي ثم يُفرّغ — وهو المسار الوحيد، فلا نسيان
-- ───────────────────────────────────────────────────────────────────────────────────────────
create or replace function app.gps_history_daily_purge(p_force boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  s         public.gps_history_purge_settings;
  v_cutoff  timestamptz;
  v_rows    bigint := 0;
  v_held    bigint := 0;
  v_before  bigint;
  v_after   bigint;
  v_held_d  jsonb := '[]'::jsonb;
  v_total   bigint;
  dd        date;
  v_n       bigint;
  v_state   jsonb;
  v_cert    boolean;
  v_exp     boolean;
  v_settled jsonb;
begin
  select * into s from public.gps_history_purge_settings where id = 1 for update;
  if not coalesce(s.enabled, false) and not p_force then
    return jsonb_build_object('skipped', true, 'reason', 'disabled');
  end if;

  -- ③-ب التسوية أولاً: أي يوم انقضى وفيه شفتات بلا نقاط يُغلق قبل أن يُحكم عليه بالحجب.
  v_settled := app.visit_build_settle_orphans(400);

  v_cutoff := now() - make_interval(hours => coalesce(s.keep_hours, 36));
  v_before := pg_total_relation_size('public.gps_device_position_history'::regclass);
  select count(*) into v_total from public.gps_device_position_history;

  for dd in
    select d.day from (
      select app.map_baghdad_day(h.fix_time) as day, max(h.fix_time) as last_pt
        from public.gps_device_position_history h
       group by 1
    ) d
    where d.last_pt < v_cutoff
  loop
    v_cert := app.gps_day_is_certified(dd);
    v_exp  := (not v_cert) and app.gps_day_is_expired(dd);

    if v_cert or v_exp then
      delete from public.gps_device_position_history h
       where app.map_baghdad_day(h.fix_time) = dd;
      get diagnostics v_n = row_count;
      v_rows := v_rows + v_n;
    else
      select count(*) into v_n
        from public.gps_device_position_history h
       where app.map_baghdad_day(h.fix_time) = dd;
      v_held := v_held + v_n;
      v_state := app.visit_day_state(dd);
      v_held_d := v_held_d || jsonb_build_object(
        'day', dd,
        'raw_points', v_n,
        'certified', false,
        'expired', false,
        'shift_rows_missing', (v_state ->> 'shift_rows_missing')::int,
        'shift_rows_failed', (v_state ->> 'shift_rows_failed')::int,
        'reasons', v_state -> 'reasons');
    end if;
  end loop;

  v_after := pg_total_relation_size('public.gps_device_position_history'::regclass);

  update public.gps_history_purge_settings set
    last_run_at = now(), last_rows = v_rows, last_skipped_rows = v_held,
    last_skipped = v_held_d,
    last_bytes_before = v_before, last_bytes_after = v_after,
    last_error = null, runs_count = coalesce(runs_count, 0) + 1
  where id = 1;

  perform app.data_retention_log(null, 'gps_position_history', 'aged_purge',
    jsonb_build_object('rows_purged', v_rows, 'rows_held', v_held,
                       'keep_hours', coalesce(s.keep_hours, 36), 'cutoff', v_cutoff,
                       'held_days', v_held_d, 'table_rows', v_total,
                       'bytes_before', v_before, 'bytes_after', v_after,
                       'forced', p_force, 'settled', v_settled));

  return jsonb_build_object('ok', true, 'rows_purged', v_rows, 'rows_held', v_held,
    'held_days', v_held_d, 'keep_hours', coalesce(s.keep_hours, 36),
    'bytes_before', v_before, 'bytes_after', v_after, 'settled', v_settled);
exception when others then
  update public.gps_history_purge_settings set last_error = sqlerrm where id = 1;
  perform app.data_retention_log(null, 'gps_position_history', 'aged_purge_failed',
    jsonb_build_object('error', sqlerrm));
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end $$;

revoke all on function app.gps_history_daily_purge(boolean) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- تشغيل التسوية مرة واحدة الآن — أيام الانتقال تُغلق، والمحرّك يكمل من نفسه
-- ───────────────────────────────────────────────────────────────────────────────────────────
do $$
declare v_res jsonb;
begin
  v_res := app.visit_build_settle_orphans(400);
  raise notice '⑦ تسوية أولية: %', v_res;
end $$;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- إثبات: لا يوم منقضٍ يبقى بلا حكم
-- ───────────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_stuck int;
  v_list  text;
begin
  select count(*), string_agg(d.day::text, ', ' order by d.day) into v_stuck, v_list
    from (
      select distinct app.map_baghdad_day(h.fix_time) as day, max(h.fix_time) as last_pt
        from public.gps_device_position_history h
       group by 1
    ) d
   where d.last_pt < now() - make_interval(hours => (select coalesce(keep_hours, 36) from public.gps_history_purge_settings where id = 1))
     and not app.gps_day_is_settled(d.day);

  if v_stuck > 0 then
    raise exception 'DAYS_STILL_STUCK: % يوم منقضٍ بلا حكم (%)', v_stuck, v_list;
  end if;
end $$;
