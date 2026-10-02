-- اختبار 00166: Console — التبليغ من أي مستخدم، التجميع بالبصمة، الخلاصة/الإحصاء/الحل لـ IT فقط،
-- حذف FlowBridge، وتنظيف اسم المنصة. مستقل (بادئة cc).
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('cc000000-0000-0000-0000-000000000001', 'it-c@t.iq'), ('cc000000-0000-0000-0000-000000000002', 'media-c@t.iq'),
  ('cc000000-0000-0000-0000-000000000003', 'hr-c@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('cc000000-0000-0000-0000-000000000001', 'it_admin'), ('cc000000-0000-0000-0000-000000000002', 'media_officer'),
  ('cc000000-0000-0000-0000-000000000003', 'hr_officer')
on conflict do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', coalesce(p::text, ''), false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

-- ═══ T1 · FlowBridge حُذف بالكامل، والأعمدة الجديدة موجودة ═══
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name in ('flowbridge_state', 'flowbridge_events', 'flowbridge_event_bindings')) then
    raise exception 'flowbridge tables still exist';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app' and p.proname like 'flowbridge%') then
    raise exception 'flowbridge functions still exist';
  end if;
  if exists (select 1 from pg_trigger where tgname like '%flowbridge%') then raise exception 'flowbridge triggers still exist'; end if;
  if exists (select 1 from public.role_page_permissions where page_key = 'it.flowbridge') then raise exception 'it.flowbridge permission rows remain'; end if;
  perform 1 from information_schema.columns where table_name = 'app_errors' and column_name in ('level', 'source', 'portal', 'kind', 'fingerprint', 'occurrences', 'last_seen_at', 'resolved_at', 'resolution_note')
  having count(*) = 9;
  if not found then raise exception 'app_errors new columns missing'; end if;
  raise notice 'T1 OK';
end $$;

-- ═══ T2 · التبليغ: مجهول مرفوض، دفعة فارغة/كبيرة مرفوضة، الإعلام يبلّغ ويُجمَّع بالبصمة ═══
do $$
declare m uuid := 'cc000000-0000-0000-0000-000000000002'; n int; r public.app_errors; ev jsonb;
begin
  perform pg_temp.as_user(null);
  perform pg_temp.expect_error($q$select public.console_report('[{"message":"x"}]'::jsonb)$q$, 'CONSOLE_FORBIDDEN');
  perform pg_temp.as_user(m);
  perform pg_temp.expect_error($q$select public.console_report('[]'::jsonb)$q$, 'CONSOLE_EVENTS_INVALID');
  perform pg_temp.expect_error($q$select public.console_report('{"a":1}'::jsonb)$q$, 'CONSOLE_EVENTS_INVALID');
  select jsonb_agg(jsonb_build_object('message', 'm' || g)) into ev from generate_series(1, 51) g;
  perform pg_temp.expect_error(format('select public.console_report(%L::jsonb)', ev::text), 'CONSOLE_BATCH_TOO_LARGE');

  ev := jsonb_build_array(
    jsonb_build_object('message', 'Cannot read properties of undefined (reading ''photos'')', 'stack', 'TypeError at MediaDesigns', 'url', 'https://app/media/designs/4',
                       'level', 'error', 'source', 'boundary', 'kind', 'null_access', 'portal', 'media', 'fingerprint', 'fp-media-1', 'count', 2, 'error_type', 'runtime',
                       'context', jsonb_build_object('title', 'وصول فارغ')),
    jsonb_build_object('message', 'Warning: duplicate key', 'level', 'warn', 'source', 'console', 'kind', 'react_warning', 'portal', 'media', 'fingerprint', 'fp-media-w'),
    jsonb_build_object('message', '   ')  -- فارغة: تُتجاهل بصمت
  );
  n := public.console_report(ev);
  if n <> 2 then raise exception 'expected 2 accepted, got %', n; end if;
  select * into r from public.app_errors where fingerprint = 'fp-media-1';
  if r.occurrences <> 2 or r.portal <> 'media' or r.kind <> 'null_access' or r.level <> 'error' or r.source <> 'boundary' or r.user_id <> m then
    raise exception 'row wrong: %', r;
  end if;
  -- نفس البصمة ثانية: لا صف جديد، التكرار يزيد
  n := public.console_report(jsonb_build_array(jsonb_build_object('message', 'Cannot read properties of undefined (reading ''photos'')', 'fingerprint', 'fp-media-1', 'kind', 'null_access', 'portal', 'media', 'count', 3)));
  if (select count(*) from public.app_errors where fingerprint = 'fp-media-1') <> 1 then raise exception 'dedupe failed'; end if;
  if (select occurrences from public.app_errors where fingerprint = 'fp-media-1') <> 5 then raise exception 'occurrences should be 5'; end if;
  -- قيم غير معروفة تُطبَّع
  n := public.console_report(jsonb_build_array(jsonb_build_object('message', 'odd', 'level', 'fatal', 'source', 'alien', 'error_type', 'weird', 'fingerprint', 'fp-odd')));
  select * into r from public.app_errors where fingerprint = 'fp-odd';
  if r.level <> 'error' or r.source <> 'logger' or r.error_type <> 'runtime' or r.kind <> 'unknown' or r.portal <> 'unknown' then raise exception 'normalization wrong: %', r; end if;
  -- بلا بصمة: تُشتق من المحتوى (ثابتة)
  n := public.console_report(jsonb_build_array(jsonb_build_object('message', 'no fp here', 'kind', 'unknown', 'portal', 'hr')));
  n := public.console_report(jsonb_build_array(jsonb_build_object('message', 'no fp here', 'kind', 'unknown', 'portal', 'hr')));
  if (select count(*) from public.app_errors where message = 'no fp here') <> 1 then raise exception 'derived fingerprint not stable'; end if;
  raise notice 'T2 OK';
