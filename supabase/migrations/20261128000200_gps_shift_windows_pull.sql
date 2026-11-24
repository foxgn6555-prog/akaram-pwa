-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 20261128000200 — نوافذ الشفتات + إعادة السحب من المزوّد  (الجولة ②)
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- المشكلة التي تُحلّ:
--   طلب المالك: «أُحدّد التاريخ + ساعات الشفت (مثل مرن صباحي) فيسحب النقاط لهذه النافذة».
--   لكن لا يوجد في المنصة أي شيء يربط الشفت بنافذة زمنية قابلة للاستعلام:
--     · `hr_shifts` فيه start_time/end_time لكن لا أحد يحوّلها إلى timestamptz ليوم.
--     · `garage_departures.shift` قيمة نصية ('morning'/'evening'/'night') لا نافذة.
--     · `lvn-gps-sync action=history` يقبل `deviceId + day` فقط — **بلا نافذة ساعات**.
--
--   والنتيجة أن الشفت العابر لمنتصف الليل («مرن مسائي 17:00–04:00») لا يمكن التعبير عنه
--   إطلاقاً بالواجهة الحالية: سحب «يوم» واحد يعطي 00:00–24:00 بغداد، فيقطع الشفت نصفين.
--
-- ما يفعله هذا الترحيل:
--   ① app.map_baghdad_hour_window(day, from, to) — حدود نافذة داخل يوم بغداد مع دعم العبور.
--   ② app.map_shift_window(shift_id|shift_name, day) — نافذة الشفت بتوقيت بغداد.
--   ③ app.map_shift_windows_for_day(day) — كل الشفتات النشطة مع نافذتها لذلك اليوم.
--   ④ public.gps_shift_windows / gps_shift_window — الواجهة.
--   ⑤ public.gps_shift_pending — ما ينقص: لكل شفت، هل نقاطه في القاعدة؟ (قاعدة أم تحتاج سحباً)
--   ⑥ public.lvn_history_targets(day) — معرّفات أجهزة المزوّد للسحب، **دفعات** لا مصفوفة آلاف.
--
--   ملاحظة تصميمية مهمة: لا يُنشأ جدول «مهام سحب» جديد. الجدول الموجود
--   `gps_history_import_runs` فيه أصلاً `requested_by` و`status` و`range_from/to`،
--   وهو الأنسب لتتبّع سحب يوم لأسطول كامل. يُضاف عمود `batch_no` للتمييز.
--
-- التراجع:
--   drop function if exists public.lvn_history_targets(uuid, date, text);
--   drop function if exists public.lvn_history_target_batch(uuid, date, text, int);
--   drop function if exists public.gps_shift_pending(date);
--   drop function if exists public.gps_shift_windows(date);
--   drop function if exists public.gps_shift_window(uuid, text, date);
--   drop function if exists app.map_baghdad_hour_window(date, time, time);
--   drop function if exists app.map_shift_window(uuid, date);
--   drop function if exists app.map_shift_windows_for_day(date);
--   alter table public.gps_history_import_runs drop column if exists batch_no;
-- ═══════════════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────────────────
-- ① نافذة ساعات داخل يوم بغداد — مع دعم العبور عبر منتصف الليل
--    p_end <= p_start ⇒ النهاية في اليوم التالي (نفس عرف hr_shifts)
-- ───────────────────────────────────────────────────────────────────────────────────────
create or replace function app.map_baghdad_hour_window(p_day date, p_start time, p_end time)
returns table (win_start timestamptz, win_end timestamptz, crosses_midnight boolean, hours numeric)
language sql immutable set search_path = pg_catalog as $$
  select s.win_start, s.win_end, (p_end <= p_start), round(extract(epoch from (s.win_end - s.win_start)) / 3600.0, 2)
  from (
    select (p_day + p_start) at time zone 'Asia/Baghdad' as win_start,
           ((p_day + case when p_end <= p_start then 1 else 0 end) + p_end) at time zone 'Asia/Baghdad' as win_end
  ) s
$$;

comment on function app.map_baghdad_hour_window(date, time, time) is
  'نافذة ساعات داخل يوم بغداد. p_end ≤ p_start ⇒ تعبر منتصف الليل (الشفت الليلي 22:00→05:00).';

