begin;
do $$declare officer uuid:='10000000-0000-0000-0000-000000000071';manager uuid:='10000000-0000-0000-0000-000000000072';msg uuid;cid uuid;reviewed integer;begin
 insert into auth.users(id,email)values(officer,'review-officer@test.iq'),(manager,'review-manager@test.iq');
 insert into public.user_roles(user_id,role)values(officer,'complaints_officer'),(manager,'department_manager');
 insert into public.complaint_inbox_messages(internet_message_id,sender_email,subject,source_sector,received_at,import_status)values('review-ticket@test','sender@test.iq','تذكرة تدقيق ذرية','karrada','2026-09-06 09:00+00','ready')returning id into msg;
 insert into public.complaints(inbox_message_id,sector,status,created_by,sender_email,received_at)values(msg,'karrada','quality_review',officer,'sender@test.iq','2026-09-06 09:00+00')returning id into cid;
 insert into public.complaint_items(complaint_id,sequence_no,title,municipal_center,neighborhood,alley,assigned_to,status)values(cid,1,'تراكم نفايات','الكرادة','901','1',manager,'processed'),(cid,2,'أنقاض','الكرادة','901','2',manager,'quality_review');
 perform set_config('request.jwt.claims',json_build_object('sub',officer,'role','authenticated')::text,true);set local role authenticated;
 reviewed:=public.complaint_review_assignment_ticket(cid,manager,true,'تمت مراجعة الصورتين');
 if reviewed<>2 or(select count(*)from public.complaint_items where complaint_id=cid and status='approved')<>2 then raise exception 'COMPLAINT_TICKET_ATOMIC_REVIEW_FAIL';end if;
 reset role;perform set_config('request.jwt.claims',json_build_object('sub',manager,'role','authenticated')::text,true);set local role authenticated;
 begin perform public.complaint_review_assignment_ticket(cid,manager,true,null);raise exception 'MANAGER_REVIEW_NOT_BLOCKED';exception when others then if sqlerrm='MANAGER_REVIEW_NOT_BLOCKED'then raise;end if;end;
 raise notice '✅ تدقيق التذكرة: اعتماد ذري لكل الصور + منع مسؤول القسم';
end $$;
rollback;
