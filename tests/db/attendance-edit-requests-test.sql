-- 00397-أ · «طلب تعديل بيانات الحضور»: نطاق × أيام × نوع، مباشر أو بطلب إلى HR عبر سلسلة، اعتماد HR، تراجع المعاون، السجل والمؤشرات. (بادئة 97)
set client_min_messages = warning;
reset role; select set_config('auth.user_id','', false);
insert into auth.users (id, email) values
  ('97000000-0000-0000-0000-0000000000a1', 'ae-ops@t.iq'), ('97000000-0000-0000-0000-0000000000a2', 'ae-hr@t.iq'), ('97000000-0000-0000-0000-0000000000a3', 'ae-dep@t.iq'),
  ('97000000-0000-0000-0000-0000000000a4', 'ae-exec@t.iq'), ('97000000-0000-0000-0000-0000000000a5', 'ae-it@t.iq'), ('97000000-0000-0000-0000-0000000000a6', 'ae-fin@t.iq'),
  ('97000000-0000-0000-0000-0000000000a7', 'ae-sa@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('97000000-0000-0000-0000-0000000000a1', 'ops_room'), ('97000000-0000-0000-0000-0000000000a2', 'hr_officer'), ('97000000-0000-0000-0000-0000000000a3', 'deputy_director'),
  ('97000000-0000-0000-0000-0000000000a4', 'executive_director'), ('97000000-0000-0000-0000-0000000000a5', 'it_admin'), ('97000000-0000-0000-0000-0000000000a6', 'finance_officer'),
  ('97000000-0000-0000-0000-0000000000a7', 'super_admin')
on conflict do nothing;
insert into public.departments (id, code, name, parent_id) values
  ('97000000-0000-0000-0000-0000000000d1', 'D97A', 'الأشغال والخدمات 97', null),
  ('97000000-0000-0000-0000-0000000000d2', 'D97B', 'شعبة النظافة 97', '97000000-0000-0000-0000-0000000000d1'),
  ('97000000-0000-0000-0000-0000000000d3', 'D97C', 'قسم آخر 97', null)
on conflict (id) do nothing;
insert into public.branches (id, name, code) values ('97000000-0000-0000-0000-0000000000b1', 'فرع 97', 'BR97') on conflict (id) do nothing;
-- شفت مسائي 16–22 كل الأيام (كحالة المستخدم)
insert into public.hr_shifts (id, name, start_time, end_time, grace_minutes, work_days) values
  ('97000000-0000-0000-0000-0000000000c1'::uuid, 'ae مسائي 16-22', '16:00', '22:00', 10, '{0,1,2,3,4,5,6}')
on conflict (name) do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, biometric_pin, department_id, branch_id) values
  ('97000000-0000-0000-0000-0000000000e1', null, 'AE-1', 'كرار يوسف 97', '2024-01-01', '9701', '97000000-0000-0000-0000-0000000000d1', '97000000-0000-0000-0000-0000000000b1'),
  ('97000000-0000-0000-0000-0000000000e2', null, 'AE-2', 'موظف الشعبة 97', '2024-01-01', '9702', '97000000-0000-0000-0000-0000000000d2', '97000000-0000-0000-0000-0000000000b1'),
  ('97000000-0000-0000-0000-0000000000e3', null, 'AE-3', 'موظف قسم آخر 97', '2024-01-01', '9703', '97000000-0000-0000-0000-0000000000d3', null),
  ('97000000-0000-0000-0000-0000000000e4', null, 'AE-4', 'موظف منتهي 97', '2024-01-01', '9704', '97000000-0000-0000-0000-0000000000d1', null)
on conflict (employee_number) do nothing;
update public.employees set employment_status = 'terminated' where id = '97000000-0000-0000-0000-0000000000e4';
insert into public.employee_shift_assignments (employee_id, shift_id, effective_from)
select e, '97000000-0000-0000-0000-0000000000c1'::uuid, '2024-01-01' from unnest(array['97000000-0000-0000-0000-0000000000e1','97000000-0000-0000-0000-0000000000e2','97000000-0000-0000-0000-0000000000e3']::uuid[]) e on conflict do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_err(q text, code text) returns void language plpgsql as $$
begin execute q; raise exception 'TEST_FAIL: expected % for %', code, q;
exception when others then if sqlerrm not like '%' || code || '%' then raise; end if; end $$;

