do $$declare ops uuid:='92000000-0000-0000-0000-000000000001';employee uuid:='92000000-0000-0000-0000-000000000002';dep uuid;device uuid;vehicle uuid;zone uuid;at_time timestamptz;inv uuid;n bigint;begin
 execute'reset role';select gd.id,b.device_id,gd.vehicle_id,gd.departed_at+interval'2 minutes'into dep,device,vehicle,at_time from public.garage_departures gd join public.gps_vehicle_bindings b on b.garage_vehicle_id=gd.vehicle_id where gd.returned_at is not null order by gd.departed_at desc limit 1;select id into zone from public.gps_geofences order by created_at limit 1;
 insert into public.gps_zone_events(device_id,geofence_id,garage_vehicle_id,departure_id,event_type,occurred_at,latitude,longitude)values(device,zone,vehicle,dep,'enter',at_time,33.3,44.3);
 perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',ops::text,false);
 select count(*)into n from public.gps_trip_zone_events(dep)where event_type='enter';if n<1 then raise exception'GPS_TRIP_ZONE_EVENTS_FAIL';end if;
 inv:=public.gps_trip_investigation_save(null,dep,'zone_enter',at_time,'التحقق من دخول الآلية إلى الزون التشغيلي','open',null);
 perform public.gps_trip_investigation_save(inv,dep,'zone_enter',at_time,'تمت مطابقة الحدث مع السائق والمسار','resolved',null);
 select count(*)into n from public.gps_trip_investigations_list(dep)where id=inv and status='resolved'and note='تمت مطابقة الحدث مع السائق والمسار';if n<>1 then raise exception'GPS_INVESTIGATION_SAVE_FAIL';end if;
 execute'reset role';select count(*)into n from public.audit_logs where table_name='gps_trip_investigations'and record_id=inv::text;if n<2 then raise exception'GPS_INVESTIGATION_AUDIT_FAIL';end if;
 perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',employee::text,false);begin perform public.gps_trip_investigations_list(dep);raise exception'GPS_INVESTIGATION_ISOLATION_ACCEPTED';exception when others then if sqlerrm='GPS_INVESTIGATION_ISOLATION_ACCEPTED'then raise;end if;if sqlerrm not like'%GPS_FORBIDDEN%'then raise;end if;end;
 raise notice'✅ الجولة 20: أحداث زونات الانطلاقية وملاحظات التحقيق والحالة والتدقيق والعزل ناجحة';end$$;
