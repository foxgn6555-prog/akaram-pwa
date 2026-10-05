-- 00179 · إعدادات محرك البصمة (نافذة الالتقاط/الاحتساب التلقائي) + اكتمال كشف المالية + تفاصيل الأيام (بادئة es)
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
insert into auth.users (id, email) values
  ('e5000000-0000-0000-0000-00000000000a', 'es-it@t.iq'), ('e5000000-0000-0000-0000-00000000000b', 'es-ops@t.iq'),
  ('e5000000-0000-0000-0000-00000000000c', 'es-fin@t.iq'), ('e5000000-0000-0000-0000-00000000000d', 'es-emp@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('e5000000-0000-0000-0000-00000000000a', 'it_admin'), ('e5000000-0000-0000-0000-00000000000b', 'ops_room'),
  ('e5000000-0000-0000-0000-00000000000c', 'finance_officer'), ('e5000000-0000-0000-0000-00000000000d', 'employee')
on conflict do nothing;
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values
  ('e5000000-0000-0000-0000-0000000000d1', 'es صباحي', '08:00', '16:00', 15, '{0,1,2,3,4,5,6}') on conflict (name) do nothing;
-- موظفان: واحد ببصمة، وآخر إداري بلا بصمة (راتب شهري) + ثالث أُنهيت خدمته قبل الشهر + رابع عُيّن بعده
insert into public.employees (id, employee_number, full_name, hire_date, biometric_pin) values
  ('e5000000-0000-0000-0000-0000000000e1', 'ES-BIO', 'موظف ببصمة', '2024-01-01', '7301'),
  ('e5000000-0000-0000-0000-0000000000e2', 'ES-OFF', 'إداري بلا بصمة', '2024-01-01', null),
  ('e5000000-0000-0000-0000-0000000000e4', 'ES-NEW', 'معيّن لاحقاً', current_date, null)
on conflict (employee_number) do nothing;
insert into public.employees (id, employee_number, full_name, hire_date, biometric_pin, employment_status, terminated_at) values
  ('e5000000-0000-0000-0000-0000000000e3', 'ES-OLD', 'منتهي الخدمة', '2024-01-01', null, 'terminated', (date_trunc('month', current_date) - interval '2 month')::date)
on conflict (employee_number) do nothing;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from) values
  ('e5000000-0000-0000-0000-0000000000e1', 'e5000000-0000-0000-0000-0000000000d1', '2024-01-01') on conflict do nothing;
create or replace function pg_temp.es_punch(p_pin text, p_day date, p_time time) returns void language sql as $$
  insert into public.biometric_punches (device_serial, pin, employee_id, punched_at, method)
  select 'ES', p_pin, e.id, (p_day + p_time)::timestamp - interval '3 hours', 'manual' from public.employees e where e.biometric_pin = p_pin
$$;

-- ═══ S1 · الإعدادات الجديدة موجودة بقيمها الافتراضية ويمكن ضبطها من IT فقط ═══
select auth.set_test_user('e5000000-0000-0000-0000-00000000000a');
do $$ declare p jsonb; ok boolean := false; begin
  p := app.hr_policy();
  assert (p ->> 'punch_window_hours')::int = 4 and (p ->> 'auto_evaluate_enabled')::boolean and (p ->> 'evaluate_lookback_days')::int = 2, 'S1 defaults: ' || p::text;
  begin perform public.hr_policy_set('{"punch_window_hours": 20}'); exception when others then ok := sqlerrm like '%HR_POLICY_INVALID%'; end;
  assert ok, 'S1 window bound';
  perform public.hr_policy_set('{"punch_window_hours": 2, "evaluate_lookback_days": 5}');
  assert (app.hr_policy() ->> 'punch_window_hours')::int = 2, 'S1 saved';
  raise notice 'S1 ✅ إعدادات المحرك محمية ومضبوطة';
end $$;
select auth.set_test_user('e5000000-0000-0000-0000-00000000000b');
do $$ declare ok boolean := false; begin
  begin perform public.hr_policy_set('{"punch_window_hours": 3}'); exception when others then ok := sqlerrm like '%HR_FORBIDDEN%'; end;
  assert ok, 'S1 ops cannot set policy';
end $$;

