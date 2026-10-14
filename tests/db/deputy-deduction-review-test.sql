-- 00247: مرحلة معاون المدير المفوض — إلزامية بين تصدير غرفة العمليات والمالية
-- السيناريو: راتب 600,000 شهري (أجر اليوم 20,000 بأساس 30 · الدقيقة 41.6667) · تأخر 60 د بلا سماحية تغطيه · غياب يوم · استقطاع يدوي 5,000 · غرامة كشف 7,000
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
update public.hr_policy set settings = settings || '{"salary_model":"full_minus_absence","salary_day_basis":"fixed_30","backdated_max_days":365,"deduction_tiers":[],"shortfall_method":"minutes"}'::jsonb where id = 1;
insert into auth.users (id, email) values
  ('dd000000-0000-0000-0000-000000000001', 'dd-ops@t.iq'), ('dd000000-0000-0000-0000-000000000003', 'dd-dep@t.iq'), ('dd000000-0000-0000-0000-000000000004', 'dd-adm@t.iq'),
  ('dd000000-0000-0000-0000-000000000006', 'dd-emp@t.iq'), ('dd000000-0000-0000-0000-000000000007', 'dd-fin@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('dd000000-0000-0000-0000-000000000001', 'ops_room'), ('dd000000-0000-0000-0000-000000000003', 'deputy_director'), ('dd000000-0000-0000-0000-000000000004', 'super_admin'),
  ('dd000000-0000-0000-0000-000000000006', 'employee'), ('dd000000-0000-0000-0000-000000000007', 'finance_officer')
on conflict do nothing;
-- 00225: غرفة العمليات بلا صلاحية استقطاع — الاستقطاعات اليدوية في هذا الاختبار تُنشأ بهوية المدير المفوض (super_admin) ثم تعود الهوية الأصلية
create or replace function app.test_ded_add(p_employee uuid, p_month date, p_amount numeric, p_days numeric, p_reason text) returns uuid language plpgsql security definer set search_path = public, app as $$
declare u text := current_setting('auth.user_id', true); v uuid; begin
  perform set_config('auth.user_id', 'dd000000-0000-0000-0000-000000000004', true);
  begin v := public.ops_deduction_add(p_employee, p_month, p_amount, p_days, p_reason); exception when others then perform set_config('auth.user_id', coalesce(u, ''), true); raise; end;
  perform set_config('auth.user_id', coalesce(u, ''), true); return v;
end $$;

insert into public.employees (id, user_id, full_name, employee_number, hire_date, biometric_pin) values
  ('dd000000-0000-0000-0000-0000000000e6', 'dd000000-0000-0000-0000-000000000006', 'dd موظف المراجعة', 'DD-EMP', '2024-01-01', '8401'),
  ('dd000000-0000-0000-0000-0000000000e7', null, 'dd موظف ثانٍ', 'DD-EMP2', '2024-01-01', '8402')
on conflict (id) do nothing;
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values
  ('dd000000-0000-0000-0000-0000000000a1', 'dd شفت 8-16', '08:00', '16:00', 10, '{0,1,2,3,4,5,6}') on conflict (name) do nothing;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from) values ('dd000000-0000-0000-0000-0000000000e6', 'dd000000-0000-0000-0000-0000000000a1', '2024-01-01'), ('dd000000-0000-0000-0000-0000000000e7', 'dd000000-0000-0000-0000-0000000000a1', '2024-01-01') on conflict do nothing;
insert into public.biometric_devices (id, serial_number, name, timezone_offset, is_active) values ('dd000000-0000-0000-0000-0000000000d1', 'DD-DEV-1', 'dd جهاز', '+03:00', true) on conflict (serial_number) do nothing;
select set_config('test.dd_m', (date_trunc('month', current_date) - interval '1 month')::date::text, false);

