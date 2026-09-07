-- 00071 · لا اعتماد لتلكؤ بلا صورة معالجة فعالة.
-- يحصّن مساري التدقيق الفردي وتدقيق تذكرة «البريد + المسؤول» في الخادم.

create or replace function public.complaint_review_item(p_item_id uuid,p_approved boolean,p_note text default null)
returns void language plpgsql security definer set search_path=public,app as $$
declare v_item public.complaint_items%rowtype;v_next text;
begin
 if not app.has_role(array['complaints_officer','super_admin'])then raise exception 'COMPLAINT_REVIEW_FORBIDDEN';end if;
 select * into v_item from public.complaint_items where id=p_item_id for update;
 if not found or v_item.status not in('processed','quality_review')then raise exception 'COMPLAINT_NOT_REVIEWABLE';end if;
 if p_approved and not exists(select 1 from public.complaint_media where item_id=p_item_id and media_kind='after' and is_active)then raise exception 'COMPLAINT_AFTER_MEDIA_REQUIRED';end if;
 if not p_approved and nullif(trim(p_note),'')is null then raise exception 'COMPLAINT_RETURN_NOTE_REQUIRED';end if;
 v_next:=case when p_approved then'approved'else'returned'end;
 update public.complaint_items set status=v_next,reviewer_notes=nullif(trim(p_note),''),reviewed_at=clock_timestamp(),started_at=case when p_approved then started_at else null end,processed_at=case when p_approved then processed_at else null end where id=p_item_id;
 insert into public.complaint_status_history(complaint_id,item_id,from_status,to_status,note,actor_id)values(v_item.complaint_id,p_item_id,v_item.status,v_next,p_note,auth.uid());
 if not p_approved and v_item.assigned_to is not null then insert into public.notifications(user_id,title,body,type,link)values(v_item.assigned_to,'أُعيدت معالجة شكوى',p_note,'warning','/manager/complaints');end if;
end $$;

create or replace function public.complaint_review_assignment_ticket(p_complaint_id uuid,p_manager_id uuid,p_approved boolean,p_note text default null)
returns integer language plpgsql security definer set search_path=public,app as $$
declare v_item record;v_count integer:=0;v_next text;v_reference text;
begin
 if not app.has_role(array['complaints_officer','super_admin'])then raise exception 'COMPLAINT_TICKET_REVIEW_FORBIDDEN';end if;
 if not p_approved and nullif(trim(p_note),'')is null then raise exception 'COMPLAINT_RETURN_NOTE_REQUIRED';end if;
 perform 1 from public.complaint_items where complaint_id=p_complaint_id and assigned_to=p_manager_id and status in('processed','quality_review') for update;
 if not found then raise exception 'COMPLAINT_TICKET_NOT_REVIEWABLE';end if;
 if p_approved and exists(
  select 1 from public.complaint_items i
  where i.complaint_id=p_complaint_id and i.assigned_to=p_manager_id and i.status in('processed','quality_review')
   and not exists(select 1 from public.complaint_media m where m.item_id=i.id and m.media_kind='after' and m.is_active)
 )then raise exception 'COMPLAINT_AFTER_MEDIA_REQUIRED';end if;
 v_next:=case when p_approved then'approved'else'returned'end;
 for v_item in select id,status from public.complaint_items where complaint_id=p_complaint_id and assigned_to=p_manager_id and status in('processed','quality_review')order by sequence_no loop
  update public.complaint_items set status=v_next,reviewer_notes=nullif(trim(p_note),''),reviewed_at=clock_timestamp(),started_at=case when p_approved then started_at else null end,processed_at=case when p_approved then processed_at else null end where id=v_item.id;
  insert into public.complaint_status_history(complaint_id,item_id,from_status,to_status,note,actor_id)values(p_complaint_id,v_item.id,v_item.status,v_next,p_note,auth.uid());v_count:=v_count+1;
 end loop;
 select reference_no into v_reference from public.complaints where id=p_complaint_id;
 if p_approved then update public.complaints set status=case when not exists(select 1 from public.complaint_items where complaint_id=p_complaint_id and status<>'approved')then'ready_to_send'else'quality_review'end where id=p_complaint_id;
 else update public.complaints set status='in_progress' where id=p_complaint_id;insert into public.notifications(user_id,title,body,type,link)values(p_manager_id,'أُعيدت تذكرة معالجة كاملة',coalesce(v_reference,'')||' — '||trim(p_note),'warning','/manager/complaints/'||p_complaint_id::text);end if;
 return v_count;
end $$;

revoke all on function public.complaint_review_item(uuid,boolean,text)from public,anon;
revoke all on function public.complaint_review_assignment_ticket(uuid,uuid,boolean,text)from public,anon;
grant execute on function public.complaint_review_item(uuid,boolean,text)to authenticated;
grant execute on function public.complaint_review_assignment_ticket(uuid,uuid,boolean,text)to authenticated;
