do $$declare ops uuid:='92000000-0000-0000-0000-000000000001';employee uuid:='92000000-0000-0000-0000-000000000002';dep uuid;n bigint;expected integer;begin
 execute'reset role';select gd.id into dep from public.garage_departures gd join public.gps_vehicle_bindings b on b.garage_vehicle_id=gd.vehicle_id join public.gps_devices d on d.id=b.device_id where d.external_id='101'order by gd.departed_at desc limit 1;
 select greatest(1,ceil(extract(epoch from(coalesce(returned_at,now())-departed_at))/259200.0)::integer)into expected from public.garage_departures where id=dep;
 perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',ops::text,false);
 select count(*)into n from public.gps_trip_history_windows(dep);if n<>expected then raise exception'GPS_HISTORY_WINDOWS_COUNT_FAIL % %',n,expected;end if;
 if exists(select 1 from public.gps_trip_history_windows(dep)where range_to<=range_from or window_index<0 or status not in('pending','running','success','partial','failed'))then raise exception'GPS_HISTORY_WINDOWS_SHAPE_FAIL';end if;
 perform set_config('request.jwt.claim.sub',employee::text,false);begin perform public.gps_trip_history_windows(dep);raise exception'GPS_HISTORY_WINDOWS_EMPLOYEE_ACCEPTED';exception when others then if sqlerrm='GPS_HISTORY_WINDOWS_EMPLOYEE_ACCEPTED'then raise;end if;if sqlerrm not like'%GPS_FORBIDDEN%'then raise;end if;end;
 raise notice'✅ GPS الجولة 13: تقدم النوافذ/الحالات/الحدود/العزل ناجح';end$$;
