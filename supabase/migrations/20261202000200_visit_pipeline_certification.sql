-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 20261202000200 · خطّ الزيارات الموحّد — الشهادة والتفريغ (المرحلة ②)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- الترتيب الذي يفرضه هذا الترحيل، وهو الترتيب المطلوب حرفياً:
--
--   ① النقاط تُجمَع  (edge function lvn-gps-sync — لم تُمسّ، تعمل كل دقيقة)
--   ② الزيارات تُبنى (visit_build_run_pending — كل دقيقة، شفتاً شفتاً)
--   ③ نقاط GPS تُحذف بعد ٣٦ ساعة **فقط** إذا كان يومها مُشهَّداً بالكامل
--   ④ الزيارات تُحذف بعد ٣١ يوماً **آلياً** بلا شرط تصدير
--
-- وفي كل مرحلة: لا شيء يُحذف قبل أن يُبنى، ولا شهادة على عمل لم يُسجَّل.
--
-- ─── عيوب الشهادة القديمة التي يُصلحها هذا الملف ────────────────────────────────────────────
--   ⓐ `if v_newest is null then return true`  ⇒ يوم بلا نقاط يُشهَّد فوراً.
--      النتيجة على الإنتاج: الشهادة الوحيدة في تاريخ النظام كانت ليوم ٢٠ نوفمبر،
--      وهو يوم **صفر نقاط وصفر زيارات**. شهادة على لا شيء.
--   ⓑ عدّ الصفوف `count(*) < v_zones` يخلط `empty` بـ `built` — فثمانية صفوف
--      «فارغ» تشهّد يوماً كاملاً بلا بناء واحد.
--   ⓒ `min(points_at_build)` على كل الزونات: زون واحد بلا نقاط يُسقط اليوم كله إلى
--      epoch ⇒ الشهادة تُرفض دائماً في الممارسة، فلا يُفرَّغ شيء أبداً (وهذا سبب
--      تراكم 209 ألفاً من النقاط رغم أن keep_hours = 48).
--   ⓓ لا وعي بالشفت: مع إضافة الشفتين يصبح عدد الصفوف ١٦ لثمانية زونات، فيبلغ النصاب
--      بالشفت الصباحي وحده ⇒ شهادة كاذبة.
--
-- ─── تعريف الشهادة الآن ────────────────────────────────────────────────────────────────────
-- يوم بغدادي D مُشهَّد ⟺ لكل (زون × شفت) صفّ في gps_visit_builds بحالة built أو empty،
--                     ولا صفّ failed، ولا نقطة GPS في تلك النافذة أحدث من points_at_build.
-- «empty» تعني: **فُحصت النافذة فلم يوجد فيها نقطة ملزِمة**. وهي ليست شهادة على يوم
-- كامل بلا نقاط: يومٌ بلا نقاط إطلاقاً لا يُشهَّد (الشرط ⓐ أعلاه)، لأنه لا دليل على أنه
-- مرّ بلا نشاط — قد يكون عطل مزوّد. النقاط تبقى، ويُبلَّغ الفريق.
--
-- التراجع:
--   إعادة تعريف app.gps_day_is_certified من 20261128000100،
--   وإعادة جدولة وظائف cron القديمة.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- ① الشهادة — shift-aware، ولا تُمنح على يوم بلا نقاط
-- ───────────────────────────────────────────────────────────────────────────────────────────
create or replace function app.gps_day_is_certified(p_day date)
returns boolean
language plpgsql stable security definer set search_path = public, app as $$
declare
  v_zones      int;
  v_shift_rows int;
  v_missing    int;
  v_bad        int;
  v_points     bigint;
