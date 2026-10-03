-- اختبار 00170 · الكشوفات كوحدة في غرفة العمليات: أنواع IT، آلية/موظف، السلسلة (المعاون ← المدير المفوض)، الإعادة بسبب، المبلغ، الاستقطاع التلقائي، الإلغاء، إخفاء الوحدات
insert into auth.users (id, email) values
  ('da000000-0000-0000-0000-000000000001', 'dz-ops1@test.local'),
  ('da000000-0000-0000-0000-000000000002', 'dz-ops2@test.local'),
  ('da000000-0000-0000-0000-000000000003', 'dz-dep@test.local'),
  ('da000000-0000-0000-0000-000000000004', 'dz-adm@test.local'),
  ('da000000-0000-0000-0000-000000000005', 'dz-it@test.local'),
  ('da000000-0000-0000-0000-000000000006', 'dz-old@test.local'),
  ('da000000-0000-0000-0000-000000000007', 'dz-fin@test.local')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('da000000-0000-0000-0000-000000000001', 'ops_room'), ('da000000-0000-0000-0000-000000000002', 'ops_room'),
  ('da000000-0000-0000-0000-000000000003', 'deputy_director'), ('da000000-0000-0000-0000-000000000004', 'super_admin'),
  ('da000000-0000-0000-0000-000000000005', 'it_admin'), ('da000000-0000-0000-0000-000000000007', 'finance_officer')
on conflict do nothing;
insert into public.employees (id, user_id, full_name, employee_number) values
  ('db000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000001', 'موظف غرفة العمليات ١', 'DZ-1'),
  ('db000000-0000-0000-0000-000000000002', 'da000000-0000-0000-0000-000000000002', 'موظف غرفة العمليات ٢', 'DZ-2'),
  ('db000000-0000-0000-0000-000000000003', 'da000000-0000-0000-0000-000000000003', 'معاون المدير المفوض', 'DZ-3'),
  ('db000000-0000-0000-0000-000000000004', 'da000000-0000-0000-0000-000000000004', 'المدير المفوض', 'DZ-4'),
  ('db000000-0000-0000-0000-000000000010', null, 'كرار سائق الآلية', 'DRV-10'),
  ('db000000-0000-0000-0000-000000000011', null, 'حيدر موظف إداري', 'EMP-11')
on conflict (id) do nothing;
insert into public.sectors (id, code, name, sort, parent_sector) values (1, 'S1', 'الكرادة', 1, 'karrada') on conflict (id) do nothing;
insert into public.garage_vehicles (id, vehicle_name, db_number, plate_number, chassis_number, image_path, shift, driver_name, sector_id, created_by, driver_employee_id) values
  ('dc000000-0000-0000-0000-000000000001', 'كابسة 12 م³', 'DB-501', '12345-بغداد', 'CH-501', 'v/501.jpg', 'morning', 'كرار سائق الآلية', 1, 'da000000-0000-0000-0000-000000000004', 'db000000-0000-0000-0000-000000000010'),
  ('dc000000-0000-0000-0000-000000000002', 'قلاب مؤجر', 'DB-777', '77777-بغداد', 'CH-777', 'v/777.jpg', 'evening', 'سائق مؤجر', 1, 'da000000-0000-0000-0000-000000000004', null)
on conflict (id) do nothing;

-- ═══ T0 · الأنواع الجاهزة ≥ 15 ═══
do $$ begin
  if (select count(*) from public.disclosure_types where is_active) < 15 then raise exception 'T0: seed types'; end if;
  raise notice 'T0 OK';
end $$;

-- ═══ T1 · أنواع الكشف: IT فقط؛ تحقق المفتاح/العقوبات؛ تعديل مبلغ افتراضي؛ تعطيل ═══
select auth.set_test_user('da000000-0000-0000-0000-000000000001');
do $$ begin
  begin perform public.disclosure_type_save('x_new', 'نوع', null, null, null, true, 1); raise exception 'should fail';
  exception when others then if sqlerrm <> 'IT_FORBIDDEN' then raise; end if; end;
