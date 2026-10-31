set client_min_messages=warning;
insert into storage.buckets(id,name) values('gps-archive','gps-archive'),('other','other') on conflict do nothing;
insert into storage.objects(id,bucket_id,name) values
 ('98500000-0000-0000-0000-000000000001','gps-archive','2026/10/01/device.gz'),
 ('98500000-0000-0000-0000-000000000002','other','untouched.jpg');
insert into public.wh_vehicles(vehicle_id,vehicle_name) values('98500000-0000-0000-0000-000000000003','تجربة');
insert into public.wh_pull_jobs(device_external_id,day) values('gps-test',current_date);
insert into public.wh_raw_points(device_external_id,t,lat,lng,day) values('gps-test',now(),33,44,current_date);
insert into public.wh_hotspots(month,lat,lng) values(date_trunc('month',now())::date,33,44);
do $$ declare id uuid:='98500000-0000-0000-0000-000000000004'; j jsonb; caught bool; begin
 j:=public.wh_reset_prepare(id,true,false); assert j->>'state'='prepared','prepare';
 assert (select paused from public.wh_settings where wh_settings.id=1),'paused';
 assert (select count(*) from public.wh_reset_files_batch(id,500))=1,'nested path snapshot';
 caught:=false; begin perform public.wh_reset_execute(id); exception when others then if sqlerrm not like '%FILES_PENDING%' then raise; end if; caught:=true; end; assert caught,'must wait for file';
 caught:=false; begin insert into public.wh_vehicles(vehicle_id,vehicle_name) values(gen_random_uuid(),'لا'); exception when others then if sqlerrm not like '%RESET_IN_PROGRESS%' then raise; end if; caught:=true; end; assert caught,'writes blocked';
 caught:=false; begin insert into storage.objects(bucket_id,name) values('gps-archive','new'); exception when others then if sqlerrm not like '%RESET_IN_PROGRESS%' then raise; end if; caught:=true; end; assert caught,'archive writes blocked';
 insert into storage.objects(bucket_id,name) values('other','another');
 delete from storage.objects where storage.objects.id='98500000-0000-0000-0000-000000000001';
 j:=public.wh_reset_execute(id); assert (j->>'files_deleted')::int=1,'files count';
 assert not exists(select 1 from public.wh_vehicles),'vehicles removed'; assert not exists(select 1 from public.wh_raw_points),'points removed'; assert not exists(select 1 from public.wh_hotspots),'hotspots removed';
 assert (select count(*) from storage.objects where bucket_id='other')=2,'other storage retained';
 assert not (select paused from public.wh_settings where wh_settings.id=1),'pause restored';
 insert into public.wh_vehicles(vehicle_id,vehicle_name) values('98500000-0000-0000-0000-000000000005','جديد');
 j:=public.wh_reset_execute(id); assert exists(select 1 from public.wh_vehicles where vehicle_id='98500000-0000-0000-0000-000000000005'),'replay must not delete new data';
 assert not has_function_privilege('authenticated','public.wh_reset_execute(uuid)','execute'),'role not permitted';
end $$;

-- اختيار إعدادات المستودع وحدها يعيد قيمها ولا يمس سجلات أو ملفات GPS.
update public.wh_settings set min_stop_minutes=15,paused=true where id=1;
insert into storage.objects(id,bucket_id,name) values ('98500000-0000-0000-0000-000000000006','gps-archive','new/gps.gz');
do $$ declare q uuid:='98500000-0000-0000-0000-000000000007'; j jsonb; begin
 j:=public.wh_reset_prepare(q,false,true); assert j->>'state'='prepared','settings prepare';
 assert (select count(*) from public.wh_reset_files_batch(q,500))=0,'settings no files';
 j:=public.wh_reset_execute(q); assert (j->>'settings_reset')::bool,'settings result';
 assert (select min_stop_minutes=10 and paused=false from public.wh_settings where id=1),'settings default';
 assert exists(select 1 from public.wh_vehicles where vehicle_id='98500000-0000-0000-0000-000000000005'),'settings kept data';
 assert exists(select 1 from storage.objects where id='98500000-0000-0000-0000-000000000006'),'settings kept archive';
end $$;
