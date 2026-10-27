-- اختبار 00305 (00360) · فقرة «المُعدّون» لمعاون المدير المفوض: التجميع بالحساب لا بالاسم، الأعداد حسب الحالة، الجهة، الشهر السابق، الصلاحيات
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
insert into auth.users (id, email) values
  ('dd000000-0000-0000-0000-000000000001', 'dp-ops1@test.local'), ('dd000000-0000-0000-0000-000000000002', 'dp-ops2@test.local'),
  ('dd000000-0000-0000-0000-000000000003', 'dp-dep@test.local'), ('dd000000-0000-0000-0000-000000000004', 'dp-adm@test.local'),
  ('dd000000-0000-0000-0000-000000000005', 'dp-garage@test.local'), ('dd000000-0000-0000-0000-000000000006', 'dp-hr@test.local')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('dd000000-0000-0000-0000-000000000001', 'ops_room'), ('dd000000-0000-0000-0000-000000000002', 'ops_room'),
  ('dd000000-0000-0000-0000-000000000003', 'deputy_director'), ('dd000000-0000-0000-0000-000000000004', 'super_admin'),
  ('dd000000-0000-0000-0000-000000000005', 'central_garage_officer'), ('dd000000-0000-0000-0000-000000000006', 'hr_officer')
on conflict do nothing;
insert into public.departments (id, name, code) values ('dd000000-0000-0000-0000-0000000000d1', 'dp الكراج المركزي', 'DPG') on conflict (id) do nothing;
insert into public.employees (id, user_id, full_name, employee_number, department_id) values
  ('de000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000001', 'dp موظف عمليات أ', 'DP-1', null),
  ('de000000-0000-0000-0000-000000000002', 'dd000000-0000-0000-0000-000000000002', 'dp موظف عمليات ب', 'DP-2', null),
  ('de000000-0000-0000-0000-000000000003', 'dd000000-0000-0000-0000-000000000003', 'dp معاون', 'DP-3', null),
  ('de000000-0000-0000-0000-000000000004', 'dd000000-0000-0000-0000-000000000004', 'dp مدير مفوض', 'DP-4', null),
  ('de000000-0000-0000-0000-000000000005', 'dd000000-0000-0000-0000-000000000005', 'dp موظف كراج', 'DP-5', 'dd000000-0000-0000-0000-0000000000d1'),
  ('de000000-0000-0000-0000-000000000011', null, 'dp سائق ١', 'DP-11', null), ('de000000-0000-0000-0000-000000000012', null, 'dp سائق ٢', 'DP-12', 'dd000000-0000-0000-0000-0000000000d1')
on conflict (id) do nothing;
select set_config('test.dp_m', date_trunc('month', current_date)::date::text, false);
select set_config('test.dp_pm', (date_trunc('month', current_date) - interval '1 month')::date::text, false);

-- الموظف أ: 4 كشوفات هذا الشهر (معتمد، مُعاد، قيد القرار، مسودة) + 1 الشهر الماضي · الموظف ب: 1 ملغى · الكراج: 1 قيد القرار
select auth.set_test_user('dd000000-0000-0000-0000-000000000001');
do $$ declare m date := current_setting('test.dp_m')::date; pm date := current_setting('test.dp_pm')::date; j jsonb; i int; ids uuid[] := '{}'; begin
  for i in 1..4 loop
    j := public.disclosure_save(null, jsonb_build_object('target_kind', 'employee', 'employee_id', 'de000000-0000-0000-0000-000000000011', 'violation_type', 'delay', 'penalty_type', 'warning', 'details', 'تأخر عن الدوام — حالة ' || i, 'log_date', least(m + i, current_date), 'amount', 2000));
    ids := ids || (j ->> 'id')::uuid;
  end loop;
  for i in 1..3 loop perform public.disclosure_submit(ids[i]); end loop;   -- الرابع يبقى مسودة
  perform set_config('test.dp_a1', ids[1]::text, false); perform set_config('test.dp_a2', ids[2]::text, false);
  j := public.disclosure_save(null, jsonb_build_object('target_kind', 'employee', 'employee_id', 'de000000-0000-0000-0000-000000000011', 'violation_type', 'delay', 'details', 'الشهر الماضي — تأخر', 'log_date', pm + 5));
  perform public.disclosure_submit((j ->> 'id')::uuid);
