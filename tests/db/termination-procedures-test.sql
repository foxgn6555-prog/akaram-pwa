-- اختبار 00163: وحدة «الإجراءات» — طلبات إنهاء الخدمة بنطاقات متدرجة وسلاسل موافقات. مستقل (بادئة ea، مناطق 4 و7).
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('ea000000-0000-0000-0000-000000000001', 'it-t@t.iq'),
  ('ea000000-0000-0000-0000-000000000002', 'hr-t@t.iq'),        -- موارد بشرية
  ('ea000000-0000-0000-0000-000000000003', 'dm4-t@t.iq'),       -- مسؤول قسم (منطقة 4 كرادة)
  ('ea000000-0000-0000-0000-000000000004', 'sm-t@t.iq'),        -- مسؤول قاطع الكرادة
  ('ea000000-0000-0000-0000-000000000005', 'fo-t@t.iq'),        -- العمليات الميدانية
  ('ea000000-0000-0000-0000-000000000006', 'dm7-t@t.iq'),       -- مسؤول قسم (منطقة 7 زعفرانية)
  ('ea000000-0000-0000-0000-000000000007', 'ct4-t@t.iq'),       -- متعهد منطقة 4
  ('ea000000-0000-0000-0000-000000000008', 'dep-t@t.iq'),       -- معاون المدير
  ('ea000000-0000-0000-0000-000000000009', 'exe-t@t.iq'),       -- المدير المفوض
  ('ea000000-0000-0000-0000-00000000000a', 'gar-t@t.iq'),       -- الكراج المركزي
  ('ea000000-0000-0000-0000-00000000000b', 'sm2-t@t.iq'),       -- مسؤول قاطع الزعفرانية
  ('ea000000-0000-0000-0000-00000000000c', 'sa-t@t.iq')         -- المدير المفوض (super_admin — بوابة /admin)
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('ea000000-0000-0000-0000-000000000001', 'it_admin'), ('ea000000-0000-0000-0000-000000000002', 'hr_officer'), ('ea000000-0000-0000-0000-000000000003', 'department_manager'),
  ('ea000000-0000-0000-0000-000000000004', 'admin_ops'), ('ea000000-0000-0000-0000-000000000005', 'field_ops'), ('ea000000-0000-0000-0000-000000000006', 'department_manager'),
  ('ea000000-0000-0000-0000-000000000007', 'employee'), ('ea000000-0000-0000-0000-000000000008', 'deputy_director'), ('ea000000-0000-0000-0000-000000000009', 'executive_director'),
  ('ea000000-0000-0000-0000-00000000000a', 'central_garage_officer'), ('ea000000-0000-0000-0000-00000000000b', 'admin_ops'), ('ea000000-0000-0000-0000-00000000000c', 'super_admin')
on conflict do nothing;
insert into public.manager_profiles (user_id, shift, sectors) values ('ea000000-0000-0000-0000-000000000003', 'morning', '{4}'), ('ea000000-0000-0000-0000-000000000006', 'evening', '{7}') on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, phone, biometric_pin) values
  ('ea000000-0000-0000-0000-0000000000e3', 'ea000000-0000-0000-0000-000000000003', 'TR-M4', 'مسؤول قسم 4', '2024-01-01', '0771', 't3'),
  ('ea000000-0000-0000-0000-0000000000e6', 'ea000000-0000-0000-0000-000000000006', 'TR-M7', 'مسؤول قسم 7', '2024-01-01', '0772', 't6'),
  ('ea000000-0000-0000-0000-0000000000e7', 'ea000000-0000-0000-0000-000000000007', 'TR-C4', 'متعهد 4', '2024-01-01', '0773', 't7'),
  ('ea000000-0000-0000-0000-0000000000e4', 'ea000000-0000-0000-0000-000000000004', 'TR-SM', 'مسؤول قاطع الكرادة', '2024-01-01', '0774', 't4'),
  ('ea000000-0000-0000-0000-0000000000e8', 'ea000000-0000-0000-0000-000000000008', 'TR-DEP', 'المعاون', '2024-01-01', '0775', 't8'),
  ('ea000000-0000-0000-0000-0000000000e9', 'ea000000-0000-0000-0000-000000000009', 'TR-EXE', 'المدير المفوض', '2024-01-01', '0776', 't9'),
  ('ea000000-0000-0000-0000-0000000000ea', 'ea000000-0000-0000-0000-00000000000a', 'TR-GAR', 'موظف كراج', '2024-01-01', '0777', 'ta'),
  ('ea000000-0000-0000-0000-0000000000eb', 'ea000000-0000-0000-0000-00000000000b', 'TR-SM2', 'مسؤول قاطع الزعفرانية', '2024-01-01', '0778', 'tb')
