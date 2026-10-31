-- الفئة المستقلة، عرض الأعداد، المنع قبل الموافقة، الرخصة القصيرة، إتمام واحد فقط.
set client_min_messages=warning;
insert into auth.users(id,email) values('98600000-0000-0000-0000-000000000001','warehouse-reset@test.iq');
insert into public.user_roles(user_id,role) values('98600000-0000-0000-0000-000000000001','it_admin');
select set_config('auth.user_id','98600000-0000-0000-0000-000000000001',false);
do $$ declare j jsonb; id uuid; token uuid; caught bool; n int; begin
  j:=public.platform_reset_counts();
  select count(*) into n from jsonb_array_elements(j->'categories') c where c->>'key'='gps_warehouse' and c->>'rows' is null; assert n=1,'unknown not zero';
  caught:=false; begin perform public.platform_reset_request(array['gps_warehouse'],'تصفير'); exception when others then if sqlerrm not like '%RESET_WAREHOUSE_COUNTS_UNAVAILABLE%' then raise; end if; caught:=true; end; assert caught,'must refresh';
  update public.gps_warehouse_link set last_ping_at=now(),last_ping_ok=true,ping='{"reset_rows":12,"reset_files":3,"reset_settings_rows":1}'::jsonb where gps_warehouse_link.id=1;
  j:=public.platform_reset_counts();
  select (c->>'rows')::int into n from jsonb_array_elements(j->'categories') c where c->>'key'='gps_warehouse'; assert n=12,'warehouse count';
  insert into public.platform_reset_requests(id,status,categories,requested_cats,requested_by) values('98600000-0000-0000-0000-000000000002','pending_approval',array['gps_warehouse'],array['gps_warehouse'],'98600000-0000-0000-0000-000000000001');
  caught:=false; begin perform public.platform_reset_warehouse_claim('98600000-0000-0000-0000-000000000002','98600000-0000-0000-0000-000000000001'); exception when others then if sqlerrm not like '%NOT_APPROVED%' then raise; end if; caught:=true; end; assert caught,'no cleanup before approval';
  delete from public.platform_reset_requests where platform_reset_requests.id='98600000-0000-0000-0000-000000000002';
  j:=public.platform_reset_request(array['gps_hotspots'],'تصفير');
  assert not (j->'result'->>'warehouse_wipe')::bool,'hotspots must not include warehouse';
  caught:=false; begin perform public.platform_reset_warehouse_claim((j->>'id')::uuid,'98600000-0000-0000-0000-000000000001'); exception when others then if sqlerrm not like '%NOT_APPROVED%' then raise; end if; caught:=true; end; assert caught,'wrong category';
  j:=public.platform_reset_request(array['gps_warehouse'],'تصفير'); id:=(j->>'id')::uuid;
  assert j->>'status'='done' and (j->'result'->>'warehouse_wipe')::bool,'independent category';
  j:=public.platform_reset_detail(id); assert (j->'categories'->0->>'rows')::int=12,'approval snapshot';
  caught:=false; begin perform public.platform_reset_request(array['gps_warehouse'],'تصفير'); exception when others then if sqlerrm not like '%WAREHOUSE_PENDING%' then raise; end if; caught:=true; end; assert caught,'pending cannot overlap';
  caught:=false; begin perform public.platform_reset_warehouse_claim(id,'98600000-0000-0000-0000-000000000099'); exception when others then if sqlerrm not like '%WAREHOUSE_FORBIDDEN%' then raise; end if; caught:=true; end; assert caught,'unrelated user forbidden';
  j:=public.platform_reset_warehouse_claim(id,'98600000-0000-0000-0000-000000000001'); token:=(j->>'token')::uuid;
  caught:=false; begin perform public.platform_reset_warehouse_claim(id,'98600000-0000-0000-0000-000000000001'); exception when others then if sqlerrm not like '%WAREHOUSE_BUSY%' then raise; end if; caught:=true; end; assert caught,'lease';
  caught:=false; begin perform public.platform_reset_warehouse_finish(id,gen_random_uuid(),true,'{}'); exception when others then if sqlerrm not like '%LEASE_INVALID%' then raise; end if; caught:=true; end; assert caught,'wrong token';
  perform public.platform_reset_warehouse_finish(id,token,true,'{"rows_deleted":12}'::jsonb);
  j:=public.platform_reset_warehouse_claim(id,'98600000-0000-0000-0000-000000000001'); assert (j->>'done')::bool,'already done';
  -- إعدادات المستودع فئة منفصلة: لا تطلب حذف السجلات، وتقبل إعادة المحاولة عند الفشل.
  j:=public.platform_reset_request(array['gps_warehouse_settings'],'تصفير'); id:=(j->>'id')::uuid;
  j:=public.platform_reset_warehouse_claim(id,'98600000-0000-0000-0000-000000000001'); token:=(j->>'token')::uuid;
  assert not (j->>'wipe_data')::bool and (j->>'reset_settings')::bool,'settings-only scope';
  perform public.platform_reset_warehouse_finish(id,token,false,null);
  j:=public.platform_reset_warehouse_claim(id,'98600000-0000-0000-0000-000000000001'); token:=(j->>'token')::uuid;
  perform public.platform_reset_warehouse_finish(id,token,true,'{"settings_reset":true}'::jsonb);
  assert not has_function_privilege('authenticated','public.platform_reset_warehouse_claim(uuid,uuid)','execute'),'claim service only';
  assert not has_function_privilege('authenticated','public.platform_reset_warehouse_finish(uuid,uuid,boolean,jsonb)','execute'),'finish service only';
end $$;
-- المعتمِد النهائي غير IT يستطيع إكمال طلبه؛ غير المعني لا يستطيع.
insert into auth.users(id,email) values('98600000-0000-0000-0000-000000000010','approver-warehouse@test.iq');
insert into public.user_roles(user_id,role) values('98600000-0000-0000-0000-000000000010','deputy_director');
insert into public.platform_reset_requests(id,status,categories,requested_cats,requested_by,executed_by,executed_at) values
 ('98600000-0000-0000-0000-000000000011','done',array['gps_warehouse'],array['gps_warehouse'],'98600000-0000-0000-0000-000000000001','98600000-0000-0000-0000-000000000010',now());
do $$ declare j jsonb; begin
 j:=public.platform_reset_warehouse_claim('98600000-0000-0000-0000-000000000011','98600000-0000-0000-0000-000000000010');
 assert not (j->>'done')::bool and (j->>'wipe_data')::bool,'approver may complete own approved request';
end $$;
-- إعادة فحص الرابط بعد حذف فئة الإعدادات تنشئ صف الحالة فقط، لا مفاتيح أو إعدادات.
delete from public.gps_warehouse_link where id=1;
select set_config('auth.role','service_role',false);
select public.gps_warehouse_link_record('ping',true,'{"reset_rows":4,"reset_files":0,"reset_settings_rows":1}'::jsonb,null,null);
do $$ begin assert exists(select 1 from public.gps_warehouse_link where id=1 and last_ping_ok and (ping->>'reset_rows')::int=4),'link recreated'; end $$;