-- ───────────────────────────────────────────────────────────────────────────────────────
-- ② نافذة الشفت: من hr_shifts بالاسم أو بالمعرّف
--    يُرجع صفاً واحداً؛ الشفت غير الموجود ⇒ لا صفوف (يُعالَج في المُستدعي)
-- ───────────────────────────────────────────────────────────────────────────────────────
create or replace function app.map_shift_window(p_shift_id uuid, p_day date)
returns table (shift_id uuid, shift_name text, win_start timestamptz, win_end timestamptz,
               crosses_midnight boolean, hours numeric, work_days smallint[])
language sql stable set search_path = public, app, pg_catalog as $$
  select s.id, s.name, w.win_start, w.win_end, w.crosses_midnight, w.hours, s.work_days
    from public.hr_shifts s
    cross join lateral app.map_baghdad_hour_window(p_day, s.start_time, s.end_time) w
   where s.id = p_shift_id and s.is_active
$$;

comment on function app.map_shift_window(uuid, date) is
  'نافذة شفت واحد ليوم بغداد، مشتقّة من hr_shifts.start_time/end_time. تعبر منتصف الليل عند الحاجة.';

-- ───────────────────────────────────────────────────────────────────────────────────────
-- ③ كل الشفتات النشطة في يوم — مع طول النافذة وملاحظة التداخل
-- ───────────────────────────────────────────────────────────────────────────────────────
create or replace function app.map_shift_windows_for_day(p_day date)
returns table (shift_id uuid, shift_name text, win_start timestamptz, win_end timestamptz,
               crosses_midnight boolean, hours numeric, overlaps_with text[])
language plpgsql stable set search_path = public, app, pg_catalog as $$
begin
  return query
  with w as (
    select s.id, s.name, x.win_start, x.win_end, x.crosses_midnight, x.hours
      from public.hr_shifts s
      cross join lateral app.map_baghdad_hour_window(p_day, s.start_time, s.end_time) x
     where s.is_active
  )
  select w.id, w.name, w.win_start, w.win_end, w.crosses_midnight, w.hours,
         coalesce((
           select array_agg(o.name order by o.name)
             from w o
            where o.id <> w.id and o.win_start < w.win_end and o.win_end > w.win_start
         ), '{}')
    from w
   order by w.win_start;
end $$;

comment on function app.map_shift_windows_for_day(date) is
  'الشفتات النشطة مع نافذتها ليوم بغداد، ومَن يتداخل معها. يستعمل للتوضيح لا للتنفيذ: التداخل لا يمنع السحب.';

-- ───────────────────────────────────────────────────────────────────────────────────────
-- ④ تتبّع السحب: يُضاف عمود الدفعة إلى الجدول الموجود
-- ───────────────────────────────────────────────────────────────────────────────────────
alter table public.gps_history_import_runs
  add column if not exists batch_no int;

comment on column public.gps_history_import_runs.batch_no is
  'رقم الدفعة داخل عملية سحب يوم لأسطول كامل (null = سحب جهاز واحد كما كان).';

-- ───────────────────────────────────────────────────────────────────────────────────────
-- ⑤ أهداف السحب: أجهزة المزوّد النشطة لليوم، **دفعات** لا مصفوفة واحدة
--    السبب: 149 جهازاً × JSON واحد = كائن ضخم يعبر الشبكة ويعطّل الواجهة.
-- ───────────────────────────────────────────────────────────────────────────────────────
create or replace function public.lvn_history_targets(p_zone uuid default null, p_day date default null, p_shift text default null)
returns table (total_devices bigint, total_batches int)
language plpgsql stable security definer set search_path = public, app as $$
declare n bigint;
begin
  if auth.uid() is null or not app.has_role(array['it_admin','super_admin','ops_room','ops_room_manager']) then
    raise exception 'GPS_FORBIDDEN: لا تملك صلاحية سحب تاريخ GPS' using errcode = 'insufficient_privilege';
  end if;
  select count(*) into n
    from public.gps_devices d
    join public.gps_vehicle_bindings vb on vb.device_id = d.id
    join public.garage_vehicles v on v.id = vb.garage_vehicle_id
   where d.is_active;
  return query select n, greatest(1, ceil(n / 25.0))::int;
end $$;

