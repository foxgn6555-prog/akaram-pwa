do $$
declare
 ops uuid := '92000000-0000-0000-0000-000000000001';
 dep public.garage_departures;
 assignment uuid;
 n bigint;
begin
 select d.* into dep from public.garage_departures d
 join public.gps_vehicle_bindings b on b.garage_vehicle_id=d.vehicle_id
 order by d.departed_at desc limit 1;
 insert into public.garage_vehicle_shift_assignments(vehicle_id,shift,driver_name,sector_id,starts_at,ends_at,change_reason,created_by)
 values(dep.vehicle_id,'night','سائق التداخل الاختباري',dep.sector_id,dep.departed_at-interval'10 minutes',dep.departed_at+interval'10 minutes','اختبار سياق GPS',ops)
 returning id into assignment;
 perform set_config('role','authenticated',false);
 perform set_config('request.jwt.claim.sub',ops::text,false);
 select count(*) into n from public.gps_trip_shift_context(dep.id)
 where assignment_id=assignment and overlap_from=dep.departed_at and overlap_seconds between 0 and 600 and not is_departure_driver;
 if n<>1 then raise exception 'GPS_TRIP_SHIFT_OVERLAP_FAIL'; end if;
 select count(*) into n from public.gps_scheduler_health();
 if n<>1 then raise exception 'GPS_SCHEDULER_HEALTH_FAIL'; end if;
 perform set_config('request.jwt.claim.sub','92000000-0000-0000-0000-000000000002',false);
 begin
  perform public.gps_trip_shift_context(dep.id);
  raise exception 'GPS_TRIP_SHIFT_EMPLOYEE_ACCEPTED';
 exception when others then
  if sqlerrm='GPS_TRIP_SHIFT_EMPLOYEE_ACCEPTED' then raise; end if;
  if sqlerrm not like '%GPS_FORBIDDEN%' then raise; end if;
 end;
 raise notice '✅ سياق انطلاقية GPS: تداخل الشفت/السائق/القص الزمني/العزل ناجح';
end$$;
