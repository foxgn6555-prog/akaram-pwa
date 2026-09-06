-- 00058 · رفع عدة صور معالجة مرتبة لكل تذكرة وتسجيلها ذرياً.
alter table public.complaint_media add column display_order integer not null default 1 check(display_order between 1 and 100);
create index idx_complaint_media_item_order on public.complaint_media(item_id,media_kind,display_order)where is_active;

create or replace function public.complaint_register_after_media(p_item_id uuid,p_files jsonb)
returns uuid[] language plpgsql security definer set search_path=public,app as $$
declare v_item public.complaint_items%rowtype;v_file jsonb;v_ids uuid[]:='{}';v_id uuid;v_count integer;v_total bigint;v_order_count integer;v_min_order integer;v_max_order integer;
begin
 select * into v_item from public.complaint_items where id=p_item_id and assigned_to=auth.uid() for update;
 if not found or v_item.status<>'in_progress'then raise exception 'COMPLAINT_AFTER_REGISTER_FORBIDDEN';end if;
 if jsonb_typeof(coalesce(p_files,'null'::jsonb))<>'array'then raise exception 'COMPLAINT_AFTER_FILES_INVALID';end if;
 v_count:=jsonb_array_length(p_files);
 if v_count<1 or v_count>20 then raise exception 'COMPLAINT_AFTER_FILES_LIMIT';end if;
 select coalesce(sum((value->>'sizeBytes')::bigint),0),count(distinct value->>'storagePath'),
  count(distinct(value->>'displayOrder')::integer),min((value->>'displayOrder')::integer),max((value->>'displayOrder')::integer)
 into v_total,v_count,v_order_count,v_min_order,v_max_order from jsonb_array_elements(p_files);
 if v_total>104857600 or v_count<>jsonb_array_length(p_files)or v_order_count<>jsonb_array_length(p_files)
  or v_min_order<>1 or v_max_order<>jsonb_array_length(p_files)then raise exception 'COMPLAINT_AFTER_FILES_INVALID';end if;
 update public.complaint_media set is_active=false where item_id=p_item_id and media_kind='after' and is_active;
 for v_file in select value from jsonb_array_elements(p_files)loop
  if coalesce(v_file->>'mimeType','')not in('image/jpeg','image/png','image/webp')
    or coalesce((v_file->>'sizeBytes')::bigint,0)<1 or(v_file->>'sizeBytes')::bigint>26214400
    or lower(coalesce(v_file->>'sha256',''))!~'^[0-9a-f]{64}$'
    or (v_file->>'latitude' is not null and (v_file->>'latitude')::numeric not between -90 and 90)
    or (v_file->>'longitude' is not null and (v_file->>'longitude')::numeric not between -180 and 180)
    or coalesce((v_file->>'displayOrder')::integer,0)not between 1 and 20
    or(v_file->>'storagePath')not like 'item/'||p_item_id::text||'/after/%'
    then raise exception 'COMPLAINT_AFTER_FILE_INVALID';end if;
  insert into public.complaint_media(item_id,media_kind,storage_path,original_name,mime_type,size_bytes,sha256,
    latitude,longitude,captured_at,source,uploaded_by,is_active,display_order)
  values(p_item_id,'after',v_file->>'storagePath',v_file->>'originalName',v_file->>'mimeType',(v_file->>'sizeBytes')::bigint,
    lower(v_file->>'sha256'),nullif(v_file->>'latitude','')::numeric,nullif(v_file->>'longitude','')::numeric,
    clock_timestamp(),coalesce(nullif(v_file->>'source',''),'gallery'),auth.uid(),true,(v_file->>'displayOrder')::integer)
  returning id into v_id;v_ids:=array_append(v_ids,v_id);
 end loop;
 return v_ids;
end $$;
revoke all on function public.complaint_register_after_media(uuid,jsonb)from public,anon;
grant execute on function public.complaint_register_after_media(uuid,jsonb)to authenticated;
