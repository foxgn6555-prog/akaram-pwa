-- ═══════════════════════════════════════════════════════════════
-- 00053 · أتمتة فرز صور البريد وإسناد الشكاوى على دفعات
-- صورة واردة واحدة = تذكرة مستقلة، مع كود دائم ومنع الخلط/التكرار.
-- ═══════════════════════════════════════════════════════════════

alter table public.complaint_media add column media_code text;

update public.complaint_media
set media_code = 'IMG-' || upper(replace(id::text,'-',''))
where media_code is null;

alter table public.complaint_media alter column media_code set not null;
create unique index uq_complaint_media_code on public.complaint_media(media_code);

create or replace function app.complaint_media_code_guard()
returns trigger language plpgsql set search_path=public,app as $$
begin
  if new.media_code is null or trim(new.media_code)='' then
    new.media_code := 'IMG-' || upper(replace(new.id::text,'-',''));
  end if;
  return new;
end $$;

create trigger trg_complaint_media_code before insert on public.complaint_media
for each row execute function app.complaint_media_code_guard();

-- تفاصيل مرفقات البريد مع كشف التكرار على مستوى كل الرسائل، لا داخل الشاشة فقط.
create or replace function public.complaint_inbox_media_detail(p_message_id uuid)
returns jsonb language sql stable security definer set search_path=public,app as $$
  select case when not app.has_role(array['complaints_officer','super_admin']) then '[]'::jsonb else
    coalesce(jsonb_agg(jsonb_build_object(
      'id',m.id,
      'mediaCode',m.media_code,
      'name',m.original_name,
      'mimeType',m.mime_type,
      'storagePath',m.storage_path,
      'sha256',m.sha256,
      'itemId',m.item_id,
      'duplicateCount',case when m.sha256 is null then 0 else (
        select count(*) from public.complaint_media d where d.sha256=m.sha256 and d.id<>m.id
      ) end
    ) order by m.created_at,m.id),'[]'::jsonb) end
  from public.complaint_media m where m.inbox_message_id=p_message_id
$$;
grant execute on function public.complaint_inbox_media_detail(uuid) to authenticated;

-- يحول كل صورة في الإدخال إلى تذكرة منفردة داخل معاملة واحدة.
create or replace function public.complaint_batch_create_items_from_inbox(
  p_message_id uuid,
  p_entries jsonb
) returns jsonb language plpgsql security definer set search_path=public,app as $$
declare
  v_message public.complaint_inbox_messages%rowtype;
  v_complaint uuid;
  v_entry jsonb;
  v_media_id uuid;
  v_item_id uuid;
  v_seq integer;
  v_created uuid[] := '{}';
  v_count integer;
  v_remaining integer;
begin
  if not app.has_role(array['complaints_officer','super_admin']) then raise exception 'COMPLAINT_CREATE_FORBIDDEN'; end if;
  if jsonb_typeof(coalesce(p_entries,'null'::jsonb)) <> 'array' then raise exception 'COMPLAINT_BATCH_INVALID'; end if;
  v_count := jsonb_array_length(p_entries);
  if v_count<1 or v_count>100 then raise exception 'COMPLAINT_BATCH_SIZE_INVALID'; end if;
  if (select count(distinct e->>'mediaId') from jsonb_array_elements(p_entries) e)<>v_count
    then raise exception 'COMPLAINT_BATCH_DUPLICATE_MEDIA'; end if;

  select * into v_message from public.complaint_inbox_messages where id=p_message_id for update;
  if not found then raise exception 'COMPLAINT_MESSAGE_NOT_FOUND'; end if;
  if v_message.source_sector is null then raise exception 'COMPLAINT_SECTOR_REVIEW_REQUIRED'; end if;

  -- تحقق كامل قبل أول كتابة لضمان الذرية.
  for v_entry in select * from jsonb_array_elements(p_entries) loop
    begin v_media_id := (v_entry->>'mediaId')::uuid;
    exception when others then raise exception 'COMPLAINT_MEDIA_INVALID'; end;
    if nullif(trim(v_entry->>'neighborhood'),'') is null or nullif(trim(v_entry->>'alley'),'') is null
      then raise exception 'COMPLAINT_LOCATION_REQUIRED:%',v_media_id; end if;
    if not exists(select 1 from public.complaint_media m where m.id=v_media_id
      and m.inbox_message_id=p_message_id and m.item_id is null and m.mime_type like 'image/%')
      then raise exception 'COMPLAINT_MEDIA_INVALID:%',v_media_id; end if;
  end loop;

  select id into v_complaint from public.complaints where inbox_message_id=p_message_id order by created_at limit 1;
  if v_complaint is null then
    insert into public.complaints(inbox_message_id,sector,sender_email,received_at,status,created_by)
    values(p_message_id,v_message.source_sector,v_message.sender_email,v_message.received_at,'under_review',auth.uid())
    returning id into v_complaint;
  end if;
  select coalesce(max(sequence_no),0) into v_seq from public.complaint_items where complaint_id=v_complaint;

  for v_entry in select * from jsonb_array_elements(p_entries) loop
    v_media_id := (v_entry->>'mediaId')::uuid;
    v_seq := v_seq+1;
    insert into public.complaint_items(complaint_id,sequence_no,title,municipal_center,neighborhood,alley,location_text,ocr_text)
    values(v_complaint,v_seq,nullif(trim(v_entry->>'title'),''),nullif(trim(v_entry->>'municipalCenter'),''),
      trim(v_entry->>'neighborhood'),trim(v_entry->>'alley'),nullif(trim(v_entry->>'locationText'),''),
      nullif(trim(v_entry->>'ocrText'),'')) returning id into v_item_id;
    update public.complaint_media set item_id=v_item_id,media_kind='before' where id=v_media_id;
    insert into public.complaint_status_history(complaint_id,item_id,to_status,note,actor_id)
      values(v_complaint,v_item_id,'under_review','إنشاء تذكرة مستقلة من الصورة '||
        (select media_code from public.complaint_media where id=v_media_id),auth.uid());
    v_created := array_append(v_created,v_item_id);
  end loop;

  select count(*) into v_remaining from public.complaint_media
    where inbox_message_id=p_message_id and item_id is null and mime_type like 'image/%';
  update public.complaint_inbox_messages set import_status=case when v_remaining=0 then 'imported' else 'ready' end
    where id=p_message_id;
  return jsonb_build_object('complaintId',v_complaint,'itemIds',to_jsonb(v_created),
    'createdCount',v_count,'remainingCount',v_remaining);