end $$;
select auth.set_test_user('da000000-0000-0000-0000-000000000005');
do $$ declare j jsonb; begin
  begin perform public.disclosure_type_save('Bad Key', 'نوع', null, null, null, true, 1); raise exception 'should fail';
  exception when others then if sqlerrm <> 'DISCLOSURE_TYPE_KEY_INVALID' then raise; end if; end;
  begin perform public.disclosure_type_save('ok_key', 'نوع', null, array['jail'], null, true, 1); raise exception 'should fail';
  exception when others then if sqlerrm <> 'DISCLOSURE_PENALTY_INVALID' then raise; end if; end;
  j := public.disclosure_type_save('speeding', 'سرعة زائدة', 'تجاوز السرعة المسموحة', array['warning','reprimand'], 25000, true, 75);
  if not exists (select 1 from jsonb_array_elements(j) x where x ->> 'key' = 'speeding' and (x ->> 'default_amount')::numeric = 25000 and x ->> 'updated_by_name' is not null) then raise exception 'T1: save: %', j; end if;
  j := public.disclosure_type_save('uniform', 'مخالفة الزي/الهوية', null, null, null, false, 130);
  if (select is_active from public.disclosure_types where key = 'uniform') then raise exception 'T1: deactivate'; end if;
  raise notice 'T1 OK';
end $$;

-- ═══ T2 · إنشاء كشف على آلية: البيانات من قاعدة الآليات؛ المُعدّ يُسجَّل تلقائياً؛ النوع المعطّل/العقوبة غير المسموحة مرفوضان ═══
select auth.set_test_user('da000000-0000-0000-0000-000000000001');
do $$ declare j jsonb; v jsonb; begin
  v := public.disclosure_vehicle_lookup('501');
  if jsonb_array_length(v) <> 1 or (v -> 0 ->> 'driver_employee_name') <> 'كرار سائق الآلية' or (v -> 0 ->> 'sector') is null then raise exception 'T2: lookup: %', v; end if;
  begin perform public.disclosure_save(null, '{"target_kind":"vehicle","vehicle_id":"dc000000-0000-0000-0000-000000000001","violation_type":"uniform","details":"تفاصيل كافية هنا","log_date":"2026-09-10"}'); raise exception 'should fail';
  exception when others then if sqlerrm <> 'DISCLOSURE_TYPE_INVALID' then raise; end if; end;
  begin perform public.disclosure_save(null, '{"target_kind":"vehicle","vehicle_id":"dc000000-0000-0000-0000-000000000001","violation_type":"speeding","penalty_type":"termination","details":"تفاصيل كافية هنا","log_date":"2026-09-10"}'); raise exception 'should fail';
  exception when others then if sqlerrm <> 'DISCLOSURE_PENALTY_NOT_ALLOWED' then raise; end if; end;
  begin perform public.disclosure_save(null, '{"target_kind":"vehicle","vehicle_id":"dc000000-0000-0000-0000-000000000001","violation_type":"delay","details":"ab","log_date":"2026-09-10"}'); raise exception 'should fail';
  exception when others then if sqlerrm <> 'DISCLOSURE_DETAILS_REQUIRED' then raise; end if; end;
  j := public.disclosure_save(null, '{"target_kind":"vehicle","vehicle_id":"dc000000-0000-0000-0000-000000000001","violation_type":"delay","penalty_type":"warning","details":"تأخر عن الانطلاق ٤٠ دقيقة","log_date":"2026-09-10","contractor_name":"ذاتي"}');
  if j ->> 'status' <> 'draft' or j ->> 'db_number' <> 'DB-501' or j ->> 'driver_name' <> 'كرار سائق الآلية' or j ->> 'sector' is null or j ->> 'employee_id' <> 'db000000-0000-0000-0000-000000000010'
     or j ->> 'prepared_by_name' <> 'موظف غرفة العمليات ١' or j ->> 'period_month' <> '2026-09-01' or j ->> 'ref_no' !~ '^ك/\d{4}/\d{4}$' or j ->> 'type_label' <> 'تأخير' then raise exception 'T2: created: %', j; end if;
  perform set_config('test.d1', j ->> 'id', false);
  raise notice 'T2 OK';
