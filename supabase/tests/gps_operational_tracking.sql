do $$declare ops uuid:='92000000-0000-0000-0000-000000000001';gid uuid;vid uuid;pid uuid;zid uuid;dep uuid;n bigint;status text;begin
 select d.id,d.provider_id,b.garage_vehicle_id into gid,pid,vid from public.gps_devices d join public.gps_vehicle_bindings b on b.device_id=d.id where d.external_id='101';
 perform set_config('role','service_role',false);
 update public.gps_devices set sensors='[{"name":"ACC","value":"ON"}]' where id=gid;
 update public.gps_device_positions set speed=0,latitude=33.31,longitude=44.36,fix_time=now() where device_id=gid;
 insert into public.gps_device_position_history(device_id,latitude,longitude,speed,fix_time,raw_data)values(gid,33.31,44.36,0,now(),'{"sensors":[{"name":"ACC","value":"ON"}]}');
 insert into public.gps_geofences(provider_id,external_id,name,source,polygon)values(pid,'test-zone','منطقة الاختبار','platform','[{"lat":33.30,"lng":44.35},{"lat":33.30,"lng":44.37},{"lat":33.32,"lng":44.37},{"lat":33.32,"lng":44.35}]')returning id into zid;
 insert into public.garage_departures(vehicle_id,driver_name,shift,sector_id,departed_by)values(vid,'سائق GPS','morning',1,ops)returning id into dep;
 execute'reset role';perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',ops::text,false);
 perform public.gps_assign_vehicle_geofence(vid,zid);select count(*)into n from public.gps_lvn_geofences(vid)where is_assigned;if n<>1 then raise exception'GPS_ZONE_ASSIGNMENT_LIST_FAIL';end if;
 select operational_status into status from public.gps_lvn_devices_v2(null,null,'idle',null,null,null,null,'active','inside',50,0)where id=gid;
 if status<>'idle'then raise exception'GPS_IDLE_ENGINE_STATUS_FAIL';end if;
 select count(*)into n from public.gps_lvn_route(gid,(now()at time zone'Asia/Baghdad')::date);if n<1 then raise exception'GPS_ROUTE_HISTORY_FAIL';end if;
 select count(*)into n from public.gps_lvn_trip_history((now()at time zone'Asia/Baghdad')::date,(now()at time zone'Asia/Baghdad')::date)where departure_id=dep and gps_points>0;if n<>1 then raise exception'GPS_TRIP_CORRELATION_FAIL';end if;
 perform set_config('request.jwt.claim.sub','92000000-0000-0000-0000-000000000002',false);begin perform public.gps_lvn_route(gid,current_date);raise exception'GPS_ROUTE_EMPLOYEE_ACCEPTED';exception when others then if sqlerrm='GPS_ROUTE_EMPLOYEE_ACCEPTED'then raise;end if;if sqlerrm not like'%GPS_FORBIDDEN%'then raise;end if;end;
 raise notice'✅ GPS تشغيلي: المحرك/الألوان/الانطلاقة/الزون/المسار التاريخي/العزل ناجحة';end$$;
