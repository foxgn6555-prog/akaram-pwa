-- ═══════════════════════════════════════════════════════════════
-- 00074 · الكراج المركزي — الآليات والانطلاقية والخزانات وحركات المخزون
-- كل الوقت يُولده الخادم (timestamptz/now). اليوم التشغيلي يُحسب بتوقيت بغداد.
-- كل الكتابات الحساسة عبر RPC؛ لا توجد سياسات INSERT/UPDATE مباشرة للجداول.
-- ═══════════════════════════════════════════════════════════════

create table public.garage_vehicles (
  id uuid primary key default gen_random_uuid(),
  vehicle_name text not null check (length(trim(vehicle_name)) between 2 and 120),
  db_number text not null check (length(trim(db_number)) between 1 and 50),
  plate_number text not null check (length(trim(plate_number)) between 1 and 50),
  chassis_number text not null check (length(trim(chassis_number)) between 3 and 100),
  image_path text not null check (length(trim(image_path)) > 4),
  shift text not null check (shift in ('morning','evening','night')),
  driver_name text not null check (length(trim(driver_name)) between 2 and 120),
  sector_id smallint not null references public.sectors(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id),
  archive_reason text
);
create unique index uq_garage_vehicle_db on public.garage_vehicles(lower(trim(db_number)));
create unique index uq_garage_vehicle_plate on public.garage_vehicles(lower(trim(plate_number)));
create unique index uq_garage_vehicle_chassis on public.garage_vehicles(lower(trim(chassis_number)));
create index idx_garage_vehicle_filters on public.garage_vehicles(sector_id,shift,archived_at);
create index idx_garage_vehicle_driver on public.garage_vehicles(lower(driver_name));
create trigger trg_garage_vehicles_updated before update on public.garage_vehicles
  for each row execute function app.set_updated_at();

create table public.garage_driver_assignments (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.garage_vehicles(id),
  driver_name text not null check (length(trim(driver_name)) between 2 and 120),
  shift text not null check (shift in ('morning','evening','night')),
  sector_id smallint not null references public.sectors(id),
  assigned_by uuid not null references auth.users(id),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  change_reason text,
  check (ends_at is null or ends_at >= starts_at)
);
create unique index uq_garage_current_assignment on public.garage_driver_assignments(vehicle_id)
  where ends_at is null;
create index idx_garage_assignments_history on public.garage_driver_assignments(vehicle_id,starts_at desc);
create index idx_garage_assignments_driver on public.garage_driver_assignments(lower(driver_name),ends_at);

create table public.garage_tanks (
  id uuid primary key default gen_random_uuid(),
  fuel_type text not null check (fuel_type in ('gas_oil','hydraulic','grease','c_oil')),
  tank_name text not null check (length(trim(tank_name)) between 2 and 100),
  capacity numeric(14,3) not null check (capacity > 0),
  current_quantity numeric(14,3) not null default 0 check (current_quantity >= 0 and current_quantity <= capacity),
  low_stock_threshold numeric(5,2) not null default 20 check (low_stock_threshold between 0 and 100),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id),
  archive_reason text
);
create unique index uq_garage_tank_name_type on public.garage_tanks(fuel_type,lower(trim(tank_name)));
create index idx_garage_tanks_active on public.garage_tanks(fuel_type,archived_at);
create trigger trg_garage_tanks_updated before update on public.garage_tanks
  for each row execute function app.set_updated_at();

create table public.garage_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  tank_id uuid not null references public.garage_tanks(id),
  vehicle_id uuid references public.garage_vehicles(id),
  movement_type text not null check (movement_type in ('stock_in','vehicle_fill','approved_reset')),
  quantity numeric(14,3) not null check (quantity <> 0),
  quantity_before numeric(14,3) not null check (quantity_before >= 0),
  quantity_after numeric(14,3) not null check (quantity_after >= 0),
  next_refill_date date,
  notes text,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (
    (movement_type = 'stock_in' and quantity > 0 and vehicle_id is null and next_refill_date is null)
    or (movement_type = 'vehicle_fill' and quantity < 0 and vehicle_id is not null and next_refill_date is not null)
    or (movement_type = 'approved_reset' and quantity <= 0 and vehicle_id is null and next_refill_date is null)
  ),
  check (quantity_after = quantity_before + quantity)
);
create index idx_garage_movements_tank_time on public.garage_inventory_movements(tank_id,created_at desc);
create index idx_garage_movements_vehicle_time on public.garage_inventory_movements(vehicle_id,created_at desc)
  where vehicle_id is not null;
create index idx_garage_movements_next_refill on public.garage_inventory_movements(next_refill_date)
  where movement_type = 'vehicle_fill';

