-- ═══════════════════════════════════════════════════════════════
-- 00049 · إكمال دورة الشكاوى: التدقيق · القوالب · التقارير · التواصل · الأرشفة
-- ═══════════════════════════════════════════════════════════════

create table public.complaint_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  sector text check (sector in ('karrada','zaafaraniya')),
  layout jsonb not null default '{"accent":"#cf63c6","title":"تقرير معالجة الشكاوى ليوم","beforeLabel":"صورة التلكؤ / الشكوى","afterLabel":"صورة المعالجة"}',
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

create table public.complaint_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  sector text not null check (sector in ('karrada','zaafaraniya')),
  template_id uuid references public.complaint_templates(id),
  title text not null,
  status text not null default 'draft' check (status in ('draft','quality_review','approved','sending','sent','failed','archived')),
  layout jsonb not null default '{}',
  pptx_path text,
  recipients text[] not null default '{}',
  delivery_id uuid references public.complaint_email_deliveries(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  sent_at timestamptz,
  archived_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (report_date,sector)
);

alter table public.complaint_email_deliveries
  add column report_id uuid references public.complaint_reports(id) on delete restrict;
create index idx_complaint_deliveries_report on public.complaint_email_deliveries(report_id,created_at desc)
  where report_id is not null;

create table public.complaint_report_items (
  report_id uuid not null references public.complaint_reports(id) on delete cascade,
  item_id uuid not null references public.complaint_items(id),
  display_order integer not null,
  included boolean not null default true,
  slide_layout jsonb not null default '{}',
  primary key(report_id,item_id)
);

create table public.complaint_contacts (
  id uuid primary key default gen_random_uuid(),
  sector text check (sector in ('karrada','zaafaraniya')),
  name text not null,
  email text not null,
  kind text not null default 'recipient' check (kind in ('sender_rule','recipient','cc')),
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(email,sector,kind)
);

create table public.complaint_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

-- الحذف الفيزيائي لبيانات الدورة ممنوع؛ الإغلاق يتم بالحالة والأرشفة فقط.
create or replace function app.prevent_complaint_physical_delete()
returns trigger language plpgsql as $$ begin raise exception 'COMPLAINT_PHYSICAL_DELETE_FORBIDDEN'; end $$;
create trigger trg_no_delete_complaint_inbox before delete on public.complaint_inbox_messages for each row execute function app.prevent_complaint_physical_delete();
create trigger trg_no_delete_complaints before delete on public.complaints for each row execute function app.prevent_complaint_physical_delete();
create trigger trg_no_delete_complaint_items before delete on public.complaint_items for each row execute function app.prevent_complaint_physical_delete();
create trigger trg_no_delete_complaint_media before delete on public.complaint_media for each row execute function app.prevent_complaint_physical_delete();
create trigger trg_no_delete_complaint_reports before delete on public.complaint_reports for each row execute function app.prevent_complaint_physical_delete();
create trigger trg_no_delete_complaint_report_items before delete on public.complaint_report_items for each row execute function app.prevent_complaint_physical_delete();

create index idx_complaint_reports_status on public.complaint_reports(status,report_date desc);
create index idx_complaint_report_items_item on public.complaint_report_items(item_id);
create index idx_complaint_contacts_sector on public.complaint_contacts(sector,is_active);

alter table public.complaint_templates enable row level security;
alter table public.complaint_reports enable row level security;
alter table public.complaint_report_items enable row level security;
alter table public.complaint_contacts enable row level security;
alter table public.complaint_settings enable row level security;

create policy "complaint templates: officer select" on public.complaint_templates for select to authenticated
  using (app.has_role(array['complaints_officer','super_admin']));
create policy "complaint templates: officer insert" on public.complaint_templates for insert to authenticated
  with check (app.has_role(array['complaints_officer','super_admin']));
create policy "complaint templates: officer update" on public.complaint_templates for update to authenticated
  using (app.has_role(array['complaints_officer','super_admin'])) with check (app.has_role(array['complaints_officer','super_admin']));

