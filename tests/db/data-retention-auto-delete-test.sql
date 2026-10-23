-- اختبار 00284 (00341): الحذف التلقائي مع مهلة الأمان — يحتاج تأكيد/لا يحتاج، المهلة، التأجيل، الإلغاء، الحجز بانتظار التصدير، التصدير غير المطابق، الإشعارات
set client_min_messages = notice;
insert into auth.users (id, email) values ('da000000-0000-0000-0000-000000000001', 'it-auto@t.iq'), ('da000000-0000-0000-0000-000000000003', 'emp-auto@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('da000000-0000-0000-0000-000000000001', 'it_admin') on conflict do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;
-- إشعارات قديمة مقروءة لموظف الاختبار = بيانات قابلة للحذف؛ تُعاد زراعتها قبل كل سيناريو
create or replace function pg_temp.seed_notifs(n int) returns void language plpgsql as $$
begin
  delete from public.notifications where user_id = 'da000000-0000-0000-0000-000000000003';
  insert into public.notifications (user_id, title, body, is_read, read_at, created_at)
    select 'da000000-0000-0000-0000-000000000003', 'قديم ' || g, 'x', true, now() - interval '400 day', now() - interval '400 day' + make_interval(mins => g) from generate_series(1, n) g;
  insert into public.notifications (user_id, title, body, is_read, created_at) values ('da000000-0000-0000-0000-000000000003', 'قديم غير مقروء', 'x', false, now() - interval '400 day');
end $$;
create or replace function pg_temp.old_left() returns int language sql as $$ select count(*)::int from public.notifications where user_id = 'da000000-0000-0000-0000-000000000003' and is_read $$;
create or replace function pg_temp.it_notifs(p_like text) returns int language sql as $$
  select count(*)::int from public.notifications n where n.user_id = 'da000000-0000-0000-0000-000000000001' and n.title like p_like $$;

do $$
declare it1 uuid := 'da000000-0000-0000-0000-000000000001'; js jsonb; e jsonb; req jsonb; rid uuid; ad timestamptz; t bigint;
begin
  perform pg_temp.as_user(it1);
  delete from public.data_retention_requests where data_key = 'notifications';
  delete from public.notifications where user_id = it1;

  -- S0: الافتراضي requires_confirm=true و grace_days=7 ومدخلات المهلة تُتحقق
  js := public.data_retention_settings_get();
  select x into e from jsonb_array_elements(js) x where x ->> 'data_key' = 'notifications';
  if not (e ->> 'requires_confirm')::boolean or (e ->> 'grace_days')::int <> 7 then raise exception 'S0 defaults %', e; end if;
  perform pg_temp.expect_error('select public.data_retention_policy_set(''notifications'', true, 1, false, false, 91)', 'RETENTION_INPUT_INVALID');
  perform pg_temp.expect_error('select public.data_retention_policy_set(''notifications'', true, 1, false, false, -1)', 'RETENTION_INPUT_INVALID');

  -- S1: يحتاج تأكيد (الوضع القديم): الفحص ينشئ الطلب بلا موعد تلقائي ولا يحذف مهما تكرر
  perform pg_temp.seed_notifs(6);
  js := public.data_retention_policy_set('notifications', true, 1, false, true, 0);
  js := public.data_retention_scan_now();
  select id, auto_delete_at into rid, ad from public.data_retention_requests where data_key = 'notifications' and status = 'pending';
  if rid is null or ad is not null then raise exception 'S1 request % auto %', rid, ad; end if;
  js := public.data_retention_scan_now(); js := public.data_retention_scan_now();
  if pg_temp.old_left() <> 6 then raise exception 'S1 deleted without confirm!'; end if;
  if pg_temp.it_notifs('طلب حذف بيانات بانتظار قراركم%') < 1 then raise exception 'S1 no manual notification'; end if;
  perform pg_temp.expect_error(format('select public.data_retention_postpone(%L, 7)', rid), 'RETENTION_NOT_AUTO');

  -- S2: تحويل السياسة إلى تلقائي بمهلة 7 أيام ينعكس على الطلب المفتوح (موعد ≈ الآن + 7) ولا يحذف الآن
  js := public.data_retention_policy_set('notifications', true, 1, false, false, 7);
  select auto_delete_at into ad from public.data_retention_requests where id = rid;
  if ad is null or ad < now() + interval '6 day' or ad > now() + interval '8 day' then raise exception 'S2 auto_delete_at %', ad; end if;
  js := public.data_retention_scan_now();
  if pg_temp.old_left() <> 6 then raise exception 'S2 deleted before grace!'; end if;
  req := public.data_retention_requests_list(10) -> 0;
  if not (req ->> 'can_postpone')::boolean or (req ->> 'auto_blocked_export')::boolean then raise exception 'S2 json %', req; end if;

  -- S3: التأجيل يضيف أياماً ويزيد العدّاد؛ مدخل غير صالح مرفوض
  req := public.data_retention_postpone(rid, 10);
  if (req ->> 'postponed_count')::int <> 1 or (req ->> 'auto_delete_at')::timestamptz < now() + interval '16 day' then raise exception 'S3 %', req; end if;
  perform pg_temp.expect_error(format('select public.data_retention_postpone(%L, 0)', rid), 'RETENTION_INPUT_INVALID');

  -- S4: انقضاء المهلة (نرجع الموعد إلى الماضي) ⇒ الفحص يؤكّد باسم النظام ويحذف القابل ويُبقي المحمي ويبلّغ IT
  update public.data_retention_requests set auto_delete_at = now() - interval '1 minute' where id = rid;
  js := public.data_retention_scan_now();
  select status, rows_deleted into e, t from (select to_jsonb(status) status, rows_deleted from public.data_retention_requests where id = rid) q;
  if e <> '"done"'::jsonb or t <> 6 then raise exception 'S4 status % deleted %', e, t; end if;
  if pg_temp.old_left() <> 0 then raise exception 'S4 rows remain'; end if;
  if (select count(*) from public.notifications where user_id = 'da000000-0000-0000-0000-000000000003' and not is_read) <> 1 then raise exception 'S4 unread (locked) deleted!'; end if;
  req := public.data_retention_requests_list(10) -> 0;
  if req ->> 'confirmed_by_name' <> 'النظام (تلقائي)' then raise exception 'S4 confirmed_by %', req ->> 'confirmed_by_name'; end if;
  if not exists (select 1 from public.data_retention_events where request_id = rid and action = 'auto_confirmed') then raise exception 'S4 no auto_confirmed event'; end if;
  if pg_temp.it_notifs('اكتمل الحذف التلقائي%') <> 1 then raise exception 'S4 completion notification'; end if;

  -- S5: مهلة 0 ⇒ يُنشأ الطلب ويُحذف في الفحص نفسه، مع إشعار «حذف تلقائي مجدول» ثم «اكتمل»
  perform pg_temp.seed_notifs(4);
  js := public.data_retention_policy_set('notifications', true, 1, false, false, 0);
  js := public.data_retention_scan_now();
  if (js ->> 'created')::int <> 1 then raise exception 'S5 created %', js ->> 'created'; end if;
  if pg_temp.old_left() <> 0 then raise exception 'S5 grace 0 should delete in same scan'; end if;
  if pg_temp.it_notifs('حذف تلقائي مجدول%') < 1 then raise exception 'S5 scheduled notification'; end if;

  -- S6: الإلغاء خلال المهلة يمنع الحذف نهائياً
  perform pg_temp.seed_notifs(3);
  js := public.data_retention_policy_set('notifications', true, 1, false, false, 5);
  js := public.data_retention_scan_now();
  select id into rid from public.data_retention_requests where data_key = 'notifications' and status = 'pending';
  req := public.data_retention_cancel(rid);
  update public.data_retention_requests set auto_delete_at = now() - interval '1 day' where id = rid;
  js := public.data_retention_scan_now();
  if pg_temp.old_left() <> 3 then raise exception 'S6 cancelled request deleted rows!'; end if;
  -- (الفحص أنشأ طلباً جديداً بعد الإلغاء — طبيعي — ننظّفه)
  js := public.data_retention_policy_set('notifications', false, 1, false, false, 5);

  -- S7: يتطلب تصديراً + تلقائي: انقضاء المهلة بلا تصدير ⇒ لا حذف، تنبيه «محجوز» مرة يومياً فقط؛ بعد التصدير ⇒ يُحذف في الفحص التالي
  perform pg_temp.seed_notifs(5);
  js := public.data_retention_policy_set('notifications', true, 1, true, false, 0);
  js := public.data_retention_scan_now();
  select id into rid from public.data_retention_requests where data_key = 'notifications' and status = 'pending';
  if rid is null then raise exception 'S7 request'; end if;
  if pg_temp.old_left() <> 5 then raise exception 'S7 deleted without export!'; end if;
  js := public.data_retention_scan_now(); js := public.data_retention_scan_now();
  if pg_temp.old_left() <> 5 then raise exception 'S7 deleted without export (2)!'; end if;
  if pg_temp.it_notifs('حذف تلقائي محجوز بانتظار التصدير%') <> 1 then raise exception 'S7 blocked notification should be once per day, got %', pg_temp.it_notifs('حذف تلقائي محجوز بانتظار التصدير%'); end if;
  req := public.data_retention_requests_list(10) -> 0;
  if not (req ->> 'auto_blocked_export')::boolean then raise exception 'S7 json flag %', req; end if;
  select rows_total - rows_locked into t from public.data_retention_requests where id = rid;
  req := public.data_retention_export_recorded(rid, t, repeat('c', 64), 'قرص S7');
  js := public.data_retention_scan_now();
  if pg_temp.old_left() <> 0 then raise exception 'S7 should delete after export'; end if;
  if (select status from public.data_retention_requests where id = rid) <> 'done' then raise exception 'S7 status'; end if;

  -- S8: تصدير ثم وصول صفوف قديمة جديدة قبل الموعد ⇒ التصدير غير مطابق: يعود الطلب إلى pending، لا حذف، إشعار؛ إعادة التصدير ثم حذف
  perform pg_temp.seed_notifs(2);
  js := public.data_retention_policy_set('notifications', true, 1, true, false, 3);
  js := public.data_retention_scan_now();
  select id into rid from public.data_retention_requests where data_key = 'notifications' and status = 'pending';
  select rows_total - rows_locked into t from public.data_retention_requests where id = rid;
  req := public.data_retention_export_recorded(rid, t, repeat('d', 64), 'قرص S8');
  insert into public.notifications (user_id, title, body, is_read, read_at, created_at) values ('da000000-0000-0000-0000-000000000003', 'قديم متأخر', 'x', true, now(), now() - interval '300 day');
  update public.data_retention_requests set auto_delete_at = now() - interval '1 minute' where id = rid;
  js := public.data_retention_scan_now();
  if (select status from public.data_retention_requests where id = rid) <> 'pending' then raise exception 'S8 should revert to pending'; end if;
  if pg_temp.old_left() <> 3 then raise exception 'S8 deleted with stale export!'; end if;
  if pg_temp.it_notifs('تعذّر الحذف التلقائي%') <> 1 then raise exception 'S8 stale notification'; end if;
  select rows_total - rows_locked into t from public.data_retention_requests where id = rid;
  req := public.data_retention_export_recorded(rid, t, repeat('e', 64), 'قرص S8-2');
  js := public.data_retention_scan_now();
  if pg_temp.old_left() <> 0 or (select status from public.data_retention_requests where id = rid) <> 'done' then raise exception 'S8 final'; end if;

  -- S9: التأكيد اليدوي «الآن» لطلب تلقائي يعمل كالمعتاد (قبل الموعد)
  perform pg_temp.seed_notifs(2);
  js := public.data_retention_policy_set('notifications', true, 1, false, false, 30);
  js := public.data_retention_scan_now();
  select id into rid from public.data_retention_requests where data_key = 'notifications' and status = 'pending';
  req := public.data_retention_confirm(rid);
  req := public.data_retention_delete_batch(rid, 100);
  if req ->> 'status' <> 'done' or pg_temp.old_left() <> 0 then raise exception 'S9'; end if;

  -- تنظيف
  js := public.data_retention_policy_set('notifications', false, 1, false, true, 7);
  delete from public.notifications where user_id in (it1, 'da000000-0000-0000-0000-000000000003');
  raise notice 'auto-delete ok';
end $$;
