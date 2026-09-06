-- تذكرة البريد/المسؤول والمعالجة الجماعية، وتقارير البريد واليوم معاً.
begin;
do $$
declare
 officer uuid:='10000000-0000-0000-0000-000000000061';manager uuid:='20000000-0000-0000-0000-000000000061';other_manager uuid:='30000000-0000-0000-0000-000000000061';m1 uuid;m2 uuid;c1 uuid;c2 uuid;i1 uuid;i2 uuid;i3 uuid;i4 uuid;t uuid;r_email1 uuid;r_email2 uuid;r_daily uuid;n integer;rejected boolean:=false;
begin
 insert into auth.users(id,email)values(officer,'ticket-officer@akram.iq'),(manager,'ticket-manager@akram.iq'),(other_manager,'ticket-other@akram.iq');
 insert into public.user_roles(user_id,role)values(officer,'complaints_officer'),(manager,'department_manager'),(other_manager,'department_manager');
 insert into public.complaint_inbox_messages(internet_message_id,sender_email,reply_to,subject,source_sector,received_at,import_status)values('ticket-mail-1','karrada@test.iq','reply@test.iq','حملة تنظيف أولى','karrada','2026-09-06 07:00+00','ready')returning id into m1;
 insert into public.complaint_inbox_messages(internet_message_id,sender_email,subject,source_sector,received_at,import_status)values('ticket-mail-2','karrada2@test.iq','حملة تنظيف ثانية','karrada','2026-09-06 08:00+00','ready')returning id into m2;
 insert into public.complaints(inbox_message_id,sector,status,created_by,sender_email,received_at)values(m1,'karrada','under_review',officer,'reply@test.iq','2026-09-06 07:00+00')returning id into c1;
 insert into public.complaints(inbox_message_id,sector,status,created_by,sender_email,received_at)values(m2,'karrada','under_review',officer,'karrada2@test.iq','2026-09-06 08:00+00')returning id into c2;
 insert into public.complaint_items(complaint_id,sequence_no,title,municipal_center,neighborhood,alley)values(c1,1,'تراكم نفايات','بلدية الكرادة','901','1')returning id into i1;
 insert into public.complaint_items(complaint_id,sequence_no,title,municipal_center,neighborhood,alley)values(c1,2,'أنقاض','بلدية الكرادة','902','2')returning id into i2;
 insert into public.complaint_items(complaint_id,sequence_no,title,municipal_center,neighborhood,alley)values(c1,3,'مخلفات زراعية','بلدية الكرادة','903','3')returning id into i3;
 insert into public.complaint_items(complaint_id,sequence_no,title,municipal_center,neighborhood,alley,status)values(c2,1,'تراكم نفايات','بلدية الكرادة','904','4','approved')returning id into i4;
 perform set_config('role','authenticated',true);perform set_config('request.jwt.claim.sub',officer::text,true);perform public.complaint_assign_items(array[i1,i2,i3],manager);
 perform set_config('request.jwt.claim.sub',manager::text,true);select public.complaint_start_assignment_ticket(c1)into n;if n<>3 then raise exception 'TICKET START COUNT FAIL';end if;
 select public.complaint_complete_assignment_ticket(c1,jsonb_build_array(
  jsonb_build_object('itemId',i1,'storagePath','item/'||i1||'/after/1.jpg','originalName','1.jpg','mimeType','image/jpeg','sizeBytes',100,'sha256',repeat('a',64),'source','camera'),
  jsonb_build_object('itemId',i2,'storagePath','item/'||i2||'/after/2.jpg','originalName','2.jpg','mimeType','image/jpeg','sizeBytes',100,'sha256',repeat('b',64),'source','gallery'),
  jsonb_build_object('itemId',i3,'storagePath','item/'||i3||'/after/3.jpg','originalName','3.jpg','mimeType','image/jpeg','sizeBytes',100,'sha256',repeat('c',64),'source','gallery')),'تمت معالجة التذكرة')into n;
 if n<>3 or(select count(*)from public.complaint_items where complaint_id=c1 and status='processed')<>3 then raise exception 'TICKET COMPLETE FAIL';end if;
 if(select count(*)from public.complaint_media where item_id in(i1,i2,i3)and media_kind='after'and is_active)<>3 then raise exception 'TICKET MEDIA PAIR FAIL';end if;
 perform set_config('request.jwt.claim.sub',other_manager::text,true);begin perform public.complaint_start_assignment_ticket(c1);exception when others then rejected:=true;end;if not rejected then raise exception 'TICKET ISOLATION FAIL';end if;

 perform set_config('request.jwt.claim.sub',officer::text,true);update public.complaint_items set status='approved'where id in(i1,i2,i3);insert into public.complaint_templates(name,layout,is_default,is_active,created_by)values('قالب الاختبار','{}',true,true,officer)returning id into t;
 select public.complaint_prepare_email_report(m1,t)into r_email1;select public.complaint_prepare_email_report(m2,t)into r_email2;select public.complaint_prepare_daily_report('karrada','2026-09-06',t)into r_daily;
 if r_email1=r_email2 or r_email1=r_daily or r_email2=r_daily then raise exception 'REPORT SCOPE COLLISION';end if;
 if(select count(*)from public.complaint_report_items where report_id=r_email1 and included)<>3 then raise exception 'EMAIL REPORT ONE FAIL';end if;
 if(select count(*)from public.complaint_report_items where report_id=r_email2 and included)<>1 then raise exception 'EMAIL REPORT TWO FAIL';end if;
 if(select count(*)from public.complaint_report_items where report_id=r_daily and included)<>4 then raise exception 'DAILY REPORT FAIL';end if;
 if(select count(*)from public.complaint_reports where report_scope='email'and created_by=officer)<>2 or(select count(*)from public.complaint_reports where report_scope='daily'and created_by=officer)<>1 then raise exception 'REPORT SCOPE COUNT FAIL';end if;
 reset role;raise notice '✅ تذكرة موحدة: 3 أزواج ذرية + عزل + تقريران للبريد وتقرير يومي جامع';
end $$;
rollback;
