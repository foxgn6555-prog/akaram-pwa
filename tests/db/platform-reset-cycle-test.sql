-- 00398-ج: ترابط حقيقي بين تقرير الشكاوى وإرساله؛ لا تلمس فئة المخزن غير المختارة
set client_min_messages = warning;
insert into auth.users (id,email) values ('98100000-0000-0000-0000-000000000001','reset-cycle@test.iq');
insert into public.user_roles (user_id,role) values ('98100000-0000-0000-0000-000000000001','it_admin');
select set_config('auth.user_id','98100000-0000-0000-0000-000000000001',false);
insert into public.ops_store_items(id,name,unit,qty_on_hand) values ('98100000-0000-0000-0000-000000000002','يبقى','قطعة',1);
insert into public.complaint_reports(id,report_date,sector,title,created_by) values ('98100000-0000-0000-0000-000000000003','2020-01-01','karrada','تقرير','98100000-0000-0000-0000-000000000001');
insert into public.complaint_email_deliveries(id,sender,recipients,subject,sent_by,report_id) values ('98100000-0000-0000-0000-000000000004','a@a.iq',array['b@b.iq'],'إرسال','98100000-0000-0000-0000-000000000001','98100000-0000-0000-0000-000000000003');
update public.complaint_reports set delivery_id='98100000-0000-0000-0000-000000000004' where id='98100000-0000-0000-0000-000000000003';
do $$ declare j jsonb; begin
  j := public.platform_reset_request(array['complaints'], 'تصفير');
  assert j->>'status'='done', j::text;
  assert not exists (select 1 from public.complaint_reports), 'reports remain';
  assert not exists (select 1 from public.complaint_email_deliveries), 'deliveries remain';
  assert exists (select 1 from public.ops_store_items where id='98100000-0000-0000-0000-000000000002'), 'unselected warehouse removed';
  assert (j->'result'->'per_table'->>'complaint_reports')::int=1, 'report count';
  assert (j->'result'->'per_table'->>'complaint_email_deliveries')::int=1, 'delivery count';
  assert (j->'result'->>'rows_deleted')::int >= 2, 'total count';
end $$;
-- الحذف التتابعي يُحتسب حتى إن حُذف الابن بواسطة مفتاح أجنبي قبل دوره.
insert into public.ops_store_movements(id,item_id,kind,qty,balance_after) values ('98100000-0000-0000-0000-000000000005','98100000-0000-0000-0000-000000000002','in',1,1);
do $$ declare j jsonb; begin
  j := public.platform_reset_request(array['warehouse'], 'تصفير');
  assert (j->'result'->'per_table'->>'ops_store_items')::int=1, 'parent count';
  assert (j->'result'->'per_table'->>'ops_store_movements')::int=1, 'cascade child count';
  assert (j->'result'->>'rows_deleted')::int=2, 'cascade total';
end $$;
-- المسار الحقيقي من دور authenticated وليس مستخدم قاعدة البيانات المتفوق.
insert into public.complaint_reports(id,report_date,sector,title,created_by) values ('98100000-0000-0000-0000-000000000010','2020-01-02','karrada','تقرير حقيقي','98100000-0000-0000-0000-000000000001');
insert into public.complaint_email_deliveries(id,sender,recipients,subject,sent_by,report_id) values ('98100000-0000-0000-0000-000000000011','a@a.iq',array['b@b.iq'],'إرسال','98100000-0000-0000-0000-000000000001','98100000-0000-0000-0000-000000000010');
update public.complaint_reports set delivery_id='98100000-0000-0000-0000-000000000011' where id='98100000-0000-0000-0000-000000000010';
set role authenticated;
select public.platform_reset_request(array['complaints'],'تصفير');
reset role;
do $$ begin
  assert not exists(select 1 from public.complaint_reports where id='98100000-0000-0000-0000-000000000010'), 'authenticated reset failed';
  assert not exists(select 1 from public.complaint_email_deliveries where id='98100000-0000-0000-0000-000000000011'), 'authenticated delivery remains';
end $$;
-- حلقة إلزامية مستحدثة لا يمكن فكها: فشل آمن وتراجع كامل، لا TRUNCATE ولا نتائج جزئية.
insert into public.ops_store_items(id,name,unit,qty_on_hand) values ('98100000-0000-0000-0000-000000000006','لا يحذف','قطعة',1);
insert into public.ops_store_movements(id,item_id,kind,qty,balance_after) values ('98100000-0000-0000-0000-000000000007','98100000-0000-0000-0000-000000000006','in',1,1);
alter table public.ops_store_items add column zz_cycle uuid references public.ops_store_movements(id);
update public.ops_store_items set zz_cycle='98100000-0000-0000-0000-000000000007' where id='98100000-0000-0000-0000-000000000006';
alter table public.ops_store_items alter column zz_cycle set not null;
alter table public.ops_store_movements drop constraint ops_store_movements_item_id_fkey;
alter table public.ops_store_movements add constraint ops_store_movements_item_id_fkey foreign key (item_id) references public.ops_store_items(id) on delete restrict;
do $$ declare caught boolean := false; old_requests int; begin
  select count(*) into old_requests from public.platform_reset_requests;
  begin
    perform public.platform_reset_request(array['warehouse'],'تصفير');
  exception when others then
    if sqlerrm not like '%RESET_CYCLE%' then raise; end if;
    caught := true;
  end;
  assert caught, 'must fail safely for mandatory cycle';
  assert exists(select 1 from public.ops_store_items where id='98100000-0000-0000-0000-000000000006'), 'rollback item';
  assert exists(select 1 from public.ops_store_movements where id='98100000-0000-0000-0000-000000000007'), 'rollback movement';
  assert (select count(*) from public.platform_reset_requests)=old_requests, 'rollback request';
  assert not exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname in ('ops_store_items','ops_store_movements') and not t.tgisinternal and t.tgenabled='D'), 'rollback triggers';
end $$;