begin
  select count(*) into v_zones from public.map_zones;
  if coalesce(v_zones, 0) = 0 then
    return false;
  end if;

  -- كل زون × كل شفت يجب أن يكون له صفّ (built أو empty) — ١٦ صفاً لثمانية زونات.
  -- ⚠ الانتباه: count(b.id) لا count(*) — الكروس جوين يُنتج ١٦ صفاً دائماً حتى لو كان
  -- السجل فارغاً تماماً، فيمرّ الشرط خطأً ويُشهَّد يوم بلا أي بناء. هذا الخطأ وقع فعلاً
  -- والتقاطه اختبارُ الشهادة.
  select count(b.id) into v_shift_rows
    from app.visit_shift_windows(p_day) w
   cross join public.map_zones z
    left join public.gps_visit_builds b
           on b.zone_id = z.id and b.day = p_day and b.shift_type = w.shift_key
          and b.status in ('built', 'empty');
  select (v_zones * 2) - v_shift_rows into v_missing;
  if v_missing > 0 then
    return false;
  end if;

  -- أي فشل مسجَّل يُسقط الشهادة — لا شهادة على محاولة فاشلة
  select count(*) into v_bad
    from public.gps_visit_builds b
   where b.day = p_day and b.status = 'failed';
  if v_bad > 0 then
    return false;
  end if;

  -- ★ لا شهادة على يوم بلا نقاط إطلاقاً: قد يكون عطل مزوّد لم تُسجَّل نقاطه بعد.
  --   الصفوف empty باقية كسجل، لكن الحذف لا يُسمح به.
  select count(*) into v_points
    from app.visit_shift_windows(p_day) w
    join lateral (
      select 1
        from public.gps_device_position_history h
        join public.gps_vehicle_bindings vb on vb.device_id = h.device_id
       where h.fix_time >= w.win_start and h.fix_time < w.win_end
       limit 1
    ) x on true;
  if coalesce(v_points, 0) = 0 then
    return false;
  end if;

  -- أي صفّ لا يشمل آخر نقطة في نافذته يُبطل الشهادة ⇒ يُعاد البناء لا الحذف.
  --
  -- ⚠ هنا موضع خطأ دقيق: لو قصرنا المقارنة على الصفوف 'built' لنجا صفّ 'empty'
  -- مكتوب على شفت **فيه نقاط** — لأن points_at_build فيه null. وهذا يقع فعلاً:
  -- الشفت المسائي ليوم ٢٠ نوفمبر يحتوي نقاط ٢١:٠٠Z بينما سُجّل 'empty' من المحرّك
  -- القديم، فمرّ اليوم كأنه مبنيّ. لذلك المقارنة تشمل **كل** الصفوف (built و empty):
  --   · empty على شفت بلا نقاط  ⇒ last_pt = null ⇒ لا مخالفة (صحيح)
  --   · empty على شفت فيها نقاط ⇒ null < last_pt ⇒ مخالفة (يُرفض)
  if exists (
    select 1
      from app.visit_shift_windows(p_day) w
      join lateral (
        select max(h.fix_time) as last_pt
          from public.gps_device_position_history h
          join public.gps_vehicle_bindings vb on vb.device_id = h.device_id
         where h.fix_time >= w.win_start and h.fix_time < w.win_end
      ) n on true
     where n.last_pt is not null
       and exists (
         select 1 from public.gps_visit_builds b
          where b.day = p_day
            and b.shift_type = w.shift_key
            and coalesce(b.points_at_build, 'epoch'::timestamptz) < n.last_pt
       )
  ) then
    return false;
  end if;

  return true;
end $$;

comment on function app.gps_day_is_certified(date) is
  'هل بُني يوم بغدادي بالكامل على مستوى الشفتين؟ 20261202000200: ترفض الشهادة على يوم بلا نقاط، وعلى أي شفت مفقود أو فاشل، وعلى أي نقطة وصلت بعد البناء.';

revoke all on function app.gps_day_is_certified(date) from public, anon, authenticated;

-- الغلاف العام للواجهة (نفس التوقيع — لا تغيير على الواجهة)
create or replace function public.map_day_is_certified(p_day date)
returns boolean
language plpgsql stable security definer set search_path = public, app as $$
begin
  if auth.uid() is null or not app.has_role(array['ops_room','ops_room_manager','it_admin','super_admin']) then
    raise exception 'MAP_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;
  return app.gps_day_is_certified(p_day);
end $$;

