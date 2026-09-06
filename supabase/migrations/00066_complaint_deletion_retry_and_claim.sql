-- 00066 · تنفيذ ذري قابل للاسترداد للحذف النهائي، مع منع التنفيذ المتزامن وإتاحة إعادة المحاولة.

alter table public.complaint_deletion_requests
  drop constraint complaint_deletion_requests_status_check;
alter table public.complaint_deletion_requests
  add constraint complaint_deletion_requests_status_check
  check(status in('pending','approved','executing','rejected','executed','failed'));
alter table public.complaint_deletion_requests
  add column attempt_count integer not null default 0 check(attempt_count>=0),
  add column execution_started_at timestamptz;

drop index public.uq_complaint_deletion_requests_active_folder;
create unique index uq_complaint_deletion_requests_active_folder
  on public.complaint_deletion_requests(folder_id)
  where status in('pending','approved','executing','failed');

-- حجز الطلب قبل لمس Storage؛ لا يمكن لمنفذين اثنين امتلاك الطلب نفسه.
create or replace function public.complaint_claim_permanent_deletion(p_request_id uuid)
returns void language plpgsql security definer set search_path=public,app as $$
begin
  if auth.role()<>'service_role' then raise exception 'COMPLAINT_DELETE_CLAIM_SERVICE_ROLE_ONLY'; end if;
  update public.complaint_deletion_requests r
    set status='executing',attempt_count=attempt_count+1,execution_started_at=now(),error_message=null
    from public.complaint_archive_folders f
    where r.id=p_request_id and r.folder_id=f.id and r.status='approved'
      and f.restored_at is null and f.permanently_deleted_at is null and f.inbox_message_id is not null;
  if not found then raise exception 'COMPLAINT_DELETE_NOT_CLAIMABLE'; end if;
end $$;

-- إعادة المحاولة تحتاج توقيع مدير النظام أيضاً؛ كما تسترد محاولة عالقة لأكثر من عشر دقائق.
create or replace function public.complaint_retry_permanent_deletion(p_request_id uuid,p_note text default null)
returns void language plpgsql security definer set search_path=public,app as $$
declare v_old text;
begin
  if not app.has_role(array['super_admin']) then raise exception 'COMPLAINT_DELETE_RETRY_FORBIDDEN'; end if;
  select status into v_old from public.complaint_deletion_requests
    where id=p_request_id and (status='failed' or (status='executing' and execution_started_at<now()-interval '10 minutes'))
    for update;
  if v_old is null then raise exception 'COMPLAINT_DELETE_NOT_RETRYABLE'; end if;
  if not exists(select 1 from public.complaint_deletion_requests r join public.complaint_archive_folders f on f.id=r.folder_id
    where r.id=p_request_id and f.restored_at is null and f.permanently_deleted_at is null and f.inbox_message_id is not null)
    then raise exception 'COMPLAINT_FOLDER_NOT_DELETABLE'; end if;
  update public.complaint_deletion_requests set status='approved',execution_started_at=null,
    error_message=null,decision_note=coalesce(nullif(trim(p_note),''),decision_note),decided_by=auth.uid(),decided_at=now()
    where id=p_request_id;
  insert into public.audit_logs(table_name,record_id,operation,old_row,new_row,changed_fields,actor_id,actor_role)
  values('complaint_deletion_requests',p_request_id::text,'UPDATE',jsonb_build_object('status',v_old),
    jsonb_build_object('status','approved','action','retry'),jsonb_build_object('status','approved','action','retry'),
    auth.uid(),'super_admin');
end $$;

-- الإنهاء لا يقبل approved بعد الآن، بل الطلب الذي حجزته Edge Function فقط.
create or replace function public.complaint_finalize_permanent_deletion(p_request_id uuid)
returns void language plpgsql security definer set search_path=public,app,auth as $$
declare v_folder uuid;v_message uuid;v_complaints uuid[];v_items uuid[];
begin
 if auth.role()<>'service_role' then raise exception 'COMPLAINT_FINALIZE_SERVICE_ROLE_ONLY';end if;
 perform set_config('app.complaint_delete_approved','on',true);
 select r.folder_id,f.inbox_message_id into v_folder,v_message from public.complaint_deletion_requests r join public.complaint_archive_folders f on f.id=r.folder_id where r.id=p_request_id and r.status='executing' and f.restored_at is null and f.permanently_deleted_at is null for update of r,f;
 if v_folder is null or v_message is null then raise exception 'COMPLAINT_DELETE_NOT_EXECUTING';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_message::text,0));
 select coalesce(array_agg(id),'{}') into v_complaints from public.complaints where inbox_message_id=v_message;
 select coalesce(array_agg(id),'{}') into v_items from public.complaint_items where complaint_id=any(v_complaints);
 delete from public.complaint_media_revisions where item_id=any(v_items);
 update public.complaint_media set superseded_by=null where inbox_message_id=v_message or item_id=any(v_items);
 delete from public.complaint_media where inbox_message_id=v_message or item_id=any(v_items);
 delete from public.complaint_report_items where item_id=any(v_items);
 delete from public.complaint_status_history where complaint_id=any(v_complaints) or item_id=any(v_items);
 update public.complaint_reports set delivery_id=null where inbox_message_id=v_message;
 update public.complaint_email_deliveries set report_id=null where complaint_id=any(v_complaints);
 delete from public.complaint_email_deliveries where complaint_id=any(v_complaints);
 delete from public.complaint_reports where inbox_message_id=v_message;
 delete from public.complaint_items where id=any(v_items);
 delete from public.complaints where id=any(v_complaints);
 update public.complaint_inbox_messages set duplicate_of=null where duplicate_of=v_message;
 delete from public.complaint_inbox_messages where id=v_message;
 update public.complaint_archive_folders set inbox_message_id=null,permanently_deleted_at=now() where id=v_folder;
 update public.complaint_deletion_requests set status='executed',executed_at=now(),error_message=null where id=p_request_id;
end $$;

revoke all on function public.complaint_claim_permanent_deletion(uuid) from public,anon,authenticated;
grant execute on function public.complaint_claim_permanent_deletion(uuid) to service_role;
revoke all on function public.complaint_retry_permanent_deletion(uuid,text) from public,anon;
grant execute on function public.complaint_retry_permanent_deletion(uuid,text) to authenticated;