-- ═══ S2 · نافذة الالتقاط تُطبَّق: بنافذة ساعتين بصمة 05:30 (قبل 08:00 بساعتين ونصف) لا تُلتقط؛ بنافذة 4 تُلتقط ═══
reset role; select set_config('auth.user_id','', false);
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; a record; begin
  perform pg_temp.es_punch('7301', m + 2, '05:30'); perform pg_temp.es_punch('7301', m + 2, '16:00');
  select * into a from public.hr_attendance_days where employee_id = 'e5000000-0000-0000-0000-0000000000e1' and work_date = m + 2;
  assert a.status = 'incomplete' and a.check_out is null, 'S2 window 2h: ' || row_to_json(a)::text;
  update public.hr_policy set settings = settings || '{"punch_window_hours": 4}' where id = 1;
  perform app.hr_evaluate_day('e5000000-0000-0000-0000-0000000000e1', m + 2);
  select * into a from public.hr_attendance_days where employee_id = 'e5000000-0000-0000-0000-0000000000e1' and work_date = m + 2;
  assert a.status = 'present' and a.worked_minutes = 630, 'S2 window 4h: ' || row_to_json(a)::text;
  raise notice 'S2 ✅ نافذة الالتقاط من الإعدادات';
end $$;

-- ═══ S3 · إيقاف الاحتساب التلقائي: البصمة الجديدة لا تولّد يوماً؛ الاحتساب اليومي يُسجَّل متخطّى؛ اليدوي يعمل ═══
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; n int; c int; begin
  update public.hr_policy set settings = settings || '{"auto_evaluate_enabled": false}' where id = 1;
  perform pg_temp.es_punch('7301', m + 3, '08:00'); perform pg_temp.es_punch('7301', m + 3, '16:00');
  select count(*) into n from public.hr_attendance_days where employee_id = 'e5000000-0000-0000-0000-0000000000e1' and work_date = m + 3;
  assert n = 0, 'S3 trigger skipped: ' || n;
  select count(*) into c from public.integration_logs where endpoint = 'hr_evaluate_daily' and payload ->> 'skipped' = 'true';
  perform app.hr_evaluate_daily();
  select count(*) into n from public.integration_logs where endpoint = 'hr_evaluate_daily' and payload ->> 'skipped' = 'true';
  assert n = c + 1, 'S3 daily logged skipped';
  perform app.hr_evaluate_day('e5000000-0000-0000-0000-0000000000e1', m + 3);
  select count(*) into n from public.hr_attendance_days where employee_id = 'e5000000-0000-0000-0000-0000000000e1' and work_date = m + 3 and status = 'present';
  assert n = 1, 'S3 manual works';
  update public.hr_policy set settings = settings || '{"auto_evaluate_enabled": true}' where id = 1;
  perform pg_temp.es_punch('7301', m + 4, '08:00'); perform pg_temp.es_punch('7301', m + 4, '16:00');
  select count(*) into n from public.hr_attendance_days where employee_id = 'e5000000-0000-0000-0000-0000000000e1' and work_date = m + 4 and status = 'present';
  assert n = 1, 'S3 re-enabled';
  raise notice 'S3 ✅ مفتاح الاحتساب التلقائي يعمل في الاتجاهين';
end $$;

-- ═══ S4 · كشف الشهر يشمل الإداري بلا بصمة ويستثني المنتهي قبل الشهر والمعيّن بعده ═══
select auth.set_test_user('e5000000-0000-0000-0000-00000000000b');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; x uuid; r record; n int; begin
  x := public.ops_month_export(m);
  select count(*) into n from public.hr_month_export_rows where export_id = x and employee_number = 'ES-OFF';
  assert n = 1, 'S4 office employee included';
  select * into r from public.hr_month_export_rows where export_id = x and employee_number = 'ES-OFF';
  assert r.working_days = 0 and r.days_absent = 0 and r.auto_deduction_days = 0, 'S4 office zeros: ' || row_to_json(r)::text;
  select count(*) into n from public.hr_month_export_rows where export_id = x and employee_number in ('ES-OLD', 'ES-NEW');
  assert n = 0, 'S4 excluded old/new: ' || n;
  select count(*) into n from public.hr_month_export_rows where export_id = x and employee_number = 'ES-BIO' and days_present = 3;
  assert n = 1, 'S4 bio employee present days';
  raise notice 'S4 ✅ الكشف مكتمل وصحيح';
end $$;

-- ═══ S5 · المالية ترى تفاصيل أيام الموظف؛ الموظف العادي لا يرى ═══
select auth.set_test_user('e5000000-0000-0000-0000-00000000000c');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; n int; begin
  select count(*) into n from public.hr_employee_month_days('e5000000-0000-0000-0000-0000000000e1', m) where status = 'present';
  assert n = 3, 'S5 finance sees days: ' || n;
  select count(*) into n from public.finance_payroll_sheet(m) where employee_number = 'ES-OFF';
  assert n = 1, 'S5 finance sheet has office employee';
end $$;
select auth.set_test_user('e5000000-0000-0000-0000-00000000000d');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; n int; begin
  select count(*) into n from public.hr_employee_month_days('e5000000-0000-0000-0000-0000000000e1', m);
  assert n = 0, 'S5 employee blocked';
  raise notice 'S5 ✅ تفاصيل الأيام بصلاحيات صحيحة';
end $$;
reset role; select set_config('auth.user_id','', false);