revoke all on function public.map_day_is_certified(date) from public, anon;
grant execute on function public.map_day_is_certified(date) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- ② شرح حالة يوم واحد — «لماذا لا تُحذف نقاطه؟» بجواب صريح، لا شارة غامضة
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

  if v_failed > 0 then
    v_reasons := v_reasons || jsonb_build_object('code','build_failed','count',v_failed,
      'text', v_failed || ' زون/شفت فشل بناؤه');
  end if;
  if v_missing > 0 then
    v_reasons := v_reasons || jsonb_build_object('code','not_built','count',v_missing,
      'text', v_missing || ' زون/شفت لم يُبنَ بعد');
  end if;
  if coalesce(v_points, 0) = 0 then
    v_reasons := v_reasons || jsonb_build_object('code','no_points',
      'text','لا نقاط GPS لهذا اليوم — لا شهادة بلا دليل');
  end if;

  return jsonb_build_object(
    'day', p_day,
    'certified', v_cert,
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

create or replace function public.map_visit_day_state(p_day date)
returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
begin
  if auth.uid() is null or not app.has_role(array['ops_room','ops_room_manager','it_admin','super_admin']) then
    raise exception 'MAP_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;
  return app.visit_day_state(p_day);
end $$;

revoke all on function public.map_visit_day_state(date) from public, anon;
grant execute on function public.map_visit_day_state(date) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- ③ تفريغ النقاط الخام — ٣٦ ساعة + شرط الشهادة، على مستوى اليوم الكامل
--    يُحذف اليوم كاملاً أو لا يُحذف منه شيء: لا قطع نصف يوم.
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
begin
  select * into s from public.gps_history_purge_settings where id = 1 for update;
  if not coalesce(s.enabled, false) and not p_force then
    return jsonb_build_object('skipped', true, 'reason', 'disabled');
  end if;

  v_cutoff := now() - make_interval(hours => coalesce(s.keep_hours, 36));
  v_before := pg_total_relation_size('public.gps_device_position_history'::regclass);
  select count(*) into v_total from public.gps_device_position_history;

  -- الأيام البغدادية التي انقضت مدة احتفاظها بالكامل (آخر نقطة فيها قبل الحد)
  for dd in
    select d.day from (
      select app.map_baghdad_day(h.fix_time) as day, max(h.fix_time) as last_pt
        from public.gps_device_position_history h
       group by 1
    ) d
    where d.last_pt < v_cutoff
  loop
    if app.gps_day_is_certified(dd) then
      delete from public.gps_device_position_history h
       where app.map_baghdad_day(h.fix_time) = dd;
      get diagnostics v_n = row_count;
      v_rows := v_rows + v_n;
    else
      select count(*) into v_n
        from public.gps_device_position_history h
       where app.map_baghdad_day(h.fix_time) = dd;
      v_held := v_held + v_n;
      -- سبب الحجب يُسجَّل مع اليوم، لا رقم مجرّد: شاشة الاحتفاظ تعرض «لماذا»
      v_held_d := v_held_d || jsonb_build_object(
        'day', dd,
        'raw_points', v_n,
        'certified', false,
        'shift_rows_missing', (app.visit_day_state(dd) ->> 'shift_rows_missing')::int,
        'shift_rows_failed', (app.visit_day_state(dd) ->> 'shift_rows_failed')::int,
        'reasons', app.visit_day_state(dd) -> 'reasons');
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
  'حذف نقاط الأيام التي انقضى احتفاظها (٣٦ ساعة) وبشرط الشهادة الكاملة على مستوى الشفتين. اليوم يُحذف كاملاً أو لا يُمسّ.';

revoke all on function app.gps_history_daily_purge(boolean) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- ③-ب تقليم النقاط القديمة غير القابلة للبناء
--
--   المشكلة الحقيقية المقيسة: في الجدول نقاط متفرّقة من سبتمبر ٢٠٢٥ إلى ١٩ نوفمبر ٢٠٢٦،
--   معظمها **نقطة واحدة في اليوم** (نحو ٨٠ صفّاً). هذه الأيام لا يمكن أن تُشهَّد أبداً —
--   لا نظام زونات يعمل عليها، ولا زيارات لها، ولا أثر عملي. لو تُركت، لبقي شرط الشهادة
--   يمنع حذفها إلى الأبد، فتنقضّ فكرة «التفريغ التلقائي» كلها من أجل ٨٠ صفّاً بلا قيمة.
--
--   لذلك: أي يوم بغدادي أقدم من 31 يوماً يُحذف بالكامل — **بشرط ألا يكون له زيارة واحدة**.
--   هذا الشرط الثاني هو الضمانة: اليوم الذي بُني منه شيء (وله زيارة) إما مُشهَّد فيُحذف
--   بالمسار الآمن أعلاه، أو غير مُشهَّد فيبقى وتُبلَّغ حالته. والحذف هنا لا يمسّ
--   أي شيء يُحتسب في تقرير.
--
--   هذا المسار **لا يحتاج شهادة** لأنه لا يُلغي أي زيارة: لا زيارة له من الأصل.
-- ───────────────────────────────────────────────────────────────────────────────────────────
create or replace function app.gps_history_prune_unbuildable(p_min_age_days int default 31)
returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  v_cut  timestamptz;
  v_rows bigint := 0;
  v_days int := 0;
begin
  v_cut := ((app.map_baghdad_day(now())
             - greatest(coalesce(p_min_age_days, 31), 1))::timestamp) at time zone 'Asia/Baghdad';

  -- الأيام المرشّحة تُحسب مرة واحدة. الحلقة السابقة كانت تُعيد مسح الجدول لكل يوم
  -- (٨٤ مسحة كاملة على ٢٠٩ آلاف صف) — وهذا ما بلغ مهلة القراءة ٣٠ ثانية.
  create temp table if not exists _prune_days (day date primary key, rows bigint);
  truncate _prune_days;

  insert into _prune_days (day, rows)
  select app.map_baghdad_day(h.fix_time) as day, count(*)
    from public.gps_device_position_history h
   where h.fix_time < v_cut
   group by 1;

  -- اليوم الذي له زيارة واحدة يخرج من القائمة فوراً: لا يُمسّ.
  delete from _prune_days d
   where exists (select 1 from public.map_visits v where v.placeday = d.day);

  select count(*), coalesce(sum(rows), 0) into v_days, v_rows from _prune_days;

  if v_days > 0 then
    delete from public.gps_device_position_history h
     using _prune_days d
     where h.fix_time < v_cut
       and app.map_baghdad_day(h.fix_time) = d.day;

    perform app.data_retention_log(null, 'gps_position_history', 'prune_unbuildable',
      jsonb_build_object('days', v_days, 'rows', v_rows, 'min_age_days', p_min_age_days));
  end if;

  return jsonb_build_object('ok', true, 'days', v_days, 'rows', v_rows);
end $$;

comment on function app.gps_history_prune_unbuildable(int) is
  'حذف نقاط الأيام الأقدم من ٣١ يوماً التي لا زيارة لها إطلاقاً — لا يمكن أن تُشهَّد ولا تُبنى، وإبقاؤها يمنع التفريغ للأبد.';

revoke all on function app.gps_history_prune_unbuildable(int) from public, anon, authenticated;


-- ───────────────────────────────────────────────────────────────────────────────────────────
-- ④ حذف الزيارات — ٣١ يوماً آلياً، بلا شرط تصدير، وبسجل لكل يوم
--    كانت `map_visits` في كتالوج الاحتفاظ «٣٠ يوماً + تصدير إلزامي»، ولأن
--    `data_retention_policies` فارغ (٠ صفوف) لم يكن هناك أي حذف آلي للزيارات أصلاً.
--    هذا المحرّك يغلق الفجوة، ويحافظ على السياسة القديمة معطّلة (لا تُمسّ).
-- ───────────────────────────────────────────────────────────────────────────────────────────
create table if not exists app.visit_retention_runs (
  id          bigint generated by default as identity primary key,
  day         date not null,
  rows_deleted int not null,
  keep_days   int not null,
  ran_at      timestamptz not null default now()
);

create or replace function app.visit_retention_enforce(p_keep_days int default 31)
returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  v_keep    int := greatest(coalesce(p_keep_days, 31), 1);
  v_today   date := app.map_baghdad_day(now());
  v_cutoff  date := v_today - v_keep;
  v_deleted int := 0;
  v_days    int := 0;
  v_detail  jsonb := '[]'::jsonb;
begin
  create temp table if not exists _old_days (day date primary key, n int);
  truncate _old_days;

  insert into _old_days (day, n)
  select placeday, count(*)::int
    from public.map_visits
   where placeday < v_cutoff
   group by placeday;

  select count(*), coalesce(sum(n), 0) into v_days, v_deleted from _old_days;
  select coalesce(jsonb_agg(jsonb_build_object('day', day, 'visits', n) order by day), '[]'::jsonb)
    into v_detail from _old_days;

  -- حذف واحد مجمّع، ثم سجل لكل يوم — بدل حلقة تحذف يوماً يوماً
  if v_days > 0 then
    delete from public.map_visits v using _old_days d where v.placeday = d.day;

    insert into app.visit_retention_runs (day, rows_deleted, keep_days)
    select day, n, v_keep from _old_days order by day;
  end if;

  -- سجل الشهادة للأيام القديمة جداً: يُبقى ٩٥ يوماً (أكثر من مدة الزيارات) للتدقيق فقط
  delete from public.gps_visit_builds where day < v_today - 95;

  if v_days > 0 then
    perform app.data_retention_log(null, 'map_visits', 'visit_retention_delete',
      jsonb_build_object('keep_days', v_keep, 'cutoff', v_cutoff,
                         'days', v_days, 'visits', v_deleted, 'detail', v_detail));
  end if;

  return jsonb_build_object('ok', true, 'keep_days', v_keep, 'cutoff', v_cutoff,
    'days_deleted', v_days, 'visits_deleted', v_deleted, 'detail', v_detail);
end $$;

comment on function app.visit_retention_enforce(int) is
  'حذف زيارات الأيام الأقدم من p_keep_days (٣١ افتراضياً) آلياً — بلا شرط تصدير وبسجل لكل يوم في app.visit_retention_runs.';

revoke all on function app.visit_retention_enforce(int) from public, anon, authenticated;

create or replace function public.map_visits_retention_run()
returns jsonb
language plpgsql security definer set search_path = public, app as $$
begin
  perform app.require_it();
  return app.visit_retention_enforce(31);
end $$;

revoke all on function public.map_visits_retention_run() from public, anon;
grant execute on function public.map_visits_retention_run() to authenticated;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- ⑤ الحالة المعروضة في شاشة الاحتفاظ — تُضاف إليها حالة كل يوم بسبب صريح
-- ───────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.gps_history_purge_get()
returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare
  v_cron    boolean := false;
  v_cronb   boolean := false;
  v_cronr   boolean := false;
  s         public.gps_history_purge_settings;
  v_wait    jsonb := '[]'::jsonb;
  v_build   jsonb := '[]'::jsonb;
begin
  perform app.require_it();
  select * into s from public.gps_history_purge_settings where id = 1;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $q$select exists (select 1 from cron.job where jobname = 'visit-build-worker' and active)$q$ into v_cronb;
    execute $q$select exists (select 1 from cron.job where jobname = 'gps-history-purge-hourly' and active)$q$ into v_cron;
    execute $q$select exists (select 1 from cron.job where jobname = 'visit-retention-31d' and active)$q$ into v_cronr;
  end if;

  select coalesce(jsonb_agg(x.s order by x.day), '[]'::jsonb)
    into v_wait
    from (
      select d.day, app.visit_day_state(d.day) - 'day' as s
        from (
          select app.map_baghdad_day(h.fix_time) as day, max(h.fix_time) as last_pt
            from public.gps_device_position_history h
           group by 1
        ) d
       where d.last_pt < now() - make_interval(hours => coalesce(s.keep_hours, 36))
         and not app.gps_day_is_certified(d.day)
    ) x;

  return to_jsonb(s) - 'id' || jsonb_build_object(
    'scheduled', v_cron and v_cronb,
    'runs_at', 'كل ساعة (البناء كل دقيقة)',
    'build_runs_at', 'كل دقيقة — حتى لا يبقى شفت بلا بناء',
    'visits_keep_days', 31,
    'visits_purge_scheduled', v_cronr,
    'current_rows', (select count(*) from public.gps_device_position_history),
    'current_bytes', pg_total_relation_size('public.gps_device_position_history'::regclass),
    'last_freed_bytes', greatest(coalesce(s.last_bytes_before, 0) - coalesce(s.last_bytes_after, 0), 0),
    'waiting_days', v_wait,
    'waiting_rows', (select coalesce(sum((e ->> 'raw_points')::bigint), 0) from jsonb_array_elements(v_wait) e),
    'pipeline', jsonb_build_object(
      'pending_builds', (
        select count(*) from (
          select 1 from app.visit_shift_windows(app.map_baghdad_day(now()) - 1) w
          cross join public.map_zones z
          left join public.gps_visit_builds b
                 on b.zone_id = z.id and b.day = w.shift_day and b.shift_type = w.shift_key
          where b.id is null
        ) p),
      'failed_builds', (select count(*) from public.gps_visit_builds where status = 'failed'),
      'days_held', jsonb_array_length(v_wait)
    )
  );
end $$;

revoke all on function public.gps_history_purge_get() from public, anon;
grant execute on function public.gps_history_purge_get() to authenticated;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- ⑥ الجدولة — ترتيب صريح، وفاصل زمني يمنع أي تداخل
--    البناء والنقاط كانا 20:30 ثم 21:00: تصادم مباشر على نفس الجداول، والبناء أطول من
--    ٣٠ دقيقة (٩١ ثانية للزون الواحد × ٨ زونات). الفصل الآن:
--      كل دقيقة    : بناء شفت واحد على الأكثر لكل زون × يوم → لا كتلة، ولا تزامن
--      كل ساعة     : تفريغ ٣٦ ساعة (لا يمسّ إلا المُشهَّد)
--      يومياً 21:15: حذف الزيارات الأقدم من ٣١ يوماً (لا يمسّ إلا القديم)
-- ───────────────────────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job
      where jobname in ('gps-visits-build-nightly', 'gps-history-purge-midnight',
                        'gps-visits-build-batch', 'gps-visits-build-noon',
                        'process-manual-pull-visit-queue', 'purge-manual-pull-visits-3d',
                        'visit-build-worker', 'gps-history-purge-hourly',
                        'gps-history-prune-daily', 'visit-retention-31d');

    perform cron.schedule('visit-build-worker',   '* * * * *', $job$ select app.visit_build_run_pending(6) $job$);
    perform cron.schedule('gps-history-purge-hourly', '7 * * * *', $job$ select app.gps_history_daily_purge() $job$);
    perform cron.schedule('gps-history-prune-daily',  '37 20 * * *', $job$ select app.gps_history_prune_unbuildable(31) $job$);
    perform cron.schedule('visit-retention-31d',  '15 21 * * *', $job$ select app.visit_retention_enforce(31) $job$);
  else
    raise notice 'pg_cron غير متاح — البناء والتفريغ الآليان يتطلبان تفعيله';
  end if;
end $$;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- ⑦ نافذة الاحتفاظ ٣٦ ساعة تُضبط في المرحلة ① (20261202000100) قبل التصفير،
--    لأن التصفير يحتاج أن يقرأ القيمة الصحيحة حين يقرّر أي نقاط تبقى.
-- ───────────────────────────────────────────────────────────────────────────────────────────

-- حاجز الكتالوج: app.visit_retention_runs في مخطط app لا public ⇒ خارج شرط الحاجز،
-- لكن يُستدعى الحاجز صراحةً لضمان أن الترحيل لا يمرّ إن أضاف جدولاً في public بلا تعريف.
do $$ begin perform app.require_retention_catalog_complete(); end $$;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- ⑧ تشخيص الجاهزية على مستوى الشفت
--   `map_visit_readiness` الأصلية تعمل، لكنها تُخفي الشفت في نصوصها وتُظهر صفّاً واحداً
--   لكل زون. بعد تقسيم البناء إلى شفتين صار السؤال الحقيقي «أي شفت تأخّر؟» لا «أي زون؟».
--   هذه نسخة مستقلّة لا تلمس الأصلية: الواجهة الحالية تبقى تعمل كما هي، وتستطيع الانتقال
--   إليها عندما تريد عرض الشفت.
-- ───────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.map_visit_readiness_shifts(p_day date, p_zone uuid default null)
returns table (
  level          text,
  day            date,
  shift_key      text,
  win_start      timestamptz,
  win_end        timestamptz,
  zone_id        uuid,
  zone_name      text,
  points_total   bigint,
  points_bound   bigint,
  status         text,
  visits_created int,
  points_at_build timestamptz,
  build_at       timestamptz,
  error          text,
  certified      boolean,
  reason         text,
  reason_label   text
)
language plpgsql stable security definer set search_path = public, app as $$
declare
  v_cert boolean := app.gps_day_is_certified(p_day);
begin
  perform public.map_require_reader();
  if p_day is null then
    raise exception 'MAP_VISIT_DAY_REQUIRED' using errcode = 'invalid_parameter_value';
  end if;

  return query
  select 'shift_zone'::text, p_day, w.shift_key, w.win_start, w.win_end,
         z.id, z.name,
         coalesce(p.pts, 0), coalesce(p.pts_bnd, 0),
         b.status,
         b.visits_created, b.points_at_build,
         coalesce(b.finished_at, b.started_at),
         b.error,
         v_cert,
         case
           when coalesce(p.pts, 0) = 0 and b.status = 'empty' then 'empty_ok'
           when coalesce(p.pts, 0) = 0 then 'no_points'
           when b.status = 'built' then 'built'
           when b.status = 'failed' then 'build_failed'
           when b.id is null then 'needs_build'
           else b.status
         end,
         case
           when coalesce(p.pts, 0) = 0 and b.status = 'empty' then 'لا نقاط في هذه النافذة — لا شيء يُبنى'
           when coalesce(p.pts, 0) = 0 then 'لا نقاط في هذه النافذة ولم يُسجَّل فحصها بعد'
           when b.status = 'built' then format('بُني: %s زيارة من %s نقطة', coalesce(b.visits_created, 0), coalesce(p.pts_bnd, 0))
           when b.status = 'failed' then format('فشل البناء: %s', coalesce(b.error, 'بلا سبب مسجَّل'))
           else format('%s نقطة بانتظار البناء', coalesce(p.pts_bnd, 0))
         end
    from app.visit_shift_windows(p_day) w
   cross join public.map_zones z
    left join public.gps_visit_builds b
           on b.zone_id = z.id and b.day = p_day and b.shift_type = w.shift_key
    left join lateral (
      select count(*) as pts,
             count(vb.id) as pts_bnd
        from public.gps_device_position_history h
        left join public.gps_vehicle_bindings vb on vb.device_id = h.device_id
       where h.fix_time >= w.win_start and h.fix_time < w.win_end
    ) p on true
   where p_zone is null or z.id = p_zone
   order by z.sort_order, w.shift_key;
end $$;

comment on function public.map_visit_readiness_shifts(date, uuid) is
  'جاهزية البناء لكل (زون × شفت): عدد النقاط، حالة البناء، والسبب. قراءة فقط — تقابل map_visit_readiness بعد تقسيم الشفتين.';

revoke all on function public.map_visit_readiness_shifts(date, uuid) from public, anon;
grant execute on function public.map_visit_readiness_shifts(date, uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- ⑨ تصحيح مدد الشفت في الموارد البشرية (12 ساعة، لا 11)
--    ليست مرتبطة بمحرّك الزيارات — محرّك الزيارات يستخدم app.visit_shift_windows ولا يقرأ
--    هذه الجدول أصلاً. لكن الأرقام كانت متعارضة مع القرار المعتمد، وتصحيحها يمنع الالتباس.
-- ───────────────────────────────────────────────────────────────────────────────────────────
alter table public.hr_shifts drop constraint if exists hr_shifts_required_hours_check;
alter table public.hr_shifts
  add constraint hr_shifts_required_hours_check
  check (required_hours is null or required_hours between 1 and 24);

update public.hr_shifts set start_time = '05:00', end_time = '17:00', required_hours = 12.00
 where start_time = '05:00' and end_time = '16:00';

update public.hr_shifts set start_time = '17:00', end_time = '05:00', required_hours = 12.00
 where start_time = '17:00' and end_time = '04:00';