-- أيام الاختبار: يومان في الشهر الحالي (ماضيان) — بصمة تجريبية سريعة: دخول 15:53 خروج 16:00 ⇒ خروج مبكر 360 دقيقة
do $$ declare d1 date := app.hr_local_date(now()) - 3; d2 date := app.hr_local_date(now()) - 2; e uuid; begin
  if extract(day from d1) < 1 or date_trunc('month', d1) <> date_trunc('month', app.hr_local_date(now())) then d1 := app.hr_local_date(now()) - 1; d2 := app.hr_local_date(now()); end if;
  perform set_config('test.ae_d1', d1::text, false); perform set_config('test.ae_d2', d2::text, false);
  foreach e in array array['97000000-0000-0000-0000-0000000000e1','97000000-0000-0000-0000-0000000000e2']::uuid[] loop
    insert into public.hr_attendance_days (employee_id, work_date, shift_name, expected_in, expected_out, check_in, check_out, late_minutes, early_minutes, worked_minutes, status, source)
    values (e, d1, 'ae مسائي 16-22', (d1 + time '16:00')::timestamp - interval '3 hours', (d1 + time '22:00')::timestamp - interval '3 hours',
            (d1 + time '15:53')::timestamp - interval '3 hours', (d1 + time '16:00')::timestamp - interval '3 hours', 0, 360, 7, 'early_leave', 'auto')
    on conflict (employee_id, work_date) do update set check_in = excluded.check_in, check_out = excluded.check_out, early_minutes = 360, late_minutes = 0, worked_minutes = 7, status = 'early_leave', source = 'auto';
  end loop;
end $$;

-- ═══ A1 · المعاينة: نطاق «قسم + أقسامه الفرعية» يحلّ موظفَي القسم والشعبة فقط (لا المنتهي ولا القسم الآخر)، ويحسب الدقائق التي ستُصحَّح ═══
do $$ declare j jsonb; d1 date := current_setting('test.ae_d1')::date; d2 date := current_setting('test.ae_d2')::date; begin
  perform pg_temp.as_user('97000000-0000-0000-0000-0000000000a1');
  j := public.attendance_edit_preview('department_tree', array['97000000-0000-0000-0000-0000000000d1']::uuid[], array[d1, d2], 'full_presence', '{}'::jsonb);
  assert (j ->> 'employees')::int = 2 and (j ->> 'days')::int = 2 and (j ->> 'items')::int = 4 and (j ->> 'skipped')::int = 0, 'preview counts: ' || (j - 'rows')::text;
  assert (j ->> 'minutes_to_fix')::int = 720, 'minutes to fix (2 × 360): ' || (j ->> 'minutes_to_fix');
  assert j ->> 'scope_label' = 'قسم الأشغال والخدمات 97 وأقسامه الفرعية' and j ->> 'action_label' = 'حضور كامل بأوقات الشفت', 'labels: ' || (j - 'rows')::text;
  assert jsonb_array_length(j -> 'rows') = 4 and (j -> 'rows' -> 0 -> 'before' ->> 'status') = 'early_leave' and (j -> 'rows' -> 0 -> 'proposed' ->> 'status') = 'present', 'rows: ' || (j -> 'rows' -> 0)::text;
  -- «قسم» بلا فرعي ⇒ موظف واحد؛ «فرع» ⇒ 2؛ «موظفون» ⇒ حسب القائمة
  assert (public.attendance_edit_preview('department', array['97000000-0000-0000-0000-0000000000d1']::uuid[], array[d1], 'full_presence', '{}'::jsonb) ->> 'employees')::int = 1, 'department only';
  assert (public.attendance_edit_preview('branch', array['97000000-0000-0000-0000-0000000000b1']::uuid[], array[d1], 'full_presence', '{}'::jsonb) ->> 'employees')::int = 2, 'branch';
  assert (public.attendance_edit_preview('employees', array['97000000-0000-0000-0000-0000000000e3','97000000-0000-0000-0000-0000000000e4']::uuid[], array[d1], 'full_presence', '{}'::jsonb) ->> 'employees')::int = 1, 'terminated excluded';
  -- التحقق: مستقبل / حمولة ناقصة / نطاق فارغ / المالية ممنوعة
  perform pg_temp.expect_err(format($q$select public.attendance_edit_preview('employees', array['97000000-0000-0000-0000-0000000000e1']::uuid[], array[%L::date], 'full_presence', '{}')$q$, app.hr_local_date(now()) + 1), 'HR_FUTURE_DATE');
  perform pg_temp.expect_err(format($q$select public.attendance_edit_preview('employees', array['97000000-0000-0000-0000-0000000000e1']::uuid[], array[%L::date], 'set_status', '{}')$q$, d1), 'HR_STATUS_INVALID');
  perform pg_temp.expect_err(format($q$select public.attendance_edit_preview('employees', array['97000000-0000-0000-0000-0000000000e1']::uuid[], array[%L::date], 'set_times', '{}')$q$, d1), 'ATT_EDIT_TIMES_REQUIRED');
  perform pg_temp.expect_err(format($q$select public.attendance_edit_preview('employees', array['97000000-0000-0000-0000-0000000000e4']::uuid[], array[%L::date], 'full_presence', '{}')$q$, d1), 'ATT_EDIT_SCOPE_EMPTY');
  perform pg_temp.as_user('97000000-0000-0000-0000-0000000000a6');
  perform pg_temp.expect_err(format($q$select public.attendance_edit_preview('employees', array['97000000-0000-0000-0000-0000000000e1']::uuid[], array[%L::date], 'full_presence', '{}')$q$, d1), 'HR_FORBIDDEN');
  raise warning 'A1 ✅ المعاينة والنطاقات والتحقق';
