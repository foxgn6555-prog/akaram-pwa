-- 00114 · مسؤول المنطقة مستقل عن شفت السائق + إصلاح اكتشاف الحسابات القائمة.
-- الشفت يخص توزيع السائقين، أما مسؤول القاطع فيستلم كل آليات مناطقه.

create or replace function app.resolve_sector_shift_manager(p_sector_id smallint,p_shift text)
returns table(user_id uuid,manager_name text)
language plpgsql stable security definer set search_path=public,app as $$
declare matched_count integer;
begin
  select count(*) into matched_count
  from public.manager_profiles mp
  where p_sector_id=any(mp.sectors)
    and exists(select 1 from public.user_roles ur where ur.user_id=mp.user_id and ur.role='department_manager');
  if matched_count=0 then raise exception 'GARAGE_SECTOR_MANAGER_NOT_CONFIGURED';end if;
  if matched_count>1 then raise exception 'GARAGE_SECTOR_MANAGER_AMBIGUOUS';end if;
  return query
  select mp.user_id,coalesce(nullif(e.full_name,''),au.email,mp.user_id::text)
  from public.manager_profiles mp
  join auth.users au on au.id=mp.user_id
  left join public.employees e on e.user_id=mp.user_id
  where p_sector_id=any(mp.sectors)
    and exists(select 1 from public.user_roles ur where ur.user_id=mp.user_id and ur.role='department_manager');
end$$;

create or replace function public.garage_shift_dispatch_recipients(p_vehicle_id uuid,p_shift text)
returns table(user_id uuid,manager_name text,shift text,sectors smallint[])
language plpgsql stable security definer set search_path=public,app as $$
declare assigned_sector smallint;
begin
  perform app.require_garage_actor();
  select a.sector_id into assigned_sector from public.garage_vehicle_shift_assignments a where a.vehicle_id=p_vehicle_id and a.shift=p_shift and a.ends_at is null;
  if assigned_sector is null then return;end if;
  return query
  select mp.user_id,coalesce(nullif(e.full_name,''),u.email,mp.user_id::text),mp.shift,mp.sectors
  from public.manager_profiles mp
  left join public.employees e on e.user_id=mp.user_id
  left join auth.users u on u.id=mp.user_id
  where assigned_sector=any(mp.sectors)
    and exists(select 1 from public.user_roles ur where ur.user_id=mp.user_id and ur.role='department_manager')
  order by 2;
end$$;

create or replace function public.garage_dispatch_recipients(p_vehicle_id uuid)
returns table(user_id uuid,manager_name text,shift text,sectors smallint[])
language plpgsql stable security definer set search_path=public,app as $$
declare vehicle_sector smallint;
begin
  perform app.require_garage_actor();
  select v.sector_id into vehicle_sector from public.garage_vehicles v where v.id=p_vehicle_id and v.archived_at is null;
  if vehicle_sector is null then raise exception 'GARAGE_VEHICLE_NOT_FOUND';end if;
  return query
  select mp.user_id,coalesce(nullif(e.full_name,''),u.email,mp.user_id::text),mp.shift,mp.sectors
  from public.manager_profiles mp
  left join public.employees e on e.user_id=mp.user_id
  left join auth.users u on u.id=mp.user_id
  where vehicle_sector=any(mp.sectors)
    and exists(select 1 from public.user_roles ur where ur.user_id=mp.user_id and ur.role='department_manager')
  order by 2;
end$$;

revoke all on function public.garage_shift_dispatch_recipients(uuid,text),public.garage_dispatch_recipients(uuid) from public,anon;
grant execute on function public.garage_shift_dispatch_recipients(uuid,text),public.garage_dispatch_recipients(uuid) to authenticated;
