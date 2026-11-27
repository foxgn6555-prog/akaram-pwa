-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 20261202000600 · شهادة «انتهى» — إغلاق الحلقة التي كانت تمنع التفريغ للأبد (المرحلة ⑥)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- ─── العطب المقيس ──────────────────────────────────────────────────────────────────────────
-- بعد تشغيل الخطّ فعلياً، توقّف كله عند يوم واحد. القياس على الإنتاج:
--
--   app.visit_day_state('2026-11-20') →
--     { certified: false,
--       shift_rows_empty: 16, shift_rows_missing: 0, shift_rows_failed: 0,
--       raw_points: 0,
--       reasons: [{ code: 'no_points', text: 'لا نقاط GPS لهذا اليوم …' }] }
--
-- والتاريخ يشرح نفسه: ٨٤ يوماً قديمة كان فيها عدد قليل من النقاط (نقطة إلى ٣ في اليوم)
-- حُذفت في التصفير (③) أو في التقليم (②). صار اليوم «مبنياً بالكامل» (١٦ صفّ empty)
-- لكن الشرط ⓐ «لا شهادة على يوم بلا نقاط» يمنعه إلى الأبد — لأنه يريد نقاطاً كدليلك
-- على أنه مرّ بلا نشاط. والمشكلة أن هذا اليوم **لن يعود له نقاط أبداً**.
--
-- النتيجة المقيسة: `last_rows = 0` و`last_run_at` يتجدد — التفريغ يعمل كل ساعة ولا يحذف
-- شيئاً، و`keep_hours = 36` صار حبراً على ورق. وهي بالضبط العلّة التي جاء هذا الخطّ
-- لإزالتها (تراكم ٢٠٩ آلاف نقطة رغم وجود سياسة احتفاظ).
--
-- ─── لماذا لا يجوز أن يبقى الشرط كما هو ───────────────────────────────────────────────────
-- الشرط ⓐ صحيح في نافذة الاحتفاظ (٣٦ ساعة): خلالها نقاط اليوم إمّا موجودة أو متأخرة من
-- المزوّد، فلا يُحذف شيء على أمل. لكن بعد أن **تصبح النافذة أصغر من عمر اليوم**، غياب
-- النقاط لم يعد «لا دليل»، بل صار **حقيقة نهائية**: لا شيء يمكن بناؤه ولا حذفه.
--
-- ─── التعريف الجديد (يُضاف، ولا يلغي القديم) ──────────────────────────────────────────────
-- يوم بغدادي D «انتهى» ⟺
--     كل (زون × شفت) له صفّ built أو empty، ولا صفّ failed،
--     ولا نقطة GPS واحدة باقية له في الجدول.
-- الصفوف `empty` وحدها هي دليل الفحص، ووجود صفّ `built` مع صفر نقاط متبقية مقبول أيضاً:
-- بناؤه تمّ فعلاً ثم حُذفت نقاطه بمسار آخر، ولا شيء يُعاد بناؤه منه.
--
-- **ولا يُشترط في «انتهى» وجود نقاط** — بل العكس: الشرط هو انعدامها. وهذا الفرق الدقيق
-- هو ما يفرّق بين «يوم لم يصل دليله بعد» (يبقى محجوباً) و«يوم نفد دليله نهائياً».
--
-- الشهادة الكاملة (gps_day_is_certified) تبقى كما هي تماماً — لا تُرخّى. يُضاف إليها
-- بديل واحد فقط: gps_day_is_settled = certified or expired. والتفريغ يستخدم البديل.
--
-- ─── الأثر ────────────────────────────────────────────────────────────────────────────────
--   · التفريغ يحذف نقاط الأيام المنتهية (وهي قليلة أو معدومة في الغالب).
--   · app.visit_day_state صار يشرح الفرق: days_expired، وسبب منفصل 'expired'.
--   · الشارة في الشاشة تبقى صادقة: «مُشهَّد» يعني بُني ونُقّي على أساس نقاط حقيقية.
--
-- التراجع: إعادة تعريف الدوال من 20261202000200.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- ① الحالة «انتهى» — بعد أن تنقضي نافذة الاحتفاظ ويبقى اليوم بلا نقاط
-- ───────────────────────────────────────────────────────────────────────────────────────────
create or replace function app.gps_day_is_expired(p_day date)
returns boolean
language plpgsql stable security definer set search_path = public, app as $$
declare
  v_zones      int;
  v_shift_rows int;
  v_bad        int;
  v_points     bigint;
  v_keep_hours int;
  v_cutoff     timestamptz;