end $$;

-- ═══ A2 · تعديل مباشر من غرفة العمليات: يومان × موظفان ⇒ حضور كامل، صفر نقص، تبليغ مجمّع واحد للمعاون وIT (لا تبليغ لكل صف)، تدقيق صفّي ═══
do $$ declare j jsonb; d1 date := current_setting('test.ae_d1')::date; d2 date := current_setting('test.ae_d2')::date; a record; n int; begin
  perform pg_temp.as_user('97000000-0000-0000-0000-0000000000a1');
  perform pg_temp.expect_err(format($q$select public.attendance_edit_create('department_tree', array['97000000-0000-0000-0000-0000000000d1']::uuid[], array[%L::date], 'full_presence', '{}', 'قصير', 'direct')$q$, d1), 'HR_REASON_REQUIRED');
  j := public.attendance_edit_create('department_tree', array['97000000-0000-0000-0000-0000000000d1']::uuid[], array[d1, d2], 'full_presence', '{}'::jsonb, 'أيام تجربة تطوير البصمة — بُصم بسرعة ثم ضُغط حاضر', 'direct');
  assert j ->> 'status' = 'applied' and (j ->> 'items')::int = 4 and (j ->> 'minutes_fixed')::int = 720 and not (j ->> 'via_chain')::boolean, 'direct result: ' || j::text;
  perform set_config('test.ae_r1', j ->> 'id', false);
  select * into a from public.hr_attendance_days where employee_id = '97000000-0000-0000-0000-0000000000e1' and work_date = d1;
  assert a.status = 'present' and a.early_minutes = 0 and a.late_minutes = 0 and a.worked_minutes = 360 and a.source = 'manual'
     and a.check_in = (d1 + time '16:00')::timestamp - interval '3 hours' and a.check_out = (d1 + time '22:00')::timestamp - interval '3 hours', 'day fixed: ' || row_to_json(a)::text;
  assert a.shortfall_minutes = 0, 'shortfall recomputed to 0: ' || a.shortfall_minutes;
  select * into a from public.hr_attendance_days where employee_id = '97000000-0000-0000-0000-0000000000e2' and work_date = d2;
  assert a.status = 'present' and a.worked_minutes = 360, 'new row for day without row: ' || row_to_json(a)::text;
  -- تدقيق صفّي: 4 صفوف بسبب يحمل رقم الطلب
  select count(*) into n from public.hr_attendance_audit x where x.action = 'edit' and x.reason like '%[طلب تعديل حضور ' || left(current_setting('test.ae_r1'), 8) || ']';
  assert n = 4, 'audit rows: ' || n;
  -- تبليغ واحد مجمّع للمعاون وواحد لـIT — ولا تبليغات صفّية (hr_audit:*) من هذا التعديل
  select count(*) into n from public.notifications x where x.user_id = '97000000-0000-0000-0000-0000000000a3' and x.dedupe_key like 'att_edit_applied:' || current_setting('test.ae_r1') || '%';
  assert n = 1, 'deputy summary notification: ' || n;
  select count(*) into n from public.notifications x where x.user_id = '97000000-0000-0000-0000-0000000000a5' and x.dedupe_key like 'att_edit_applied:' || current_setting('test.ae_r1') || '%';
  assert n = 1, 'IT summary notification: ' || n;
  select count(*) into n from public.notifications x where x.user_id in ('97000000-0000-0000-0000-0000000000a5', '97000000-0000-0000-0000-0000000000a3') and x.dedupe_key like 'hr_audit:%'
    and x.entity_id in (select y.id from public.hr_attendance_audit y where y.reason like '%[طلب تعديل حضور%');
  assert n = 0, 'no per-row notifications during bulk: ' || n;
  assert (select x.body from public.notifications x where x.user_id = '97000000-0000-0000-0000-0000000000a3' and x.dedupe_key like 'att_edit_applied:' || current_setting('test.ae_r1') || '%') like '%2 موظف × 2 يوم = 4 يوم عمل · صُحّح 720 دقيقة%', 'summary body';
  raise warning 'A2 ✅ التعديل المباشر الجماعي + التبليغ المجمّع';
end $$;

