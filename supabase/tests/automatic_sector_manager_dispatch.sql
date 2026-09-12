-- الإسناد الآلي: لا manager_id من العميل، اختيار وحيد حسب المنطقة بغض النظر عن الشفت، ومنع الغموض.
do $$
declare
 garage_user uuid:='93000000-0000-0000-0000-000000000001';
 manager_one uuid:='93000000-0000-0000-0000-000000000002';
 manager_two uuid:='93000000-0000-0000-0000-000000000003';
 vehicle_one public.garage_vehicles;vehicle_two public.garage_vehicles;departure public.garage_departures;n bigint;
begin
 insert into auth.users(id,email)values(garage_user,'auto-garage@akram.iq'),(manager_one,'auto-manager1@akram.iq'),(manager_two,'auto-manager2@akram.iq');
 insert into public.user_roles(user_id,role)values(garage_user,'central_garage_officer'),(manager_one,'department_manager'),(manager_two,'department_manager');
 insert into public.manager_profiles(user_id,shift,sectors)values(manager_one,'evening',array[6]::smallint[]);
 perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',garage_user::text,false);
 vehicle_one:=public.garage_add_vehicle('آلية إسناد تلقائي','DB-AUTO-1','P-AUTO-1','C-AUTO-1',garage_user::text||'/auto1.webp','morning','سائق تلقائي',6::smallint);
 departure:=public.garage_record_shift_departure(vehicle_one.id,'morning','اختبار الإسناد');
 if departure.recipient_manager_id<>manager_one or departure.recipient_manager_name is null then raise exception'AUTOMATIC_MANAGER_RESOLUTION_FAIL';end if;
 execute'reset role';select count(*)into n from public.notifications where user_id=manager_one and entity_id=departure.id and dedupe_key='departure:auto-manager:'||departure.id::text;if n<>1 then raise exception'AUTOMATIC_MANAGER_NOTIFICATION_FAIL';end if;
 insert into public.manager_profiles(user_id,shift,sectors)values(manager_two,'morning',array[6]::smallint[]);
 perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',garage_user::text,false);
 vehicle_two:=public.garage_add_vehicle('آلية منع الغموض','DB-AUTO-2','P-AUTO-2','C-AUTO-2',garage_user::text||'/auto2.webp','morning','سائق ثان',6::smallint);
 begin perform public.garage_record_shift_departure(vehicle_two.id,'morning',null);raise exception'AMBIGUOUS_MANAGER_ACCEPTED';exception when others then if sqlerrm='AMBIGUOUS_MANAGER_ACCEPTED'then raise;end if;if sqlerrm not like'%GARAGE_SECTOR_MANAGER_AMBIGUOUS%'then raise;end if;end;
 raise notice'✅ الإسناد التلقائي: مسؤول المنطقة لكل الشفتات، إشعار واحد، ومنع الغموض ناجحة';
end$$;