end $$;

-- ═══ T3 · الخلاصة والإحصاء: IT يرى كل شيء مع الفلاتر، غير IT لا يرى شيئاً ═══
do $$
declare it uuid := 'cc000000-0000-0000-0000-000000000001'; h uuid := 'cc000000-0000-0000-0000-000000000003'; n int; st jsonb;
begin
  perform pg_temp.as_user(h);
  select count(*) into n from public.console_feed(); if n <> 0 then raise exception 'hr must see nothing, saw %', n; end if;
  if public.console_stats() is not null then raise exception 'hr stats must be null'; end if;
  perform pg_temp.as_user(it);
  select count(*) into n from public.console_feed(p_portal => 'media'); if n <> 2 then raise exception 'media feed expected 2 got %', n; end if;
  select count(*) into n from public.console_feed(p_level => 'warn'); if n < 1 then raise exception 'warn feed empty'; end if;
  select count(*) into n from public.console_feed(p_level => 'warn', p_portal => 'media'); if n <> 1 then raise exception 'warn+media expected 1 got %', n; end if;
  select count(*) into n from public.console_feed(p_kind => 'null_access'); if n <> 1 then raise exception 'kind filter expected 1 got %', n; end if;
  select count(*) into n from public.console_feed(p_q => 'photos'); if n <> 1 then raise exception 'search expected 1 got %', n; end if;
  select count(*) into n from public.console_feed(p_q => 'media/designs'); if n <> 1 then raise exception 'url search expected 1 got %', n; end if;
  select count(*) into n from public.console_feed(p_since => now() + interval '1 hour'); if n <> 0 then raise exception 'since future must be empty'; end if;
  select count(*) into n from public.console_feed(p_limit => 1); if n <> 1 then raise exception 'limit ignored'; end if;
  st := public.console_stats();
  if (st->>'open_errors')::int < 5 then raise exception 'open_errors should count occurrences, got %', st; end if;
  if (st->>'open_warnings')::int < 1 then raise exception 'open_warnings wrong: %', st; end if;
  if (st->'by_portal'->>'media')::int <> 6 then raise exception 'by_portal media expected 6 got %', st->'by_portal'; end if;
  if (st->'by_kind'->>'null_access')::int <> 5 then raise exception 'by_kind wrong: %', st->'by_kind'; end if;
  if (st->>'affected_users')::int < 1 then raise exception 'affected_users wrong'; end if;
  raise notice 'T3 OK';