end $$;
select auth.set_test_user('dd000000-0000-0000-0000-000000000002');
do $$ declare m date := current_setting('test.dp_m')::date; j jsonb; begin
  j := public.disclosure_save(null, jsonb_build_object('target_kind', 'employee', 'employee_id', 'de000000-0000-0000-0000-000000000011', 'violation_type', 'absence', 'details', 'غياب بلا عذر مقبول', 'log_date', m));
  perform public.disclosure_submit((j ->> 'id')::uuid);
  perform public.disclosure_cancel((j ->> 'id')::uuid, 'مكرر مع كشف آخر');
end $$;
select auth.set_test_user('dd000000-0000-0000-0000-000000000005');
do $$ declare m date := current_setting('test.dp_m')::date; j jsonb; begin
  j := public.disclosure_save(null, jsonb_build_object('target_kind', 'employee', 'employee_id', 'de000000-0000-0000-0000-000000000012', 'violation_type', 'uniform', 'details', 'بلا زي رسمي في الكراج', 'log_date', m));
  perform public.disclosure_submit((j ->> 'id')::uuid);
end $$;
-- المعاون: يعتمد الأول (خطوة 1) ويعيد الثاني
select auth.set_test_user('dd000000-0000-0000-0000-000000000003');
select public.disclosure_decide(current_setting('test.dp_a1')::uuid, true, null, 2000);
select public.disclosure_decide(current_setting('test.dp_a2')::uuid, false, 'نقص معلومات في الكشف', null);
-- المدير المفوض: الاعتماد النهائي للأول
select auth.set_test_user('dd000000-0000-0000-0000-000000000004');
select public.disclosure_decide(current_setting('test.dp_a1')::uuid, true, null, null);

-- ═══ T1 · المعاون يقرأ: أ = 4 مسجَّلة (1 معتمد، 1 مُعاد، 1 قيد القرار، 1 مسودة) ومقارنة بالشهر الماضي ═══
select auth.set_test_user('dd000000-0000-0000-0000-000000000003');
do $$ declare m date := current_setting('test.dp_m')::date; r jsonb; a jsonb; b jsonb; g jsonb; begin
  r := public.disclosure_preparers(m);
  assert r ->> 'month' = to_char(m, 'YYYY-MM'), 'T1 month';
  select x into a from jsonb_array_elements(r -> 'rows') x where x ->> 'user_id' = 'dd000000-0000-0000-0000-000000000001';
  assert a is not null and a ->> 'name' = 'dp موظف عمليات أ' and a ->> 'unit' = 'غرفة العمليات', 'T1 A head: ' || coalesce(a::text, 'null');
  assert (a ->> 'registered')::int = 4 and (a ->> 'approved')::int = 1 and (a ->> 'returned')::int = 1 and (a ->> 'pending')::int = 1 and (a ->> 'draft')::int = 1 and (a ->> 'cancelled')::int = 0, 'T1 A counts: ' || a::text;
  assert (a ->> 'amount_approved')::numeric = 2000 and (a ->> 'prev_registered')::int = 1 and (a ->> 'delta')::int = 3 and (a ->> 'approval_rate')::numeric = 50, 'T1 A amounts/prev: ' || a::text;
  select x into b from jsonb_array_elements(r -> 'rows') x where x ->> 'user_id' = 'dd000000-0000-0000-0000-000000000002';
  assert (b ->> 'registered')::int = 1 and (b ->> 'cancelled')::int = 1 and (b ->> 'approval_rate')::numeric = 0, 'T1 B cancelled: ' || b::text;
  select x into g from jsonb_array_elements(r -> 'rows') x where x ->> 'user_id' = 'dd000000-0000-0000-0000-000000000005';
  assert g ->> 'unit' = 'الكراج المركزي' and (g ->> 'pending')::int = 1, 'T1 garage unit: ' || g::text;
  assert (r -> 'rows' -> 0 ->> 'user_id') = 'dd000000-0000-0000-0000-000000000001', 'T1 order by registered desc';
  assert (r -> 'totals' ->> 'registered')::int >= 6 and (r -> 'totals' ->> 'approved')::int >= 1 and (r -> 'totals' ->> 'preparers')::int >= 3, 'T1 totals: ' || (r -> 'totals')::text;
  raise notice 'T1 ✅ أعداد المُعدّين';
