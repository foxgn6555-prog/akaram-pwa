-- تصفير الأجهزة لا يمس إعدادات LVN ولا الآلية؛ الربط والمواقع مرتبطان بالجهاز المختار.
set client_min_messages=warning;
insert into auth.users(id,email) values ('98300000-0000-0000-0000-000000000001','gps-reset@test.iq');
insert into public.user_roles(user_id,role) values ('98300000-0000-0000-0000-000000000001','it_admin');
select set_config('auth.user_id','98300000-0000-0000-0000-000000000001',false);
insert into public.sectors(id,code,name,sort,parent_sector) values (983,'GPS983','تجربة',983,'karrada');
insert into public.gps_providers(id,name) values ('98300000-0000-0000-0000-000000000002','LVN إعداد');
insert into public.gps_devices(id,provider_id,external_id,name) values ('98300000-0000-0000-0000-000000000003','98300000-0000-0000-0000-000000000002','device-983','جهاز');
insert into public.garage_vehicles(id,vehicle_name,db_number,plate_number,chassis_number,image_path,shift,driver_name,sector_id,created_by) values ('98300000-0000-0000-0000-000000000004','آلية','DB983','P983','CH983','test.jpg','morning','سائق',983,'98300000-0000-0000-0000-000000000001');
insert into public.gps_vehicle_bindings(device_id,garage_vehicle_id,match_method) values ('98300000-0000-0000-0000-000000000003','98300000-0000-0000-0000-000000000004','manual');
do $$ declare j jsonb; begin
 j:=public.platform_reset_request(array['gps'],'تصفير');
 assert j->>'status'='done', j::text;
 assert not exists(select 1 from public.gps_devices where id='98300000-0000-0000-0000-000000000003'), 'device remains';
 assert not exists(select 1 from public.gps_vehicle_bindings where device_id='98300000-0000-0000-0000-000000000003'), 'binding remains';
 assert exists(select 1 from public.gps_providers where id='98300000-0000-0000-0000-000000000002'), 'LVN setting removed';
 assert exists(select 1 from public.garage_vehicles where id='98300000-0000-0000-0000-000000000004'), 'unselected vehicle removed';
end $$;