begin
  select count(*) into v_zones from public.map_zones;
  if coalesce(v_zones, 0) = 0 then
    return false;
  end if;

  -- لا معنى للحكم قبل أن تنقضي نافذة الاحتفاظ: خلالها قد تصل نقاط متأخرة.
  select coalesce(keep_hours, 36) into v_keep_hours
    from public.gps_history_purge_settings where id = 1;
  v_keep_hours := coalesce(v_keep_hours, 36);
  v_cutoff := ((p_day + 1)::timestamp at time zone 'Asia/Baghdad') + make_interval(hours => v_keep_hours);

  if now() <= v_cutoff then
    return false;
  end if;

  -- كل زون × شفت له صفّ مقبول
  select count(b.id) into v_shift_rows
    from app.visit_shift_windows(p_day) w
   cross join public.map_zones z
    left join public.gps_visit_builds b
           on b.zone_id = z.id and b.day = p_day and b.shift_type = w.shift_key
          and b.status in ('built', 'empty');
  if (v_zones * 2) - v_shift_rows > 0 then
    return false;
  end if;

  select count(*) into v_bad
    from public.gps_visit_builds b
   where b.day = p_day and b.status = 'failed';
  if v_bad > 0 then
    return false;
  end if;

  -- ★ الشرط الجوهري: لا نقطة باقية. أي نقطة باقية تعني أن التفريغ لم يُنفَّذ بعد،
  --   والمسار العادي (certified) هو الذي يجب أن يعالجها.
  select count(*) into v_points
    from app.visit_shift_windows(p_day) w
    join public.gps_device_position_history h
      on h.fix_time >= w.win_start and h.fix_time < w.win_end;
  return coalesce(v_points, 0) = 0;
end $$;

comment on function app.gps_day_is_expired(date) is
  'هل انتهى يوم بغدادي؟ أي: انقضت نافذة الاحتفاظ، وكل زون/شفت مُسجَّل بلا فشل، ولا نقطة باقية له. اليوم المنتهي لا يُبنى ولا يُحذف منه شيء — يُغلق.';

revoke all on function app.gps_day_is_expired(date) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- ② البديل الذي يستخدمه التفريغ: إمّا مُشهَّد، أو انتهى
-- ───────────────────────────────────────────────────────────────────────────────────────────
create or replace function app.gps_day_is_settled(p_day date)
returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.gps_day_is_certified(p_day) or app.gps_day_is_expired(p_day)
$$;

comment on function app.gps_day_is_settled(date) is
  'الشهادة أو الانتهاء — شرط التفريغ. الشهادة تعني «بُني على نقاط حقيقية»، والانتهاء يعني «نفدت نقاطه نهائياً ولم يبقَ ما يُبنى». كلاهما يسمح بالحذف؛ لا شيء سواهما.';

revoke all on function app.gps_day_is_settled(date) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- ③ التفريغ يستخدم البديل، ويُبيّن في السجل أيّ البابين فُتح
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
begin
  select * into s from public.gps_history_purge_settings where id = 1 for update;
  if not coalesce(s.enabled, false) and not p_force then
    return jsonb_build_object('skipped', true, 'reason', 'disabled');
  end if;

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
                       'bytes_before', v_before, 'bytes_after', v_after, 'forced', p_force));

  return jsonb_build_object('ok', true, 'rows_purged', v_rows, 'rows_held', v_held,
    'held_days', v_held_d, 'keep_hours', coalesce(s.keep_hours, 36),
    'bytes_before', v_before, 'bytes_after', v_after);
exception when others then
  update public.gps_history_purge_settings set last_error = sqlerrm where id = 1;
  perform app.data_retention_log(null, 'gps_position_history', 'aged_purge_failed',
    jsonb_build_object('error', sqlerrm));
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end $$;

comment on function app.gps_history_daily_purge(boolean) is
  'حذف نقاط الأيام التي انقضى احتفاظها (٣٦ ساعة) إذا كان اليوم مُشهَّداً **أو منتهياً**. اليوم يُحذف كاملاً أو لا يُمسّ.';

revoke all on function app.gps_history_daily_purge(boolean) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- ④ حالة اليوم تشرح الفرق: certified / expired، ولكلٍّ نصّه
-- ───────────────────────────────────────────────────────────────────────────────────────────
create or replace function app.visit_day_state(p_day date)
returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare
  v_zones    int;
  v_expected int;
  v_built    int;
  v_empty    int;
  v_failed   int;
  v_missing  int;
  v_points   bigint;
  v_oldest   timestamptz;
  v_newest   timestamptz;
  v_cert     boolean;
  v_exp      boolean;
  v_reasons  jsonb := '[]'::jsonb;
