-- ═══════════════════════════════════════════════════════════════
-- 00075 · الكراج المركزي — سجل انطلاق السائقين من الكراج إلى ورديتهم
-- كل انطلاقة = خروج آلية وسائقها من الكراج إلى موقع الوردية،
-- وتُغلق بالعودة. كل الكتابات عبر RPC؛ قراءة فقط للأدوار المخوّلة.
-- ═══════════════════════════════════════════════════════════════

create table public.garage_departures (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.garage_vehicles(id),
  driver_name text not null check (length(trim(driver_name)) between 2 and 120),
  shift text not null check (shift in ('morning','evening','night')),
  sector_id smallint not null references public.sectors(id),
  departed_at timestamptz not null default now(),
  departed_by uuid not null references auth.users(id),
  returned_at timestamptz,
  returned_by uuid references auth.users(id),
  notes text,
  check (returned_at is null or returned_at >= departed_at)
);
-- انطلاقة مفتوحة واحدة فقط لكل آلية (لا خروج ثانٍ قبل تسجيل العودة)
create unique index uq_garage_open_departure on public.garage_departures(vehicle_id)
  where returned_at is null;
create index idx_garage_departures_day on public.garage_departures
  (timezone('Asia/Baghdad',departed_at)::date, departed_at desc);
create index idx_garage_departures_vehicle on public.garage_departures(vehicle_id,departed_at desc);
create trigger trg_audit_garage_departures after insert or update or delete on public.garage_departures
  for each row execute function app.audit_trigger();

alter table public.garage_departures enable row level security;
create policy "garage departures read" on public.garage_departures for select to authenticated
  using (app.has_role(array['central_garage_officer','super_admin']));

-- ═══ تسجيل انطلاق: خروج السائق من الكراج إلى ورديته ═══
create or replace function public.garage_record_departure(
  p_vehicle_id uuid, p_notes text default null
) returns public.garage_departures
language plpgsql stable security definer set search_path=public,app as $$
declare
  v_uid uuid:=app.require_garage_actor();
  v_vehicle public.garage_vehicles;
  v_assignment public.garage_driver_assignments;
  v_departure public.garage_departures;
begin
  select * into v_vehicle from public.garage_vehicles where id=p_vehicle_id and archived_at is null;
  if not found then raise exception 'GARAGE_VEHICLE_NOT_FOUND'; end if;
  select * into v_assignment from public.garage_driver_assignments
    where vehicle_id=p_vehicle_id and ends_at is null;
  if not found then raise exception 'GARAGE_NO_ACTIVE_ASSIGNMENT'; end if;
  if exists (select 1 from public.garage_departures where vehicle_id=p_vehicle_id and returned_at is null) then
    raise exception 'GARAGE_DEPARTURE_ALREADY_OPEN';
  end if;
  insert into public.garage_departures(vehicle_id,driver_name,shift,sector_id,departed_by,notes)
    values(p_vehicle_id,v_assignment.driver_name,v_assignment.shift,v_assignment.sector_id,v_uid,
      nullif(trim(coalesce(p_notes,'')),''))
    returning * into v_departure;
  return v_departure;
end$$;

-- ═══ تسجيل عودة: إغلاق الانطلاقة المفتوحة عند عودة الآلية إلى الكراج ═══
create or replace function public.garage_record_return(p_departure_id uuid)
returns public.garage_departures
language plpgsql stable security definer set search_path=public,app as $$
declare
  v_uid uuid:=app.require_garage_actor();
  v_departure public.garage_departures;
begin
  update public.garage_departures set returned_at=now(),returned_by=v_uid
    where id=p_departure_id and returned_at is null
    returning * into v_departure;
  if not found then raise exception 'GARAGE_OPEN_DEPARTURE_NOT_FOUND'; end if;
  return v_departure;
end$$;

-- ═══ انطلاقات اليوم (توقيت بغداد) مع بيانات الآلية والمنطقة ═══
create or replace function public.garage_today_departures()
returns table(
  id uuid,vehicle_id uuid,driver_name text,shift text,sector_id smallint,
  departed_at timestamptz,returned_at timestamptz,notes text,
  vehicle_name text,db_number text,image_path text,area_name text,parent_sector text
)
language sql stable security definer set search_path=public,app as $$
  select d.id,d.vehicle_id,d.driver_name,d.shift,d.sector_id,d.departed_at,d.returned_at,d.notes,
    v.vehicle_name,v.db_number,v.image_path,s.name,s.parent_sector
  from public.garage_departures d
  join public.garage_vehicles v on v.id=d.vehicle_id
  join public.sectors s on s.id=d.sector_id
  where timezone('Asia/Baghdad',d.departed_at)::date = timezone('Asia/Baghdad',now())::date
  order by d.departed_at desc;
$$;

revoke all on function public.garage_record_departure(uuid,text),
  public.garage_record_return(uuid),public.garage_today_departures()
from public,anon;
grant execute on function public.garage_record_departure(uuid,text),
  public.garage_record_return(uuid),public.garage_today_departures()
to authenticated;