create policy "complaint reports: officer select" on public.complaint_reports for select to authenticated
  using (app.has_role(array['complaints_officer','super_admin']));
create policy "complaint reports: officer insert" on public.complaint_reports for insert to authenticated
  with check (app.has_role(array['complaints_officer','super_admin']) and created_by=auth.uid());
create policy "complaint reports: officer update" on public.complaint_reports for update to authenticated
  using (app.has_role(array['complaints_officer','super_admin'])) with check (app.has_role(array['complaints_officer','super_admin']));

create policy "complaint report items: officer select" on public.complaint_report_items for select to authenticated
  using (app.has_role(array['complaints_officer','super_admin']));
create policy "complaint report items: officer insert" on public.complaint_report_items for insert to authenticated
  with check (app.has_role(array['complaints_officer','super_admin']));
create policy "complaint report items: officer update" on public.complaint_report_items for update to authenticated
  using (app.has_role(array['complaints_officer','super_admin'])) with check (app.has_role(array['complaints_officer','super_admin']));

create policy "complaint contacts: officer select" on public.complaint_contacts for select to authenticated
  using (app.has_role(array['complaints_officer','super_admin']));
create policy "complaint contacts: officer insert" on public.complaint_contacts for insert to authenticated
  with check (app.has_role(array['complaints_officer','super_admin']));
create policy "complaint contacts: officer update" on public.complaint_contacts for update to authenticated
  using (app.has_role(array['complaints_officer','super_admin'])) with check (app.has_role(array['complaints_officer','super_admin']));

create policy "complaint settings: officer select" on public.complaint_settings for select to authenticated
  using (app.has_role(array['complaints_officer','super_admin']));
create policy "complaint settings: officer insert" on public.complaint_settings for insert to authenticated
  with check (app.has_role(array['complaints_officer','super_admin']));
create policy "complaint settings: officer update" on public.complaint_settings for update to authenticated
  using (app.has_role(array['complaints_officer','super_admin'])) with check (app.has_role(array['complaints_officer','super_admin']));

create trigger trg_complaint_templates_updated before update on public.complaint_templates for each row execute function app.set_updated_at();
create trigger trg_complaint_templates_version before update on public.complaint_templates for each row execute function app.bump_version();
create trigger trg_complaint_reports_updated before update on public.complaint_reports for each row execute function app.set_updated_at();
create trigger trg_complaint_reports_version before update on public.complaint_reports for each row execute function app.bump_version();
create trigger trg_complaint_contacts_updated before update on public.complaint_contacts for each row execute function app.set_updated_at();

insert into public.complaint_templates(name,description,is_default,layout)
values('القالب الرسمي قبل وبعد','غلاف + جدول يومي + شريحة قبل/بعد لكل موقع',true,
  '{"accent":"#cf63c6","title":"تقرير معالجة الشكاوى ليوم","beforeLabel":"صورة التلكؤ / الشكوى","afterLabel":"صورة المعالجة","borderRadius":24}')
on conflict do nothing;
insert into public.complaint_settings(key,value,description) values
  ('mailgun','{"provider":"mailgun","maxAttachmentMb":24}','إعدادات عامة غير سرية؛ الأسرار في Edge Function Secrets'),
  ('report','{"includeAllDailyItems":true,"archiveAfterDelivery":true}','سياسة التقرير والأرشفة')
on conflict(key) do nothing;