create table public.garage_tank_zero_requests (
  id uuid primary key default gen_random_uuid(),
  tank_id uuid not null references public.garage_tanks(id),
  requested_quantity numeric(14,3) not null check (requested_quantity >= 0),
  reason text not null check (length(trim(reason)) >= 5),
  status text not null default 'pending' check (status in ('pending','rejected','executed')),
  requested_by uuid not null references auth.users(id),
  requested_at timestamptz not null default now(),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_note text
);
create unique index uq_garage_pending_tank_reset on public.garage_tank_zero_requests(tank_id)
  where status = 'pending';
create index idx_garage_zero_requests_status on public.garage_tank_zero_requests(status,requested_at desc);

create trigger trg_audit_garage_vehicles after insert or update or delete on public.garage_vehicles
  for each row execute function app.audit_trigger();
create trigger trg_audit_garage_driver_assignments after insert or update or delete on public.garage_driver_assignments
  for each row execute function app.audit_trigger();
create trigger trg_audit_garage_tanks after insert or update or delete on public.garage_tanks
  for each row execute function app.audit_trigger();
create trigger trg_audit_garage_inventory_movements after insert or update or delete on public.garage_inventory_movements
  for each row execute function app.audit_trigger();
create trigger trg_audit_garage_tank_zero_requests after insert or update or delete on public.garage_tank_zero_requests
  for each row execute function app.audit_trigger();

alter table public.garage_vehicles enable row level security;
alter table public.garage_driver_assignments enable row level security;
alter table public.garage_tanks enable row level security;
alter table public.garage_inventory_movements enable row level security;
alter table public.garage_tank_zero_requests enable row level security;

create policy "garage vehicles read" on public.garage_vehicles for select to authenticated
  using (app.has_role(array['central_garage_officer','super_admin']));
create policy "garage assignments read" on public.garage_driver_assignments for select to authenticated
  using (app.has_role(array['central_garage_officer','super_admin']));
create policy "garage tanks read" on public.garage_tanks for select to authenticated
  using (app.has_role(array['central_garage_officer','it_admin','super_admin']));
create policy "garage movements read" on public.garage_inventory_movements for select to authenticated
  using (app.has_role(array['central_garage_officer','it_admin','super_admin']));
