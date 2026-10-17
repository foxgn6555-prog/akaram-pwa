-- اختبار 00244: لوحة الحالة الحية — IT فقط؛ تعيد القاعدة والبصمة (لكل مصدر) وGPS بلا كتابة
set client_min_messages = notice;
insert into auth.users (id, email) values ('ec244000-0000-0000-0000-000000000001', 'ds-it@t.iq'), ('ec244000-0000-0000-0000-000000000002', 'ds-ops@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('ec244000-0000-0000-0000-000000000001', 'it_admin'), ('ec244000-0000-0000-0000-000000000002', 'ops_room') on conflict do nothing;
insert into public.biometric_devices (id, serial_number, name, timezone_offset, is_active, mode)
values ('dd244000-0000-0000-0000-0000000000d1', 'DS-DEV-1', 'جهاز الحالة', '+03:00', true, 'adms_push') on conflict (serial_number) do nothing;
insert into public.biometric_punches (device_serial, pin, punched_at, direction, method) values
  ('DS-DEV-1', '9901', now() - interval '5 minutes', 'in', 'adms_push'),
  ('DS-DEV-1', '9902', now() - interval '3 days', 'in', 'adms_push');
insert into public.biometric_pulls (device_id, mode, status, received, inserted, error, finished_at)
values ('dd244000-0000-0000-0000-0000000000d1', 'adms_push', 'failed', 0, 0, 'BIO_SOURCE_UNREACHABLE', now());

select auth.set_test_user('ec244000-0000-0000-0000-000000000002');
do $$ begin
  begin perform public.devops_status(); raise exception 'FAIL: ops_room must not read devops_status';
  exception when others then if sqlerrm not like '%IT_FORBIDDEN%' then raise; end if; end;
end $$;

select auth.set_test_user('ec244000-0000-0000-0000-000000000001');
do $$ declare j jsonb; d jsonb; begin
  j := public.devops_status();
  assert (j -> 'database' ->> 'now') is not null and (j -> 'database' ->> 'version') like 'PostgreSQL%', 'database block: ' || (j -> 'database')::text;
  assert (j -> 'database' ->> 'tables_count')::int > 50 and (j -> 'database' ->> 'functions_count')::int > 50, 'counts';
  assert jsonb_typeof(j -> 'database' -> 'rls_disabled_tables') = 'array', 'rls list';
  assert (j -> 'biometric' ->> 'punches_today')::int >= 1 and (j -> 'biometric' ->> 'unmatched_today')::int >= 1, 'today counters: ' || (j -> 'biometric')::text;
  assert (j -> 'biometric' ->> 'failed_pulls_24h')::int >= 1, 'failed pulls';
  select x into d from jsonb_array_elements(j -> 'biometric' -> 'devices') x where x ->> 'serial' = 'DS-DEV-1';
  assert d is not null, 'device row missing';
  assert (d ->> 'punches_today')::int = 1 and (d ->> 'last_punch_at')::timestamptz > now() - interval '10 minutes', 'device punches: ' || d::text;
  assert d -> 'last_pull' ->> 'status' = 'failed' and d -> 'last_pull' ->> 'error' = 'BIO_SOURCE_UNREACHABLE', 'device last pull: ' || d::text;
  assert (d ->> 'queued_commands')::int >= 0, 'queued commands';
  assert j -> 'gps' ? 'last_fix_at' and j -> 'gps' ? 'vehicles_10m', 'gps block';
  assert (j -> 'auth' ->> 'users_total')::int >= 2, 'auth block';
  assert j::text not ilike '%service_role%' and j::text not ilike '%secret%', 'no secrets';
end $$;
do $$ begin raise notice 'devops-status-test OK'; end $$;
