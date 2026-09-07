-- 00067 · توحيد إدارة القوالب ومنع إعادة إنشاء المسودة من مسح تصميم قائم.

-- لا يسمح بأكثر من قالب افتراضي واحد للنطاق نفسه (عام/كرادة/زعفرانية).
with ranked as (
  select id,row_number() over(partition by coalesce(sector,'__all__') order by updated_at desc,id) as rn
  from public.complaint_templates where is_default
)
update public.complaint_templates t set is_default=false
from ranked r where t.id=r.id and r.rn>1;

create unique index if not exists complaint_templates_one_default_per_scope
  on public.complaint_templates((coalesce(sector,'__all__')))
  where is_default;

create or replace function public.complaint_save_template(
  p_template_id uuid,
  p_name text,
  p_description text,
  p_sector text,
  p_layout jsonb,
  p_is_default boolean,
  p_is_active boolean
) returns uuid
language plpgsql security definer set search_path=public,app as $$
declare v_id uuid;
begin
  if not app.has_role(array['complaints_officer','super_admin']) then
    raise exception 'COMPLAINT_TEMPLATE_FORBIDDEN';
  end if;
  if nullif(trim(p_name),'') is null then raise exception 'COMPLAINT_TEMPLATE_NAME_REQUIRED'; end if;
  if p_sector is not null and p_sector not in('karrada','zaafaraniya') then
    raise exception 'COMPLAINT_TEMPLATE_SECTOR_INVALID';
  end if;
  if jsonb_typeof(coalesce(p_layout,'{}'::jsonb)) <> 'object' then
    raise exception 'COMPLAINT_TEMPLATE_LAYOUT_INVALID';
  end if;
  if coalesce(p_is_default,false) and not coalesce(p_is_active,true) then
    raise exception 'COMPLAINT_TEMPLATE_DEFAULT_INACTIVE';
  end if;

  if p_template_id is not null then
    select id into v_id from public.complaint_templates where id=p_template_id for update;
    if not found then raise exception 'COMPLAINT_TEMPLATE_NOT_FOUND'; end if;
  end if;

  if coalesce(p_is_default,false) then
    update public.complaint_templates
      set is_default=false
      where is_default and sector is not distinct from p_sector
        and (p_template_id is null or id<>p_template_id);
  end if;

  if p_template_id is null then
    insert into public.complaint_templates(name,description,sector,layout,is_default,is_active,created_by)
    values(trim(p_name),nullif(trim(p_description),''),p_sector,coalesce(p_layout,'{}'::jsonb),
      coalesce(p_is_default,false),coalesce(p_is_active,true),auth.uid())
    returning id into v_id;
  else
    update public.complaint_templates set
      name=trim(p_name),description=nullif(trim(p_description),''),sector=p_sector,
      layout=coalesce(p_layout,'{}'::jsonb),
      is_default=case when coalesce(p_is_active,true) then coalesce(p_is_default,false) else false end,
      is_active=coalesce(p_is_active,true)
    where id=p_template_id returning id into v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.complaint_save_template(uuid,text,text,text,jsonb,boolean,boolean) from public,anon;
grant execute on function public.complaint_save_template(uuid,text,text,text,jsonb,boolean,boolean) to authenticated;

-- اختيار القالب يحترم القاطع وحالة التفعيل، وإنشاء المسودة متكرر بأمان:
-- إذا كانت المسودة/التقرير موجوداً يعاد معرّفه ولا تمسح تعديلات الموظف أو ملفه.
create or replace function public.complaint_prepare_daily_report(p_sector text,p_date date,p_template_id uuid default null)
returns uuid language plpgsql security definer set search_path=public,app as $$
declare v_report uuid;v_template uuid;v_layout jsonb;v_recipients text[];v_approved integer;
begin
  if not app.has_role(array['complaints_officer','super_admin'])then raise exception 'COMPLAINT_REPORT_FORBIDDEN';end if;
  if p_sector not in('karrada','zaafaraniya')then raise exception 'COMPLAINT_SECTOR_INVALID';end if;

  select id into v_report from public.complaint_reports
    where report_scope='daily' and report_date=p_date and sector=p_sector for update;
  if found then return v_report; end if;

  select count(*) into v_approved from public.complaint_items i join public.complaints c on c.id=i.complaint_id
    where c.sector=p_sector and timezone('Asia/Baghdad',c.received_at)::date=p_date
      and c.archived_at is null and i.status='approved';
  if v_approved=0 then raise exception 'COMPLAINT_REPORT_NO_APPROVED_ITEMS';end if;

  if p_template_id is not null then
    select id,layout into v_template,v_layout from public.complaint_templates
      where id=p_template_id and is_active and (sector is null or sector=p_sector);
    if not found then
      if exists(select 1 from public.complaint_templates where id=p_template_id and not is_active) then raise exception 'COMPLAINT_TEMPLATE_INACTIVE'; end if;
      if exists(select 1 from public.complaint_templates where id=p_template_id) then raise exception 'COMPLAINT_TEMPLATE_SECTOR_MISMATCH'; end if;
      raise exception 'COMPLAINT_TEMPLATE_NOT_FOUND';
    end if;
  else
    select id,layout into v_template,v_layout from public.complaint_templates
      where is_active and (sector is null or sector=p_sector)
      order by (sector=p_sector) desc,is_default desc,created_at limit 1;
  end if;

  select array_agg(distinct lower(email)) into v_recipients from(
    select sender_email email from public.complaints
      where sector=p_sector and timezone('Asia/Baghdad',received_at)::date=p_date and sender_email is not null
    union all
    select email from public.complaint_contacts where(sector=p_sector or sector is null)and kind='recipient'and is_active
  )addresses where nullif(trim(email),'')is not null;

  insert into public.complaint_reports(report_date,sector,report_scope,template_id,title,layout,recipients,created_by,status)
  values(p_date,p_sector,'daily',v_template,'التقرير اليومي الجامع للشكاوى '||to_char(p_date,'DD/MM/YYYY'),
    coalesce(v_layout,'{}'),coalesce(v_recipients,'{}'),auth.uid(),'draft')
  on conflict(report_date,sector)where report_scope='daily' do nothing returning id into v_report;
  if v_report is null then
    select id into v_report from public.complaint_reports where report_scope='daily'and report_date=p_date and sector=p_sector;
    return v_report;
  end if;

  insert into public.complaint_report_items(report_id,item_id,display_order,included)
  select v_report,i.id,row_number()over(order by c.received_at,i.sequence_no)::integer,true
  from public.complaint_items i join public.complaints c on c.id=i.complaint_id
  where c.sector=p_sector and timezone('Asia/Baghdad',c.received_at)::date=p_date
    and c.archived_at is null and i.status='approved';
  return v_report;
