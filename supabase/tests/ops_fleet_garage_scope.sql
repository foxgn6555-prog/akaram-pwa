-- ملكية غرفة العمليات لقاعدة الآليات وعزل كراجي الكرادة والزعفرانية.
do $$
declare
 ops uuid:='95170000-0000-0000-0000-000000000001';
 garage_k uuid:='95170000-0000-0000-0000-000000000002';
 garage_z uuid:='95170000-0000-0000-0000-000000000003';

 vk public.garage_vehicles;vz public.garage_vehicles;d public.garage_departures;n integer;r jsonb;
begin
 insert into auth.users(id,email)values(ops,'fleet-ops@x.iq'),(garage_k,'garage-k@x.iq'),(garage_z,'garage-z@x.iq');
 insert into public.user_roles(user_id,role)values(ops,'ops_room'),(garage_k,'central_garage_officer'),(garage_z,'central_garage_officer');
 insert into public.garage_user_profiles(user_id,parent_sector)values(garage_k,'karrada'),(garage_z,'zaafaraniya');
 perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',ops::text,false);
 vk:=public.garage_add_vehicle('آلية الكرادة','DB-SCOPE-K','P-SCOPE-K','C-SCOPE-K',ops::text||'/k.webp','morning','سائق الكرادة',1::smallint);
 vz:=public.garage_add_vehicle('آلية الزعفرانية','DB-SCOPE-Z','P-SCOPE-Z','C-SCOPE-Z',ops::text||'/z.webp','morning','سائق الزعفرانية',5::smallint);
 perform set_config('request.jwt.claim.sub',garage_k::text,false);
 select count(*)into n from public.garage_search_vehicles(null,null,null,100,0,false)where parent_sector<>'karrada';if n<>0 then raise exception'KARRADA_GARAGE_SCOPE_FAIL';end if;select count(*)into n from public.garage_search_vehicles('DB-SCOPE-K',null,null,100,0,false);if n<>1 then raise exception'KARRADA_OWN_VEHICLE_MISSING';end if;
 select count(*)into n from public.garage_visible_areas();if n<>4 then raise exception'KARRADA_AREAS_SCOPE_FAIL';end if;
 r:=public.garage_dashboard_summary();if jsonb_path_exists(r,'$.vehiclesByArea[*] ? (@.sector == "zaafaraniya")')then raise exception'KARRADA_DASHBOARD_SCOPE_FAIL';end if;
 begin perform public.garage_consumption_report(p_vehicle_id=>vz.id);raise exception'FOREIGN_GARAGE_REPORT_ACCEPTED';exception when others then if sqlerrm='FOREIGN_GARAGE_REPORT_ACCEPTED'then raise;end if;if sqlerrm not like'%GARAGE_VEHICLE_SCOPE_FORBIDDEN%'then raise;end if;end;
 begin perform public.garage_update_vehicle(vk.id,'محاولة تعديل','X','X','XXX',null);raise exception'GARAGE_MASTER_UPDATE_ACCEPTED';exception when others then if sqlerrm='GARAGE_MASTER_UPDATE_ACCEPTED'then raise;end if;if sqlerrm not like'%OPS_FLEET_MASTER_FORBIDDEN%'then raise;end if;end;
 begin perform public.garage_record_shift_departure(vz.id,'morning',null);raise exception'FOREIGN_GARAGE_DEPARTURE_ACCEPTED';exception when others then if sqlerrm='FOREIGN_GARAGE_DEPARTURE_ACCEPTED'then raise;end if;if sqlerrm not like'%GARAGE_VEHICLE_SCOPE_FORBIDDEN%'then raise;end if;end;
 d:=public.garage_record_shift_departure(vk.id,'morning','انطلاق صحيح');if d.recipient_manager_id is null then raise exception'GARAGE_SCOPED_MANAGER_FAIL';end if;
 perform set_config('request.jwt.claim.sub',garage_z::text,false);
 select count(*)into n from public.garage_search_vehicles(null,null,null,100,0,false)where parent_sector<>'zaafaraniya';if n<>0 then raise exception'ZAAFARANIYA_GARAGE_SCOPE_FAIL';end if;select count(*)into n from public.garage_search_vehicles('DB-SCOPE-Z',null,null,100,0,false);if n<>1 then raise exception'ZAAFARANIYA_OWN_VEHICLE_MISSING';end if;
 select count(*)into n from public.garage_visible_areas();if n<>4 then raise exception'ZAAFARANIYA_AREAS_SCOPE_FAIL';end if;
 execute'reset role';raise notice'✅ غرفة العمليات تملك الآليات وكراجا القاطعين معزولان والانطلاق محمي';
end$$;