end $$;

-- ═══ T3 · الرفع: بلا سلسلة مضبوطة ⇒ المعاون ثم المدير المفوض؛ المعاون يرى الكشف في وارده؛ غرفة العمليات لا تستطيع التقرير ═══
do $$ declare j jsonb; begin
  j := public.disclosure_submit(current_setting('test.d1')::uuid);
  if j ->> 'status' <> 'pending' or j ->> 'current_step' !~ 'معاون' then raise exception 'T3: submit: %', j; end if;
  begin perform public.disclosure_decide(current_setting('test.d1')::uuid, true, null, null); raise exception 'should fail';
  exception when others then if sqlerrm <> 'DISCLOSURE_FORBIDDEN' then raise; end if; end;
  if jsonb_array_length(public.disclosures_list('pending')) <> 1 then raise exception 'T3: list pending'; end if;
  if not exists (select 1 from public.notifications where user_id = 'da000000-0000-0000-0000-000000000003' and title like 'كشف بانتظار قرارك%' and link = '/deputy/statements') then raise exception 'T3: deputy notified'; end if;
end $$;
select auth.set_test_user('da000000-0000-0000-0000-000000000003');
do $$ declare inbox jsonb; j jsonb; begin
  inbox := public.disclosure_inbox();
  if jsonb_array_length(inbox) <> 1 or not (inbox -> 0 ->> 'can_decide')::boolean then raise exception 'T3: inbox: %', inbox; end if;
  -- الإعادة تتطلب سبباً
  begin perform public.disclosure_decide(current_setting('test.d1')::uuid, false, '', null); raise exception 'should fail';
  exception when others then if sqlerrm <> 'DISCLOSURE_RETURN_REASON_REQUIRED' then raise; end if; end;
  j := public.disclosure_decide(current_setting('test.d1')::uuid, false, 'نقص معلومات: لم يُذكر وقت الانطلاق الفعلي', null);
  if j ->> 'status' <> 'returned' or j ->> 'returned_by_name' <> 'معاون المدير المفوض' or j ->> 'return_reason' !~ 'نقص معلومات' then raise exception 'T3: return: %', j; end if;
  if not exists (select 1 from public.notifications where user_id = 'da000000-0000-0000-0000-000000000002' and title like 'أُعيد الكشف%') then raise exception 'T3: ops notified of return'; end if;
  raise notice 'T3 OK';
end $$;

-- ═══ T4 · زميل آخر في غرفة العمليات يصحّح ويعيد الرفع (المُعدّ الأصلي محفوظ، resubmit_count=1)؛ المعاون يحدد مبلغاً ويوافق؛ المدير المفوض يعدّل المبلغ ويعتمد ⇒ استقطاع في شهر المخالفة ═══
select auth.set_test_user('da000000-0000-0000-0000-000000000002');
do $$ declare j jsonb; begin
  j := public.disclosure_save(current_setting('test.d1')::uuid, '{"target_kind":"vehicle","vehicle_id":"dc000000-0000-0000-0000-000000000001","violation_type":"delay","penalty_type":"warning","details":"تأخر عن الانطلاق ٤٠ دقيقة — الانطلاق الفعلي 06:40","log_date":"2026-09-10","contractor_name":"ذاتي"}');
  j := public.disclosure_submit(current_setting('test.d1')::uuid);
  if j ->> 'status' <> 'pending' or (j ->> 'resubmit_count')::int <> 1 or j ->> 'prepared_by_name' <> 'موظف غرفة العمليات ١' or j ->> 'return_reason' is not null then raise exception 'T4: resubmit: %', j; end if;
  if not exists (select 1 from jsonb_array_elements(j -> 'events') e where e ->> 'action' = 'updated' and e ->> 'actor_name' = 'موظف غرفة العمليات ٢') then raise exception 'T4: actor recorded: %', j -> 'events'; end if;
