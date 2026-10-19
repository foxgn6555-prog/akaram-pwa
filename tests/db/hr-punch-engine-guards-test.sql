-- 00255 · حراسة محرك البصمة: الحد الأدنى بين الدخول والخروج (بصمة مكررة ≠ خروج مبكر) + تقييد نافذة الالتقاط كي لا تتداخل الأيام — كلاهما إعداد قابل للتعديل.
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
-- 00202: هذا الاختبار يفترض النموذج القديم (الغياب = يوم استقطاع مقترح)؛ في نموذج «الأيام المستحقة» الافتراضي الغياب يوم غير مدفوع بلا استقطاع (payroll-earned-days-test S7)
update public.hr_policy set settings = settings || '{"salary_model":"full_minus_absence","salary_day_basis":"fixed_30"}'::jsonb where id = 1;
update public.hr_policy set settings = settings || '{"backdated_max_days": 365}'::jsonb where id = 1;  -- 00197: الاختبار يطلب لأشهر ماضية
insert into auth.users (id, email) values
  ('2d000000-0000-0000-0000-00000000000a', 'pg-hr@t.iq'), ('2d000000-0000-0000-0000-00000000000b', 'pg-mgr@t.iq'), ('2d000000-0000-0000-0000-00000000000c', 'pg-emp@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('2d000000-0000-0000-0000-00000000000a', 'hr_officer'), ('2d000000-0000-0000-0000-00000000000b', 'employee'), ('2d000000-0000-0000-0000-00000000000c', 'employee')
on conflict do nothing;
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values
  ('2d000000-0000-0000-0000-0000000000d1', 'pg صباحي', '08:00', '16:00', 15, '{0,1,2,3,4,5,6}'),
  ('2d000000-0000-0000-0000-0000000000d2', 'pg مسائي', '14:00', '20:00', 10, '{0,1,2,3,4,5,6}'),
  ('2d000000-0000-0000-0000-0000000000d3', 'pg ليلي', '22:00', '06:00', 10, '{0,1,2,3,4,5,6}')
on conflict (name) do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, biometric_pin) values
  ('2d000000-0000-0000-0000-0000000000e0', '2d000000-0000-0000-0000-00000000000b', 'PG-MGR', 'مدير الدورة', '2024-01-01', '7200')
on conflict (employee_number) do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, biometric_pin, manager_id) values
  ('2d000000-0000-0000-0000-0000000000e1', '2d000000-0000-0000-0000-00000000000c', 'PG-EMP', 'موظف الدورة', '2024-01-01', '7201', '2d000000-0000-0000-0000-0000000000e0')
on conflict (employee_number) do nothing;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from) values
  ('2d000000-0000-0000-0000-0000000000e1', '2d000000-0000-0000-0000-0000000000d1', '2024-01-01'),
  ('2d000000-0000-0000-0000-0000000000e0', '2d000000-0000-0000-0000-0000000000d1', '2024-01-01')
on conflict do nothing;
-- أداة: بصمة بتوقيت بغداد
create or replace function pg_temp.pg_punch(p_pin text, p_day date, p_time time) returns void language sql as $$
  insert into public.biometric_punches (device_serial, pin, employee_id, punched_at, method)
  select 'PG', p_pin, e.id, (p_day + p_time)::timestamp - interval '3 hours', 'manual' from public.employees e where e.biometric_pin = p_pin