create policy "garage zero requests read" on public.garage_tank_zero_requests for select to authenticated
  using (app.has_role(array['central_garage_officer','it_admin','super_admin']));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('garage-vehicles','garage-vehicles',false,15728640,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;
create policy "garage vehicle images read" on storage.objects for select to authenticated
  using (bucket_id='garage-vehicles' and app.has_role(array['central_garage_officer','super_admin']));
create policy "garage vehicle images upload" on storage.objects for insert to authenticated
  with check (bucket_id='garage-vehicles'
    and app.has_role(array['central_garage_officer','super_admin'])
    and auth.uid()::text=(storage.foldername(name))[1]);

create or replace function app.require_garage_actor()
returns uuid language plpgsql stable security definer set search_path=public,app as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'GARAGE_UNAUTHENTICATED'; end if;
  if not app.has_role(array['central_garage_officer','super_admin']) then
    raise exception 'GARAGE_FORBIDDEN';
  end if;
  return v_uid;
end$$;
revoke all on function app.require_garage_actor() from public,anon,authenticated;

create or replace function public.garage_add_vehicle(
  p_vehicle_name text,p_db_number text,p_plate_number text,p_chassis_number text,
  p_image_path text,p_shift text,p_driver_name text,p_sector_id smallint
) returns public.garage_vehicles language plpgsql security definer set search_path=public,app as $$
declare v_uid uuid:=app.require_garage_actor();v_row public.garage_vehicles;
begin
  if p_shift not in ('morning','evening','night') then raise exception 'GARAGE_SHIFT_INVALID'; end if;
  if not exists(select 1 from public.sectors where id=p_sector_id) then raise exception 'GARAGE_AREA_INVALID'; end if;
  if length(trim(coalesce(p_vehicle_name,'')))<2 then raise exception 'GARAGE_VEHICLE_NAME_REQUIRED'; end if;
  if length(trim(coalesce(p_db_number,'')))<1 then raise exception 'GARAGE_DB_NUMBER_REQUIRED'; end if;
  if length(trim(coalesce(p_plate_number,'')))<1 then raise exception 'GARAGE_PLATE_REQUIRED'; end if;
  if length(trim(coalesce(p_chassis_number,'')))<3 then raise exception 'GARAGE_CHASSIS_REQUIRED'; end if;
  if length(trim(coalesce(p_driver_name,'')))<2 then raise exception 'GARAGE_DRIVER_REQUIRED'; end if;
  if p_image_path is null or p_image_path not like v_uid::text||'/%' then raise exception 'GARAGE_IMAGE_PATH_INVALID'; end if;
  insert into public.garage_vehicles(vehicle_name,db_number,plate_number,chassis_number,image_path,shift,driver_name,sector_id,created_by)
  values(trim(p_vehicle_name),trim(p_db_number),trim(p_plate_number),trim(p_chassis_number),trim(p_image_path),p_shift,trim(p_driver_name),p_sector_id,v_uid)
  returning * into v_row;
  insert into public.garage_driver_assignments(vehicle_id,driver_name,shift,sector_id,assigned_by,change_reason)
  values(v_row.id,v_row.driver_name,v_row.shift,v_row.sector_id,v_uid,'الإسناد الأول عند إضافة الآلية');
  return v_row;
exception when unique_violation then raise exception 'GARAGE_VEHICLE_IDENTIFIER_DUPLICATE';
end$$;

create or replace function public.garage_update_vehicle(
  p_vehicle_id uuid,p_vehicle_name text,p_db_number text,p_plate_number text,
  p_chassis_number text,p_image_path text default null
) returns public.garage_vehicles language plpgsql security definer set search_path=public,app as $$
declare v_uid uuid:=app.require_garage_actor();v_row public.garage_vehicles;
begin
  if length(trim(coalesce(p_vehicle_name,'')))<2 or length(trim(coalesce(p_db_number,'')))<1
    or length(trim(coalesce(p_plate_number,'')))<1 or length(trim(coalesce(p_chassis_number,'')))<3
  then raise exception 'GARAGE_VEHICLE_FIELDS_REQUIRED'; end if;
  if p_image_path is not null and p_image_path not like v_uid::text||'/%' then raise exception 'GARAGE_IMAGE_PATH_INVALID'; end if;
  update public.garage_vehicles set vehicle_name=trim(p_vehicle_name),db_number=trim(p_db_number),
    plate_number=trim(p_plate_number),chassis_number=trim(p_chassis_number),
    image_path=coalesce(nullif(trim(coalesce(p_image_path,'')),''),image_path)
  where id=p_vehicle_id and archived_at is null returning * into v_row;
  if not found then raise exception 'GARAGE_VEHICLE_NOT_FOUND'; end if;
  return v_row;
exception when unique_violation then raise exception 'GARAGE_VEHICLE_IDENTIFIER_DUPLICATE';
end$$;

create or replace function public.garage_assign_driver(
  p_vehicle_id uuid,p_driver_name text,p_shift text,p_sector_id smallint,p_reason text default null
) returns public.garage_driver_assignments language plpgsql security definer set search_path=public,app as $$
declare v_uid uuid:=app.require_garage_actor();v_row public.garage_driver_assignments;
begin
  if length(trim(coalesce(p_driver_name,'')))<2 then raise exception 'GARAGE_DRIVER_REQUIRED'; end if;
  if p_shift not in ('morning','evening','night') then raise exception 'GARAGE_SHIFT_INVALID'; end if;
  if not exists(select 1 from public.sectors where id=p_sector_id) then raise exception 'GARAGE_AREA_INVALID'; end if;
  perform 1 from public.garage_vehicles where id=p_vehicle_id and archived_at is null for update;
  if not found then raise exception 'GARAGE_VEHICLE_NOT_FOUND'; end if;
  update public.garage_driver_assignments set ends_at=now(),change_reason=coalesce(nullif(trim(coalesce(p_reason,'')),''),change_reason)
    where vehicle_id=p_vehicle_id and ends_at is null;
  insert into public.garage_driver_assignments(vehicle_id,driver_name,shift,sector_id,assigned_by,change_reason)
    values(p_vehicle_id,trim(p_driver_name),p_shift,p_sector_id,v_uid,nullif(trim(coalesce(p_reason,'')),'')) returning * into v_row;
  update public.garage_vehicles set driver_name=v_row.driver_name,shift=v_row.shift,sector_id=v_row.sector_id where id=p_vehicle_id;
  return v_row;
end$$;

create or replace function public.garage_archive_vehicle(p_vehicle_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public,app as $$
declare v_uid uuid:=app.require_garage_actor();
begin
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'GARAGE_ARCHIVE_REASON_REQUIRED'; end if;
  update public.garage_vehicles set archived_at=now(),archived_by=v_uid,archive_reason=trim(p_reason)
    where id=p_vehicle_id and archived_at is null;
  if not found then raise exception 'GARAGE_VEHICLE_NOT_FOUND'; end if;
  update public.garage_driver_assignments set ends_at=now(),change_reason=coalesce(change_reason,'أرشفة الآلية')
    where vehicle_id=p_vehicle_id and ends_at is null;
end$$;

create or replace function public.garage_restore_vehicle(p_vehicle_id uuid,p_reason text)
returns public.garage_vehicles language plpgsql security definer set search_path=public,app as $$
declare v_uid uuid:=app.require_garage_actor();v_row public.garage_vehicles;
begin
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'GARAGE_RESTORE_REASON_REQUIRED'; end if;
  update public.garage_vehicles set archived_at=null,archived_by=null,archive_reason=null
    where id=p_vehicle_id and archived_at is not null returning * into v_row;
  if not found then raise exception 'GARAGE_ARCHIVED_VEHICLE_NOT_FOUND'; end if;
  insert into public.garage_driver_assignments(vehicle_id,driver_name,shift,sector_id,assigned_by,change_reason)
    values(v_row.id,v_row.driver_name,v_row.shift,v_row.sector_id,v_uid,'استعادة الآلية: '||trim(p_reason));
  return v_row;
end$$;

create or replace function public.garage_add_tank(
  p_fuel_type text,p_tank_name text,p_capacity numeric,p_initial_quantity numeric default 0,
  p_low_stock_threshold numeric default 20
) returns public.garage_tanks language plpgsql security definer set search_path=public,app as $$
declare v_uid uuid:=app.require_garage_actor();v_row public.garage_tanks;
begin
  if p_fuel_type not in ('gas_oil','hydraulic','grease','c_oil') then raise exception 'GARAGE_FUEL_TYPE_INVALID'; end if;
  if length(trim(coalesce(p_tank_name,'')))<2 then raise exception 'GARAGE_TANK_NAME_REQUIRED'; end if;
  if p_capacity is null or p_capacity<=0 then raise exception 'GARAGE_TANK_CAPACITY_INVALID'; end if;
  if coalesce(p_initial_quantity,0)<0 or coalesce(p_initial_quantity,0)>p_capacity then raise exception 'GARAGE_TANK_INITIAL_QUANTITY_INVALID'; end if;
  if p_low_stock_threshold is null or p_low_stock_threshold<0 or p_low_stock_threshold>100 then raise exception 'GARAGE_LOW_STOCK_THRESHOLD_INVALID'; end if;
  insert into public.garage_tanks(fuel_type,tank_name,capacity,current_quantity,low_stock_threshold,created_by)
    values(p_fuel_type,trim(p_tank_name),p_capacity,coalesce(p_initial_quantity,0),p_low_stock_threshold,v_uid)
    returning * into v_row;
  if v_row.current_quantity>0 then
    insert into public.garage_inventory_movements(tank_id,movement_type,quantity,quantity_before,quantity_after,notes,actor_id)
    values(v_row.id,'stock_in',v_row.current_quantity,0,v_row.current_quantity,'الكمية الابتدائية عند إنشاء الخزان',v_uid);
  end if;
  return v_row;
exception when unique_violation then raise exception 'GARAGE_TANK_DUPLICATE';
end$$;

create or replace function public.garage_add_tank_stock(p_tank_id uuid,p_quantity numeric,p_notes text default null)
returns public.garage_inventory_movements language plpgsql security definer set search_path=public,app as $$
declare v_uid uuid:=app.require_garage_actor();v_tank public.garage_tanks;v_row public.garage_inventory_movements;
begin
  if p_quantity is null or p_quantity<=0 then raise exception 'GARAGE_QUANTITY_INVALID'; end if;
  select * into v_tank from public.garage_tanks where id=p_tank_id and archived_at is null for update;
  if not found then raise exception 'GARAGE_TANK_NOT_FOUND'; end if;
  if v_tank.current_quantity+p_quantity>v_tank.capacity then raise exception 'GARAGE_TANK_CAPACITY_EXCEEDED'; end if;
  update public.garage_tanks set current_quantity=current_quantity+p_quantity where id=p_tank_id;
  insert into public.garage_inventory_movements(tank_id,movement_type,quantity,quantity_before,quantity_after,notes,actor_id)
    values(p_tank_id,'stock_in',p_quantity,v_tank.current_quantity,v_tank.current_quantity+p_quantity,nullif(trim(coalesce(p_notes,'')),''),v_uid)
    returning * into v_row;
  return v_row;
end$$;

create or replace function public.garage_fill_vehicle(
  p_tank_id uuid,p_vehicle_id uuid,p_quantity numeric,p_next_refill_date date,p_notes text default null
) returns public.garage_inventory_movements language plpgsql security definer set search_path=public,app as $$
declare v_uid uuid:=app.require_garage_actor();v_tank public.garage_tanks;v_row public.garage_inventory_movements;
begin
  if p_quantity is null or p_quantity<=0 then raise exception 'GARAGE_QUANTITY_INVALID'; end if;
  if p_next_refill_date is null or p_next_refill_date<timezone('Asia/Baghdad',now())::date then raise exception 'GARAGE_NEXT_REFILL_DATE_INVALID'; end if;
  if not exists(select 1 from public.garage_vehicles where id=p_vehicle_id and archived_at is null) then raise exception 'GARAGE_VEHICLE_NOT_FOUND'; end if;
  select * into v_tank from public.garage_tanks where id=p_tank_id and archived_at is null for update;
  if not found then raise exception 'GARAGE_TANK_NOT_FOUND'; end if;
  if v_tank.current_quantity<p_quantity then raise exception 'GARAGE_TANK_BALANCE_INSUFFICIENT'; end if;
  update public.garage_tanks set current_quantity=current_quantity-p_quantity where id=p_tank_id;
  insert into public.garage_inventory_movements(tank_id,vehicle_id,movement_type,quantity,quantity_before,quantity_after,next_refill_date,notes,actor_id)
    values(p_tank_id,p_vehicle_id,'vehicle_fill',-p_quantity,v_tank.current_quantity,v_tank.current_quantity-p_quantity,p_next_refill_date,nullif(trim(coalesce(p_notes,'')),''),v_uid)
    returning * into v_row;
  return v_row;
end$$;

create or replace function public.garage_request_tank_zero(p_tank_id uuid,p_reason text)
returns public.garage_tank_zero_requests language plpgsql security definer set search_path=public,app as $$
declare v_uid uuid:=app.require_garage_actor();v_tank public.garage_tanks;v_row public.garage_tank_zero_requests;
begin
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'GARAGE_ZERO_REASON_REQUIRED'; end if;
  select * into v_tank from public.garage_tanks where id=p_tank_id and archived_at is null;
  if not found then raise exception 'GARAGE_TANK_NOT_FOUND'; end if;
  if v_tank.current_quantity<=0 then raise exception 'GARAGE_TANK_ALREADY_EMPTY'; end if;
  insert into public.garage_tank_zero_requests(tank_id,requested_quantity,reason,requested_by)
    values(p_tank_id,v_tank.current_quantity,trim(p_reason),v_uid) returning * into v_row;
  insert into public.notifications(user_id,title,body,type,link)
    select distinct ur.user_id,'طلب تصفير خزان في الكراج المركزي',
      format('الخزان %s، الرصيد %s، السبب: %s',v_tank.tank_name,v_tank.current_quantity,trim(p_reason)),
      'warning','/it/central-garage-approvals'
    from public.user_roles ur where ur.role in ('it_admin','super_admin');
  return v_row;
exception when unique_violation then raise exception 'GARAGE_ZERO_REQUEST_ALREADY_PENDING';
end$$;

create or replace function public.garage_decide_tank_zero(p_request_id uuid,p_approved boolean,p_note text default null)
returns public.garage_tank_zero_requests language plpgsql security definer set search_path=public,app as $$
declare v_uid uuid:=auth.uid();v_req public.garage_tank_zero_requests;v_tank public.garage_tanks;v_row public.garage_tank_zero_requests;
begin
  if v_uid is null or not app.has_role(array['it_admin','super_admin']) then raise exception 'GARAGE_ZERO_APPROVAL_FORBIDDEN'; end if;
  select * into v_req from public.garage_tank_zero_requests where id=p_request_id and status='pending' for update;
  if not found then raise exception 'GARAGE_ZERO_REQUEST_NOT_PENDING'; end if;
  select * into v_tank from public.garage_tanks where id=v_req.tank_id and archived_at is null for update;
  if not found then raise exception 'GARAGE_TANK_NOT_FOUND'; end if;
  if p_approved and v_tank.current_quantity<>v_req.requested_quantity then raise exception 'GARAGE_TANK_BALANCE_CHANGED'; end if;
  if p_approved then
    update public.garage_tanks set current_quantity=0 where id=v_tank.id;
    insert into public.garage_inventory_movements(tank_id,movement_type,quantity,quantity_before,quantity_after,notes,actor_id)
      values(v_tank.id,'approved_reset',-v_tank.current_quantity,v_tank.current_quantity,0,
        coalesce(nullif(trim(coalesce(p_note,'')),''),v_req.reason),v_uid);
  end if;
  update public.garage_tank_zero_requests set status=case when p_approved then 'executed' else 'rejected' end,
    decided_by=v_uid,decided_at=now(),decision_note=nullif(trim(coalesce(p_note,'')),'')
  where id=v_req.id returning * into v_row;
  insert into public.notifications(user_id,title,body,type,link)
    values(v_req.requested_by,case when p_approved then 'تمت الموافقة على تصفير الخزان' else 'رُفض طلب تصفير الخزان' end,
      coalesce(nullif(trim(coalesce(p_note,'')),''),'تمت معالجة الطلب من بوابة التطوير المركزية'),
      case when p_approved then 'success' else 'error' end,'/central-garage/fuel');
  return v_row;
end$$;

create or replace function public.garage_search_vehicles(
  p_search text default null,p_sector_id smallint default null,p_shift text default null,
  p_limit integer default 48,p_offset integer default 0,p_archived boolean default false
) returns table(
  id uuid,vehicle_name text,db_number text,plate_number text,chassis_number text,image_path text,
  shift text,driver_name text,sector_id smallint,area_name text,parent_sector text,
  created_at timestamptz,updated_at timestamptz,archived_at timestamptz,archived_by uuid,archive_reason text,total_count bigint
) language plpgsql stable security definer set search_path=public,app as $$
declare v_search text:=trim(coalesce(p_search,''));
begin
  perform app.require_garage_actor();
  if p_shift is not null and p_shift not in ('morning','evening','night') then raise exception 'GARAGE_SHIFT_INVALID'; end if;
  if p_limit<1 or p_limit>100 or p_offset<0 then raise exception 'GARAGE_PAGINATION_INVALID'; end if;
  return query select v.id,v.vehicle_name,v.db_number,v.plate_number,v.chassis_number,v.image_path,
    v.shift,v.driver_name,v.sector_id,s.name,s.parent_sector,v.created_at,v.updated_at,v.archived_at,v.archived_by,v.archive_reason,
    count(*) over()
  from public.garage_vehicles v join public.sectors s on s.id=v.sector_id
  where (case when p_archived then v.archived_at is not null else v.archived_at is null end)
    and (p_sector_id is null or v.sector_id=p_sector_id)
    and (p_shift is null or v.shift=p_shift)
    and (v_search='' or v.db_number ilike '%'||v_search||'%' or v.vehicle_name ilike '%'||v_search||'%'
      or v.driver_name ilike '%'||v_search||'%' or v.plate_number ilike '%'||v_search||'%'
      or v.chassis_number ilike '%'||v_search||'%')
  order by case when p_archived then v.archived_at else v.created_at end desc limit p_limit offset p_offset;
end$$;

create or replace function public.garage_dashboard_summary(p_from date default null,p_to date default null,p_sector_id smallint default null,p_fuel_type text default null)
returns jsonb language plpgsql stable security definer set search_path=public,app as $$
declare v_from date:=coalesce(p_from,timezone('Asia/Baghdad',now())::date-29);v_to date:=coalesce(p_to,timezone('Asia/Baghdad',now())::date);v_result jsonb;
begin
  perform app.require_garage_actor();
  if v_from>v_to or v_to-v_from>366 then raise exception 'GARAGE_DATE_RANGE_INVALID'; end if;
  if p_sector_id is not null and not exists(select 1 from public.sectors where id=p_sector_id) then raise exception 'GARAGE_SECTOR_INVALID'; end if;
  if p_fuel_type is not null and p_fuel_type not in ('gas_oil','hydraulic','grease','c_oil') then raise exception 'GARAGE_FUEL_TYPE_INVALID'; end if;
  select jsonb_build_object(
    'vehiclesTotal',(select count(*) from public.garage_vehicles where archived_at is null and (p_sector_id is null or sector_id=p_sector_id)),
    'driversTotal',(select count(distinct a.driver_name) from public.garage_driver_assignments a join public.garage_vehicles v on v.id=a.vehicle_id where a.ends_at is null and v.archived_at is null and (p_sector_id is null or a.sector_id=p_sector_id)),
    'dispatchesTotal',(select count(*) from public.garage_driver_assignments a join public.garage_vehicles v on v.id=a.vehicle_id where a.ends_at is null and v.archived_at is null and (p_sector_id is null or a.sector_id=p_sector_id)),
    'vehiclesByShift',(select coalesce(jsonb_object_agg(shift,total),'{}') from(select shift,count(*) total from public.garage_vehicles where archived_at is null and (p_sector_id is null or sector_id=p_sector_id) group by shift)s),
    'vehiclesByArea',(select coalesce(jsonb_agg(jsonb_build_object('sectorId',s.id,'sector',s.parent_sector,'area',s.name,'total',coalesce(v.total,0)) order by s.sort),'[]') from public.sectors s left join(select sector_id,count(*) total from public.garage_vehicles where archived_at is null group by sector_id)v on v.sector_id=s.id where p_sector_id is null or s.id=p_sector_id),
    'tankStock',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'fuelType',fuel_type,'name',tank_name,'capacity',capacity,'quantity',current_quantity,'percent',round(current_quantity*100/nullif(capacity,0),2),'lowStock',current_quantity<=low_stock_threshold) order by fuel_type,tank_name),'[]') from public.garage_tanks where archived_at is null and (p_fuel_type is null or fuel_type=p_fuel_type)),
    'consumptionByType',(select coalesce(jsonb_object_agg(fuel_type,total),'{}') from(select t.fuel_type,sum(-m.quantity) total from public.garage_inventory_movements m join public.garage_tanks t on t.id=m.tank_id join public.garage_vehicles v on v.id=m.vehicle_id where m.movement_type='vehicle_fill' and timezone('Asia/Baghdad',m.created_at)::date between v_from and v_to and (p_sector_id is null or v.sector_id=p_sector_id) and (p_fuel_type is null or t.fuel_type=p_fuel_type) group by t.fuel_type)x),
    'dailyConsumption',(select coalesce(jsonb_agg(jsonb_build_object('date',d.day,'quantity',coalesce(x.total,0)) order by d.day),'[]') from generate_series(v_from,v_to,'1 day'::interval)d(day) left join(select timezone('Asia/Baghdad',m.created_at)::date movement_date,sum(-m.quantity) total from public.garage_inventory_movements m join public.garage_tanks t on t.id=m.tank_id join public.garage_vehicles v on v.id=m.vehicle_id where m.movement_type='vehicle_fill' and timezone('Asia/Baghdad',m.created_at)::date between v_from and v_to and (p_sector_id is null or v.sector_id=p_sector_id) and (p_fuel_type is null or t.fuel_type=p_fuel_type) group by 1)x on x.movement_date=d.day::date),
    'monthlyConsumption',(select coalesce(jsonb_agg(jsonb_build_object('month',x.month_key,'quantity',x.total) order by x.month_key),'[]') from(select to_char(date_trunc('month',timezone('Asia/Baghdad',m.created_at)),'YYYY-MM') month_key,sum(-m.quantity) total from public.garage_inventory_movements m join public.garage_tanks t on t.id=m.tank_id join public.garage_vehicles v on v.id=m.vehicle_id where m.movement_type='vehicle_fill' and timezone('Asia/Baghdad',m.created_at)::date between v_from and v_to and (p_sector_id is null or v.sector_id=p_sector_id) and (p_fuel_type is null or t.fuel_type=p_fuel_type) group by 1)x),
    'topConsumers',(select coalesce(jsonb_agg(to_jsonb(x) order by x.quantity desc),'[]') from(select v.id "vehicleId",v.vehicle_name "vehicleName",v.db_number "dbNumber",sum(-m.quantity) quantity from public.garage_inventory_movements m join public.garage_tanks t on t.id=m.tank_id join public.garage_vehicles v on v.id=m.vehicle_id where m.movement_type='vehicle_fill' and timezone('Asia/Baghdad',m.created_at)::date between v_from and v_to and (p_sector_id is null or v.sector_id=p_sector_id) and (p_fuel_type is null or t.fuel_type=p_fuel_type) group by v.id,v.vehicle_name,v.db_number order by quantity desc limit 5)x),
    'recentFills',(select coalesce(jsonb_agg(to_jsonb(x) order by x."createdAt" desc),'[]') from(select m.id,v.vehicle_name "vehicleName",v.db_number "dbNumber",t.tank_name "tankName",t.fuel_type "fuelType",-m.quantity quantity,m.next_refill_date "nextRefillDate",m.created_at "createdAt" from public.garage_inventory_movements m join public.garage_tanks t on t.id=m.tank_id join public.garage_vehicles v on v.id=m.vehicle_id where m.movement_type='vehicle_fill' and (p_sector_id is null or v.sector_id=p_sector_id) and (p_fuel_type is null or t.fuel_type=p_fuel_type) order by m.created_at desc limit 8)x),
    'pendingZeroItems',(select coalesce(jsonb_agg(to_jsonb(x) order by x."requestedAt" desc),'[]') from(select r.id,t.tank_name "tankName",t.fuel_type "fuelType",r.requested_quantity "requestedQuantity",r.reason,r.requested_at "requestedAt" from public.garage_tank_zero_requests r join public.garage_tanks t on t.id=r.tank_id where r.status='pending' and (p_fuel_type is null or t.fuel_type=p_fuel_type) order by r.requested_at desc limit 8)x),
    'pendingZeroRequests',(select count(*) from public.garage_tank_zero_requests r join public.garage_tanks t on t.id=r.tank_id where r.status='pending' and (p_fuel_type is null or t.fuel_type=p_fuel_type)),
    'from',v_from,'to',v_to,'sectorId',p_sector_id,'fuelType',p_fuel_type
  ) into v_result;
  return v_result;
