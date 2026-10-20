-- 00191 · السلف: طلب من غرفة العمليات → سلسلة موافقات (افتراضية: معاون ثم مدير مفوض) → تسليم المالية من القاصة → قسط تلقائي في كشف الرواتب → تسجيل القسط عند الاعتماد (بادئة ad)
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
-- 00247: التصدير يتبعه اعتماد معاون المدير المفوض (إلزامي قبل المالية) — هذا الاختبار لا يختبر المراجعة نفسها (انظر deputy-deduction-review-test) فيعتمد تلقائياً
create or replace function public.ops_month_export_reviewed(p_month date) returns uuid language plpgsql security definer set search_path = public, app as $$
declare x uuid; u text := current_setting('auth.user_id', true); begin
  x := public.ops_month_export(p_month);
  perform set_config('auth.user_id', 'ad000000-0000-0000-0000-000000000003', true); perform public.deputy_payroll_approve(x); perform set_config('auth.user_id', coalesce(u, ''), true);
  return x;
end $$;
-- 00201: هذا الاختبار يفترض النموذج القديم (الراتب كاملاً ناقص الغياب ÷ 30)؛ النموذج الافتراضي الجديد «الأيام المستحقة» يُختبر في payroll-earned-days-test
update public.hr_policy set settings = settings || '{"salary_model":"full_minus_absence","salary_day_basis":"fixed_30"}'::jsonb where id = 1;
-- 00193: هذا الاختبار يختبر التصدير مباشرة؛ بوابة «اعتماد الحضورية قبل التصدير» تُختبر في ops-attendance-two-stage-test
update public.hr_policy set settings = settings || '{"require_attendance_confirmation": false}'::jsonb where id = 1;
insert into auth.users (id, email) values
  ('ad000000-0000-0000-0000-000000000001', 'ad-ops@t.iq'), ('ad000000-0000-0000-0000-000000000003', 'ad-dep@t.iq'),
  ('ad000000-0000-0000-0000-000000000004', 'ad-adm@t.iq'), ('ad000000-0000-0000-0000-000000000007', 'ad-fin@t.iq'), ('ad000000-0000-0000-0000-000000000008', 'ad-it@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('ad000000-0000-0000-0000-000000000001', 'ops_room'), ('ad000000-0000-0000-0000-000000000003', 'deputy_director'),
  ('ad000000-0000-0000-0000-000000000004', 'super_admin'), ('ad000000-0000-0000-0000-000000000007', 'finance_officer'), ('ad000000-0000-0000-0000-000000000008', 'it_admin')
on conflict do nothing;
insert into public.employees (id, user_id, full_name, employee_number, hire_date) values
  ('ad000000-0000-0000-0000-0000000000e1', 'ad000000-0000-0000-0000-000000000001', 'ad عمليات', 'AD-OPS', '2024-01-01'),
  ('ad000000-0000-0000-0000-0000000000e9', null, 'ad موظف مقترض', 'AD-9', '2024-01-01')
on conflict (id) do nothing;

-- ═══ T0 · الأنواع والسياسة (التطوير المركزية) ═══
select auth.set_test_user('ad000000-0000-0000-0000-000000000008');
do $$ declare j jsonb; begin
  j := public.advance_types_list(true);
  assert jsonb_array_length(j) >= 4 and exists (select 1 from jsonb_array_elements(j) x where x ->> 'name' = 'سلفة زواج'), 'T0 seed: ' || j::text;
  j := public.advance_type_save(null, 'سلفة اختبار', 500000, 5, true, 99);
  perform set_config('test.ad_type', j ->> 'id', false);
  j := public.advance_policy();
  assert (j ->> 'max_installment_ratio')::numeric = 0.5 and (j ->> 'block_if_open')::boolean, 'T0 policy: ' || j::text;
  raise notice 'T0 ✅ الأنواع والسياسة';
end $$;

-- ═══ T1 · راتب الموظف 600,000 → سقف القسط 300,000؛ غرفة العمليات تطلب ═══
select auth.set_test_user('ad000000-0000-0000-0000-000000000007');
select public.finance_salary_set('ad000000-0000-0000-0000-0000000000e9', 'monthly', 600000, 0, '{}', '{}', null);
do $$ declare e record; begin
  for e in select id from public.employees where archived_at is null and id not in (select employee_id from public.employee_salary_profiles where status = 'defined') loop
    perform public.finance_salary_set(e.id, 'monthly', 500000, 0, '{}', '{}', null);
  end loop;
end $$;
-- 00304 · سداد/تغيّر السلفة بين التصدير واعتماد المالية ⇒ الكشف قديم ولا يُعتمد حتى يُعاد التصدير
select auth.set_test_user('ad000000-0000-0000-0000-000000000001');
do $$ declare j jsonb; begin
  j := public.advance_request_create('ad000000-0000-0000-0000-0000000000e9', current_setting('test.ad_type')::uuid, 240000, 'equal', 3, null, null, 'ظرف');
  perform set_config('test.ad1', j ->> 'id', false);
end $$;
select auth.set_test_user('ad000000-0000-0000-0000-000000000003'); select public.advance_decide(current_setting('test.ad1')::uuid, true, null, null, null);
select auth.set_test_user('ad000000-0000-0000-0000-000000000004'); select public.approval_decide_request('advance', current_setting('test.ad1')::uuid, true, null);
select auth.set_test_user('ad000000-0000-0000-0000-000000000007'); select public.advance_deliver(current_setting('test.ad1')::uuid, null);
reset role; select set_config('auth.user_id','', false);
update public.advances set start_month = (date_trunc('month', current_date) - interval '1 month')::date where id = current_setting('test.ad1')::uuid;
select auth.set_test_user('ad000000-0000-0000-0000-000000000001');
do $$ declare m date := (date_trunc('month', current_date) - interval '1 month')::date; e uuid := 'ad000000-0000-0000-0000-0000000000e9'; x uuid; r record; j jsonb; st jsonb; msg text; net0 numeric; begin
  x := public.ops_month_export_reviewed(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_id = e;
  if r.advance_installment <> 80000 then raise exception 'FAIL M1 installment %', r.advance_installment; end if;
  net0 := r.final_net;
  -- لا تغيير ⇒ لا تعارض
  if app.advance_export_mismatch(x) <> 0 then raise exception 'FAIL M2 false positive'; end if;
  st := app.hr_month_export_status(m);
  if (st ->> 'needs_reexport')::boolean or (st ->> 'advance_changes')::int <> 0 then raise exception 'FAIL M3 %', st; end if;
  -- سداد نقدي كامل بعد التصدير
  perform set_config('auth.user_id','ad000000-0000-0000-0000-000000000007',false);
  j := public.advance_settle_cash(current_setting('test.ad1')::uuid, 240000, 'سدد كامل نقداً');
  if j ->> 'status' <> 'settled' then raise exception 'FAIL M4 %', j ->> 'status'; end if;
  st := app.hr_month_export_status(m);
  if not (st ->> 'needs_reexport')::boolean or (st ->> 'advance_changes')::int <> 1 then raise exception 'FAIL M5 %', st; end if;
  -- الاعتماد مرفوض حتى بالقوة
  begin perform public.finance_payroll_approve(x, true); msg := 'NO'; exception when others then msg := sqlerrm; end;
  if msg <> 'HR_ADVANCE_STALE' then raise exception 'FAIL M6 %', msg; end if;
  if app.hr_month_locked(m) then raise exception 'FAIL M7 locked'; end if;
  -- إعادة التصدير ⇒ لا قسط، الصافي يرتفع 80,000، والاعتماد يمر
  perform set_config('auth.user_id','ad000000-0000-0000-0000-000000000001',false);
  x := public.ops_month_export_reviewed(m);
  select * into r from public.hr_month_export_rows where export_id = x and employee_id = e;
  if r.advance_installment <> 0 or r.final_net <> net0 + 80000 then raise exception 'FAIL M8 inst % net % (was %)', r.advance_installment, r.final_net, net0; end if;
  if app.advance_export_mismatch(x) <> 0 then raise exception 'FAIL M9'; end if;
  perform set_config('auth.user_id','ad000000-0000-0000-0000-000000000007',false);
  perform public.finance_payroll_approve(x);
  if not app.hr_month_locked(m) then raise exception 'FAIL M10 not locked'; end if;
  if exists (select 1 from public.advance_installments where advance_id = current_setting('test.ad1')::uuid and source = 'payroll') then raise exception 'FAIL M11 payroll installment posted on settled advance'; end if;
  raise notice 'test ok: advance-export-mismatch (00304)';
end $$;
-- الاتجاه الآخر: سلفة جديدة سُلِّمت وبدأت بعد التصدير ⇒ تعارض أيضاً (نقص استقطاع)
select auth.set_test_user('ad000000-0000-0000-0000-000000000001');
do $$ declare m date := date_trunc('month', current_date)::date; e uuid := 'ad000000-0000-0000-0000-0000000000e9'; x uuid; j jsonb; st jsonb; begin
  x := public.ops_month_export_reviewed(m);
  if app.advance_export_mismatch(x) <> 0 then raise exception 'FAIL N1'; end if;
  j := public.advance_request_create(e, current_setting('test.ad_type')::uuid, 90000, 'single', null, null, null, 'ثانية');
  perform set_config('auth.user_id','ad000000-0000-0000-0000-000000000003',false); perform public.advance_decide((j ->> 'id')::uuid, true, null, null, null);
  perform set_config('auth.user_id','ad000000-0000-0000-0000-000000000004',false); perform public.approval_decide_request('advance', (j ->> 'id')::uuid, true, null);
  perform set_config('auth.user_id','ad000000-0000-0000-0000-000000000007',false); perform public.advance_deliver((j ->> 'id')::uuid, null);
  perform set_config('auth.user_id','',false);
  update public.advances set start_month = m where id = (j ->> 'id')::uuid;
  if app.advance_export_mismatch(x) <> 1 then raise exception 'FAIL N2 %', app.advance_export_mismatch(x); end if;
  st := app.hr_month_export_status(m);
  if not (st ->> 'needs_reexport')::boolean then raise exception 'FAIL N3 %', st; end if;
  raise notice 'test ok: advance-export-mismatch reverse (00304)';
end $$;
