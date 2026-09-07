-- ضغط عرض بريد كبير: 500 صورة مع تحميل صفحة واحدة فقط وعدادات كاملة.
do $$
declare
  v_officer uuid:=gen_random_uuid();
  v_message uuid;
  v_page jsonb;
begin
  insert into auth.users(id,email) values(v_officer,'large-media-officer@test.iq');
  insert into public.user_roles(user_id,role) values(v_officer,'complaints_officer');
  insert into public.complaint_inbox_messages(internet_message_id,sender_email,recipients,subject,received_at,source_sector,import_status,attachment_count)
  values('<large-500@test.iq>','municipality@test.iq',array['complaints@test.iq'],'500 صورة',now(),'karrada','ready',500)
  returning id into v_message;
  insert into public.complaint_media(inbox_message_id,media_kind,storage_path,original_name,mime_type,size_bytes,sha256,source)
  select v_message,'email_attachment',format('inbox/%s/%s.jpg',v_message,g),format('%s.jpg',g),'image/jpeg',1000,md5(v_message::text||g::text),'email'
  from generate_series(1,500)g;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_officer::text,true);
  v_page:=public.complaint_inbox_media_page(v_message,48,48);
  if jsonb_array_length(v_page->'rows')<>48
     or (v_page->>'totalCount')::integer<>500
     or (v_page->>'imageCount')::integer<>500
     or (v_page->>'remainingImageCount')::integer<>500 then
    raise exception 'LARGE_MEDIA_PAGE_FAILED: %',v_page;
  end if;
  raise notice '✅ بريد 500 صورة: العدادات كاملة والواجهة تسترجع 48 فقط لكل صفحة';
end $$;
