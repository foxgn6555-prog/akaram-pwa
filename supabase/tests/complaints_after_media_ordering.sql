-- صور المعالجة المتعددة: الذرية، الترتيب، الاستبدال، والعزل.
begin;
do $$
declare
 v_officer uuid:='10000000-0000-0000-0000-000000000058';v_manager uuid:='20000000-0000-0000-0000-000000000058';v_other uuid:='30000000-0000-0000-0000-000000000058';
 v_complaint uuid;v_item uuid;v_count integer;v_ids uuid[];v_rejected boolean:=false;
begin
 insert into auth.users(id,email)values(v_officer,'after-officer@akram.iq'),(v_manager,'after-manager@akram.iq'),(v_other,'after-other@akram.iq');
 insert into public.user_roles(user_id,role)values(v_officer,'complaints_officer'),(v_manager,'department_manager'),(v_other,'department_manager');
 insert into public.complaints(sector,status,created_by)values('karrada','under_review',v_officer)returning id into v_complaint;
 insert into public.complaint_items(complaint_id,sequence_no)values(v_complaint,1)returning id into v_item;
 perform set_config('role','authenticated',true);perform set_config('request.jwt.claim.sub',v_officer::text,true);perform public.complaint_assign_item(v_item,v_manager);
 perform set_config('request.jwt.claim.sub',v_manager::text,true);perform public.complaint_start_item(v_item);
 select public.complaint_register_after_media(v_item,jsonb_build_array(
  jsonb_build_object('storagePath','item/'||v_item||'/after/a.jpg','originalName','a.jpg','mimeType','image/jpeg','sizeBytes',100,'sha256',repeat('a',64),'source','camera','displayOrder',1),
  jsonb_build_object('storagePath','item/'||v_item||'/after/b.jpg','originalName','b.jpg','mimeType','image/jpeg','sizeBytes',100,'sha256',repeat('b',64),'source','gallery','displayOrder',2),
  jsonb_build_object('storagePath','item/'||v_item||'/after/c.jpg','originalName','c.jpg','mimeType','image/jpeg','sizeBytes',100,'sha256',repeat('c',64),'source','gallery','displayOrder',3)))into v_ids;
 if cardinality(v_ids)<>3 then raise exception 'AFTER ORDER FAIL — لم تسجل الصور الثلاث';end if;
 select count(*)into v_count from public.complaint_media where item_id=v_item and media_kind='after' and is_active and display_order in(1,2,3);
 if v_count<>3 then raise exception 'AFTER ORDER FAIL — الترتيب غير محفوظ';end if;

 select public.complaint_register_after_media(v_item,jsonb_build_array(
  jsonb_build_object('storagePath','item/'||v_item||'/after/new-b.jpg','originalName','new-b.jpg','mimeType','image/jpeg','sizeBytes',100,'sha256',repeat('d',64),'source','gallery','displayOrder',1),
  jsonb_build_object('storagePath','item/'||v_item||'/after/new-a.jpg','originalName','new-a.jpg','mimeType','image/jpeg','sizeBytes',100,'sha256',repeat('e',64),'source','camera','displayOrder',2)))into v_ids;
 select count(*)into v_count from public.complaint_media where item_id=v_item and media_kind='after' and is_active;
 if v_count<>2 then raise exception 'AFTER REPLACE FAIL — الصور القديمة ما زالت نشطة';end if;
 perform set_config('request.jwt.claim.sub',v_officer::text,true);
 select count(*)into v_count from public.complaint_media where item_id=v_item and media_kind='after' and not is_active;
 if v_count<>3 then raise exception 'AFTER AUDIT FAIL — الصور القديمة لم تحفظ للتدقيق';end if;
 perform set_config('request.jwt.claim.sub',v_manager::text,true);

 begin
  perform public.complaint_register_after_media(v_item,jsonb_build_array(
   jsonb_build_object('storagePath','item/'||v_item||'/after/bad.jpg','originalName','bad.jpg','mimeType','image/jpeg','sizeBytes',100,'sha256',repeat('f',64),'displayOrder',2)));
 exception when others then v_rejected:=true;end;
 if not v_rejected then raise exception 'AFTER VALIDATION FAIL — قُبل ترتيب غير متصل';end if;
 v_rejected:=false;
 begin
  perform public.complaint_register_after_media(v_item,jsonb_build_array(
   jsonb_build_object('storagePath','item/'||v_item||'/after/unsafe.jpg','originalName','unsafe.jpg','mimeType','image/jpeg','sizeBytes',100,'sha256','not-a-sha','latitude',91,'longitude',181,'displayOrder',1)));
 exception when others then v_rejected:=true;end;
 if not v_rejected then raise exception 'AFTER VALIDATION FAIL — قُبلت بصمة أو إحداثيات غير صالحة';end if;

 v_rejected:=false;perform set_config('request.jwt.claim.sub',v_other::text,true);
 begin
  perform public.complaint_register_after_media(v_item,jsonb_build_array(
   jsonb_build_object('storagePath','item/'||v_item||'/after/other.jpg','originalName','other.jpg','mimeType','image/jpeg','sizeBytes',100,'sha256',repeat('9',64),'displayOrder',1)));
 exception when others then v_rejected:=true;end;
 if not v_rejected then raise exception 'AFTER ISOLATION FAIL — مسؤول آخر سجل صورة';end if;
 reset role;raise notice '✅ صور بعد متعددة: ترتيب واستبدال ذري وعزل ناجح';
end $$;
rollback;
