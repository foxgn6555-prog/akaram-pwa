-- 00136 · وحدة GBS الحاويات: خريطة حاويات بألوان حالة + رمز تسلسلي فريد + دورة اعتماد تحديثات مسؤول القسم.
-- العقد:
--   · غرفة العمليات: إضافة/تعديل/حذف الحاويات مباشرة + اعتماد أو رفض طلبات التحديث.
--   · مسؤول القسم: طلب تحديث حالة (سليمة/متضررة/يجب استبدالها/مفقودة) مع صورة اختيارية —
--     لا تتغير البيانات قبل موافقة غرفة العمليات.
--   · الحالات: ok=سليمة(أخضر) · damaged=متضررة(أصفر) · replace=يجب استبدالها(أحمر) · missing=مفقودة(رمادي).
--   · رمز فريد بالترتيب: GBS-0001, GBS-0002 … (تسلسل لا يعيد الأرقام).

create sequence if not exists public.gbs_container_code_seq start 1;

create table public.gbs_containers(
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null check(length(trim(label)) between 2 and 120),
  latitude float8 not null check(latitude between -90 and 90),
  longitude float8 not null check(longitude between -180 and 180),
  status text not null default 'ok' check(status in ('ok','damaged','replace','missing')),
  image_path text,
  notes text check(notes is null or length(trim(notes)) <= 500),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index gbs_containers_status_idx on public.gbs_containers(status, label);
alter table public.gbs_containers enable row level security;

create table public.gbs_container_updates(
  id uuid primary key default gen_random_uuid(),
  container_id uuid not null references public.gbs_containers(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  proposed_status text not null check(proposed_status in ('ok','damaged','replace','missing')),
  photo_path text,
  note text check(note is null or length(trim(note)) <= 500),
  state text not null default 'pending' check(state in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text check(review_note is null or length(trim(review_note)) <= 500),
  created_at timestamptz not null default now()
);
create index gbs_updates_state_idx on public.gbs_container_updates(state, created_at desc);
create index gbs_updates_container_idx on public.gbs_container_updates(container_id, state);
alter table public.gbs_container_updates enable row level security;

-- التخزين: صور الحاويات (خاصة) — الرفع بمجلد المستخدم، القراءة للعمليات أو المالك
insert into storage.buckets (id, name, public)
values ('gbs-containers', 'gbs-containers', false)
on conflict (id) do nothing;

create policy "gbs containers: رفع من مسؤول قسم أو عمليات"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'gbs-containers'
    and app.has_role(array['department_manager','ops_room','super_admin'])
    and (name like auth.uid()::text || '/%')
  );

create policy "gbs containers: قراءة للعمليات والمالك"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'gbs-containers'
    and (
      app.has_role(array['ops_room','super_admin'])
      or (name like auth.uid()::text || '/%')
    )
  );

-- ① قائمة الحاويات للخريطة (غرفة العمليات + مسؤول القسم) مع بحث وفلترة حالة وعدد الطلبات المعلقة
create or replace function public.gbs_containers_list(p_search text default null, p_status text default null)
returns table(id uuid, code text, label text, latitude float8, longitude float8,
              status text, image_path text, notes text, updated_at timestamptz, pending_count bigint)
language plpgsql stable security definer set search_path=public,app as $$
begin
  if not app.has_role(array['ops_room','department_manager','super_admin']) then
    raise exception 'GBS_FORBIDDEN';
  end if;
  if p_status is not null and p_status not in ('ok','damaged','replace','missing') then
    raise exception 'GBS_STATUS_INVALID';
  end if;
  return query
  select c.id, c.code, c.label, c.latitude, c.longitude, c.status, c.image_path, c.notes, c.updated_at,
         (select count(*) from public.gbs_container_updates u
           where u.container_id = c.id and u.state = 'pending')
  from public.gbs_containers c
  where (p_status is null or c.status = p_status)
    and (nullif(trim(coalesce(p_search,'')),'') is null
         or c.code ilike '%' || trim(p_search) || '%'
         or c.label ilike '%' || trim(p_search) || '%'
         or coalesce(c.notes,'') ilike '%' || trim(p_search) || '%')
  order by c.code;
end$$;

-- ② حفظ حاوية (إضافة/تعديل) — غرفة العمليات فقط؛ الرمز التسلسلي يُولد عند الإضافة
create or replace function public.gbs_container_save(
  p_id uuid, p_label text, p_latitude float8, p_longitude float8,
  p_status text, p_image_path text default null, p_notes text default null)
returns table(id uuid, code text)
language plpgsql security definer set search_path=public,app as $$
declare u uuid := auth.uid(); cid uuid; ccode text;
begin
  if u is null or not app.has_role(array['ops_room','super_admin']) then
    raise exception 'GBS_FORBIDDEN';
  end if;
  if length(trim(coalesce(p_label,''))) not between 2 and 120 then
    raise exception 'GBS_LABEL_INVALID';
  end if;
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'GBS_POINT_INVALID';
  end if;
  if coalesce(p_status,'') not in ('ok','damaged','replace','missing') then
    raise exception 'GBS_STATUS_INVALID';
  end if;
  if length(trim(coalesce(p_notes,''))) > 500 then
    raise exception 'GBS_NOTES_INVALID';
  end if;
  if p_id is null then
    ccode := 'GBS-' || lpad(nextval('public.gbs_container_code_seq')::text, 4, '0');
    insert into public.gbs_containers(code, label, latitude, longitude, status, image_path, notes, created_by)
    values(ccode, trim(p_label), p_latitude, p_longitude, p_status,
           nullif(trim(coalesce(p_image_path,'')),''), nullif(trim(coalesce(p_notes,'')),''), u)
    returning gbs_containers.id into cid;
  else
    update public.gbs_containers
       set label = trim(p_label), latitude = p_latitude, longitude = p_longitude,
           status = p_status,
           image_path = nullif(trim(coalesce(p_image_path,'')),''),
           notes = nullif(trim(coalesce(p_notes,'')),''),
           updated_at = now()
     where gbs_containers.id = p_id returning gbs_containers.id, gbs_containers.code into cid, ccode;
    if cid is null then raise exception 'GBS_CONTAINER_NOT_FOUND'; end if;
  end if;
  return query select cid, ccode;
end$$;

-- ③ حذف حاوية — غرفة العمليات فقط (طلباتها تُحذف تلقائياً)
create or replace function public.gbs_container_delete(p_id uuid)
returns void
language plpgsql security definer set search_path=public,app as $$
declare u uuid := auth.uid(); n bigint;
begin
  if u is null or not app.has_role(array['ops_room','super_admin']) then
    raise exception 'GBS_FORBIDDEN';
  end if;
  delete from public.gbs_containers where id = p_id;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'GBS_CONTAINER_NOT_FOUND'; end if;
end$$;

-- ④ طلب تحديث حالة من مسؤول القسم — يبقى معلقاً حتى تعتمده غرفة العمليات
create or replace function public.gbs_container_request_update(
  p_container_id uuid, p_proposed_status text, p_photo_path text default null, p_note text default null)
returns uuid
language plpgsql security definer set search_path=public,app as $$
declare u uuid := auth.uid(); c public.gbs_containers; uid uuid; status_ar text;
begin
  if u is null or not app.has_role(array['department_manager']) then
    raise exception 'GBS_MANAGER_FORBIDDEN';
  end if;
  if coalesce(p_proposed_status,'') not in ('ok','damaged','replace','missing') then
    raise exception 'GBS_STATUS_INVALID';
  end if;
  if length(trim(coalesce(p_note,''))) > 500 then
    raise exception 'GBS_NOTES_INVALID';
  end if;
  select * into c from public.gbs_containers where id = p_container_id;
  if not found then raise exception 'GBS_CONTAINER_NOT_FOUND'; end if;
  if exists(select 1 from public.gbs_container_updates u0
             where u0.container_id = c.id and u0.requested_by = u and u0.state = 'pending') then
    raise exception 'GBS_UPDATE_ALREADY_PENDING';
  end if;
  insert into public.gbs_container_updates(container_id, requested_by, proposed_status, photo_path, note)
  values(c.id, u, p_proposed_status, nullif(trim(coalesce(p_photo_path,'')),''), nullif(trim(coalesce(p_note,'')),''))
  returning gbs_container_updates.id into uid;
  status_ar := case p_proposed_status
    when 'ok' then 'سليمة' when 'damaged' then 'متضررة'
    when 'replace' then 'يجب استبدالها' else 'مفقودة' end;
  insert into public.notifications(user_id, title, body, type, link)
  select ur.user_id, 'طلب تحديث حاوية',
         format('%s · %s — الحالة المقترحة: %s', c.code, c.label, status_ar),
         'info', '/ops-room/gbs-containers'
  from public.user_roles ur
  where ur.role in ('ops_room','super_admin');
  return uid;
end$$;

-- ⑤ قائمة طلبات التحديث — غرفة العمليات (حسب الحالة، افتراضياً المعلقة)
create or replace function public.gbs_updates_list(p_state text default 'pending')
returns table(id uuid, container_id uuid, code text, label text, proposed_status text,
              photo_path text, note text, state text, requested_by uuid, requester_name text,
              created_at timestamptz, reviewed_at timestamptz, review_note text)
language plpgsql stable security definer set search_path=public,app as $$
begin
  if not app.has_role(array['ops_room','super_admin']) then
    raise exception 'GBS_FORBIDDEN';
  end if;
  if coalesce(p_state,'pending') not in ('pending','approved','rejected') then
    raise exception 'GBS_STATE_INVALID';
  end if;
  return query
  select u0.id, u0.container_id, c.code, c.label, u0.proposed_status, u0.photo_path, u0.note,
         u0.state, u0.requested_by,
         coalesce(nullif(e.full_name,''), au.email, u0.requested_by::text),
         u0.created_at, u0.reviewed_at, u0.review_note
  from public.gbs_container_updates u0
  join public.gbs_containers c on c.id = u0.container_id
  left join public.employees e on e.user_id = u0.requested_by
  left join auth.users au on au.id = u0.requested_by
  where u0.state = coalesce(p_state,'pending')
  order by u0.created_at desc;
end$$;

-- ⑥ طلبات مسؤول القسم نفسه (سجل المتابعة)
create or replace function public.gbs_my_update_requests()
returns table(id uuid, container_id uuid, code text, label text, proposed_status text,
              photo_path text, note text, state text, created_at timestamptz,
              reviewed_at timestamptz, review_note text)
language plpgsql stable security definer set search_path=public,app as $$
declare u uuid := auth.uid();
begin
  if u is null or not app.has_role(array['department_manager']) then
    raise exception 'GBS_MANAGER_FORBIDDEN';
  end if;
  return query
  select u0.id, u0.container_id, c.code, c.label, u0.proposed_status, u0.photo_path, u0.note,
         u0.state, u0.created_at, u0.reviewed_at, u0.review_note
  from public.gbs_container_updates u0
  join public.gbs_containers c on c.id = u0.container_id
  where u0.requested_by = u
  order by u0.created_at desc;
end$$;

-- ⑦ اعتماد/رفض طلب التحديث — غرفة العمليات فقط؛ الاعتماد يطبق الحالة فوراً ويبلغ الطالب
create or replace function public.gbs_update_review(p_update_id uuid, p_approve boolean, p_review_note text default null)
returns table(container_id uuid, code text, new_status text)
language plpgsql security definer set search_path=public,app as $$
declare u uuid := auth.uid(); r public.gbs_container_updates; c public.gbs_containers; status_ar text;
begin
  if u is null or not app.has_role(array['ops_room','super_admin']) then
    raise exception 'GBS_FORBIDDEN';
  end if;
  if length(trim(coalesce(p_review_note,''))) > 500 then
    raise exception 'GBS_NOTES_INVALID';
  end if;
  select * into r from public.gbs_container_updates where id = p_update_id for update;
  if not found or r.state <> 'pending' then
    raise exception 'GBS_UPDATE_NOT_PENDING';
  end if;
  select * into c from public.gbs_containers where id = r.container_id;
  if not found then raise exception 'GBS_CONTAINER_NOT_FOUND'; end if;
  if p_approve then
    update public.gbs_containers
       set status = r.proposed_status, updated_at = now()
     where id = c.id returning * into c;
  end if;
  update public.gbs_container_updates
     set state = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = u, reviewed_at = now(),
         review_note = nullif(trim(coalesce(p_review_note,'')),'')
   where id = r.id;
  status_ar := case r.proposed_status
    when 'ok' then 'سليمة' when 'damaged' then 'متضررة'
    when 'replace' then 'يجب استبدالها' else 'مفقودة' end;
  insert into public.notifications(user_id, title, body, type, link, dedupe_key)
  values(r.requested_by,
         case when p_approve then 'تم اعتماد تحديث الحاوية' else 'تم رفض تحديث الحاوية' end,
         format('%s · %s — الحالة المقترحة: %s%s', c.code, c.label, status_ar,
                case when nullif(trim(coalesce(p_review_note,'')),'') is not null
                     then ' · ملاحظة: ' || trim(p_review_note) else '' end),
         case when p_approve then 'success' else 'warning' end,
         '/manager/gbs-containers',
         'gbs:review:' || r.id::text)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  return query select c.id, c.code, c.status;
end$$;

revoke all on function
  public.gbs_containers_list(text, text),
  public.gbs_container_save(uuid, text, float8, float8, text, text, text),
  public.gbs_container_delete(uuid),
  public.gbs_container_request_update(uuid, text, text, text),
  public.gbs_updates_list(text),
  public.gbs_my_update_requests(),
  public.gbs_update_review(uuid, boolean, text)
from public, anon;
grant execute on function
  public.gbs_containers_list(text, text),
  public.gbs_container_save(uuid, text, float8, float8, text, text, text),
  public.gbs_container_delete(uuid),
  public.gbs_container_request_update(uuid, text, text, text),
  public.gbs_updates_list(text),
  public.gbs_my_update_requests(),
  public.gbs_update_review(uuid, boolean, text)
to authenticated;
