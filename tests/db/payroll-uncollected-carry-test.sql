-- جولة التحقق الشاملة: البصمة → الحضورية (شرائح الاستقطاع) → الزمنيات والإجازات (سلسلة الموافقات) → تعديلات غرفة العمليات
-- → الكشوفات (استقطاع موثّق) → السلف (قسط تلقائي) → تصدير الشهر → كشف المالية → الاعتماد والقفل → ما بعد القفل. (بادئة fx)
-- الهدف: إثبات أن ترتيب العمليات صحيح وأن كل رقم في كشف الرواتب يُشتق من مصدره بلا تضارب بين غرفة العمليات والمالية.
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
-- 00247: التصدير يتبعه اعتماد معاون المدير المفوض (إلزامي قبل المالية) — هذا الاختبار لا يختبر المراجعة نفسها (انظر deputy-deduction-review-test) فيعتمد تلقائياً
create or replace function public.ops_month_export_reviewed(p_month date) returns uuid language plpgsql security definer set search_path = public, app as $$
declare x uuid; u text := current_setting('auth.user_id', true); begin
  x := public.ops_month_export(p_month);
  perform set_config('auth.user_id', 'fe000000-0000-0000-0000-000000000003', true); perform public.deputy_payroll_approve(x); perform set_config('auth.user_id', coalesce(u, ''), true);
  return x;
end $$;
-- 00201: هذا الاختبار يتحقق من النموذج القديم (الراتب كاملاً ناقص الغياب)؛ النموذج الافتراضي الجديد «الأيام المستحقة» يُختبر في payroll-earned-days-test
update public.hr_policy set settings = settings || '{"salary_model":"full_minus_absence","salary_day_basis":"fixed_30"}'::jsonb where id = 1;
update public.hr_policy set settings = settings || '{"backdated_max_days": 365}'::jsonb where id = 1;  -- 00197: الاختبار يطلب لأشهر ماضية
insert into auth.users (id, email) values
  ('fe000000-0000-0000-0000-000000000001', 'fx-ops@t.iq'), ('fe000000-0000-0000-0000-000000000002', 'fx-hr@t.iq'), ('fe000000-0000-0000-0000-000000000003', 'fx-dep@t.iq'),
  ('fe000000-0000-0000-0000-000000000004', 'fx-adm@t.iq'), ('fe000000-0000-0000-0000-000000000005', 'fx-mgr@t.iq'), ('fe000000-0000-0000-0000-000000000006', 'fx-emp@t.iq'),
  ('fe000000-0000-0000-0000-000000000007', 'fx-fin@t.iq'), ('fe000000-0000-0000-0000-000000000008', 'fx-it@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('fe000000-0000-0000-0000-000000000001', 'ops_room'), ('fe000000-0000-0000-0000-000000000002', 'hr_officer'), ('fe000000-0000-0000-0000-000000000003', 'deputy_director'),
  ('fe000000-0000-0000-0000-000000000004', 'super_admin'), ('fe000000-0000-0000-0000-000000000005', 'department_manager'), ('fe000000-0000-0000-0000-000000000006', 'employee'),
  ('fe000000-0000-0000-0000-000000000007', 'finance_officer'), ('fe000000-0000-0000-0000-000000000008', 'it_admin')
on conflict do nothing;
-- 00225: غرفة العمليات بلا صلاحية استقطاع — الاستقطاعات اليدوية في هذا الاختبار تُنشأ بهوية المدير المفوض (super_admin) ثم تعود الهوية الأصلية
create or replace function app.test_ded_add(p_employee uuid, p_month date, p_amount numeric, p_days numeric, p_reason text) returns uuid language plpgsql security definer set search_path = public, app as $$
declare u text := current_setting('auth.user_id', true); v uuid; begin
  perform set_config('auth.user_id', 'fe000000-0000-0000-0000-000000000004', true);
  begin v := public.ops_deduction_add(p_employee, p_month, p_amount, p_days, p_reason); exception when others then perform set_config('auth.user_id', coalesce(u, ''), true); raise; end;
  perform set_config('auth.user_id', coalesce(u, ''), true); return v;
end $$;

insert into public.employees (id, user_id, full_name, employee_number, hire_date, biometric_pin) values
  ('fe000000-0000-0000-0000-0000000000e5', 'fe000000-0000-0000-0000-000000000005', 'fx مدير القسم', 'FX-MGR', '2024-01-01', 'FX-M'),
  ('fe000000-0000-0000-0000-0000000000e6', 'fe000000-0000-0000-0000-000000000006', 'fx موظف الدورة', 'FX-EMP', '2024-01-01', '8101')
on conflict (id) do nothing;
update public.employees set manager_id = 'fe000000-0000-0000-0000-0000000000e5' where id = 'fe000000-0000-0000-0000-0000000000e6';
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values
  ('fe000000-0000-0000-0000-0000000000a1', 'fx شفت 8-16', '08:00', '16:00', 10, '{0,1,2,3,4,5,6}') on conflict (name) do nothing;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from) values
  ('fe000000-0000-0000-0000-0000000000e6', 'fe000000-0000-0000-0000-0000000000a1', '2024-01-01'),
  ('fe000000-0000-0000-0000-0000000000e5', 'fe000000-0000-0000-0000-0000000000a1', '2024-01-01') on conflict do nothing;
