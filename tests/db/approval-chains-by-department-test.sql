-- 00391: سلاسل الموافقات حسب القسم/القسم الفرعي + تشخيص «لماذا لا توجد سلسلة» + طلبات من لا حساب له + يتيم HR
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('39100000-0000-0000-0000-0000000000a1', 'it-391@t.iq'), ('39100000-0000-0000-0000-0000000000a2', 'hr-391@t.iq'), ('39100000-0000-0000-0000-0000000000a3', 'ops-391@t.iq'),
  ('39100000-0000-0000-0000-0000000000a4', 'mgr-391@t.iq'), ('39100000-0000-0000-0000-0000000000a5', 'deputy-391@t.iq'), ('39100000-0000-0000-0000-0000000000a6', 'emp2-391@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('39100000-0000-0000-0000-0000000000a1', 'it_admin'), ('39100000-0000-0000-0000-0000000000a2', 'hr_officer'), ('39100000-0000-0000-0000-0000000000a3', 'ops_room'),
  ('39100000-0000-0000-0000-0000000000a4', 'department_manager'), ('39100000-0000-0000-0000-0000000000a5', 'deputy_director'), ('39100000-0000-0000-0000-0000000000a6', 'employee')
on conflict do nothing;
insert into public.departments (id, code, name, parent_id) values
  ('39100000-0000-0000-0000-0000000000d1', 'D391A', 'قسم النقل 391', null),
  ('39100000-0000-0000-0000-0000000000d2', 'D391B', 'شعبة الورشة 391', '39100000-0000-0000-0000-0000000000d1'),
  ('39100000-0000-0000-0000-0000000000d3', 'D391C', 'قسم آخر 391', null)
on conflict (id) do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, department_id, biometric_pin) values
  ('39100000-0000-0000-0000-0000000000e1', null, 'D391-1', 'عامل بلا حساب', '2024-01-01', '39100000-0000-0000-0000-0000000000d2', null),
  ('39100000-0000-0000-0000-0000000000e2', '39100000-0000-0000-0000-0000000000a6', 'D391-2', 'موظف بحساب', '2024-01-01', '39100000-0000-0000-0000-0000000000d1', 'p391'),
  ('39100000-0000-0000-0000-0000000000e3', '39100000-0000-0000-0000-0000000000a4', 'D391-3', 'مسؤول القسم', '2024-01-01', '39100000-0000-0000-0000-0000000000d1', 'p392'),
  ('39100000-0000-0000-0000-0000000000e4', null, 'D391-4', 'عامل قسم آخر', '2024-01-01', '39100000-0000-0000-0000-0000000000d3', null)
on conflict (employee_number) do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_err(q text, code text) returns void language plpgsql as $$
begin execute q; raise exception 'TEST_FAIL: expected % for %', code, q;
exception when others then if sqlerrm not like '%' || code || '%' then raise; end if; end $$;

do $$
declare it uuid := '39100000-0000-0000-0000-0000000000a1'; hr uuid := '39100000-0000-0000-0000-0000000000a2'; ops uuid := '39100000-0000-0000-0000-0000000000a3';
        mgr uuid := '39100000-0000-0000-0000-0000000000a4'; dep uuid := '39100000-0000-0000-0000-0000000000a5'; u2 uuid := '39100000-0000-0000-0000-0000000000a6';
        d1 uuid := '39100000-0000-0000-0000-0000000000d1'; d2 uuid := '39100000-0000-0000-0000-0000000000d2'; d3 uuid := '39100000-0000-0000-0000-0000000000d3';
        e1 uuid := '39100000-0000-0000-0000-0000000000e1'; e2 uuid := '39100000-0000-0000-0000-0000000000e2'; e3 uuid := '39100000-0000-0000-0000-0000000000e3'; e4 uuid := '39100000-0000-0000-0000-0000000000e4';
        t_annual uuid; c_root uuid; c_sub uuid; c_role uuid; lid uuid; j jsonb; r record; n int; d0 date := current_date + 40;
