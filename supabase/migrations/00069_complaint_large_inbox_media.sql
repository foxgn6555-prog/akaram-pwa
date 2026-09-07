-- 00069 · عرض مرفقات البريد الكبير بصفحات ثابتة الذاكرة (500 صورة وأكثر)

create or replace function public.complaint_inbox_media_page(
  p_message_id uuid,
  p_limit integer default 48,
  p_offset integer default 0
) returns jsonb
language plpgsql stable security definer set search_path=public,app as $$
declare
  v_limit integer := least(100,greatest(12,coalesce(p_limit,48)));
  v_offset integer := greatest(0,coalesce(p_offset,0));
  v_rows jsonb;
  v_total integer;
  v_images integer;
  v_sorted integer;
begin
  if not app.has_role(array['complaints_officer','super_admin']) then
    raise exception 'COMPLAINT_MEDIA_FORBIDDEN';
  end if;
  if not exists(select 1 from public.complaint_inbox_messages where id=p_message_id) then
    raise exception 'COMPLAINT_MESSAGE_NOT_FOUND';
  end if;

  select count(*),
         count(*) filter(where mime_type like 'image/%'),
         count(*) filter(where mime_type like 'image/%' and item_id is not null)
    into v_total,v_images,v_sorted
  from public.complaint_media where inbox_message_id=p_message_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,'mediaCode',q.media_code,'name',q.original_name,
    'mimeType',q.mime_type,'storagePath',q.storage_path,'sha256',q.sha256,
    'itemId',q.item_id,'duplicateCount',case when q.sha256 is null then 0 else (
      select count(*) from public.complaint_media d where d.sha256=q.sha256 and d.id<>q.id
    ) end
  ) order by q.created_at,q.id),'[]'::jsonb) into v_rows
  from (
    select m.* from public.complaint_media m
    where m.inbox_message_id=p_message_id
    order by m.created_at,m.id limit v_limit offset v_offset
  ) q;

  return jsonb_build_object(
    'rows',v_rows,'totalCount',v_total,'imageCount',v_images,
    'sortedImageCount',v_sorted,'remainingImageCount',v_images-v_sorted
  );
end $$;

revoke all on function public.complaint_inbox_media_page(uuid,integer,integer) from public;
grant execute on function public.complaint_inbox_media_page(uuid,integer,integer) to authenticated;

create index if not exists idx_complaint_media_inbox_created
  on public.complaint_media(inbox_message_id,created_at,id);
create index if not exists idx_complaint_media_sha256
  on public.complaint_media(sha256) where sha256 is not null;
