-- 00332 (00386-أ): المحرّك القديم أُزيل بالكامل بلا أثر — جداول/دوال/مجدولات/سياسات — مع حدث إثبات، والخلف سليم، ومسارات الانطلاقيات لم تُمسّ
do $$
declare n int; js jsonb;
begin
  -- R1: لا جداول ولا دوال باسم المحرّك القديم أو صفحة التنظيف
  if to_regclass('public.gps_stop_events') is not null or to_regclass('public.gps_stop_scan_state') is not null or to_regclass('public.gps_stop_hotspot_settings') is not null or to_regclass('public.dev_cleanup_runs') is not null then raise exception 'R1 tables remain'; end if;
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname in ('public', 'app') and (p.proname like 'gps\_stop\_%' or p.proname like 'dev\_cleanup\_%');
  if n <> 0 then raise exception 'R1 functions remain: %', n; end if;
  select count(*) into n from pg_policies where policyname like 'dev-cleanup:%'; if n <> 0 then raise exception 'R1 policies remain'; end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $q$select count(*) from cron.job where jobname in ('gps_stop_hotspots_refresh', 'gps_stop_events_weekly_purge', 'gps_stop_events_daily_purge')$q$ into n;
    if n <> 0 then raise exception 'R1 cron remain'; end if;
  end if;
  -- R2: الكتالوجان لا يذكرانها
  if exists (select 1 from app.data_retention_catalog() where table_name in ('gps_stop_events', 'gps_stop_scan_state', 'gps_stop_hotspot_settings', 'dev_cleanup_runs')) then raise exception 'R2 retention catalog'; end if;
  if exists (select 1 from public.permission_units where key = 'it.dev-cleanup') then raise exception 'R2 permission catalog'; end if;
  -- R3: حدث الإثبات في سجل الاحتفاظ
  select details into js from public.data_retention_events where action = 'engine_retired' and data_key = 'gps_stop_events' order by id desc limit 1;
  if js is null or js ->> 'successor' is null or jsonb_array_length(js -> 'dropped_tables') <> 4 then raise exception 'R3 proof %', js; end if;
  -- R4: الخلف والجيران سليمون
  if to_regclass('public.gps_hotspots') is null or to_regclass('public.gps_hotspots_month_stats') is null or to_regclass('public.gps_warehouse_link') is null then raise exception 'R4 successor'; end if;
  if to_regclass('public.trip_routes') is null or to_regclass('public.trip_route_points') is null or to_regclass('public.trip_route_stops') is null or to_regclass('public.gps_geofences') is null then raise exception 'R4 neighbours'; end if;
  if to_regprocedure('public.gps_hotspots_list(date, text[], text[], int, int[])') is null or to_regprocedure('public.space_overview()') is null then raise exception 'R4 fns'; end if;
  -- R5: المدير المفوض والنائب يقرآن قائمة البقع؛ الموظف ممنوع
  insert into auth.users (id, email) values ('e9110000-0000-0000-0000-000000000001', 'exec-r5@t.iq'), ('e9110000-0000-0000-0000-000000000002', 'dep-r5@t.iq'), ('e9110000-0000-0000-0000-000000000003', 'emp-r5@t.iq') on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values ('e9110000-0000-0000-0000-000000000001', 'executive_director'), ('e9110000-0000-0000-0000-000000000002', 'deputy_director'), ('e9110000-0000-0000-0000-000000000003', 'employee') on conflict do nothing;
  perform set_config('auth.user_id', 'e9110000-0000-0000-0000-000000000001', false), set_config('auth.role', '', false);
  if (public.gps_hotspots_list() ->> 'total') is null or public.gps_hotspots_month_stats() is null then raise exception 'R5 executive'; end if;
  perform set_config('auth.user_id', 'e9110000-0000-0000-0000-000000000002', false);
  if (public.gps_hotspots_list() ->> 'total') is null or public.gps_hotspots_month_stats() is null then raise exception 'R5 deputy'; end if;
  perform set_config('auth.user_id', 'e9110000-0000-0000-0000-000000000003', false);
  begin perform public.gps_hotspots_list(); raise exception 'R5 employee allowed'; exception when others then if sqlerrm not like '%GPS_FORBIDDEN%' then raise; end if; end;
  perform set_config('auth.user_id', '', false);
  raise notice 'gps stop engine retired ok';
end $$;
