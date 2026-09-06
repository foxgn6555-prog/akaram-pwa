-- ═══════════════════════════════════════════════════════════════
-- 00054 · تصحيح صور وموقع الشكوى مع حفظ النسخ والأثر التدقيقي
-- لا حذف أو استبدال صامت: تبقى النسخة السابقة غير فعالة وقابلة للمراجعة.
-- ═══════════════════════════════════════════════════════════════

alter table public.complaint_media
  add column is_active boolean not null default true,
  add column superseded_by uuid references public.complaint_media(id),
  add column superseded_at timestamptz,
  add column superseded_by_user uuid references auth.users(id),
  add column replacement_reason text;
create index idx_complaint_media_active_item on public.complaint_media(item_id,media_kind) where is_active;

create table public.complaint_media_revisions(
  id bigint generated always as identity primary key,
  item_id uuid not null references public.complaint_items(id) on delete restrict,
  old_media_id uuid not null references public.complaint_media(id) on delete restrict,
  new_media_id uuid not null references public.complaint_media(id) on delete restrict,
  media_kind text not null check(media_kind in('before','after')),
  reason text not null check(length(trim(reason))>=3),
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.complaint_media_revisions enable row level security;
create policy "complaint media revisions: officer read" on public.complaint_media_revisions
  for select to authenticated using(app.has_role(array['complaints_officer','super_admin']));

-- المدير لا يقرأ نسخة ألغيت أثناء التدقيق.
drop policy if exists "complaint media: assignee read" on public.complaint_media;
create policy "complaint media: assignee read" on public.complaint_media
  for select to authenticated using(is_active and exists(
    select 1 from public.complaint_items i where i.id=item_id and i.assigned_to=auth.uid()
  ));
-- وينطبق العزل نفسه على الكائن المخزن، وليس صف metadata فقط.
drop policy if exists "complaint storage: manager read assigned" on storage.objects;
create policy "complaint storage: manager read active assigned" on storage.objects
  for select to authenticated using(bucket_id='complaint-media' and exists(
    select 1 from public.complaint_media m join public.complaint_items i on i.id=m.item_id
    where m.storage_path=storage.objects.name and m.is_active and i.assigned_to=auth.uid()
  ));

create or replace function public.complaint_replace_item_media(
  p_item_id uuid,p_old_media_id uuid,p_storage_path text,p_original_name text,
  p_mime_type text,p_size_bytes bigint,p_sha256 text,p_reason text
) returns uuid language plpgsql security definer set search_path=public,app as $$
declare v_item public.complaint_items%rowtype;v_old public.complaint_media%rowtype;v_new uuid;
begin
  if not app.has_role(array['complaints_officer','super_admin']) then raise exception 'COMPLAINT_MEDIA_REPLACE_FORBIDDEN'; end if;
  if nullif(trim(p_reason),'') is null or length(trim(p_reason))<3 then raise exception 'COMPLAINT_MEDIA_REASON_REQUIRED'; end if;
  if p_mime_type not in('image/jpeg','image/png','image/webp') or p_size_bytes is null or p_size_bytes<1 or p_size_bytes>26214400
    then raise exception 'COMPLAINT_MEDIA_FILE_INVALID'; end if;
  if nullif(trim(p_storage_path),'') is null or nullif(trim(p_sha256),'') is null then raise exception 'COMPLAINT_MEDIA_FILE_INVALID'; end if;
  select * into v_item from public.complaint_items where id=p_item_id for update;
  if not found then raise exception 'COMPLAINT_ITEM_NOT_FOUND'; end if;
  if v_item.status not in('under_review','assigned','in_progress','processed','quality_review','returned')
    then raise exception 'COMPLAINT_MEDIA_REVIEW_LOCKED'; end if;
  select * into v_old from public.complaint_media where id=p_old_media_id and item_id=p_item_id
    and media_kind in('before','after') and is_active for update;
  if not found then raise exception 'COMPLAINT_MEDIA_NOT_ACTIVE'; end if;
  insert into public.complaint_media(inbox_message_id,item_id,media_kind,storage_path,original_name,mime_type,
    size_bytes,sha256,captured_at,source,uploaded_by,is_active,replacement_reason)
  values(v_old.inbox_message_id,p_item_id,v_old.media_kind,trim(p_storage_path),nullif(trim(p_original_name),''),
    p_mime_type,p_size_bytes,lower(trim(p_sha256)),clock_timestamp(),'manual',auth.uid(),true,trim(p_reason))
  returning id into v_new;
  update public.complaint_media set is_active=false,superseded_by=v_new,superseded_at=clock_timestamp(),
    superseded_by_user=auth.uid(),replacement_reason=trim(p_reason) where id=p_old_media_id;
  insert into public.complaint_media_revisions(item_id,old_media_id,new_media_id,media_kind,reason,actor_id)
    values(p_item_id,p_old_media_id,v_new,v_old.media_kind,trim(p_reason),auth.uid());
  return v_new;
end $$;
grant execute on function public.complaint_replace_item_media(uuid,uuid,text,text,text,bigint,text,text) to authenticated;

create or replace function public.complaint_update_item_during_review(
  p_item_id uuid,p_neighborhood text,p_alley text,p_municipal_center text default null,
  p_location_text text default null,p_reason text default null
) returns void language plpgsql security definer set search_path=public,app as $$
declare v_item public.complaint_items%rowtype;
begin
  if not app.has_role(array['complaints_officer','super_admin']) then raise exception 'COMPLAINT_REVIEW_FORBIDDEN'; end if;
  if nullif(trim(p_neighborhood),'') is null or nullif(trim(p_alley),'') is null then raise exception 'COMPLAINT_LOCATION_REQUIRED'; end if;
  if nullif(trim(p_reason),'') is null or length(trim(p_reason))<3 then raise exception 'COMPLAINT_REVIEW_REASON_REQUIRED'; end if;
  select * into v_item from public.complaint_items where id=p_item_id for update;
  if not found then raise exception 'COMPLAINT_ITEM_NOT_FOUND'; end if;
  if v_item.status not in('under_review','assigned','in_progress','processed','quality_review','returned')
    then raise exception 'COMPLAINT_REVIEW_LOCKED'; end if;
  update public.complaint_items set neighborhood=trim(p_neighborhood),alley=trim(p_alley),
    municipal_center=nullif(trim(p_municipal_center),''),location_text=nullif(trim(p_location_text),'') where id=p_item_id;
  insert into public.complaint_status_history(complaint_id,item_id,from_status,to_status,note,actor_id)
    values(v_item.complaint_id,p_item_id,v_item.status,v_item.status,'تصحيح بيانات الموقع: '||trim(p_reason),auth.uid());
end $$;
grant execute on function public.complaint_update_item_during_review(uuid,text,text,text,text,text) to authenticated;