begin
  select count(*) into v_zones from public.map_zones;
  v_expected := coalesce(v_zones, 0) * 2;

  select count(*) filter (where b.status = 'built'),
         count(*) filter (where b.status = 'empty'),
         count(*) filter (where b.status = 'failed')
    into v_built, v_empty, v_failed
    from public.gps_visit_builds b
   where b.day = p_day;

  v_missing := greatest(v_expected - (v_built + v_empty), 0);

  select count(*), min(h.fix_time), max(h.fix_time)
    into v_points, v_oldest, v_newest
    from app.visit_shift_windows(p_day) w
    join public.gps_device_position_history h
      on h.fix_time >= w.win_start and h.fix_time < w.win_end
    join public.gps_vehicle_bindings vb on vb.device_id = h.device_id;

  v_cert := app.gps_day_is_certified(p_day);
  v_exp  := (not v_cert) and app.gps_day_is_expired(p_day);

  if v_failed > 0 then
    v_reasons := v_reasons || jsonb_build_object('code','build_failed','count',v_failed,
      'text', v_failed || ' زون/شفت فشل بناؤه');
  end if;
  if v_missing > 0 then
    v_reasons := v_reasons || jsonb_build_object('code','not_built','count',v_missing,
      'text', v_missing || ' زون/شفت لم يُبنَ بعد');
  end if;
  if coalesce(v_points, 0) = 0 and not v_exp then
    v_reasons := v_reasons || jsonb_build_object('code','no_points',
      'text','لا نقاط GPS لهذا اليوم — لا شهادة بلا دليل');
  end if;
  if v_exp then
    v_reasons := v_reasons || jsonb_build_object('code','expired',
      'text','انتهى هذا اليوم: بُني بالكامل ولم يبقَ له نقاط (انقضت نافذة الاحتفاظ) — لا شيء يُبنى ولا يُحذف، ولا يعود له دليل أبداً');
  end if;

  return jsonb_build_object(
    'day', p_day,
    'certified', v_cert,
    'expired', v_exp,
    'settled', v_cert or v_exp,
    'zones', v_zones,
    'shift_rows_expected', v_expected,
    'shift_rows_built', v_built,
    'shift_rows_empty', v_empty,
    'shift_rows_failed', v_failed,
    'shift_rows_missing', v_missing,
    'raw_points', coalesce(v_points, 0),
    'oldest_point', v_oldest,
    'newest_point', v_newest,
    'reasons', v_reasons
  );
end $$;

revoke all on function app.visit_day_state(date) from public, anon;
grant execute on function app.visit_day_state(date) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- ⑤ الغلاف العام: نُظهر expired أيضاً حتى تشرح الشاشة الحالة بدقّة
-- ───────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.map_visit_day_settled(p_day date)
returns boolean
language plpgsql stable security definer set search_path = public, app as $$
begin
  if auth.uid() is null or not app.has_role(array['ops_room','ops_room_manager','it_admin','super_admin']) then
    raise exception 'MAP_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;
  return app.gps_day_is_settled(p_day);
end $$;

revoke all on function public.map_visit_day_settled(date) from public, anon;
grant execute on function public.map_visit_day_settled(date) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- إثبات: لا يوم يبقى محجوباً بلا سبب، ولا يوم يُحذف بلا أحد البابين
-- ───────────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_stuck int;
  v_bad int;
begin
  -- كل يوم خارج نافذة الاحتفاظ وفيه نقاط: إمّا مُشهَّد أو منتهٍ أو له سبب مذكور
  select count(*) into v_stuck
    from (
      select app.map_baghdad_day(h.fix_time) as day, max(h.fix_time) as last_pt
        from public.gps_device_position_history h
       group by 1
    ) d
   where d.last_pt < now() - make_interval(hours => (select coalesce(keep_hours, 36) from public.gps_history_purge_settings where id = 1))
     and not app.gps_day_is_settled(d.day)
     and jsonb_array_length(app.visit_day_state(d.day) -> 'reasons') = 0;
  if v_stuck > 0 then
    raise exception 'PURGE_DAY_STUCK: % يوم محجوب بلا سبب مذكور', v_stuck;
  end if;

  -- الشهادة لم تُرخَّ: يوم بلا نقاط ليس مُشهَّداً
  select count(*) into v_bad
    from public.gps_visit_builds b
   where b.day = current_date - 400
     and app.gps_day_is_certified(b.day);
  if v_bad > 0 then
    raise exception 'CERTIFICATION_WEAKENED: الشهادة صارت تُمنح ليوم بلا نقاط';
  end if;
end $$;