end $$;
grant execute on function public.complaint_batch_create_items_from_inbox(uuid,jsonb) to authenticated;

-- إسناد جماعي ذري: كل العناصر تُقبل أو لا يتغير أي عنصر.
create or replace function public.complaint_assign_items(p_item_ids uuid[],p_manager_id uuid)
returns integer language plpgsql security definer set search_path=public,app as $$
declare v_item_id uuid; v_item public.complaint_items%rowtype; v_count integer;
begin
  if not app.has_role(array['complaints_officer','super_admin']) then raise exception 'COMPLAINT_ASSIGN_FORBIDDEN'; end if;
  v_count:=coalesce(array_length(p_item_ids,1),0);
  if v_count<1 or v_count>100 or (select count(distinct x) from unnest(p_item_ids) x)<>v_count
    then raise exception 'COMPLAINT_ASSIGN_BATCH_INVALID'; end if;
  if not exists(select 1 from public.user_roles where user_id=p_manager_id and role='department_manager')
    then raise exception 'COMPLAINT_MANAGER_INVALID'; end if;

  -- يقفل ويتحقق من الدفعة كاملة أولاً.
  foreach v_item_id in array p_item_ids loop
    select * into v_item from public.complaint_items where id=v_item_id for update;
    if not found then raise exception 'COMPLAINT_ITEM_NOT_FOUND:%',v_item_id; end if;
    if v_item.status not in ('under_review','returned') then raise exception 'COMPLAINT_ASSIGN_STATE_INVALID:%',v_item_id; end if;
  end loop;
  foreach v_item_id in array p_item_ids loop
    select * into v_item from public.complaint_items where id=v_item_id;
    update public.complaint_items set assigned_to=p_manager_id,assigned_by=auth.uid(),assigned_at=now(),status='assigned'
      where id=v_item_id;
    update public.complaints set status='assigned' where id=v_item.complaint_id and status in ('new','under_review');
    insert into public.complaint_status_history(complaint_id,item_id,from_status,to_status,actor_id)
      values(v_item.complaint_id,v_item_id,v_item.status,'assigned',auth.uid());
  end loop;
  insert into public.notifications(user_id,title,body,type,link)
    values(p_manager_id,'شكاوى جديدة مسندة إليك','تم إسناد '||v_count||' تذكرة لمعالجتها','info','/manager/complaints');
  return v_count;
end $$;
grant execute on function public.complaint_assign_items(uuid[],uuid) to authenticated;

-- يحافظ على العقد القديم مع تطبيق حارس الحالة الجديد.
create or replace function public.complaint_assign_item(p_item_id uuid,p_manager_id uuid)
returns void language plpgsql security definer set search_path=public,app as $$
begin
  perform public.complaint_assign_items(array[p_item_id],p_manager_id);
end $$;
grant execute on function public.complaint_assign_item(uuid,uuid) to authenticated;