end$$;


create or replace function public.garage_consumption_report(
  p_from date default null,p_to date default null,p_sector_id smallint default null,
  p_fuel_type text default null,p_tank_id uuid default null,p_vehicle_id uuid default null,
  p_movement_type text default null,p_limit integer default 50,p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path=public,app as $$
declare v_from date:=coalesce(p_from,timezone('Asia/Baghdad',now())::date-29);v_to date:=coalesce(p_to,timezone('Asia/Baghdad',now())::date);v_result jsonb;
begin
  perform app.require_garage_actor();
  if v_from>v_to or v_to-v_from>366 then raise exception 'GARAGE_REPORT_DATE_RANGE_INVALID'; end if;
  if p_limit<1 or p_limit>100 or p_offset<0 then raise exception 'GARAGE_REPORT_PAGINATION_INVALID'; end if;
  if p_fuel_type is not null and p_fuel_type not in ('gas_oil','hydraulic','grease','c_oil') then raise exception 'GARAGE_FUEL_TYPE_INVALID'; end if;
  if p_movement_type is not null and p_movement_type not in ('stock_in','vehicle_fill','approved_reset') then raise exception 'GARAGE_MOVEMENT_TYPE_INVALID'; end if;
  if p_sector_id is not null and not exists(select 1 from public.sectors where id=p_sector_id) then raise exception 'GARAGE_SECTOR_INVALID'; end if;
  with filtered as materialized (
    select m.id,m.tank_id,m.vehicle_id,m.movement_type,m.quantity,m.quantity_before,m.quantity_after,
      m.next_refill_date,m.notes,m.actor_id,coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email,m.actor_id::text) actor_name,m.created_at,t.tank_name,t.fuel_type,
      v.vehicle_name,v.db_number,v.sector_id,s.name area_name,s.parent_sector
    from public.garage_inventory_movements m join public.garage_tanks t on t.id=m.tank_id
    left join auth.users u on u.id=m.actor_id left join public.garage_vehicles v on v.id=m.vehicle_id left join public.sectors s on s.id=v.sector_id
    where timezone('Asia/Baghdad',m.created_at)::date between v_from and v_to
      and (p_sector_id is null or v.sector_id=p_sector_id)
      and (p_fuel_type is null or t.fuel_type=p_fuel_type)
      and (p_tank_id is null or m.tank_id=p_tank_id)
      and (p_vehicle_id is null or m.vehicle_id=p_vehicle_id)
      and (p_movement_type is null or m.movement_type=p_movement_type)
  ) select jsonb_build_object(
    'totalCount',(select count(*) from filtered),
    'stockInTotal',(select coalesce(sum(quantity),0) from filtered where movement_type='stock_in'),
    'consumptionTotal',(select coalesce(sum(-quantity),0) from filtered where movement_type='vehicle_fill'),
    'resetTotal',(select coalesce(sum(-quantity),0) from filtered where movement_type='approved_reset'),
    'byType',(select coalesce(jsonb_agg(to_jsonb(x) order by x.quantity desc),'[]') from(select fuel_type "fuelType",sum(case when movement_type='vehicle_fill' then -quantity else 0 end) quantity from filtered group by fuel_type)x),
    'byTank',(select coalesce(jsonb_agg(to_jsonb(x) order by x.consumption desc),'[]') from(select tank_id "tankId",tank_name "tankName",fuel_type "fuelType",sum(case when movement_type='stock_in' then quantity else 0 end) "stockIn",sum(case when movement_type='vehicle_fill' then -quantity else 0 end) consumption from filtered group by tank_id,tank_name,fuel_type)x),
    'byVehicle',(select coalesce(jsonb_agg(to_jsonb(x) order by x.quantity desc),'[]') from(select vehicle_id "vehicleId",vehicle_name "vehicleName",db_number "dbNumber",sum(-quantity) quantity from filtered where movement_type='vehicle_fill' group by vehicle_id,vehicle_name,db_number order by quantity desc limit 100)x),
    'rows',(select coalesce(jsonb_agg(to_jsonb(x) order by x."createdAt" desc),'[]') from(select id,"tankId","vehicleId","movementType",quantity,"quantityBefore","quantityAfter","nextRefillDate",notes,"actorId","actorName","createdAt","tankName","fuelType","vehicleName","dbNumber","areaName","parentSector" from (select id,tank_id "tankId",vehicle_id "vehicleId",movement_type "movementType",quantity,quantity_before "quantityBefore",quantity_after "quantityAfter",next_refill_date "nextRefillDate",notes,actor_id "actorId",actor_name "actorName",created_at "createdAt",tank_name "tankName",fuel_type "fuelType",vehicle_name "vehicleName",db_number "dbNumber",area_name "areaName",parent_sector "parentSector" from filtered order by created_at desc limit p_limit offset p_offset)y)x),
    'from',v_from,'to',v_to
  ) into v_result;
  return v_result;
