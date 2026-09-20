-- 00134 · تعيين مسؤول الانطلاقة: تلقائي حتمي لا يُعطّل أبداً + اختيار يدوي مُتحقق منه في الخادم.
-- الجذر التاريخي للأخطاء المتكررة: رفع استثناء AMBIGUOUS عند تداخل ملفين كان يمنع الانطلاق كلياً،
-- والمعاينة في الواجهة كانت تختلف عن منطق الخادم. العقد الجديد:
--   ① الترتيب الحتمي (الأكثر تحديداً يفوز): تغطية مباشرة للمنطقة ←_then_ مطابقة الشفت ←_then_
--      أقل الملفات sectors (الأكثر تخصصاً) ←_then_ الأقدم إنشاءً ←_then_ user_id. لا استثناء غموض أبداً.
--   ② غياب التغطية المباشرة: ارتداد لأي مدير ضمن القاطع الأب (قطاع شقيق) بالترتيب نفسه.
--   ③ يدوي: يقبل الخادم p_manager_id فقط إذا كان المؤهل مطابقاً (دور department_manager وتغطية
--      مباشرة أو ضمن القاطع الأب) وإلا GARAGE_RECIPIENT_NOT_ELIGIBLE — التحكم بلا كسر للاتساق.
--   ④ garage_departures.assignment_mode يوثق نمط الإسناد (auto/manual) للتدقيق.

alter table public.garage_departures
  add column if not exists assignment_mode text not null default 'auto'
  check (assignment_mode in ('auto', 'manual'));

-- ① + ② الدالة الحتمية: صف واحد دائماً (أو لا صفوف إذا لا يوجد أي مؤهل ضمن القاطع)
create or replace function app.resolve_sector_shift_manager(p_sector_id smallint, p_shift text)
returns table(user_id uuid, manager_name text)
language plpgsql stable security definer set search_path=public,app as $$
begin
  return query
  select mp.user_id, coalesce(nullif(e.full_name, ''), au.email, mp.user_id::text)
  from public.manager_profiles mp
  join auth.users au on au.id = mp.user_id
  left join public.employees e on e.user_id = mp.user_id
  where exists (select 1 from public.user_roles ur where ur.user_id = mp.user_id and ur.role = 'department_manager')
    and (p_sector_id = any(mp.sectors)
         or exists (select 1 from public.sectors sx
                     where sx.id = any(mp.sectors)
                       and sx.parent_sector = (select s.parent_sector from public.sectors s where s.id = p_sector_id)))
  order by (p_sector_id = any(mp.sectors)) desc,
           (mp.shift = p_shift) desc,
           cardinality(mp.sectors) asc,
           mp.created_at,
           mp.user_id
  limit 1;
end$$;
revoke all on function app.resolve_sector_shift_manager(smallint, text) from public, anon, authenticated;

-- قائمة المرشحين المرتبين (للمعاينة وللقائمة اليدوية): الأول هو الالتقاط التلقائي
drop function if exists public.garage_shift_dispatch_recipients(uuid, text);
drop function if exists public.garage_shift_dispatch_recipients(uuid);
create function public.garage_shift_dispatch_recipients(p_vehicle_id uuid, p_shift text)
returns table(user_id uuid, manager_name text, shift text, sectors smallint[], resolution text, pick_rank bigint)
language plpgsql stable security definer set search_path=public,app as $$
declare sid smallint;
begin
  perform app.require_garage_actor();
  if not app.garage_vehicle_allowed(p_vehicle_id) then raise exception 'GARAGE_VEHICLE_SCOPE_FORBIDDEN'; end if;
  select a.sector_id into sid
  from public.garage_vehicle_shift_assignments a
  where a.vehicle_id = p_vehicle_id and a.shift = p_shift and a.ends_at is null;
  if sid is null then return; end if;
  return query
  select mp.user_id,
         coalesce(nullif(e.full_name, ''), u.email, mp.user_id::text),
         mp.shift, mp.sectors,
         case when sid = any(mp.sectors) then 'direct' else 'parent_fallback' end,
         row_number() over (
           order by (sid = any(mp.sectors)) desc,
                    (mp.shift = p_shift) desc,
                    cardinality(mp.sectors) asc,
                    mp.created_at, mp.user_id)
  from public.manager_profiles mp
  left join public.employees e on e.user_id = mp.user_id
  left join auth.users u on u.id = mp.user_id
  where exists (select 1 from public.user_roles ur where ur.user_id = mp.user_id and ur.role = 'department_manager')
    and (sid = any(mp.sectors)
         or exists (select 1 from public.sectors sx
                     where sx.id = any(mp.sectors)
                       and sx.parent_sector = (select s.parent_sector from public.sectors s where s.id = sid)));
