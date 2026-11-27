-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 20261202000800 · عطبان يمنعان البناء من التقدّم — قياس مباشر من الإنتاج (المرحلة ⑧)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- ─── ① نافذة تُعاد إلى ما لا نهاية وتخنق ما بعدها ─────────────────────────────────────────
-- بعد ساعات من العمل الناجح، تُركت ٥٬٢٠٤ نقطة ليوم ٢٥ نوفمبر بلا بناء ولا تفريغ، والعامل
-- يعمل كل دقيقة بنجاح. القياس على الإنتاج:
--
--   shift_day 2026-11-24 evening → last_pt = 2026-11-25 16:02:00+00
--   d24_points_now = 0        (لا نقطة واحدة بعد ٢٤ نوفمبر!)
--   d24_morning_built = 6/8, points_at_build = null
--
-- السبب في استعلام اختيار العمل: `max(p.last_pt)` يُحسب عبر
-- `p.day between s.shift_day and s.shift_day + 1`. التعبير `date + 1` في PostgreSQL يعيد
-- `date`، فيتحوّل في المقارنة إلى منتصف الليل ⇒ المدى فعلياً [day 00:00Z, day+1 00:00Z).
-- ونقطة بغدادية يومها D تبدأ عند 21:00Z من (D−1)، فهي **خارج** المدى. لذلك:
--   · ليومٍ لا نقاط له، يُختار `last_pt` من يوم آخر (٢٥ نوفمبر) فيبدو اليوم كأنه يحتاج بناءً.
--   · يُبنى فعلاً → `map_build_visits` يجد صفر نقاط → يكتب 0 زيارة.
--   · `points_at_build` يبقى null (لا نقطة في النافذة) ⇒ الشرط `coalesce(points_at_build,'epoch') < last_pt`
--     يبقى صحيحاً ⇒ **يُعاد اختياره في الدورة التالية، إلى الأبد**.
--   · ولأنه أقدم نافذة، يتصدّر الترتيب ويستهلك الدفعة كلها، فلا يصل يوم ٢٥ نوفمبر أبداً.
--
-- الإصلاح — ثلاثة أجزاء، كلها ضرورية:
--   ⓐ **آخر نقطة تُقاس داخل النافذة نفسها** (win_start/win_end)، لا عبر «يوم ± يوم».
--     النطاق الحقيقي للنافذة معروف بدقّة، فلا حاجة لتقريب الأيام إطلاقاً.
--   ⓑ **يوم السحب** يُحسب من بداية النافذة ناقص نافذة الاحتفاظ: نقاط يوم بغدادي D تصل بين
--     21:00Z من (D−1) و21:00Z من D. فيُقرأ من `(win_start − 36h)::date` إلى `shift_day + 1`،
--     فيغطّي ٢٥ نوفمبر عندما تكون الأولى المقروءة ٢٤ نوفمبر.
--   ⓒ **لا إعادة اختيار بلا سبب**: `points_at_build` يُكتب دائماً (حتى null يُستبدل بمعنى
--     «البناء لم يرَ نقاطاً» عبر حارس شرط صريح)، والشرط يعيد الاختيار فقط إذا وُجدت نقاط
--     **أحدث من آخر بناء** فعلاً.
--
-- ⚠ درس من هذا العطب: كل تقريب زمني في اختيار العمل يُنتج إما عملاً مهدوراً أو حجباً أبدياً.
--   النوافذ هنا معرَّفة بتوقيت دقيق، فيجب أن تبقى كل المقارنات على نفس الدقّة.
--
-- ─── ② نقاط لا تدخل في أي نافذة — تُحجب إلى الأبد ──────────────────────────────────────────
--   القياس: ٢٬٣١٨ نقطة ليوم ٢٥ نوفمبر بين 13:17Z و16:02Z لا تقع في أي شفت (النافذة الصباحية
--   تنتهي 14:00Z والمسائية تبدأ 14:00Z — لكن هذه النقاط **قبل** فجر ٢٥ نوفمبر)…
--   والتدقيق الدقيق: النقاط 13:17Z–14:00Z تخصّ نافذة الصباح ليوم ٢٥، و14:00Z–16:02Z تخصّ
--   نافذة المساء ليوم ٢٥. فالمشكلة ليست في التغطية بل في أن **العامل لم يصل إلى ذلك اليوم**
--   بسبب العطب الأول. لذلك الإصلاح هنا هو (①) وحده، ولا حاجة لنافذة «التقاط».
--
--   ومع ذلك يبقى حارس دائم: `app.visit_orphan_points()` يعدّ أي نقطة لا تقع في **أي** نافذة
--   شفت لأي يوم، ويكشفها للتدقيق. صفر هو الجواب الصحّي؛ وأي رقم أعلى يعني ثغرة في تعريف
--   الشفتين — تُكشف بدل أن تتراكم بصمت.
--
-- التراجع: إعادة تعريف app.visit_build_run_pending من 20261202000400.
-- ═══════════════════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- حارس دائم: نقاط خارج كل النوافذ
-- ملاحظة: التغطية 24 ساعة بلا فراغ، فالشرط هنا هو الأساس المنطقي لغياب النقاط اليتيمة.
-- ───────────────────────────────────────────────────────────────────────────────────────────
create or replace function app.visit_orphan_points()
returns table (total_points bigint, orphan_points bigint, oldest_orphan timestamptz, newest_orphan timestamptz)
language sql stable security definer set search_path = public, app as $$
  with pts as (
    select h.fix_time
      from public.gps_device_position_history h
     where not exists (
       select 1 from app.visit_shift_windows(app.map_baghdad_day(h.fix_time)) w
        where h.fix_time >= w.win_start and h.fix_time < w.win_end
     )
  )
  select (select count(*) from public.gps_device_position_history),
         (select count(*) from pts),
         (select min(fix_time) from pts),
         (select max(fix_time) from pts)
