-- 00248 · شرائح احتساب الحضور المبكر/الخروج المتأخر (بادئة ct)
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
update public.hr_policy set settings = settings || '{"shortfall_method": "hour_bank", "require_attendance_confirmation": false}'::jsonb where id = 1;
insert into auth.users (id, email) values ('c8000000-0000-0000-0000-000000000008', 'ct-it@t.iq'), ('c8000000-0000-0000-0000-000000000001', 'ct-ops@t.iq'), ('c8000000-0000-0000-0000-000000000007', 'ct-fin@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('c8000000-0000-0000-0000-000000000008', 'it_admin'), ('c8000000-0000-0000-0000-000000000001', 'ops_room'), ('c8000000-0000-0000-0000-000000000007', 'finance_officer') on conflict do nothing;
insert into public.employees (id, full_name, employee_number, hire_date, biometric_pin) values ('c8000000-0000-0000-0000-0000000000e1', 'ct مبكر', 'CT-A', '2024-01-01', '8901') on conflict (id) do nothing;
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values ('c8000000-0000-0000-0000-0000000000a1', 'ct شفت 8-16', '08:00', '16:00', 10, '{0,1,2,3,4,5,6}') on conflict (name) do nothing;
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from) values ('c8000000-0000-0000-0000-0000000000e1', 'c8000000-0000-0000-0000-0000000000a1', '2024-01-01') on conflict do nothing;
insert into public.biometric_devices (id, serial_number, name, timezone_offset, is_active) values ('c8000000-0000-0000-0000-0000000000d1', 'CT-DEV-1', 'ct جهاز', '+03:00', true) on conflict (serial_number) do nothing;
select set_config('test.ct_m', (date_trunc('month', current_date) - interval '1 month')::date::text, false);

-- ═══ T1 · الدالة النقية: تدريجي، ما بعد آخر شريحة صفر، الافتراضيات ═══
do $$ declare t jsonb := '[{"upto":15,"pct":100},{"upto":30,"pct":50},{"upto":60,"pct":25}]'; begin
  assert app.hr_credit_tiered(10, t) = 10, 'T1 10';
  assert app.hr_credit_tiered(15, t) = 15, 'T1 15';
  assert app.hr_credit_tiered(30, t) = 23, 'T1 30 ⇒ 15 + 7.5 ≈ 23: ' || app.hr_credit_tiered(30, t);
  assert app.hr_credit_tiered(45, t) = 26, 'T1 45 ⇒ 15 + 7.5 + 3.75 ≈ 26: ' || app.hr_credit_tiered(45, t);
  assert app.hr_credit_tiered(120, t) = 30, 'T1 120 ⇒ ما بعد 60 لا يُحتسب: ' || app.hr_credit_tiered(120, t);
  assert app.hr_credit_tiered(60, '[]'::jsonb) = 0, 'T1 بلا شرائح = 0';
  assert app.hr_credit_tiered(0, t) = 0 and app.hr_credit_tiered(-5, t) = 0, 'T1 صفر';
  assert app.hr_credit_tiers('early_in') = '[]'::jsonb, 'T1 الافتراضي للمبكر = لا يُحتسب';
  assert app.hr_credit_tiered(90, app.hr_credit_tiers('late_out')) = 90, 'T1 الافتراضي للمتأخر 100%';
  raise notice 'T1 ✅ الدالة النقية';
end $$;

-- ═══ T2 · الحفظ: IT فقط، التحقق من الشكل، سجل التدقيق ═══
select auth.set_test_user('c8000000-0000-0000-0000-000000000001');
do $$ declare ok boolean := false; begin
  begin perform public.it_credit_tiers_set('[]', '[]'); exception when others then ok := sqlerrm like '%FORBIDDEN%'; end; assert ok, 'T2 ops forbidden';
end $$;
select auth.set_test_user('c8000000-0000-0000-0000-000000000008');
do $$ declare ok boolean; r jsonb; begin
  ok := false; begin perform public.it_credit_tiers_set('[{"upto":30,"pct":50},{"upto":15,"pct":100}]', '[]'); exception when others then ok := sqlerrm = 'HR_CREDIT_TIERS_INVALID'; end; assert ok, 'T2 ترتيب غير تصاعدي مرفوض';
  ok := false; begin perform public.it_credit_tiers_set('[{"upto":15,"pct":150}]', '[]'); exception when others then ok := sqlerrm = 'HR_CREDIT_TIERS_INVALID'; end; assert ok, 'T2 نسبة > 100 مرفوضة';
  ok := false; begin perform public.it_credit_tiers_set('{"a":1}', '[]'); exception when others then ok := sqlerrm = 'HR_CREDIT_TIERS_INVALID'; end; assert ok, 'T2 ليس مصفوفة';
  r := public.it_credit_tiers_set('[{"upto":15,"pct":100},{"upto":30,"pct":50}]', '[{"upto":60,"pct":100},{"upto":120,"pct":50}]');
  assert r -> 'early_in' = '[{"upto":15,"pct":100},{"upto":30,"pct":50}]'::jsonb and jsonb_array_length(r -> 'late_out') = 2, 'T2 saved: ' || r::text;
  assert public.it_credit_tiers_get() = r, 'T2 get = set';
  assert exists (select 1 from public.hr_deduction_rule_audit where after -> 'credit_tiers' -> 'early_in' = '[{"upto":15,"pct":100},{"upto":30,"pct":50}]'::jsonb), 'T2 audit';
  raise notice 'T2 ✅ الحفظ والتحقق';
