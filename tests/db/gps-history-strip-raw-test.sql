-- 00327: نقاط GPS التاريخية تُفرَّغ من raw_data وتحتفظ بحالة المحرك؛ القرّاء يعرضونها
set client_min_messages = notice;
insert into auth.users (id, email) values ('e9100000-0000-0000-0000-000000000001', 'ops-hs@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('e9100000-0000-0000-0000-000000000001', 'ops_room') on conflict do nothing;
insert into public.gps_providers (id, name, type) values ('e910b000-0000-0000-0000-000000000001', 'HS provider', 'vendor_api') on conflict (id) do nothing;
insert into public.gps_devices (id, provider_id, external_id, name, online_status) values ('e910c000-0000-0000-0000-000000000001', 'e910b000-0000-0000-0000-000000000001', 'HS-1', 'جهاز HS1', 'online') on conflict (id) do nothing;
do $$
declare r record; big jsonb; n int;
begin
  big := jsonb_build_object('sensors', '[{"name":"ACC","value":"On"}]'::jsonb, 'services', repeat('x', 3000));
  insert into public.gps_device_position_history (device_id, latitude, longitude, speed, fix_time, raw_data)
    values ('e910c000-0000-0000-0000-000000000001', 33.31, 44.36, 0, now() - interval '2 hours', big),
           ('e910c000-0000-0000-0000-000000000001', 33.32, 44.37, 25, now() - interval '1 hour', jsonb_build_object('sensors_data', '[{"key":"ignition","val":"off"}]'::jsonb)),
           ('e910c000-0000-0000-0000-000000000001', 33.33, 44.38, 0, now() - interval '30 minutes', '{}'::jsonb);
  -- H1: raw_data مفرَّغ دائماً وحالة المحرك محسوبة
  select count(*) into n from public.gps_device_position_history where device_id = 'e910c000-0000-0000-0000-000000000001' and raw_data <> '{}'::jsonb;
  if n <> 0 then raise exception 'H1 raw kept %', n; end if;
  select engine_status into r from public.gps_device_position_history where device_id = 'e910c000-0000-0000-0000-000000000001' and speed = 0 and latitude = 33.31;
  if r.engine_status <> 'on' then raise exception 'H1 engine on %', r.engine_status; end if;
  select engine_status into r from public.gps_device_position_history where device_id = 'e910c000-0000-0000-0000-000000000001' and speed = 25;
  if r.engine_status <> 'off' then raise exception 'H1 engine off %', r.engine_status; end if;
  -- H2: تحديث raw_data لاحقاً يُفرَّغ أيضاً
  update public.gps_device_position_history set raw_data = big where device_id = 'e910c000-0000-0000-0000-000000000001' and latitude = 33.33;
  select raw_data, engine_status into r from public.gps_device_position_history where device_id = 'e910c000-0000-0000-0000-000000000001' and latitude = 33.33;
  if r.raw_data <> '{}'::jsonb or r.engine_status <> 'on' then raise exception 'H2 %', r; end if;
  -- H3: القرّاء يعرضون حالة المحرك والحالة التشغيلية من العمود
  perform set_config('auth.user_id', 'e9100000-0000-0000-0000-000000000001', false);
  select count(*) filter (where engine_status = 'on' and operational_status = 'idle') as idle,
         count(*) filter (where engine_status = 'off' and operational_status = 'moving') as moving into r
    from public.gps_lvn_route_window('e910c000-0000-0000-0000-000000000001', now() - interval '3 hours', now());
  if r.idle <> 2 or r.moving <> 1 then raise exception 'H3 window %', r; end if;
  select count(*) filter (where operational_status = 'idle') as idle into r from public.gps_lvn_route('e910c000-0000-0000-0000-000000000001', (now() at time zone 'Asia/Baghdad')::date);
  if r.idle < 1 then raise exception 'H3 route %', r; end if;
  raise notice 'gps history strip raw ok';
end $$;
