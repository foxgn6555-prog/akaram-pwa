-- 00142 · منظومة HR: الشفتات، الموظف الكامل، الرواتب للمالية فقط، الحضور حسب الشفت، تدقيق غرفة العمليات، التصدير، كشف المالية
do $$
declare
  hr1 uuid := '8c000000-0000-0000-0000-000000000001';
  fin uuid := '8c000000-0000-0000-0000-000000000002';
  ops uuid := '8c000000-0000-0000-0000-000000000003';
  emp_user uuid := '8c000000-0000-0000-0000-000000000004';
  dep_root uuid; dep_child uuid; br uuid; sh_m uuid; sh_e uuid;
  e1 uuid; e2 uuid; e3 uuid; x uuid; r record; n int; t text; j jsonb; num numeric; dd uuid;
  d1 date := '2026-08-03'; -- الاثنين
begin
  insert into auth.users(id, email) values (hr1, 'hr@x.iq'), (fin, 'fin@x.iq'), (ops, 'ops@x.iq'), (emp_user, 'emp@x.iq');
  insert into public.user_roles(user_id, role) values (hr1, 'hr_officer'), (fin, 'finance_officer'), (ops, 'ops_room');
  insert into public.departments(name, code) values ('العمليات', 'OPS-T') returning id into dep_root;
  insert into public.departments(name, code, parent_id) values ('القاطع الأول', 'OPS-T1', dep_root) returning id into dep_child;
  insert into public.branches(name, code) values ('فرع الكرخ', 'KRX-T') returning id into br;
  select id into sh_m from public.hr_shifts where name = 'صباحي';
  select id into sh_e from public.hr_shifts where name = 'مسائي';

  -- ① HR تنشئ موظفاً كاملاً بشفت صباحي → ملف راتب pending + إشعار مالية
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', hr1::text, false);
  select public.hr_employee_create(jsonb_build_object(
    'employee_number', 'T-1001', 'full_name', 'ليث كريم حسن علي', 'mother_name', 'زينب', 'gender', 'male', 'birth_date', '1990-05-01',
    'national_id_number', '199012345678', 'governorate', 'بغداد', 'blood_type', 'O+', 'contract_type', 'monthly',
    'department_id', dep_child, 'branch_id', br, 'hire_date', '2026-07-01', 'shift_id', sh_m, 'biometric_pin', '1001', 'phone', '07700000001')) into e1;
  select public.hr_employee_create(jsonb_build_object('employee_number', 'T-1002', 'full_name', 'سارة يومية', 'contract_type', 'daily',
    'department_id', dep_root, 'branch_id', br, 'hire_date', '2026-07-01', 'shift_id', sh_e, 'shift_grace_override', 0, 'biometric_pin', '1002')) into e2;
  select public.hr_employee_create(jsonb_build_object('employee_number', 'T-1003', 'full_name', 'أحمد بلا شفت', 'hire_date', '2026-07-01', 'biometric_pin', '1003')) into e3;
  begin
    perform public.hr_employee_create(jsonb_build_object('employee_number', 'T-1001', 'full_name', 'مكرر'));
    raise exception 'DUP_NUMBER_ALLOWED';
  exception when others then if sqlerrm not like '%HR_NUMBER_TAKEN%' then raise; end if; end;
  begin
    perform public.hr_employee_create(jsonb_build_object('employee_number', 'T-1009', 'full_name', 'بصمة مكررة', 'biometric_pin', '1001'));
    raise exception 'DUP_PIN_ALLOWED';
  exception when others then if sqlerrm not like '%BIO_PIN_TAKEN%' then raise; end if; end;
  select public.hr_salary_status(e1) into t;
  if t <> 'pending' then raise exception 'SALARY_STATUS_FAIL %', t; end if;
  -- HR لا ترى ملفات الرواتب ولا القسائم
  select count(*) into n from public.employee_salary_profiles; if n <> 0 then raise exception 'HR_SEES_SALARY %', n; end if;
  select count(*) into n from public.payslips; if n <> 0 then raise exception 'HR_SEES_PAYSLIPS'; end if;
  select count(*) into n from public.finance_hr_notices; if n <> 0 then raise exception 'HR_SEES_NOTICES'; end if;
  -- قائمة الموظفين: شجرة الأقسام + الشفت + حالة الراتب
  select count(*) into n from public.hr_employees_list(null, dep_root, null, null, null, 100); if n <> 2 then raise exception 'LIST_TREE_FAIL %', n; end if;
  select shift_name into t from public.hr_employees_list('T-1001', null, null, null, null, 10);
  if t <> 'صباحي' then raise exception 'LIST_SHIFT_FAIL %', t; end if;
  -- تحديث بحقل غير مسموح يُرفض
  begin
    perform public.hr_employee_update(e1, '{"employment_status":"terminated"}'::jsonb);
    raise exception 'UPDATE_FIELD_ALLOWED';
  exception when others then if sqlerrm not like '%HR_FIELD_NOT_ALLOWED%' then raise; end if; end;
  perform public.hr_employee_update(e1, '{"job_title":"سائق","phone2":"07800000001"}'::jsonb);
  select job_title into t from public.employees where id = e1; if t <> 'سائق' then raise exception 'UPDATE_FAIL'; end if;
  perform set_config('role', session_user::text, false);

  -- ② البصمات (وقت بغداد): e1 صباحي 08:00 بسماحية 10 → يوم 1: 08:07 دخول / 16:05 خروج = حاضر
  insert into public.biometric_devices(serial_number, name) values ('HR-T', 'جهاز اختبار');
  insert into public.biometric_punches(device_serial, pin, employee_id, punched_at, direction, method) values
    ('HR-T', '1001', e1, '2026-08-03 08:07:00+03', 'unknown', 'manual'),
    ('HR-T', '1001', e1, '2026-08-03 16:05:00+03', 'unknown', 'manual'),
    -- يوم 2: 08:25 = متأخر 15 دقيقة (بعد السماحية)، خروج 15:30 (مبكر 30 لكن الحالة late أولاً)
    ('HR-T', '1001', e1, '2026-08-04 08:25:00+03', 'unknown', 'manual'),
    ('HR-T', '1001', e1, '2026-08-04 15:30:00+03', 'unknown', 'manual'),
    -- يوم 3: بصمة واحدة = ناقصة
    ('HR-T', '1001', e1, '2026-08-05 08:00:00+03', 'unknown', 'manual'),
    -- يوم 4: لا شيء = غائب
    -- e2 مسائي 16:00→00:00 (عبور منتصف الليل)، سماحية 0: دخول 16:03 (متأخر 3) خروج 00:10 اليوم التالي
    ('HR-T', '1002', e2, '2026-08-03 16:03:00+03', 'unknown', 'manual'),
    ('HR-T', '1002', e2, '2026-08-04 00:10:00+03', 'unknown', 'manual'),
    -- e3 بلا شفت: بصمتان = حاضر بلا تأخير
    ('HR-T', '1003', e3, '2026-08-03 09:00:00+03', 'unknown', 'manual'),
    ('HR-T', '1003', e3, '2026-08-03 14:00:00+03', 'unknown', 'manual');
  -- إجازة معتمدة لـ e1 يوم 7
  insert into public.hr_leaves(employee_id, kind, start_date, end_date, status) values (e1, 'leave', '2026-08-07', '2026-08-07', 'approved');

  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', ops::text, false);
  perform public.hr_attendance_evaluate('2026-08-03', '2026-08-07');

  select status, late_minutes, early_minutes into r from public.hr_attendance_days where employee_id = e1 and work_date = '2026-08-03';
  if r.status <> 'present' or r.late_minutes <> 0 then raise exception 'D1_FAIL % %', r.status, r.late_minutes; end if;
  select status, late_minutes, early_minutes into r from public.hr_attendance_days where employee_id = e1 and work_date = '2026-08-04';
  if r.status <> 'late' or r.late_minutes <> 15 or r.early_minutes <> 30 then raise exception 'D2_FAIL % % %', r.status, r.late_minutes, r.early_minutes; end if;
  select status into t from public.hr_attendance_days where employee_id = e1 and work_date = '2026-08-05'; if t <> 'incomplete' then raise exception 'D3_FAIL %', t; end if;
  select status into t from public.hr_attendance_days where employee_id = e1 and work_date = '2026-08-06'; if t <> 'absent' then raise exception 'D4_FAIL %', t; end if;
  select status into t from public.hr_attendance_days where employee_id = e1 and work_date = '2026-08-07'; if t <> 'leave' then raise exception 'D5_LEAVE_FAIL %', t; end if;
  -- المسائي عابر منتصف الليل: يوم 3 يجمع دخول 16:03 وخروج 00:10 (اليوم التالي)
  select status, late_minutes, check_out::text into r from public.hr_attendance_days where employee_id = e2 and work_date = '2026-08-03';
  if r.status <> 'late' or r.late_minutes <> 3 or r.check_out <> ('2026-08-04 00:10:00+03'::timestamptz)::text then raise exception 'NIGHT_FAIL % % %', r.status, r.late_minutes, r.check_out; end if;
  -- يوم 4 للمسائي: بصمة 00:10 لا تُحسب مرة ثانية كدخول (نافذة يوم 4 تبدأ 12:00) → غائب
  select status into t from public.hr_attendance_days where employee_id = e2 and work_date = '2026-08-04'; if t <> 'absent' then raise exception 'NIGHT_D2_FAIL %', t; end if;
  -- بلا شفت
  select status, late_minutes into r from public.hr_attendance_days where employee_id = e3 and work_date = '2026-08-03';
  if r.status <> 'present' or r.late_minutes <> 0 then raise exception 'NOSHIFT_FAIL %', r.status; end if;
  -- قبل تاريخ التعيين لا صفوف
  select count(*) into n from public.hr_attendance_days where work_date < '2026-07-01'; if n <> 0 then raise exception 'BEFORE_HIRE_FAIL'; end if;

  -- ③ فلاتر غرفة العمليات: شجرة القسم + الحالة + الفرع
  select count(*) into n from public.ops_attendance_list('2026-08-03', '2026-08-07', null, dep_root, 'late', null, 100);
  if n <> 2 then raise exception 'OPS_FILTER_LATE_FAIL %', n; end if;
  select count(*) into n from public.ops_attendance_list('2026-08-03', '2026-08-07', br, dep_child, null, null, 100);
  if n <> 5 then raise exception 'OPS_FILTER_TREE_FAIL %', n; end if;

  -- ④ تعديل غرفة العمليات: سبب إلزامي، يصبح يدوياً، لا يُدهس بإعادة الاشتقاق، ويُسجَّل
  begin
    perform public.ops_attendance_edit(e1, '2026-08-06', '2026-08-06 08:00+03', '2026-08-06 16:00+03', 'present', '');
    raise exception 'EDIT_NO_REASON_ALLOWED';
  exception when others then if sqlerrm not like '%HR_REASON_REQUIRED%' then raise; end if; end;
  perform public.ops_attendance_edit(e1, '2026-08-06', '2026-08-06 08:00+03', '2026-08-06 16:00+03', 'present', 'مهمة رسمية خارج المقر');
  perform public.hr_attendance_evaluate('2026-08-06', '2026-08-06', e1);
  select status, source, edit_reason into r from public.hr_attendance_days where employee_id = e1 and work_date = '2026-08-06';
  if r.status <> 'present' or r.source <> 'manual' then raise exception 'EDIT_OVERWRITTEN % %', r.status, r.source; end if;
  select count(*) into n from public.hr_attendance_audit where employee_id = e1 and action = 'edit'; if n <> 1 then raise exception 'AUDIT_FAIL %', n; end if;
  -- إعادة للتلقائي
  perform public.ops_attendance_reset(e1, '2026-08-06', 'إلغاء التعديل');
  select status, source into r from public.hr_attendance_days where employee_id = e1 and work_date = '2026-08-06';
  if r.status <> 'absent' or r.source <> 'auto' then raise exception 'RESET_FAIL'; end if;
  perform public.ops_attendance_edit(e1, '2026-08-06', '2026-08-06 08:00+03', '2026-08-06 16:00+03', 'present', 'مهمة رسمية');

  -- ⑤ خصم يدوي
  select public.ops_deduction_add(e1, '2026-08-15', 25000, 0, 'مخالفة زي') into dd;
  begin
    perform public.ops_deduction_add(e1, '2026-08-15', 0, 0, 'لا شيء');
    raise exception 'DED_ZERO_ALLOWED';
  exception when others then if sqlerrm not like '%HR_DEDUCTION_INVALID%' then raise; end if; end;

  -- ⑥ تصدير الشهر (غرفة العمليات) — HR لا ترى صفوف الرواتب، غرفة العمليات ترى بلا رواتب
  select public.ops_month_export('2026-08-01') into x;
  select rows_count into n from public.hr_month_exports where id = x; if n <> 3 then raise exception 'EXPORT_ROWS_FAIL %', n; end if;
  select count(*) into n from public.hr_month_export_rows; if n <> 0 then raise exception 'OPS_SEES_SALARY_ROWS %', n; end if;
  select days_present, days_late, days_absent, days_incomplete, days_leave, ops_deduction_amount into r from public.ops_month_export_rows(x) where employee_id = e1;
  -- e1: 3 حاضر (3، 4 متأخر، 6 يدوي) + 5 ناقص + 7 إجازة → present=3 (3,4,6)، late=1، absent=0، incomplete=1، leave=1
  if (r.days_present, r.days_late, r.days_absent, r.days_incomplete, r.days_leave, r.ops_deduction_amount) <> (3, 1, 0, 1, 1, 25000) then
    raise exception 'EXPORT_SUMMARY_FAIL % % % % % %', r.days_present, r.days_late, r.days_absent, r.days_incomplete, r.days_leave, r.ops_deduction_amount; end if;
  -- إعادة التصدير مسموحة قبل الاعتماد وتُبطل السابق
  perform public.ops_month_export('2026-08-01');
  select status into t from public.hr_month_exports where id = x; if t <> 'superseded' then raise exception 'SUPERSEDE_FAIL %', t; end if;
  perform set_config('role', session_user::text, false);

  -- ⑦ المالية: تعريف الرواتب، الكشف، الراتب المقترح، التعديل، الاعتماد، القفل
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', fin::text, false);
  select count(*) into n from public.finance_hr_notices where kind = 'salary_pending' and not is_done; if n <> 3 then raise exception 'NOTICES_FAIL %', n; end if;
  perform public.finance_salary_set(e1, 'monthly', 1000000, 0, '{"نقل": 50000}'::jsonb, '{"ضمان": 20000}'::jsonb);
  perform public.finance_salary_set(e2, 'daily', 0, 30000, '{}'::jsonb, '{}'::jsonb);
  select count(*) into n from public.finance_hr_notices where kind = 'salary_pending' and not is_done; if n <> 1 then raise exception 'NOTICE_DONE_FAIL %', n; end if;
  -- الرواتب دخلت بعد التصدير → إعادة تصدير من غرفة العمليات لتحديث المقترح
  perform set_config('request.jwt.claim.sub', ops::text, false);
  select public.ops_month_export('2026-08-01') into x;
  perform set_config('request.jwt.claim.sub', fin::text, false);
  select proposed_net, final_net into r from public.finance_payroll_sheet('2026-08-01') where employee_id = e1;
  -- 1000000 + 50000 − 20000 − 25000 = 1005000
  if r.proposed_net <> 1005000 then raise exception 'PROPOSED_MONTHLY_FAIL %', r.proposed_net; end if;
  select proposed_net into num from public.finance_payroll_sheet('2026-08-01') where employee_id = e2;
  -- يومي: 30000 × 1 يوم حضور (3 متأخر يُحسب حضوراً) = 30000
  if num <> 30000 then raise exception 'PROPOSED_DAILY_FAIL %', num; end if;
  select proposed_net into num from public.finance_payroll_sheet('2026-08-01') where employee_id = e3;
  if num is not null then raise exception 'NO_SALARY_SHOULD_BE_NULL'; end if;
  -- الاعتماد يُرفض ما دام راتب ناقص
  begin
    perform public.finance_payroll_approve(x);
    raise exception 'APPROVE_MISSING_ALLOWED';
  exception when others then if sqlerrm not like '%HR_SALARY_MISSING%' then raise; end if; end;
  select row_id into dd from public.finance_payroll_sheet('2026-08-01') where employee_id = e3;
  perform public.finance_payroll_adjust(dd, 400000, 'راتب مؤقت لحين التعريف');
  select row_id into dd from public.finance_payroll_sheet('2026-08-01') where employee_id = e1;
  perform public.finance_payroll_adjust(dd, 1000000, 'تقريب');
  perform public.finance_payroll_approve(x);
  select export_status into t from public.finance_payroll_sheet('2026-08-01') limit 1; if t <> 'approved' then raise exception 'APPROVE_FAIL'; end if;
  -- بعد الاعتماد: لا تعديل مالي، ولا تعديل حضور، ولا إعادة تصدير، ولا إعادة اشتقاق
  begin
    perform public.finance_payroll_adjust(dd, 1, 'x');
    raise exception 'ADJUST_AFTER_APPROVE_ALLOWED';
  exception when others then if sqlerrm not like '%HR_EXPORT_NOT_EDITABLE%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub', ops::text, false);
  begin
    perform public.ops_attendance_edit(e1, '2026-08-05', null, null, 'absent', 'x');
    raise exception 'EDIT_AFTER_LOCK_ALLOWED';
  exception when others then if sqlerrm not like '%HR_MONTH_LOCKED%' then raise; end if; end;
  begin
    perform public.ops_month_export('2026-08-01');
    raise exception 'EXPORT_AFTER_LOCK_ALLOWED';
  exception when others then if sqlerrm not like '%HR_MONTH_LOCKED%' then raise; end if; end;
  begin
    perform public.hr_attendance_evaluate('2026-08-01', '2026-08-31');
    raise exception 'EVAL_AFTER_LOCK_ALLOWED';
  exception when others then if sqlerrm not like '%HR_MONTH_LOCKED%' then raise; end if; end;
  -- غرفة العمليات لا تستطيع المالية
  begin
    perform public.finance_salary_set(e3, 'monthly', 1, 0, '{}'::jsonb, '{}'::jsonb);
    raise exception 'OPS_SET_SALARY_ALLOWED';
  exception when others then if sqlerrm not like '%HR_FORBIDDEN%' then raise; end if; end;
  select count(*) into n from public.finance_payroll_sheet('2026-08-01'); if n <> 0 then raise exception 'OPS_SEES_SHEET'; end if;

  -- ⑧ HR: إنهاء الخدمة → إشعار تسوية للمالية، ولا اشتقاق بعد آخر يوم
  perform set_config('request.jwt.claim.sub', hr1::text, false);
  perform public.hr_employee_terminate(e3, 'resignation', '2026-09-10', 'استقالة شخصية');
  select employment_status, terminated_at into r from public.employees where id = e3;
  if r.employment_status <> 'terminated' or r.terminated_at <> '2026-09-10' then raise exception 'TERMINATE_FAIL'; end if;
  begin
    perform public.hr_employee_terminate(e3, 'resignation', '2026-09-10', 'مرة ثانية');
    raise exception 'TERMINATE_TWICE_ALLOWED';
  exception when others then if sqlerrm not like '%HR_ALREADY_TERMINATED%' then raise; end if; end;
  perform set_config('role', session_user::text, false);
  insert into public.biometric_punches(device_serial, pin, employee_id, punched_at, direction, method) values
    ('HR-T', '1003', e3, '2026-09-12 09:00:00+03', 'unknown', 'manual'), ('HR-T', '1003', e3, '2026-09-12 14:00:00+03', 'unknown', 'manual');
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', hr1::text, false);
  perform public.hr_attendance_evaluate('2026-09-12', '2026-09-12', e3);
  select count(*) into n from public.hr_attendance_days where employee_id = e3 and work_date = '2026-09-12'; if n <> 0 then raise exception 'AFTER_TERMINATION_FAIL'; end if;
  -- لوحة HR
  select public.hr_dashboard_stats() into j;
  if (j ->> 'employees_active')::int < 2 or (j ->> 'salary_pending')::int <> 0 then raise exception 'DASH_FAIL %', j; end if;
  -- تغيير شفت بتاريخ سريان: التاريخ القديم يبقى بالشفت القديم
  perform public.hr_employee_assign_shift(e1, sh_e, '2026-09-01', null, null, null, null, 'نقل للمسائي');
  select shift_name into t from app.hr_effective_shift(e1, '2026-08-15'); if t <> 'صباحي' then raise exception 'SHIFT_HISTORY_FAIL %', t; end if;
  select shift_name into t from app.hr_effective_shift(e1, '2026-09-15'); if t <> 'مسائي' then raise exception 'SHIFT_NEW_FAIL %', t; end if;
  perform set_config('request.jwt.claim.sub', fin::text, false);
  select count(*) into n from public.finance_hr_notices where kind = 'termination_settlement'; if n <> 1 then raise exception 'SETTLEMENT_NOTICE_FAIL'; end if;
  perform set_config('role', session_user::text, false);

  -- تنظيف
  delete from public.hr_attendance_audit where employee_id in (e1, e2, e3);
  delete from public.hr_month_exports where period_month = '2026-08-01';
  delete from public.biometric_punches where device_serial = 'HR-T';
  delete from public.biometric_devices where serial_number = 'HR-T';
  delete from public.employees where id in (e1, e2, e3);
  delete from public.departments where id in (dep_child, dep_root);
  delete from public.branches where id = br;
  delete from public.user_roles where user_id in (hr1, fin, ops);
  delete from auth.users where id in (hr1, fin, ops, emp_user);
  raise notice '✅ HR 00142: الشفتات/الموظف/الرواتب للمالية/الحضور/التدقيق/التصدير/الاعتماد/القفل ناجحة';
end $$;
