-- 00059 · تذكرة عمل موحدة لكل بريد + مسؤول، ومعالجة جماعية واحد-إلى-واحد.
insert into public.complaint_settings(key,value,description)
values('complaints.issue_types','{"items":["تراكم نفايات","أنقاض","مخلفات زراعية","مخلفات تجارية","تجاوزات على الطريق","حرق نفايات"]}'::jsonb,'أنواع التلكؤ المتاحة أثناء فرز صور البريد')
on conflict(key)do nothing;

create or replace function public.complaint_start_assignment_ticket(p_complaint_id uuid)
returns integer language plpgsql security definer set search_path=public,app as $$
declare v_count integer;v_item record;
begin
 if not app.has_role(array['department_manager'])then raise exception 'COMPLAINT_TICKET_START_FORBIDDEN';end if;
 perform 1 from public.complaint_items where complaint_id=p_complaint_id and assigned_to=auth.uid() and status in('assigned','returned','in_progress') for update;
 if not found then raise exception 'COMPLAINT_TICKET_NOT_AVAILABLE';end if;
 for v_item in select id,status from public.complaint_items where complaint_id=p_complaint_id and assigned_to=auth.uid() and status in('assigned','returned') loop
  update public.complaint_items set status='in_progress',started_at=coalesce(started_at,clock_timestamp()) where id=v_item.id;
  insert into public.complaint_status_history(complaint_id,item_id,from_status,to_status,actor_id)values(p_complaint_id,v_item.id,v_item.status,'in_progress',auth.uid());
 end loop;
 update public.complaints set status='in_progress' where id=p_complaint_id and status in('assigned','under_review');
 select count(*)into v_count from public.complaint_items where complaint_id=p_complaint_id and assigned_to=auth.uid() and status='in_progress';
 return v_count;
end $$;
revoke all on function public.complaint_start_assignment_ticket(uuid)from public,anon;
grant execute on function public.complaint_start_assignment_ticket(uuid)to authenticated;

create or replace function public.complaint_complete_assignment_ticket(p_complaint_id uuid,p_files jsonb,p_notes text default null)
returns integer language plpgsql security definer set search_path=public,app as $$
declare v_expected integer;v_file jsonb;v_item public.complaint_items%rowtype;v_id uuid;v_total bigint;v_count integer;
begin
 if not app.has_role(array['department_manager'])then raise exception 'COMPLAINT_TICKET_COMPLETE_FORBIDDEN';end if;
 if jsonb_typeof(coalesce(p_files,'null'::jsonb))<>'array'then raise exception 'COMPLAINT_TICKET_FILES_INVALID';end if;
 perform 1 from public.complaint_items where complaint_id=p_complaint_id and assigned_to=auth.uid() and status='in_progress' for update;
 if not found then raise exception 'COMPLAINT_TICKET_NOT_IN_PROGRESS';end if;
 select count(*)into v_expected from public.complaint_items where complaint_id=p_complaint_id and assigned_to=auth.uid() and status='in_progress';
 select count(*),coalesce(sum((value->>'sizeBytes')::bigint),0)into v_count,v_total from jsonb_array_elements(p_files);
 if v_count<>v_expected or v_count<1 or v_count>100 or v_total>524288000
  or(select count(distinct value->>'itemId')from jsonb_array_elements(p_files))<>v_expected
  then raise exception 'COMPLAINT_TICKET_FILES_COUNT_MISMATCH';end if;
 for v_file in select value from jsonb_array_elements(p_files)loop
  select * into v_item from public.complaint_items where id=(v_file->>'itemId')::uuid and complaint_id=p_complaint_id and assigned_to=auth.uid() and status='in_progress';
  if not found
   or coalesce(v_file->>'mimeType','')not in('image/jpeg','image/png','image/webp')
   or coalesce((v_file->>'sizeBytes')::bigint,0)<1 or(v_file->>'sizeBytes')::bigint>26214400
   or lower(coalesce(v_file->>'sha256',''))!~'^[0-9a-f]{64}$'
   or(v_file->>'storagePath')not like 'item/'||v_item.id::text||'/after/%'
   then raise exception 'COMPLAINT_TICKET_FILE_INVALID';end if;
  update public.complaint_media set is_active=false where item_id=v_item.id and media_kind='after' and is_active;
  insert into public.complaint_media(item_id,media_kind,storage_path,original_name,mime_type,size_bytes,sha256,captured_at,source,uploaded_by,is_active,display_order)
  values(v_item.id,'after',v_file->>'storagePath',v_file->>'originalName',v_file->>'mimeType',(v_file->>'sizeBytes')::bigint,lower(v_file->>'sha256'),clock_timestamp(),coalesce(nullif(v_file->>'source',''),'gallery'),auth.uid(),true,1)returning id into v_id;
  update public.complaint_items set status='processed',manager_notes=nullif(trim(p_notes),''),processed_at=clock_timestamp() where id=v_item.id;
  insert into public.complaint_status_history(complaint_id,item_id,from_status,to_status,note,actor_id)values(p_complaint_id,v_item.id,'in_progress','processed',p_notes,auth.uid());
 end loop;
 if not exists(select 1 from public.complaint_items where complaint_id=p_complaint_id and status not in('processed','quality_review','approved'))then
  update public.complaints set status='quality_review' where id=p_complaint_id;
 end if;
 return v_expected;
end $$;
revoke all on function public.complaint_complete_assignment_ticket(uuid,jsonb,text)from public,anon;
grant execute on function public.complaint_complete_assignment_ticket(uuid,jsonb,text)to authenticated;