end$$;

revoke all on function public.garage_add_vehicle(text,text,text,text,text,text,text,smallint),
  public.garage_update_vehicle(uuid,text,text,text,text,text),
  public.garage_assign_driver(uuid,text,text,smallint,text),public.garage_archive_vehicle(uuid,text),public.garage_restore_vehicle(uuid,text),
  public.garage_add_tank(text,text,numeric,numeric,numeric),public.garage_add_tank_stock(uuid,numeric,text),
  public.garage_fill_vehicle(uuid,uuid,numeric,date,text),public.garage_request_tank_zero(uuid,text),
  public.garage_decide_tank_zero(uuid,boolean,text),
  public.garage_search_vehicles(text,smallint,text,integer,integer,boolean),
  public.garage_dashboard_summary(date,date,smallint,text),
  public.garage_consumption_report(date,date,smallint,text,uuid,uuid,text,integer,integer)
from public,anon;
grant execute on function public.garage_add_vehicle(text,text,text,text,text,text,text,smallint),
  public.garage_update_vehicle(uuid,text,text,text,text,text),
  public.garage_assign_driver(uuid,text,text,smallint,text),public.garage_archive_vehicle(uuid,text),public.garage_restore_vehicle(uuid,text),
  public.garage_add_tank(text,text,numeric,numeric,numeric),public.garage_add_tank_stock(uuid,numeric,text),
  public.garage_fill_vehicle(uuid,uuid,numeric,date,text),public.garage_request_tank_zero(uuid,text),
  public.garage_decide_tank_zero(uuid,boolean,text),
  public.garage_search_vehicles(text,smallint,text,integer,integer,boolean),
  public.garage_dashboard_summary(date,date,smallint,text),
  public.garage_consumption_report(date,date,smallint,text,uuid,uuid,text,integer,integer)
to authenticated;
