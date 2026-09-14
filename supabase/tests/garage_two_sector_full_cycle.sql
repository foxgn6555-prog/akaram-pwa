-- دورة فعلية مستقلة لكل قاطع: وقود، انطلاق، وصول، صيانة، عودة، إشعارات وتقارير.
do $$
declare
 ops uuid:='95190000-0000-0000-0000-000000000001';gk uuid:='95190000-0000-0000-0000-000000000002';gz uuid:='95190000-0000-0000-0000-000000000003';it uuid:='95190000-0000-0000-0000-000000000004';
 mk uuid;mz uuid;mt uuid;vk public.garage_vehicles;vz public.garage_vehicles;tk public.garage_tanks;tz public.garage_tanks;legacy_t public.garage_tanks;
 dk public.garage_departures;dz public.garage_departures;ck public.vehicle_maintenance_cases;cz public.vehicle_maintenance_cases;r jsonb;n bigint;
begin
 insert into auth.users(id,email)values(ops,'cycle2-ops@x.iq'),(gk,'cycle2-karrada@x.iq'),(gz,'cycle2-zaafaraniya@x.iq'),(it,'cycle2-it@x.iq');
 insert into public.user_roles(user_id,role)values(ops,'ops_room'),(gk,'central_garage_officer'),(gz,'central_garage_officer'),(it,'it_admin');
 insert into public.garage_user_profiles(user_id,parent_sector)values(gk,'karrada'),(gz,'zaafaraniya');
 select user_id into mk from app.resolve_sector_shift_manager(1::smallint,'morning');
 select user_id into mz from app.resolve_sector_shift_manager(5::smallint,'morning');
 select user_id into mt from public.user_roles where role='maintenance'order by user_id limit 1;
 if mk is null or mz is null or mt is null then raise exception'CYCLE_ACTOR_FIXTURE_MISSING';end if;
 perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',ops::text,false);
 vk:=public.garage_add_vehicle('آلية دورة الكرادة','DB-CYCLE2-K','P-CYCLE2-K','C-CYCLE2-K',ops::text||'/cycle-k.webp','morning','سائق دورة الكرادة',1::smallint);
 vz:=public.garage_add_vehicle('آلية دورة الزعفرانية','DB-CYCLE2-Z','P-CYCLE2-Z','C-CYCLE2-Z',ops::text||'/cycle-z.webp','morning','سائق دورة الزعفرانية',5::smallint);
 execute'reset role';insert into public.garage_tanks(fuel_type,tank_name,unit,capacity,current_quantity,low_stock_threshold,created_by)values('gas_oil','خزان قديم غير مرتبط','liter',100,0,20,ops)returning*into legacy_t;
 perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',gk::text,false);
 begin perform public.admin_assign_garage_tank_sector(legacy_t.id,'karrada');raise exception'GARAGE_ASSIGNED_LEGACY_TANK';exception when others then if sqlerrm='GARAGE_ASSIGNED_LEGACY_TANK'then raise;end if;if sqlerrm not like'%GARAGE_TANK_ASSIGNMENT_FORBIDDEN%'then raise;end if;end;
 perform set_config('request.jwt.claim.sub',it::text,false);legacy_t:=public.admin_assign_garage_tank_sector(legacy_t.id,'karrada');if legacy_t.garage_parent_sector<>'karrada'then raise exception'IT_LEGACY_TANK_ASSIGNMENT_FAIL';end if;

 -- لكل كراج خزان وحركة صرف خاصة به، ولا يقبل خزان أو آلية القاطع الآخر.
 perform set_config('request.jwt.claim.sub',gk::text,false);tk:=public.garage_add_tank('gas_oil','خزان دورة الكرادة','liter',500,200,20);perform public.garage_fill_vehicle(tk.id,vk.id,11,null,'صرف دورة الكرادة');
 begin perform public.garage_fill_vehicle(tk.id,vz.id,1,null,null);raise exception'KARRADA_FOREIGN_VEHICLE_FILL_ACCEPTED';exception when others then if sqlerrm='KARRADA_FOREIGN_VEHICLE_FILL_ACCEPTED'then raise;end if;if sqlerrm not like'%GARAGE_VEHICLE_SCOPE_FORBIDDEN%'then raise;end if;end;
 perform set_config('request.jwt.claim.sub',gz::text,false);tz:=public.garage_add_tank('gas_oil','خزان دورة الزعفرانية','liter',500,300,20);perform public.garage_fill_vehicle(tz.id,vz.id,22,null,'صرف دورة الزعفرانية');
 begin perform public.garage_add_tank_stock(tk.id,1,null);raise exception'ZAAFARANIYA_FOREIGN_TANK_STOCK_ACCEPTED';exception when others then if sqlerrm='ZAAFARANIYA_FOREIGN_TANK_STOCK_ACCEPTED'then raise;end if;if sqlerrm not like'%GARAGE_TANK_SCOPE_FORBIDDEN%'then raise;end if;end;

 -- دورة الكرادة حتى الصيانة ثم العودة الفعلية إلى الكراج.
 perform set_config('request.jwt.claim.sub',gk::text,false);dk:=public.garage_record_shift_departure(vk.id,'morning','دورة كاملة للكرادة');
 perform set_config('request.jwt.claim.sub',mk::text,false);dk:=public.sector_confirm_vehicle_arrival(dk.id,'وصلت الكرادة');ck:=public.sector_send_vehicle_to_maintenance(dk.id,'فحص دورة الكرادة','normal','إرسال دون تعطيل العمل');
 perform set_config('request.jwt.claim.sub',gz::text,false);select count(*)into n from public.garage_maintenance_coordination()where case_id=ck.id;if n<>0 then raise exception'ZAAFARANIYA_SAW_KARRADA_CASE';end if;select count(*)into n from public.vehicle_maintenance_cases where id=ck.id;if n<>0 then raise exception'ZAAFARANIYA_DIRECT_CASE_LEAK';end if;select count(*)into n from public.notifications where entity_id=ck.id;if n<>0 then raise exception'ZAAFARANIYA_GOT_KARRADA_NOTICE';end if;
 perform set_config('request.jwt.claim.sub',mt::text,false);ck:=public.maintenance_confirm_arrival(ck.id,'وصلت صيانة الكرادة');perform public.maintenance_register_attachment(ck.id,ck.id::text||'/round5.webp','round5.webp','image/webp',120,repeat('a',64),'توثيق الكرادة');ck:=public.maintenance_update_case(ck.id,'ready',100,'فحص مكتمل','جاهزة للعودة',null,null);ck:=public.maintenance_approve_readiness(ck.id,'اعتماد الكرادة');ck:=public.maintenance_dispatch_vehicle(ck.id,'garage','عودة إلى كراج الكرادة');
 perform set_config('request.jwt.claim.sub',gz::text,false);select count(*)into n from public.vehicle_maintenance_updates where case_id=ck.id;if n<>0 then raise exception'ZAAFARANIYA_DIRECT_UPDATE_LEAK';end if;select count(*)into n from public.vehicle_maintenance_attachments where case_id=ck.id;if n<>0 then raise exception'ZAAFARANIYA_DIRECT_ATTACHMENT_LEAK';end if;begin perform public.garage_record_return(dk.id);raise exception'FOREIGN_GARAGE_KARRADA_RETURN_ACCEPTED';exception when others then if sqlerrm='FOREIGN_GARAGE_KARRADA_RETURN_ACCEPTED'then raise;end if;if sqlerrm not like'%GARAGE_VEHICLE_SCOPE_FORBIDDEN%'then raise;end if;end;
 perform set_config('request.jwt.claim.sub',gk::text,false);dk:=public.garage_record_return(dk.id);if dk.returned_at is null then raise exception'KARRADA_RETURN_NOT_CLOSED';end if;

 -- الدورة نفسها لقاطع الزعفرانية.
 perform set_config('request.jwt.claim.sub',gz::text,false);dz:=public.garage_record_shift_departure(vz.id,'morning','دورة كاملة للزعفرانية');
 perform set_config('request.jwt.claim.sub',mz::text,false);dz:=public.sector_confirm_vehicle_arrival(dz.id,'وصلت الزعفرانية');cz:=public.sector_send_vehicle_to_maintenance(dz.id,'فحص دورة الزعفرانية','normal','إرسال دون تعطيل العمل');
 perform set_config('request.jwt.claim.sub',gk::text,false);select count(*)into n from public.garage_maintenance_coordination()where case_id=cz.id;if n<>0 then raise exception'KARRADA_SAW_ZAAFARANIYA_CASE';end if;select count(*)into n from public.vehicle_maintenance_cases where id=cz.id;if n<>0 then raise exception'KARRADA_DIRECT_CASE_LEAK';end if;select count(*)into n from public.notifications where entity_id=cz.id;if n<>0 then raise exception'KARRADA_GOT_ZAAFARANIYA_NOTICE';end if;
 perform set_config('request.jwt.claim.sub',mt::text,false);cz:=public.maintenance_confirm_arrival(cz.id,'وصلت صيانة الزعفرانية');perform public.maintenance_register_attachment(cz.id,cz.id::text||'/round5.webp','round5.webp','image/webp',120,repeat('b',64),'توثيق الزعفرانية');cz:=public.maintenance_update_case(cz.id,'ready',100,'فحص مكتمل','جاهزة للعودة',null,null);cz:=public.maintenance_approve_readiness(cz.id,'اعتماد الزعفرانية');cz:=public.maintenance_dispatch_vehicle(cz.id,'garage','عودة إلى كراج الزعفرانية');
 perform set_config('request.jwt.claim.sub',gk::text,false);select count(*)into n from public.vehicle_maintenance_updates where case_id=cz.id;if n<>0 then raise exception'KARRADA_DIRECT_UPDATE_LEAK';end if;select count(*)into n from public.vehicle_maintenance_attachments where case_id=cz.id;if n<>0 then raise exception'KARRADA_DIRECT_ATTACHMENT_LEAK';end if;begin perform public.garage_record_return(dz.id);raise exception'FOREIGN_GARAGE_ZAAFARANIYA_RETURN_ACCEPTED';exception when others then if sqlerrm='FOREIGN_GARAGE_ZAAFARANIYA_RETURN_ACCEPTED'then raise;end if;if sqlerrm not like'%GARAGE_VEHICLE_SCOPE_FORBIDDEN%'then raise;end if;end;
 perform set_config('request.jwt.claim.sub',gz::text,false);dz:=public.garage_record_return(dz.id);if dz.returned_at is null then raise exception'ZAAFARANIYA_RETURN_NOT_CLOSED';end if;

 -- التقرير واللوحة يعرضان خزان واستهلاك القاطع الحالي فقط.
 r:=public.garage_dashboard_summary(p_fuel_type=>'gas_oil');if not jsonb_path_exists(r,'$.tankStock[*] ? (@.name == "خزان دورة الزعفرانية")')or jsonb_path_exists(r,'$.tankStock[*] ? (@.name == "خزان دورة الكرادة")')then raise exception'ZAAFARANIYA_DASHBOARD_FUEL_SCOPE_FAIL';end if;
 r:=public.garage_consumption_report(p_vehicle_id=>vz.id);if(r->>'consumptionTotal')::numeric<>22 then raise exception'ZAAFARANIYA_REPORT_TOTAL_FAIL %',r->>'consumptionTotal';end if;
 perform set_config('request.jwt.claim.sub',gk::text,false);r:=public.garage_dashboard_summary(p_fuel_type=>'gas_oil');if not jsonb_path_exists(r,'$.tankStock[*] ? (@.name == "خزان دورة الكرادة")')or jsonb_path_exists(r,'$.tankStock[*] ? (@.name == "خزان دورة الزعفرانية")')then raise exception'KARRADA_DASHBOARD_FUEL_SCOPE_FAIL';end if;
 r:=public.garage_consumption_report(p_vehicle_id=>vk.id);if(r->>'consumptionTotal')::numeric<>11 then raise exception'KARRADA_REPORT_TOTAL_FAIL %',r->>'consumptionTotal';end if;
 execute'reset role';raise notice'✅ دورة القاطعين: الوقود/الانطلاق/الوصول/الصيانة/العودة/الإشعارات/التقارير معزولة بالكامل';
end$$;
