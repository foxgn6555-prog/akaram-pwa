-- 00175: وحدة غير المطابقين (تقرير يومي + فلاتر فروع) والإرسال التلقائي عند إضافة موظف
reset role; select set_config('auth.user_id','', false);
insert into auth.users (id, email) values ('b8000000-0000-0000-0000-00000000000a', 'hr-um@t.iq'), ('b8000000-0000-0000-0000-00000000000e', 'emp-um@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('b8000000-0000-0000-0000-00000000000a', 'hr_officer'), ('b8000000-0000-0000-0000-00000000000e', 'employee') on conflict do nothing;
insert into public.branches (id, name, code) values ('cb000000-0000-0000-0000-000000000001', 'فرع الكرخ', 'UMK'), ('cb000000-0000-0000-0000-000000000002', 'فرع الرصافة', 'UMR') on conflict (id) do nothing;
insert into public.biometric_devices (id, serial_number, name, branch_id, mode, is_active, timezone_offset) values
  ('dd000000-0000-0000-0000-0000000000e1', 'UM-DEV-1', 'بصمة الكرخ', 'cb000000-0000-0000-0000-000000000001', 'adms_push', true, '+03:00'),
  ('dd000000-0000-0000-0000-0000000000e2', 'UM-DEV-2', 'بصمة الرصافة', 'cb000000-0000-0000-0000-000000000002', 'adms_push', true, '+03:00')
on conflict (serial_number) do nothing;
insert into public.biometric_device_users (device_serial, pin, name) values ('UM-DEV-1', '901', 'كريم جاسم') on conflict do nothing;
-- PIN 901 على الكرخ: يوم 1 بصمتان (08:00→16:30 بتوقيت بغداد = 05:00Z→13:30Z)، يوم 2 بصمة واحدة، يوم 3 لا شيء، يوم 4 بصمة عند 23:30 بغداد (20:30Z) + 05:00 اليوم التالي
insert into public.biometric_punches (device_serial, device_id, pin, punched_at, direction, method) values
  ('UM-DEV-1', 'dd000000-0000-0000-0000-0000000000e1', '901', '2026-09-01T05:00:00Z', 'unknown', 'adms_push'),
  ('UM-DEV-1', 'dd000000-0000-0000-0000-0000000000e1', '901', '2026-09-01T13:30:00Z', 'unknown', 'adms_push'),
  ('UM-DEV-1', 'dd000000-0000-0000-0000-0000000000e1', '901', '2026-09-02T05:05:00Z', 'unknown', 'adms_push'),
  ('UM-DEV-1', 'dd000000-0000-0000-0000-0000000000e1', '901', '2026-09-04T20:30:00Z', 'unknown', 'adms_push'),
  -- PIN 902 على الرصافة يوم 2 فقط
  ('UM-DEV-2', 'dd000000-0000-0000-0000-0000000000e2', '902', '2026-09-02T04:00:00Z', 'unknown', 'adms_push'),
  ('UM-DEV-2', 'dd000000-0000-0000-0000-0000000000e2', '902', '2026-09-02T12:00:00Z', 'unknown', 'adms_push')
on conflict do nothing;

set role authenticated;
select set_config('auth.user_id','b8000000-0000-0000-0000-00000000000a', false); select set_config('auth.role','authenticated', false);
do $$ declare r record; d jsonb; n int; begin
  select count(*) into n from public.biometric_unmatched_report('2026-09-01', '2026-09-05');
  if n <> 2 then raise exception 'FAIL: عدد الأشخاص % (المتوقع 2)', n; end if;

  select * into r from public.biometric_unmatched_report('2026-09-01', '2026-09-05') where pin = '901';
  if r.person_name <> 'كريم جاسم' or r.branch_name <> 'فرع الكرخ' or r.device_name <> 'بصمة الكرخ' then raise exception 'FAIL: بيانات الشخص %', r; end if;
  if jsonb_array_length(r.days) <> 5 then raise exception 'FAIL: عدد الأيام %', jsonb_array_length(r.days); end if;
  d := r.days->0; -- يوم 1: حاضر 8:30 ساعة = 510 دقيقة
  if d->>'status' <> 'present' or (d->>'minutes')::int <> 510 or d->>'first' <> '08:00' or d->>'last' <> '16:30' then raise exception 'FAIL: يوم 1 %', d; end if;
  d := r.days->1; -- يوم 2: بصمة ناقصة
  if d->>'status' <> 'missing' or (d->>'n')::int <> 1 or d->>'first' <> '08:05' or d->>'last' is not null then raise exception 'FAIL: يوم 2 %', d; end if;
  d := r.days->2; -- يوم 3: غائب
  if d->>'status' <> 'absent' or (d->>'n')::int <> 0 then raise exception 'FAIL: يوم 3 %', d; end if;
  d := r.days->3; -- يوم 4: بصمة 23:30 بتوقيت بغداد تُحسب في يوم 4 (لا في يوم 5 كما في UTC)
  if d->>'status' <> 'missing' or d->>'first' <> '23:30' then raise exception 'FAIL: يوم 4 (منطقة الوقت) %', d; end if;
  if r.present_days <> 1 or r.missing_days <> 2 or r.absent_days <> 2 or r.total_minutes <> 510 then raise exception 'FAIL: المجاميع % % % %', r.present_days, r.missing_days, r.absent_days, r.total_minutes; end if;

  -- فلتر الفرع
  select count(*) into n from public.biometric_unmatched_report('2026-09-01', '2026-09-05', 'cb000000-0000-0000-0000-000000000002');
  if n <> 1 then raise exception 'FAIL: فلتر الفرع %', n; end if;
  -- بحث بالاسم
  select count(*) into n from public.biometric_unmatched_report('2026-09-01', '2026-09-05', null, 'كريم');
  if n <> 1 then raise exception 'FAIL: البحث %', n; end if;
  -- فلتر الأيام يضيّق الأعمدة
  select * into r from public.biometric_unmatched_report('2026-09-02', '2026-09-02') where pin = '902';
  if jsonb_array_length(r.days) <> 1 or r.present_days <> 1 or r.total_minutes <> 480 then raise exception 'FAIL: فلتر يوم واحد %', r; end if;
  -- فترة أوسع من 62 يوماً مرفوضة
  begin perform public.biometric_unmatched_report('2026-01-01', '2026-06-01'); raise exception 'FAIL: قبل فترة واسعة';
  exception when others then if sqlerrm not like '%BIO_RANGE_TOO_WIDE%' then raise; end if; end;
end $$;

-- موظف عادي ممنوع
select set_config('auth.user_id','b8000000-0000-0000-0000-00000000000e', false);
do $$ begin
  perform public.biometric_unmatched_report('2026-09-01', '2026-09-05'); raise exception 'FAIL: موظف عادي قرأ التقرير';
exception when others then if sqlerrm not like '%BIO_FORBIDDEN%' then raise; end if; end $$;
reset role; select set_config('auth.user_id','', false);

-- ③ عند ربط PIN بموظف يختفي من غير المطابقين
insert into public.employees (id, employee_number, full_name, hire_date, biometric_pin) values ('bb000000-0000-0000-0000-0000000000e9', 'UM-E9', 'كريم جاسم محمد', '2024-01-01', '901') on conflict (employee_number) do nothing;
set role authenticated;
select set_config('auth.user_id','b8000000-0000-0000-0000-00000000000a', false); select set_config('auth.role','authenticated', false);
do $$ declare n int; begin
  select count(*) into n from public.biometric_unmatched_report('2026-09-01', '2026-09-05') where pin = '901';
  if n <> 0 then raise exception 'FAIL: PIN مربوط ما زال يظهر كغير مطابق'; end if;
end $$;
reset role; select set_config('auth.user_id','', false);

-- ④ الإرسال التلقائي: إضافة الموظف أعلاه أدرجت أمر USERINFO لكل جهاز ADMS نشط (جهازان هنا على الأقل)
do $$ declare n int; begin
  select count(*) into n from public.biometric_device_commands where kind = 'update_user' and payload->>'employee_id' = 'bb000000-0000-0000-0000-0000000000e9' and (payload->>'auto')::boolean and device_serial in ('UM-DEV-1', 'UM-DEV-2');
  if n <> 2 then raise exception 'FAIL: الإرسال التلقائي أدرج % أمراً (المتوقع 2)', n; end if;
  -- تغيير الاسم → أمر جديد؛ تغيير حقل آخر → لا أمر
  update public.employees set full_name = 'كريم جاسم محمد علي' where id = 'bb000000-0000-0000-0000-0000000000e9';
  update public.biometric_device_commands set status = 'done' where payload->>'employee_id' = 'bb000000-0000-0000-0000-0000000000e9';
  update public.employees set phone = '07700000000' where id = 'bb000000-0000-0000-0000-0000000000e9';
  select count(*) into n from public.biometric_device_commands where payload->>'employee_id' = 'bb000000-0000-0000-0000-0000000000e9' and status = 'queued';
  if n <> 0 then raise exception 'FAIL: تعديل الهاتف أدرج أمراً'; end if;
  -- موظف برقم غير رقمي أو بلا رقم → لا أمر
  insert into public.employees (id, employee_number, full_name, hire_date, biometric_pin) values ('bb000000-0000-0000-0000-0000000000ea', 'UM-EA', 'بلا رقم', '2024-01-01', null);
  select count(*) into n from public.biometric_device_commands where payload->>'employee_id' = 'bb000000-0000-0000-0000-0000000000ea';
  if n <> 0 then raise exception 'FAIL: موظف بلا رقم أُرسل'; end if;
  -- إنهاء الخدمة → لا أمر تحديث
  update public.employees set employment_status = 'terminated' where id = 'bb000000-0000-0000-0000-0000000000e9';
  select count(*) into n from public.biometric_device_commands where payload->>'employee_id' = 'bb000000-0000-0000-0000-0000000000e9' and status = 'queued';
  if n <> 0 then raise exception 'FAIL: منتهي الخدمة أُرسل'; end if;
end $$;
select 'biometric-unmatched-unit ok' as result;