-- ═══ A3 · السجل: الفلاتر، وما يراه كل دور (المالية لا)، والتفاصيل قبل/بعد ═══
do $$ declare r record; j jsonb; n int; begin
  perform pg_temp.as_user('97000000-0000-0000-0000-0000000000a4');   -- المدير التنفيذي: قراءة
  select * into r from public.attendance_edit_list() x where x.id = current_setting('test.ae_r1')::uuid;
  assert r.mode = 'direct' and r.status = 'applied' and r.status_label = 'نُفّذ' and r.employees_count = 2 and r.items_count = 4 and r.minutes_fixed = 720 and not r.can_revert and not r.can_cancel, 'exec row: ' || row_to_json(r)::text;
  assert r.departments like '%الأشغال والخدمات 97%' and r.departments like '%شعبة النظافة 97%', 'departments: ' || r.departments;
  select count(*) into n from public.attendance_edit_list(null, null, 'direct', 'applied', '97000000-0000-0000-0000-0000000000d1', null, null, null) x where x.id = current_setting('test.ae_r1')::uuid; assert n = 1, 'filter dept tree';
  select count(*) into n from public.attendance_edit_list(null, null, 'hr_request', null, null, null, null, null) x where x.id = current_setting('test.ae_r1')::uuid; assert n = 0, 'filter mode';
  select count(*) into n from public.attendance_edit_list(null, null, null, null, null, '97000000-0000-0000-0000-0000000000e3', null, null) x where x.id = current_setting('test.ae_r1')::uuid; assert n = 0, 'filter employee not in';
  select count(*) into n from public.attendance_edit_list(null, null, null, null, null, null, null, 'كرار') x where x.id = current_setting('test.ae_r1')::uuid; assert n = 1, 'search by employee name';
  j := public.attendance_edit_detail(current_setting('test.ae_r1')::uuid);
  assert jsonb_array_length(j -> 'items') = 4 and (j -> 'items' -> 0 -> 'before' ->> 'status') = 'early_leave' and (j -> 'items' -> 0 -> 'before' ->> 'early_minutes')::int = 360
     and (j -> 'items' -> 0 -> 'after' ->> 'status') = 'present' and (j -> 'items' -> 0 -> 'after' ->> 'early_minutes')::int = 0 and (j -> 'items' -> 0 ->> 'applied')::boolean, 'detail item: ' || (j -> 'items' -> 0)::text;
  perform pg_temp.as_user('97000000-0000-0000-0000-0000000000a3');
  select * into r from public.attendance_edit_list() x where x.id = current_setting('test.ae_r1')::uuid; assert r.can_revert, 'deputy can revert';
  perform pg_temp.as_user('97000000-0000-0000-0000-0000000000a6');
  perform pg_temp.expect_err('select * from public.attendance_edit_list()', 'HR_FORBIDDEN');
  perform pg_temp.expect_err(format('select public.attendance_edit_detail(%L)', current_setting('test.ae_r1')), 'HR_FORBIDDEN');
  raise warning 'A3 ✅ السجل والفلاتر والصلاحيات';
end $$;

