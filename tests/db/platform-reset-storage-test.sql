-- نطاق التخزين: لا حذف قبل التنفيذ؛ الملفات الجديدة أو المعدلة تبقى؛ إعادة المحاولة.
set client_min_messages=warning;
insert into auth.users(id,email) values('98400000-0000-0000-0000-000000000001','storage-reset@test.iq');
insert into public.user_roles(user_id,role) values('98400000-0000-0000-0000-000000000001','it_admin');
select set_config('auth.user_id','98400000-0000-0000-0000-000000000001',false);
insert into storage.buckets(id,name) values ('reset-test','reset-test') on conflict do nothing;
insert into public.platform_reset_requests(id,status,categories,requested_cats,requested_by,storage_buckets)
 values('98400000-0000-0000-0000-000000000002','pending_approval',array['complaints'],array['complaints'],'98400000-0000-0000-0000-000000000001',array['reset-test']);
insert into storage.objects(id,bucket_id,name,created_at,updated_at) values
 ('98400000-0000-0000-0000-000000000003','reset-test','old/file.jpg',now()-interval '2 days',now()-interval '2 days'),
 ('98400000-0000-0000-0000-000000000004','reset-test','new/file.jpg',now()+interval '1 day',now()+interval '1 day'),
 ('98400000-0000-0000-0000-000000000005','reset-test','changed/file.jpg',now()-interval '2 days',now()+interval '1 day'),
 ('98400000-0000-0000-0000-000000000008','reset-test','unknown/file.jpg',null,null);
do $$ declare j jsonb; n int; caught bool:=false; begin
 begin perform public.platform_reset_storage_finish('98400000-0000-0000-0000-000000000002',0);
 exception when others then if sqlerrm not like '%RESET_NOT_EXECUTED%' then raise; end if; caught:=true; end;
 assert caught,'pending cleanup must fail';
 assert not app.platform_reset_storage_allowed('reset-test',now()-interval '2 days',now()-interval '2 days'),'pending policy';
 update public.platform_reset_requests set status='done',executed_at=now()-interval '1 day' where id='98400000-0000-0000-0000-000000000002';
 assert app.platform_reset_storage_allowed('reset-test',now()-interval '2 days',now()-interval '2 days'),'old file authorized';
 assert not app.platform_reset_storage_allowed('reset-test',now()+interval '1 day',now()+interval '1 day'),'new file protected';
 assert not app.platform_reset_storage_allowed('reset-test',now()-interval '2 days',now()+interval '1 day'),'changed file protected';
 select count(*) into n from public.platform_reset_storage_objects('98400000-0000-0000-0000-000000000002'); assert n=1,'exactly old file';
 j:=public.platform_reset_storage_finish('98400000-0000-0000-0000-000000000002',0); assert not (j->>'done')::bool,'unfinished remains';
 delete from storage.objects where id='98400000-0000-0000-0000-000000000003';
 j:=public.platform_reset_storage_finish('98400000-0000-0000-0000-000000000002',1); assert not (j->>'done')::bool and (j->>'remaining')::int=1,'unknown date must not be falsely complete';
 delete from storage.objects where id='98400000-0000-0000-0000-000000000008';
 j:=public.platform_reset_storage_finish('98400000-0000-0000-0000-000000000002',0); assert (j->>'done')::bool,'finished';
 assert (select count(*) from storage.objects where bucket_id='reset-test')=2,'new files kept';
 assert not app.platform_reset_storage_allowed('reset-test',now()-interval '2 days',now()-interval '2 days'),'authorization closed';
 j:=public.platform_reset_storage_finish('98400000-0000-0000-0000-000000000002',1); assert (j->>'done')::bool,'idempotent';
 assert (select storage_deleted=1 from public.platform_reset_requests where id='98400000-0000-0000-0000-000000000002'),'retry count';
end $$;

-- المنفّذ غير IT يستطيع إكمال طلبه وحده بعد الاعتماد، وليس تنظيف طلب آخر.
insert into auth.users(id,email) values('98400000-0000-0000-0000-000000000011','approver@test.iq');
insert into public.user_roles(user_id,role) values('98400000-0000-0000-0000-000000000011','deputy_director');
insert into public.platform_reset_requests(id,status,categories,requested_cats,requested_by,executed_by,executed_at,storage_buckets) values
 ('98400000-0000-0000-0000-000000000012','done',array['complaints'],array['complaints'],'98400000-0000-0000-0000-000000000001','98400000-0000-0000-0000-000000000011',now(),array['reset-test']),
 ('98400000-0000-0000-0000-000000000013','done',array['complaints'],array['complaints'],'98400000-0000-0000-0000-000000000001','98400000-0000-0000-0000-000000000001',now(),array['reset-test']);
select set_config('auth.user_id','98400000-0000-0000-0000-000000000011',false);
do $$ declare caught boolean:=false; j jsonb; begin
 j:=public.platform_reset_detail('98400000-0000-0000-0000-000000000012'); assert (j->>'can_cleanup')::bool,'executor detail access';
 perform * from public.platform_reset_storage_objects('98400000-0000-0000-0000-000000000012');
 caught:=false; begin perform * from public.platform_reset_storage_objects('98400000-0000-0000-0000-000000000013'); exception when others then if sqlerrm not like '%IT_FORBIDDEN%' then raise; end if; caught:=true; end; assert caught,'other request forbidden';
end $$;
-- تجربة RLS فعلياً بدور authenticated: المنفّذ يحذف ملف طلبه المؤهل فقط.
reset role;
insert into storage.objects(id,bucket_id,name,created_at,updated_at) values
 ('98400000-0000-0000-0000-000000000014','reset-test','executor/old.jpg',now()-interval '2 days',now()-interval '2 days');
set role authenticated;
delete from storage.objects where id='98400000-0000-0000-0000-000000000014';
reset role;
do $$ begin assert not exists(select 1 from storage.objects where id='98400000-0000-0000-0000-000000000014'),'executor RLS deletion';
 assert exists(select 1 from storage.objects where id='98400000-0000-0000-0000-000000000004'),'new file untouched'; end $$;
