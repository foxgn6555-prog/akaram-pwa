-- 00193: هذا الاختبار يختبر التصدير مباشرة؛ بوابة «اعتماد الحضورية قبل التصدير» تُختبر في ops-attendance-two-stage-test
update public.hr_policy set settings = settings || '{"require_attendance_confirmation": false}'::jsonb where id = 1;
-- اختبار وظيفي لـ 00144: السياسة · أنواع الإجازات · الرصيد · الطلبات والموافقة · نقص الدقائق والاستقطاع المقترح · الإضافي · التنبيهات · التصدير
-- التشغيل: بعد تطبيق كل الميجريشنات على قاعدة الاختبار (انظر README) — كل الفحوص assert وتفشل عند أول خطأ.
set client_min_messages = notice;

-- ── تهيئة: مستخدمون وأدوار وموظفون ─────────────────────────────
insert into auth.users (id, email) values
  ('aaaa0000-0000-0000-0000-00000000000a', 'hr@t.iq'), ('aaaa0000-0000-0000-0000-00000000000b', 'it@t.iq'),
  ('aaaa0000-0000-0000-0000-00000000000c', 'mgr@t.iq'), ('aaaa0000-0000-0000-0000-00000000000d', 'emp@t.iq'),
  ('aaaa0000-0000-0000-0000-00000000000e', 'ops@t.iq'), ('aaaa0000-0000-0000-0000-00000000000f', 'fin@t.iq'),
  ('aaaa0000-0000-0000-0000-000000000010', 'boss@t.iq')
on conflict (id) do nothing;
insert into auth.users (id, email) values ('aaaa0000-0000-0000-0000-0000000000ad', 'adm@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('aaaa0000-0000-0000-0000-0000000000ad', 'super_admin') on conflict do nothing;
insert into public.user_roles (user_id, role) values
  ('aaaa0000-0000-0000-0000-00000000000a', 'hr_officer'), ('aaaa0000-0000-0000-0000-00000000000b', 'it_admin'),
  ('aaaa0000-0000-0000-0000-00000000000c', 'department_manager'), ('aaaa0000-0000-0000-0000-00000000000d', 'employee'),
  ('aaaa0000-0000-0000-0000-00000000000e', 'ops_room'), ('aaaa0000-0000-0000-0000-00000000000f', 'finance_officer'),
  ('aaaa0000-0000-0000-0000-000000000010', 'department_manager')
on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, biometric_pin) values
  ('bbbb0000-0000-0000-0000-000000000010', 'aaaa0000-0000-0000-0000-000000000010', 'T-BOSS', 'المدير الأعلى', '2024-01-01', 'B1'),
  ('bbbb0000-0000-0000-0000-00000000000c', 'aaaa0000-0000-0000-0000-00000000000c', 'T-MGR', 'المدير المباشر', '2024-01-01', 'M1'),
  ('bbbb0000-0000-0000-0000-00000000000d', 'aaaa0000-0000-0000-0000-00000000000d', 'T-EMP', 'الموظف التجريبي', '2024-01-01', '1')
on conflict (employee_number) do nothing;
update public.employees set manager_id = 'bbbb0000-0000-0000-0000-000000000010' where id = 'bbbb0000-0000-0000-0000-00000000000c';
update public.employees set manager_id = 'bbbb0000-0000-0000-0000-00000000000c' where id = 'bbbb0000-0000-0000-0000-00000000000d';

-- شفت 08:00–16:00 سماحية 15 كل الأيام
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values
  ('cccc0000-0000-0000-0000-000000000001', 'شفت الاختبار', '08:00', '16:00', 15, '{0,1,2,3,4,5,6}') on conflict (name) do nothing;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from) values
  ('bbbb0000-0000-0000-0000-00000000000d', 'cccc0000-0000-0000-0000-000000000001', '2024-01-01') on conflict do nothing;

-- ── ① السياسة ──────────────────────────────────────────────────

-- 00305: الطلبات المعلّقة تُحجز من الرصيد، وإجازة بين سنتين تُقسَّم على السنتين
do $$
declare e uuid := 'bbbb0000-0000-0000-0000-00000000000d'; t_annual uuid; l1 uuid; l2 uuid; l3 uuid; bal jsonb; y int := extract(year from app.hr_local_date(now()))::int; d date; n int;
begin
  select id into t_annual from public.hr_leave_types where code = 'annual';
  update public.hr_leave_types set max_days_per_request = null where id = t_annual;
  perform set_config('auth.user_id', 'aaaa0000-0000-0000-0000-00000000000d', false);
  d := app.hr_local_date(now()) + 10;
  l1 := public.hr_leave_request(e, t_annual, d, d + 19);
  bal := app.hr_balance_of(e, y);
  if (bal ->> 'pending_reserved')::numeric <> 20 or (bal ->> 'available')::numeric <> (bal ->> 'remaining')::numeric - 20 then raise exception 'FAIL pending_reserved: %', bal; end if;
  begin
    l2 := public.hr_leave_request(e, t_annual, d + 25, d + 44);
    raise exception 'FAIL second pending request exceeded available balance but was accepted';
  exception when others then
    if sqlerrm <> 'HR_BALANCE_INSUFFICIENT' then raise; end if;
  end;
  perform set_config('auth.user_id', 'aaaa0000-0000-0000-0000-00000000000a', false);
  perform public.hr_leave_cancel(l1, 'تنظيف');
  bal := app.hr_balance_of(e, y);
  if (bal ->> 'pending_reserved')::numeric <> 0 then raise exception 'FAIL reserve not released after cancel: %', bal; end if;

  -- إجازة 29/12 → 3/1
  perform set_config('auth.user_id', 'aaaa0000-0000-0000-0000-00000000000d', false);
  l3 := public.hr_leave_request(e, t_annual, make_date(y, 12, 29), make_date(y + 1, 1, 3));
  perform set_config('auth.user_id', 'aaaa0000-0000-0000-0000-00000000000c', false);
  perform public.hr_leave_decide(l3, true, null);
  select count(*) into n from public.hr_leave_ledger where leave_id = l3 and kind = 'consume';
  if n <> 2 then raise exception 'FAIL expected 2 ledger rows, got %', n; end if;
  if (select days from public.hr_leave_ledger where leave_id = l3 and year = y) <> -3 then raise exception 'FAIL current-year share'; end if;
  if (select days from public.hr_leave_ledger where leave_id = l3 and year = y + 1) <> -3 then raise exception 'FAIL next-year share'; end if;
  if (app.hr_balance_of(e, y) ->> 'remaining')::numeric <> 27 then raise exception 'FAIL remaining current year: %', app.hr_balance_of(e, y); end if;
  perform set_config('auth.user_id', 'aaaa0000-0000-0000-0000-00000000000a', false);
  perform public.hr_leave_cancel(l3, 'اختبار');
  if (app.hr_balance_of(e, y) ->> 'remaining')::numeric <> 30 or (app.hr_balance_of(e, y + 1) ->> 'reversed')::numeric <> 3 then raise exception 'FAIL reversal across years'; end if;
  raise notice 'leave pending reserve + year split test ok';
end$$;
