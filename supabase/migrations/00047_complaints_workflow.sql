-- ═══════════════════════════════════════════════════════════════
-- 00047 · دورة الشكاوى — البريد الوارد ← الفرز ← الإسناد ← المعالجة
-- كل صفحات العميل تستخدم SDK؛ وظائف Mailgun Edge الموقعة وحدها تستخدم service_role للاستيراد.
-- ═══════════════════════════════════════════════════════════════

create table public.complaint_inbox_messages (
  id uuid primary key default gen_random_uuid(),
  internet_message_id text not null unique,
  sender_email text not null,
  sender_name text,
  reply_to text,
  recipients text[] not null default '{}',
  subject text,
  body_text text,
  source_sector text check (source_sector in ('karrada','zaafaraniya')),
  received_at timestamptz not null,
  import_status text not null default 'new'
    check (import_status in ('new','extracting','ready','needs_review','imported','failed','duplicate')),
  duplicate_of uuid references public.complaint_inbox_messages(id),
  error_message text,
  attachment_count integer not null default 0 check (attachment_count >= 0),
  raw_metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  inbox_message_id uuid references public.complaint_inbox_messages(id),
  reference_no text not null unique default ('CMP-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text,1,6))),
  sector text not null check (sector in ('karrada','zaafaraniya')),
  municipal_center text,
  neighborhood text,
  alley text,
  complaint_type text,
  source text not null default 'email' check (source in ('email','manual')),
  sender_email text,
  received_at timestamptz not null default now(),
  status text not null default 'new' check (status in (
    'new','under_review','assigned','in_progress','processed','quality_review',
    'ready_to_send','sent','archived'
  )),
  review_notes text,
  sent_at timestamptz,
  archived_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

create table public.complaint_items (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete restrict,
  sequence_no integer not null check (sequence_no > 0),
  title text,
  municipal_center text,
  neighborhood text,
  alley text,
  location_text text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  ocr_text text,
  ocr_confidence numeric(5,2) check (ocr_confidence between 0 and 100),
  assigned_to uuid references auth.users(id),
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz,
  status text not null default 'under_review' check (status in (
    'under_review','assigned','in_progress','processed','quality_review','approved','returned'
  )),
  manager_notes text,
  reviewer_notes text,
  started_at timestamptz,
  processed_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (complaint_id, sequence_no)
);

create table public.complaint_media (
  id uuid primary key default gen_random_uuid(),
  inbox_message_id uuid references public.complaint_inbox_messages(id),
  item_id uuid references public.complaint_items(id) on delete restrict,
  media_kind text not null check (media_kind in ('email_attachment','before','after','report')),
  storage_path text not null unique,
  original_name text,
  mime_type text not null,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  sha256 text,
  pdf_page integer check (pdf_page is null or pdf_page > 0),
  width integer,
  height integer,
  latitude numeric(9,6),
  longitude numeric(9,6),
  captured_at timestamptz,
  source text not null default 'email' check (source in ('email','camera','gallery','manual')),
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (inbox_message_id is not null or item_id is not null)
);

create table public.complaint_status_history (
  id bigint generated always as identity primary key,
  complaint_id uuid references public.complaints(id),
  item_id uuid references public.complaint_items(id),
  from_status text,
  to_status text not null,
  note text,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (complaint_id is not null or item_id is not null)
);

create table public.complaint_sender_rules (
  id uuid primary key default gen_random_uuid(),
  sender_pattern text not null unique,
  sector text not null check (sector in ('karrada','zaafaraniya')),
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_complaint_inbox_received on public.complaint_inbox_messages(received_at desc);
create index idx_complaint_inbox_sector on public.complaint_inbox_messages(source_sector, import_status);
create index idx_complaints_sector_status on public.complaints(sector, status, received_at desc);
create index idx_complaint_items_assignee on public.complaint_items(assigned_to, status) where assigned_to is not null;
create index idx_complaint_items_complaint on public.complaint_items(complaint_id, sequence_no);
create index idx_complaint_media_item on public.complaint_media(item_id, media_kind);
create index idx_complaint_media_hash on public.complaint_media(sha256) where sha256 is not null;

alter table public.complaint_inbox_messages enable row level security;
alter table public.complaints enable row level security;
alter table public.complaint_items enable row level security;
alter table public.complaint_media enable row level security;
alter table public.complaint_status_history enable row level security;
alter table public.complaint_sender_rules enable row level security;

-- موظف الشكاوى يدير البريد والحزم والقواعد؛ لا يراها مسؤول القسم قبل الإسناد.
create policy "complaints inbox: officer select" on public.complaint_inbox_messages
  for select to authenticated using (app.has_role(array['complaints_officer','super_admin']));
create policy "complaints inbox: officer write" on public.complaint_inbox_messages
  for all to authenticated using (app.has_role(array['complaints_officer','super_admin']))
  with check (app.has_role(array['complaints_officer','super_admin']));

create policy "complaints: officer manage" on public.complaints
  for all to authenticated using (app.has_role(array['complaints_officer','super_admin']))
  with check (app.has_role(array['complaints_officer','super_admin']));
create policy "complaints: assigned manager read" on public.complaints
  for select to authenticated using (
    exists (select 1 from public.complaint_items i where i.complaint_id = id and i.assigned_to = auth.uid())
  );

create policy "complaint items: officer manage" on public.complaint_items
  for all to authenticated using (app.has_role(array['complaints_officer','super_admin']))
  with check (app.has_role(array['complaints_officer','super_admin']));
create policy "complaint items: assignee read" on public.complaint_items
  for select to authenticated using (assigned_to = auth.uid());

create policy "complaint media: officer manage" on public.complaint_media
  for all to authenticated using (app.has_role(array['complaints_officer','super_admin']))
  with check (app.has_role(array['complaints_officer','super_admin']));
create policy "complaint media: assignee read" on public.complaint_media
  for select to authenticated using (
    exists (select 1 from public.complaint_items i where i.id = item_id and i.assigned_to = auth.uid())
  );
create policy "complaint media: assignee add after" on public.complaint_media
  for insert to authenticated with check (
    media_kind = 'after' and uploaded_by = auth.uid()
    and exists (select 1 from public.complaint_items i where i.id = item_id and i.assigned_to = auth.uid())
  );

create policy "complaint history: officer read" on public.complaint_status_history
  for select to authenticated using (app.has_role(array['complaints_officer','super_admin']));
create policy "complaint history: assignee read" on public.complaint_status_history
  for select to authenticated using (
    exists (select 1 from public.complaint_items i where i.id = item_id and i.assigned_to = auth.uid())
  );

create policy "complaint sender rules: officer manage" on public.complaint_sender_rules
  for all to authenticated using (app.has_role(array['complaints_officer','super_admin']))
  with check (app.has_role(array['complaints_officer','super_admin']));

create trigger trg_complaint_inbox_updated before update on public.complaint_inbox_messages
  for each row execute function app.set_updated_at();
create trigger trg_complaints_updated before update on public.complaints
  for each row execute function app.set_updated_at();
create trigger trg_complaints_version before update on public.complaints
  for each row execute function app.bump_version();
create trigger trg_complaint_items_updated before update on public.complaint_items
  for each row execute function app.set_updated_at();
create trigger trg_complaint_items_version before update on public.complaint_items
  for each row execute function app.bump_version();
create trigger trg_complaint_sender_rules_updated before update on public.complaint_sender_rules
  for each row execute function app.set_updated_at();

-- إسناد عنصر إلى مسؤول قسم بعينه؛ التحقق من دوره يتم على الخادم.
create or replace function public.complaint_assign_item(p_item_id uuid, p_manager_id uuid)
returns void language plpgsql security definer set search_path = public, app as $$
declare v_old text; v_complaint uuid;
begin
  if not app.has_role(array['complaints_officer','super_admin']) then
    raise exception 'COMPLAINT_ASSIGN_FORBIDDEN';
  end if;
  if not exists (select 1 from public.user_roles where user_id = p_manager_id and role = 'department_manager') then
    raise exception 'COMPLAINT_MANAGER_INVALID';
  end if;

  select status, complaint_id into v_old, v_complaint from public.complaint_items where id = p_item_id for update;
  if not found then raise exception 'COMPLAINT_ITEM_NOT_FOUND'; end if;

  update public.complaint_items set assigned_to=p_manager_id, assigned_by=auth.uid(),
    assigned_at=now(), status='assigned' where id=p_item_id;
  update public.complaints set status='assigned' where id=v_complaint and status in ('new','under_review');
  insert into public.complaint_status_history(complaint_id,item_id,from_status,to_status,actor_id)
    values(v_complaint,p_item_id,v_old,'assigned',auth.uid());
  insert into public.notifications(user_id,title,body,type,link)
    values(p_manager_id,'شكوى جديدة مسندة إليك','تم إسناد موقع جديد لمعالجته','info','/manager/complaints');
end $$;

create or replace function public.complaint_start_item(p_item_id uuid)
returns void language plpgsql security definer set search_path = public, app as $$
declare v_old text; v_complaint uuid;
begin
  select status, complaint_id into v_old, v_complaint from public.complaint_items
    where id=p_item_id and assigned_to=auth.uid() for update;
  if not found or v_old not in ('assigned','returned') then raise exception 'COMPLAINT_START_FORBIDDEN'; end if;
  update public.complaint_items set status='in_progress', started_at=clock_timestamp() where id=p_item_id;
  update public.complaints set status='in_progress' where id=v_complaint and status='assigned';
  insert into public.complaint_status_history(complaint_id,item_id,from_status,to_status,actor_id)
    values(v_complaint,p_item_id,v_old,'in_progress',auth.uid());
end $$;

create or replace function public.complaint_complete_item(p_item_id uuid, p_notes text default null)
returns void language plpgsql security definer set search_path = public, app as $$
declare v_old text; v_complaint uuid;
begin
  select status, complaint_id into v_old, v_complaint from public.complaint_items
    where id=p_item_id and assigned_to=auth.uid() for update;
  if not found or v_old <> 'in_progress' then raise exception 'COMPLAINT_COMPLETE_FORBIDDEN'; end if;
  if not exists (select 1 from public.complaint_media
    where item_id=p_item_id and media_kind='after' and captured_at >= (select started_at from public.complaint_items where id=p_item_id)) then
    raise exception 'COMPLAINT_AFTER_IMAGE_REQUIRED';
  end if;
  update public.complaint_items set status='processed', manager_notes=nullif(trim(p_notes),''), processed_at=now()
    where id=p_item_id;
  update public.complaints set status='quality_review' where id=v_complaint;
  insert into public.complaint_status_history(complaint_id,item_id,from_status,to_status,note,actor_id)
    values(v_complaint,p_item_id,v_old,'processed',p_notes,auth.uid());
end $$;

grant execute on function public.complaint_assign_item(uuid,uuid) to authenticated;
grant execute on function public.complaint_start_item(uuid) to authenticated;
grant execute on function public.complaint_complete_item(uuid,text) to authenticated;

-- ملفات الشكاوى: مسار item/{item-id}/... لمسؤولي الأقسام، والوصول الكامل لموظف الشكاوى.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('complaint-media','complaint-media',false,26214400,array['image/jpeg','image/png','image/webp','application/pdf','application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict(id) do nothing;

create policy "complaint storage: officer all" on storage.objects
  for all to authenticated using (bucket_id='complaint-media' and app.has_role(array['complaints_officer','super_admin']))
  with check (bucket_id='complaint-media' and app.has_role(array['complaints_officer','super_admin']));
create policy "complaint storage: manager read assigned" on storage.objects
  for select to authenticated using (
    bucket_id='complaint-media' and (storage.foldername(name))[1]='item'
    and exists (select 1 from public.complaint_items i where i.id::text=(storage.foldername(name))[2] and i.assigned_to=auth.uid())
  );
create policy "complaint storage: manager upload after" on storage.objects
  for insert to authenticated with check (
    bucket_id='complaint-media' and (storage.foldername(name))[1]='item'
    and (storage.foldername(name))[3]='after'
    and exists (select 1 from public.complaint_items i where i.id::text=(storage.foldername(name))[2] and i.assigned_to=auth.uid())
  );

create or replace function public.complaint_list_managers()
returns table(user_id uuid, full_name text, job_title text)
language sql stable security definer set search_path = public, app as $$
  select ur.user_id, coalesce(e.full_name, 'مسؤول قسم') as full_name, e.job_title
  from public.user_roles ur
  left join public.employees e on e.user_id=ur.user_id
  where ur.role='department_manager'
    and app.has_role(array['complaints_officer','super_admin'])
  order by coalesce(e.full_name, ur.user_id::text)
$$;
grant execute on function public.complaint_list_managers() to authenticated;

-- تحويل صور مختارة من رسالة واردة إلى موقع واحد قابل للإسناد.
create or replace function public.complaint_create_item_from_inbox(
  p_message_id uuid, p_media_ids uuid[], p_fields jsonb default '{}'
) returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_message public.complaint_inbox_messages%rowtype; v_complaint uuid; v_item uuid; v_seq integer;
begin
  if not app.has_role(array['complaints_officer','super_admin']) then raise exception 'COMPLAINT_CREATE_FORBIDDEN'; end if;
  if coalesce(array_length(p_media_ids,1),0)=0 then raise exception 'COMPLAINT_MEDIA_REQUIRED'; end if;
  select * into v_message from public.complaint_inbox_messages where id=p_message_id for update;
  if not found then raise exception 'COMPLAINT_MESSAGE_NOT_FOUND'; end if;
  if v_message.source_sector is null then raise exception 'COMPLAINT_SECTOR_REVIEW_REQUIRED'; end if;
  if (select count(*) from public.complaint_media where id=any(p_media_ids) and inbox_message_id=p_message_id and item_id is null)
     <> array_length(p_media_ids,1) then raise exception 'COMPLAINT_MEDIA_INVALID'; end if;

  select id into v_complaint from public.complaints where inbox_message_id=p_message_id order by created_at limit 1;
  if v_complaint is null then
    insert into public.complaints(inbox_message_id,sector,municipal_center,neighborhood,alley,complaint_type,
      sender_email,received_at,status,created_by)
    values(p_message_id,v_message.source_sector,p_fields->>'municipal_center',p_fields->>'neighborhood',
      p_fields->>'alley',p_fields->>'complaint_type',v_message.sender_email,v_message.received_at,'under_review',auth.uid())
    returning id into v_complaint;
  end if;
  select coalesce(max(sequence_no),0)+1 into v_seq from public.complaint_items where complaint_id=v_complaint;
  insert into public.complaint_items(complaint_id,sequence_no,title,municipal_center,neighborhood,alley,location_text,ocr_text)
  values(v_complaint,v_seq,p_fields->>'title',p_fields->>'municipal_center',p_fields->>'neighborhood',
    p_fields->>'alley',p_fields->>'location_text',p_fields->>'ocr_text') returning id into v_item;
  update public.complaint_media set item_id=v_item,media_kind='before' where id=any(p_media_ids);
  update public.complaint_inbox_messages set import_status='imported' where id=p_message_id;
  insert into public.complaint_status_history(complaint_id,item_id,to_status,note,actor_id)
    values(v_complaint,v_item,'under_review','إنشاء موقع من البريد الوارد',auth.uid());
  return v_item;
end $$;
grant execute on function public.complaint_create_item_from_inbox(uuid,uuid[],jsonb) to authenticated;
