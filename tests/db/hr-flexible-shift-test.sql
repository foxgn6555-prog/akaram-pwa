-- اختبار 00215: الشفت المرن — لا تأخير داخل النافذة، الخروج المتوقع = الدخول + الساعات المطلوبة، النقص = خروج مبكر (بادئة fs)
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
insert into auth.users (id, email) values ('f5000000-0000-0000-0000-000000000001', 'fs-emp@t.iq'), ('f5000000-0000-0000-0000-000000000002', 'fs-night@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('f5000000-0000-0000-0000-000000000001', 'employee'), ('f5000000-0000-0000-0000-000000000002', 'employee') on conflict do nothing;
insert into public.employees (id, user_id, full_name, employee_number, hire_date, biometric_pin) values
  ('f5000000-0000-0000-0000-0000000000e1', 'f5000000-0000-0000-0000-000000000001', 'fs موظف مرن صباحي', 'FS-1', '2024-01-01', '9501'),
  ('f5000000-0000-0000-0000-0000000000e2', 'f5000000-0000-0000-0000-000000000002', 'fs موظف مرن مسائي', 'FS-2', '2024-01-01', '9502')
on conflict (id) do nothing;
insert into public.biometric_devices (id, serial_number, name, timezone_offset, is_active) values
  ('f5000000-0000-0000-0000-0000000000d1', 'FS-DEV-1', 'fs جهاز', '+03:00', true) on conflict (serial_number) do nothing;
select set_config('test.fs_m', (date_trunc('month', current_date) - interval '1 month')::date::text, false);

-- ① القالبان الافتراضيان موجودان: 12 ساعة، 05–16 و17–04؛ القيود تمنع مرناً بلا ساعات
do $$ declare s record; begin
  select * into s from public.hr_shifts where name = 'مرن صباحي';
  assert s.kind = 'flexible' and s.required_hours = 12 and s.start_time = '05:00' and s.end_time = '16:00', 'morning: ' || row_to_json(s)::text;
  select * into s from public.hr_shifts where name = 'مرن مسائي';
  assert s.kind = 'flexible' and s.required_hours = 12 and s.start_time = '17:00' and s.end_time = '04:00', 'evening: ' || row_to_json(s)::text;
  assert (select kind from public.hr_shifts where name = 'صباحي') = 'fixed', 'existing shifts stay fixed';
  begin insert into public.hr_shifts (name, start_time, end_time, kind) values ('fs bad', '05:00', '16:00', 'flexible'); raise exception 'should fail';
  exception when check_violation then null; end;
  -- التخصيص: ساعات مطلوبة 10 لقالب مرن مخصص
  insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, kind, required_hours) values ('f5000000-0000-0000-0000-0000000000a1', 'fs مرن 10س', '06:00', '20:00', 10, 'flexible', 10) on conflict (name) do nothing;
end $$;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from) values
  ('f5000000-0000-0000-0000-0000000000e1', (select id from public.hr_shifts where name = 'مرن صباحي'), '2024-01-01'),
  ('f5000000-0000-0000-0000-0000000000e2', (select id from public.hr_shifts where name = 'مرن مسائي'), '2024-01-01') on conflict do nothing;

-- ② مرن صباحي: دخول 07:10 (داخل النافذة) ⇒ لا تأخير؛ خروج 19:10 = 12 ساعة ⇒ حاضر بلا نقص
--    يوم آخر: دخول 09:00 خروج 17:00 (8 ساعات) ⇒ نقص 240 دقيقة = خروج مبكر؛ يوم ثالث: دخول 05:30 خروج 17:40 (12:10) ⇒ حاضر
do $$ declare m date := current_setting('test.fs_m')::date; n int; a record; e uuid := 'f5000000-0000-0000-0000-0000000000e1'; sh record; begin
  n := public.biometric_ingest('FS-DEV-1',
         '9501' || E'\t' || (m + 1)::text || ' 07:10:00' || E'\t' || '0' || E'\n' || '9501' || E'\t' || (m + 1)::text || ' 19:10:00' || E'\t' || '1' || E'\n' ||
         '9501' || E'\t' || (m + 2)::text || ' 09:00:00' || E'\t' || '0' || E'\n' || '9501' || E'\t' || (m + 2)::text || ' 17:00:00' || E'\t' || '1' || E'\n' ||
         '9501' || E'\t' || (m + 3)::text || ' 05:30:00' || E'\t' || '0' || E'\n' || '9501' || E'\t' || (m + 3)::text || ' 17:40:00' || E'\t' || '1', 'ATTLOG');
  assert n = 6, 'ingest ' || n;
  select * into sh from app.hr_effective_shift(e, m + 1);
  assert sh.kind = 'flexible' and sh.required_hours = 12, 'effective shift carries kind: ' || row_to_json(sh)::text;
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 1;
  assert a.status = 'present' and a.late_minutes = 0 and a.early_minutes = 0 and a.worked_minutes = 720, 'd1: ' || row_to_json(a)::text;
  assert a.expected_in = a.check_in and a.expected_out = a.check_in + interval '12 hours', 'd1 expected window from first punch: ' || row_to_json(a)::text;
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 2;
  assert a.late_minutes = 0 and a.early_minutes = 240 and a.status = 'early_leave' and a.worked_minutes = 480, 'd2 shortfall as early leave: ' || row_to_json(a)::text;
  assert a.shortfall_minutes = 240 and a.required_minutes = 720 and (a.proposed_deduction_minutes > 0 or a.proposed_deduction_days > 0), 'd2 enters auto deductions: ' || row_to_json(a)::text;
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 3;
  assert a.status = 'present' and a.late_minutes = 0 and a.early_minutes = 0 and a.worked_minutes = 730, 'd3: ' || row_to_json(a)::text;
end $$;

-- ③ مرن مسائي (يعبر منتصف الليل): دخول 18:00 خروج 06:00 اليوم التالي ⇒ 12 ساعة حاضر، بلا تأخير
do $$ declare m date := current_setting('test.fs_m')::date; n int; a record; e uuid := 'f5000000-0000-0000-0000-0000000000e2'; begin
  n := public.biometric_ingest('FS-DEV-1',
         '9502' || E'\t' || (m + 1)::text || ' 18:00:00' || E'\t' || '0' || E'\n' || '9502' || E'\t' || (m + 2)::text || ' 06:00:00' || E'\t' || '1', 'ATTLOG');
  assert n = 2, 'ingest night ' || n;
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 1;
  assert a.status = 'present' and a.late_minutes = 0 and a.early_minutes = 0 and a.worked_minutes = 720, 'night: ' || row_to_json(a)::text;
end $$;

-- ④ التخصيص: نقل الموظف إلى «مرن 10س» ⇒ دخول 08:00 خروج 18:00 = حاضر (10 ساعات تكفي)
do $$ declare m date := current_setting('test.fs_m')::date; n int; a record; e uuid := 'f5000000-0000-0000-0000-0000000000e1'; begin
  insert into public.employee_shift_assignments (employee_id, shift_id, effective_from) values (e, 'f5000000-0000-0000-0000-0000000000a1', m + 5);
  n := public.biometric_ingest('FS-DEV-1',
         '9501' || E'\t' || (m + 6)::text || ' 08:00:00' || E'\t' || '0' || E'\n' || '9501' || E'\t' || (m + 6)::text || ' 18:00:00' || E'\t' || '1', 'ATTLOG');
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 6;
  assert a.status = 'present' and a.early_minutes = 0 and a.worked_minutes = 600 and a.shift_name = 'fs مرن 10س', 'custom 10h: ' || row_to_json(a)::text;
end $$;
select 'test ok' as result;
