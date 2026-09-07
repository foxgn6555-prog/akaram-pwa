begin;
do $$declare officer uuid:='10000000-0000-0000-0000-000000000081';manager uuid:='10000000-0000-0000-0000-000000000082';msg uuid;cid uuid;iid uuid;blocked integer:=0;begin
 insert into auth.users(id,email)values(officer,'after-required-officer@test.iq'),(manager,'after-required-manager@test.iq');
 insert into public.user_roles(user_id,role)values(officer,'complaints_officer'),(manager,'department_manager');
 insert into public.complaint_inbox_messages(internet_message_id,sender_email,subject,source_sector,received_at,import_status)values('after-required@test','sender@test.iq','اختبار صورة المعالجة','karrada','2026-09-07 09:00+00','ready')returning id into msg;
 insert into public.complaints(inbox_message_id,sector,status,created_by,sender_email,received_at)values(msg,'karrada','quality_review',officer,'sender@test.iq','2026-09-07 09:00+00')returning id into cid;
 insert into public.complaint_items(complaint_id,sequence_no,title,municipal_center,neighborhood,alley,assigned_to,status)values(cid,1,'تراكم نفايات','الكرادة','901','1',manager,'processed')returning id into iid;
 perform set_config('request.jwt.claims',json_build_object('sub',officer,'role','authenticated')::text,true);set local role authenticated;
 begin perform public.complaint_review_item(iid,true,'فحص');exception when others then if sqlerrm like '%COMPLAINT_AFTER_MEDIA_REQUIRED%'then blocked:=blocked+1;else raise;end if;end;
 begin perform public.complaint_review_assignment_ticket(cid,manager,true,'فحص');exception when others then if sqlerrm like '%COMPLAINT_AFTER_MEDIA_REQUIRED%'then blocked:=blocked+1;else raise;end if;end;
 if blocked<>2 or(select status from public.complaint_items where id=iid)<>'processed'then raise exception 'APPROVAL_WITHOUT_AFTER_NOT_BLOCKED';end if;
 reset role;insert into public.complaint_media(item_id,media_kind,storage_path,original_name,mime_type,size_bytes,sha256,source,uploaded_by,media_code,is_active)values(iid,'after','item/'||iid::text||'/after/required.jpg','required.jpg','image/jpeg',3,repeat('b',64),'gallery',manager,'AFTER-'||replace(iid::text,'-',''),true);
 perform set_config('request.jwt.claims',json_build_object('sub',officer,'role','authenticated')::text,true);set local role authenticated;
 perform public.complaint_review_assignment_ticket(cid,manager,true,'اكتملت المطابقة');
 if(select status from public.complaint_items where id=iid)<>'approved'then raise exception 'APPROVAL_WITH_AFTER_FAILED';end if;
 raise notice '✅ صورة المعالجة إلزامية في الخادم قبل اعتماد الموقع أو التذكرة';
end $$;
rollback;
