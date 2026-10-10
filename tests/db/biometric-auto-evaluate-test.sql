-- اختبار 00167: البصمة الواصلة تُحتسب في الحضور تلقائياً (ADMS/الجسر/الربط)، الشفت الليلي، الشهر المقفول،
-- مشتقات اليوم (الاستقطاع المقترح) تُحسب رغم المحفّز المتداخل، وإلغاء طلب السلسلة يغلق مهامها. مستقل (بادئة ba).
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('ba000000-0000-0000-0000-00000000000a', 'hr-ba@t.iq'), ('ba000000-0000-0000-0000-00000000000b', 'it-ba@t.iq'),
  ('ba000000-0000-0000-0000-00000000000c', 'mgr-ba@t.iq'), ('ba000000-0000-0000-0000-00000000000d', 'emp-ba@t.iq'),
  ('ba000000-0000-0000-0000-00000000000e', 'night-ba@t.iq'), ('ba000000-0000-0000-0000-00000000000f', 'fin-ba@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('ba000000-0000-0000-0000-00000000000a', 'hr_officer'), ('ba000000-0000-0000-0000-00000000000b', 'it_admin'),
  ('ba000000-0000-0000-0000-00000000000c', 'department_manager'), ('ba000000-0000-0000-0000-00000000000d', 'employee'),
  ('ba000000-0000-0000-0000-00000000000e', 'employee'), ('ba000000-0000-0000-0000-00000000000f', 'finance_officer')
on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, biometric_pin) values
  ('bb000000-0000-0000-0000-00000000000c', 'ba000000-0000-0000-0000-00000000000c', 'BA-MGR', 'مدير التدقيق', '2024-01-01', 'BA-M'),
  ('bb000000-0000-0000-0000-00000000000d', 'ba000000-0000-0000-0000-00000000000d', 'BA-EMP', 'موظف التدقيق', '2024-01-01', '7001'),
  ('bb000000-0000-0000-0000-00000000000e', 'ba000000-0000-0000-0000-00000000000e', 'BA-NIGHT', 'موظف ليلي', '2024-01-01', '7002')
on conflict (employee_number) do nothing;
update public.employees set manager_id = 'bb000000-0000-0000-0000-00000000000c' where id in ('bb000000-0000-0000-0000-00000000000d', 'bb000000-0000-0000-0000-00000000000e');
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values
  ('cc000000-0000-0000-0000-0000000000a1', 'شفت التدقيق صباحي', '08:00', '16:00', 10, '{0,1,2,3,4,5,6}'),
  ('cc000000-0000-0000-0000-0000000000a2', 'شفت التدقيق ليلي', '22:00', '06:00', 10, '{0,1,2,3,4,5,6}')
on conflict (name) do nothing;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from) values
  ('bb000000-0000-0000-0000-00000000000d', 'cc000000-0000-0000-0000-0000000000a1', '2024-01-01'),
  ('bb000000-0000-0000-0000-00000000000e', 'cc000000-0000-0000-0000-0000000000a2', '2024-01-01')
on conflict do nothing;
insert into public.biometric_devices (id, serial_number, name, timezone_offset, is_active) values
  ('dd000000-0000-0000-0000-0000000000a1', 'BA-DEV-1', 'جهاز التدقيق', '+03:00', true)
on conflict (serial_number) do nothing;

-- ═══ T1 · دفعة ADMS → بصمتان (دخول متأخر 08:40، خروج 16:00) → يوم حضور «متأخر» تلقائياً + مشتقات محسوبة ═══
do $$
declare m date := (date_trunc('month', current_date) - interval '3 month')::date; d date; a record; n int; e uuid := 'bb000000-0000-0000-0000-00000000000d';
begin
  d := m + 5;
  n := public.biometric_ingest('BA-DEV-1', '7001' || E'\t' || d::text || ' 08:40:00' || E'\t' || '0' || E'\t' || '1' || E'\n' ||
                                           '7001' || E'\t' || d::text || ' 16:00:00' || E'\t' || '1' || E'\t' || '1', 'ATTLOG');
  if n <> 2 then raise exception 'ingest expected 2 got %', n; end if;
  -- البصمات بالمنطقة الصحيحة: 08:40 بغداد = 05:40Z
  if (select min(punched_at) from public.biometric_punches where pin = '7001' and device_serial = 'BA-DEV-1') <> (d::text || ' 05:40:00+00')::timestamptz then
    raise exception 'tz wrong: %', (select min(punched_at) from public.biometric_punches where pin = '7001');
  end if;
  select * into a from public.hr_attendance_days where employee_id = e and work_date = d;
  if not found then raise exception 'T1: attendance day NOT auto-evaluated'; end if;
  if a.status <> 'late' or a.late_minutes <> 30 then raise exception 'T1: status/late wrong: % %', a.status, a.late_minutes; end if;
  -- المشتقات (00144) حُسبت رغم أن الصف كُتب من داخل محفّز
  if a.required_minutes is distinct from 480 or a.shortfall_minutes is distinct from 40 then
    raise exception 'T1: metrics not computed: req=% short=%', a.required_minutes, a.shortfall_minutes;
  end if;
  -- اليوم السابق: غياب (أُنشئ لأن المحفّز يعيد احتساب اليوم السابق أيضاً)
  select * into a from public.hr_attendance_days where employee_id = e and work_date = d - 1;
  if not found or a.status <> 'absent' then raise exception 'T1: previous day not evaluated'; end if;
  raise notice 'T1 OK';
