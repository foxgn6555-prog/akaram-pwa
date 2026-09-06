-- ضغط واقعي: بريد واحد = 60 صورة/شكوى، موزعة 15 لكل واحد من أربعة مسؤولين، ثم تقرير يومي موحد.
do $$
declare
  v_officer uuid:=gen_random_uuid();v_managers uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  v_message uuid;v_entries jsonb;v_items uuid[];v_result jsonb;v_analytics jsonb;v_report uuid;v_count integer;v_manager uuid;v_item uuid;v_idx integer;
begin
  insert into auth.users(id,email) values(v_officer,'stress-officer@test.iq');
  insert into public.user_roles(user_id,role) values(v_officer,'complaints_officer');
  for v_idx in 1..4 loop
    insert into auth.users(id,email) values(v_managers[v_idx],format('stress-manager-%s@test.iq',v_idx));
    insert into public.user_roles(user_id,role) values(v_managers[v_idx],'department_manager');
  end loop;
  insert into public.complaint_inbox_messages(internet_message_id,sender_email,sender_name,recipients,subject,received_at,source_sector,import_status,attachment_count)
    values('<stress-60@test.iq>','municipality@test.iq','بلدية الكرادة',array['complaints@test.iq'],'ستون موقعاً','2026-09-05 09:00:00+03'::timestamptz,'karrada','ready',60)
    returning id into v_message;
  insert into public.complaint_media(inbox_message_id,media_kind,storage_path,original_name,mime_type,size_bytes,sha256,source)
    select v_message,'email_attachment',format('inbox/%s/%s.jpg',v_message,g),format('%s.jpg',g),'image/jpeg',1000,md5(g::text),'email'
    from generate_series(1,60)g;
  select jsonb_agg(jsonb_build_object('mediaId',id,'neighborhood',format('%03s',900+rn),'alley',rn::text) order by rn)
    into v_entries from(select id,row_number()over(order by created_at,id)::integer rn from public.complaint_media where inbox_message_id=v_message)s;
  perform set_config('role','authenticated',true);perform set_config('request.jwt.claim.sub',v_officer::text,true);
  select public.complaint_batch_create_items_from_inbox(v_message,v_entries)into v_result;
  if (v_result->>'createdCount')::integer<>60 or (v_result->>'remainingCount')::integer<>0 then
    raise exception 'STRESS FAIL — expected 60 created and zero remaining: %',v_result;end if;
  select array_agg(id order by sequence_no)into v_items from public.complaint_items where complaint_id=(v_result->>'complaintId')::uuid;
  if cardinality(v_items)<>60 or(select count(distinct media_code)from public.complaint_media where inbox_message_id=v_message)<>60 then
    raise exception 'STRESS FAIL — tickets or media codes are not exactly 60';end if;
  for v_idx in 1..4 loop
    if public.complaint_assign_items(v_items[((v_idx-1)*15)+1:v_idx*15],v_managers[v_idx])<>15 then
      raise exception 'STRESS FAIL — manager % assignment is not 15',v_idx;end if;
  end loop;
  for v_idx in 1..4 loop
    v_manager:=v_managers[v_idx];perform set_config('request.jwt.claim.sub',v_manager::text,true);
    select count(*)into v_count from public.complaint_items;
    if v_count<>15 then raise exception 'STRESS FAIL — manager % sees % items instead of 15',v_idx,v_count;end if;
    for v_item in select id from public.complaint_items order by sequence_no loop
      perform public.complaint_start_item(v_item);
      insert into public.complaint_media(item_id,media_kind,storage_path,original_name,mime_type,size_bytes,sha256,source,uploaded_by,is_active,captured_at)
        values(v_item,'after',format('item/%s/after/result.jpg',v_item),'after.jpg','image/jpeg',1200,md5(v_item::text||'after'),'gallery',v_manager,true,clock_timestamp());
      perform public.complaint_complete_item(v_item,'تمت المعالجة');
    end loop;
  end loop;
  perform set_config('request.jwt.claim.sub',v_officer::text,true);
  for v_item in select unnest(v_items)loop perform public.complaint_review_item(v_item,true,'مدقق');end loop;
  select public.complaint_prepare_daily_report('karrada',date '2026-09-05',null)into v_report;
  select count(*)into v_count from public.complaint_report_items where report_id=v_report and included;
  if v_count<>60 then raise exception 'STRESS FAIL — unified report contains % items instead of 60',v_count;end if;
  if not exists(select 1 from public.complaint_reports where id=v_report and 'municipality@test.iq'=any(recipients))then
    raise exception 'STRESS FAIL — original sender email is not a report recipient';end if;
  if (select count(*)from public.complaint_reports where sector='karrada'and report_date=date '2026-09-05')<>1 then
    raise exception 'STRESS FAIL — more than one daily report was created';end if;
  select public.complaint_analytics(date '2026-09-05',date '2026-09-05','karrada')into v_analytics;
  if (v_analytics#>>'{summary,total}')::integer<>60 or(v_analytics#>>'{summary,approved}')::integer<>60 then
    raise exception 'STRESS FAIL — analytics do not contain 60 approved complaints: %',v_analytics;end if;
  raise notice '✅ STRESS 60: 60 صورة→60 تذكرة، 4 مسؤولين×15، عزل كامل، معالجة واعتماد، تقرير وتحليلات موحدة 60';
end $$;
