do $$declare ops uuid:='92000000-0000-0000-0000-000000000001';employee uuid:='92000000-0000-0000-0000-000000000002';dep uuid;device uuid;r record;plan text:='';plan_line text;begin
 execute'reset role';select gd.id,b.device_id into dep,device from public.garage_departures gd join public.gps_vehicle_bindings b on b.garage_vehicle_id=gd.vehicle_id join public.gps_devices d on d.id=b.device_id where d.external_id='101'order by gd.departed_at desc limit 1;
 perform set_config('enable_seqscan','off',true);
 for plan_line in execute format('explain select fix_time from public.gps_device_position_history where device_id=%L and fix_time between now()-interval''1 day'' and now()',device)loop plan:=plan||plan_line;end loop;
 if plan not like'%gps_history_route_idx%'and plan not like'%gps_position_history_device_idx%'then raise exception'GPS_DIAGNOSTIC_HISTORY_INDEX_UNUSED %',plan;end if;
 plan:='';for plan_line in execute format('explain select status from public.gps_history_import_runs where departure_id=%L order by started_at desc limit 1',dep)loop plan:=plan||plan_line;end loop;
 if plan not like'%gps_history_import_departure_idx%'then raise exception'GPS_DIAGNOSTIC_IMPORT_INDEX_UNUSED %',plan;end if;
 perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',ops::text,false);
 select * into r from public.gps_trip_route_diagnostics_bulk(array[dep]);
 if r.departure_id<>dep or r.expected_72h_windows<1 or r.gps_points<1 or r.diagnosis_code not in('healthy','internal_gaps','late_first_fix','early_last_fix','provider_payload_rejected','storage_deficit','windows_not_fully_imported')then raise exception'GPS_ROUTE_DIAGNOSTIC_FAIL %',r.diagnosis_code;end if;
 begin perform public.gps_trip_route_diagnostics_bulk(array_fill(dep,array[201]));raise exception'GPS_DIAGNOSTIC_LIMIT_ACCEPTED';exception when others then if sqlerrm='GPS_DIAGNOSTIC_LIMIT_ACCEPTED'then raise;end if;if sqlerrm not like'%GPS_DIAGNOSTICS_LIMIT%'then raise;end if;end;
 perform set_config('request.jwt.claim.sub',employee::text,false);begin perform public.gps_trip_route_diagnostics_bulk(array[dep]);raise exception'GPS_DIAGNOSTIC_EMPLOYEE_ACCEPTED';exception when others then if sqlerrm='GPS_DIAGNOSTIC_EMPLOYEE_ACCEPTED'then raise;end if;if sqlerrm not like'%GPS_FORBIDDEN%'then raise;end if;end;
 raise notice'✅ GPS الجولة 12: تشخيص المصدر/التخزين/النوافذ/الحدود/العزل ناجح';end$$;
