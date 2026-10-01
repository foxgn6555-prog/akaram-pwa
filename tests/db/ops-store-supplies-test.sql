-- اختبار 00162: مخزن غرفة العمليات + طلبات مستلزمات القواطع عبر سلاسل الموافقات. مستقل (بادئة da، مناطق 4 و7).
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('da000000-0000-0000-0000-000000000001', 'it-s@t.iq'),
  ('da000000-0000-0000-0000-000000000002', 'ops-s@t.iq'),       -- غرفة العمليات
  ('da000000-0000-0000-0000-000000000003', 'dm-s@t.iq'),        -- مسؤول قسم (منطقة 4 كرادة)
  ('da000000-0000-0000-0000-000000000004', 'sm-s@t.iq'),        -- مسؤول قاطع الكرادة
  ('da000000-0000-0000-0000-000000000005', 'fo-s@t.iq'),        -- العمليات الميدانية
  ('da000000-0000-0000-0000-000000000006', 'dm2-s@t.iq')        -- مسؤول قسم آخر (منطقة 7 زعفرانية)
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('da000000-0000-0000-0000-000000000001', 'it_admin'), ('da000000-0000-0000-0000-000000000002', 'ops_room'), ('da000000-0000-0000-0000-000000000003', 'department_manager'),
  ('da000000-0000-0000-0000-000000000004', 'admin_ops'), ('da000000-0000-0000-0000-000000000005', 'field_ops'), ('da000000-0000-0000-0000-000000000006', 'department_manager')
on conflict do nothing;
insert into public.manager_profiles (user_id, shift, sectors) values ('da000000-0000-0000-0000-000000000003', 'morning', '{4}'), ('da000000-0000-0000-0000-000000000006', 'evening', '{7}') on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, phone, biometric_pin) values
  ('da000000-0000-0000-0000-0000000000e3', 'da000000-0000-0000-0000-000000000003', 'ST-M1', 'مسؤول قسم 4', '2024-01-01', '0772', 's3')
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

-- ═══ T1 · المخزن: غرفة العمليات فقط تضيف المواد وتُدخل الكميات وتُسوّي بسبب ═══
do $$
declare bags uuid; brooms uuid; r record; bal numeric; n int;
begin
  perform pg_temp.as_user('da000000-0000-0000-0000-000000000003');
  perform pg_temp.expect_error($q$ select public.ops_store_item_save(null, 'أكياس نفايات 50 لتر', 'كيس', 100) $q$, 'OPS_ROOM_FORBIDDEN');
  perform pg_temp.as_user('da000000-0000-0000-0000-000000000002');
  perform pg_temp.expect_error($q$ select public.ops_store_item_save(null, 'x', 'كيس', 0) $q$, 'STORE_ITEM_NAME_REQUIRED');
  bags := public.ops_store_item_save(null, 'أكياس نفايات 50 لتر', 'كيس', 100);
  brooms := public.ops_store_item_save(null, 'مكانس', 'قطعة', 5);
  perform pg_temp.expect_error($q$ select public.ops_store_item_save(null, ' أكياس نفايات 50 لتر ', 'كيس', 0) $q$, 'STORE_ITEM_DUPLICATE');
  insert into pg_temp.ids values ('bags', bags), ('brooms', brooms);
  perform pg_temp.expect_error(format($q$ select public.ops_store_receive('%s', 0) $q$, bags), 'STORE_QTY_INVALID');
  bal := public.ops_store_receive(bags, 500, 'توريد شهري'); if bal <> 500 then raise exception 'bal %', bal; end if;
  bal := public.ops_store_receive(brooms, 10);
  bal := public.ops_store_adjust(brooms, 8, 'جرد: مكنستان تالفتان'); if bal <> 8 then raise exception 'adjust %', bal; end if;
  perform pg_temp.expect_error(format($q$ select public.ops_store_adjust('%s', 7, 'x') $q$, brooms), 'STORE_REASON_REQUIRED');
  select * into r from public.ops_store_items_list() i where i.id = brooms;
  if r.qty_on_hand <> 8 or r.low_stock or r.unit <> 'قطعة' then raise exception 'item wrong: %', r; end if;
  select count(*) into n from public.ops_store_movements_list(brooms); if n <> 2 then raise exception 'movements %', n; end if;
  -- مسؤول القسم يرى القائمة (ليطلب منها) لكن لا الحركات
  perform pg_temp.as_user('da000000-0000-0000-0000-000000000003');
  select count(*) into n from public.ops_store_items_list(); if n < 2 then raise exception 'manager should see catalog'; end if;
  perform pg_temp.expect_error($q$ select * from public.ops_store_movements_list() $q$, 'OPS_ROOM_FORBIDDEN');
  raise notice 'T1 ✅ المخزن';