end$$;
revoke all on function public.garage_shift_dispatch_recipients(uuid, text) from public, anon;
grant execute on function public.garage_shift_dispatch_recipients(uuid, text) to authenticated;

-- ③ التسجيل: تلقائي أو يدوي مُتحقق منه
drop function if exists public.garage_record_shift_departure(uuid, text, text);
drop function if exists public.garage_record_shift_departure(uuid, text, text, uuid);
create function public.garage_record_shift_departure(p_vehicle_id uuid, p_shift text, p_notes text default null, p_manager_id uuid default null)
returns public.garage_departures
language plpgsql security definer set search_path=public,app as $$
declare
  actor_id uuid := app.require_garage_actor();
  vehicle_row public.garage_vehicles;
  assignment_row public.garage_vehicle_shift_assignments;
  departure_row public.garage_departures;
  picked_id uuid;
  picked_label text;
  mode text;
begin
  if p_shift not in ('morning', 'evening', 'night') then raise exception 'GARAGE_SHIFT_INVALID'; end if;
  if length(coalesce(p_notes, '')) > 500 then raise exception 'GARAGE_DEPARTURE_NOTES_TOO_LONG'; end if;
  select * into vehicle_row from public.garage_vehicles where id = p_vehicle_id and archived_at is null for update;
  if not found then raise exception 'GARAGE_VEHICLE_NOT_FOUND'; end if;
  if not app.garage_vehicle_allowed(p_vehicle_id) then raise exception 'GARAGE_VEHICLE_SCOPE_FORBIDDEN'; end if;
  if exists (select 1 from public.vehicle_maintenance_cases mc where mc.vehicle_id = vehicle_row.id and mc.completed_at is null) then raise exception 'GARAGE_VEHICLE_IN_MAINTENANCE'; end if;
  if exists (select 1 from public.garage_departures gd where gd.vehicle_id = vehicle_row.id and gd.returned_at is null) then raise exception 'GARAGE_DEPARTURE_ALREADY_OPEN'; end if;
  select * into assignment_row from public.garage_vehicle_shift_assignments a
   where a.vehicle_id = vehicle_row.id and a.shift = p_shift and a.ends_at is null;
  if not found then raise exception 'GARAGE_SHIFT_ASSIGNMENT_NOT_FOUND'; end if;

  if p_manager_id is not null then
    -- يدوي: المؤهل فقط (دور + تغطية مباشرة أو ضمن القاطع الأب)
    if exists (
      select 1 from public.manager_profiles mp
      where mp.user_id = p_manager_id
        and exists (select 1 from public.user_roles ur where ur.user_id = mp.user_id and ur.role = 'department_manager')
        and (assignment_row.sector_id = any(mp.sectors)
             or exists (select 1 from public.sectors sx
                         where sx.id = any(mp.sectors)
                           and sx.parent_sector = (select s.parent_sector from public.sectors s where s.id = assignment_row.sector_id)))
    ) then
      picked_id := p_manager_id;
      mode := 'manual';
    else
      raise exception 'GARAGE_RECIPIENT_NOT_ELIGIBLE';
    end if;
  else
    -- تلقائي حتمي
    select r.user_id into picked_id
    from app.resolve_sector_shift_manager(assignment_row.sector_id, p_shift) r;
    if picked_id is null then raise exception 'GARAGE_SECTOR_MANAGER_NOT_CONFIGURED'; end if;
    mode := 'auto';
  end if;

  select coalesce(nullif(e.full_name, ''), au.email, picked_id::text) into picked_label
  from auth.users au left join public.employees e on e.user_id = au.id
  where au.id = picked_id;

  insert into public.garage_departures(vehicle_id, driver_name, shift, sector_id, departed_by, notes,
                                       recipient_manager_id, recipient_manager_name, assignment_mode)
  values (vehicle_row.id, assignment_row.driver_name, p_shift, assignment_row.sector_id, actor_id,
          nullif(btrim(coalesce(p_notes, '')), ''), picked_id, picked_label, mode)
  returning * into departure_row;

  insert into public.notifications(user_id, title, body, type, link, category, entity_type, entity_id, dedupe_key)
  values (picked_id, 'آلية في الطريق إلى موقع العمل',
          format('%s · DB %s انطلقت إلى منطقتك في الشفت %s', vehicle_row.vehicle_name, vehicle_row.db_number, p_shift),
          'info', '/manager/vehicle-trips', 'departure', 'garage_departure', departure_row.id,
          'departure:auto-manager:' || departure_row.id::text)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  return departure_row;
exception when unique_violation then raise exception 'GARAGE_DEPARTURE_ALREADY_OPEN';
end$$;

revoke all on function public.garage_record_shift_departure(uuid, text, text, uuid) from public, anon;
grant execute on function public.garage_record_shift_departure(uuid, text, text, uuid) to authenticated;
