-- اختبار انطلاق السائقين: الذرية، منع التكرار، العودة، الانطلاق المفتوح عبر الأيام، والعزل.
do $$
declare
  garage_u uuid:='75000000-0000-0000-0000-000000000001';
  outsider_u uuid:='75000000-0000-0000-0000-000000000002';
  v public.garage_vehicles;dep public.garage_departures;closed public.garage_departures;n bigint;
begin
  insert into auth.users(id,email) values(garage_u,'garage-departures@akram.iq'),(outsider_u,'departures-outsider@akram.iq');
  insert into public.user_roles(user_id,role) values(garage_u,'central_garage_officer'),(outsider_u,'employee');
  perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',garage_u::text,false);
  v:=public.garage_add_vehicle('كابسة انطلاق','DB-750','بغداد 750','CHASSIS-750',garage_u::text||'/vehicle.webp','morning','سائق الانطلاق',1::smallint);

  dep:=public.garage_record_departure(v.id,'انطلاق الصباح');
  if dep.driver_name<>'سائق الانطلاق' or dep.shift<>'morning' or dep.sector_id<>1 or dep.departed_by<>garage_u then raise exception 'DEPARTURE_SNAPSHOT_FAIL'; end if;
  if dep.departed_at is null or abs(extract(epoch from(now()-dep.departed_at)))>10 or dep.returned_at is not null then raise exception 'DEPARTURE_SERVER_TIME_FAIL'; end if;

  begin perform public.garage_record_departure(v.id,null);raise exception 'DOUBLE_DEPARTURE_ACCEPTED';
  exception when others then if sqlerrm='DOUBLE_DEPARTURE_ACCEPTED' then raise;end if;if sqlerrm not like '%GARAGE_DEPARTURE_ALREADY_OPEN%' then raise;end if;end;
  begin perform public.garage_assign_driver(v.id,'سائق آخر','night',8::smallint,'محاولة أثناء الخروج');raise exception 'FIELD_ASSIGNMENT_ACCEPTED';
  exception when others then if sqlerrm='FIELD_ASSIGNMENT_ACCEPTED' then raise;end if;if sqlerrm not like '%GARAGE_VEHICLE_IN_FIELD%' then raise;end if;end;
  begin perform public.garage_archive_vehicle(v.id,'محاولة أثناء وجودها في الميدان');raise exception 'FIELD_ARCHIVE_ACCEPTED';
  exception when others then if sqlerrm='FIELD_ARCHIVE_ACCEPTED' then raise;end if;if sqlerrm not like '%GARAGE_VEHICLE_IN_FIELD%' then raise;end if;end;

  -- الانطلاقة المفتوحة من يوم سابق يجب أن تبقى ظاهرة كي يمكن تسجيل عودتها.
  execute 'reset role';update public.garage_departures set departed_at=now()-interval '1 day' where id=dep.id;
  perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',garage_u::text,false);
  select count(*) into n from public.garage_today_departures() where id=dep.id and returned_at is null;
  if n<>1 then raise exception 'OVERNIGHT_OPEN_DEPARTURE_HIDDEN'; end if;

  closed:=public.garage_record_return(dep.id);
  if closed.returned_at is null or closed.returned_by<>garage_u or closed.returned_at<closed.departed_at then raise exception 'RETURN_FAIL'; end if;
  begin perform public.garage_record_return(dep.id);raise exception 'DOUBLE_RETURN_ACCEPTED';
  exception when others then if sqlerrm='DOUBLE_RETURN_ACCEPTED' then raise;end if;if sqlerrm not like '%GARAGE_OPEN_DEPARTURE_NOT_FOUND%' then raise;end if;end;

  dep:=public.garage_record_departure(v.id,null);perform public.garage_record_return(dep.id);
  select count(*) into n from public.garage_today_departures() where vehicle_id=v.id;
  if n<>1 then raise exception 'TODAY_DEPARTURES_FAIL'; end if;
  select count(*) into n from public.audit_logs where table_name='garage_departures' and record_id=dep.id::text;
  -- RLS يخفي سجل التدقيق عن مسؤول الكراج؛ التحقق الإداري بعد reset role.
  if n<>0 then raise exception 'AUDIT_RLS_LEAK'; end if;

  perform set_config('request.jwt.claim.sub',outsider_u::text,false);
  select count(*) into n from public.garage_departures;if n<>0 then raise exception 'OUTSIDER_DEPARTURE_RLS_FAIL';end if;
  begin perform public.garage_today_departures();raise exception 'OUTSIDER_DEPARTURE_RPC_ACCEPTED';
  exception when others then if sqlerrm='OUTSIDER_DEPARTURE_RPC_ACCEPTED' then raise;end if;if sqlerrm not like '%GARAGE_FORBIDDEN%' then raise;end if;end;
  begin insert into public.garage_departures(vehicle_id,driver_name,shift,sector_id,departed_by) values(v.id,'مرفوض','morning',1,outsider_u);raise exception 'OUTSIDER_DEPARTURE_INSERT_ACCEPTED';
  exception when others then if sqlerrm='OUTSIDER_DEPARTURE_INSERT_ACCEPTED' then raise;end if;end;

  execute 'reset role';select count(*) into n from public.audit_logs where table_name='garage_departures' and record_id=dep.id::text;
  if n<2 then raise exception 'DEPARTURE_AUDIT_FAIL';end if;
  raise notice '✅ انطلاق السائقين: الذرية/العودة/العابر لليوم/منع التعديل والأرشفة/RLS والتدقيق ناجحة';
end$$;
