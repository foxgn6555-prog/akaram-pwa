-- 00070 · حذف آمن للمسودات والتقارير: أرشفة فقط مع سبب وتدقيق
create or replace function public.complaint_archive_report(p_report_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public,app as $$
declare v_old public.complaint_reports%rowtype;
begin
 if not app.has_role(array['complaints_officer','super_admin'])then raise exception'COMPLAINT_REPORT_ARCHIVE_FORBIDDEN';end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception'COMPLAINT_REPORT_ARCHIVE_REASON_REQUIRED';end if;
 select*into v_old from public.complaint_reports where id=p_report_id for update;
 if not found then raise exception'COMPLAINT_REPORT_NOT_FOUND';end if;
 if v_old.status='sending' then raise exception'COMPLAINT_REPORT_SENDING';end if;
 update public.complaint_reports set status='archived',archived_at=now(),updated_at=now() where id=p_report_id;
 insert into public.complaint_status_history(complaint_id,to_status,note,actor_id)
 select ci.complaint_id,'archived','أرشفة التقرير: '||trim(p_reason),auth.uid()
 from public.complaint_report_items ri join public.complaint_items ci on ci.id=ri.item_id
 where ri.report_id=p_report_id
 group by ci.complaint_id;
end$$;
revoke all on function public.complaint_archive_report(uuid,text)from public;
grant execute on function public.complaint_archive_report(uuid,text)to authenticated;