-- ═══ A4 · طلب إلى الموارد البشرية بلا سلسلة ⇒ يصل HR مباشرة (approved)، HR تعدّل قيمة يوم وتستبعد يوماً ثم تعتمد ⇒ يُطبَّق ═══
do $$ declare j jsonb; d1 date := current_setting('test.ae_d1')::date; d2 date := current_setting('test.ae_d2')::date; it uuid; it2 uuid; a record; n int; begin
  -- نعيد الموظف 3 إلى حالة «خروج مبكر» ليكون هناك ما يُصحَّح
  insert into public.hr_attendance_days (employee_id, work_date, shift_name, expected_in, expected_out, check_in, check_out, late_minutes, early_minutes, worked_minutes, status, source)
  values ('97000000-0000-0000-0000-0000000000e3', d1, 'ae مسائي 16-22', (d1 + time '16:00')::timestamp - interval '3 hours', (d1 + time '22:00')::timestamp - interval '3 hours',
          (d1 + time '16:30')::timestamp - interval '3 hours', (d1 + time '20:00')::timestamp - interval '3 hours', 20, 120, 210, 'late', 'auto')
  on conflict (employee_id, work_date) do nothing;
  perform pg_temp.as_user('97000000-0000-0000-0000-0000000000a1');
  j := public.attendance_edit_create('employees', array['97000000-0000-0000-0000-0000000000e3']::uuid[], array[d1, d2], 'set_times', '{"check_in":"16:05","check_out":"22:00"}'::jsonb, 'تصحيح أوقات بعد مراجعة كاميرا الدوام', 'hr_request');
  assert j ->> 'status' = 'approved' and not (j ->> 'via_chain')::boolean, 'no chain ⇒ straight to HR: ' || j::text;
  perform set_config('test.ae_r2', j ->> 'id', false);
  -- لم يُطبَّق بعد
  select * into a from public.hr_attendance_days where employee_id = '97000000-0000-0000-0000-0000000000e3' and work_date = d1; assert a.status = 'late' and a.early_minutes = 120, 'not applied yet';
  -- HR أُبلغت؛ غرفة العمليات لا تستطيع تعديل البنود ولا الاعتماد
  assert exists (select 1 from public.notifications x where x.user_id = '97000000-0000-0000-0000-0000000000a2' and x.dedupe_key = 'att_edit_hr:' || (j ->> 'id') and x.body like '%بلا سلسلة موافقات — مباشر%'), 'HR notified';
  select i.id into it from public.attendance_edit_items i where i.request_id = (j ->> 'id')::uuid and i.work_date = d1;
  select i.id into it2 from public.attendance_edit_items i where i.request_id = (j ->> 'id')::uuid and i.work_date = d2;
  -- 00342: الاعتماد مربوط بوحدة hr.attendance-edits:decide ⇒ غرفة العمليات تُرفض من حارس الصلاحيات قبل الدالة
  perform pg_temp.expect_err(format('select public.attendance_edit_hr_apply(%L, null)', j ->> 'id'), 'PERMISSION_DENIED');
  perform pg_temp.expect_err(format('select public.attendance_edit_hr_update_item(%L, %L, null, null)', it, 'present'), 'HR_FORBIDDEN');
  -- HR: تعديل اليوم الأول إلى دخول 16:00 (بدل 16:05) واستبعاد اليوم الثاني ثم الاعتماد
  perform pg_temp.as_user('97000000-0000-0000-0000-0000000000a2');
  perform public.attendance_edit_hr_update_item(it, 'auto', (d1 + time '16:00')::timestamp - interval '3 hours', (d1 + time '22:00')::timestamp - interval '3 hours');
  perform public.attendance_edit_hr_skip_item(it2, 'لم يكن على رأس العمل');
  j := public.attendance_edit_hr_apply((j ->> 'id')::uuid, 'رُوجعت الكاميرا');
  assert j ->> 'status' = 'applied' and (j ->> 'items')::int = 1 and (j ->> 'minutes_fixed')::int = 140, 'hr apply: ' || j::text;
  select * into a from public.hr_attendance_days where employee_id = '97000000-0000-0000-0000-0000000000e3' and work_date = d1;
  assert a.status = 'present' and a.late_minutes = 0 and a.early_minutes = 0 and a.worked_minutes = 360 and a.edited_by = '97000000-0000-0000-0000-0000000000a2', 'applied by HR with engine-derived status: ' || row_to_json(a)::text;
  assert not exists (select 1 from public.hr_attendance_days where employee_id = '97000000-0000-0000-0000-0000000000e3' and work_date = d2), 'skipped day untouched';
  -- السجل: الوضع «بطلب»، ملاحظة HR، البند المستبعد والمعدَّل من HR
  select * into a from public.attendance_edit_list() x where x.id = current_setting('test.ae_r2')::uuid;
  assert a.mode = 'hr_request' and a.status = 'applied' and a.hr_note = 'رُوجعت الكاميرا' and a.applied_by = '97000000-0000-0000-0000-0000000000a2' and a.items_count = 1, 'hr row: ' || row_to_json(a)::text;
  j := public.attendance_edit_detail(current_setting('test.ae_r2')::uuid);
  assert (select count(*) from jsonb_array_elements(j -> 'items') i where (i ->> 'hr_edited')::boolean) = 2 and (select count(*) from jsonb_array_elements(j -> 'items') i where i ->> 'skipped_reason' like 'استبعدته الموارد البشرية%') = 1, 'hr edits visible: ' || (j -> 'items')::text;
  -- الاعتماد مرتين مرفوض؛ غرفة العمليات أُبلغت بالتنفيذ
  perform pg_temp.expect_err(format('select public.attendance_edit_hr_apply(%L, null)', current_setting('test.ae_r2')), 'ATT_EDIT_NOT_EDITABLE');
  assert exists (select 1 from public.notifications x where x.user_id = '97000000-0000-0000-0000-0000000000a1' and x.dedupe_key = 'att_edit_done:' || current_setting('test.ae_r2')), 'requester notified';
  raise warning 'A4 ✅ طلب إلى HR بلا سلسلة: مراجعة HR ثم اعتماد';
end $$;