-- يمنع القفز بين حالات التقرير أو تعديل بياناته الحساسة من العميل.
create or replace function app.complaint_report_guard()
returns trigger language plpgsql set search_path=public,app as $$
begin
  -- SECURITY DEFINER يعمل بمالك الدالة؛ الطلب المباشر يعمل بدور authenticated.
  if auth.role()='service_role' or current_user not in ('authenticated','anon') then return new; end if;
  if not app.has_role(array['complaints_officer','super_admin']) then raise exception 'COMPLAINT_REPORT_FORBIDDEN'; end if;
  if new.status is distinct from old.status and not (old.status='quality_review' and new.status='approved'
    and new.approved_by=auth.uid() and new.approved_at is not null) then
    raise exception 'COMPLAINT_REPORT_TRANSITION_INVALID';
  end if;
  if new.status is not distinct from old.status and (new.approved_by is distinct from old.approved_by
    or new.approved_at is distinct from old.approved_at) then raise exception 'COMPLAINT_REPORT_APPROVAL_IMMUTABLE'; end if;
  if new.report_date is distinct from old.report_date or new.sector is distinct from old.sector
    or new.created_by is distinct from old.created_by or new.delivery_id is distinct from old.delivery_id
    or new.pptx_path is distinct from old.pptx_path or new.sent_at is distinct from old.sent_at
    or new.archived_at is distinct from old.archived_at then raise exception 'COMPLAINT_REPORT_IMMUTABLE_FIELDS'; end if;
  return new;
end $$;
create trigger trg_complaint_reports_guard before update on public.complaint_reports
  for each row execute function app.complaint_report_guard();

-- تدقيق عنصر: اعتماد أو إرجاع لمسؤول القسم مع ملاحظة إلزامية عند الإرجاع.
create or replace function public.complaint_review_item(p_item_id uuid,p_approved boolean,p_note text default null)
returns void language plpgsql security definer set search_path=public,app as $$
declare v_item public.complaint_items%rowtype; v_next text;
begin
  if not app.has_role(array['complaints_officer','super_admin']) then raise exception 'COMPLAINT_REVIEW_FORBIDDEN'; end if;
  select * into v_item from public.complaint_items where id=p_item_id for update;
  if not found or v_item.status not in ('processed','quality_review') then raise exception 'COMPLAINT_NOT_REVIEWABLE'; end if;
  if not p_approved and nullif(trim(p_note),'') is null then raise exception 'COMPLAINT_RETURN_NOTE_REQUIRED'; end if;
  v_next:=case when p_approved then 'approved' else 'returned' end;
  update public.complaint_items set status=v_next,reviewer_notes=nullif(trim(p_note),''),reviewed_at=now(),
    started_at=case when p_approved then started_at else null end,
    processed_at=case when p_approved then processed_at else null end where id=p_item_id;
  insert into public.complaint_status_history(complaint_id,item_id,from_status,to_status,note,actor_id)
    values(v_item.complaint_id,p_item_id,v_item.status,v_next,p_note,auth.uid());
  if not p_approved and v_item.assigned_to is not null then
    insert into public.notifications(user_id,title,body,type,link)
      values(v_item.assigned_to,'أُعيدت معالجة شكوى',p_note,'warning','/manager/complaints');
  end if;
end $$;