-- رواتب
select auth.set_test_user('dd000000-0000-0000-0000-000000000007');
do $$ declare e record; begin
  perform public.finance_salary_set('dd000000-0000-0000-0000-0000000000e6', 'monthly', 600000, 0, '{}'::jsonb, '{}'::jsonb, null);
  for e in select id from public.employees where archived_at is null and id not in (select employee_id from public.employee_salary_profiles where status = 'defined') loop
    perform public.finance_salary_set(e.id, 'monthly', 500000, 0, '{}', '{}', null);
  end loop;
end $$;

-- بصمات: كل أيام الشهر حاضر 8-16 عدا d2 متأخر ساعة و d3 غائب
reset role; select set_config('auth.user_id','', false);
do $$ declare m date := current_setting('test.dd_m')::date; d date; s text := ''; n int; a record; e uuid := 'dd000000-0000-0000-0000-0000000000e6'; begin
  d := m;
  while d <= (m + interval '1 month - 1 day')::date loop
    if d = m + 2 then null;                                    -- غياب
    elsif d = m + 1 then s := s || '8401' || E'\t' || d::text || ' 09:00:00' || E'\t0\n' || '8401' || E'\t' || d::text || ' 16:00:00' || E'\t1\n' || '8402' || E'\t' || d::text || ' 09:00:00' || E'\t0\n' || '8402' || E'\t' || d::text || ' 16:00:00' || E'\t1\n';
    else s := s || '8401' || E'\t' || d::text || ' 08:00:00' || E'\t0\n' || '8401' || E'\t' || d::text || ' 16:00:00' || E'\t1\n' || '8402' || E'\t' || d::text || ' 08:00:00' || E'\t0\n' || '8402' || E'\t' || d::text || ' 16:00:00' || E'\t1\n'; end if;
    d := d + 1;
  end loop;
  n := public.biometric_ingest('DD-DEV-1', s, 'ATTLOG');
  select * into a from public.hr_attendance_days where employee_id = e and work_date = m + 1;
  assert a.status = 'late' and a.proposed_deduction_minutes = 60, 'fixture late: ' || row_to_json(a)::text;
end $$;

-- غرفة العمليات: استقطاع يدوي 5,000 + غرامة كشف 7,000 (نُدرجها مباشرة بمصدر كشف كما تفعل سلسلة الكشوفات)
select auth.set_test_user('dd000000-0000-0000-0000-000000000001');
do $$ declare m date := current_setting('test.dd_m')::date; e uuid := 'dd000000-0000-0000-0000-0000000000e6'; did uuid; begin
  perform app.test_ded_add(e, m, 5000, 0, 'تلف عهدة');
  insert into public.disclosures (db_number, driver_name, log_date, violation_type, details, status, target_kind, employee_id)
  values ('DD-1', 'dd موظف المراجعة', m + 5, 'absence', 'غياب موثق', 'approved', 'employee', e) returning id into did;
  insert into public.hr_attendance_deductions (employee_id, period_month, amount, days, reason, created_by, source_disclosure_id)
  values (e, m, 7000, 0, 'غرامة كشف DD-1', auth.uid(), did);
end $$;

-- ═══ S1 · التصدير ⇒ المراجعة «بانتظار»، المعاون أُشعر، والمالية لا ترى شيئاً ولا تعتمد ═══
do $$ declare m date := current_setting('test.dd_m')::date; x uuid; r record; cf jsonb; ok boolean := false; g jsonb; begin
  cf := public.ops_attendance_confirm(m);
  x := public.ops_month_export(m);
  perform set_config('test.dd_x', x::text, false);
  select * into r from public.hr_month_exports where id = x;
  assert r.review_status = 'pending', 'S1 pending';
  assert exists (select 1 from public.notifications where user_id = 'dd000000-0000-0000-0000-000000000003' and title like 'كشف استقطاعات%بانتظار مراجعتك'), 'S1 deputy notified';
  perform auth.set_test_user('dd000000-0000-0000-0000-000000000007');
  assert (select count(*) from public.finance_payroll_sheet(m)) = 0, 'S1 finance sees nothing';
  g := public.finance_payroll_gate(m);
  assert (g ->> 'exported')::boolean and not (g ->> 'visible')::boolean and g ->> 'review_status' = 'pending', 'S1 gate: ' || g::text;
  begin perform public.finance_payroll_approve(x); exception when others then ok := sqlerrm = 'HR_DEPUTY_REVIEW_PENDING'; end;
  assert ok, 'S1 finance approve blocked';
  ok := false;
  begin perform public.finance_payroll_adjust((select id from public.hr_month_export_rows where export_id = x limit 1), 1, 'x'); exception when others then ok := sqlerrm = 'HR_DEPUTY_REVIEW_PENDING'; end;
  assert ok, 'S1 finance adjust blocked';
  raise notice 'S1 ✅ المالية محجوبة قبل المعاون';
