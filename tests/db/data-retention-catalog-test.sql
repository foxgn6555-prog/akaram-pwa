-- اختبار 00283 (00340): الكتالوج الكامل للاحتفاظ — كل جدول في public موجود، المقفل لا يُفعَّل، كل نوع قابل للحذف يعمل عدّاً/حذفاً/تصديراً،
-- ودورة كاملة على أنواع عامة (إشعارات مقروءة/غير مقروءة، تنبيهات GPS محلولة/غير محلولة، تدقيق رواتب محمي، محادثات مواطنين مع جلسات مفتوحة).
set client_min_messages = notice;
insert into auth.users (id, email) values ('dc000000-0000-0000-0000-000000000001', 'it-cat@t.iq'), ('dc000000-0000-0000-0000-000000000002', 'mgr-cat@t.iq'), ('dc000000-0000-0000-0000-000000000003', 'emp-cat@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('dc000000-0000-0000-0000-000000000001', 'it_admin'), ('dc000000-0000-0000-0000-000000000002', 'department_manager') on conflict do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

-- ─────────────── A) سلامة الكتالوج نفسه ───────────────
do $$
declare missing text; extra text; bad text; n int; c record; t bigint; l bigint;
begin
  -- A1: كل جدول في public موجود في الكتالوج (أي جدول جديد يجب أن يُضاف — هذا هو ضمان «كل البيانات النصية موجودة»)
  select string_agg(t.table_name, ', ' order by t.table_name) into missing
    from information_schema.tables t
    where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
      and not exists (select 1 from app.data_retention_catalog() k where k.table_name = t.table_name);
  if missing is not null then raise exception 'A1 tables missing from retention catalog: %', missing; end if;
  -- A2: لا جدول في الكتالوج غير موجود فعلاً، ولا تكرار
  select string_agg(k.table_name, ', ') into extra from app.data_retention_catalog() k
    where not exists (select 1 from information_schema.tables t where t.table_schema = 'public' and t.table_name = k.table_name);
  if extra is not null then raise exception 'A2 catalog tables not in db: %', extra; end if;
  select count(*) - count(distinct data_key) into n from app.data_retention_catalog(); if n <> 0 then raise exception 'A2 duplicate data_key'; end if;
  select count(*) - count(distinct table_name) into n from app.data_retention_catalog(); if n <> 0 then raise exception 'A2 duplicate table'; end if;
  -- A3: كل نوع له بوابة معروفة وتسمية عربية
  select string_agg(k.data_key, ', ') into bad from app.data_retention_catalog() k where not exists (select 1 from app.data_retention_portals() p where p.portal_key = k.portal_key);
  if bad is not null then raise exception 'A3 unknown portal for: %', bad; end if;
  select string_agg(k.data_key, ', ') into bad from app.data_retention_catalog() k where length(trim(k.label)) < 3 or length(trim(k.safety_lock)) < 3;
  if bad is not null then raise exception 'A3 empty label/lock for: %', bad; end if;
  -- A4: القديمان ما زالا موجودين بمفتاحيهما
  if (select count(*) from app.data_retention_catalog() where data_key in ('biometric_raw_punches', 'gps_position_history') and deletable) <> 2 then raise exception 'A4 legacy keys missing'; end if;
  -- A5: كل نوع قابل للحذف: عمود الزمن موجود، عمود id موجود (المحرّك العام يعتمده)، والمدة الافتراضية صالحة
  for c in select * from app.data_retention_catalog() where deletable loop
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = c.table_name and column_name = c.time_column and data_type in ('timestamp with time zone', 'timestamp without time zone', 'date')) then
      raise exception 'A5 % time column % missing/not temporal', c.data_key, c.time_column; end if;
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = c.table_name and column_name = 'id') then
      raise exception 'A5 % has no id column', c.data_key; end if;
    if c.default_months < 1 or c.default_months > 120 then raise exception 'A5 % bad default months %', c.data_key, c.default_months; end if;
    -- A6: العدّ يعمل (يتحقق من صحة شرط الحماية SQL لكل نوع)
    select * into t, l from app.data_retention_count(c.data_key, now());
    if t is null or l is null or l > t then raise exception 'A6 count broken for %: total % locked %', c.data_key, t, l; end if;
    -- A7: حذف دفعة بمهلة في الماضي السحيق يعمل ويحذف صفراً (يتحقق من صحة SQL الحذف دون المساس ببيانات)
    if app.data_retention_delete_some(c.data_key, '1900-01-01'::timestamptz, 10) <> 0 then raise exception 'A7 deleted rows with 1900 cutoff for %', c.data_key; end if;
  end loop;
  -- A8: المقفل يرفض العدّ والحذف بوضوح
  perform pg_temp.expect_error('select * from app.data_retention_count(''employees'', now())', 'RETENTION_LOCKED');
  perform pg_temp.expect_error('select app.data_retention_delete_some(''payrolls'', now(), 10)', 'RETENTION_LOCKED');
  perform pg_temp.expect_error('select * from app.data_retention_count(''no_such_table'', now())', 'RETENTION_UNKNOWN_KEY');
  raise notice 'A ok: % types, % deletable', (select count(*) from app.data_retention_catalog()), (select count(*) from app.data_retention_catalog() where deletable);