end $$;

-- ═══ T3 · المحرّك اليومي: 07:00→16:00 (مبكر 60 ⇒ 15 + 7.5 ≈ 23) · 08:00→17:30 (بقاء 90 ⇒ 60 + 15 = 75) · 08:30→17:00 (تأخر 30 يغطيه البقاء 30 بالكامل، الزائد 30 ⇒ 30) · 07:45→15:45 (مبكر 15 ⇒ 15 فائض؛ خروج مبكر 15 نقص — المبكر لا يعوّض) ═══
reset role; select set_config('auth.user_id','', false);
do $$ declare m date := current_setting('test.ct_m')::date; n int; begin
  n := public.biometric_ingest('CT-DEV-1', '8901' || E'\t' || m::text || E' 07:00:00\t0\n8901\t' || m::text || E' 16:00:00\t1', 'ATTLOG');
  n := public.biometric_ingest('CT-DEV-1', '8901' || E'\t' || (m+1)::text || E' 08:00:00\t0\n8901\t' || (m+1)::text || E' 17:30:00\t1', 'ATTLOG');
  n := public.biometric_ingest('CT-DEV-1', '8901' || E'\t' || (m+2)::text || E' 08:30:00\t0\n8901\t' || (m+2)::text || E' 17:00:00\t1', 'ATTLOG');
  n := public.biometric_ingest('CT-DEV-1', '8901' || E'\t' || (m+3)::text || E' 07:45:00\t0\n8901\t' || (m+3)::text || E' 15:45:00\t1', 'ATTLOG');
  perform app.hr_evaluate_month(m);
end $$;
do $$ declare m date := current_setting('test.ct_m')::date; d record; begin
  select * into d from public.hr_attendance_days where employee_id = 'c8000000-0000-0000-0000-0000000000e1' and work_date = m;
  assert d.overtime_minutes = 23 and d.shortfall_minutes = 0, 'T3 d1 مبكر 60 ⇒ 23: ' || row_to_json(d)::text;
  select * into d from public.hr_attendance_days where employee_id = 'c8000000-0000-0000-0000-0000000000e1' and work_date = m + 1;
  assert d.overtime_minutes = 75 and d.shortfall_minutes = 0, 'T3 d2 بقاء 90 ⇒ 75: ' || row_to_json(d)::text;
  select * into d from public.hr_attendance_days where employee_id = 'c8000000-0000-0000-0000-0000000000e1' and work_date = m + 2;
  assert d.overtime_minutes = 30 and d.shortfall_minutes = 0, 'T3 d3 تغطية التأخير 100% ثم الزائد 30: ' || row_to_json(d)::text;
  select * into d from public.hr_attendance_days where employee_id = 'c8000000-0000-0000-0000-0000000000e1' and work_date = m + 3;
  assert d.overtime_minutes = 15 and d.shortfall_minutes = 15, 'T3 d4 مبكر 15 فائض + خروج مبكر 15 نقص: ' || row_to_json(d)::text;
  raise notice 'T3 ✅ المحرّك اليومي بالشرائح';
end $$;

-- ═══ T4 · تغيير الشرائح يعيد الاحتساب فوراً: إلغاء احتساب المبكر ⇒ d1 = 0 ═══
select auth.set_test_user('c8000000-0000-0000-0000-000000000008');
do $$ declare m date := current_setting('test.ct_m')::date; d record; r jsonb; begin
  r := public.it_credit_tiers_set('[]', '[{"upto":720,"pct":100}]');
  select * into d from public.hr_attendance_days where employee_id = 'c8000000-0000-0000-0000-0000000000e1' and work_date = m;
  assert d.overtime_minutes = 0, 'T4 d1 بعد الإلغاء: ' || d.overtime_minutes;
  select * into d from public.hr_attendance_days where employee_id = 'c8000000-0000-0000-0000-0000000000e1' and work_date = m + 1;
  assert d.overtime_minutes = 90, 'T4 d2 متأخر 100%: ' || d.overtime_minutes;
  raise notice 'T4 ✅ إعادة الاحتساب عند التغيير';
end $$;
