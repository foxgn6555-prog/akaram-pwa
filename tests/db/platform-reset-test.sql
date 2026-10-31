-- 00398-أ · «التصفير»: الكتالوج يغطي كل الجداول، كلمتا السر، السلسلة تمنع الحذف قبل اكتمالها، الاعتماد من التفاصيل فقط، صون المنفِّذ والمدير المفوض. (بادئة 98)
set client_min_messages = warning;
reset role; select set_config('auth.user_id','', false);
insert into auth.users (id, email) values
  ('98000000-0000-0000-0000-0000000000a1', 'pr-it@t.iq'), ('98000000-0000-0000-0000-0000000000a2', 'pr-sa@t.iq'), ('98000000-0000-0000-0000-0000000000a3', 'pr-dep@t.iq'),
  ('98000000-0000-0000-0000-0000000000a4', 'pr-ops@t.iq'), ('98000000-0000-0000-0000-0000000000a5', 'pr-hr@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('98000000-0000-0000-0000-0000000000a1', 'it_admin'), ('98000000-0000-0000-0000-0000000000a2', 'super_admin'), ('98000000-0000-0000-0000-0000000000a3', 'deputy_director'),
  ('98000000-0000-0000-0000-0000000000a4', 'ops_room'), ('98000000-0000-0000-0000-0000000000a5', 'hr_officer')
on conflict do nothing;
insert into public.departments (id, code, name, parent_id) values ('98000000-0000-0000-0000-0000000000d1', 'D98A', 'قسم 98', null) on conflict (id) do nothing;
insert into public.branches (id, name, code) values ('98000000-0000-0000-0000-0000000000b1', 'فرع 98', 'BR98') on conflict (id) do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, biometric_pin, department_id, branch_id) values
  ('98000000-0000-0000-0000-0000000000e1', '98000000-0000-0000-0000-0000000000a4', 'PR-1', 'موظف 98', '2024-01-01', '9801', '98000000-0000-0000-0000-0000000000d1', '98000000-0000-0000-0000-0000000000b1'),
  ('98000000-0000-0000-0000-0000000000e2', null, 'PR-2', 'موظف 98 ب', '2024-01-01', '9802', '98000000-0000-0000-0000-0000000000d1', null)
on conflict (employee_number) do nothing;
update public.departments set manager_id = '98000000-0000-0000-0000-0000000000e1' where id = '98000000-0000-0000-0000-0000000000d1';
insert into public.ops_store_items (id, name, unit, qty_on_hand) values ('98000000-0000-0000-0000-0000000000f1', 'صنف 98', 'قطعة', 5), ('98000000-0000-0000-0000-0000000000f2', 'صنف 98 ب', 'قطعة', 1);
insert into public.it_tickets (created_by, title) values ('98000000-0000-0000-0000-0000000000e1', 'تذكرة 98');
insert into public.app_errors (message) values ('خطأ 98') on conflict do nothing;
update public.gps_warehouse_link set last_ping_at=now(),last_ping_ok=true,ping='{"reset_rows":9,"reset_files":2,"reset_settings_rows":1}'::jsonb where id=1;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

do $$
declare it1 uuid := '98000000-0000-0000-0000-0000000000a1'; sa uuid := '98000000-0000-0000-0000-0000000000a2'; dep uuid := '98000000-0000-0000-0000-0000000000a3';
        ops uuid := '98000000-0000-0000-0000-0000000000a4'; j jsonb; n int; m int; v_id uuid; r record; missing text; dup text; ghost text; emp_before int; store_before int;