end $$;

-- ─────────────── B) الإعدادات والمقفل ───────────────
do $$
declare it1 uuid := 'dc000000-0000-0000-0000-000000000001'; mgr uuid := 'dc000000-0000-0000-0000-000000000002'; js jsonb; e jsonb; c record; req jsonb; n int;
begin
  perform pg_temp.as_user(mgr);
  perform pg_temp.expect_error('select public.data_retention_settings_get()', 'IT_FORBIDDEN');
  perform pg_temp.as_user(it1);
  js := public.data_retention_settings_get();
  -- B1: الحجم = الكتالوج كاملاً، ولكل عنصر بوابة وتسمية وحالة قفل
  if jsonb_array_length(js) <> (select count(*) from app.data_retention_catalog()) then raise exception 'B1 size %', jsonb_array_length(js); end if;
  if exists (select 1 from jsonb_array_elements(js) x where x ->> 'portal_key' is null or x ->> 'portal_label' is null or x ->> 'deletable' is null or x ->> 'table_name' is null) then raise exception 'B1 missing fields'; end if;
  if exists (select 1 from jsonb_array_elements(js) x where (x ->> 'enabled')::boolean) then raise exception 'B1 nothing enabled by default'; end if;
  -- B2: الترتيب: حسب ترتيب البوابة ثم القابل للحذف أولاً
  if (js -> 0 ->> 'portal_key') <> 'it' then raise exception 'B2 first portal %', js -> 0 ->> 'portal_key'; end if;
  if not (js -> 0 ->> 'deletable')::boolean then raise exception 'B2 deletable first'; end if;
  -- B3: تفعيل نوع مقفل مرفوض ولا يُنشئ سياسة
  perform pg_temp.expect_error('select public.data_retention_policy_set(''employees'', true, 12, false)', 'RETENTION_LOCKED');
  perform pg_temp.expect_error('select public.data_retention_policy_set(''payrolls'', false, 12, false)', 'RETENTION_LOCKED');
  if exists (select 1 from public.data_retention_policies where data_key in ('employees', 'payrolls')) then raise exception 'B3 policy row created for locked'; end if;
  -- B4: حتى لو دُسّت سياسة مفعّلة لنوع مقفل مباشرة، الإعدادات تعرضه معطّلاً والفحص لا ينشئ له طلباً
  insert into public.data_retention_policies (data_key, enabled, retention_months) values ('employees', true, 1);
  js := public.data_retention_settings_get();
  select x into e from jsonb_array_elements(js) x where x ->> 'data_key' = 'employees';
  if (e ->> 'enabled')::boolean then raise exception 'B4 locked shown enabled'; end if;
  js := public.data_retention_scan_now();
  if exists (select 1 from public.data_retention_requests where data_key = 'employees') then raise exception 'B4 scan created request for locked'; end if;
  delete from public.data_retention_policies where data_key = 'employees';
  -- B5: تفعيل كل نوع قابل للحذف ثم إيقافه يعمل بلا أخطاء (يتحقق من القيم الافتراضية لكل نوع)
  n := 0;
  for c in select * from app.data_retention_catalog() where deletable loop
    js := public.data_retention_policy_set(c.data_key, true, c.default_months, c.default_export_required);
    js := public.data_retention_policy_set(c.data_key, false, c.default_months, c.default_export_required);
    n := n + 1;
  end loop;
  if n < 40 then raise exception 'B5 expected >= 40 deletable types, got %', n; end if;
  delete from public.data_retention_policies where data_key not in ('biometric_raw_punches', 'gps_position_history');
  -- B6: التصدير على طلب لنوع عام بمهلة في الماضي السحيق يعمل لكل نوع (يتحقق من SQL التصدير) — عبر طلبات مؤقتة
  for c in select * from app.data_retention_catalog() where deletable and data_key not in ('biometric_raw_punches', 'gps_position_history') loop
    insert into public.data_retention_requests (data_key, cutoff, status) values (c.data_key, '1900-01-01', 'pending');
    req := public.data_retention_export_rows((select id from public.data_retention_requests where data_key = c.data_key and status = 'pending'), null, 100);
    if (req ->> 'count')::int <> 0 or req -> 'next' <> 'null'::jsonb or req ->> 'label' <> c.label then raise exception 'B6 export broken for %: %', c.data_key, req; end if;
    delete from public.data_retention_requests where data_key = c.data_key;
  end loop;
  raise notice 'B ok';
