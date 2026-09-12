do $$
declare
 ops uuid:='92000000-0000-0000-0000-000000000001';
 gid uuid;
 vid uuid;
 dep uuid;
 aid uuid;
 n bigint;
begin
 execute 'reset role';
 select d.id,b.garage_vehicle_id into gid,vid from public.gps_devices d join public.gps_vehicle_bindings b on b.device_id=d.id where d.external_id='101';
 select id into dep from public.garage_departures where vehicle_id=vid order by departed_at desc limit 1;
 update public.gps_operational_alerts set resolved_at=now() where device_id=gid and alert_type='engine_idle' and resolved_at is null;
 insert into public.gps_operational_alerts(device_id,garage_vehicle_id,departure_id,alert_type,severity,title,details)
 values(gid,vid,dep,'engine_idle','warning','توقف محرك متكرر','{"sequence":1}') returning id into aid;
 insert into public.gps_operational_alerts(device_id,garage_vehicle_id,departure_id,alert_type,severity,title,details)
 values(gid,vid,dep,'engine_idle','critical','توقف محرك متكرر','{"sequence":2}');
 select count(*) into n from public.gps_operational_alerts where id=aid and occurrence_count=2 and severity='critical' and details->>'sequence'='2';
 if n<>1 then raise exception 'GPS_ALERT_GROUPING_FAIL';end if;
 perform set_config('role','authenticated',false);
 perform set_config('request.jwt.claim.sub',ops::text,false);
 select count(*) into n from public.gps_lvn_open_alerts(100) where id=aid and occurrence_count=2;
 if n<>1 then raise exception 'GPS_ALERT_GROUPED_LIST_FAIL';end if;
 select count(*) into n from public.gps_trip_shift_context_bulk(array[dep]);
 if n<1 then raise exception 'GPS_TRIP_SHIFT_BULK_FAIL';end if;
 execute 'reset role';
 update public.gps_operational_alerts set opened_at=now()-interval'5 minutes' where id=aid;
 update public.gps_alert_notification_policies set escalation_minutes=1,enabled=true,recipient_roles=array['ops_room'],only_during_departure=true where alert_type='engine_idle';
 perform set_config('role','service_role',false);
 perform set_config('request.jwt.claims','{"role":"service_role"}',false);
 perform public.notification_evaluate_gps_escalations();
 select count(*) into n from public.notifications where user_id=ops and entity_id=aid and dedupe_key='gps_alert:'||aid::text||':escalation:1' and priority='critical';
 if n<>1 then raise exception 'GPS_ALERT_ESCALATION_FAIL';end if;
 perform public.notification_evaluate_gps_escalations();
 select count(*) into n from public.notifications where user_id=ops and dedupe_key='gps_alert:'||aid::text||':escalation:1';
 if n<>1 then raise exception 'GPS_ALERT_ESCALATION_DEDUPE_FAIL';end if;
 raise notice '✅ تنبيهات GPS: التجميع/العداد/التصعيد/منع التكرار/تصدير الشفتات ناجحة';
end$$;