on conflict (employee_number) do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;
create table pg_temp.ids (k text primary key, v uuid);

-- ═══ T0 · تهيئة: مسؤولا القاطعين، متعهد المنطقة 4 وعاملان له ═══
do $$
declare w public.contractor_workers;
begin
  perform pg_temp.as_user('ea000000-0000-0000-0000-000000000001');
  perform public.sector_manager_profile_save('ea000000-0000-0000-0000-000000000004', '{karrada}');
  perform public.sector_manager_profile_save('ea000000-0000-0000-0000-00000000000b', '{zaafaraniya}');
  perform public.contractor_assign('ea000000-0000-0000-0000-000000000007', 'ea000000-0000-0000-0000-000000000003', 4::smallint);
  perform pg_temp.as_user('ea000000-0000-0000-0000-000000000007');
  w := public.contractor_add_worker('عامل أول', '0790'); insert into pg_temp.ids values ('w1', w.id);
  w := public.contractor_add_worker('عامل ثاني', '0791'); insert into pg_temp.ids values ('w2', w.id);
  raise notice 'T0 ✅ تهيئة';
end $$;

-- ═══ T1 · النطاقات المتدرجة ═══
do $$
declare n int; names text[];
begin
  -- مسؤول قسم: ليس له صلاحية
  perform pg_temp.as_user('ea000000-0000-0000-0000-000000000003');
  perform pg_temp.expect_error($q$ select * from public.termination_targets() $q$, 'PROCEDURE_FORBIDDEN');
  -- مسؤول قاطع الكرادة: مسؤول قسم 4 + متعهد 4 + عاملاه فقط (لا مسؤول قسم 7، لا مسؤولي القواطع)
  perform pg_temp.as_user('ea000000-0000-0000-0000-000000000004');
  select array_agg(full_name order by full_name) into names from public.termination_targets();
  if names <> array['عامل أول','عامل ثاني','متعهد 4','مسؤول قسم 4'] then raise exception 'sm scope wrong: %', names; end if;
  select count(*) into n from public.termination_targets() t where t.target_kind = 'worker'; if n <> 2 then raise exception 'workers %', n; end if;
  select count(*) into n from public.termination_targets() t where t.scope = 'contractor' and t.label like 'متعهد · %'; if n <> 1 then raise exception 'contractor label'; end if;
  -- مسؤول قاطع الزعفرانية: مسؤول قسم 7 فقط
  perform pg_temp.as_user('ea000000-0000-0000-0000-00000000000b');
  select array_agg(full_name order by full_name) into names from public.termination_targets();
  if names <> array['مسؤول قسم 7'] then raise exception 'sm2 scope wrong: %', names; end if;
  -- العمليات الميدانية: كل ما سبق + مسؤولو القواطع + الكراج؛ لا المعاون ولا المدير
  perform pg_temp.as_user('ea000000-0000-0000-0000-000000000005');
  select array_agg(full_name order by full_name) into names from public.termination_targets();
  if not (names @> array['مسؤول قسم 4','مسؤول قسم 7','متعهد 4','مسؤول قاطع الكرادة','مسؤول قاطع الزعفرانية','موظف كراج','عامل أول']) then raise exception 'fo scope missing: %', names; end if;
  if names && array['المعاون','المدير المفوض'] then raise exception 'fo scope too wide: %', names; end if;
  -- المعاون: الجميع عدا المدير المفوض (ونفسه)
  perform pg_temp.as_user('ea000000-0000-0000-0000-000000000008');
  select array_agg(full_name order by full_name) into names from public.termination_targets();
  if names && array['المدير المفوض','المعاون'] then raise exception 'deputy scope too wide: %', names; end if;
  if not (names @> array['مسؤول قاطع الكرادة','موظف كراج','عامل ثاني']) then raise exception 'deputy scope missing: %', names; end if;
  -- المدير المفوض: الجميع (بما فيهم المعاون) عدا نفسه
  perform pg_temp.as_user('ea000000-0000-0000-0000-000000000009');
  select array_agg(full_name order by full_name) into names from public.termination_targets();
  if not ('المعاون' = any(names)) or 'المدير المفوض' = any(names) then raise exception 'exec scope wrong: %', names; end if;
  -- المدير المفوض (super_admin): الجميع بمن فيهم المدير التنفيذي والمعاون
  perform pg_temp.as_user('ea000000-0000-0000-0000-00000000000c');
  select array_agg(full_name order by full_name) into names from public.termination_targets();
  if not (names @> array['المعاون','المدير المفوض','مسؤول قاطع الكرادة','عامل أول']) then raise exception 'super_admin scope wrong: %', names; end if;
  if app.approval_link_for('ea000000-0000-0000-0000-00000000000c') <> '/admin/approvals' or app.procedures_link_for('ea000000-0000-0000-0000-00000000000c') <> '/admin/procedures' then raise exception 'admin links'; end if;
  raise notice 'T1 ✅ النطاقات';