end $$;

-- ─────────────── C) دورة كاملة: الإشعارات (قفل: غير المقروءة) ───────────────
do $$
declare it1 uuid := 'dc000000-0000-0000-0000-000000000001'; emp uuid := 'dc000000-0000-0000-0000-000000000003';
  js jsonb; req jsonb; rid uuid; t bigint; l bigint; page jsonb; nxt jsonb; total int := 0;
begin
  perform pg_temp.as_user(it1);
  delete from public.notifications where user_id = emp;
  -- 5 قديمة مقروءة (قابلة)، 2 قديمة غير مقروءة (محمية)، 1 حديثة مقروءة (داخل المهلة)
  insert into public.notifications (user_id, title, body, is_read, read_at, created_at)
    select emp, 'قديم مقروء ' || g, 'x', true, now() - interval '200 day', now() - interval '200 day' + make_interval(mins => g) from generate_series(1, 5) g;
  insert into public.notifications (user_id, title, body, is_read, created_at)
    select emp, 'قديم غير مقروء ' || g, 'x', false, now() - interval '200 day' from generate_series(1, 2) g;
  insert into public.notifications (user_id, title, body, is_read, read_at, created_at) values (emp, 'حديث', 'x', true, now(), now() - interval '2 day');
  select * into t, l from app.data_retention_count('notifications', now() - interval '30 day');
  if t < 7 or l < 2 or (t - l) < 5 then raise exception 'C1 count total % locked %', t, l; end if;
  -- تفعيل بشهر واحد بلا تصدير ثم فحص ⇒ طلب مفتوح
  js := public.data_retention_policy_set('notifications', true, 1, false);
  js := public.data_retention_scan_now();
  select id into rid from public.data_retention_requests where data_key = 'notifications' and status = 'pending';
  if rid is null then raise exception 'C2 no request'; end if;
  -- التصدير يعرض الصفوف بأسماء أعمدتها ويصفّح بثبات (صفحات من 3)
  nxt := null;
  loop
    page := public.data_retention_export_rows(rid, nxt, 3);
    total := total + (page ->> 'count')::int;
    exit when page -> 'next' = 'null'::jsonb or page -> 'next' is null;
    nxt := page -> 'next';
    if total > 100000 then raise exception 'C3 runaway'; end if;
  end loop;
  select rows_total - rows_locked into t from public.data_retention_requests where id = rid;
  if total <> t then raise exception 'C3 export paged % expected %', total, t; end if;
  if (page -> 'rows' -> 0) is not null and (page -> 'rows' -> 0 ->> 'id') is null and total > 0 then raise exception 'C3 rows lack id'; end if;
  -- تأكيد (لا يتطلب تصديراً) ثم حذف بدفعات صغيرة حتى الاكتمال
  req := public.data_retention_confirm(rid);
  if req ->> 'status' <> 'confirmed' then raise exception 'C4 %', req ->> 'status'; end if;
  loop
    req := public.data_retention_delete_batch(rid, 2);
    exit when req ->> 'status' = 'done';
  end loop;
  if (req ->> 'rows_deleted')::int <> t then raise exception 'C5 deleted % expected %', req ->> 'rows_deleted', t; end if;
  if (select count(*) from public.notifications where user_id = emp and is_read) <> 1 then raise exception 'C5 read old notifications should be gone, recent kept'; end if;
  if (select count(*) from public.notifications where user_id = emp and not is_read) <> 2 then raise exception 'C5 unread old notifications must survive'; end if;
  js := public.data_retention_policy_set('notifications', false, 1, false);
  raise notice 'C ok';
