-- 00065 · توثيق مراجعة ملف PowerPoint نفسه قبل اعتماد التقرير

alter table public.complaint_reports
  add column review_confirmed_at timestamptz,
  add column reviewed_pptx_path text;

comment on column public.complaint_reports.review_confirmed_at is
  'وقت إقرار موظف الشكاوى بأنه نزّل ملف PowerPoint وراجعه بصرياً';
comment on column public.complaint_reports.reviewed_pptx_path is
  'مسار نسخة PowerPoint التي أقر الموظف بمراجعتها، ويجب أن يطابق pptx_path عند الاعتماد';

-- لا يجوز للعميل كتابة إقرار المراجعة مباشرة؛ يكتبه RPC الاعتماد فقط.
create or replace function app.complaint_report_guard()
returns trigger language plpgsql set search_path=public,app as $$
begin
  if auth.role()='service_role' or current_user not in ('authenticated','anon') then return new; end if;
  if not app.has_role(array['complaints_officer','super_admin']) then raise exception 'COMPLAINT_REPORT_FORBIDDEN'; end if;
  if new.status is distinct from old.status and not (old.status='quality_review' and new.status='approved'
    and new.approved_by=auth.uid() and new.approved_at is not null
    and new.review_confirmed_at is not null and new.reviewed_pptx_path=old.pptx_path) then
    raise exception 'COMPLAINT_REPORT_TRANSITION_INVALID';
  end if;
  if new.status is not distinct from old.status and (new.approved_by is distinct from old.approved_by
    or new.approved_at is distinct from old.approved_at
    or new.review_confirmed_at is distinct from old.review_confirmed_at
    or new.reviewed_pptx_path is distinct from old.reviewed_pptx_path)
    then raise exception 'COMPLAINT_REPORT_APPROVAL_IMMUTABLE'; end if;
  if new.report_date is distinct from old.report_date or new.sector is distinct from old.sector
    or new.created_by is distinct from old.created_by or new.delivery_id is distinct from old.delivery_id
    or new.pptx_path is distinct from old.pptx_path or new.sent_at is distinct from old.sent_at
    or new.archived_at is distinct from old.archived_at then raise exception 'COMPLAINT_REPORT_IMMUTABLE_FIELDS'; end if;
  return new;
end $$;

-- أي ملف جديد يلغي إقرار النسخة السابقة، بينما يبقى الإقرار خلال الإرسال والأرشفة.
create or replace function app.complaint_report_clear_stale_review()
returns trigger language plpgsql set search_path=public,app as $$
begin
  if new.pptx_path is distinct from old.pptx_path or
     (new.status in ('draft','quality_review') and old.status is distinct from new.status) then
    new.review_confirmed_at:=null;
    new.reviewed_pptx_path:=null;
  end if;
  return new;
end $$;
create trigger trg_complaint_reports_clear_review before update on public.complaint_reports
  for each row execute function app.complaint_report_clear_stale_review();

-- إسقاط التوقيع القديم مهم لمنع وجود مسار اعتماد يتجاوز إقرار المراجعة.
drop function public.complaint_approve_report(uuid);
create function public.complaint_approve_report(
  p_report_id uuid,
  p_reviewed_pptx_path text,
  p_review_confirmed boolean
)
returns void language plpgsql security definer set search_path=public,app as $$
declare v_report public.complaint_reports%rowtype;
begin
  if not app.has_role(array['complaints_officer','super_admin']) then raise exception 'COMPLAINT_REPORT_FORBIDDEN'; end if;
  if p_review_confirmed is distinct from true then raise exception 'COMPLAINT_REPORT_REVIEW_CONFIRMATION_REQUIRED'; end if;

  select * into v_report from public.complaint_reports where id=p_report_id for update;
  if not found or v_report.status<>'quality_review' or v_report.pptx_path is null then
    raise exception 'COMPLAINT_REPORT_NOT_REVIEWABLE';
  end if;
  if nullif(trim(p_reviewed_pptx_path),'') is null or p_reviewed_pptx_path<>v_report.pptx_path then
    raise exception 'COMPLAINT_REPORT_REVIEWED_FILE_MISMATCH';
  end if;

  update public.complaint_reports
    set status='approved',approved_by=auth.uid(),approved_at=now(),
        review_confirmed_at=now(),reviewed_pptx_path=p_reviewed_pptx_path
    where id=p_report_id;

  insert into public.audit_logs(table_name,record_id,operation,old_row,new_row,changed_fields,actor_id,actor_role)
  values('complaint_reports',p_report_id::text,'UPDATE',
    jsonb_build_object('status',v_report.status,'pptxPath',v_report.pptx_path),
    jsonb_build_object('status','approved','reviewConfirmed',true,'reviewedPptxPath',p_reviewed_pptx_path),
    jsonb_build_object('status','approved','reviewConfirmed',true,'reviewedPptxPath',p_reviewed_pptx_path),
    auth.uid(),'complaints_officer');
end $$;

grant execute on function public.complaint_approve_report(uuid,text,boolean) to authenticated;