end $$;

-- ═══ T2 · PIN غير مربوط → بصمة غير مطابَقة بلا حضور؛ ربط PIN من HR يعبّئ ويحتسب تلقائياً ═══
reset role; select set_config('auth.user_id','', false);
-- 00202: هذا الاختبار يفترض النموذج القديم (الغياب = يوم استقطاع مقترح)؛ في نموذج «الأيام المستحقة» الافتراضي الغياب يوم غير مدفوع بلا استقطاع (payroll-earned-days-test S7)
update public.hr_policy set settings = settings || '{"salary_model":"full_minus_absence","salary_day_basis":"fixed_30"}'::jsonb where id = 1;
select auth.set_test_user('ba000000-0000-0000-0000-00000000000a');
do $$
declare m date := (date_trunc('month', current_date) - interval '3 month')::date; d date; a record; n int; e uuid := 'bb000000-0000-0000-0000-00000000000d';
begin
  d := m + 6;
  n := public.biometric_ingest('BA-DEV-1', '9999' || E'\t' || d::text || ' 08:00:00' || E'\t' || '0' || E'\n' || '9999' || E'\t' || d::text || ' 16:10:00' || E'\t' || '1', 'ATTLOG');
  if n <> 0 then raise exception 'T2: unmatched should not count as inserted, got %', n; end if;
  if (select count(*) from public.biometric_punches where pin = '9999' and employee_id is null) <> 2 then raise exception 'T2: unmatched punches missing'; end if;
  -- تغيير PIN للموظف إلى 9999
  update public.employees set biometric_pin = null where id = e;
  perform public.biometric_link_pin('9999', e);
  if (select count(*) from public.biometric_punches where pin = '9999' and employee_id = e) <> 2 then raise exception 'T2: backfill failed'; end if;
  select * into a from public.hr_attendance_days where employee_id = e and work_date = d;
  if not found or a.status <> 'present' then raise exception 'T2: linked punches not auto-evaluated: %', coalesce(a.status, 'none'); end if;
  if a.overtime_minutes is distinct from 0 then raise exception 'T2: 10 min OT below block should be 0, got %', a.overtime_minutes; end if;
  update public.employees set biometric_pin = '7001' where id = e;
  raise notice 'T2 OK';
end $$;

-- ═══ T3 · الشفت الليلي 22:00→06:00: دخول 22:05 وخروج 05:50 (اليوم التالي) → يوم واحد «حاضر» ينسب لتاريخ البداية ═══
do $$
declare m date := (date_trunc('month', current_date) - interval '3 month')::date; d date; a record; n int; e uuid := 'bb000000-0000-0000-0000-00000000000e';
begin
  d := m + 8;
  n := public.biometric_ingest('BA-DEV-1', '7002' || E'\t' || d::text || ' 22:05:00' || E'\t' || '0' || E'\n' || '7002' || E'\t' || (d + 1)::text || ' 05:50:00' || E'\t' || '1', 'ATTLOG');
  if n <> 2 then raise exception 'T3: ingest %', n; end if;
  select * into a from public.hr_attendance_days where employee_id = e and work_date = d;
  if not found then raise exception 'T3: night day missing'; end if;
  -- 00177: خروج قبل 10 دقائق ضمن السماح → «حاضر» مع حفظ الدقائق (كان يُصنَّف خروجاً مبكراً)
  if a.status <> 'present' or a.worked_minutes <> 465 or a.late_minutes <> 0 or a.early_minutes <> 10 then
    raise exception 'T3: night wrong: % worked=% late=% early=%', a.status, a.worked_minutes, a.late_minutes, a.early_minutes;
  end if;
  if a.check_in <> (d::text || ' 19:05:00+00')::timestamptz or a.check_out <> ((d + 1)::text || ' 02:50:00+00')::timestamptz then raise exception 'T3: in/out wrong'; end if;
  -- اليوم التالي يجب ألا يلتقط خروج 05:50 كبصمة وحيدة (نافذته تبدأ 18:00)
  select * into a from public.hr_attendance_days where employee_id = e and work_date = d + 1;
  if found and a.check_in is not null then raise exception 'T3: next day stole the checkout: %', row_to_json(a); end if;
  raise notice 'T3 OK';
end $$;

