-- ═══════════════════════════════════════════════════════════════
-- 00056 · التقرير اليومي الواحد يجمع الشكاوى المعتمدة فقط من كل المسؤولين
-- إعادة التحضير تحدّث المسودة نفسها وتضم الاعتمادات المتأخرة قبل اعتماد التقرير.
-- ═══════════════════════════════════════════════════════════════
create or replace function public.complaint_prepare_daily_report(p_sector text,p_date date,p_template_id uuid default null)
returns uuid language plpgsql security definer set search_path=public,app as $$
declare v_report uuid;v_template uuid;v_layout jsonb;v_status text;v_recipients text[];v_approved integer;
begin
  if not app.has_role(array['complaints_officer','super_admin']) then raise exception 'COMPLAINT_REPORT_FORBIDDEN'; end if;
  if p_sector not in('karrada','zaafaraniya') then raise exception 'COMPLAINT_SECTOR_INVALID'; end if;
  select count(*) into v_approved from public.complaint_items i join public.complaints c on c.id=i.complaint_id
    where c.sector=p_sector and timezone('Asia/Baghdad',c.received_at)::date=p_date and c.archived_at is null and i.status='approved';
  if v_approved=0 then raise exception 'COMPLAINT_REPORT_NO_APPROVED_ITEMS'; end if;
  select id,layout into v_template,v_layout from public.complaint_templates
    where id=coalesce(p_template_id,id) and is_active order by(id=p_template_id) desc,is_default desc limit 1;
  select id,status into v_report,v_status from public.complaint_reports where report_date=p_date and sector=p_sector for update;
  if found and v_status not in('draft','quality_review','failed') then raise exception 'COMPLAINT_REPORT_LOCKED'; end if;
  select array_agg(distinct lower(email)) into v_recipients from(
    select sender_email email from public.complaints where sector=p_sector
      and timezone('Asia/Baghdad',received_at)::date=p_date and sender_email is not null
    union all select email from public.complaint_contacts where(sector=p_sector or sector is null)and kind='recipient'and is_active
  )addresses where nullif(trim(email),'')is not null;
  insert into public.complaint_reports(report_date,sector,template_id,title,layout,recipients,created_by,status,pptx_path,delivery_id)
    values(p_date,p_sector,v_template,'تقرير معالجة الشكاوى ليوم '||to_char(p_date,'DD/MM/YYYY'),coalesce(v_layout,'{}'),
      coalesce(v_recipients,'{}'),auth.uid(),'draft',null,null)
  on conflict(report_date,sector)do update set template_id=excluded.template_id,layout=excluded.layout,title=excluded.title,
    recipients=excluded.recipients,status='draft',pptx_path=null,delivery_id=null,approved_by=null,approved_at=null
  returning id into v_report;
  update public.complaint_report_items ri set included=false where ri.report_id=v_report and not exists(
    select 1 from public.complaint_items i where i.id=ri.item_id and i.status='approved');
  insert into public.complaint_report_items(report_id,item_id,display_order,included)
    select v_report,i.id,row_number()over(order by c.received_at,i.sequence_no)::integer,true
    from public.complaint_items i join public.complaints c on c.id=i.complaint_id
    where c.sector=p_sector and timezone('Asia/Baghdad',c.received_at)::date=p_date and c.archived_at is null and i.status='approved'
  on conflict(report_id,item_id)do update set display_order=excluded.display_order,included=true;
  return v_report;
end $$;

grant execute on function public.complaint_prepare_daily_report(text,date,uuid) to authenticated;
