-- 00389-ب: «من في الدوام الآن» — حالات: حاضر، متأخر، لم يحضر بعد (missing)، قبل الدوام (upcoming)، غائب (انتهى الشفت)، إجازة، يوم راحة، بلا شفت، أكمل الدوام، صلاحيات
set client_min_messages = notice;
insert into auth.users (id, email) values ('b0a4d000-0000-0000-0000-0000000000a1', 'hr-nb@t.iq'), ('b0a4d000-0000-0000-0000-0000000000a2', 'emp-nb@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('b0a4d000-0000-0000-0000-0000000000a1', 'hr_officer'), ('b0a4d000-0000-0000-0000-0000000000a2', 'employee') on conflict do nothing;
do $$
declare today date := app.hr_local_date(now()); at_ts timestamptz := (today::timestamp + time '10:00') - app.hr_tz(); lt time := '10:00'; dow smallint := extract(dow from app.hr_local_date(now()))::smallint;
        s_now uuid := 'b0a4d000-0000-0000-0000-00000000005a'; s_up uuid := 'b0a4d000-0000-0000-0000-00000000005b'; s_end uuid := 'b0a4d000-0000-0000-0000-00000000005c'; s_rest uuid := 'b0a4d000-0000-0000-0000-00000000005d';
        n int; st text; safe boolean := true;
begin
  -- شفتات نسبية للوقت الحالي (آمنة بين 04:00 و20:00؛ خارجها تُفحص الحالات غير الزمنية فقط)
  insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values
    (s_now,  'nb-now',  case when safe then lt - interval '2 hours' else '00:01' end, case when safe then lt + interval '2 hours' else '23:59' end, 10, '{0,1,2,3,4,5,6}'),
    (s_up,   'nb-up',   case when safe then lt + interval '3 hours' else '23:50' end, case when safe then lt + interval '3 hours 30 minutes' else '23:58' end, 10, '{0,1,2,3,4,5,6}'),
    (s_end,  'nb-end',  case when safe then lt - interval '3 hours' else '00:01' end, case when safe then lt - interval '1 hour' else '00:02' end, 10, '{0,1,2,3,4,5,6}'),
    (s_rest, 'nb-rest', '08:00', '16:00', 10, array_remove('{0,1,2,3,4,5,6}'::smallint[], dow))
  on conflict (name) do nothing;
  insert into public.employees (id, employee_number, full_name, hire_date) values
    ('b0a4d000-0000-0000-0000-0000000000e1', 'NB-1', 'حاضر', '2024-01-01'), ('b0a4d000-0000-0000-0000-0000000000e2', 'NB-2', 'متأخر', '2024-01-01'),
    ('b0a4d000-0000-0000-0000-0000000000e3', 'NB-3', 'لم يحضر', '2024-01-01'), ('b0a4d000-0000-0000-0000-0000000000e4', 'NB-4', 'قبل الدوام', '2024-01-01'),
    ('b0a4d000-0000-0000-0000-0000000000e5', 'NB-5', 'غائب', '2024-01-01'), ('b0a4d000-0000-0000-0000-0000000000e6', 'NB-6', 'في إجازة', '2024-01-01'),
    ('b0a4d000-0000-0000-0000-0000000000e7', 'NB-7', 'يوم راحة', '2024-01-01'), ('b0a4d000-0000-0000-0000-0000000000e8', 'NB-8', 'بلا شفت', '2024-01-01'),
    ('b0a4d000-0000-0000-0000-0000000000e9', 'NB-9', 'أكمل', '2024-01-01'), ('b0a4d000-0000-0000-0000-0000000000ea', 'NB-10', 'منتهي الخدمة', '2024-01-01')
  on conflict (employee_number) do nothing;
  update public.employees set employment_status = 'terminated', terminated_at = today - 1 where id = 'b0a4d000-0000-0000-0000-0000000000ea';
  insert into public.employee_shift_assignments (employee_id, shift_id, effective_from) values
    ('b0a4d000-0000-0000-0000-0000000000e1', s_now, '2024-01-01'), ('b0a4d000-0000-0000-0000-0000000000e2', s_now, '2024-01-01'), ('b0a4d000-0000-0000-0000-0000000000e3', s_now, '2024-01-01'),
    ('b0a4d000-0000-0000-0000-0000000000e4', s_up, '2024-01-01'), ('b0a4d000-0000-0000-0000-0000000000e5', s_end, '2024-01-01'), ('b0a4d000-0000-0000-0000-0000000000e6', s_now, '2024-01-01'),
    ('b0a4d000-0000-0000-0000-0000000000e7', s_rest, '2024-01-01'), ('b0a4d000-0000-0000-0000-0000000000e9', s_now, '2024-01-01'), ('b0a4d000-0000-0000-0000-0000000000ea', s_now, '2024-01-01');
  insert into public.hr_attendance_days (employee_id, work_date, shift_name, check_in, late_minutes, status, source) values
    ('b0a4d000-0000-0000-0000-0000000000e1', today, 'nb-now', at_ts - interval '1 hour', 0, 'present', 'auto'),
    ('b0a4d000-0000-0000-0000-0000000000e2', today, 'nb-now', at_ts - interval '1 hour', 25, 'late', 'auto');
  insert into public.hr_attendance_days (employee_id, work_date, shift_name, check_in, check_out, status, source) values
    ('b0a4d000-0000-0000-0000-0000000000e9', today, 'nb-now', at_ts - interval '2 hours', at_ts - interval '5 minutes', 'present', 'auto');
  insert into public.hr_leaves (employee_id, kind, leave_type, start_date, end_date, status) values ('b0a4d000-0000-0000-0000-0000000000e6', 'leave', 'sick', today - 1, today + 1, 'approved');

  perform set_config('auth.user_id', 'b0a4d000-0000-0000-0000-0000000000a1', true);
  select count(*) into n from public.hr_now_board(null, null, 'NB-', at_ts); assert n = 9, format('rows = %s (terminated excluded)', n);
  assert (select state from public.hr_now_board(null, null, 'NB-1', at_ts)) = 'present';
  assert (select state from public.hr_now_board(null, null, 'NB-2', at_ts)) = 'late';
  assert (select late_minutes from public.hr_now_board(null, null, 'NB-2', at_ts)) = 25;
  assert (select state from public.hr_now_board(null, null, 'NB-6', at_ts)) = 'leave';
  assert (select leave_type from public.hr_now_board(null, null, 'NB-6', at_ts)) = 'sick';
  assert (select state from public.hr_now_board(null, null, 'NB-7', at_ts)) = 'rest';
  assert (select state from public.hr_now_board(null, null, 'NB-8', at_ts)) = 'off';
  assert (select state from public.hr_now_board(null, null, 'NB-9', at_ts)) = 'done';
  if safe then
    select state into st from public.hr_now_board(null, null, 'NB-3', at_ts); assert st = 'missing', format('NB-3 = %s', st);
    select state into st from public.hr_now_board(null, null, 'NB-4', at_ts); assert st = 'upcoming', format('NB-4 = %s', st);
    select state into st from public.hr_now_board(null, null, 'NB-5', at_ts); assert st = 'absent', format('NB-5 = %s', st);
    -- الترتيب: من لم يحضر أولًا ثم المتأخر
    assert (select employee_number from public.hr_now_board(null, null, 'NB-', at_ts) limit 1) = 'NB-3';
  else
    raise notice 'hr-now-board-test: الحالات الزمنية (missing/upcoming/absent) تُتخطّى خارج 04:00–20:00 بتوقيت بغداد';
  end if;
  -- الموظف لا يرى اللوحة
  perform set_config('auth.user_id', 'b0a4d000-0000-0000-0000-0000000000a2', true);
  assert (select count(*) from public.hr_now_board(null, null, null, at_ts)) = 0, 'employee can see board';
  perform set_config('auth.user_id', '', true);
  raise notice 'hr-now-board-test: OK';
end $$;