end $$;

create or replace function public.complaint_prepare_email_report(p_message_id uuid,p_template_id uuid default null)
returns uuid language plpgsql security definer set search_path=public,app as $$
declare v_message public.complaint_inbox_messages%rowtype;v_report uuid;v_template uuid;v_layout jsonb;v_approved integer;v_sector text;v_date date;v_recipients text[];
begin
  if not app.has_role(array['complaints_officer','super_admin'])then raise exception 'COMPLAINT_REPORT_FORBIDDEN';end if;
  select * into v_message from public.complaint_inbox_messages where id=p_message_id for update;
  if not found then raise exception 'COMPLAINT_MESSAGE_NOT_FOUND';end if;
  v_sector:=v_message.source_sector;v_date:=timezone('Asia/Baghdad',v_message.received_at)::date;

  select id into v_report from public.complaint_reports
    where report_scope='email'and inbox_message_id=p_message_id for update;
  if found then return v_report; end if;

  select count(*)into v_approved from public.complaint_items i join public.complaints c on c.id=i.complaint_id
    where c.inbox_message_id=p_message_id and i.status='approved';
  if v_approved=0 then raise exception 'COMPLAINT_REPORT_NO_APPROVED_ITEMS';end if;

  if p_template_id is not null then
    select id,layout into v_template,v_layout from public.complaint_templates
      where id=p_template_id and is_active and (sector is null or sector=v_sector);
    if not found then
      if exists(select 1 from public.complaint_templates where id=p_template_id and not is_active) then raise exception 'COMPLAINT_TEMPLATE_INACTIVE'; end if;
      if exists(select 1 from public.complaint_templates where id=p_template_id) then raise exception 'COMPLAINT_TEMPLATE_SECTOR_MISMATCH'; end if;
      raise exception 'COMPLAINT_TEMPLATE_NOT_FOUND';
    end if;
  else
    select id,layout into v_template,v_layout from public.complaint_templates
      where is_active and (sector is null or sector=v_sector)
      order by (sector=v_sector) desc,is_default desc,created_at limit 1;
  end if;

  select array_agg(distinct lower(email))into v_recipients from(
    select coalesce(nullif(v_message.reply_to,''),v_message.sender_email)email
    union all
    select email from public.complaint_contacts where(sector=v_sector or sector is null)and kind in('recipient','cc')and is_active
  )addresses where nullif(trim(email),'')is not null;

  insert into public.complaint_reports(report_date,sector,report_scope,inbox_message_id,template_id,title,layout,recipients,created_by,status)
  values(v_date,v_sector,'email',p_message_id,v_template,'تقرير '||coalesce(nullif(v_message.subject,''),'شكاوى البريد')||' — '||to_char(v_date,'DD/MM/YYYY'),
    coalesce(v_layout,'{}'),coalesce(v_recipients,'{}'),auth.uid(),'draft')
  on conflict(inbox_message_id)where report_scope='email' do nothing returning id into v_report;
  if v_report is null then
    select id into v_report from public.complaint_reports where report_scope='email'and inbox_message_id=p_message_id;
    return v_report;
  end if;

  insert into public.complaint_report_items(report_id,item_id,display_order,included)
  select v_report,i.id,row_number()over(order by i.sequence_no)::integer,true
  from public.complaint_items i join public.complaints c on c.id=i.complaint_id
  where c.inbox_message_id=p_message_id and i.status='approved';
  return v_report;
end $$;
revoke all on function public.complaint_prepare_daily_report(text,date,uuid) from public,anon;
grant execute on function public.complaint_prepare_daily_report(text,date,uuid) to authenticated;
revoke all on function public.complaint_prepare_email_report(uuid,uuid) from public,anon;
grant execute on function public.complaint_prepare_email_report(uuid,uuid) to authenticated;
