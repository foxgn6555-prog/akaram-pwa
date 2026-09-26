-- 00143 · استيراد الموظفين + إدارة الأقسام
do $$
declare
  hr1 uuid := '8d000000-0000-0000-0000-000000000001'; fin uuid := '8d000000-0000-0000-0000-000000000002';
  dep uuid; sub uuid; br uuid; j jsonb; n int; d uuid; r record;
begin
  insert into auth.users(id, email) values (hr1, 'hr2@x.iq'), (fin, 'fin2@x.iq');
  insert into public.user_roles(user_id, role) values (hr1, 'hr_officer'), (fin, 'finance_officer');
  insert into public.branches(name, code) values ('فرع الرصافة', 'RSF-T') returning id into br;
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', hr1::text, false);

  -- ① الأقسام: إنشاء أب وابن، رمز مكرر مرفوض، دورة مرفوضة
  select public.hr_department_save(null, 'الخدمات', 'SRV-T', null) into dep;
  select public.hr_department_save(null, 'النظافة', 'srv-t1', dep) into sub;
  if (select code from public.departments where id = sub) <> 'SRV-T1' then raise exception 'CODE_UPPER_FAIL'; end if;
  begin perform public.hr_department_save(null, 'مكرر', 'SRV-T', null); raise exception 'DUP_CODE_ALLOWED';
  exception when others then if sqlerrm not like '%HR_DEPT_CODE_TAKEN%' then raise; end if; end;
  begin perform public.hr_department_save(dep, 'الخدمات', 'SRV-T', sub); raise exception 'CYCLE_ALLOWED';
  exception when others then if sqlerrm not like '%HR_DEPT_CYCLE%' then raise; end if; end;
  begin perform public.hr_department_save(null, '', 'X-T', null); raise exception 'EMPTY_NAME_ALLOWED';
  exception when others then if sqlerrm not like '%HR_DEPT_NAME_REQUIRED%' then raise; end if; end;

  -- ② الاستيراد: تحقق مسبق (dry run) لا يُدخل شيئاً ويكشف كل الأخطاء
  select public.hr_employees_import(jsonb_build_array(
    jsonb_build_object('employee_number', 'I-1', 'full_name', 'موظف أول', 'department', 'النظافة', 'branch', 'RSF-T', 'shift', 'صباحي', 'biometric_pin', '9001', 'contract_type', 'daily'),
    jsonb_build_object('employee_number', 'I-2', 'full_name', 'موظف ثانٍ', 'department', 'قسم غير موجود', 'gender', 'x'),
    jsonb_build_object('employee_number', 'I-1', 'full_name', 'مكرر في الملف'),
    jsonb_build_object('employee_number', '', 'full_name', 'بلا رقم', 'hire_date', 'ليس تاريخاً')
  ), true) into j;
  if (j ->> 'total')::int <> 4 or (j ->> 'ok')::int <> 1 or (j ->> 'failed')::int <> 3 then raise exception 'DRY_COUNTS_FAIL %', j; end if;
  if not (j -> 'rows' -> 1 -> 'errors') ?& array['HR_IMPORT_DEPT_UNKNOWN', 'HR_GENDER_INVALID'] then raise exception 'DRY_ERRS_FAIL %', j -> 'rows' -> 1; end if;
  if not (j -> 'rows' -> 2 -> 'errors') ? 'HR_IMPORT_DUP_IN_FILE' then raise exception 'DRY_DUP_FAIL'; end if;
  if not (j -> 'rows' -> 3 -> 'errors') ?& array['HR_NUMBER_REQUIRED', 'HR_DATE_INVALID'] then raise exception 'DRY_ROW4_FAIL %', j -> 'rows' -> 3; end if;
  select count(*) into n from public.employees where employee_number like 'I-%'; if n <> 0 then raise exception 'DRY_INSERTED %', n; end if;

  -- ③ الاستيراد الفعلي: الصحيح يُدخل (بقسم/فرع/شفت محلولين + ملف راتب pending)، والخاطئ يُرفض دون إيقاف الباقي
  select public.hr_employees_import(jsonb_build_array(
    jsonb_build_object('employee_number', 'I-1', 'full_name', 'موظف أول', 'department', 'النظافة', 'branch', 'RSF-T', 'shift', 'صباحي', 'biometric_pin', '9001', 'contract_type', 'daily'),
    jsonb_build_object('employee_number', 'I-2', 'full_name', 'موظف ثانٍ', 'department', 'قسم غير موجود')
  ), false) into j;
  if (j ->> 'ok')::int <> 1 or (j ->> 'failed')::int <> 1 then raise exception 'IMPORT_COUNTS_FAIL %', j; end if;
  select * into r from public.employees where employee_number = 'I-1';
  if r.department_id <> sub or r.branch_id <> br or r.contract_type <> 'daily' or r.biometric_pin <> '9001' then raise exception 'IMPORT_RESOLVE_FAIL'; end if;
  if not exists (select 1 from public.employee_shift_assignments where employee_id = r.id) then raise exception 'IMPORT_SHIFT_FAIL'; end if;
  if public.hr_salary_status(r.id) <> 'pending' then raise exception 'IMPORT_SALARY_FAIL'; end if;
  -- إعادة استيراد نفس الرقم → HR_NUMBER_TAKEN
  select public.hr_employees_import(jsonb_build_array(jsonb_build_object('employee_number', 'I-1', 'full_name', 'x')), false) into j;
  if not (j -> 'rows' -> 0 -> 'errors') ? 'HR_NUMBER_TAKEN' then raise exception 'REIMPORT_FAIL %', j; end if;

  -- ④ تعطيل قسم فيه موظف نشط مرفوض، وبعد نقله يُقبل؛ والنظرة العامة تحسب الموظفين
  select employees_active into n from public.hr_departments_overview() where id = sub; if n <> 1 then raise exception 'OVERVIEW_COUNT_FAIL %', n; end if;
  begin perform public.hr_department_save(sub, 'النظافة', 'SRV-T1', dep, false); raise exception 'DEACT_WITH_EMP_ALLOWED';
  exception when others then if sqlerrm not like '%HR_DEPT_HAS_EMPLOYEES%' then raise; end if; end;
  begin perform public.hr_department_save(dep, 'الخدمات', 'SRV-T', null, false); raise exception 'DEACT_WITH_CHILD_ALLOWED';
  exception when others then if sqlerrm not like '%HR_DEPT_HAS_CHILDREN%' then raise; end if; end;
  perform public.hr_employee_update(r.id, jsonb_build_object('department_id', dep));
  perform public.hr_department_save(sub, 'النظافة', 'SRV-T1', dep, false);
  if (select is_active from public.departments where id = sub) then raise exception 'DEACT_FAIL'; end if;

  -- ⑤ المالية لا تستورد ولا تدير الأقسام
  perform set_config('request.jwt.claim.sub', fin::text, false);
  begin perform public.hr_employees_import('[]'::jsonb, true); raise exception 'FIN_IMPORT_ALLOWED';
  exception when others then if sqlerrm not like '%HR_FORBIDDEN%' then raise; end if; end;
  begin perform public.hr_department_save(null, 'x', 'FIN-T', null); raise exception 'FIN_DEPT_ALLOWED';
  exception when others then if sqlerrm not like '%HR_FORBIDDEN%' then raise; end if; end;
  select count(*) into n from public.hr_departments_overview(); if n <> 0 then raise exception 'FIN_OVERVIEW_LEAK %', n; end if;

  perform set_config('role', 'postgres', false);
  raise notice 'hr_import_departments: OK';
end $$;
