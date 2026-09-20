-- 00130 · الإسناد التلقائي الحتمي (التداخل لا يمنع الانطلاق) + الإسناد اليدوي المُتحقق منه.
do $$
declare
 garage_user uuid:='93000000-0000-0000-0000-000000000001';
 manager_one uuid:='93000000-0000-0000-0000-000000000002';
 manager_two uuid:='93000000-0000-0000-0000-000000000003';
 manager_far uuid:='93000000-0000-0000-0000-000000000004';
 vehicle_one public.garage_vehicles;vehicle_two public.garage_vehicles;vehicle_three public.garage_vehicles;vehicle_four public.garage_vehicles;
 departure public.garage_departures;n bigint;
begin
 insert into auth.users(id,email)values(garage_user,'auto-garage@akram.iq'),(manager_one,'auto-manager1@akram.iq'),(manager_two,'auto-manager2@akram.iq'),(manager_far,'auto-manager-far@akram.iq');
 insert into public.user_roles(user_id,role)values(garage_user,'central_garage_officer'),(garage_user,'ops_room'),(manager_one,'department_manager'),(manager_two,'department_manager'),(manager_far,'department_manager');
 insert into public.manager_profiles(user_id,shift,sectors)values(manager_one,'evening',array[6]::smallint[]),(manager_far,'morning',array[1]::smallint[]);
 perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',garage_user::text,false);

 -- 1) مدير وحيد يغطي المنطقة بشفت آخر ⇒ يلتقط تلقائياً ويوثق auto
 vehicle_one:=public.garage_add_vehicle('آلية إسناد تلقائي','DB-AUTO-1','P-AUTO-1','C-AUTO-1',garage_user::text||'/auto1.webp','morning','سائق تلقائي',6::smallint);
 departure:=public.garage_record_shift_departure(vehicle_one.id,'morning','اختبار الإسناد');
 if departure.recipient_manager_id<>manager_one or departure.assignment_mode<>'auto' then raise exception'AUTOMATIC_MANAGER_RESOLUTION_FAIL';end if;
 execute'reset role';select count(*)into n from public.notifications where user_id=manager_one and entity_id=departure.id and dedupe_key='departure:auto-manager:'||departure.id::text;if n<>1 then raise exception'AUTOMATIC_MANAGER_NOTIFICATION_FAIL';end if;
 perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',garage_user::text,false);

 -- 2) التداخل لم يعد يمنع الانطلاق: مطابقة الشفت ثم الأكثر تخصصاً يحسمان
 execute'reset role';
 insert into public.manager_profiles(user_id,shift,sectors)values(manager_two,'morning',array[6]::smallint[]);
 perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',garage_user::text,false);
 vehicle_two:=public.garage_add_vehicle('آلية التداخل','DB-AUTO-2','P-AUTO-2','C-AUTO-2',garage_user::text||'/auto2.webp','morning','سائق ثان',6::smallint);
 departure:=public.garage_record_shift_departure(vehicle_two.id,'morning',null);
 if departure.recipient_manager_id<>manager_two or departure.assignment_mode<>'auto' then raise exception'OVERLAP_DETERMINISM_FAIL %',coalesce(departure.recipient_manager_id::text,'null');end if;
 -- المعاينة المرتبة: الأول هو الالتقاط التلقائي نفسه
 select count(*) into n from public.garage_shift_dispatch_recipients(vehicle_two.id,'morning') r where r.pick_rank=1 and r.user_id=manager_two and r.resolution='direct';
 if n<>1 then raise exception'PREVIEW_RANK_FAIL %',n;end if;
 select count(*) into n from public.garage_shift_dispatch_recipients(vehicle_two.id,'morning') r where r.pick_rank=2 and r.user_id=manager_one;
 if n<>1 then raise exception'PREVIEW_SECOND_FAIL %',n;end if;

 -- 3) اليدوي من خارج القاطع مرفوض، ومن داخله مقبول وموثق manual
 vehicle_three:=public.garage_add_vehicle('آلية اليدوي','DB-AUTO-3','P-AUTO-3','C-AUTO-3',garage_user::text||'/auto3.webp','morning','سائق اليدوي',6::smallint);
 begin perform public.garage_record_shift_departure(vehicle_three.id,'morning',null,manager_far);raise exception'INELIGIBLE_MANUAL_ACCEPTED';
 exception when others then if sqlerrm='INELIGIBLE_MANUAL_ACCEPTED'then raise;end if;if sqlerrm not like'%GARAGE_RECIPIENT_NOT_ELIGIBLE%'then raise;end if;end;
 departure:=public.garage_record_shift_departure(vehicle_three.id,'morning',null,manager_one);
 if departure.recipient_manager_id<>manager_one or departure.assignment_mode<>'manual' then raise exception'MANUAL_ASSIGNMENT_FAIL';end if;

 -- 4) منطقة بلا مدير مباشر ⇒ ارتداد ضمن القاطع الأب بالمعاينة parent_fallback
 --    (عزل مؤقت لأي تغطية مباشرة للمنطقة 5 مع استعادتها بعدها لعدم تأثير الاختبار على ما بعده)
 execute'reset role';
 create temporary table tmp_saved_five on commit drop as
 select mp.* from public.manager_profiles mp
  where exists(select 1 from public.user_roles ur where ur.user_id=mp.user_id and ur.role='department_manager')
    and 5=any(mp.sectors) and mp.user_id<>manager_one and mp.user_id<>manager_two;
 delete from public.manager_profiles mp using tmp_saved_five t where mp.user_id=t.user_id;
 perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',garage_user::text,false);
 vehicle_four:=public.garage_add_vehicle('آلية الارتداد','DB-AUTO-4','P-AUTO-4','C-AUTO-4',garage_user::text||'/auto4.webp','morning','سائق الارتداد',5::smallint);
 select count(*) into n from public.garage_shift_dispatch_recipients(vehicle_four.id,'morning') r where r.pick_rank=1 and r.resolution='parent_fallback';
 if n<>1 then raise exception'PREVIEW_FALLBACK_FAIL %',n;end if;
 departure:=public.garage_record_shift_departure(vehicle_four.id,'morning',null);
 if departure.recipient_manager_id<>manager_two or departure.assignment_mode<>'auto' then raise exception'FALLBACK_RESOLUTION_FAIL';end if;
 execute'reset role';
 insert into public.manager_profiles select * from tmp_saved_five;
 perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',garage_user::text,false);

 -- 5) غياب أي مؤهل ضمن القاطع ⇒ NOT_CONFIGURED صريحاً (مع عزل مؤقت واستعادة)
 execute'reset role';
 create temporary table tmp_saved_karrada on commit drop as
 select mp.* from public.manager_profiles mp
  where exists(select 1 from public.user_roles ur where ur.user_id=mp.user_id and ur.role='department_manager')
    and exists(select 1 from public.sectors sx where sx.id=any(mp.sectors) and sx.parent_sector='karrada');
 delete from public.manager_profiles mp using tmp_saved_karrada t where mp.user_id=t.user_id;
 perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',garage_user::text,false);
 vehicle_four:=public.garage_add_vehicle('آلية الغياب','DB-AUTO-5','P-AUTO-5','C-AUTO-5',garage_user::text||'/auto5.webp','morning','سائق الغياب',2::smallint);
 begin perform public.garage_record_shift_departure(vehicle_four.id,'morning',null);raise exception'NOT_CONFIGURED_ACCEPTED';
 exception when others then if sqlerrm='NOT_CONFIGURED_ACCEPTED'then raise;end if;if sqlerrm not like'%GARAGE_SECTOR_MANAGER_NOT_CONFIGURED%'then raise;end if;end;
 execute'reset role';
 insert into public.manager_profiles select * from tmp_saved_karrada;
 perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',garage_user::text,false);

 raise notice'✅ الإسناد: تلقائي حتمي، تداخل محسوم، يدوي متحقق منه، ارتداد القاطع، وغياب صريح';
end$$;
