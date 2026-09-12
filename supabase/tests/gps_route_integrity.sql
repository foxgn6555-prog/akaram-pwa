do $$
declare
 ops uuid:='92000000-0000-0000-0000-000000000001';
 gid uuid;pid uuid;vid uuid;dep uuid;target jsonb;n bigint;coverage numeric;gaps bigint;largest bigint;valid int;inserted int;stored int;rejected int;
 from_ts timestamptz:='2026-09-09 23:50:00+03';to_ts timestamptz:='2026-09-10 00:20:00+03';
begin
 select d.id,d.provider_id,b.garage_vehicle_id into gid,pid,vid from public.gps_devices d join public.gps_vehicle_bindings b on b.device_id=d.id where d.external_id='101';
 perform set_config('role','service_role',false);
 update public.garage_departures set returned_at=coalesce(returned_at,now()),returned_by=coalesce(returned_by,ops) where vehicle_id=vid and returned_at is null;
 insert into public.garage_departures(vehicle_id,driver_name,shift,sector_id,departed_at,departed_by,returned_at,returned_by)
 values(vid,'سائق اكتمال GPS','night',1,from_ts,ops,to_ts,ops)returning id into dep;
 execute'reset role';perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',ops::text,false);
 target:=public.gps_history_import_target(null,dep,null);
 if target->>'range_from'<>'2026-09-09T20:50:00+00:00' or target->>'range_to'<>'2026-09-09T21:20:00+00:00' then raise exception'GPS_DEPARTURE_RANGE_OR_TIMEZONE_FAIL:%',target;end if;
 execute'reset role';perform set_config('role','service_role',false);perform set_config('request.jwt.claims','{"role":"service_role"}',false);
 select * into valid,inserted,stored,rejected from public.lvn_apply_history_points(pid,gid,
 '[{"fix_time":"2026-09-09T20:50:30Z","latitude":33.30,"longitude":44.30,"speed":10},{"fix_time":"2026-09-09T20:51:00Z","latitude":33.301,"longitude":44.301,"speed":11},{"fix_time":"2026-09-09T21:06:00Z","latitude":33.31,"longitude":44.31,"speed":0},{"fix_time":"2026-09-09T21:07:00Z","latitude":999,"longitude":44.3}]',4,from_ts,to_ts);
 if valid<>3 or inserted<>3 or stored<3 or rejected<>1 then raise exception'GPS_SOURCE_STORAGE_COUNTS_FAIL:%/%/%/%',valid,inserted,stored,rejected;end if;
 -- إعادة الاستيراد لا تكرر النقاط.
 select * into valid,inserted,stored,rejected from public.lvn_apply_history_points(pid,gid,
 '[{"fix_time":"2026-09-09T20:50:30Z","latitude":33.30,"longitude":44.30,"speed":10}]',1,from_ts,to_ts);
 if inserted<>0 then raise exception'GPS_HISTORY_DEDUP_FAIL';end if;
 insert into public.gps_history_import_runs(provider_id,device_id,departure_id,range_from,range_to,status,chunks_requested,chunks_completed,source_points,valid_points,inserted_points,stored_points,duplicate_points,rejected_points,finished_at)
 values(pid,gid,dep,from_ts,to_ts,'partial',1,1,4,3,3,stored,0,1,now());
 execute'reset role';perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',ops::text,false);
 select coverage_percent,gap_count,largest_gap_seconds into coverage,gaps,largest from public.gps_lvn_trip_integrity('2026-09-09','2026-09-10')where departure_id=dep;
 if gaps<>1 or largest<900 or coverage<=0 or coverage>=100 then raise exception'GPS_GAP_COVERAGE_FAIL:%/%/%',coverage,gaps,largest;end if;
 select count(*)into n from public.gps_lvn_route_window(gid,from_ts,to_ts,2,0);if n<>2 then raise exception'GPS_ROUTE_PAGE_FAIL';end if;
 begin perform public.gps_lvn_route_window(gid,from_ts,to_ts,5001,0);raise exception'GPS_ROUTE_LIMIT_ACCEPTED';exception when others then if sqlerrm='GPS_ROUTE_LIMIT_ACCEPTED'then raise;end if;if sqlerrm not like'%GPS_PAGE_INVALID%'then raise;end if;end;
 perform set_config('request.jwt.claim.sub','92000000-0000-0000-0000-000000000002',false);
 begin perform public.gps_lvn_trip_integrity('2026-09-09','2026-09-10');raise exception'GPS_INTEGRITY_EMPLOYEE_ACCEPTED';exception when others then if sqlerrm='GPS_INTEGRITY_EMPLOYEE_ACCEPTED'then raise;end if;if sqlerrm not like'%GPS_FORBIDDEN%'then raise;end if;end;
 raise notice'✅ اكتمال GPS: بغداد/منتصف الليل/الانطلاقية/المستلم مقابل المخزن/منع التكرار/الفجوات/الصفحات/العزل ناجحة';
end$$;
