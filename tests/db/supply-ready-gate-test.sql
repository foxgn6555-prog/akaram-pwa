-- اختبار 00181: بوابة «جاهز للتسليم» من غرفة العمليات + إشعارات الطرفين. مستقل (بادئة db، منطقة 4).
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('db000000-0000-0000-0000-000000000001', 'it-g@t.iq'), ('db000000-0000-0000-0000-000000000002', 'ops-g@t.iq'), ('db000000-0000-0000-0000-000000000007', 'ops2-g@t.iq'),
  ('db000000-0000-0000-0000-000000000003', 'dm-g@t.iq'), ('db000000-0000-0000-0000-000000000004', 'sm-g@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('db000000-0000-0000-0000-000000000001', 'it_admin'), ('db000000-0000-0000-0000-000000000002', 'ops_room'), ('db000000-0000-0000-0000-000000000007', 'ops_room'),
  ('db000000-0000-0000-0000-000000000003', 'department_manager'), ('db000000-0000-0000-0000-000000000004', 'admin_ops')
on conflict do nothing;
insert into public.manager_profiles (user_id, shift, sectors) values ('db000000-0000-0000-0000-000000000003', 'morning', '{4}') on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date, phone, biometric_pin) values
  ('db000000-0000-0000-0000-0000000000e3', 'db000000-0000-0000-0000-000000000003', 'SG-M1', 'مسؤول قسم G', '2024-01-01', '0773', 'g3')
on conflict (employee_number) do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;
create or replace function pg_temp.n(p_user uuid, p_title_like text) returns int language sql as $$ select count(*)::int from public.notifications where user_id = p_user and title like p_title_like $$;

-- ═══ G1 · بسلسلة: pending → approved (غير جاهز) → ready (غرفة العمليات) → delivered؛ لا جاهزية مع موافقات معلّقة ═══
do $$
declare bags uuid; rid uuid; r record; n int;
  ops constant uuid := 'db000000-0000-0000-0000-000000000002'; ops2 constant uuid := 'db000000-0000-0000-0000-000000000007'; dm constant uuid := 'db000000-0000-0000-0000-000000000003';