end $$;

-- ═══ T2 · بلا سلسلة: الطلب يصل غرفة العمليات مباشرة ويُسلَّم بإنقاص المخزن؛ لا تسليم فوق المخزون ═══
do $$
declare bags uuid := (select v from pg_temp.ids where k = 'bags'); brooms uuid := (select v from pg_temp.ids where k = 'brooms'); rid uuid; r record; n int;
begin
  perform pg_temp.as_user('da000000-0000-0000-0000-000000000003');
  perform pg_temp.expect_error($q$ select public.supply_request_create('[]') $q$, 'SUPPLY_ITEMS_REQUIRED');
  perform pg_temp.expect_error(format($q$ select public.supply_request_create('[{"item_id":"%s","qty":0}]') $q$, bags), 'SUPPLY_QTY_INVALID');
  perform pg_temp.expect_error(format($q$ select public.supply_request_create('[{"item_id":"%s","qty":1},{"item_id":"%s","qty":2}]') $q$, bags, bags), 'SUPPLY_ITEM_DUPLICATE');
  rid := public.supply_request_create(format('[{"item_id":"%s","qty":20},{"item_id":"%s","qty":3}]', bags, brooms)::jsonb, 'للمنطقة 4');
  select * into r from public.sector_supply_requests where id = rid;
  if r.approval_status <> 'approved' or r.supply_type not like 'أكياس نفايات 50 لتر × 20 كيس%' or r.quantity <> 23 or r.ref_no not like 'كتاب/مستلزمات/%' then raise exception 'request wrong: %', r; end if;
  select count(*) into n from public.notifications where user_id = 'da000000-0000-0000-0000-000000000002' and dedupe_key = 'supply_ready:' || rid::text || ':da000000-0000-0000-0000-000000000002';
  if n <> 1 then raise exception 'ops room should be notified'; end if;
  select count(*) into n from public.supply_requests_list('open') l where l.id = rid; if n <> 1 then raise exception 'manager should see own request'; end if;
  -- غرفة العمليات: الطلب جاهز للتسليم، والمحجوز ظاهر على المادة
  perform pg_temp.as_user('da000000-0000-0000-0000-000000000002');
  select * into r from public.supply_requests_list('ready') l where l.id = rid;
  if r.manager_name <> 'مسؤول قسم 4' or r.areas is null or jsonb_array_length(r.items) <> 2 then raise exception 'ops list wrong: %', r; end if;
  select * into r from public.ops_store_items_list() i where i.id = bags; if r.reserved <> 20 then raise exception 'reserved %', r.reserved; end if;
  perform pg_temp.expect_error(format($q$ select public.supply_request_deliver('%s', 'x') $q$, rid), 'SUPPLY_RECEIVER_REQUIRED');
  perform pg_temp.expect_error(format($q$ select public.supply_request_deliver('%s', 'سائق المنطقة', '[{"item_id":"%s","delivered_qty":25}]') $q$, rid, bags), 'SUPPLY_DELIVERED_QTY_INVALID');
  perform public.ops_store_adjust(brooms, 2, 'جرد مؤقت للاختبار');
  perform pg_temp.expect_error(format($q$ select public.supply_request_deliver('%s', 'سائق المنطقة') $q$, rid), 'SUPPLY_STOCK_INSUFFICIENT');
  perform public.ops_store_adjust(brooms, 8, 'إعادة الجرد');
  -- تسليم جزئي للأكياس (15 من 20) والمكانس كاملة
  perform public.supply_request_deliver(rid, 'سائق المنطقة 4', format('[{"item_id":"%s","delivered_qty":15}]', bags)::jsonb, 'الباقي لاحقاً');
  select * into r from public.sector_supply_requests where id = rid;
  if r.approval_status <> 'delivered' or r.receiver_name <> 'سائق المنطقة 4' or (r.items -> 0 ->> 'delivered_qty')::numeric <> 15 or (r.items -> 1 ->> 'delivered_qty')::numeric <> 3 then raise exception 'delivery wrong: %', r; end if;
  select qty_on_hand into r from public.ops_store_items where id = bags; if r.qty_on_hand <> 485 then raise exception 'bags stock %', r.qty_on_hand; end if;
  select qty_on_hand into r from public.ops_store_items where id = brooms; if r.qty_on_hand <> 5 then raise exception 'brooms stock %', r.qty_on_hand; end if;
  select count(*) into n from public.ops_store_movements m where m.request_id = rid and m.kind = 'out'; if n <> 2 then raise exception 'out movements %', n; end if;
  perform pg_temp.expect_error(format($q$ select public.supply_request_deliver('%s', 'أحد') $q$, rid), 'SUPPLY_NOT_READY');
  select count(*) into n from public.notifications where user_id = 'da000000-0000-0000-0000-000000000003' and dedupe_key = 'supply_delivered:' || rid::text; if n <> 1 then raise exception 'manager should be notified of delivery'; end if;
  raise notice 'T2 ✅ بلا سلسلة → غرفة العمليات مباشرة، تسليم جزئي، إنقاص المخزن، لا تسليم فوق المخزون';
