do $$
declare ops uuid:='92000000-0000-0000-0000-000000000001';gid uuid;vid uuid;dep uuid;aid uuid;n bigint;begin
 execute'reset role';
 select d.id,b.garage_vehicle_id into gid,vid from public.gps_devices d join public.gps_vehicle_bindings b on b.device_id=d.id where d.external_id='101';
 select id into dep from public.garage_departures where vehicle_id=vid order by departed_at desc limit 1;
 update public.garage_departures set departed_at=now()-interval'1 hour' where id=dep;
 insert into public.gps_device_position_history(device_id,latitude,longitude,speed,fix_time,raw_data)values
 (gid,33.31,44.36,0,now()-interval'50 minutes','{}'),(gid,33.31,44.36,0,now()-interval'47 minutes','{}'),
 (gid,33.32,44.37,20,now()-interval'44 minutes','{}'),(gid,33.34,44.39,25,now()-interval'30 minutes','{}'),(gid,33.35,44.40,20,now()-interval'29 minutes','{}')on conflict do nothing;
 perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',ops::text,false);
 select count(*)into n from public.gps_trip_route_events(dep)where event_type='stop'and duration_seconds>=120;if n<1 then raise exception'GPS_STOP_EVENT_FAIL';end if;
 select count(*)into n from public.gps_trip_route_events(dep)where event_type='gap'and duration_seconds>=600;if n<1 then raise exception'GPS_GAP_EVENT_FAIL';end if;
 select count(*)into n from public.gps_trip_route_metrics_bulk(array[dep])where stop_count>=1 and gap_count>=1 and moving_seconds>0 and stopped_seconds>0;if n<>1 then raise exception'GPS_ROUTE_METRICS_FAIL';end if;
 select count(*)into n from public.gps_trip_route_events_bulk(array[dep],100)where event_type in('stop','gap');if n<2 then raise exception'GPS_ROUTE_EVENTS_BULK_FAIL';end if;
 execute'reset role';update public.gps_operational_alerts set resolved_at=now()where device_id=gid and alert_type='engine_idle'and resolved_at is null;
 insert into public.gps_operational_alerts(device_id,garage_vehicle_id,departure_id,alert_type,severity,title,details,opened_at)values(gid,vid,dep,'engine_idle','critical','اختبار تصعيد متعدد','{}',now()-interval'5 minutes')returning id into aid;
 update public.gps_alert_notification_policies set escalation_minutes=1,escalation_repeat_minutes=1,escalation_levels=3,recipient_roles=array['ops_room'],enabled=true where alert_type='engine_idle';
 perform set_config('role','service_role',false);perform set_config('request.jwt.claims','{"role":"service_role"}',false);perform public.notification_evaluate_gps_escalations();
 select count(*)into n from public.notifications where user_id=ops and entity_id=aid and dedupe_key like'gps_alert:%:escalation:%';if n<>3 then raise exception'GPS_MULTI_LEVEL_ESCALATION_FAIL %',n;end if;
 perform public.notification_evaluate_gps_escalations();select count(*)into n from public.notifications where user_id=ops and entity_id=aid and dedupe_key like'gps_alert:%:escalation:%';if n<>3 then raise exception'GPS_MULTI_LEVEL_DEDUPE_FAIL';end if;
 raise notice'✅ GPS الجولة العاشرة: توقفات/حركة/انقطاعات/تصدير/3 مستويات تصعيد ناجحة';end$$;
