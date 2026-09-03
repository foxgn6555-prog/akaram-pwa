-- اختبار تكاملي فعلي لدورة الشكوى والتقرير والتسليم والأرشفة.
begin;
do $$
declare
  v_officer uuid := '11000000-0000-0000-0000-000000000049';
  v_manager uuid := '22000000-0000-0000-0000-000000000049';
  v_other uuid := '33000000-0000-0000-0000-000000000049';
  v_complaint uuid; v_item uuid; v_report uuid; v_delivery uuid; v_delivery2 uuid;
  v_date date := timezone('Asia/Baghdad',now())::date;
  v_status text; v_count integer; v_recipients text[]; v_started timestamptz;
begin
  insert into auth.users(id,email) values
    (v_officer,'e2e-officer@akram.iq'),(v_manager,'e2e-manager@akram.iq'),(v_other,'e2e-other@akram.iq');
  insert into public.user_roles(user_id,role) values
    (v_officer,'complaints_officer'),(v_manager,'department_manager'),(v_other,'department_manager');
  insert into public.complaint_contacts(sector,name,email,kind,created_by)
    values('karrada','نسخة إضافية','extra@akram.iq','recipient',v_officer);
  insert into public.complaints(sector,status,created_by,sender_email,received_at)
    values('karrada','under_review',v_officer,'sender@example.com',now()) returning id into v_complaint;
  insert into public.complaint_items(complaint_id,sequence_no,neighborhood,alley)
    values(v_complaint,1,'901','12') returning id into v_item;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_officer::text,true);
  perform public.complaint_assign_item(v_item,v_manager);

  -- مسؤول آخر لا يستطيع بدء موقع غير مسند إليه.
  perform set_config('request.jwt.claim.sub',v_other::text,true);
  begin perform public.complaint_start_item(v_item); raise exception 'E2E FAIL — manager isolation bypassed';
  exception when others then if sqlerrm='E2E FAIL — manager isolation bypassed' then raise; end if; end;

  perform set_config('request.jwt.claim.sub',v_manager::text,true);
  perform public.complaint_start_item(v_item);
  select started_at into v_started from public.complaint_items where id=v_item;
  begin perform public.complaint_complete_item(v_item,null); raise exception 'E2E FAIL — completed without after image';
  exception when others then if sqlerrm='E2E FAIL — completed without after image' then raise; end if; end;
  insert into public.complaint_media(item_id,media_kind,storage_path,original_name,mime_type,captured_at,source,uploaded_by)
    values(v_item,'after','item/'||v_item||'/after/first.jpg','first.jpg','image/jpeg',clock_timestamp(),'camera',v_manager);
  perform public.complaint_complete_item(v_item,'المعالجة الأولى');

  perform set_config('request.jwt.claim.sub',v_officer::text,true);
  begin perform public.complaint_review_item(v_item,false,null); raise exception 'E2E FAIL — returned without note';
  exception when others then if sqlerrm='E2E FAIL — returned without note' then raise; end if; end;
  perform public.complaint_review_item(v_item,false,'الصورة لا توضح الموقع');

  -- بعد الإرجاع لا تكفي الصورة القديمة؛ تبدأ دورة زمنية جديدة.
  perform set_config('request.jwt.claim.sub',v_manager::text,true);
  perform pg_sleep(0.01);
  perform public.complaint_start_item(v_item);
  select started_at into v_started from public.complaint_items where id=v_item;
  begin perform public.complaint_complete_item(v_item,null); raise exception 'E2E FAIL — old after image reused';
  exception when others then if sqlerrm='E2E FAIL — old after image reused' then raise; end if; end;
  insert into public.complaint_media(item_id,media_kind,storage_path,original_name,mime_type,captured_at,source,uploaded_by)
    values(v_item,'after','item/'||v_item||'/after/second.jpg','second.jpg','image/jpeg',clock_timestamp(),'camera',v_manager);
  perform public.complaint_complete_item(v_item,'المعالجة المصححة');

  perform set_config('request.jwt.claim.sub',v_officer::text,true);
  perform public.complaint_review_item(v_item,true,'مطابق');
  select public.complaint_prepare_daily_report('karrada',v_date,null) into v_report;
  select recipients into v_recipients from public.complaint_reports where id=v_report;
  if not ('sender@example.com'=any(v_recipients) and 'extra@akram.iq'=any(v_recipients)) then
    raise exception 'E2E FAIL — report recipients incomplete: %',v_recipients;
  end if;
  select count(*) into v_count from public.complaint_report_items where report_id=v_report and item_id=v_item and included;
  if v_count<>1 then raise exception 'E2E FAIL — daily item missing'; end if;

  -- حفظ المحرر ذرياً، مع رفض البريد غير الصالح دون تغيير جزئي.
  perform public.complaint_update_report_draft(v_report,'تقرير محرر',jsonb_build_object('accent','#123456'),
    array['SENDER@EXAMPLE.COM'],jsonb_build_array(jsonb_build_object('itemId',v_item,'displayOrder',1,'included',true,'slideLayout','{}'::jsonb)));
  if not exists(select 1 from public.complaint_reports where id=v_report and title='تقرير محرر'
    and recipients=array['sender@example.com'] and layout->>'accent'='#123456')
    then raise exception 'E2E FAIL — atomic editor save missing'; end if;
  begin
    perform public.complaint_update_report_draft(v_report,'عنوان لا يجب حفظه','{}',array['invalid-email'],
      jsonb_build_array(jsonb_build_object('itemId',v_item,'displayOrder',1,'included',true,'slideLayout','{}'::jsonb)));
    raise exception 'E2E FAIL — invalid recipient accepted';
  exception when others then if sqlerrm='E2E FAIL — invalid recipient accepted' then raise; end if; end;
  if exists(select 1 from public.complaint_reports where id=v_report and title='عنوان لا يجب حفظه')
    then raise exception 'E2E FAIL — invalid editor save changed report'; end if;

  -- محاكاة مولد التقرير بالخدمة، ثم اعتماد الموظف مع أثر تدقيق.
  reset role; perform set_config('role','service_role',true);
  update public.complaint_reports set status='quality_review',pptx_path='reports/'||v_report||'/daily.pptx' where id=v_report;
  perform set_config('role','authenticated',true); perform set_config('request.jwt.claim.sub',v_officer::text,true);
  perform public.complaint_approve_report(v_report);
  if not exists(select 1 from public.complaint_reports where id=v_report and status='approved' and approved_by=v_officer and approved_at is not null)
    then raise exception 'E2E FAIL — report approval audit missing'; end if;
  begin update public.complaint_report_items set included=false where report_id=v_report; raise exception 'E2E FAIL — approved report items changed';
  exception when others then if sqlerrm='E2E FAIL — approved report items changed' then raise; end if; end;
  begin perform public.complaint_update_report_draft(v_report,'مرفوض','{}',array['sender@example.com'],
    jsonb_build_array(jsonb_build_object('itemId',v_item,'displayOrder',1,'included',true,'slideLayout','{}'::jsonb)));
    raise exception 'E2E FAIL — approved report editor unlocked';
  exception when others then if sqlerrm='E2E FAIL — approved report editor unlocked' then raise; end if; end;
  begin update public.complaint_reports set status='archived' where id=v_report; raise exception 'E2E FAIL — client skipped report states';
  exception when others then if sqlerrm='E2E FAIL — client skipped report states' then raise; end if; end;

  -- فشل التسليم لا يؤرشف، ثم إعادة التوليد/الاعتماد والتسليم الناجح يؤرشف.
  reset role; perform set_config('role','service_role',true);
  insert into public.complaint_email_deliveries(report_id,sender,recipients,subject,status,sent_by)
    values(v_report,'complaints@akram.iq',v_recipients,'تقرير','queued',v_officer) returning id into v_delivery;
  update public.complaint_reports set status='sending',delivery_id=v_delivery where id=v_report;
  update public.complaint_email_deliveries set status='temporary_failure' where id=v_delivery;
  select status into v_status from public.complaint_reports where id=v_report;
  if v_status<>'failed' then raise exception 'E2E FAIL — failure did not mark report failed'; end if;
  if exists(select 1 from public.complaints where id=v_complaint and archived_at is not null)
    then raise exception 'E2E FAIL — archived after failed delivery'; end if;

  update public.complaint_reports set status='quality_review',pptx_path='reports/'||v_report||'/retry.pptx',approved_by=null,approved_at=null,delivery_id=null where id=v_report;
  perform set_config('role','authenticated',true); perform set_config('request.jwt.claim.sub',v_officer::text,true);
  perform public.complaint_approve_report(v_report);
  reset role; perform set_config('role','service_role',true);
  insert into public.complaint_email_deliveries(report_id,sender,recipients,subject,status,sent_by)
    values(v_report,'complaints@akram.iq',v_recipients,'تقرير','queued',v_officer) returning id into v_delivery2;
  update public.complaint_reports set status='sending',delivery_id=v_delivery2 where id=v_report;
  update public.complaint_email_deliveries set status='delivered',delivered_at=now() where id=v_delivery2;
  if not exists(select 1 from public.complaint_reports where id=v_report and status='archived' and archived_at is not null)
    then raise exception 'E2E FAIL — delivered report not archived'; end if;
  if not exists(select 1 from public.complaints where id=v_complaint and status='archived' and archived_at is not null)
    then raise exception 'E2E FAIL — delivered complaint not archived'; end if;

  -- التقرير غير مرئي لمسؤول القسم والحذف الفيزيائي محظور حتى على الخدمة.
  perform set_config('role','authenticated',true); perform set_config('request.jwt.claim.sub',v_manager::text,true);
  select count(*) into v_count from public.complaint_reports where id=v_report;
  if v_count<>0 then raise exception 'E2E FAIL — manager can read report'; end if;
  reset role;
  begin delete from public.complaints where id=v_complaint; raise exception 'E2E FAIL — physical delete allowed';
  exception when others then if sqlerrm='E2E FAIL — physical delete allowed' then raise; end if; end;

  select count(*) into v_count from public.complaint_status_history where item_id=v_item;
  if v_count<7 then raise exception 'E2E FAIL — incomplete status history: %',v_count; end if;
  raise notice '✅ E2E: إسناد/عزل/صورة بعد/إرجاع/إعادة معالجة/تقرير/فشل/تسليم/أرشفة/منع حذف';
end $$;
rollback;
