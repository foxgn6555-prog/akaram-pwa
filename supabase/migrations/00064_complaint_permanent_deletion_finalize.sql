-- 00064 · الإنهاء المادي بعد حذف كل كائنات Storage بواسطة Edge Function.
-- لا يُمنح التنفيذ للمستخدمين؛ service_role فقط، والطلب يجب أن يحمل موافقة مدير النظام.
-- يبقى مانع DELETE عاماً، ويُفتح داخل معاملة الإنهاء الموثقة فقط.
create or replace function app.prevent_complaint_physical_delete()returns trigger language plpgsql as $$begin if auth.role()='service_role' and current_setting('app.complaint_delete_approved',true)='on'then return old;end if;raise exception 'COMPLAINT_PHYSICAL_DELETE_FORBIDDEN';end$$;
create or replace function public.complaint_finalize_permanent_deletion(p_request_id uuid)
returns void language plpgsql security definer set search_path=public,app,auth as $$
declare v_folder uuid;v_message uuid;v_complaints uuid[];v_items uuid[];
begin
 if auth.role()<>'service_role' then raise exception 'COMPLAINT_FINALIZE_SERVICE_ROLE_ONLY';end if;
 perform set_config('app.complaint_delete_approved','on',true);
 select r.folder_id,f.inbox_message_id into v_folder,v_message from public.complaint_deletion_requests r join public.complaint_archive_folders f on f.id=r.folder_id where r.id=p_request_id and r.status='approved' and f.restored_at is null and f.permanently_deleted_at is null for update of r,f;
 if v_folder is null or v_message is null then raise exception 'COMPLAINT_DELETE_NOT_APPROVED';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_message::text,0));
 select coalesce(array_agg(id),'{}') into v_complaints from public.complaints where inbox_message_id=v_message;
 select coalesce(array_agg(id),'{}') into v_items from public.complaint_items where complaint_id=any(v_complaints);
 -- تُستدعى هذه المعاملة فقط بعدما تؤكد Edge Function حذف كل المسارات عبر Storage API.
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
end$$;
revoke all on function public.complaint_finalize_permanent_deletion(uuid) from public,anon,authenticated;
grant execute on function public.complaint_finalize_permanent_deletion(uuid) to service_role;
