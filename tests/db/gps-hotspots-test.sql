-- 00329 (00383): نسخة بقع التوقف في المشروع الأول — الاستبدال على دفعات للخدمة فقط، القراءة لغرفة العمليات/IT فقط، الفلاتر، الحذف خارج النافذة
set client_min_messages = notice;
insert into auth.users (id, email) values ('e9100000-0000-0000-0000-000000000001', 'it-hs@t.iq'), ('e9100000-0000-0000-0000-000000000002', 'hr-hs@t.iq'), ('e9100000-0000-0000-0000-000000000003', 'ops-hs@t.iq'), ('e9100000-0000-0000-0000-000000000004', 'emp-hs@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('e9100000-0000-0000-0000-000000000001', 'it_admin'), ('e9100000-0000-0000-0000-000000000002', 'hr_officer'), ('e9100000-0000-0000-0000-000000000003', 'ops_room'), ('e9100000-0000-0000-0000-000000000004', 'employee') on conflict do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false), set_config('auth.role', '', false) $$;
create or replace function pg_temp.as_service() returns void language sql as $$ select set_config('auth.user_id', '', false), set_config('auth.role', 'service_role', false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if position(p_code in msg) = 0 then raise exception 'WRONG_ERROR: got % wanted %', msg, p_code; end if;
end $$;
do $$
declare js jsonb; m date := '2026-09-01'; prev date := '2026-08-01'; n int;
  row1 jsonb := jsonb_build_object('id', 11, 'lat', 33.3, 'lng', 44.4, 'stops_count', 5, 'days_count', 4, 'vehicles_count', 2, 'total_minutes', 172, 'avg_minutes', 34, 'max_minutes', 90,
    'light_count', 2, 'medium_count', 2, 'heavy_count', 1, 'dominant_class', 'medium', 'recurrence', 'recurring', 'first_at', '2026-09-03T05:00:00Z', 'last_at', '2026-09-10T05:12:00Z',
    'sector_ids', '[1,2]'::jsonb, 'sector_names', '["قاطع أ","قاطع ب"]'::jsonb, 'vehicles', '[{"device":"d-1"},{"device":"d-2"}]'::jsonb, 'days', '["2026-09-03","2026-09-04"]'::jsonb, 'hours', (select jsonb_agg(0) from generate_series(1, 24)));
  row2 jsonb := jsonb_build_object('id', 12, 'lat', 33.31, 'lng', 44.41, 'stops_count', 1, 'days_count', 1, 'vehicles_count', 1, 'total_minutes', 15, 'avg_minutes', 15, 'max_minutes', 15,
    'light_count', 1, 'dominant_class', 'light', 'recurrence', 'once', 'sector_ids', '[1]'::jsonb);
  row3 jsonb := jsonb_build_object('id', 13, 'lat', 33.32, 'lng', 44.42, 'stops_count', 12, 'days_count', 11, 'vehicles_count', 1, 'total_minutes', 900, 'avg_minutes', 75, 'max_minutes', 100,
    'heavy_count', 12, 'dominant_class', 'heavy', 'recurrence', 'frequent', 'sector_ids', '[3]'::jsonb);
begin
  -- G1: المستخدم العادي لا يستطيع الاستبدال؛ الخدمة تستطيع على دفعتين
  perform pg_temp.as_user('e9100000-0000-0000-0000-000000000001');
  perform pg_temp.expect_error(format('select public.gps_hotspots_replace_month(%L, ''[]''::jsonb)', m), 'GPS_FORBIDDEN');
  perform pg_temp.as_service();
  js := public.gps_hotspots_replace_month(m, jsonb_build_array(row1, row2), true, false);
  if (js ->> 'inserted')::int <> 2 or (js ->> 'total')::int <> 2 or exists (select 1 from public.gps_hotspots_sync where month = m) then raise exception 'G1 first %', js; end if;
  js := public.gps_hotspots_replace_month(m, jsonb_build_array(row3), false, true, '{"hotspot_radius_m":80}'::jsonb);
  if (js ->> 'total')::int <> 3 or (select rows_count from public.gps_hotspots_sync where month = m) <> 3 or (select thresholds ->> 'hotspot_radius_m' from public.gps_hotspots_sync where month = m) <> '80' then raise exception 'G1 final %', js; end if;
  select * into n from (select cardinality(hours) from public.gps_hotspots where month = m and wh_id = 11) x; if n <> 24 then raise exception 'G1 hours'; end if;
  -- إعادة النسخ تستبدل الشهر كلّه (لا تراكم)
  js := public.gps_hotspots_replace_month(m, jsonb_build_array(row1, row2, row3), true, true);
  if (select count(*) from public.gps_hotspots where month = m) <> 3 then raise exception 'G1 replace'; end if;
  perform public.gps_hotspots_replace_month(prev, jsonb_build_array(row2), true, true);
  -- G2: القراءة: HR والموظف ممنوعان (RPC + RLS)؛ العمليات وIT يقرآن
  perform pg_temp.as_user('e9100000-0000-0000-0000-000000000002');
  perform pg_temp.expect_error('select public.gps_hotspots_list()', 'GPS_FORBIDDEN');
  perform pg_temp.as_user('e9100000-0000-0000-0000-000000000004');
  perform pg_temp.expect_error('select public.gps_hotspots_list()', 'GPS_FORBIDDEN');
  set role authenticated;
  if (select count(*) from public.gps_hotspots) <> 0 or (select count(*) from public.gps_hotspots_sync) <> 0 then raise exception 'G2 rls employee'; end if;
  reset role;
  if has_table_privilege('authenticated', 'public.gps_hotspots', 'insert') or has_function_privilege('authenticated', 'public.gps_hotspots_replace_month(date, jsonb, boolean, boolean, jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.gps_hotspots_prune(date[])', 'execute') then raise exception 'G2 grants'; end if;
  perform pg_temp.as_user('e9100000-0000-0000-0000-000000000003');
  js := public.gps_hotspots_list(m);
  -- الافتراضي: الخفيفة مخفية ⇒ 2؛ الترتيب بالدقائق الكلية
  if (js ->> 'total')::int <> 2 or js -> 'rows' -> 0 ->> 'wh_id' <> '13' or js -> 'rows' -> 0 ? 'synced_at' or (js -> 'sync' ->> 'rows_count')::int <> 3 or jsonb_array_length(js -> 'months') <> 2 or js -> 'months' -> 0 ->> 'month' <> '2026-09' then raise exception 'G2 list %', js; end if;
  if (public.gps_hotspots_list(m, null) ->> 'total')::int <> 3 then raise exception 'G2 all classes'; end if;
  if (public.gps_hotspots_list(m, array['light']) ->> 'total')::int <> 1 then raise exception 'G2 light'; end if;
  if (public.gps_hotspots_list(m, null, array['frequent']) ->> 'total')::int <> 1 then raise exception 'G2 recurrence'; end if;
  if (public.gps_hotspots_list(m, null, null, 2) ->> 'total')::int <> 1 or public.gps_hotspots_list(m, null, null, 2) -> 'rows' -> 0 ->> 'wh_id' <> '11' then raise exception 'G2 min vehicles'; end if;
  if (public.gps_hotspots_list(m, null, null, 1, array[2]) ->> 'total')::int <> 1 or (public.gps_hotspots_list(m, null, null, 1, array[1]) ->> 'total')::int <> 2 then raise exception 'G2 sectors'; end if;
  -- بلا شهر ⇒ آخر شهر منسوخ
  if public.gps_hotspots_list() ->> 'month' <> '2026-09' then raise exception 'G2 default month'; end if;
  perform pg_temp.as_user('e9100000-0000-0000-0000-000000000001');
  if (public.gps_hotspots_list(prev, null) ->> 'total')::int <> 1 then raise exception 'G2 it prev'; end if;
  -- G3: الحذف خارج النافذة (خدمة فقط) + تسجيل الربط
  perform pg_temp.expect_error(format('select public.gps_hotspots_prune(array[%L::date])', m), 'GPS_FORBIDDEN');
  perform pg_temp.as_service();
  n := public.gps_hotspots_prune(array[m]);
  if n <> 1 or exists (select 1 from public.gps_hotspots where month = prev) or exists (select 1 from public.gps_hotspots_sync where month = prev) then raise exception 'G3 prune %', n; end if;
  perform public.gps_warehouse_link_record('hotspots', true, jsonb_build_object('rows', 3, 'by_month', '{"2026-09": 3}'::jsonb));
  perform pg_temp.as_user('e9100000-0000-0000-0000-000000000001');
  js := public.gps_warehouse_link_get();
  if js ->> 'last_hotspots_sync_at' is null or (js ->> 'hotspots_rows')::int <> 3 or (js -> 'hotspots_by_month' ->> '2026-09')::int <> 3 or not (js ? 'hotspots_cron') or js -> 'hotspots_cron' ->> 'scheduled' is null then raise exception 'G3 link %', js; end if;
  -- G5 (00385): الإحصاء الشهري يبقى بعد الحذف خارج النافذة ويُقرأ للمقارنة
  js := public.gps_hotspots_month_stats();
  if jsonb_array_length(js) <> 2 or js -> 0 ->> 'month' <> '2026-09' or (js -> 0 ->> 'spots')::int <> 3 or (js -> 0 ->> 'stops')::int <> 18 or (js -> 0 ->> 'multi_vehicle')::int <> 1
     or (js -> 0 -> 'by_class' ->> 'heavy')::int <> 1 or (js -> 0 -> 'by_recurrence' ->> 'frequent')::int <> 1 or (js -> 1 ->> 'spots')::int <> 1 or js -> 0 -> 'by_sector' -> 0 ->> 'sector_id' <> '1' then raise exception 'G5 stats %', js; end if;
  perform pg_temp.as_user('e9100000-0000-0000-0000-000000000002');
  perform pg_temp.expect_error('select public.gps_hotspots_month_stats()', 'GPS_FORBIDDEN');
  perform pg_temp.as_user('e9100000-0000-0000-0000-000000000001');
  -- G4: الكتالوج يعرف الجداول كحالة مقفلة
  if (select count(*) from app.data_retention_catalog() where table_name in ('gps_hotspots', 'gps_hotspots_sync', 'gps_hotspots_month_stats') and deletable = false) <> 3 then raise exception 'G4 catalog'; end if;
  raise notice 'gps hotspots ok';
end $$;
