-- 00138 · GBS: اختصاص مسؤول القسم — يرى ويحدّث حاويات مناطقه المسندة إليه فقط.
-- العقد:
--   · الاختصاص = manager_profiles.sectors (1-3 مناطق) — نفس الإسناد المعتمد في بقية الوحدات (00044).
--   · gbs_containers_list: مسؤول القسم يرى حاويات مناطقه فقط (تقاطع مع أي فلتر يختاره)؛
--     غرفة العمليات/المدير الخارق يرون الكل بلا تقييد.
--   · gbs_container_request_update: الحاوية خارج اختصاص المسؤول → GBS_OUT_OF_SECTOR.
--   · مسؤول بلا مناطق مسندة → لا يرى حاويات ولا يستطيع طلب أي تحديث.

-- ① مناطق اختصاص مستخدم (مصفوفة فارغة لغير المسندين)
create or replace function app.gbs_manager_sectors(p_user uuid default auth.uid())
returns smallint[]
language sql stable security definer set search_path=public,app as $$
  select coalesce(
    (select mp.sectors from public.manager_profiles mp where mp.user_id = p_user),
    '{}'::smallint[]
  )
$$;

revoke all on function app.gbs_manager_sectors(uuid) from public, anon;
grant execute on function app.gbs_manager_sectors(uuid) to authenticated;

-- ② القائمة: عزل تلقائي حسب الاختصاص لمسؤول القسم
create or replace function public.gbs_containers_list(p_search text default null, p_status text default null,
                                           p_parent text default null, p_sector_id smallint default null)
returns table(id uuid, code text, label text, latitude float8, longitude float8,
              status text, image_path text, notes text, updated_at timestamptz, pending_count bigint,
              sector_id smallint, area_name text, parent_sector text)
language plpgsql stable security definer set search_path=public,app as $$
declare jur smallint[];
begin
  if not app.has_role(array['ops_room','department_manager','super_admin']) then
    raise exception 'GBS_FORBIDDEN';
  end if;
  if p_status is not null and p_status not in ('ok','damaged','replace','missing') then
    raise exception 'GBS_STATUS_INVALID';
  end if;
  if p_parent is not null and p_parent not in ('karrada','zaafaraniya') then
    raise exception 'GBS_PARENT_INVALID';
  end if;
  -- مسؤول القسم (بدون دور عمليات) يُحصر بمناطقه المسندة إليه
  if not app.has_role(array['ops_room','super_admin']) then
    jur := app.gbs_manager_sectors(auth.uid());
  end if;
  return query
  select c.id, c.code, c.label, c.latitude, c.longitude, c.status, c.image_path, c.notes, c.updated_at,
         (select count(*) from public.gbs_container_updates u
           where u.container_id = c.id and u.state = 'pending'),
         c.sector_id, s.name, s.parent_sector
  from public.gbs_containers c
  join public.sectors s on s.id = c.sector_id
  where (jur is null or c.sector_id = any(jur))
    and (p_status is null or c.status = p_status)
    and (p_parent is null or s.parent_sector = p_parent)
    and (p_sector_id is null or c.sector_id = p_sector_id)
    and (nullif(trim(coalesce(p_search,'')),'') is null
         or c.code ilike '%' || trim(p_search) || '%'
         or c.label ilike '%' || trim(p_search) || '%'
         or s.name ilike '%' || trim(p_search) || '%'
         or coalesce(c.notes,'') ilike '%' || trim(p_search) || '%')
  order by c.code;
end$$;

-- ③ طلب التحديث: تحقق أن الحاوية داخل اختصاص المسؤول
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
  if not (c.sector_id = any(app.gbs_manager_sectors(u))) then
    raise exception 'GBS_OUT_OF_SECTOR';
  end if;
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

revoke all on function
  public.gbs_containers_list(text, text, text, smallint),
  public.gbs_container_request_update(uuid, text, text, text)
from public, anon;
grant execute on function
  public.gbs_containers_list(text, text, text, smallint),
  public.gbs_container_request_update(uuid, text, text, text)
to authenticated;