end $$;

-- ═══ T2 · بلا سلسلة: تحقق المدخلات، خارج النطاق مرفوض، الموافقة الافتراضية للموارد البشرية، التنفيذ الفعلي لعامل ═══
do $$
declare w1 uuid := (select v from pg_temp.ids where k = 'w1'); rid uuid; r record; n int;
begin
  perform pg_temp.as_user('ea000000-0000-0000-0000-000000000004');
  perform pg_temp.expect_error(format($q$ select public.termination_request_create('worker', '%s', 'other', current_date, 'سبب كافٍ هنا') $q$, w1), 'HR_TERMINATION_TYPE_INVALID');
  perform pg_temp.expect_error(format($q$ select public.termination_request_create('worker', '%s', 'dismissal', current_date, 'قص') $q$, w1), 'PROCEDURE_REASON_REQUIRED');
  perform pg_temp.expect_error($q$ select public.termination_request_create('employee', 'ea000000-0000-0000-0000-0000000000e6', 'dismissal', current_date, 'خارج نطاقي') $q$, 'PROCEDURE_TARGET_FORBIDDEN');
  perform pg_temp.expect_error($q$ select public.termination_request_create('employee', 'ea000000-0000-0000-0000-0000000000e4', 'resignation', current_date, 'لا يجوز لنفسه') $q$, 'PROCEDURE_TARGET_FORBIDDEN');
  rid := public.termination_request_create('worker', w1, 'dismissal', current_date, 'تغيّب متكرر بلا عذر');
  perform pg_temp.expect_error(format($q$ select public.termination_request_create('worker', '%s', 'dismissal', current_date, 'تكرار الطلب نفسه') $q$, w1), 'PROCEDURE_ALREADY_PENDING');
  select * into r from public.termination_requests_mine() m where m.id = rid;
  if r.status <> 'pending' or r.current_step not like 'الموارد البشرية%' or r.termination_type_label <> 'فصل' or r.chain_id is not null then raise exception 'mine wrong: %', r; end if;
  select count(*) into n from public.notifications where user_id = 'ea000000-0000-0000-0000-000000000002' and title like 'طلب إنهاء خدمة%'; if n < 1 then raise exception 'hr not notified'; end if;
  -- الطالب لا يقرر؛ HR ترى المهمة بتفاصيلها
  perform pg_temp.expect_error(format($q$ select public.approval_decide_request('termination', '%s', true) $q$, rid), 'HR_FORBIDDEN');
  perform pg_temp.as_user('ea000000-0000-0000-0000-000000000002');
  select * into r from public.approval_my_tasks() t where t.request_id = rid;
  if r.request_kind <> 'termination' or r.details ->> 'target_name' <> 'عامل أول' or r.details ->> 'type_label' <> 'فصل' or r.requester_role <> 'admin_ops' or r.requester_name <> 'مسؤول قاطع الكرادة' then raise exception 'task wrong: %', r; end if;
  perform pg_temp.expect_error(format($q$ select public.approval_decide_request('termination', '%s', false) $q$, rid), 'APPROVAL_REASON_REQUIRED');
  perform public.approval_decide_request('termination', rid, true);
  select * into r from public.termination_requests where id = rid; if r.status <> 'executed' or r.executed_at is null then raise exception 'not executed: %', r; end if;
  select * into r from public.contractor_workers where id = w1; if r.is_active or r.remove_reason not like 'إنهاء خدمة:%' then raise exception 'worker still active'; end if;
  select count(*) into n from public.contractor_audit_log where worker_id = w1 and action = 'worker_terminated'; if n <> 1 then raise exception 'audit'; end if;
  select count(*) into n from public.notifications where user_id = 'ea000000-0000-0000-0000-000000000004' and dedupe_key = 'termination_exec:' || rid::text; if n <> 1 then raise exception 'requester not notified'; end if;
  -- بعد التنفيذ لا يظهر العامل ضمن الأهداف
  perform pg_temp.as_user('ea000000-0000-0000-0000-000000000004');
  select count(*) into n from public.termination_targets() t where t.worker_id = w1; if n <> 0 then raise exception 'terminated worker still a target'; end if;
  raise notice 'T2 ✅ بلا سلسلة + تنفيذ عامل';
