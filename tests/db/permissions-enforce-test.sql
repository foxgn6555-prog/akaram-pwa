-- اختبار 00296 (00350-B): إنفاذ الصلاحيات في دوال الكتابة المحمية — الربط صالح، الافتراضي لا يكسر شيئاً، الحجب يرفض قبل أي أثر، super_admin يتجاوز.
set client_min_messages = notice;
create or replace function pg_temp.err_of(p_sql text) returns text language plpgsql as $$
declare msg text := null; begin
  begin execute p_sql; exception when others then msg := sqlerrm; end; return msg; end $$;

insert into auth.users (id, email) values
  ('9e000000-0000-0000-0000-000000000001', 'pe-hr@t.iq'), ('9e000000-0000-0000-0000-000000000002', 'pe-it@t.iq'),
  ('9e000000-0000-0000-0000-000000000003', 'pe-sa@t.iq'), ('9e000000-0000-0000-0000-000000000004', 'pe-fin@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('9e000000-0000-0000-0000-000000000001', 'hr_officer'), ('9e000000-0000-0000-0000-000000000002', 'it_admin'),
  ('9e000000-0000-0000-0000-000000000003', 'super_admin'), ('9e000000-0000-0000-0000-000000000004', 'finance_officer') on conflict do nothing;

-- ① الربط: صالح، يغطي معظم الدوال، ولا يشير إلى دالة غير محمية
do $$ declare n int; bad text; begin
  select count(*) into n from public.permission_write_bindings; assert n >= 40, 'bindings ' || n;
  select string_agg(b.fn, ', ') into bad from public.permission_write_bindings b where not (b.fn = any(app.guarded_write_functions()));
  assert bad is null, 'bindings to unguarded fns: ' || coalesce(bad, '');
  select string_agg(b.fn, ', ') into bad from public.permission_write_bindings b join public.permission_units u on u.key = b.unit_key where not (b.action = any(u.actions));
  assert bad is null, 'invalid actions: ' || coalesce(bad, '');
  select count(*) into n from app.permission_binding_audit() where unit_key is not null; assert n >= 40, 'audit bound ' || n;
  -- الإجراءات الجديدة من الجولة B وصلت إلى الكتالوج (upsert)
  assert (select actions from public.permission_units where key = 'hr.employees') @> '{create}', 'hr.employees gained create';
  assert (select actions from public.permission_units where key = 'finance.payroll') @> '{execute}', 'finance.payroll gained execute';
  raise notice 'PE1 ✅ الربط';
end $$;

-- ② الافتراضي: صاحب الدور يمرّ من حارس الصلاحية (قد يفشل لاحقاً لأسباب أخرى — لكن ليس PERMISSION_DENIED)؛ دور آخر يُرفض مبكراً
do $$ declare hr uuid := '9e000000-0000-0000-0000-000000000001'; fin uuid := '9e000000-0000-0000-0000-000000000004'; e text; begin
  perform auth.set_test_user(hr);
  e := pg_temp.err_of($q$select public.hr_employee_terminate('00000000-0000-0000-0000-000000000000'::uuid, 'resignation', current_date, 'سبب')$q$);
  assert e is null or e not like '%PERMISSION_DENIED%', 'hr passes guard: ' || coalesce(e, 'ok');
  perform auth.set_test_user(fin);
  e := pg_temp.err_of($q$select public.hr_employee_terminate('00000000-0000-0000-0000-000000000000'::uuid, 'resignation', current_date, 'سبب')$q$);
  assert e like '%PERMISSION_DENIED%', 'finance denied: ' || coalesce(e, 'ok');
  -- لا بصمة تكرار لطلب مرفوض
  assert not exists (select 1 from app.recent_writes where user_id = fin and fn = 'hr_employee_terminate'), 'no dedup fingerprint when denied';
  -- دالة معفاة (سلسلة موافقات): لا PERMISSION_DENIED لأي دور
  e := pg_temp.err_of($q$select public.approval_decide_request('hire', '00000000-0000-0000-0000-000000000000'::uuid, true, null)$q$);
  assert e is null or e not like '%PERMISSION_DENIED%', 'exempt fn untouched: ' || coalesce(e, 'ok');
  raise notice 'PE2 ✅ الافتراضي والرفض المبكر';
end $$;

-- ③ الحجب بالقالب/الاستثناء يصل إلى الخادم — وإزالته يعيد النفاذ — وsuper_admin يتجاوز
do $$ declare hr uuid := '9e000000-0000-0000-0000-000000000001'; it uuid := '9e000000-0000-0000-0000-000000000002'; sa uuid := '9e000000-0000-0000-0000-000000000003'; e text; tpl uuid; begin
  perform auth.set_test_user(it);
  perform public.it_user_permission_override_set(hr, 'hr.recruitment', 'execute', 'deny', 'لا ينهي خدمات');
  perform auth.set_test_user(hr);
  e := pg_temp.err_of($q$select public.hr_employee_terminate('00000000-0000-0000-0000-000000000000'::uuid, 'resignation', current_date, 'سبب')$q$);
  assert e like '%PERMISSION_DENIED%', 'override deny reaches server: ' || coalesce(e, 'ok');
  perform auth.set_test_user(it);
  perform public.it_user_permission_override_set(hr, 'hr.recruitment', 'execute', null);
  tpl := public.it_permission_template_save(jsonb_build_object('name', 'موارد — بلا إنهاء خدمات'));
  perform public.it_permission_template_rules_set(tpl, '[{"unit_key":"hr.recruitment","action":"execute","effect":"deny"}]'::jsonb);
  perform public.it_user_permission_template_set(hr, tpl);
  perform auth.set_test_user(hr);
  e := pg_temp.err_of($q$select public.hr_employee_terminate('00000000-0000-0000-0000-000000000000'::uuid, 'resignation', current_date, 'سبب')$q$);
  assert e like '%PERMISSION_DENIED%', 'template deny reaches server: ' || coalesce(e, 'ok');
  perform auth.set_test_user(it);
  perform public.it_user_permission_template_set(hr, null);
  perform auth.set_test_user(hr);
  e := pg_temp.err_of($q$select public.hr_employee_terminate('00000000-0000-0000-0000-000000000000'::uuid, 'resignation', current_date, 'سبب')$q$);
  assert e is null or e not like '%PERMISSION_DENIED%', 'access restored: ' || coalesce(e, 'ok');
  perform auth.set_test_user(sa);
  e := pg_temp.err_of($q$select public.finance_payroll_reconcile(date_trunc('month', current_date)::date)$q$);
  assert e is null or e not like '%PERMISSION_DENIED%', 'super_admin bypass: ' || coalesce(e, 'ok');
  raise notice 'PE3 ✅ الحجب يصل إلى الخادم';
end $$;