create or replace function public.lvn_history_target_batch(
  p_zone uuid default null,
  p_day date default null,
  p_shift text default null,
  p_batch int default 0,
  p_size int default 25
) returns table (batch_no int, device_id uuid, external_id text, device_name text, vehicle_name text)
language plpgsql stable security definer set search_path = public, app as $$
declare lim int := greatest(1, least(coalesce(p_size, 25), 50));
begin
  if auth.uid() is null or not app.has_role(array['it_admin','super_admin','ops_room','ops_room_manager']) then
    raise exception 'GPS_FORBIDDEN: لا تملك صلاحية سحب تاريخ GPS' using errcode = 'insufficient_privilege';
  end if;
  return query
  select coalesce(p_batch, 0),
         d.id, d.external_id, d.name, v.vehicle_name
    from public.gps_devices d
    join public.gps_vehicle_bindings vb on vb.device_id = d.id
    join public.garage_vehicles v on v.id = vb.garage_vehicle_id
   where d.is_active
   order by v.vehicle_name, d.external_id
   offset greatest(0, coalesce(p_batch, 0)) * lim
   limit lim;
end $$;

revoke all on function public.lvn_history_targets(uuid, date, text) from public, anon;
revoke all on function public.lvn_history_target_batch(uuid, date, text, int, int) from public, anon;
grant execute on function public.lvn_history_targets(uuid, date, text) to authenticated;
grant execute on function public.lvn_history_target_batch(uuid, date, text, int, int) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────────────────
-- ⑥ الواجهة: نوافذ الشفتات
-- ───────────────────────────────────────────────────────────────────────────────────────
create or replace function public.gps_shift_windows(p_day date default null)
returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare d date := coalesce(p_day, app.map_baghdad_day(now()));
begin
  if auth.uid() is null or not app.has_role(array['it_admin','super_admin','ops_room','ops_room_manager']) then
    raise exception 'GPS_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'day', d,
    'windows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'shift_id', w.shift_id, 'shift_name', w.shift_name,
        'start', to_char(w.win_start at time zone 'Asia/Baghdad', 'HH24:MI'),
        'end', to_char(w.win_end at time zone 'Asia/Baghdad', 'HH24:MI'),
        'start_utc', w.win_start, 'end_utc', w.win_end,
        'crosses_midnight', w.crosses_midnight, 'hours', w.hours,
        'overlaps_with', to_jsonb(w.overlaps_with)
      ) order by w.win_start)
      from app.map_shift_windows_for_day(d) w), '[]'::jsonb)
  );
end $$;

create or replace function public.gps_shift_window(p_shift_id uuid default null, p_shift_name text default null, p_day date default null)
returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare d date := coalesce(p_day, app.map_baghdad_day(now())); s public.hr_shifts; w record;
begin
  if auth.uid() is null or not app.has_role(array['it_admin','super_admin','ops_room','ops_room_manager']) then
    raise exception 'GPS_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;
  if p_shift_id is null and p_shift_name is null then raise exception 'GPS_SHIFT_REQUIRED' using errcode = 'invalid_parameter_value'; end if;
  select * into s from public.hr_shifts
   where (p_shift_id is not null and id = p_shift_id)
      or (p_shift_id is null and name = p_shift_name);
  if s.id is null then raise exception 'GPS_SHIFT_NOT_FOUND' using errcode = 'no_data_found'; end if;
  select * into w from app.map_shift_window(s.id, d);
  return jsonb_build_object(
    'shift_id', s.id, 'shift_name', s.name, 'day', d,
    'start', to_char(w.win_start at time zone 'Asia/Baghdad', 'HH24:MI'),
    'end', to_char(w.win_end at time zone 'Asia/Baghdad', 'HH24:MI'),
    'start_utc', w.win_start, 'end_utc', w.win_end,
    'crosses_midnight', w.crosses_midnight, 'hours', w.hours,
    -- تنبيه صريح: النافذة قد تعبر منتصف الليل فتقرأ بيانات اليوم التالي
    'note', case when w.crosses_midnight
      then 'هذا الشفت يعبر منتصف الليل — نهايته ' || to_char(w.win_end at time zone 'Asia/Baghdad', 'HH24:MI') || ' من يوم ' || to_char((d + 1), 'YYYY-MM-DD')
      else null end
  );
end $$;