end $$;

-- ═══ S2 · المعاون يرى التفكيك: نقص 60 د = 2,500 · غياب 20,000 · يدوي 5,000 · غرامات 7,000 ═══
select auth.set_test_user('dd000000-0000-0000-0000-000000000003');
do $$ declare m date := current_setting('test.dd_m')::date; r record; mo record; begin
  select * into r from public.deputy_deduction_review(m) where employee_number = 'DD-EMP';
  assert r.row_id is not null, 'S2 row';
  assert r.shortfall_minutes = 60 and r.shortfall_amount = 2500 and r.absence_days = 1 and r.absence_amount = 20000 and r.ops_amount = 5000 and r.fines_amount = 7000 and r.fines_count = 1,
    'S2 breakdown: ' || row_to_json(r)::text;
  assert r.reviewable_total = 34500 and r.relief_total = 0 and r.deductions_total = 34500 and r.proposed_net = 565500 and r.final_net = 565500, 'S2 totals: ' || row_to_json(r)::text;
  perform set_config('test.dd_row', r.row_id::text, false);
  select * into mo from public.deputy_payroll_months() where period_month = m;
  assert mo.review_status = 'pending' and mo.employees_with_deductions >= 1 and mo.deductions_total >= 34500, 'S2 months: ' || row_to_json(mo)::text;
  -- غرفة العمليات لا تملك دوال المعاون
  perform auth.set_test_user('dd000000-0000-0000-0000-000000000001');
  begin perform public.deputy_deduction_adjust(current_setting('test.dd_row')::uuid, 'ops', 'waive', null, 'x'); raise exception 'should fail'; exception when others then assert sqlerrm = 'HR_FORBIDDEN', sqlerrm; end;
  raise notice 'S2 ✅ التفكيك صحيح';
end $$;