$$;
select auth.set_test_user('2d000000-0000-0000-0000-00000000000a');
insert into auth.users (id, email) values ('2d000000-0000-0000-0000-00000000000d', 'pg-it@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('2d000000-0000-0000-0000-00000000000d', 'it_admin') on conflict do nothing;

do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; e uuid := '2d000000-0000-0000-0000-0000000000e1'; a record; pol jsonb; begin
  -- الافتراضيات موجودة
  pol := app.hr_policy();
  assert (pol ->> 'min_punch_gap_minutes')::int = 30 and (pol ->> 'punch_window_auto_cap')::boolean, 'G0: الافتراضيات 30 دقيقة + تقييد مفعّل';

  -- G1 · بصمتان متقاربتان عند الدخول بلا خروج ⇒ بصمة ناقصة (لا خروج مبكر ولا استقطاع)
  perform pg_temp.pg_punch('7201', m + 1, '07:55'); perform pg_temp.pg_punch('7201', m + 1, '08:05');
  perform public.hr_attendance_evaluate(m + 1, m + 1, e);
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 1;
  assert a.status = 'incomplete' and a.check_out is null and a.early_minutes = 0 and coalesce(a.proposed_deduction_days, 0) = 0, 'G1 بصمة مكررة: ' || row_to_json(a)::text;
  -- G1b · بصمتان متقاربتان عند الخروج بعد دخول صحيح ⇒ حاضر (الخروج الأخير يُعتمد)
  perform pg_temp.pg_punch('7201', m + 2, '08:00'); perform pg_temp.pg_punch('7201', m + 2, '16:00'); perform pg_temp.pg_punch('7201', m + 2, '16:01');
  perform public.hr_attendance_evaluate(m + 2, m + 2, e);
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 2;
  assert a.status = 'present' and a.worked_minutes = 481, 'G1b: ' || row_to_json(a)::text;
  -- G1c · خروج فعلي قصير (45 دقيقة) أبعد من الحد ⇒ يبقى خروجاً مبكراً حقيقياً
  perform pg_temp.pg_punch('7201', m + 3, '08:00'); perform pg_temp.pg_punch('7201', m + 3, '08:45');
  perform public.hr_attendance_evaluate(m + 3, m + 3, e);
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 3;
  assert a.status = 'early_leave' and a.check_out is not null, 'G1c: ' || row_to_json(a)::text;

  -- G2 · نافذة 12 ساعة: خروج متأخر 22:00 لا يصبح دخول الغد
  perform set_config('auth.user_id', '2d000000-0000-0000-0000-00000000000d', false);
  perform public.hr_policy_set('{"punch_window_hours": 12}'::jsonb);
  perform set_config('auth.user_id', '2d000000-0000-0000-0000-00000000000a', false);
  perform pg_temp.pg_punch('7201', m + 5, '08:00'); perform pg_temp.pg_punch('7201', m + 5, '22:00');
  perform pg_temp.pg_punch('7201', m + 6, '08:00'); perform pg_temp.pg_punch('7201', m + 6, '16:00');
  perform public.hr_attendance_evaluate(m + 5, m + 6, e);
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 5;
  assert a.status = 'present' and (a.check_out at time zone 'Asia/Baghdad')::time = '22:00', 'G2 يوم 5: ' || row_to_json(a)::text;
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 6;
  assert a.status = 'present' and (a.check_in at time zone 'Asia/Baghdad')::time = '08:00' and a.worked_minutes = 480, 'G2 يوم 6 (كان يأخذ خروج الأمس دخولاً): ' || row_to_json(a)::text;
  -- G2b · إيقاف التقييد يعيد السلوك القديم (خيار صريح للمدير)
  perform set_config('auth.user_id', '2d000000-0000-0000-0000-00000000000d', false);
  perform public.hr_policy_set('{"punch_window_auto_cap": false}'::jsonb);
  perform set_config('auth.user_id', '2d000000-0000-0000-0000-00000000000a', false);
  perform public.hr_attendance_evaluate(m + 6, m + 6, e);
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 6;
  assert (a.check_in at time zone 'Asia/Baghdad')::time = '22:00', 'G2b بلا تقييد: ' || row_to_json(a)::text;

  -- G3 · إيقاف الحد الأدنى (0) يعيد اعتبار البصمة المتقاربة خروجاً؛ القيم خارج النطاق مرفوضة
  perform set_config('auth.user_id', '2d000000-0000-0000-0000-00000000000d', false);
  perform public.hr_policy_set('{"punch_window_auto_cap": true, "punch_window_hours": 4, "min_punch_gap_minutes": 0}'::jsonb);
  perform set_config('auth.user_id', '2d000000-0000-0000-0000-00000000000a', false);
  perform public.hr_attendance_evaluate(m + 1, m + 1, e);
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 1;
  assert a.status = 'early_leave', 'G3 بلا حد: ' || row_to_json(a)::text;
  perform set_config('auth.user_id', '2d000000-0000-0000-0000-00000000000d', false);
  begin perform public.hr_policy_set('{"min_punch_gap_minutes": 500}'::jsonb); raise exception 'G3: كان يجب رفض 500'; exception when others then if sqlerrm not like '%HR_POLICY_INVALID%' then raise; end if; end;
  perform public.hr_policy_set('{"min_punch_gap_minutes": 30}'::jsonb);
  raise notice 'hr-punch-engine-guards ✅';
end $$;