-- ═══ A5 · مع سلسلة «تعديل حضور» (المعاون): الطلب ينتظر الموافقة ويظهر في مهام المعاون؛ الرفض يُنهيه؛ الموافقة تحيله إلى HR ═══
do $$ declare j jsonb; d1 date := current_setting('test.ae_d1')::date; t record; a record; begin
  perform pg_temp.as_user('97000000-0000-0000-0000-0000000000a7');
  perform public.approval_chain_save('ops_room', 'attendance_edit', '[{"kind":"hierarchy","role":"deputy_director"}]'::jsonb, true);
  perform pg_temp.as_user('97000000-0000-0000-0000-0000000000a1');
  j := public.attendance_edit_create('employees', array['97000000-0000-0000-0000-0000000000e1']::uuid[], array[d1], 'set_status', '{"status":"leave"}'::jsonb, 'إجازة لم تُسجَّل في وقتها', 'hr_request');
  assert j ->> 'status' = 'pending_approval' and (j ->> 'via_chain')::boolean, 'pending via chain: ' || j::text;
  perform set_config('test.ae_r3', j ->> 'id', false);
  -- HR لا تستطيع الاعتماد قبل الموافقة
  perform pg_temp.as_user('97000000-0000-0000-0000-0000000000a2');
  perform pg_temp.expect_err(format('select public.attendance_edit_hr_apply(%L, null)', j ->> 'id'), 'ATT_EDIT_NOT_EDITABLE');
  -- المعاون يراه في مهامه مع التفاصيل
  perform pg_temp.as_user('97000000-0000-0000-0000-0000000000a3');
  select * into t from public.approval_my_tasks() x where x.request_kind = 'attendance_edit' and x.request_id = (j ->> 'id')::uuid;
  assert t.task_id is not null and t.type_name = 'تعديل حضور' and t.details ->> 'scope_label' = 'كرار يوسف 97' and t.details ->> 'action_label' = 'تغيير حالة اليوم' and (t.details ->> 'employees')::int = 1, 'my task: ' || row_to_json(t)::text;
  assert exists (select 1 from public.notifications x where x.user_id = '97000000-0000-0000-0000-0000000000a3' and x.title like 'طلب تعديل حضور بانتظار موافقتك%'), 'deputy notified of step';
  -- رفض بلا سبب مرفوض؛ ثم رفض فعلي
  perform pg_temp.expect_err(format('select public.approval_decide_request(%L, %L, false, null)', 'attendance_edit', j ->> 'id'), 'HR_REASON_REQUIRED');
  perform public.approval_decide_request('attendance_edit', (j ->> 'id')::uuid, false, 'لا يوجد ما يثبت الإجازة');
  select * into a from public.attendance_edit_list() x where x.id = (j ->> 'id')::uuid;
  assert a.status = 'rejected' and a.rejected_note = 'لا يوجد ما يثبت الإجازة', 'rejected: ' || row_to_json(a)::text;
  assert exists (select 1 from public.notifications x where x.user_id = '97000000-0000-0000-0000-0000000000a1' and x.dedupe_key = 'att_edit_rej:' || (j ->> 'id')), 'requester notified of rejection';
  assert (select status from public.hr_attendance_days where employee_id = '97000000-0000-0000-0000-0000000000e1' and work_date = d1) = 'present', 'nothing applied on rejection';
  -- طلب جديد ⇒ موافقة ⇒ approved لدى HR ⇒ HR تعتمد
  perform pg_temp.as_user('97000000-0000-0000-0000-0000000000a1');
  j := public.attendance_edit_create('employees', array['97000000-0000-0000-0000-0000000000e1']::uuid[], array[d1], 'set_status', '{"status":"leave"}'::jsonb, 'إجازة لم تُسجَّل في وقتها — مرفق الكتاب', 'hr_request');
  perform set_config('test.ae_r4', j ->> 'id', false);
  perform pg_temp.as_user('97000000-0000-0000-0000-0000000000a3');
  perform public.approval_decide_request('attendance_edit', (j ->> 'id')::uuid, true, null);
  select * into a from public.attendance_edit_list() x where x.id = (j ->> 'id')::uuid;
  assert a.status = 'approved' and a.approved_at is not null and a.can_hr_apply = false, 'approved awaiting HR (deputy cannot hr_apply): ' || row_to_json(a)::text;
  assert exists (select 1 from public.notifications x where x.user_id = '97000000-0000-0000-0000-0000000000a2' and x.dedupe_key = 'att_edit_hr:' || (j ->> 'id') and x.body like '%اكتملت الموافقات%'), 'HR notified after approval';
  perform pg_temp.as_user('97000000-0000-0000-0000-0000000000a2');
  select * into a from public.attendance_edit_list() x where x.id = (j ->> 'id')::uuid; assert a.can_hr_apply, 'HR can apply';
  j := public.attendance_edit_hr_apply((j ->> 'id')::uuid, null);
  select * into a from public.hr_attendance_days where employee_id = '97000000-0000-0000-0000-0000000000e1' and work_date = d1;
  assert a.status = 'leave' and a.check_in is null and a.late_minutes = 0 and a.early_minutes = 0, 'leave applied: ' || row_to_json(a)::text;
  -- المسار الزمني مرئي للمدير التنفيذي
  perform pg_temp.as_user('97000000-0000-0000-0000-0000000000a4');
  assert (select count(*) from public.approval_timeline('attendance_edit', current_setting('test.ae_r4')::uuid)) = 1, 'timeline';
  raise warning 'A5 ✅ السلسلة: مهام المعاون، رفض، موافقة ثم اعتماد HR';
end $$;