end $$;
select auth.set_test_user('da000000-0000-0000-0000-000000000003');
do $$ declare j jsonb; begin
  j := public.disclosure_decide(current_setting('test.d1')::uuid, true, 'غرامة حسب التعليمات', 5000);
  if j ->> 'status' <> 'pending' or (j ->> 'amount')::numeric <> 5000 or j ->> 'amount_by_name' <> 'معاون المدير المفوض' or j ->> 'current_step' !~ 'المدير المفوض' then raise exception 'T4: deputy approve: %', j; end if;
  if jsonb_array_length(public.disclosure_inbox()) <> 0 then raise exception 'T4: deputy inbox should be empty'; end if;
end $$;
select auth.set_test_user('da000000-0000-0000-0000-000000000004');
do $$ declare j jsonb; r record; begin
  if jsonb_array_length(public.disclosure_inbox()) <> 1 then raise exception 'T4: admin inbox'; end if;
  j := public.disclosure_decide(current_setting('test.d1')::uuid, true, 'تخفيض المبلغ', 3000);
  if j ->> 'status' <> 'approved' or (j ->> 'amount')::numeric <> 3000 or j ->> 'approved_by_name' <> 'المدير المفوض' or not (j ->> 'deduction_posted')::boolean or j ->> 'deduction_month' <> '2026-09-01' then raise exception 'T4: final: %', j; end if;
  select * into r from public.hr_attendance_deductions where source_disclosure_id = current_setting('test.d1')::uuid;
  if r.id is null or r.amount <> 3000 or r.employee_id <> 'db000000-0000-0000-0000-000000000010' or r.period_month <> '2026-09-01' or r.reason !~ '^كشف ك/' then raise exception 'T4: deduction row: %', r; end if;
  if not exists (select 1 from public.hr_attendance_audit where employee_id = 'db000000-0000-0000-0000-000000000010' and action = 'deduction_add') then raise exception 'T4: audit'; end if;
  if not exists (select 1 from public.notifications where user_id = 'da000000-0000-0000-0000-000000000001' and title like 'اعتُمد الكشف%' and body like '%2026-09%') then raise exception 'T4: ops notified of approval'; end if;
  -- لا تقرير مرتين
  begin perform public.disclosure_decide(current_setting('test.d1')::uuid, true, null, null); raise exception 'should fail';
  exception when others then if sqlerrm <> 'DISCLOSURE_NOT_PENDING' then raise; end if; end;
  if (select count(*) from public.hr_attendance_deductions where source_disclosure_id = current_setting('test.d1')::uuid) <> 1 then raise exception 'T4: single deduction'; end if;
  raise notice 'T4 OK';
end $$;

-- ═══ T5 · كشف على موظف من النظام؛ شهر المخالفة مقفل من المالية ⇒ الاستقطاع يُرحَّل لأول شهر مفتوح ويُدوَّن ذلك ═══
insert into public.hr_month_exports (period_month, version, status, rows_count) values ('2026-08-01', 1, 'approved', 0) on conflict do nothing;
select auth.set_test_user('da000000-0000-0000-0000-000000000001');
do $$ declare j jsonb; e jsonb; begin
  e := public.disclosure_employee_lookup('حيدر');
  if jsonb_array_length(e) <> 1 or (e -> 0 ->> 'employee_number') <> 'EMP-11' then raise exception 'T5: emp lookup: %', e; end if;
  begin perform public.disclosure_save(null, '{"target_kind":"employee","violation_type":"absence","details":"غياب يوم كامل بلا عذر","log_date":"2026-08-20"}'); raise exception 'should fail';
  exception when others then if sqlerrm <> 'DISCLOSURE_EMPLOYEE_REQUIRED' then raise; end if; end;
  j := public.disclosure_save(null, '{"target_kind":"employee","employee_id":"db000000-0000-0000-0000-000000000011","violation_type":"absence","penalty_type":"reprimand","details":"غياب يوم كامل بلا عذر","log_date":"2026-08-20","amount":10000}');
  if j ->> 'driver_name' <> 'حيدر موظف إداري' or j ->> 'employee_number' <> 'EMP-11' or j ->> 'target_label' !~ 'حيدر' or (j ->> 'amount')::numeric <> 10000 then raise exception 'T5: emp disclosure: %', j; end if;
  perform set_config('test.d2', j ->> 'id', false);
  perform public.disclosure_submit(current_setting('test.d2')::uuid);
