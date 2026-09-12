do $$declare ops uuid:='92000000-0000-0000-0000-000000000001';employee uuid:='92000000-0000-0000-0000-000000000002';dep uuid;device uuid;r record;n bigint;begin
 execute'reset role';select gd.id,b.device_id into dep,device from public.garage_departures gd join public.gps_vehicle_bindings b on b.garage_vehicle_id=gd.vehicle_id join public.gps_devices d on d.id=b.device_id where d.external_id='101'order by gd.departed_at desc limit 1;
 perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',ops::text,false);
 select * into r from public.gps_trip_window_coverage_audit(dep)order by window_index limit 1;
 if r.window_index<>0 or r.range_to<=r.range_from or r.expected_seconds<1 then raise exception'GPS_WINDOW_AUDIT_RANGE_FAIL';end if;
 if r.actual_stored_points<1 or r.renderable_points<>least(r.actual_stored_points,100000)then raise exception'GPS_WINDOW_AUDIT_STORAGE_RENDER_FAIL';end if;
 if r.coverage_percent not between 0 and 100 or r.source_acceptance_percent not between 0 and 100 or r.storage_match_percent not between 0 and 100 then raise exception'GPS_WINDOW_AUDIT_PERCENT_FAIL';end if;
 select count(*)into n from public.gps_lvn_route_window(device,r.range_from,r.range_to,5000,0);if n<>least(r.actual_stored_points,5000)then raise exception'GPS_WINDOW_AUDIT_ROUTE_MATCH_FAIL';end if;
 if r.diagnosis_code not in('healthy','not_audited','import_failed','provider_payload_rejected','storage_deficit','render_limit','no_data','late_first_fix','early_last_fix','internal_gaps','window_incomplete')then raise exception'GPS_WINDOW_AUDIT_DIAGNOSIS_FAIL %',r.diagnosis_code;end if;
 perform set_config('request.jwt.claim.sub',employee::text,false);begin perform public.gps_trip_window_coverage_audit(dep);raise exception'GPS_WINDOW_AUDIT_EMPLOYEE_ACCEPTED';exception when others then if sqlerrm='GPS_WINDOW_AUDIT_EMPLOYEE_ACCEPTED'then raise;end if;if sqlerrm not like'%GPS_FORBIDDEN%'then raise;end if;end;
 raise notice'✅ الجولة 18: تدقيق نافذة LVN/القبول/التخزين/الرسم والنسب والعزل ناجح';end$$;