-- إنشاء/تحديث مسودة التقرير اليومي وإدراج كل مواقع اليوم للقاطع وفق قرار العمل.
create or replace function public.complaint_prepare_daily_report(p_sector text,p_date date,p_template_id uuid default null)
returns uuid language plpgsql security definer set search_path=public,app as $$
declare v_report uuid; v_template uuid; v_layout jsonb; v_status text; v_recipients text[];
begin
  if not app.has_role(array['complaints_officer','super_admin']) then raise exception 'COMPLAINT_REPORT_FORBIDDEN'; end if;
  if p_sector not in ('karrada','zaafaraniya') then raise exception 'COMPLAINT_SECTOR_INVALID'; end if;
  select id,layout into v_template,v_layout from public.complaint_templates
    where id=coalesce(p_template_id,id) and is_active order by (id=p_template_id) desc,is_default desc limit 1;
  select id,status into v_report,v_status from public.complaint_reports
    where report_date=p_date and sector=p_sector for update;
  if found and v_status not in ('draft','quality_review','failed') then raise exception 'COMPLAINT_REPORT_LOCKED'; end if;
  select array_agg(distinct lower(email)) into v_recipients from (
    select sender_email as email from public.complaints
      where sector=p_sector and timezone('Asia/Baghdad',received_at)::date=p_date and sender_email is not null
    union all
    select email from public.complaint_contacts where (sector=p_sector or sector is null) and kind='recipient' and is_active
  ) addresses where nullif(trim(email),'') is not null;
  insert into public.complaint_reports(report_date,sector,template_id,title,layout,recipients,created_by,status,pptx_path,delivery_id)
    values(p_date,p_sector,v_template,'تقرير معالجة الشكاوى ليوم '||to_char(p_date,'DD/MM/YYYY'),coalesce(v_layout,'{}'),
      coalesce(v_recipients,'{}'),auth.uid(),'draft',null,null)
  on conflict(report_date,sector) do update set template_id=excluded.template_id,layout=excluded.layout,
    title=excluded.title,recipients=excluded.recipients,status='draft',pptx_path=null,delivery_id=null,approved_by=null,approved_at=null
  returning id into v_report;
  insert into public.complaint_report_items(report_id,item_id,display_order,included)
    select v_report,i.id,row_number() over(order by c.received_at,i.sequence_no)::integer,true
    from public.complaint_items i join public.complaints c on c.id=i.complaint_id
    where c.sector=p_sector and timezone('Asia/Baghdad',c.received_at)::date=p_date and c.archived_at is null
  on conflict(report_id,item_id) do update set display_order=excluded.display_order,included=true;
  return v_report;
end $$;

create or replace function public.complaint_approve_report(p_report_id uuid)
returns void language plpgsql security definer set search_path=public,app as $$
begin
  if not app.has_role(array['complaints_officer','super_admin']) then raise exception 'COMPLAINT_REPORT_FORBIDDEN'; end if;
  update public.complaint_reports set status='approved',approved_by=auth.uid(),approved_at=now()
    where id=p_report_id and status='quality_review' and pptx_path is not null;
  if not found then raise exception 'COMPLAINT_REPORT_NOT_REVIEWABLE'; end if;
end $$;

grant execute on function public.complaint_review_item(uuid,boolean,text) to authenticated;
grant execute on function public.complaint_prepare_daily_report(text,date,uuid) to authenticated;
grant execute on function public.complaint_approve_report(uuid) to authenticated;

create or replace function app.complaint_after_delivery()
returns trigger language plpgsql security definer set search_path=public,app as $$
begin
  if old.status is distinct from new.status and new.status='delivered' then
    update public.complaint_reports set status='archived',sent_at=coalesce(new.delivered_at,now()),archived_at=now()
      where delivery_id=new.id;
    update public.complaints c set status='archived',sent_at=coalesce(new.delivered_at,now()),archived_at=now()
      where exists (
        select 1 from public.complaint_report_items ri join public.complaint_reports r on r.id=ri.report_id
        join public.complaint_items i on i.id=ri.item_id
        where r.delivery_id=new.id and ri.included and i.complaint_id=c.id
      );
  elsif old.status is distinct from new.status and new.status in ('temporary_failure','permanent_failure','rejected') then
    update public.complaint_reports set status='failed' where delivery_id=new.id;
  end if;
  return new;
end $$;
create trigger trg_complaint_delivery_lifecycle after update of status on public.complaint_email_deliveries
  for each row execute function app.complaint_after_delivery();

create or replace function public.complaint_dashboard_summary()
returns jsonb language sql stable security definer set search_path=public,app as $$
  select case when not app.has_role(array['complaints_officer','super_admin']) then '{}'::jsonb else
    jsonb_build_object(
      'total',count(*),'newCount',count(*) filter(where status in('new','under_review')),
      'assigned',count(*) filter(where status='assigned'),'inProgress',count(*) filter(where status='in_progress'),
      'processed',count(*) filter(where status in('processed','quality_review','ready_to_send','sent')),
      'archived',count(*) filter(where status='archived'),'karrada',count(*) filter(where sector='karrada'),
      'zaafaraniya',count(*) filter(where sector='zaafaraniya')) end
  from public.complaints
$$;
grant execute on function public.complaint_dashboard_summary() to authenticated;
