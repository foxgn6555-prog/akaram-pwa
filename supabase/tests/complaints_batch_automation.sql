-- أتمتة الدفعات: صورة واحدة = تذكرة، كشف تكرار عالمي، وذرية الإسناد.
begin;
do $$
declare
  v_officer uuid:='41000000-0000-0000-0000-000000000053';
  v_manager uuid:='42000000-0000-0000-0000-000000000053';
  v_message uuid; v_m1 uuid; v_m2 uuid; v_new_media uuid; v_result jsonb; v_items uuid[]; v_count integer;
begin
  insert into auth.users(id,email) values(v_officer,'batch-officer@test.iq'),(v_manager,'batch-manager@test.iq');
  insert into public.user_roles(user_id,role) values(v_officer,'complaints_officer'),(v_manager,'department_manager');
  insert into public.complaint_inbox_messages(internet_message_id,sender_email,recipients,source_sector,received_at,import_status,attachment_count)
    values('<batch-53@test>','karrada@test.iq',array['karrada@test.iq'],'karrada',now(),'ready',2) returning id into v_message;
  insert into public.complaint_media(inbox_message_id,media_kind,storage_path,original_name,mime_type,sha256,source)
    values(v_message,'email_attachment','inbox/batch/a.jpg','a.jpg','image/jpeg','same-hash','email') returning id into v_m1;
  insert into public.complaint_media(inbox_message_id,media_kind,storage_path,original_name,mime_type,sha256,source)
    values(v_message,'email_attachment','inbox/batch/b.jpg','b.jpg','image/jpeg','same-hash','email') returning id into v_m2;
  if exists(select 1 from public.complaint_media where id in(v_m1,v_m2) and media_code is null)
    then raise exception 'BATCH FAIL — media code missing'; end if;
  if (select count(distinct media_code) from public.complaint_media where id in(v_m1,v_m2))<>2
    then raise exception 'BATCH FAIL — media code not unique'; end if;

  perform set_config('role','authenticated',true);perform set_config('request.jwt.claim.sub',v_officer::text,true);
  v_result:=public.complaint_batch_create_items_from_inbox(v_message,jsonb_build_array(
    jsonb_build_object('mediaId',v_m1,'neighborhood','901','alley','1'),
    jsonb_build_object('mediaId',v_m2,'neighborhood','902','alley','2')));
  if (v_result->>'createdCount')::int<>2 or (v_result->>'remainingCount')::int<>0
    then raise exception 'BATCH FAIL — wrong result %',v_result; end if;
  select array_agg(id order by sequence_no) into v_items from public.complaint_items
    where complaint_id=(v_result->>'complaintId')::uuid;
  if array_length(v_items,1)<>2 then raise exception 'BATCH FAIL — image was not split per ticket'; end if;
  if exists(select 1 from public.complaint_media where id in(v_m1,v_m2) and (item_id is null or media_kind<>'before'))
    then raise exception 'BATCH FAIL — media not linked as before'; end if;
  if not exists(select 1 from public.complaint_inbox_messages where id=v_message and import_status='imported')
    then raise exception 'BATCH FAIL — message progress incorrect'; end if;

  -- إعادة استخدام الصورة مرفوضة ولا تنشئ عنصراً إضافياً.
  begin
    perform public.complaint_batch_create_items_from_inbox(v_message,jsonb_build_array(
      jsonb_build_object('mediaId',v_m1,'neighborhood','999','alley','9')));
    raise exception 'BATCH FAIL — reused media accepted';
  exception when others then if sqlerrm='BATCH FAIL — reused media accepted' then raise; end if; end;
  select count(*) into v_count from public.complaint_items where id=any(v_items);
  if v_count<>2 then raise exception 'BATCH FAIL — failed call wrote partial data'; end if;

  if public.complaint_assign_items(v_items,v_manager)<>2 then raise exception 'BATCH FAIL — assignment count'; end if;
  if exists(select 1 from public.complaint_items where id=any(v_items) and (assigned_to<>v_manager or status<>'assigned'))
    then raise exception 'BATCH FAIL — batch assignment incomplete'; end if;
  reset role;perform set_config('role','service_role',true);
  if (select count(*) from public.notifications where user_id=v_manager and link='/manager/complaints')<>1
    then raise exception 'BATCH FAIL — expected one batch notification'; end if;
  perform set_config('role','authenticated',true);perform set_config('request.jwt.claim.sub',v_officer::text,true);

  perform public.complaint_update_item_during_review(v_items[1],'905','8','الكرادة',null,'تصحيح الكتاب');
  if not exists(select 1 from public.complaint_items where id=v_items[1] and neighborhood='905' and alley='8')
    then raise exception 'BATCH FAIL — reviewed location not updated'; end if;
  select public.complaint_replace_item_media(v_items[1],v_m1,'item/review/new.jpg','new.jpg','image/jpeg',100,'new-hash','صورة أوضح') into v_new_media;
  if not exists(select 1 from public.complaint_media where id=v_m1 and not is_active and superseded_by=v_new_media)
    or not exists(select 1 from public.complaint_media where id=v_new_media and is_active)
    or not exists(select 1 from public.complaint_media_revisions where old_media_id=v_m1 and new_media_id=v_new_media and actor_id=v_officer)
    then raise exception 'BATCH FAIL — media revision audit incomplete'; end if;
  perform set_config('request.jwt.claim.sub',v_manager::text,true);
  select count(*) into v_count from public.complaint_media where id=v_m1;
  if v_count<>0 then raise exception 'BATCH FAIL — manager can read superseded media'; end if;
  select count(*) into v_count from public.complaint_media where id=v_new_media;
  if v_count<>1 then raise exception 'BATCH FAIL — manager cannot read active replacement'; end if;
  raise notice '✅ BATCH: أكواد فريدة/تذكرة لكل صورة/منع إعادة الاستخدام/إسناد ذري/تصحيح مدقق';
end $$;
rollback;