end $$;

-- ═══ T2 · التجميع بالحساب: تغيير اسم الموظف في الموارد البشرية لا يقسم السطر ويظهر الاسم الجديد ═══
reset role; select set_config('auth.user_id','', false);
update public.employees set full_name = 'dp موظف عمليات أ (اسم جديد)' where id = 'de000000-0000-0000-0000-000000000001';
select auth.set_test_user('dd000000-0000-0000-0000-000000000003');
do $$ declare m date := current_setting('test.dp_m')::date; r jsonb; n int; a jsonb; rep jsonb; p jsonb; begin
  r := public.disclosure_preparers(m);
  select count(*) into n from jsonb_array_elements(r -> 'rows') x where x ->> 'user_id' = 'dd000000-0000-0000-0000-000000000001';
  select x into a from jsonb_array_elements(r -> 'rows') x where x ->> 'user_id' = 'dd000000-0000-0000-0000-000000000001';
  assert n = 1 and (a ->> 'registered')::int = 4 and a ->> 'name' = 'dp موظف عمليات أ (اسم جديد)', 'T2 grouped by account: ' || a::text;
  -- التقرير الشامل: «حسب المُعدّ» بالحساب أيضاً (المسودات لا تدخل في التقرير)
  rep := public.disclosure_report(m, (m + interval '1 month - 1 day')::date);
  select x into p from jsonb_array_elements(rep -> 'by_preparer') x where x ->> 'user_id' = 'dd000000-0000-0000-0000-000000000001';
  assert p is not null and (p ->> 'count')::int = 3 and (p ->> 'approved')::int = 1 and (p ->> 'returned')::int = 1 and p ->> 'unit' = 'غرفة العمليات' and p ->> 'name' = 'dp موظف عمليات أ (اسم جديد)', 'T2 report by_preparer: ' || coalesce(p::text, 'null');
  raise notice 'T2 ✅ التجميع بالحساب';
end $$;

-- ═══ T3 · الصلاحيات: المدير المفوض يقرأ؛ غرفة العمليات والموارد البشرية لا ═══
select auth.set_test_user('dd000000-0000-0000-0000-000000000004');
do $$ begin assert public.disclosure_preparers(null) ? 'rows', 'T3 exec reads'; end $$;
select auth.set_test_user('dd000000-0000-0000-0000-000000000001');
do $$ declare ok boolean := false; begin
  begin perform public.disclosure_preparers(null); exception when others then ok := sqlerrm like '%DISCLOSURE_FORBIDDEN%'; end; assert ok, 'T3 ops forbidden';
end $$;
select auth.set_test_user('dd000000-0000-0000-0000-000000000006');
do $$ declare ok boolean := false; begin
  begin perform public.disclosure_preparers(null); exception when others then ok := sqlerrm like '%DISCLOSURE_FORBIDDEN%'; end; assert ok, 'T3 hr forbidden';
  raise notice 'T3 ✅ الصلاحيات';
end $$;
reset role; select set_config('auth.user_id','', false);
