-- 00389-أ: وثائق الموظفين — تواريخ الانتهاء، القائمة، الملخص، التنبيه اليومي (مرة واحدة لكل وثيقة/مرحلة)، سياسة المدة
set client_min_messages = notice;
insert into auth.users (id, email) values ('d0c00000-0000-0000-0000-0000000000a1', 'hr-doc@t.iq'), ('d0c00000-0000-0000-0000-0000000000a2', 'emp-doc@t.iq'), ('d0c00000-0000-0000-0000-0000000000a3', 'it-doc@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('d0c00000-0000-0000-0000-0000000000a1', 'hr_officer'), ('d0c00000-0000-0000-0000-0000000000a2', 'employee'), ('d0c00000-0000-0000-0000-0000000000a3', 'it_admin') on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date) values
  ('d0c00000-0000-0000-0000-0000000000e1', 'd0c00000-0000-0000-0000-0000000000a2', 'T-DOC-1', 'موظف الوثائق', '2024-01-01'),
  ('d0c00000-0000-0000-0000-0000000000e2', null, 'T-DOC-2', 'موظف غير فعّال', '2024-01-01') on conflict (employee_number) do nothing;
update public.employees set employment_status = 'terminated' where id = 'd0c00000-0000-0000-0000-0000000000e2';
insert into public.employee_documents (id, employee_id, doc_type, title, storage_path, expires_on) values
  ('d0c00000-0000-0000-0000-0000000000d1', 'd0c00000-0000-0000-0000-0000000000e1', 'driving_license', null, 'doc-test/dl', current_date + 10),
  ('d0c00000-0000-0000-0000-0000000000d2', 'd0c00000-0000-0000-0000-0000000000e1', 'passport', 'جواز', 'doc-test/pp', current_date - 3),
  ('d0c00000-0000-0000-0000-0000000000d3', 'd0c00000-0000-0000-0000-0000000000e1', 'health_cert', null, 'doc-test/hc', current_date + 80),
  ('d0c00000-0000-0000-0000-0000000000d4', 'd0c00000-0000-0000-0000-0000000000e1', 'photo', null, 'doc-test/ph', null),
  ('d0c00000-0000-0000-0000-0000000000d5', 'd0c00000-0000-0000-0000-0000000000e2', 'contract', null, 'doc-test/ct', current_date + 1);

do $$ declare n int; j jsonb; begin
  -- قيد التواريخ
  begin
    insert into public.employee_documents (employee_id, doc_type, storage_path, issued_on, expires_on) values ('d0c00000-0000-0000-0000-0000000000e1', 'other', 'doc-test/bad', current_date, current_date - 1);
    raise exception 'TEST_FAIL: expires before issued accepted';
  exception when check_violation then null; end;
  -- نوع غير معروف مرفوض
  begin
    insert into public.employee_documents (employee_id, doc_type, storage_path) values ('d0c00000-0000-0000-0000-0000000000e1', 'weird', 'doc-test/weird');
    raise exception 'TEST_FAIL: unknown doc_type accepted';
  exception when check_violation then null; end;

  perform set_config('auth.user_id', 'd0c00000-0000-0000-0000-0000000000a1', true);
  -- القائمة الافتراضية (30 يومًا): منتهية + قريبة فقط، غير الفعّال مستبعد، بلا تاريخ مستبعد
  select count(*) into n from public.hr_documents_expiring() where employee_id = 'd0c00000-0000-0000-0000-0000000000e1';
  assert n = 2, format('expiring default = %s', n);
  assert (select status from public.hr_documents_expiring() where id = 'd0c00000-0000-0000-0000-0000000000d2') = 'expired';
  assert (select status from public.hr_documents_expiring() where id = 'd0c00000-0000-0000-0000-0000000000d1') = 'soon';
  assert (select days_left from public.hr_documents_expiring() where id = 'd0c00000-0000-0000-0000-0000000000d1') = 10;
  assert not exists (select 1 from public.hr_documents_expiring(365) where employee_id = 'd0c00000-0000-0000-0000-0000000000e2'), 'inactive employee listed';
  -- نافذة 90 يومًا تُظهر الشهادة الصحية
  assert exists (select 1 from public.hr_documents_expiring(90) where id = 'd0c00000-0000-0000-0000-0000000000d3');
  -- بحث
  assert (select count(*) from public.hr_documents_expiring(365, null, 'T-DOC-1')) = 3;
  -- الملخص
  select public.hr_documents_expiry_summary() into j;
  assert (j ->> 'alert_days')::int = 30, j::text;
  assert (j ->> 'expired')::int >= 1 and (j ->> 'soon')::int >= 1 and (j ->> 'd90')::int >= 2, j::text;

  -- تعديل التواريخ
  perform public.hr_document_set_dates('d0c00000-0000-0000-0000-0000000000d4', current_date - 100, current_date + 5);
  assert (select expires_on from public.employee_documents where id = 'd0c00000-0000-0000-0000-0000000000d4') = current_date + 5;
  begin
    perform public.hr_document_set_dates('d0c00000-0000-0000-0000-0000000000d4', current_date, current_date - 1);
    raise exception 'TEST_FAIL: invalid dates accepted';
  exception when others then if sqlerrm not like '%HR_DOC_DATES_INVALID%' then raise; end if; end;

  -- التنبيه: 3 وثائق ضمن النافذة (d1, d2, d4) ⇒ إشعار واحد لكل وثيقة لمستخدم HR، وإعادة التشغيل لا تكرّر
  delete from public.notifications where dedupe_key like 'emp_doc_expiry:%';
  select app.hr_documents_expiry_notify() into n;
  select count(*) into n from public.notifications where user_id = 'd0c00000-0000-0000-0000-0000000000a1' and dedupe_key like 'emp_doc_expiry:%';
  assert n = 3, format('notifications = %s', n);
  assert exists (select 1 from public.notifications where dedupe_key = 'emp_doc_expiry:d0c00000-0000-0000-0000-0000000000d2:expired' and type = 'error' and link = '/hr/documents');
  assert exists (select 1 from public.notifications where dedupe_key = 'emp_doc_expiry:d0c00000-0000-0000-0000-0000000000d1:soon' and body like '%إجازة السوق%');
  perform public.hr_documents_expiry_run_now();
  select count(*) into n from public.notifications where user_id = 'd0c00000-0000-0000-0000-0000000000a1' and dedupe_key like 'emp_doc_expiry:%';
  assert n = 3, format('after rerun = %s', n);
  -- الموظف لا يُنبَّه ولا يرى القائمة
  assert not exists (select 1 from public.notifications where user_id = 'd0c00000-0000-0000-0000-0000000000a2' and dedupe_key like 'emp_doc_expiry:%');
  perform set_config('auth.user_id', 'd0c00000-0000-0000-0000-0000000000a2', true);
  assert (select count(*) from public.hr_documents_expiring(365)) = 0, 'employee can list';
  begin
    perform public.hr_document_set_dates('d0c00000-0000-0000-0000-0000000000d1', null, current_date);
    raise exception 'TEST_FAIL: employee edited dates';
  exception when others then if sqlerrm not like '%HR_FORBIDDEN%' then raise; end if; end;

  -- السياسة: IT يغيّر المدة إلى 60 ⇒ الشهادة الصحية (80 يومًا) ما زالت خارج النافذة، و 90 تُدخلها؛ قيمة خارج المدى مرفوضة
  perform set_config('auth.user_id', 'd0c00000-0000-0000-0000-0000000000a3', true);
  perform public.hr_policy_set('{"doc_expiry_alert_days": 90}'::jsonb);
  begin
    perform public.hr_policy_set('{"doc_expiry_alert_days": 0}'::jsonb);
    raise exception 'TEST_FAIL: 0 days accepted';
  exception when others then if sqlerrm not like '%HR_POLICY_INVALID%' then raise; end if; end;
  perform set_config('auth.user_id', 'd0c00000-0000-0000-0000-0000000000a1', true);
  assert (select status from public.hr_documents_expiring() where id = 'd0c00000-0000-0000-0000-0000000000d3') = 'soon';
  assert (select (public.hr_documents_expiry_summary() ->> 'alert_days')::int) = 90;
  perform set_config('auth.user_id', 'd0c00000-0000-0000-0000-0000000000a3', true);
  perform public.hr_policy_set('{"doc_expiry_alert_days": 30}'::jsonb);
  perform set_config('auth.user_id', '', true);
  raise notice 'hr-document-expiry-test: OK';
end $$;