begin
  -- R1: كل جدول عام ينتمي لفئة واحدة بالضبط (أو لقائمة «لا يُصفَّر»)، وكل جدول في الكتالوج موجود فعلاً
  select string_agg(c.relname, '، ') into missing from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind = 'r' and c.relname not like 'zz\_%'
      and app.platform_reset_category_of(c.relname) is null and not (c.relname = any(app.platform_reset_never_tables()));
  assert missing is null, 'R1 جداول غير مصنَّفة: ' || missing;
  select string_agg(t, '، ') into dup from (select t from app.platform_reset_catalog() c, unnest(c.tables) t group by t having count(*) > 1) x;
  assert dup is null, 'R1b جداول مكررة: ' || dup;
  select string_agg(t, '، ') into ghost from app.platform_reset_catalog() c, unnest(c.tables) t
    where not exists (select 1 from pg_class k join pg_namespace ns on ns.oid = k.relnamespace where ns.nspname = 'public' and k.relname = t and k.relkind = 'r');
  assert ghost is null, 'R1c جداول غير موجودة في الكتالوج: ' || ghost;
  select count(*) into n from app.platform_reset_catalog(); assert n = 27, 'R1d فئات: ' || n;

  -- R2: الصلاحية وكلمة السر
  perform pg_temp.as_user(ops);
  perform pg_temp.expect_error('select public.platform_reset_counts()', 'IT_FORBIDDEN');
  perform pg_temp.expect_error($q$select public.platform_reset_request(array['warehouse'], 'تصفير')$q$, 'PERMISSION_DENIED');   -- 00345: مربوطة بوحدة it.platform-reset
  perform pg_temp.as_user(it1);
  perform pg_temp.expect_error($q$select public.platform_reset_request(array['warehouse'], 'خطأ')$q$, 'RESET_PASSWORD_WRONG');
  perform pg_temp.expect_error($q$select public.platform_reset_request('{}'::text[], 'تصفير')$q$, 'RESET_NOTHING_SELECTED');
  perform pg_temp.expect_error($q$select public.platform_reset_request(array['x'], 'تصفير')$q$, 'RESET_CATEGORY_INVALID');
  j := public.platform_reset_counts();
  assert jsonb_array_length(j -> 'categories') = 27, 'R2 counts';
  select (c ->> 'rows')::int into n from jsonb_array_elements(j -> 'categories') c where c ->> 'key' = 'warehouse';
  assert n >= 2, 'R2b warehouse rows: ' || n;
  select (c ->> 'protected_users')::int into n from jsonb_array_elements(j -> 'categories') c where c ->> 'key' = 'accounts';
  assert n >= 2, 'R2c protected: ' || n;

  -- R3: إغلاق الاعتماديات: الموظفون يستلزمون الجداول ذات المفاتيح الإلزامية إليهم (تذاكر الدعم ضمن «letters»)
  j := public.platform_reset_closure(array['employees']);
  assert (j -> 'categories') ? 'letters', 'R3 closure: ' || j::text;
  assert (j -> 'added') ? 'letters', 'R3b added';
  j := public.platform_reset_closure(array['warehouse']);
  assert jsonb_array_length(j -> 'added') = 0, 'R3c warehouse standalone: ' || j::text;
  -- الحسابات تستلزم كل جدول يشير إلى المستخدم بعمود إلزامي
  j := public.platform_reset_closure(array['accounts']);
  assert jsonb_array_length(j -> 'categories') > 1, 'R3d accounts closure: ' || j::text;

  -- R4: بلا سلسلة ⇒ تنفيذ فوري؛ الفئات غير المختارة لا تُمَس
  select count(*) into emp_before from public.employees;
  j := public.platform_reset_request(array['warehouse'], 'تصفير');
  assert j ->> 'status' = 'done' and (j ->> 'via_chain')::boolean = false, 'R4: ' || j::text;
  select count(*) into n from public.ops_store_items; assert n = 0, 'R4b store emptied';
  select count(*) into n from public.employees; assert n = emp_before, 'R4c employees untouched';
  assert (j -> 'result' ->> 'rows_deleted')::int >= 2, 'R4d rows_deleted';
  select count(*) into n from public.audit_logs where table_name = 'platform_reset_requests' and record_id = j ->> 'id'; assert n = 1, 'R4e audit';
  select count(*) into n from public.notifications where dedupe_key = 'platform_reset_done:' || (j ->> 'id') and user_id in (it1, sa); assert n = 2, 'R4f notify IT+SA: ' || n;
  j := public.platform_reset_list();
  assert jsonb_array_length(j) >= 1 and (j -> 0 ->> 'status') = 'done', 'R4g list';

  -- R5: مع سلسلة ⇒ لا حذف قبل اكتمال الموافقات؛ الاعتماد المباشر من المهمة مرفوض؛ الاعتماد بكلمة السر من التفاصيل فقط
  perform public.approval_chain_save('it_admin', 'platform_reset', '[{"kind":"hierarchy","role":"deputy_director"}]'::jsonb, true);
  perform pg_temp.expect_error($q$select public.approval_chain_save('ops_room', 'platform_reset', '[{"kind":"hierarchy","role":"deputy_director"}]'::jsonb, true)$q$, 'APPROVAL_ROLE_INVALID');
  insert into public.ops_store_items (id, name, unit, qty_on_hand) values ('98000000-0000-0000-0000-0000000000f3', 'صنف 98 ج', 'قطعة', 2);
  j := public.platform_reset_request(array['warehouse'], 'تصفير');
  v_id := (j ->> 'id')::uuid;
  assert j ->> 'status' = 'pending_approval' and (j ->> 'via_chain')::boolean = true, 'R5: ' || j::text;
  select count(*) into n from public.ops_store_items; assert n = 1, 'R5b nothing deleted while pending';
  perform pg_temp.expect_error($q$select public.platform_reset_request(array['letters'], 'تصفير')$q$, 'RESET_ALREADY_PENDING');
  -- المعاون يرى المهمة بعلامة «تفاصيل فقط»
  perform pg_temp.as_user(dep);
  select count(*) into n from public.approval_my_tasks() t where t.request_kind = 'platform_reset' and t.request_id = v_id and (t.details ->> 'detail_only')::boolean; assert n = 1, 'R5c my_tasks';
  perform pg_temp.expect_error(format($q$select public.approval_decide_request('platform_reset', %L, true, null)$q$, v_id), 'RESET_APPROVE_PASSWORD_REQUIRED');
  perform pg_temp.expect_error(format($q$select public.platform_reset_approve(%L, 'تصفير')$q$, v_id), 'RESET_APPROVE_PASSWORD_WRONG');
  select count(*) into n from public.ops_store_items; assert n = 1, 'R5d still nothing deleted';
  j := public.platform_reset_detail(v_id);
  assert (j ->> 'can_approve')::boolean and jsonb_array_length(j -> 'categories') = 1 and (j -> 'categories' -> 0 ->> 'key') = 'warehouse' and (j -> 'categories' -> 0 ->> 'rows')::int = 1, 'R5e detail: ' || j::text;
  -- غير المعني لا يرى التفاصيل
  perform pg_temp.as_user(ops);
  perform pg_temp.expect_error(format($q$select public.platform_reset_detail(%L)$q$, v_id), 'RESET_FORBIDDEN');
  perform pg_temp.expect_error(format($q$select public.platform_reset_approve(%L, 'اعتماد تصفير')$q$, v_id), 'HR_FORBIDDEN');
  perform pg_temp.as_user(dep);
  j := public.platform_reset_approve(v_id, 'اعتماد تصفير');
  assert j ->> 'status' = 'done' and (j ->> 'final')::boolean, 'R5f approve: ' || j::text;
  select count(*) into n from public.ops_store_items; assert n = 0, 'R5g executed';
  select status into missing from public.platform_reset_requests where id = v_id; assert missing = 'done', 'R5h status';

  -- R6: الرفض مع سبب يُبقي البيانات
  perform pg_temp.as_user(it1);
  insert into public.ops_store_items (id, name, unit, qty_on_hand) values ('98000000-0000-0000-0000-0000000000f4', 'صنف 98 د', 'قطعة', 2);
  j := public.platform_reset_request(array['warehouse'], 'تصفير'); v_id := (j ->> 'id')::uuid;
  perform pg_temp.as_user(dep);
  perform pg_temp.expect_error(format($q$select public.approval_decide_request('platform_reset', %L, false, '')$q$, v_id), 'HR_REASON_REQUIRED');
  perform public.approval_decide_request('platform_reset', v_id, false, 'ليس الآن');
  select status, rejected_note into r from public.platform_reset_requests where id = v_id;
  assert r.status = 'rejected' and r.rejected_note = 'ليس الآن', 'R6: ' || r::text;
  select count(*) into n from public.ops_store_items; assert n = 1, 'R6b data kept';
  select count(*) into n from public.notifications where dedupe_key = 'platform_reset_rej:' || v_id::text and user_id = it1; assert n = 1, 'R6c requester notified';
  -- الإلغاء من الطالب
  perform pg_temp.as_user(it1);
  j := public.platform_reset_request(array['warehouse'], 'تصفير'); v_id := (j ->> 'id')::uuid;
  perform public.platform_reset_cancel(v_id);
  select status into missing from public.platform_reset_requests where id = v_id; assert missing = 'cancelled', 'R6d cancelled';
  select count(*) into n from public.approval_tasks where request_kind = 'platform_reset' and request_id = v_id and status = 'pending'; assert n = 0, 'R6e tasks closed';

  -- بيانات واقعية مترابطة قبل التصفير الكامل: تقرير ↔ إرسال + آلية ↔ جهاز GPS.
  insert into public.complaint_reports(id,report_date,sector,title,created_by) values ('98000000-0000-0000-0000-0000000000c1','2020-01-01','karrada','تقرير حلقي',it1);
  insert into public.complaint_email_deliveries(id,sender,recipients,subject,sent_by,report_id) values ('98000000-0000-0000-0000-0000000000c2','a@a.iq',array['b@b.iq'],'إرسال',it1,'98000000-0000-0000-0000-0000000000c1');
  update public.complaint_reports set delivery_id='98000000-0000-0000-0000-0000000000c2' where id='98000000-0000-0000-0000-0000000000c1';
  insert into public.gps_providers(id,name) values ('98000000-0000-0000-0000-0000000000c3','LVN تجريبي');
  insert into public.gps_devices(id,provider_id,external_id,name) values ('98000000-0000-0000-0000-0000000000c4','98000000-0000-0000-0000-0000000000c3','test-device','جهاز اختبار');
  insert into public.sectors(id,code,name,sort,parent_sector) values (981,'T981','قطاع تجريبي',981,'karrada');
  insert into public.garage_vehicles(id,vehicle_name,db_number,plate_number,chassis_number,image_path,shift,driver_name,sector_id,created_by)
    values ('98000000-0000-0000-0000-0000000000c5','آلية اختبار','T981','T981','CH981','test.jpg','morning','سائق',981,it1);
  insert into public.gps_vehicle_bindings(device_id,garage_vehicle_id,match_method) values ('98000000-0000-0000-0000-0000000000c4','98000000-0000-0000-0000-0000000000c5','manual');

  -- R7: التصفير الكامل (كل الفئات بما فيها الحسابات) عبر السلسلة: يبقى المنفِّذ (المعتمِد) والمدير المفوض فقط؛ كل جداول الكتالوج فارغة؛ بنية الصلاحيات باقية
  select count(*) into m from public.permission_units;
  j := public.platform_reset_request((select array_agg(c.key) from app.platform_reset_catalog() c), 'تصفير'); v_id := (j ->> 'id')::uuid;
  assert j ->> 'status' = 'pending_approval', 'R7 pending: ' || j::text;
  select count(*) into n from auth.users; assert n >= 5, 'R7b users still there while pending';
  perform pg_temp.as_user(dep);
  j := public.platform_reset_approve(v_id, 'اعتماد تصفير');
  assert j ->> 'status' = 'done', 'R7c: ' || j::text;
  -- كل جداول الكتالوج فارغة — عدا ما يُكتب عمداً بعد التصفير: سجل التدقيق، إشعار الإتمام، طابور استرداد المساحة، وأدوار الحسابين المحميين
  select string_agg(t, '، ') into missing from app.platform_reset_catalog() c, unnest(c.tables) t
    where t not in ('audit_logs', 'notifications', 'space_reclaim_log', 'user_roles') and app.platform_reset_table_count(t) > 0;
  assert missing is null, 'R7d جداول لم تفرغ: ' || missing;
  select count(*) into n from public.audit_logs; assert n = 1, 'R7d2 audit only the reset row: ' || n;
  select count(*) into n from public.user_roles; assert n = 2, 'R7d3 roles only protected: ' || n;
  select count(*) into n from public.notifications where dedupe_key not like 'platform_reset_done:%'; assert n = 0, 'R7d4 notifications only the done one: ' || n;
  select count(*) into n from public.space_reclaim_log where reason = 'platform_reset'; assert n > 0, 'R7d5 reclaim queued';
  select count(*) into n from auth.users; assert n = 2, 'R7e users left: ' || n;
  assert exists (select 1 from auth.users where id = dep) and exists (select 1 from auth.users where id = sa), 'R7f executor + super_admin kept';
  assert not exists (select 1 from auth.users where id in (it1, ops)), 'R7g others removed';
  select count(*) into n from public.permission_units; assert n = m, 'R7h permission_units intact';
  select count(*) into n from public.platform_reset_requests; assert n >= 5, 'R7i reset log intact';
  select count(*) into n from public.user_roles where user_id in (dep, sa); assert n = 2, 'R7j protected roles kept';
  -- المحفزات أُعيد تفعيلها كلها
  select string_agg(c.relname || '.' || t.tgname, '، ') into missing from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and not t.tgisinternal and t.tgenabled = 'D';
  assert missing is null, 'R7k محفزات معطلة: ' || missing;
  -- السجل والإشعار بعد التصفير الكامل
  perform pg_temp.as_user(sa);
  select count(*) into n from public.audit_logs where table_name = 'platform_reset_requests' and record_id = v_id::text; assert n = 1, 'R7l audit kept';
  select count(*) into n from public.notifications where dedupe_key = 'platform_reset_done:' || v_id::text; assert n >= 1, 'R7m notify kept';
  j := public.platform_reset_detail(v_id);
  assert (j ->> 'includes_accounts')::boolean and (j -> 'result' ->> 'users_deleted')::int >= 3 and (j -> 'result' ->> 'protected_users')::int = 2, 'R7n result: ' || (j -> 'result')::text;
  assert jsonb_array_length(j -> 'storage_buckets') > 0, 'R7o buckets listed for client-side deletion';
  -- ملفات التخزين: الدالة تعمل والإنهاء يسجّل
  j := public.platform_reset_storage_finish(v_id, 0);
  assert (j ->> 'done')::boolean, 'R7p storage finish: ' || j::text;
  raise warning 'platform-reset-test: OK';
end $$;