begin
  select id into t_annual from public.hr_leave_types where code = 'annual';

  -- ── قبل أي سلسلة: عامل بلا حساب وبلا مدير — التشخيص يشرح أن الطلب يُحال إلى الموارد البشرية (00396: لا HR_NO_MANAGER) ──
  perform pg_temp.as_user(ops);
  j := public.approval_diagnose(e1, 'leave');
  assert (j ->> 'ok')::boolean = true and j ->> 'fallback' = 'hr_only' and j ->> 'reason' like '%يُحال إلى الموارد البشرية%', 'diag before: ' || j::text;
  assert j -> 'chain' = 'null'::jsonb and jsonb_array_length(j -> 'hints') >= 2, 'hints: ' || j::text;
  assert (select count(*) from jsonb_array_elements(j -> 'checks') c where (c ->> 'ok')::boolean) = 1, 'only department check ok: ' || (j -> 'checks')::text;   -- منسوب إلى قسم فقط
  assert jsonb_array_length(j -> 'department_path') = 2 and (j -> 'department_path' -> 1 ->> 'name') = 'قسم النقل 391', 'path: ' || (j -> 'department_path')::text;
  -- صلاحيات التشخيص: موظف أجنبي لا يرى
  perform pg_temp.as_user(u2);
  perform pg_temp.expect_err(format($q$select public.approval_diagnose(%L, 'leave')$q$, e1), 'HR_FORBIDDEN');
  perform public.approval_diagnose(e2, 'leave');   -- عن نفسه مسموح

  -- ── التطوير المركزية: سلسلة لقسم النقل تشمل الفرعية: مسؤول قسمه ← المعاون ──
  perform pg_temp.as_user(it);
  perform pg_temp.expect_err(format($q$select public.approval_chain_save('employee', 'supplies', '[{"kind":"account","user_id":"%s"}]'::jsonb, true, null, %L)$q$, dep, d1), 'APPROVAL_DEPT_TYPE_NOT_ALLOWED');
  perform pg_temp.expect_err(format($q$select public.approval_chain_save('employee', 'leave', '[{"kind":"account","user_id":"%s"}]'::jsonb, true, null, %L)$q$, dep, gen_random_uuid()), 'APPROVAL_DEPT_INVALID');
  c_root := public.approval_chain_save('employee', 'leave', jsonb_build_array(jsonb_build_object('kind', 'hierarchy', 'role', 'department_manager'), jsonb_build_object('kind', 'account', 'user_id', dep)), true, null, d1, true);
  select * into r from public.approval_chains where id = c_root;
  assert r.requester_role = 'department' and r.department_id = d1 and r.include_children, 'saved scope: ' || r::text;
  -- الحفظ مرة ثانية يحدّث ولا يكرّر
  assert public.approval_chain_save('x', 'leave', jsonb_build_array(jsonb_build_object('kind', 'hierarchy', 'role', 'department_manager'), jsonb_build_object('kind', 'account', 'user_id', dep)), true, null, d1, true) = c_root, 'upsert';
  select count(*) into n from public.approval_chains where department_id = d1 and request_type = 'leave'; assert n = 1, 'dup chain';
  select * into r from public.approval_chains_list() l where l.id = c_root;
  assert r.department_name = 'قسم النقل 391' and r.requester_label = 'موظفو القسم' and r.department_path = 'قسم النقل 391', 'list: ' || r::text;
  assert exists (select 1 from public.approval_chain_versions v where v.chain_id = c_root and v.department_id = d1), 'version has dept';

  -- ── التشخيص الآن: السلسلة تُطبَّق على العامل بلا حساب في الشعبة الفرعية؛ الخطوة 1 تُتخطّى (بلا مدير) والمعاون فعّال ──
  perform pg_temp.as_user(ops);
  j := public.approval_diagnose(e1, 'leave');
  assert (j ->> 'ok')::boolean and j ->> 'fallback' = 'chain' and j -> 'chain' ->> 'scope' = 'department' and j -> 'chain' ->> 'department_name' = 'قسم النقل 391', 'diag chain: ' || j::text;
  assert j -> 'steps' -> 0 ->> 'status' = 'skipped_nobody' and j -> 'steps' -> 1 ->> 'status' = 'active' and (j ->> 'active_steps')::int = 1, 'steps: ' || (j -> 'steps')::text;
  -- الطلب يمرّ الآن من غرفة العمليات لعامل بلا حساب وبلا مدير
  lid := public.hr_leave_request(e1, t_annual, d0, d0);
  select * into r from public.hr_leaves where id = lid;
  assert r.chain_id = c_root and r.status = 'pending' and r.requested_via = 'ops_room', 'leave row: ' || r::text;
  select * into r from public.approval_tasks t where t.request_id = lid and t.status = 'pending';
  assert r.step_no = 2 and r.approvers = array[dep], 'pending task: ' || r::text;
  assert (select status from public.approval_tasks t where t.request_id = lid and t.step_no = 1) = 'skipped', 'step1 skipped';
  -- المعاون يعتمد ⇒ الإجازة معتمدة
  perform pg_temp.as_user(dep);
  perform public.hr_leave_decide(lid, true, 'موافق');
  assert (select status from public.hr_leaves where id = lid) = 'approved', 'approved by chain';

  -- ── مدير مباشر بلا حساب للعامل؟ لا — المدير له حساب: خطوة «مسؤول قسمه» تُحلّ من الموظف لا من الحساب ──
  update public.employees set manager_id = e3 where id = e1;
  perform pg_temp.as_user(ops);
  j := public.approval_diagnose(e1, 'leave');
  assert j -> 'steps' -> 0 ->> 'status' = 'active' and j -> 'steps' -> 0 -> 'approvers' -> 0 ->> 'user_id' = mgr::text, 'mgr step: ' || (j -> 'steps')::text;
  lid := public.hr_leave_request(e1, t_annual, d0 + 2, d0 + 2);
  select * into r from public.approval_tasks t where t.request_id = lid and t.status = 'pending';
  assert r.step_no = 1 and r.approvers = array[mgr], 'mgr pending: ' || r::text;

  -- ── سلسلة للشعبة الفرعية تتقدّم على سلسلة القسم الأب؛ موظف القسم الأب يبقى على سلسلته ──
  perform pg_temp.as_user(it);
  c_sub := public.approval_chain_save('employee', 'leave', jsonb_build_array(jsonb_build_object('kind', 'account', 'user_id', dep)), true, null, d2, true);
  assert (app.approval_chain_for_employee(e1, 'leave', 'annual')).id = c_sub, 'closest dept wins';
  assert (app.approval_chain_for_employee(e2, 'leave', 'annual')).id = c_root, 'root for root employee';
  assert (app.approval_chain_for(u2, 'leave', 'annual')).id = c_root, 'user wrapper dept-aware';
  -- النوع الفرعي داخل المستوى نفسه يتقدّم على العام
  perform public.approval_chain_save('employee', 'leave', jsonb_build_array(jsonb_build_object('kind', 'hierarchy', 'role', 'hr_officer')), true, 'sick', d2, true);
  assert (app.approval_chain_for_employee(e1, 'leave', 'sick')).subtype = 'sick' and (app.approval_chain_for_employee(e1, 'leave', 'annual')).id = c_sub, 'subtype precedence';
  -- «لا يشمل الأقسام الفرعية»: تعطيل سلسلة الشعبة ⇒ العامل لا يرث سلسلة الأب ⇒ يعود للمدير المباشر
  perform public.approval_chain_save('employee', 'leave', jsonb_build_array(jsonb_build_object('kind', 'hierarchy', 'role', 'department_manager'), jsonb_build_object('kind', 'account', 'user_id', dep)), true, null, d1, false);
  update public.approval_chains set is_active = false where id = c_sub;
  assert (app.approval_chain_for_employee(e1, 'leave', 'annual')).id is null, 'no inheritance when include_children=false';
  perform pg_temp.as_user(ops);
  j := public.approval_diagnose(e1, 'leave');
  assert (j ->> 'ok')::boolean and j ->> 'fallback' = 'manager', 'manager fallback: ' || j::text;
  -- مسار القسم يُظهر سلسلة الأب مع applies=false
  assert (j -> 'department_path' -> 1 -> 'chains' -> 0 ->> 'applies')::boolean = false, 'applies flag: ' || (j -> 'department_path')::text;

  -- ── سلسلة الدور ما زالت تعمل بعد القسم: موظف بحساب ودور employee ──
  perform pg_temp.as_user(it);
  delete from public.approval_chains where department_id in (d1, d2);
  c_role := public.approval_chain_save('employee', 'leave', jsonb_build_array(jsonb_build_object('kind', 'account', 'user_id', dep)), true, null);
  assert (app.approval_chain_for_employee(e2, 'leave', 'annual')).id = c_role and (app.approval_chain_for(u2, 'leave')).id = c_role, 'role chain fallback';
  perform pg_temp.as_user(ops);
  j := public.approval_diagnose(e2, 'leave');
  assert j -> 'chain' ->> 'scope' = 'role' and (j ->> 'ok')::boolean, 'role diag: ' || j::text;
  -- سلسلة قسم تُنشأ بعدها تتقدّم على سلسلة الدور
  perform pg_temp.as_user(it);
  c_root := public.approval_chain_save('employee', 'leave', jsonb_build_array(jsonb_build_object('kind', 'hierarchy', 'role', 'hr_officer')), true, null, d1, true);
  assert (app.approval_chain_for_employee(e2, 'leave', 'annual')).id = c_root, 'dept beats role';
  -- حذف القسم يحذف سلسلته (cascade) ولا يترك سلاسل يتيمة
  delete from public.approval_chains where id = c_root;
  perform public.approval_chain_save('employee', 'leave', jsonb_build_array(jsonb_build_object('kind', 'account', 'user_id', dep)), true, null, d3, true);
  update public.employees set department_id = null where id = e4;
  delete from public.departments where id = d3;
  assert not exists (select 1 from public.approval_chains where department_id = d3), 'cascade';

  -- ── العيب ⑤: HR تقدّم لعامل بلا مدير وبلا سلسلة — كان الطلب يبقى يتيماً؛ الآن HR تقرّره ──
  delete from public.approval_chains where id = c_role;
  perform pg_temp.as_user(hr);
  lid := public.hr_leave_request(e4, t_annual, d0 + 5, d0 + 5);
  assert (select chain_id from public.hr_leaves where id = lid) is null and app.hr_can_decide(lid), 'hr can decide orphan';
  perform pg_temp.as_user(ops);
  assert not app.hr_can_decide(lid), 'ops cannot decide';
  perform pg_temp.as_user(hr);
  perform public.hr_leave_decide(lid, true, 'موافقة HR');
  assert (select status from public.hr_leaves where id = lid) = 'approved', 'hr decided orphan';

  -- ── المحاكاة (IT) تعرف سلاسل الأقسام للحسابات ──
  perform pg_temp.as_user(it);
  perform public.approval_chain_save('employee', 'leave', jsonb_build_array(jsonb_build_object('kind', 'account', 'user_id', dep)), true, null, d1, true);
  j := public.approval_simulate(u2, 'leave', null, '{}'::jsonb);
  assert j ->> 'department_name' = 'قسم النقل 391' and j ->> 'requester_role' = 'department', 'simulate: ' || j::text;
  raise warning 'test ok';
end $$;