end $$;

-- ═══ T3 · سلسلة من التطوير المركزية (مسؤول قاطع → العمليات الميدانية → المعاون): رفض بسبب، ثم موافقة كاملة تُنهي موظفاً متعهداً وتُبلغ HR و IT؛ وسحب الطلب ═══
do $$
declare rid uuid; r record; n int;
begin
  perform pg_temp.as_user('ea000000-0000-0000-0000-000000000001');
  perform pg_temp.expect_error($q$ select public.approval_chain_save('admin_ops', 'firing', '[{"kind":"hierarchy","role":"field_ops"}]') $q$, 'APPROVAL_TYPE_INVALID');
  perform public.approval_chain_save('admin_ops', 'termination', '[{"kind":"hierarchy","role":"field_ops"},{"kind":"hierarchy","role":"deputy_director"}]');
  perform pg_temp.as_user('ea000000-0000-0000-0000-000000000004');
  rid := public.termination_request_create('employee', 'ea000000-0000-0000-0000-0000000000e7', 'contract_end', current_date + 7, 'انتهاء مدة التعاقد');
  select * into r from public.termination_requests_mine() m where m.id = rid;
  if r.chain_id is null or r.current_step not like 'العمليات الميدانية%' then raise exception 'chain not applied: %', r; end if;
  select count(*) into n from public.approval_timeline('termination', rid); if n <> 2 then raise exception 'timeline %', n; end if;
  perform pg_temp.as_user('ea000000-0000-0000-0000-000000000005');
  perform public.approval_decide_request('termination', rid, false, 'المتعهد ما زال ملتزماً');
  select * into r from public.termination_requests where id = rid; if r.status <> 'rejected' then raise exception 'should be rejected'; end if;
  select * into r from public.employees where id = 'ea000000-0000-0000-0000-0000000000e7'; if r.employment_status = 'terminated' then raise exception 'must not terminate on reject'; end if;
  select count(*) into n from public.notifications where user_id = 'ea000000-0000-0000-0000-000000000004' and dedupe_key = 'termination_rejected:' || rid::text; if n <> 1 then raise exception 'reject notice'; end if;
  -- طلب جديد: موافقة خطوتين → تنفيذ
  perform pg_temp.as_user('ea000000-0000-0000-0000-000000000004');
  rid := public.termination_request_create('employee', 'ea000000-0000-0000-0000-0000000000e7', 'contract_end', current_date + 7, 'انتهاء مدة التعاقد فعلياً');
  perform pg_temp.as_user('ea000000-0000-0000-0000-000000000005');
  perform public.approval_decide_request('termination', rid, true, 'موافق');
  select * into r from public.termination_requests where id = rid; if r.status <> 'pending' then raise exception 'should still be pending'; end if;
  perform pg_temp.as_user('ea000000-0000-0000-0000-000000000008');
  select * into r from public.approval_my_tasks() t where t.request_id = rid;
  if r.step_no <> 2 or jsonb_array_length(r.previous_steps) <> 1 or r.parent_sector <> 'الكرادة' then raise exception 'deputy task wrong: %', r; end if;
  perform public.approval_decide_request('termination', rid, true);
  select * into r from public.employees where id = 'ea000000-0000-0000-0000-0000000000e7';
  if r.employment_status <> 'terminated' or r.termination_type <> 'contract_end' or r.terminated_at <> current_date + 7 or r.terminated_by <> 'ea000000-0000-0000-0000-000000000004' then raise exception 'employee not terminated: %', r; end if;
  select * into r from public.contractor_profiles where user_id = 'ea000000-0000-0000-0000-000000000007'; if r.is_active then raise exception 'contractor profile still active'; end if;
  select count(*) into n from public.finance_hr_notices where employee_id = 'ea000000-0000-0000-0000-0000000000e7' and kind = 'termination_settlement'; if n <> 1 then raise exception 'finance notice'; end if;
  select count(*) into n from public.notifications where dedupe_key like 'termination_done:' || rid::text || ':%' and user_id in ('ea000000-0000-0000-0000-000000000001','ea000000-0000-0000-0000-000000000002'); if n <> 2 then raise exception 'hr/it notices %', n; end if;
  -- بعد التنفيذ: المتعهد وعماله خارج الأهداف
  perform pg_temp.as_user('ea000000-0000-0000-0000-000000000004');
  select count(*) into n from public.termination_targets(); if n <> 1 then raise exception 'targets after contractor end: %', n; end if;
  -- سحب الطلب: الطالب فقط، وبينما هو معلّق فقط
  rid := public.termination_request_create('employee', 'ea000000-0000-0000-0000-0000000000e3', 'resignation', current_date, 'قدّم استقالته خطياً');
  perform pg_temp.as_user('ea000000-0000-0000-0000-000000000005');
  perform pg_temp.expect_error(format($q$ select public.termination_request_cancel('%s') $q$, rid), 'PROCEDURE_FORBIDDEN');
  perform pg_temp.as_user('ea000000-0000-0000-0000-000000000004');
  perform public.termination_request_cancel(rid);
  select * into r from public.termination_requests where id = rid; if r.status <> 'cancelled' then raise exception 'cancel'; end if;
  select count(*) into n from public.approval_tasks where request_kind = 'termination' and request_id = rid and status = 'pending'; if n <> 0 then raise exception 'tasks remain'; end if;
  perform pg_temp.expect_error(format($q$ select public.termination_request_cancel('%s') $q$, rid), 'PROCEDURE_NOT_PENDING');
  perform pg_temp.as_user('ea000000-0000-0000-0000-000000000005');
  select count(*) into n from public.approval_my_tasks() t where t.request_id = rid; if n <> 0 then raise exception 'cancelled task visible'; end if;
  -- بلا أي مُعتمِد (لا HR ولا سلسلة) → APPROVAL_NO_APPROVER ولا يبقى طلب
  delete from public.user_roles where user_id = 'ea000000-0000-0000-0000-000000000002' and role = 'hr_officer';
  perform pg_temp.as_user('ea000000-0000-0000-0000-000000000009');
  perform pg_temp.expect_error($q$ select public.termination_request_create('employee', 'ea000000-0000-0000-0000-0000000000ea', 'retirement', current_date, 'بلوغ السن القانونية') $q$, 'APPROVAL_NO_APPROVER');
  select count(*) into n from public.termination_requests where target_employee_id = 'ea000000-0000-0000-0000-0000000000ea'; if n <> 0 then raise exception 'orphan request'; end if;
  insert into public.user_roles (user_id, role) values ('ea000000-0000-0000-0000-000000000002', 'hr_officer');
  raise notice 'T3 ✅ سلسلة + تنفيذ موظف/متعهد + سحب';
end $$;
