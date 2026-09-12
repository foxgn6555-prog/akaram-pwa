do $$declare ops uuid:='92000000-0000-0000-0000-000000000001';employee uuid:='92000000-0000-0000-0000-000000000002';gid uuid;vid uuid;zid uuid;aid uuid;n bigint;begin
 select d.id,b.garage_vehicle_id into gid,vid from public.gps_devices d join public.gps_vehicle_bindings b on b.device_id=d.id where d.external_id='101';
 perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',ops::text,false);
 zid:=public.gps_platform_geofence_save(null,'زون دورة الاختبار','[{"lat":33.30,"lng":44.35},{"lat":33.30,"lng":44.37},{"lat":33.32,"lng":44.37},{"lat":33.32,"lng":44.35}]','#06b6d4');
 perform public.gps_assign_vehicle_geofence(vid,zid);
 begin perform public.gps_platform_geofence_save(null,'x','[{"lat":33,"lng":44}]','#bad');raise exception'GPS_BAD_ZONE_ACCEPTED';exception when others then if sqlerrm='GPS_BAD_ZONE_ACCEPTED'then raise;end if;if sqlerrm not like'%GPS_ZONE_NAME_INVALID%'then raise;end if;end;
 execute'reset role';perform set_config('role','service_role',false);perform set_config('request.jwt.claims','{"role":"service_role"}',false);
 update public.gps_device_positions set latitude=33.31,longitude=44.36,fix_time=now()where device_id=gid;perform public.gps_evaluate_zone_transitions();
 update public.gps_device_positions set latitude=33.50,longitude=44.60,fix_time=now()+interval'1 minute'where device_id=gid;perform public.gps_evaluate_zone_transitions();
 select count(*)into n from public.gps_zone_events where device_id=gid and geofence_id=zid and event_type='exit';if n<>1 then raise exception'GPS_ZONE_EXIT_EVENT_FAIL';end if;
 insert into public.gps_operational_alerts(device_id,garage_vehicle_id,alert_type,severity,title,details)values(gid,vid,'gps_stale','warning','اختبار معالجة التنبيه','{}')returning id into aid;
 execute'reset role';perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',ops::text,false);
 perform public.gps_alert_acknowledge(aid);select count(*)into n from public.gps_lvn_open_alerts(100)where id=aid and acknowledged_at is not null;if n<>1 then raise exception'GPS_ALERT_ACK_FAIL';end if;
 begin perform public.gps_alert_resolve(aid,'');raise exception'GPS_ALERT_EMPTY_RESOLUTION_ACCEPTED';exception when others then if sqlerrm='GPS_ALERT_EMPTY_RESOLUTION_ACCEPTED'then raise;end if;if sqlerrm not like'%GPS_ALERT_RESOLUTION_NOTE_REQUIRED%'then raise;end if;end;
 perform public.gps_alert_resolve(aid,'تم الاتصال بالميدان والتحقق من الجهاز');select count(*)into n from public.gps_operational_alerts where id=aid and resolved_by=ops and resolution_note is not null;if n<>1 then raise exception'GPS_ALERT_RESOLVE_FAIL';end if;
 select count(*)into n from public.gps_zone_events_list(now()-interval'1 day',now()+interval'1 day',vid,zid,100,0)where event_type='exit';if n<>1 then raise exception'GPS_ZONE_EVENTS_RPC_FAIL';end if;
 perform public.gps_platform_geofence_archive(zid);select count(*)into n from public.gps_geofences where id=zid and not is_active;if n<>1 then raise exception'GPS_ZONE_ARCHIVE_FAIL';end if;
 perform set_config('request.jwt.claim.sub',employee::text,false);begin perform public.gps_platform_geofence_save(null,'زون ممنوع','[{"lat":33,"lng":44},{"lat":34,"lng":44},{"lat":34,"lng":45}]','#06b6d4');raise exception'GPS_ZONE_EMPLOYEE_ACCEPTED';exception when others then if sqlerrm='GPS_ZONE_EMPLOYEE_ACCEPTED'then raise;end if;if sqlerrm not like'%GPS_FORBIDDEN%'then raise;end if;end;
 raise notice'✅ GPS الزونات والتنبيهات: إنشاء/تحقق/انتقال/سجل/إقرار/معالجة/أرشفة/عزل ناجحة';end$$;
