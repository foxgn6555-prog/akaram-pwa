do $$declare
 u uuid:='98000000-0000-0000-0000-000000000001';other_u uuid:='98000000-0000-0000-0000-000000000002';
 sid uuid;expired_sid uuid;nid uuid;expired_nid uuid;did uuid;r record;n bigint;before_count bigint;was_clicked boolean;c public.vehicle_maintenance_cases;
begin
 insert into auth.users(id,email)values(u,'push-resilience@x.iq'),(other_u,'push-other@x.iq');insert into public.user_roles(user_id,role)values(u,'it_admin');
 perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',u::text,false);
 sid:=public.notification_register_push('https://push.example.test/resilience/1234567890',repeat('a',65),repeat('b',24),null,'Test Browser','ios','iPhone الاختبار');
 execute'reset role';
 insert into public.notification_push_subscriptions(user_id,endpoint,p256dh,auth_key,expiration_time,platform)
 values(u,'https://push.example.test/expired/1234567890',repeat('c',65),repeat('d',24),(extract(epoch from now()-interval'1 hour')*1000)::bigint,'android')returning id into expired_sid;
 insert into public.notifications(user_id,title,body,type,category,priority,link)values(u,'تفاعل Push','اختبار النقرة','info','system','normal','/manager/vehicle-trips')returning id into nid;
 insert into public.notifications(user_id,title,body,type,category,priority,link)values(u,'اشتراك منتهي','لا يرسل','info','system','normal','/manager/vehicle-trips')returning id into expired_nid;
 select count(*)into n from public.notification_push_deliveries where notification_id=expired_nid and subscription_id=expired_sid;if n<>0 then raise exception'EXPIRED_SUBSCRIPTION_QUEUED';end if;
 perform set_config('role','service_role',false);perform set_config('request.jwt.claims','{"role":"service_role"}',false);
 select*into r from public.notification_claim_push(10,u)where notification_id=nid and subscription_id=sid;did:=r.delivery_id;if did is null then raise exception'PUSH_CLAIM_WITH_NOTIFICATION_ID_FAIL';end if;
 update public.notification_push_deliveries set claimed_at=now()-interval'6 minutes'where id=did;
 select*into r from public.notification_claim_push(10,u)where delivery_id=did;if r.delivery_id is null then raise exception'STALE_PUSH_NOT_RECOVERED';end if;
 perform public.notification_finish_push(did,true,201,null,false);
 execute'reset role';perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',other_u::text,false);
 was_clicked:=public.notification_record_push_interaction(did);if was_clicked then raise exception'OTHER_USER_RECORDED_PUSH_CLICK';end if;
 perform set_config('request.jwt.claim.sub',u::text,false);was_clicked:=public.notification_record_push_interaction(did);if not was_clicked then raise exception'OWNER_PUSH_CLICK_FAIL';end if;
 execute'reset role';select count(*)into n from public.notification_push_deliveries d join public.notifications x on x.id=d.notification_id where d.id=did and d.clicked_at is not null and x.is_read and x.read_at is not null;if n<>1 then raise exception'PUSH_CLICK_READ_TRACKING_FAIL';end if;
 perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',u::text,false);
 select count(*)into n from public.notification_push_devices()where id=sid and sent_count>=1 and last_clicked_at is not null and health='healthy';if n<>1 then raise exception'PUSH_DEVICE_HEALTH_FAIL';end if;
 select count(*)into n from public.notification_delivery_operations(24)where active_devices>=1 and sent>=1 and clicked>=1;if n<>1 then raise exception'PUSH_OPERATIONS_SUMMARY_FAIL';end if;
 if not public.notification_disable_push_device(sid)then raise exception'PUSH_DEVICE_DISABLE_FAIL';end if;
 if public.notification_disable_push_device(expired_sid)then raise exception'EXPIRED_DEVICE_DISABLE_SHOULD_BE_FALSE';end if;
 execute'reset role';
 select*into c from public.vehicle_maintenance_cases where manager_id is not null order by reported_at desc limit 1;
 if c.id is not null then
  update public.vehicle_maintenance_cases set status='in_repair',progress=50 where id=c.id;
  select count(*)into before_count from public.notifications where entity_id=c.id and dedupe_key like'maintenance_case:%:progress:in_repair:50';
  if before_count<1 then raise exception'MAINTENANCE_PROGRESS_NOTIFICATION_FAIL';end if;
  update public.vehicle_maintenance_cases set progress=55 where id=c.id;
  select count(*)into n from public.notifications where entity_id=c.id and dedupe_key like'maintenance_case:%:progress:in_repair:50';
  if n<>before_count then raise exception'MAINTENANCE_PROGRESS_DEDUPE_FAIL';end if;
 end if;
 raise notice'✅ موثوقية Push: انتهاء الاشتراك/استعادة التعليق/العزل/النقرة/القراءة/صحة الجهاز وتنبيه تقدم الصيانة ناجحة';
end$$;