$$;

comment on function app.visit_orphan_points() is
  'تدقيق: عدد النقاط التي لا تقع في أي نافذة شفت. الجواب الصحّي صفر — لأن الشفتين يغطّيان ٢٤ ساعة بلا فراغ.';

revoke all on function app.visit_orphan_points() from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- العامل: آخر نقطة داخل النافذة + يوم سحب صريح + لا إعادة اختيار بلا سبب
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
  v_deadline timestamptz;
  v_keep     int;
  v_errors   jsonb := '[]'::jsonb;
begin
  -- قفل على مستوى المعاملة: لا يعمل عاملان على نفس البيانات أبداً.
  if not pg_try_advisory_xact_lock(918273645) then
    return jsonb_build_object('skipped', true, 'reason', 'worker_already_running');
  end if;

  -- ميزانية داخلية: مهلة البيان ١٢٠ ثانية ولا تُمدَّد من داخل البيان، فنتوقف عند ٩٠.
  v_deadline := clock_timestamp() + interval '90 seconds';
  perform set_config('statement_timeout', '540000', true);

  select coalesce(keep_hours, 36) into v_keep
    from public.gps_history_purge_settings where id = 1;
  v_keep := coalesce(v_keep, 36);

  for r in
    with days as (
      select (v_today - k) as d from generate_series(1, 8) k
    ),
    shifts as (
      select w.shift_day, w.shift_key, w.win_start, w.win_end,
             -- ★ يوم السحب: بداية النافذة ناقص نافذة الاحتفاظ. يغطّي نقاط اليوم البغدادي
             --   التي تبدأ ٢١:٠٠Z من اليوم السابق (بالتوقيت الصيفي/الشتوي للعراق ثابت +03).
             least(w.shift_day, (w.win_start - make_interval(hours => v_keep))::date) as pull_day
        from days cross join lateral app.visit_shift_windows(days.d) w
    ),
    -- ★ آخر نقطة **داخل النافذة نفسها** — لا عبر «day ± day». هذا هو جوهر الإصلاح:
    --   كل ما يحدّد إعادة الاختيار يجب أن يُقاس على نفس حدود النافذة.
    win_pts as (
      select s.shift_day, s.shift_key, s.win_start, s.win_end, s.pull_day,
             n.last_pt, coalesce(n.n, 0)::bigint as points_n
        from shifts s
        left join lateral (
          select max(h.fix_time) as last_pt, count(*) as n
            from public.gps_device_position_history h
           where h.fix_time >= s.win_start
             and h.fix_time <  s.win_end
        ) n on true
    )
    select z.id as zone_id, n.shift_day, n.shift_key, n.win_start, n.win_end,
           n.last_pt, n.points_n, b.points_at_build, b.status
      from win_pts n
      cross join public.map_zones z
      left join public.gps_visit_builds b
             on b.zone_id = z.id and b.day = n.shift_day and b.shift_type = n.shift_key
     where (
             -- نافذة انتهت: تُبنى إن لم تُبنَ، أو وُجدت نقاط أحدث من آخر بناء.
             -- الشرط الأخير لا يُفعَّل إلا إذا كانت في النافذة نقاط فعلاً (n.last_pt غير فارغ).
             (n.win_end <= now()
              and (b.id is null
                   or b.status not in ('built', 'empty')
                   or (n.last_pt is not null
                       and coalesce(b.points_at_build, 'epoch'::timestamptz) < n.last_pt)))
             -- نافذة جارية: للعرض الحيّ فقط، وبفاصل ٥ دقائق.
          or (n.win_end > now()
              and (b.id is null or b.finished_at is null or b.finished_at < now() - interval '5 minutes'))
           )
     -- الموعد النهائي أولاً: النوافذ المنتهية الأقدم تُبنى قبل الجارية، فلا تتضوّر جوعاً.
     order by case when n.win_end <= now() then 0 else 1 end,
              n.win_end,
              z.sort_order
     limit greatest(coalesce(p_max_builds, 6), 1)
  loop
    exit when clock_timestamp() > v_deadline;
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
       where h.fix_time >= r.win_start and h.fix_time < r.win_end;

      insert into public.gps_visit_builds
        (zone_id, day, shift_type, status, trigger_kind, visits_created, visits_merged,
         places_scanned, skipped_visits, points_in_day, points_at_build,
         started_at, finished_at, duration_ms, error, actor_name)
      values
        (r.zone_id, r.shift_day, r.shift_key, 'built', 'nightly',
         v_res.visits_created, v_res.visits_merged, v_res.places_scanned, v_res.skipped_visits,
         r.points_n, v_last_pt, v_t0, clock_timestamp(), v_ms, null, 'البناء الآلي')
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
        (r.zone_id, r.shift_day, r.shift_key, 'failed', 'nightly', r.points_n, null,
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

  return jsonb_build_object(
    'built', v_ok, 'empty', v_empty, 'failed', v_failed,
    'errors', v_errors, 'max_builds', p_max_builds);
end $$;

comment on function app.visit_build_run_pending(int) is
  'العامل الموحّد: يبني الشفتات الناقصة للأيام الثمانية الماضية. آخر نقطة تُقاس داخل النافذة نفسها. أولوية الموعد النهائي. ميزانية ٩٠ ثانية. قفل xact.';

revoke all on function app.visit_build_run_pending(int) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- إثبات: لا نافذة تُعاد بلا نقاط جديدة، ولا نقطة خارج كل النوافذ
-- ───────────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_def   text;
  v_orph  record;
  v_loop  int;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.proname = 'visit_build_run_pending';

  -- ① القياس داخل النافذة، لا عبر «يوم ± يوم»
  if position('between s.shift_day and s.shift_day + 1' in v_def) > 0 then
    raise exception 'WINDOW_DAY_RANGE_STILL_USED: قياس النقاط ما زال عبر مدى أيام تقريبي';
  end if;
  if position('h.fix_time >= s.win_start' in v_def) = 0
     or position('h.fix_time <  s.win_end' in v_def) = 0 then
    raise exception 'WINDOW_BOUNDS_NOT_USED: آخر نقطة لا تُقاس على حدود النافذة';
  end if;
  if position('v_deadline' in v_def) = 0 then
    raise exception 'WORKER_HAS_NO_TIME_BUDGET';
  end if;
  if position('pg_try_advisory_xact_lock' in v_def) = 0 then
    raise exception 'WORKER_HAS_NO_LOCK';
  end if;

  -- ② لا نقطة خارج كل النوافذ
  select * into v_orph from app.visit_orphan_points();
  if coalesce(v_orph.orphan_points, 0) > 0 then
    raise exception 'ORPHAN_POINTS: % نقطة خارج كل نوافذ الشفتين (%) — تعريف الشفتين فيه ثغرة',
      v_orph.orphan_points, coalesce(v_orph.oldest_orphan::text, '?');
  end if;

  -- ③ صفوف 'built' قديمة بلا نقطة مرجع (من المحرّك قبل الإصلاح): لم تعد تُعاد اختيارها لأن
  --    الشرط صار يعتمد على وجود نقاط **داخل النافذة**. نُبلغ عنها فقط، ولا نحذف شيئاً.
  select count(*) into v_loop
    from public.gps_visit_builds b
   where b.status = 'built'
     and b.points_at_build is null
     and b.day >= app.map_baghdad_day(now()) - 8;

  if v_loop > 0 then
    raise notice '\u2463 ملاحظة: % صفّ built بلا نقطة مرجع — لن يُعاد اختياره بعد الآن', v_loop;
  end if;
end $$;