end $$;

-- ═══ T4 · الحل: IT فقط، مع ملاحظة، إعادة فتح، وغير موجود؛ والمحلول لا يُجمَّع عليه ═══
do $$
declare it uuid := 'cc000000-0000-0000-0000-000000000001'; m uuid := 'cc000000-0000-0000-0000-000000000002';
  vid bigint; r public.app_errors; n int;
begin
  select id into vid from public.app_errors where fingerprint = 'fp-media-1';
  perform pg_temp.as_user(m);
  perform pg_temp.expect_error(format('select public.console_resolve(%s, true, ''x'')', vid), 'CONSOLE_FORBIDDEN');
  perform pg_temp.as_user(it);
  perform pg_temp.expect_error('select public.console_resolve(999999999, true, null)', 'CONSOLE_EVENT_NOT_FOUND');
  r := public.console_resolve(vid, true, '  أُضيف حارس للصور  ');
  if not r.resolved or r.resolved_by <> it or r.resolved_at is null or r.resolution_note <> 'أُضيف حارس للصور' then raise exception 'resolve wrong: %', r; end if;
  select count(*) into n from public.console_feed(); if exists (select 1 from public.console_feed() f where f.id = vid) then raise exception 'resolved must not appear in open feed'; end if;
  if not exists (select 1 from public.console_feed(p_resolved => true) f where f.id = vid) then raise exception 'resolved feed missing row'; end if;
  if not exists (select 1 from public.console_feed(p_resolved => null) f where f.id = vid) then raise exception 'all feed missing row'; end if;
  if (public.console_stats()->>'resolved')::int < 1 then raise exception 'stats.resolved wrong'; end if;
  -- نفس البصمة بعد الحل → صف جديد مفتوح (الانحدار يظهر من جديد)
  perform pg_temp.as_user(m);
  perform public.console_report(jsonb_build_array(jsonb_build_object('message', 'Cannot read properties of undefined (reading ''photos'')', 'fingerprint', 'fp-media-1', 'kind', 'null_access', 'portal', 'media')));
  if (select count(*) from public.app_errors where fingerprint = 'fp-media-1') <> 2 then raise exception 'regression after resolve must open new row'; end if;
  perform pg_temp.as_user(it);
  r := public.console_resolve(vid, false, null);
  if r.resolved or r.resolved_at is not null or r.resolution_note is not null then raise exception 'reopen wrong: %', r; end if;
  raise notice 'T4 OK';
end $$;

-- ═══ T5 · حد المعدل: 120 حدثاً/ساعة للمستخدم ثم صمت (يعيد 0 ولا يرمي) ═══
do $$
declare h uuid := 'cc000000-0000-0000-0000-000000000003'; ev jsonb; n int; total int := 0;
begin
  perform pg_temp.as_user(h);
  for i in 1..3 loop
    select jsonb_agg(jsonb_build_object('message', 'flood ' || i || '-' || g, 'fingerprint', 'fl-' || i || '-' || g)) into ev from generate_series(1, 50) g;
    n := public.console_report(ev); total := total + n;
  end loop;
  if total <> 150 then raise exception 'expected 150 accepted before limit check (limit is evaluated per batch), got %', total; end if;
  n := public.console_report(jsonb_build_array(jsonb_build_object('message', 'one more', 'fingerprint', 'fl-x')));
  if n <> 0 then raise exception 'rate limit should silence, got %', n; end if;
  if exists (select 1 from public.app_errors where fingerprint = 'fl-x') then raise exception 'rate-limited event stored'; end if;
  raise notice 'T5 OK';
end $$;

-- ═══ T6 · البث الحي: app_errors ضمن publication (إن وُجدت) ═══
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'app_errors') then
    raise exception 'app_errors not in supabase_realtime';
  end if;
  raise notice 'T6 OK';
end $$;

select 'CONSOLE TESTS PASSED' as result;