begin
  perform pg_temp.as_user('db000000-0000-0000-0000-000000000001');
  perform public.sector_manager_profile_save('db000000-0000-0000-0000-000000000004', '{karrada}');
  perform public.approval_chain_save('department_manager', 'supplies', '[{"kind":"hierarchy","role":"admin_ops"}]');
  perform pg_temp.as_user(ops);
  bags := public.ops_store_item_save(null, 'قفازات G', 'زوج', 50);
  perform public.ops_store_receive(bags, 60, 'توريد');
  perform pg_temp.as_user(dm);
  rid := public.supply_request_create(format('[{"item_id":"%s","qty":20}]', bags)::jsonb, 'اختبار البوابة');
  -- إشعار المسؤول بالإرسال + غرفة العمليات بطلب جديد دخل الموافقات
  if pg_temp.n(dm, 'أُرسل طلب المستلزمات%') <> 1 then raise exception 'manager should get sent confirmation'; end if;
  if pg_temp.n(ops, 'طلب مستلزمات جديد دخل الموافقات%') <> 1 or pg_temp.n(ops2, 'طلب مستلزمات جديد دخل الموافقات%') <> 1 then raise exception 'ops should know a request entered approvals'; end if;
  -- غرفة العمليات لا تجهّز ولا تسلّم وفي الطلب موافقات معلّقة
  perform pg_temp.as_user(ops);
  perform pg_temp.expect_error(format($q$ select public.supply_request_mark_ready('%s') $q$, rid), 'SUPPLY_APPROVAL_PENDING');
  perform pg_temp.expect_error(format($q$ select public.supply_request_deliver('%s', 'أحد') $q$, rid), 'SUPPLY_NOT_READY');
  select * into r from public.supply_requests_list('open') l where l.id = rid; if r.pending_steps <> 1 or r.approval_status <> 'pending' then raise exception 'open row wrong: %', r; end if;
  -- المسؤول لا يجهّز
  perform pg_temp.as_user(dm);
  perform pg_temp.expect_error(format($q$ select public.supply_request_mark_ready('%s') $q$, rid), 'OPS_ROOM_FORBIDDEN');
  -- الموافقة الأخيرة: approved لكن غير جاهز؛ الطرفان مبلَّغان
  perform pg_temp.as_user('db000000-0000-0000-0000-000000000004');
  perform public.approval_decide_request('supplies', rid, true, 'موافق');
  select * into r from public.sector_supply_requests where id = rid; if r.approval_status <> 'approved' or r.ready_at is not null then raise exception 'should be approved-not-ready: %', r; end if;
  if pg_temp.n(dm, 'اكتملت موافقات طلب المستلزمات%') <> 1 then raise exception 'manager should be told approvals complete (not ready)'; end if;
  if pg_temp.n(ops, 'اكتملت موافقات طلب مستلزمات%') <> 1 then raise exception 'ops should be told to prepare: %', (select string_agg(title || '|' || dedupe_key, ' ;; ') from public.notifications where user_id = ops); end if;
  perform pg_temp.as_user(ops);
  perform pg_temp.expect_error(format($q$ select public.supply_request_deliver('%s', 'أحد') $q$, rid), 'SUPPLY_NOT_READY');
  select count(*) into n from public.supply_requests_list('ready'); if n <> 0 then raise exception 'ready list must be empty before mark_ready'; end if;
  -- إعلان الجاهزية
  perform public.supply_request_mark_ready(rid, 'جاهز عند الباب');
  select * into r from public.sector_supply_requests where id = rid; if r.approval_status <> 'ready' or r.ready_by <> ops or r.ready_note <> 'جاهز عند الباب' then raise exception 'ready wrong: %', r; end if;
  if pg_temp.n(dm, 'طلب المستلزمات % جاهز للتسليم') <> 1 then raise exception 'manager should be told ready'; end if;
  if pg_temp.n(ops2, 'أُعلن طلب مستلزمات جاهزاً%') <> 1 then raise exception 'other ops accounts should be told'; end if;
  if pg_temp.n(ops, 'أُعلن طلب مستلزمات جاهزاً%') <> 0 then raise exception 'actor must not notify himself'; end if;
  perform pg_temp.expect_error(format($q$ select public.supply_request_mark_ready('%s') $q$, rid), 'SUPPLY_NOT_APPROVED');
  select * into r from public.supply_requests_list('ready') l where l.id = rid; if r.ready_by_name is null or r.pending_steps <> 0 then raise exception 'ready row wrong: %', r; end if;
  -- التسليم: ينزل المخزون تحت الحدّ (60-20=40 < 50) → تنبيه غرفة العمليات
  perform public.supply_request_deliver(rid, 'سائق 4');
  select * into r from public.sector_supply_requests where id = rid; if r.approval_status <> 'delivered' then raise exception 'not delivered'; end if;
  if pg_temp.n(dm, 'تم تسليم طلب المستلزمات%') <> 1 then raise exception 'manager delivery notice'; end if;
  if pg_temp.n(ops, 'مواد نزلت تحت الحدّ الأدنى%') <> 1 or pg_temp.n(ops2, 'مواد نزلت تحت الحدّ الأدنى%') <> 1 then raise exception 'low stock notice missing'; end if;
  raise notice 'G1 ✅ البوابة: لا جاهزية مع موافقات معلّقة، التسليم بعد الجاهزية فقط، إشعارات الطرفين';
end $$;

-- ═══ G2 · بلا سلسلة: approved فوراً لكن غير جاهز؛ الإلغاء من ready ═══
do $$
declare bags uuid; rid uuid; r record; n int; dm constant uuid := 'db000000-0000-0000-0000-000000000003'; ops constant uuid := 'db000000-0000-0000-0000-000000000002';
begin
  perform pg_temp.as_user('db000000-0000-0000-0000-000000000001');
  perform public.approval_chain_save('department_manager', 'supplies', '[{"kind":"hierarchy","role":"admin_ops"}]', false);
  select id into bags from public.ops_store_items where name = 'قفازات G';
  perform pg_temp.as_user(dm);
  rid := public.supply_request_create(format('[{"item_id":"%s","qty":5}]', bags)::jsonb);
  select * into r from public.sector_supply_requests where id = rid; if r.approval_status <> 'approved' then raise exception 'no-chain should be approved: %', r.approval_status; end if;
  if pg_temp.n(ops, 'طلب مستلزمات جديد بانتظار التجهيز%') <> 1 then raise exception 'ops should be told to prepare (no chain)'; end if;
  perform pg_temp.as_user(ops);
  perform pg_temp.expect_error(format($q$ select public.supply_request_deliver('%s', 'أحد') $q$, rid), 'SUPPLY_NOT_READY');
  perform public.supply_request_mark_ready(rid);
  perform public.supply_request_cancel(rid, 'نفدت المادة');
  select * into r from public.sector_supply_requests where id = rid; if r.approval_status <> 'cancelled' then raise exception 'cancel from ready'; end if;
  if pg_temp.n(dm, 'أُلغي طلب المستلزمات%') <> 1 then raise exception 'manager cancel notice'; end if;
  select count(*) into n from public.supply_requests_list('open'); if n <> 0 then raise exception 'open should be empty, got %', n; end if;
  raise notice 'G2 ✅ بلا سلسلة: موافَق لكن غير جاهز؛ الإلغاء من ready يبلّغ المسؤول';
end $$;
select 'test ok' as result;
