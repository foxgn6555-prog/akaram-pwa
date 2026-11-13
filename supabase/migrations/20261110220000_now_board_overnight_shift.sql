-- ④-46 / V-42 — إصلاح عرض الشفت الليلي (الممتد بعد منتصف الليل) في hr_now_board
-- القرار: الخيار (ب) — «قبل الدوام» قبل البداية + «غائب» بعد نهاية الشفت الليلي، ويوم الحضور = يوم بداية الشفت.
-- أثر التعديل: عرض فقط (state) + قراءة سجل اليوم السابق لصاحب الشفت الليلي قبل بداية شفته. لا كتابة، لا تغيير في محرّك الحضور أو الخصومات.
-- طريقة التطبيق: استبدالات نصّية دقيقة على تعريف الدالة (بدون إعادة كتابتها) مع تحقّق من عدد المطابقات.

do $$
declare
  v_def text;
  v_new text;
  v_n int;
  r record;
  reps text[][] := array[
    -- ① قراءة سجل اليوم السابق لصاحب الشفت الليلي قبل بداية شفته (وليس بعده)
    array[
      'left join public.hr_attendance_days a on a.employee_id = e.id and a.work_date = c.today',
      E'left join lateral (select (sh.shift_name is not null and sh.end_time <= sh.start_time and c.lt < sh.start_time) as use_prev) ow on true\r\n    left join public.hr_attendance_days ap on ap.employee_id = e.id and ap.work_date = c.today - 1 and ow.use_prev\r\n    left join public.hr_attendance_days a on a.employee_id = e.id and a.work_date = c.today'
    ],
    -- ② حقول السجل تُقرأ من اليوم السابق عند الحاجة
    array[
      'a.status as att_status, a.check_in, a.check_out, coalesce(a.late_minutes, 0) as late_minutes, a.is_rest_day,',
      'case when ow.use_prev then ap.status else a.status end as att_status, case when ow.use_prev then ap.check_in else a.check_in end as check_in, case when ow.use_prev then ap.check_out else a.check_out end as check_out, coalesce(case when ow.use_prev then ap.late_minutes else a.late_minutes end, 0) as late_minutes, coalesce(case when ow.use_prev then ap.is_rest_day else a.is_rest_day end, false) as is_rest_day,'
    ],
    -- ③ بدأ الشفت؟ للشفت الليلي: من 17:00 مساءً حتى 04:00 فجراً (لا «بدأ دائماً»)
    array['else true end as started,', 'else (c.lt >= sh.start_time or c.lt < sh.end_time) end as started,'],
    -- ④ انتهى الشفت؟ للشفت الليلي: من 04:00 حتى 17:00 (لا «لم ينتهِ دائماً»)
    array['else false end as ended,', 'else (c.lt >= sh.end_time and c.lt < sh.start_time) end as ended,'],
    -- ⑤ تجاوز فترة السماح؟ للشفت الليلي: من البداية+السماح حتى النهاية
    array['else true end as grace_passed',
          'else (c.lt >= sh.start_time + make_interval(mins => coalesce(sh.grace_minutes, 0)) or c.lt < sh.end_time) end as grace_passed']
  ];
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'hr_now_board';

  if v_def is null then raise exception 'hr_now_board not found'; end if;
  if position('ow.use_prev' in v_def) > 0 then raise exception 'already patched'; end if;

  v_new := v_def;
  for r in select generate_subscripts(reps, 1) as i loop
    v_n := (length(v_new) - length(replace(v_new, reps[r.i][1], ''))) / length(reps[r.i][1]);
    if v_n <> 1 then raise exception 'pattern % matched % times (expected 1)', r.i, v_n; end if;
    v_new := replace(v_new, reps[r.i][1], reps[r.i][2]);
  end loop;

  execute v_new;

  raise notice 'patched: use_prev=% started=% ended=% grace=%',
    position('use_prev' in v_new) > 0,
    position('or c.lt < sh.end_time) end as started' in v_new) > 0,
    position('and c.lt < sh.start_time) end as ended' in v_new) > 0,
    position('or c.lt < sh.end_time) end as grace_passed' in v_new) > 0;
end $$;

-- تحقّق: الشفت الليلي EMP-003 (17:00–04:00) قبل البداية / داخل الشفت / بعد النهاية
select p_at::text as at_time,
       (select state from public.hr_now_board(p_at => p_at) where employee_number = 'EMP-003') as emp003_state,
       (select count(*) from public.hr_now_board(p_at => p_at) where state = 'missing') as missing_now
from (values ('2026-11-10 10:00:00+03'::timestamptz), ('2026-11-10 17:30:00+03'), ('2026-11-10 22:00:00+03')) v(p_at);