end $$;

-- ─────────────── D) قفل عبر استعلام فرعي: تنبيهات GPS المحلولة فقط + تدقيق الرواتب محمي ───────────────
insert into public.gps_providers (id, name, type) values ('dc0db000-0000-0000-0000-000000000001', 'CAT provider', 'vendor_api') on conflict (id) do nothing;
insert into public.gps_devices (id, provider_id, external_id, name, online_status) values ('dc0dc000-0000-0000-0000-000000000001', 'dc0db000-0000-0000-0000-000000000001', 'CAT-DEV1', 'جهاز CAT1', 'online') on conflict (id) do nothing;
do $$
declare it1 uuid := 'dc000000-0000-0000-0000-000000000001'; t bigint; l bigint; js jsonb; req jsonb; rid uuid; n bigint;
begin
  perform pg_temp.as_user(it1);
  delete from public.gps_operational_alerts where device_id = 'dc0dc000-0000-0000-0000-000000000001';
  insert into public.gps_operational_alerts (device_id, alert_type, severity, title, opened_at, resolved_at) values
    ('dc0dc000-0000-0000-0000-000000000001', 'gps_offline', 'warning', 'قديم محلول', now() - interval '400 day', now() - interval '399 day'),
    ('dc0dc000-0000-0000-0000-000000000001', 'gps_stale', 'warning', 'قديم محلول 2', now() - interval '400 day', now() - interval '399 day'),
    ('dc0dc000-0000-0000-0000-000000000001', 'outside_zone', 'critical', 'قديم غير محلول', now() - interval '400 day', null),
    ('dc0dc000-0000-0000-0000-000000000001', 'engine_idle', 'info', 'حديث', now() - interval '1 day', now());
  select * into t, l from app.data_retention_count('gps_operational_alerts', now() - interval '365 day');
  if (t - l) < 2 or l < 1 then raise exception 'D1 total % locked %', t, l; end if;
  n := app.data_retention_delete_some('gps_operational_alerts', now() - interval '365 day', 100);
  if (select count(*) from public.gps_operational_alerts where device_id = 'dc0dc000-0000-0000-0000-000000000001' and resolved_at is null) <> 1 then raise exception 'D2 unresolved alert deleted!'; end if;
  if (select count(*) from public.gps_operational_alerts where device_id = 'dc0dc000-0000-0000-0000-000000000001' and title like 'قديم محلول%') <> 0 then raise exception 'D2 resolved old alerts should be gone'; end if;
  if (select count(*) from public.gps_operational_alerts where device_id = 'dc0dc000-0000-0000-0000-000000000001' and title = 'حديث') <> 1 then raise exception 'D2 recent alert deleted!'; end if;

  -- تدقيق: صف رواتب قديم محمي، صف موظفين قديم قابل
  insert into public.audit_logs (table_name, record_id, operation, actor_role, created_at) values
    ('payrolls', 'x1', 'UPDATE', 'finance', now() - interval '5 year'),
    ('employees', 'x2', 'UPDATE', 'hr', now() - interval '5 year');
  select * into t, l from app.data_retention_count('audit_logs', now() - interval '4 year');
  if l < 1 then raise exception 'D3 payroll audit not locked'; end if;
  n := app.data_retention_delete_some('audit_logs', now() - interval '4 year', 1000);
  if not exists (select 1 from public.audit_logs where table_name = 'payrolls' and record_id = 'x1') then raise exception 'D3 payroll audit row deleted!'; end if;
  if exists (select 1 from public.audit_logs where table_name = 'employees' and record_id = 'x2') then raise exception 'D3 employees audit row should be deleted'; end if;
  raise notice 'D ok';
