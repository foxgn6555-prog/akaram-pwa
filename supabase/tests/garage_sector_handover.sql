-- دورة التسليم الثنائية: اختيار المستلم، العزل، ترتيب المراحل، الوقت الخادمي، التنبيهات ومنع التكرار.
do $$
declare
 g uuid:='80000000-0000-0000-0000-000000000001';m1 uuid:='80000000-0000-0000-0000-000000000002';m2 uuid:='80000000-0000-0000-0000-000000000003';
 v public.garage_vehicles;d public.garage_departures;n bigint;tripday date;
begin
 insert into auth.users(id,email) values(g,'handover-garage@akram.iq'),(m1,'handover-manager1@akram.iq'),(m2,'handover-manager2@akram.iq');
 insert into public.user_roles(user_id,role) values(g,'central_garage_officer'),(m1,'department_manager'),(m2,'department_manager');
 insert into public.manager_profiles(user_id,shift,sectors) values(m1,'morning',array[1]::smallint[]),(m2,'morning',array[1]::smallint[]);
 perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',g::text,false);
 v:=public.garage_add_vehicle('كابسة تسليم','DB-HANDOVER','بغداد-H','CHASSIS-H',g::text||'/h.webp','morning','سائق التسليم',1::smallint);
 select count(*) into n from public.garage_dispatch_recipients(v.id) where user_id in(m1,m2);if n<>2 then raise exception 'RECIPIENT_FILTER_FAIL';end if;
 d:=public.garage_record_departure(v.id,'إلى الموقع',m1);
 if d.recipient_manager_id<>m1 or d.departed_at is null or abs(extract(epoch from(now()-d.departed_at)))>10 then raise exception 'EXPLICIT_DISPATCH_FAIL';end if;
 begin perform public.garage_record_return(d.id);raise exception 'EARLY_GARAGE_CLOSE_ACCEPTED';exception when others then if sqlerrm='EARLY_GARAGE_CLOSE_ACCEPTED' then raise;end if;if sqlerrm not like '%GARAGE_VEHICLE_NOT_SENT_BACK%' then raise;end if;end;
 execute 'reset role';update public.garage_departures set departed_at=now()-interval '1 day' where id=d.id;
 perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',m2::text,false);
 select count(*) into n from public.manager_vehicle_trips() where id=d.id;if n<>0 then raise exception 'MANAGER_TRIP_ISOLATION_FAIL';end if;
 begin perform public.sector_confirm_vehicle_arrival(d.id,null);raise exception 'WRONG_MANAGER_ARRIVAL_ACCEPTED';exception when others then if sqlerrm='WRONG_MANAGER_ARRIVAL_ACCEPTED' then raise;end if;if sqlerrm not like '%GARAGE_ARRIVAL_NOT_ALLOWED%' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',m1::text,false);d:=public.sector_confirm_vehicle_arrival(d.id,'وصلت سليمة');
 if d.arrived_at is null or d.arrived_by<>m1 or d.arrival_notes<>'وصلت سليمة' or d.arrived_at<d.departed_at then raise exception 'ARRIVAL_STAGE_FAIL';end if;
 begin perform public.sector_confirm_vehicle_arrival(d.id,null);raise exception 'DOUBLE_ARRIVAL_ACCEPTED';exception when others then if sqlerrm='DOUBLE_ARRIVAL_ACCEPTED' then raise;end if;if sqlerrm not like '%GARAGE_ARRIVAL_NOT_ALLOWED%' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',m2::text,false);begin perform public.sector_send_vehicle_to_garage(d.id,null);raise exception 'WRONG_MANAGER_SEND_ACCEPTED';exception when others then if sqlerrm='WRONG_MANAGER_SEND_ACCEPTED' then raise;end if;if sqlerrm not like '%GARAGE_SITE_DEPARTURE_NOT_ALLOWED%' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',m1::text,false);d:=public.sector_send_vehicle_to_garage(d.id,'انتهت الوردية');
 if d.site_departed_at is null or d.site_departed_by<>m1 or d.site_departure_notes<>'انتهت الوردية' or d.site_departed_at<d.arrived_at then raise exception 'SITE_DEPARTURE_STAGE_FAIL';end if;
 begin perform public.sector_send_vehicle_to_garage(d.id,null);raise exception 'DOUBLE_SEND_ACCEPTED';exception when others then if sqlerrm='DOUBLE_SEND_ACCEPTED' then raise;end if;if sqlerrm not like '%GARAGE_SITE_DEPARTURE_NOT_ALLOWED%' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',g::text,false);d:=public.garage_record_return(d.id);
 if d.returned_at is null or d.returned_by<>g or d.returned_at<d.site_departed_at then raise exception 'FINAL_GARAGE_RETURN_FAIL';end if;tripday:=(d.departed_at at time zone 'Asia/Baghdad')::date;
 select count(*) into n from public.garage_departure_days() where trip_day=tripday;if n<>1 then raise exception 'GARAGE_DAY_FOLDER_FAIL';end if;select count(*) into n from public.garage_departures_for_day(tripday) where id=d.id;if n<>1 then raise exception 'GARAGE_DAY_CONTENT_FAIL';end if;
 perform set_config('request.jwt.claim.sub',m1::text,false);select count(*) into n from public.manager_vehicle_trip_days() where trip_day=tripday;if n<>1 then raise exception 'MANAGER_DAY_FOLDER_FAIL';end if;select count(*) into n from public.manager_vehicle_trips_for_day(tripday) where id=d.id;if n<>1 then raise exception 'MANAGER_DAY_CONTENT_FAIL';end if;
 perform set_config('request.jwt.claim.sub',m2::text,false);select count(*) into n from public.manager_vehicle_trips_for_day(tripday) where id=d.id;if n<>0 then raise exception 'MANAGER_DAY_ISOLATION_FAIL';end if;
 execute 'reset role';select count(*) into n from public.notifications where user_id in(g,m1) and link in('/manager/vehicle-trips','/central-garage/drivers-dispatch');if n<>4 then raise exception 'HANDOVER_NOTIFICATIONS_FAIL %',n;end if;
 select count(*) into n from public.audit_logs where table_name='garage_departures' and record_id=d.id::text;if n<4 then raise exception 'HANDOVER_AUDIT_FAIL';end if;
 raise notice '✅ تسليم الآلية: اختيار صريح/عزل/ترتيب/منع تكرار/عبور منتصف الليل/وقت خادمي/تنبيهات/تدقيق ناجحة';
end$$;