end $$;
select auth.set_test_user('da000000-0000-0000-0000-000000000003');
select public.disclosure_decide(current_setting('test.d2')::uuid, true, null, null);
select auth.set_test_user('da000000-0000-0000-0000-000000000004');
do $$ declare j jsonb; begin
  j := public.disclosure_decide(current_setting('test.d2')::uuid, true, null, null);
  if j ->> 'status' <> 'approved' or j ->> 'deduction_month' <> '2026-09-01' or j ->> 'deduction_note' !~ 'مقفل' then raise exception 'T5: rollover: %', j; end if;
  if not exists (select 1 from public.hr_attendance_deductions where source_disclosure_id = current_setting('test.d2')::uuid and period_month = '2026-09-01' and amount = 10000) then raise exception 'T5: deduction'; end if;
  raise notice 'T5 OK';
end $$;

-- ═══ T6 · آلية مؤجرة (سائق بلا سجل موظف) بمبلغ ⇒ يُسجَّل على الكشف فقط؛ الإلغاء بسبب يبلّغ المدير المفوض؛ الأرشيف والإحصاءات ═══
select auth.set_test_user('da000000-0000-0000-0000-000000000001');
do $$ declare j jsonb; k jsonb; s jsonb; begin
  j := public.disclosure_save(null, '{"target_kind":"vehicle","vehicle_id":"dc000000-0000-0000-0000-000000000002","violation_type":"load_deficiency","details":"حمولة ناقصة في المحطة التحويلية","log_date":"2026-09-12","amount":7000}');
  perform set_config('test.d3', j ->> 'id', false);
  perform public.disclosure_submit(current_setting('test.d3')::uuid);
  k := public.disclosure_save(null, '{"target_kind":"vehicle","vehicle_id":"dc000000-0000-0000-0000-000000000002","violation_type":"other","details":"كشف تجريبي سيُلغى","log_date":"2026-09-13"}');
  begin perform public.disclosure_cancel((k ->> 'id')::uuid, ''); raise exception 'should fail';
  exception when others then if sqlerrm <> 'DISCLOSURE_CANCEL_REASON_REQUIRED' then raise; end if; end;
  k := public.disclosure_cancel((k ->> 'id')::uuid, 'أُنشئ بالخطأ');
  if k ->> 'status' <> 'cancelled' or k ->> 'cancelled_by_name' <> 'موظف غرفة العمليات ١' then raise exception 'T6: cancel: %', k; end if;
  if not exists (select 1 from public.notifications where user_id = 'da000000-0000-0000-0000-000000000004' and title like 'أُلغي الكشف%') then raise exception 'T6: admin notified of cancel'; end if;