-- ═══ A6 · التراجع (المعاون فقط): كل يوم يعود إلى ما كان عليه (الصف السابق أو الحذف وإعادة الاحتساب)، موثّق ومبلَّغ ═══
do $$ declare j jsonb; d1 date := current_setting('test.ae_d1')::date; d2 date := current_setting('test.ae_d2')::date; a record; n int; begin
  perform pg_temp.as_user('97000000-0000-0000-0000-0000000000a1');
  perform pg_temp.expect_err(format('select public.attendance_edit_revert(%L, %L)', current_setting('test.ae_r1'), 'تراجع تجريبي من غرفة العمليات'), 'HR_FORBIDDEN');
  perform pg_temp.as_user('97000000-0000-0000-0000-0000000000a3');
  perform pg_temp.expect_err(format('select public.attendance_edit_revert(%L, %L)', current_setting('test.ae_r1'), 'قصير'), 'HR_REASON_REQUIRED');
  perform pg_temp.expect_err(format('select public.attendance_edit_revert(%L, %L)', current_setting('test.ae_r3'), 'طلب مرفوض لا يُتراجع عنه'), 'ATT_EDIT_NOT_APPLIED');
  j := public.attendance_edit_revert(current_setting('test.ae_r1')::uuid, 'تبيّن أن التعديل شمل موظفاً لم يكن على رأس العمل');
  assert (j ->> 'reverted_items')::int = 4, 'reverted 4: ' || j::text;
  -- الموظف 2 يوم d1: كان له صف «خروج مبكر 360» ⇒ عاد
  select * into a from public.hr_attendance_days where employee_id = '97000000-0000-0000-0000-0000000000e2' and work_date = d1;
  assert a.status = 'early_leave' and a.early_minutes = 360 and a.worked_minutes = 7 and a.edit_reason like 'تراجع عن طلب تعديل حضور%', 'restored row: ' || row_to_json(a)::text;
  -- الموظف 2 يوم d2: لم يكن له صف ⇒ حُذف الصف اليدوي (وأُعيد الاحتساب التلقائي من البصمات — لا بصمات ⇒ لا صف أو غياب تلقائي)
  select * into a from public.hr_attendance_days where employee_id = '97000000-0000-0000-0000-0000000000e2' and work_date = d2;
  assert a.id is null or a.source = 'auto', 'day without prior row returned to auto: ' || coalesce(row_to_json(a)::text, 'none');
  -- الموظف 1 يوم d1: آخر تعديل كان «إجازة» (طلب 4) فوق تعديل الطلب 1 — التراجع عن الطلب 1 يعيد «قبل» الطلب 1 (خروج مبكر)
  select * into a from public.hr_attendance_days where employee_id = '97000000-0000-0000-0000-0000000000e1' and work_date = d1;
  assert a.status = 'early_leave' and a.early_minutes = 360, 'e1 d1 restored to pre-request-1 state: ' || row_to_json(a)::text;
  select * into a from public.attendance_edit_list() x where x.id = current_setting('test.ae_r1')::uuid;
  assert a.status = 'reverted' and a.status_label = 'مُتراجَع عنه' and a.reverted_by = '97000000-0000-0000-0000-0000000000a3' and a.revert_reason like 'تبيّن%' and not a.can_revert, 'reverted row: ' || row_to_json(a)::text;
  select count(*) into n from public.hr_attendance_audit x where x.reason like 'تراجع عن طلب تعديل حضور ' || left(current_setting('test.ae_r1'), 8) || '%'; assert n = 4, 'revert audit rows: ' || n;
  assert exists (select 1 from public.notifications x where x.user_id = '97000000-0000-0000-0000-0000000000a5' and x.dedupe_key = 'att_edit_revert:' || current_setting('test.ae_r1')), 'IT notified of revert';
  assert exists (select 1 from public.notifications x where x.user_id = '97000000-0000-0000-0000-0000000000a1' and x.dedupe_key = 'att_edit_revert_req:' || current_setting('test.ae_r1')), 'requester notified of revert';
  perform pg_temp.expect_err(format('select public.attendance_edit_revert(%L, %L)', current_setting('test.ae_r1'), 'تراجع مرة ثانية'), 'ATT_EDIT_NOT_APPLIED');
  raise warning 'A6 ✅ التراجع يعيد الأيام بدقة';
end $$;