end $$;

-- ─────────────── E) محادثات المواطنين: الجلسات المفتوحة محمية مع رسائلها ───────────────
do $$
declare it1 uuid := 'dc000000-0000-0000-0000-000000000001'; cid uuid; s_open uuid; s_closed uuid; t bigint; l bigint; n bigint; req jsonb; js jsonb; rid uuid;
begin
  perform pg_temp.as_user(it1);
  insert into public.citizen_accounts (full_name, phone) values ('مواطن الاحتفاظ', '07700000099') returning id into cid;
  insert into public.citizen_chat_sessions (citizen_id, status, requested_at) values (cid, 'waiting', now() - interval '2 year') returning id into s_open;
  insert into public.citizen_chat_sessions (citizen_id, status, requested_at, closed_at) values (cid, 'closed', now() - interval '2 year', now() - interval '2 year' + interval '1 hour') returning id into s_closed;
  insert into public.citizen_chat_messages (session_id, sender, body, created_at) values (s_open, 'citizen', 'جلسة مفتوحة', now() - interval '2 year'), (s_closed, 'citizen', 'جلسة مغلقة', now() - interval '2 year'), (s_closed, 'agent', 'رد', now() - interval '2 year');
  select * into t, l from app.data_retention_count('citizen_chat_messages', now() - interval '1 year');
  if l < 1 or (t - l) < 2 then raise exception 'E1 total % locked %', t, l; end if;
  -- دورة كاملة عبر الواجهة العامة مع تصدير مطلوب: بلا تصدير يُرفض التأكيد
  js := public.data_retention_policy_set('citizen_chat_messages', true, 12, true);
  js := public.data_retention_scan_now();
  select id into rid from public.data_retention_requests where data_key = 'citizen_chat_messages' and status = 'pending';
  if rid is null then raise exception 'E2 no request'; end if;
  perform pg_temp.expect_error(format('select public.data_retention_confirm(%L)', rid), 'RETENTION_EXPORT_REQUIRED');
  select rows_total - rows_locked into t from public.data_retention_requests where id = rid;
  req := public.data_retention_export_recorded(rid, t, repeat('b', 64), 'قرص الأرشيف E');
  req := public.data_retention_confirm(rid);
  req := public.data_retention_delete_batch(rid, 1000);
  if req ->> 'status' <> 'done' then raise exception 'E3 %', req ->> 'status'; end if;
  if (select count(*) from public.citizen_chat_messages where session_id = s_open) <> 1 then raise exception 'E3 open-session message deleted!'; end if;
  if (select count(*) from public.citizen_chat_messages where session_id = s_closed) <> 0 then raise exception 'E3 closed-session messages should be gone'; end if;
  js := public.data_retention_policy_set('citizen_chat_messages', false, 12, true);
  -- F) الفحص لا يلمس شيئاً عندما تكون كل السياسات معطّلة (بعد كل ما سبق)
  js := public.data_retention_scan_now();
  if (js ->> 'created')::int <> 0 then raise exception 'F scan created % with all disabled', js ->> 'created'; end if;
  raise notice 'E/F ok';
end $$;