end $$;

-- ═══ T3 · بسلسلة: مسؤول قسم → مسؤول قاطعه → الميدانية؛ المهام تظهر بالمواد؛ الرفض بسبب؛ الإلغاء من غرفة العمليات ═══
do $$
declare bags uuid := (select v from pg_temp.ids where k = 'bags'); rid uuid; rid2 uuid; r record; n int; t record;
begin
  perform pg_temp.as_user('da000000-0000-0000-0000-000000000001');
  perform public.sector_manager_profile_save('da000000-0000-0000-0000-000000000004', '{karrada}');
  perform pg_temp.expect_error($q$ select public.approval_chain_save('department_manager', 'purchase', '[{"kind":"hierarchy","role":"admin_ops"}]') $q$, 'APPROVAL_TYPE_INVALID');
  perform public.approval_chain_save('department_manager', 'supplies', '[{"kind":"hierarchy","role":"admin_ops"},{"kind":"hierarchy","role":"field_ops"}]');
  perform pg_temp.as_user('da000000-0000-0000-0000-000000000003');
  rid := public.supply_request_create(format('[{"item_id":"%s","qty":50}]', bags)::jsonb);
  select * into r from public.sector_supply_requests where id = rid;
  if r.approval_status <> 'pending' or r.chain_id is null or r.status <> 'in_approval' then raise exception 'chained request wrong: %', r; end if;
  select count(*) into n from public.notifications where user_id = 'da000000-0000-0000-0000-000000000002' and dedupe_key like 'supply_ready:' || rid::text || '%'; if n <> 0 then raise exception 'ops must not be notified before approval'; end if;
  -- مسؤول القاطع يرى المهمة بالمواد
  perform pg_temp.as_user('da000000-0000-0000-0000-000000000004');
  select * into t from public.approval_my_tasks() where request_id = rid;
  if t.request_kind <> 'supplies' or t.type_name <> 'مستلزمات القواطع' or jsonb_array_length(t.items) <> 1 or t.requester_name <> 'مسؤول قسم 4' or t.requester_role_label <> 'مسؤول قسم' or t.ref_no is null then raise exception 'task wrong: %', t; end if;
  -- غرفة العمليات لا تسلّم قبل الموافقة
  perform pg_temp.as_user('da000000-0000-0000-0000-000000000002');
  perform pg_temp.expect_error(format($q$ select public.supply_request_deliver('%s', 'أحد') $q$, rid), 'SUPPLY_NOT_READY');
  -- الميدانية لا تبتّ قبل دورها
  perform pg_temp.as_user('da000000-0000-0000-0000-000000000005');
  perform pg_temp.expect_error(format($q$ select public.approval_decide_request('supplies', '%s', true) $q$, rid), 'HR_FORBIDDEN');
  perform pg_temp.as_user('da000000-0000-0000-0000-000000000004');
  perform public.approval_decide_request('supplies', rid, true, 'موافق');
  perform pg_temp.as_user('da000000-0000-0000-0000-000000000005');
  select * into t from public.approval_my_tasks() where request_id = rid;
  if t.step_no <> 2 or (t.previous_steps -> 0 ->> 'status') <> 'approved' then raise exception 'field ops task wrong: %', t; end if;
  perform pg_temp.expect_error(format($q$ select public.approval_decide_request('supplies', '%s', false) $q$, rid), 'APPROVAL_REASON_REQUIRED');
  perform public.approval_decide_request('supplies', rid, true);
  select * into r from public.sector_supply_requests where id = rid;
  if r.approval_status <> 'approved' then raise exception 'should be approved after last step'; end if;
  select count(*) into n from public.notifications where user_id = 'da000000-0000-0000-0000-000000000002' and dedupe_key like 'supply_ready:' || rid::text || '%'; if n <> 1 then raise exception 'ops should be notified after final approval'; end if;
  select count(*) into n from public.notifications where user_id = 'da000000-0000-0000-0000-000000000003' and dedupe_key = 'supply_approved:' || rid::text; if n <> 1 then raise exception 'manager should be notified of approval'; end if;
  -- المسار مرئي للطالب ولغرفة العمليات
  perform pg_temp.as_user('da000000-0000-0000-0000-000000000003');
  select count(*) into n from public.approval_timeline('supplies', rid) where status = 'approved'; if n <> 2 then raise exception 'timeline %', n; end if;
  perform pg_temp.as_user('da000000-0000-0000-0000-000000000002');
  select count(*) into n from public.approval_timeline('supplies', rid); if n <> 2 then raise exception 'ops timeline %', n; end if;
  -- طلب ثانٍ: رفض من مسؤول القاطع بسبب
  perform pg_temp.as_user('da000000-0000-0000-0000-000000000003');
  rid2 := public.supply_request_create(format('[{"item_id":"%s","qty":5}]', bags)::jsonb);
  perform pg_temp.as_user('da000000-0000-0000-0000-000000000004');
  perform public.approval_decide_request('supplies', rid2, false, 'لديكم كمية كافية');
  select * into r from public.sector_supply_requests where id = rid2; if r.approval_status <> 'rejected' then raise exception 'should be rejected'; end if;
  select count(*) into n from public.notifications where user_id = 'da000000-0000-0000-0000-000000000003' and dedupe_key = 'supply_rejected:' || rid2::text; if n <> 1 then raise exception 'manager should be notified of rejection'; end if;
  -- مسؤول قسم آخر لا يرى طلبات غيره؛ غرفة العمليات تلغي الجاهز بسبب
  perform pg_temp.as_user('da000000-0000-0000-0000-000000000006');
  select count(*) into n from public.supply_requests_list('all'); if n <> 0 then raise exception 'other manager must not see requests, got %', n; end if;
  perform pg_temp.as_user('da000000-0000-0000-0000-000000000002');
  perform pg_temp.expect_error(format($q$ select public.supply_request_cancel('%s', 'x') $q$, rid), 'STORE_REASON_REQUIRED');
  perform public.supply_request_cancel(rid, 'نفدت المادة من المورد');
  select * into r from public.sector_supply_requests where id = rid; if r.approval_status <> 'cancelled' then raise exception 'should be cancelled'; end if;
  select count(*) into n from public.supply_requests_list('done'); if n < 3 then raise exception 'done list %', n; end if;
  -- لا بيانات مالية في المخرجات
  select count(*) into n from information_schema.columns where table_name in ('ops_store_items','ops_store_movements') and column_name ~* 'price|cost|amount|iqd';
  if n <> 0 then raise exception 'store must not have finance columns'; end if;
  raise notice 'T3 ✅ السلسلة: قاطع → ميدانية، المهام بالمواد، الرفض بسبب، الإلغاء من غرفة العمليات';
end $$;