-- ═══ A7 · المعاون ينفّذ تعديلاً مباشراً بنفسه (لا طلب إلى HR)، والإلغاء من الطالب، والمؤشرات ═══
do $$ declare j jsonb; d1 date := current_setting('test.ae_d1')::date; a record; begin
  perform pg_temp.as_user('97000000-0000-0000-0000-0000000000a3');
  perform pg_temp.expect_err(format($q$select public.attendance_edit_create('employees', array['97000000-0000-0000-0000-0000000000e2']::uuid[], array[%L::date], 'full_presence', '{}', 'المعاون لا يرسل طلبات إلى HR', 'hr_request')$q$, d1), 'ATT_EDIT_MODE_INVALID');
  j := public.attendance_edit_create('employees', array['97000000-0000-0000-0000-0000000000e2']::uuid[], array[d1], 'full_presence', '{}'::jsonb, 'تصحيح من المعاون بعد مراجعة السجل', 'direct');
  assert j ->> 'status' = 'applied' and (j ->> 'minutes_fixed')::int = 360, 'deputy direct: ' || j::text;
  select * into a from public.attendance_edit_list() x where x.id = (j ->> 'id')::uuid; assert a.requester_role = 'deputy_director', 'requester role recorded';
  -- إلغاء طلب معلّق من غرفة العمليات
  perform pg_temp.as_user('97000000-0000-0000-0000-0000000000a1');
  j := public.attendance_edit_create('employees', array['97000000-0000-0000-0000-0000000000e3']::uuid[], array[d1], 'set_status', '{"status":"absent"}'::jsonb, 'تبيّن غيابه بعد المراجعة', 'hr_request');
  assert j ->> 'status' = 'pending_approval', 'pending';
  perform pg_temp.as_user('97000000-0000-0000-0000-0000000000a2');
  perform pg_temp.expect_err(format('select public.attendance_edit_cancel(%L, null)', j ->> 'id'), 'HR_FORBIDDEN');
  perform pg_temp.as_user('97000000-0000-0000-0000-0000000000a1');
  perform public.attendance_edit_cancel((j ->> 'id')::uuid, 'أُدخل بالخطأ');
  select * into a from public.attendance_edit_list() x where x.id = (j ->> 'id')::uuid; assert a.status = 'cancelled', 'cancelled';
  assert not exists (select 1 from public.approval_tasks t where t.request_kind = 'attendance_edit' and t.request_id = (j ->> 'id')::uuid and t.status = 'pending'), 'tasks skipped';
  -- المؤشرات
  perform pg_temp.as_user('97000000-0000-0000-0000-0000000000a4');
  j := public.attendance_edit_stats(null);
  assert (j ->> 'total')::int >= 4 and (j ->> 'direct')::int >= 2 and (j ->> 'by_request')::int >= 2 and (j ->> 'reverted')::int = 1 and (j ->> 'rejected')::int = 1, 'stats: ' || j::text;
  assert (j ->> 'employees')::int >= 3 and (j ->> 'minutes_fixed')::int = 140 + 360 and (j -> 'by_action' ->> 'full_presence')::int >= 2 and jsonb_array_length(j -> 'top_requesters') >= 2, 'stats detail: ' || j::text;
  raise warning 'A7 ✅ المعاون مباشر، الإلغاء، المؤشرات';
end $$;

-- ═══ A8 · الشهر المعتمد حضورياً يمنع التعديل والتراجع برسالة واضحة؛ ops_attendance_edit الفردي ما زال يعمل بالمحرك نفسه ═══
do $$ declare d1 date := current_setting('test.ae_d1')::date; m date := date_trunc('month', d1)::date; a record; begin
  perform pg_temp.as_user('97000000-0000-0000-0000-0000000000a1');
  perform public.ops_attendance_edit('97000000-0000-0000-0000-0000000000e3', d1, (d1 + time '16:20')::timestamp - interval '3 hours', (d1 + time '22:00')::timestamp - interval '3 hours', 'late', 'تعديل فردي');
  select * into a from public.hr_attendance_days where employee_id = '97000000-0000-0000-0000-0000000000e3' and work_date = d1;
  assert a.status = 'late' and a.late_minutes = 10 and a.early_minutes = 0, 'single edit via same engine (20 − 10 grace): ' || row_to_json(a)::text;
  perform public.ops_attendance_confirm(m);
  perform pg_temp.expect_err(format($q$select public.attendance_edit_create('employees', array['97000000-0000-0000-0000-0000000000e1']::uuid[], array[%L::date], 'full_presence', '{}', 'بعد الاعتماد الشهري', 'direct')$q$, d1), 'HR_ATTENDANCE_CONFIRMED');
  perform pg_temp.as_user('97000000-0000-0000-0000-0000000000a3');
  perform pg_temp.expect_err(format('select public.attendance_edit_revert(%L, %L)', current_setting('test.ae_r2'), 'تراجع بعد اعتماد الشهر'), 'HR_ATTENDANCE_CONFIRMED');
  raise warning 'A8 ✅ الشهر المعتمد محمي والمحرك الفردي سليم';
end $$;

-- ═══ A9 (00397-ج) · بحث الموظفين لاختيار النطاق: المعاون وغرفة العمليات نعم (بلا منتهين)، HR والمالية والموظف لا ═══
do $$ declare n int; begin
  perform pg_temp.as_user('97000000-0000-0000-0000-0000000000a3');
  select count(*) into n from public.attendance_edit_employee_search('97'); assert n = 3, 'deputy sees 3 active (not terminated): ' || n;
  select count(*) into n from public.attendance_edit_employee_search('AE-2'); assert n = 1, 'search by number';
  assert (select department_name from public.attendance_edit_employee_search('AE-2')) = 'شعبة النظافة 97', 'department name';
  perform pg_temp.as_user('97000000-0000-0000-0000-0000000000a1');
  select count(*) into n from public.attendance_edit_employee_search('97'); assert n = 3, 'ops sees 3';
  perform pg_temp.as_user('97000000-0000-0000-0000-0000000000a2');
  select count(*) into n from public.attendance_edit_employee_search('97'); assert n = 0, 'hr not (uses its own lists)';
  perform pg_temp.as_user('97000000-0000-0000-0000-0000000000a6');
  select count(*) into n from public.attendance_edit_employee_search('97'); assert n = 0, 'finance not';
  raise warning 'A9 ✅ بحث الموظفين محصور بمن ينشئ الطلب';
end $$;