revoke all on function public.gps_shift_windows(date) from public, anon;
revoke all on function public.gps_shift_window(uuid, text, date) from public, anon;
grant execute on function public.gps_shift_windows(date) to authenticated;
grant execute on function public.gps_shift_window(uuid, text, date) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────────────────
-- ⑦ حالة الشفت: هل نقاط نافذته موجودة في القاعدة؟ (يقرّر: اقرأ محلياً أم اسحب)
--    هذا ما يمنع «صفر كاذب»: شفت بلا نقاط ليس شفتاً فارغاً، بل شفت غير مسحوب.
-- ───────────────────────────────────────────────────────────────────────────────────────
create or replace function public.gps_shift_pending(p_day date default null)
returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare
  d date := coalesce(p_day, app.map_baghdad_day(now()));
  w record;
  v_pts bigint;
  v_newest timestamptz;
  v_oldest timestamptz;
  v_built boolean;
  v_net bigint;
begin
  if auth.uid() is null or not app.has_role(array['it_admin','super_admin','ops_room','ops_room_manager']) then
    raise exception 'GPS_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;

  -- إجمالي الأجهزة (مرة واحدة)
  select count(*) into v_net from public.gps_devices d join public.gps_vehicle_bindings vb on vb.device_id = d.id where d.is_active;

  return jsonb_build_object(
    'day', d,
    'fleet', v_net,
    'shifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'shift_id', x.shift_id, 'shift_name', x.shift_name,
        'start', to_char(x.win_start at time zone 'Asia/Baghdad', 'HH24:MI'),
        'end', to_char(x.win_end at time zone 'Asia/Baghdad', 'HH24:MI'),
        'start_utc', x.win_start, 'end_utc', x.win_end,
        'crosses_midnight', x.crosses_midnight,
        'points', st.pts, 'oldest', st.oldest, 'newest', st.newest,
        'visits_built', st.built,
        'state', case
          -- نقاط موجودة داخل النافذة ⇒ محلي
          when coalesce(st.pts, 0) > 0 then 'local'
          -- لا نقاط ولا زيارة ⇒ لم يُسحب (أو مُسح) ⇒ يحتاج سحباً من المزوّد
          when coalesce(st.built, 0) = 0 then 'missing'
          -- زيارات بلا نقاط ⇒ بُني ثم حُذفت النقاط (تفريغ ٤٨ ساعة)
          else 'built_points_purged'
        end,
        'can_pull', app.map_baghdad_day(now()) - d <= 30
      ) order by x.win_start)
      from app.map_shift_windows_for_day(d) x
      cross join lateral (
        select
          (select count(*) from public.gps_device_position_history h
            where h.fix_time >= x.win_start and h.fix_time < x.win_end) as pts,
          (select min(h.fix_time) from public.gps_device_position_history h
            where h.fix_time >= x.win_start and h.fix_time < x.win_end) as oldest,
          (select max(h.fix_time) from public.gps_device_position_history h
            where h.fix_time >= x.win_start and h.fix_time < x.win_end) as newest,
          -- الزيارات لا تُشتق من النافذة بل من اليوم (المحرّك يبني يوماً كاملاً)،
          -- فلا نعدّ إلا زيارات تبدأ داخل نافذة الشفت.
          (select count(*) from public.map_visits v
            where app.map_baghdad_day(v.entered_at) = d
              and v.entered_at >= x.win_start and v.entered_at < x.win_end) as built
      ) st
    ), '[]'::jsonb)
  );
end $$;

comment on function public.gps_shift_pending(date) is
  'لكل شفت في يوم: هل نقاطه في القاعدة (local) أم لم تُسحب (missing) أم بُني ثم حُذفت نقاطه (built_points_purged). يمنع «صفر كاذب».';

revoke all on function public.gps_shift_pending(date) from public, anon;
grant execute on function public.gps_shift_pending(date) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────────────────
-- ⑧ تنقية: map_shift_windows_for_day تُستدعى من gps_shift_pending ⇒ ممنوحة للمصادَقين
-- ───────────────────────────────────────────────────────────────────────────────────────
revoke all on function app.map_shift_windows_for_day(date) from public, anon;
revoke all on function app.map_shift_window(uuid, date) from public, anon;
revoke all on function app.map_baghdad_hour_window(date, time, time) from public, anon;
grant execute on function app.map_shift_windows_for_day(date) to authenticated;
grant execute on function app.map_shift_window(uuid, date) to authenticated;
grant execute on function app.map_baghdad_hour_window(date, time, time) to authenticated;