insert into public.biometric_devices (id, serial_number, name, timezone_offset, is_active) values
  ('fe000000-0000-0000-0000-0000000000d1', 'FX-DEV-1', 'fx جهاز', '+03:00', true) on conflict (serial_number) do nothing;
-- الشهر موضوع الاختبار: الشهر الماضي (مكتمل ⇒ لا تناسب)
select set_config('test.fx_m', (date_trunc('month', current_date) - interval '1 month')::date::text, false);

select auth.set_test_user('fe000000-0000-0000-0000-000000000007');
do $$ declare e record; begin
  perform public.finance_salary_set('fe000000-0000-0000-0000-0000000000e6', 'monthly', 100000, 0, '{}'::jsonb, '{}'::jsonb, null);
  for e in select id from public.employees where archived_at is null and id not in (select employee_id from public.employee_salary_profiles where status = 'defined') loop
    perform public.finance_salary_set(e.id, 'monthly', 500000, 0, '{}', '{}', null);
  end loop;
end $$;
-- punches all month present for e6
select auth.set_test_user('fe000000-0000-0000-0000-000000000002');
do $$ declare m date := current_setting('test.fx_m')::date; d date; begin
  d := m; while d < (m + interval '1 month')::date loop
    insert into public.biometric_punches (device_serial, pin, employee_id, punched_at, method) values ('FX-DEV-1','8101','fe000000-0000-0000-0000-0000000000e6',(d + time '08:00')::timestamp - interval '3 hours','manual'),('FX-DEV-1','8101','fe000000-0000-0000-0000-0000000000e6',(d + time '16:00')::timestamp - interval '3 hours','manual');
    d := d + 1; end loop;
  perform public.hr_attendance_evaluate(m, (m + interval '1 month')::date - 1, 'fe000000-0000-0000-0000-0000000000e6');
end $$;
-- 00300: الاستقطاعات التي تتجاوز الراتب تُرحَّل إلى الشهر التالي عند اعتماد المالية
select auth.set_test_user('fe000000-0000-0000-0000-000000000001');
do $$ declare m date := current_setting('test.fx_m')::date; e uuid := 'fe000000-0000-0000-0000-0000000000e6'; x uuid; r record; d record; cf jsonb; v uuid; n int; nxt date; sh record; begin
  v := app.test_ded_add(e, m, 150000, 0, 'غرامة كبيرة');
  cf := public.ops_attendance_confirm(m);
  x := public.ops_month_export_reviewed(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_id = e;
  if r.gross_amount <> 100000 or r.final_net <> 0 then raise exception 'FAIL U1 gross % net %', r.gross_amount, r.final_net; end if;
  if r.uncollected_amount <> 50000 then raise exception 'FAIL U2 uncollected % (expected 50000)', r.uncollected_amount; end if;
  -- يظهر في كشف المالية
  perform set_config('auth.user_id','fe000000-0000-0000-0000-000000000007',false);
  select * into sh from public.finance_payroll_sheet(m) s where s.employee_id = e;
  if sh.uncollected_amount <> 50000 then raise exception 'FAIL U3 sheet uncollected %', sh.uncollected_amount; end if;
  -- قبل الاعتماد: لا ترحيل
  if exists (select 1 from public.hr_attendance_deductions where carried_from_row = r.id) then raise exception 'FAIL U4 carried before approve'; end if;
  perform public.finance_payroll_approve(x);
  nxt := (m + interval '1 month')::date;
  select * into d from public.hr_attendance_deductions where carried_from_row = r.id;
  if not found then raise exception 'FAIL U5 no carry row'; end if;
  if d.employee_id <> e or d.period_month <> nxt or d.amount <> 50000 or d.days <> 0 then raise exception 'FAIL U6 carry row % % %', d.period_month, d.amount, d.days; end if;
  if d.reason not like 'رصيد مرحّل من راتب شهر ' || to_char(m, 'YYYY-MM') || '%' then raise exception 'FAIL U7 reason %', d.reason; end if;
  -- idempotent: إعادة الترحيل لا تكرر
  n := app.payroll_carry_uncollected(x);
  if n <> 0 then raise exception 'FAIL U8 duplicated carry %', n; end if;
  select count(*) into n from public.hr_attendance_deductions where carried_from_row = r.id; if n <> 1 then raise exception 'FAIL U8b count %', n; end if;
  -- إشعار المالية وغرفة العمليات
  if not exists (select 1 from public.notifications where user_id = 'fe000000-0000-0000-0000-000000000007' and title like 'ترحيل استقطاعات%') then raise exception 'FAIL U9 finance notified'; end if;
  if not exists (select 1 from public.notifications where user_id = 'fe000000-0000-0000-0000-000000000001' and title like 'ترحيل استقطاعات%') then raise exception 'FAIL U9b ops notified'; end if;
  -- موظف بلا تجاوز: uncollected = 0 ولا ترحيل
  select count(*) into n from public.hr_month_export_rows where export_id = x and employee_id <> e and uncollected_amount <> 0;
  if n <> 0 then raise exception 'FAIL U10 other rows uncollected %', n; end if;
  select count(*) into n from public.hr_attendance_deductions where period_month = nxt and carried_from_row is not null; if n <> 1 then raise exception 'FAIL U11 carry count %', n; end if;
  raise notice 'test ok: payroll-uncollected-carry (00300)';
end $$;