-- ═══ S3 · إعفاء كلي بسبب (الغياب) · تعديل مبلغ (اليدوي 5,000 → 2,000) · تخفيض 10% على الباقي · السبب إلزامي ═══
select auth.set_test_user('dd000000-0000-0000-0000-000000000003');
do $$ declare row_id uuid := current_setting('test.dd_row')::uuid; x uuid := current_setting('test.dd_x')::uuid; m date := current_setting('test.dd_m')::date; b jsonb; r record; ok boolean := false; begin
  begin perform public.deputy_deduction_adjust(row_id, 'absence', 'waive', null, ''); exception when others then ok := sqlerrm = 'HR_REASON_REQUIRED'; end;
  assert ok, 'S3 reason required';
  b := public.deputy_deduction_adjust(row_id, 'absence', 'waive', null, 'إجازة شفهية موثقة من المدير');
  assert (b -> 'absence' ->> 'relief')::numeric = 20000 and (b ->> 'relief_total')::numeric = 20000 and (b ->> 'final_net_after')::numeric = 585500, 'S3 waive: ' || b::text;
  ok := false;
  begin perform public.deputy_deduction_adjust(row_id, 'ops', 'amount', 9000, 'x'); exception when others then ok := sqlerrm = 'HR_AMOUNT_ABOVE_ORIGINAL'; end;
  assert ok, 'S3 amount above original';
  b := public.deputy_deduction_adjust(row_id, 'ops', 'amount', 2000, 'تخفيف لظرف إنساني');
  assert (b -> 'ops' ->> 'relief')::numeric = 3000 and (b -> 'ops' ->> 'after')::numeric = 2000 and (b ->> 'relief_total')::numeric = 23000, 'S3 amount: ' || b::text;
  -- 10% على الباقي: (2500 + 0 + 2000 + 7000) = 11500 ⇒ 1150
  perform public.deputy_deduction_percent(x, 10, 'قرار إداري عام');
  select * into r from public.deputy_deduction_review(m) where employee_number = 'DD-EMP';
  assert r.pct_relief = 1150 and r.relief_total = 24150 and r.deductions_after = 10350 and r.final_net = 589650, 'S3 pct: ' || row_to_json(r)::text;
  -- إلغاء تخفيف يعيد الأصل
  b := public.deputy_deduction_adjust(row_id, 'ops', 'clear', null, null);
  assert (b -> 'ops' ->> 'relief')::numeric = 0 and (b ->> 'pct_relief')::numeric = 1450, 'S3 clear: ' || b::text;
  b := public.deputy_deduction_adjust(row_id, 'ops', 'amount', 2000, 'تخفيف لظرف إنساني');
  assert (select count(*) from public.deputy_review_audit(x)) >= 5, 'S3 audit';
  raise notice 'S3 ✅ إعفاء/تعديل/نسبة';
end $$;

-- ═══ S3b · إعفاء موظف بعينه كلياً (00220): الموظف الثاني يُعفى من كل شيء بسبب، والأول يبقى على استقطاعاته؛ ثم إلغاء الإعفاء يعيده ═══
do $$ declare m date := current_setting('test.dd_m')::date; r1 record; r2 record; b jsonb; ok boolean := false; begin
  select * into r2 from public.deputy_deduction_review(m) where employee_number = 'DD-EMP2';
  assert r2.shortfall_amount = 2083.33 and r2.absence_amount = 16666.67 and r2.reviewable_total = 18750 and r2.pct_relief = 1875 and not r2.employee_waived, 'S3b emp2 before: ' || row_to_json(r2)::text;
  begin perform public.deputy_employee_waive(r2.row_id, ''); exception when others then ok := sqlerrm = 'HR_REASON_REQUIRED'; end;
  assert ok, 'S3b reason required';
  b := public.deputy_employee_waive(r2.row_id, 'موظف مستجد — توجيه فقط');
  assert (b ->> 'relief_total')::numeric = 18750 and (b ->> 'final_net_after')::numeric = 500000, 'S3b waive all: ' || b::text;
  select * into r2 from public.deputy_deduction_review(m) where employee_number = 'DD-EMP2';
  assert r2.employee_waived and r2.relief_total = 18750 and r2.final_net = 500000 and r2.review_note like 'إعفاء كلي:%', 'S3b emp2 after: ' || row_to_json(r2)::text;
  -- الموظف الأول لم يتأثر
  select * into r1 from public.deputy_deduction_review(m) where employee_number = 'DD-EMP';
  assert r1.relief_total = 24150 and r1.final_net = 589650 and not r1.employee_waived, 'S3b emp1 untouched: ' || row_to_json(r1)::text;
  -- إلغاء الإعفاء الكلي يعيد الأصل (مع النسبة العامة 10%)
  b := public.deputy_employee_restore(r2.row_id);
  assert (b ->> 'relief_total')::numeric = 1875 and (b -> 'absence' ->> 'relief')::numeric = 0, 'S3b restore: ' || b::text;
  select * into r2 from public.deputy_deduction_review(m) where employee_number = 'DD-EMP2';
  assert not r2.employee_waived and r2.review_note is null, 'S3b restored flags';
  b := public.deputy_employee_waive(r2.row_id, 'موظف مستجد — توجيه فقط');
  raise notice 'S3b ✅ إعفاء موظف بعينه';
