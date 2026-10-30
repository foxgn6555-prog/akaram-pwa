-- 00390: تعديل المدير المباشر (ذات/حلقة/غير فعّال)، نوع العقد، حالة التوظيف، التدقيق، قائمة المرشحين
set client_min_messages = notice;
insert into auth.users (id, email) values ('39000000-0000-0000-0000-0000000000a1', 'hr-390@t.iq'), ('39000000-0000-0000-0000-0000000000a2', 'emp-390@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('39000000-0000-0000-0000-0000000000a1', 'hr_officer'), ('39000000-0000-0000-0000-0000000000a2', 'employee') on conflict do nothing;
insert into public.employees (id, employee_number, full_name, hire_date) values
  ('39000000-0000-0000-0000-0000000000e1', 'M390-1', 'المدير الأعلى', '2024-01-01'), ('39000000-0000-0000-0000-0000000000e2', 'M390-2', 'مدير وسيط', '2024-01-01'),
  ('39000000-0000-0000-0000-0000000000e3', 'M390-3', 'موظف', '2024-01-01'), ('39000000-0000-0000-0000-0000000000e4', 'M390-4', 'منتهي الخدمة', '2024-01-01')
on conflict (employee_number) do nothing;
update public.employees set manager_id = '39000000-0000-0000-0000-0000000000e1' where id = '39000000-0000-0000-0000-0000000000e2';
update public.employees set manager_id = '39000000-0000-0000-0000-0000000000e2' where id = '39000000-0000-0000-0000-0000000000e3';
update public.employees set employment_status = 'terminated', terminated_at = current_date - 1 where id = '39000000-0000-0000-0000-0000000000e4';
create or replace function pg_temp.expect_err(q text, code text) returns void language plpgsql as $$
begin execute q; raise exception 'TEST_FAIL: expected % for %', code, q;
exception when others then if sqlerrm not like '%' || code || '%' then raise; end if; end $$;
do $$ declare n int; e1 uuid := '39000000-0000-0000-0000-0000000000e1'; e2 uuid := '39000000-0000-0000-0000-0000000000e2'; e3 uuid := '39000000-0000-0000-0000-0000000000e3'; e4 uuid := '39000000-0000-0000-0000-0000000000e4'; begin
  perform set_config('auth.user_id', '39000000-0000-0000-0000-0000000000a1', true);
  -- المدير = نفسه
  perform pg_temp.expect_err(format($q$select public.hr_employee_update(%L, '{"manager_id":"%s"}'::jsonb)$q$, e3, e3), 'HR_MANAGER_SELF');
  -- حلقة: جعل مدير الأعلى هو الموظف (الموظف مرؤوس غير مباشر للأعلى)
  perform pg_temp.expect_err(format($q$select public.hr_employee_update(%L, '{"manager_id":"%s"}'::jsonb)$q$, e1, e3), 'HR_MANAGER_CYCLE');
  -- مدير منتهي الخدمة
  perform pg_temp.expect_err(format($q$select public.hr_employee_update(%L, '{"manager_id":"%s"}'::jsonb)$q$, e3, e4), 'HR_MANAGER_INVALID');
  -- تغيير صحيح: الموظف يتبع الأعلى مباشرة + تدقيق
  perform public.hr_employee_update(e3, jsonb_build_object('manager_id', e1));
  assert (select manager_id from public.employees where id = e3) = e1;
  assert exists (select 1 from public.audit_logs where table_name = 'employees' and record_id = e3::text and operation = 'UPDATE' and new_row ->> 'kind' = 'hr_sensitive_update' and new_row -> 'manager_id' ->> 'to' = e1::text), 'audit manager';
  -- إزالة المدير (فارغ) مسموح
  perform public.hr_employee_update(e3, '{"manager_id": ""}'::jsonb);
  assert (select manager_id from public.employees where id = e3) is null;
  -- نوع العقد
  perform pg_temp.expect_err(format($q$select public.hr_employee_update(%L, '{"contract_type":"weekly"}'::jsonb)$q$, e3), 'HR_CONTRACT_TYPE_INVALID');
  perform public.hr_employee_update(e3, '{"contract_type":"daily"}'::jsonb);
  assert (select contract_type from public.employees where id = e3) = 'daily';
  assert exists (select 1 from public.audit_logs where record_id = e3::text and new_row -> 'contract_type' ->> 'to' = 'daily'), 'audit contract';
  -- حالة التوظيف
  perform pg_temp.expect_err(format($q$select public.hr_employee_update(%L, '{"employment_status":"terminated"}'::jsonb)$q$, e3), 'HR_EMPLOYMENT_STATUS_INVALID');
  perform public.hr_employee_update(e3, '{"employment_status":"suspended"}'::jsonb);
  assert (select employment_status from public.employees where id = e3) = 'suspended';
  perform public.hr_employee_update(e3, '{"employment_status":"active"}'::jsonb);
  perform pg_temp.expect_err(format($q$select public.hr_employee_update(%L, '{"employment_status":"active"}'::jsonb)$q$, e4), 'HR_EMPLOYEE_TERMINATED');
  -- لا تدقيق عند عدم تغيّر شيء حساس
  select count(*) into n from public.audit_logs where record_id = e3::text and operation = 'UPDATE' and new_row ->> 'kind' = 'hr_sensitive_update';
  perform public.hr_employee_update(e3, '{"phone":"0770"}'::jsonb);
  assert (select count(*) from public.audit_logs where record_id = e3::text and operation = 'UPDATE' and new_row ->> 'kind' = 'hr_sensitive_update') = n, 'audit on plain field';
  -- المرشحون للمدير: للأعلى e1 ⇒ يستثني نفسه ومرؤوسيه (e2) والمنتهي (e4)؛ يبقى e3 (بلا مدير الآن)
  assert (select array_agg(employee_number order by employee_number) from public.hr_manager_candidates(e1, 'M390')) = array['M390-3'], 'candidates e1';
  assert (select count(*) from public.hr_manager_candidates(e3, 'M390')) = 2, 'candidates e3';
  -- الموظف العادي ممنوع
  perform set_config('auth.user_id', '39000000-0000-0000-0000-0000000000a2', true);
  perform pg_temp.expect_err(format($q$select public.hr_employee_update(%L, '{"manager_id":"%s"}'::jsonb)$q$, e3, e1), 'HR_FORBIDDEN');
  assert (select count(*) from public.hr_manager_candidates(e3, 'M390')) = 0;
  perform set_config('auth.user_id', '', true);
  raise notice 'hr-employee-manager-contract-test: OK';
end $$;