-- ═══ T4 · تعديل يدوي من غرفة العمليات لا تُدمّره بصمة لاحقة؛ والشهر المقفول لا يُلمس ═══
select auth.set_test_user('ba000000-0000-0000-0000-00000000000f');
do $$
declare m date := (date_trunc('month', current_date) - interval '4 month')::date; d date; a record; n int; e uuid := 'bb000000-0000-0000-0000-00000000000d'; x uuid;
begin
  d := m + 3;
  insert into public.hr_month_exports (id, period_month, status, approved_by, approved_at) values (gen_random_uuid(), m, 'approved', 'ba000000-0000-0000-0000-00000000000f', now()) returning id into x;
  n := public.biometric_ingest('BA-DEV-1', '7001' || E'\t' || d::text || ' 08:00:00' || E'\t' || '0' || E'\n' || '7001' || E'\t' || d::text || ' 16:00:00' || E'\t' || '1', 'ATTLOG');
  if n <> 2 then raise exception 'T4: punches must still be stored (ledger), got %', n; end if;
  if exists (select 1 from public.hr_attendance_days where employee_id = e and work_date = d) then raise exception 'T4: locked month was evaluated'; end if;
  delete from public.hr_month_exports where id = x;
  raise notice 'T4 OK';
end $$;

-- ═══ T5 · إلغاء طلب إجازة معلّق ضمن سلسلة موافقات يغلق مهام السلسلة ═══
select auth.set_test_user('ba000000-0000-0000-0000-00000000000b');
do $$ begin
  perform public.approval_chain_save('employee', 'leave', '[{"kind":"hierarchy","role":"department_manager"},{"kind":"hierarchy","role":"hr_officer"}]');
end $$;
select auth.set_test_user('ba000000-0000-0000-0000-00000000000d');
do $$
declare t uuid; lid uuid; m date := (date_trunc('month', current_date) + interval '2 month')::date;
begin
  select id into t from public.hr_leave_types where code = 'annual';
  lid := public.hr_leave_request('bb000000-0000-0000-0000-00000000000d', t, m + 1, m + 2, null, null, 'اختبار إلغاء', null, 'أُبلغ المسؤول شفهياً ولم يُسجَّل الطلب في وقته (اختبار)');
  if (select chain_id from public.hr_leaves where id = lid) is null then raise exception 'T5: chain not attached'; end if;
  if (select count(*) from public.approval_tasks where request_id = lid and status in ('pending', 'waiting')) <> 2 then raise exception 'T5: expected 2 open tasks'; end if;
  perform public.hr_leave_cancel(lid, 'غيّرت رأيي');
  if (select status from public.hr_leaves where id = lid) <> 'cancelled' then raise exception 'T5: not cancelled'; end if;
  if exists (select 1 from public.approval_tasks where request_id = lid and status in ('pending', 'waiting')) then raise exception 'T5: chain tasks left open after cancel'; end if;
  raise notice 'T5 OK';
end $$;
-- تنظيف: السلسلة التجريبية لا تؤثر على ملفات اختبار أخرى تُشغَّل في نفس القاعدة
delete from public.approval_chains where requester_role = 'employee' and request_type = 'leave';

-- ═══ T6 · ختم الاستئناف لـ ADMS = آخر بصمة بالوقت المحلي للجهاز ═══
do $$
declare s text;
begin
  s := public.biometric_last_stamp('BA-DEV-1');
  if s !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$' then raise exception 'T6: stamp format: %', s; end if;
  -- آخر بصمة في الاختبارات: الشفت الليلي (m-3 + 9) 05:50 محلي
  if s not like '% 05:50:00' and s not like '% 16:00:00' and s not like '% 16:10:00' then raise exception 'T6: unexpected stamp %', s; end if;
  if public.biometric_last_stamp('NOPE') is not null then raise exception 'T6: unknown device must be null'; end if;
  raise notice 'T6 OK';
end $$;



-- ═══ T7 · الاحتساب اليومي المجدول: موظف بلا أي بصمة أمس → غياب مسجّل بلا تدخل يدوي ═══
do $$
declare n int; a record; e uuid := 'bb000000-0000-0000-0000-00000000000d'; y date := app.hr_local_date(now()) - 1;
begin
  delete from public.hr_attendance_days where employee_id = e and work_date between y - 1 and y + 1;
  n := app.hr_evaluate_daily();
  if n < 3 then raise exception 'T7: expected ≥3 evaluated days, got %', n; end if;
  select * into a from public.hr_attendance_days where employee_id = e and work_date = y;
  if not found or a.status <> 'absent' or a.proposed_deduction_days is distinct from 1 then
    raise exception 'T7: yesterday should be absent with 1 day deduction: %', coalesce(row_to_json(a)::text, 'none');
  end if;
  if (select count(*) from public.integration_logs where endpoint = 'hr_evaluate_daily') < 1 then raise exception 'T7: not logged'; end if;
  raise notice 'T7 OK';
end $$;
select auth.set_test_user('ba000000-0000-0000-0000-00000000000d');
do $$ begin
  begin perform public.hr_attendance_evaluate_today(); raise exception 'should fail';
  exception when others then if sqlerrm <> 'HR_FORBIDDEN' then raise exception 'T7b: employee must be forbidden: %', sqlerrm; end if; end;
  raise notice 'T7b OK';
end $$;
select 'BIOMETRIC AUTO-EVALUATE TESTS PASSED' as result;
update public.hr_policy set settings = settings || '{"backdated_max_days": 365}'::jsonb where id = 1;  -- 00197: الاختبار يطلب لأشهر ماضية