end $$;

-- ═══ S4 · اعتماد المعاون ⇒ المالية ترى الكشف بالصافي بعد التخفيف، تُشعَر، ولا تعديل للمعاون بعدها إلا بإعادة فتح بسبب ═══
do $$ declare x uuid := current_setting('test.dd_x')::uuid; m date := current_setting('test.dd_m')::date; j jsonb; r record; ok boolean := false; row_id uuid := current_setting('test.dd_row')::uuid; begin
  j := public.deputy_payroll_approve(x);
  assert (j ->> 'relief_total')::numeric = 24150 + 18750 and (j ->> 'rows_with_relief')::int = 2, 'S4 approve: ' || j::text;
  assert exists (select 1 from public.notifications where user_id = 'dd000000-0000-0000-0000-000000000007' and title like 'كشف رواتب%جاهز للمالية' and body like '%42,900%'), 'S4 finance notified';
  begin perform public.deputy_deduction_adjust(row_id, 'fines', 'waive', null, 'x'); exception when others then ok := sqlerrm = 'HR_REVIEW_APPROVED'; end;
  assert ok, 'S4 locked after approve';
  perform auth.set_test_user('dd000000-0000-0000-0000-000000000007');
  select * into r from public.finance_payroll_sheet(m) where employee_number = 'DD-EMP';
  assert r.row_id is not null and r.review_status = 'approved' and r.review_relief_amount = 24150 and r.deductions_total = 34500 and r.proposed_net = 565500 and r.final_net = 589650, 'S4 finance sheet: ' || row_to_json(r)::text;
  assert (select (public.finance_payroll_gate(m) ->> 'visible')::boolean), 'S4 gate visible';
  -- المطابقة لا تعترض (الأرقام الأصلية محفوظة) ⇒ الاعتماد يمر
  perform public.finance_payroll_approve(x);
  assert (select status from public.hr_month_exports where id = x) = 'approved', 'S4 finance approved';
  -- بعد اعتماد المالية لا إعادة فتح للمعاون
  perform auth.set_test_user('dd000000-0000-0000-0000-000000000003');
  ok := false;
  begin perform public.deputy_review_reopen(x, 'سبب'); exception when others then ok := sqlerrm = 'HR_EXPORT_NOT_EDITABLE'; end;
  assert ok, 'S4 no reopen after finance approve';
  raise notice 'S4 ✅ اعتماد المعاون ثم المالية';
end $$;

-- ═══ S5 · إعادة فتح المراجعة قبل اعتماد المالية + تصدير جديد يعيد «بانتظار» ═══
select auth.set_test_user('dd000000-0000-0000-0000-000000000001');
do $$ declare m date := current_setting('test.dd_m')::date; x2 uuid; ok boolean := false; begin
  -- 00185: الشهر مقفل بعد اعتماد المالية ⇒ نختبر الإعادة على شهر آخر (الشهر الحالي)
  perform public.ops_attendance_confirm(date_trunc('month', current_date)::date);
  x2 := public.ops_month_export(date_trunc('month', current_date)::date);
  assert (select review_status from public.hr_month_exports where id = x2) = 'pending', 'S5 new export pending';
  perform auth.set_test_user('dd000000-0000-0000-0000-000000000003');
  perform public.deputy_payroll_approve(x2);
  begin perform public.deputy_review_reopen(x2, ''); exception when others then ok := sqlerrm = 'HR_REASON_REQUIRED'; end;
  assert ok, 'S5 reopen reason';
  perform public.deputy_review_reopen(x2, 'مراجعة إضافية');
  assert (select review_status from public.hr_month_exports where id = x2) = 'pending', 'S5 reopened';
  perform auth.set_test_user('dd000000-0000-0000-0000-000000000007');
  assert (select count(*) from public.finance_payroll_sheet(current_date)) = 0, 'S5 finance hidden again';
  raise notice 'S5 ✅ إعادة الفتح';
end $$;
select 'deputy review test ok' as result;