end $$;
select auth.set_test_user('da000000-0000-0000-0000-000000000003');
select public.disclosure_decide(current_setting('test.d3')::uuid, true, null, null);
select auth.set_test_user('da000000-0000-0000-0000-000000000004');
do $$ declare j jsonb; s jsonb; begin
  j := public.disclosure_decide(current_setting('test.d3')::uuid, true, null, null);
  if j ->> 'status' <> 'approved' or (j ->> 'deduction_posted')::boolean or j ->> 'deduction_note' !~ 'غير مرتبط' then raise exception 'T6: rented: %', j; end if;
  if jsonb_array_length(public.disclosures_list('archive')) <> 4 or jsonb_array_length(public.disclosures_list('approved', null, null, 'load_deficiency')) <> 1 or jsonb_array_length(public.disclosures_list('all', null, null, null, 'حيدر')) <> 1 then raise exception 'T6: lists'; end if;
  if jsonb_array_length(public.disclosures_list('all', null, null, null, null, '2026-08-15')) <> 1 then raise exception 'T6: month filter'; end if;
  s := public.disclosure_stats('2026-09-01');
  if (s ->> 'total')::int <> 3 or (s -> 'by_status' ->> 'approved')::int <> 2 or (s ->> 'amount_approved')::numeric <> 10000 or (s ->> 'deductions_posted')::int <> 1 then raise exception 'T6: stats: %', s; end if;
  raise notice 'T6 OK';
end $$;

-- ═══ T7 · سلسلة مضبوطة من IT (المدير المفوض فقط) تُغلّب الافتراضي ═══
select auth.set_test_user('da000000-0000-0000-0000-000000000005');
select public.approval_chain_save('ops_room', 'disclosure', '[{"kind":"hierarchy","role":"super_admin"}]'::jsonb, true);
select auth.set_test_user('da000000-0000-0000-0000-000000000001');
do $$ declare j jsonb; begin
  j := public.disclosure_save(null, '{"target_kind":"vehicle","vehicle_id":"dc000000-0000-0000-0000-000000000001","violation_type":"safety","details":"قيادة بسرعة داخل الحي","log_date":"2026-09-20"}');
  j := public.disclosure_submit((j ->> 'id')::uuid);
  if j ->> 'current_step' !~ 'المدير المفوض' or j ->> 'chain_id' is null then raise exception 'T7: chain: %', j; end if;
  raise notice 'T7 OK';
end $$;

-- ═══ T8 · إخفاء وحدات غرفة العمليات لحساب محدد (IT فقط) ═══
select auth.set_test_user('da000000-0000-0000-0000-000000000001');
do $$ begin
  begin perform public.it_hidden_units_set('da000000-0000-0000-0000-000000000002', 'ops-room', array['/ops-room/store']); raise exception 'should fail';
  exception when others then if sqlerrm <> 'IT_FORBIDDEN' then raise; end if; end;
  if public.my_hidden_units() <> '{}'::jsonb then raise exception 'T8: default visible'; end if;
end $$;
select auth.set_test_user('da000000-0000-0000-0000-000000000005');
select public.it_hidden_units_set('da000000-0000-0000-0000-000000000002', 'ops-room', array['/ops-room/store', '/ops-room/gps']);
select auth.set_test_user('da000000-0000-0000-0000-000000000002');
do $$ declare h jsonb := public.my_hidden_units(); begin
  if jsonb_array_length(h -> 'ops-room') <> 2 or not (h -> 'ops-room') ? '/ops-room/gps' then raise exception 'T8: hidden: %', h; end if;
  raise notice 'T8 OK';
end $$;
select auth.set_test_user('da000000-0000-0000-0000-000000000005');
do $$ begin
  if public.it_hidden_units_get('da000000-0000-0000-0000-000000000002', 'ops-room') <> array['/ops-room/store', '/ops-room/gps'] then raise exception 'T8: get'; end if;
  if public.it_hidden_units_get('da000000-0000-0000-0000-000000000001', 'ops-room') <> '{}'::text[] then raise exception 'T8: empty default'; end if;
end $$;

select 'DISCLOSURES UNIT TESTS PASSED' as result;

-- T9 (00171): لا ازدواج في disclosure_submit — نسخة uuid فقط
do $$ begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'disclosure_submit') <> 1 then raise exception 'T9 disclosure_submit overloads'; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app' and p.proname = 'disclosure_submit') then raise exception 'T9 app.disclosure_submit still exists'; end if;
end $$;
