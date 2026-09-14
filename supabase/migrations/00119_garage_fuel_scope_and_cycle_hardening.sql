-- 00119 · عزل مخزون الوقود واختبار دورة القاطعين.

alter table public.garage_tanks add column garage_parent_sector text;
update public.garage_tanks t
set garage_parent_sector=gp.parent_sector
from public.garage_user_profiles gp
where gp.user_id=t.created_by and t.garage_parent_sector is null;
alter table public.garage_tanks add constraint garage_tanks_parent_sector_check
 check(garage_parent_sector is null or garage_parent_sector in('karrada','zaafaraniya'));
create index idx_garage_tanks_parent_active on public.garage_tanks(garage_parent_sector,archived_at);
drop index public.uq_garage_tank_name_type;
create unique index uq_garage_tank_name_type_sector on public.garage_tanks(garage_parent_sector,fuel_type,lower(trim(tank_name)))where garage_parent_sector is not null;

create or replace function public.admin_assign_garage_tank_sector(p_tank_id uuid,p_parent_sector text)
returns public.garage_tanks language plpgsql security definer set search_path=public,app as $$declare r public.garage_tanks;begin
 if not app.has_role(array['it_admin','super_admin'])then raise exception'GARAGE_TANK_ASSIGNMENT_FORBIDDEN';end if;
 if p_parent_sector not in('karrada','zaafaraniya')then raise exception'GARAGE_PARENT_SECTOR_INVALID';end if;
 update public.garage_tanks set garage_parent_sector=p_parent_sector where id=p_tank_id returning*into r;if not found then raise exception'GARAGE_TANK_NOT_FOUND';end if;return r;
exception when unique_violation then raise exception'GARAGE_TANK_DUPLICATE';end$$;
revoke all on function public.admin_assign_garage_tank_sector(uuid,text)from public,anon;
grant execute on function public.admin_assign_garage_tank_sector(uuid,text)to authenticated;

create or replace function app.garage_tank_allowed(p_tank_id uuid)returns boolean
language sql stable security definer set search_path=public,app as $$
 select case
  when app.has_role(array['it_admin','ops_room','super_admin']) then true
  when app.has_role(array['central_garage_officer']) then exists(
   select 1 from public.garage_tanks t join public.garage_user_profiles gp on gp.user_id=auth.uid()
   where t.id=p_tank_id and t.garage_parent_sector=gp.parent_sector)
  else false end
$$;
revoke all on function app.garage_tank_allowed(uuid)from public,anon;
grant execute on function app.garage_tank_allowed(uuid)to authenticated;

drop policy if exists "garage tanks read" on public.garage_tanks;
create policy "garage tanks scoped read" on public.garage_tanks for select to authenticated using(app.garage_tank_allowed(id));
drop policy if exists "garage movements read" on public.garage_inventory_movements;
create policy "garage movements scoped read" on public.garage_inventory_movements for select to authenticated using(app.garage_tank_allowed(tank_id));
drop policy if exists "garage zero requests read" on public.garage_tank_zero_requests;
create policy "garage zero requests scoped read" on public.garage_tank_zero_requests for select to authenticated using(app.garage_tank_allowed(tank_id));

create or replace function public.garage_add_tank(p_fuel_type text,p_tank_name text,p_unit text,p_capacity numeric,p_initial_quantity numeric default 0,p_low_stock_threshold numeric default 20)
returns public.garage_tanks language plpgsql security definer set search_path=public,app as $$
declare u uuid:=app.require_garage_actor();parent text:=app.current_garage_parent_sector();r public.garage_tanks;
begin
 if parent is null then raise exception'GARAGE_PROFILE_NOT_CONFIGURED';end if;
 if p_fuel_type not in('gas_oil','hydraulic','grease','c_oil')then raise exception'GARAGE_FUEL_TYPE_INVALID';end if;
 if length(trim(coalesce(p_tank_name,'')))<2 then raise exception'GARAGE_TANK_NAME_REQUIRED';end if;
 if p_unit not in('liter','kilogram','gallon','barrel','container','piece')then raise exception'GARAGE_TANK_UNIT_INVALID';end if;
 if p_capacity is null or p_capacity<=0 then raise exception'GARAGE_TANK_CAPACITY_INVALID';end if;
 if coalesce(p_initial_quantity,0)<0 or coalesce(p_initial_quantity,0)>p_capacity then raise exception'GARAGE_TANK_INITIAL_QUANTITY_INVALID';end if;
 if p_low_stock_threshold is null or p_low_stock_threshold<0 or p_low_stock_threshold>100 then raise exception'GARAGE_LOW_STOCK_THRESHOLD_INVALID';end if;
 insert into public.garage_tanks(fuel_type,tank_name,unit,capacity,current_quantity,low_stock_threshold,created_by,garage_parent_sector)
 values(p_fuel_type,trim(p_tank_name),p_unit,p_capacity,coalesce(p_initial_quantity,0),p_low_stock_threshold,u,parent)returning*into r;
 if r.current_quantity>0 then insert into public.garage_inventory_movements(tank_id,movement_type,quantity,quantity_before,quantity_after,notes,actor_id)values(r.id,'stock_in',r.current_quantity,0,r.current_quantity,'الكمية الابتدائية عند إنشاء الخزان',u);end if;
 return r;
exception when unique_violation then raise exception'GARAGE_TANK_DUPLICATE';end$$;

create or replace function public.garage_add_tank_stock(p_tank_id uuid,p_quantity numeric,p_notes text default null)
returns public.garage_inventory_movements language plpgsql security definer set search_path=public,app as $$
declare u uuid:=app.require_garage_actor();t public.garage_tanks;r public.garage_inventory_movements;
begin
 if not app.garage_tank_allowed(p_tank_id)then raise exception'GARAGE_TANK_SCOPE_FORBIDDEN';end if;
 if p_quantity is null or p_quantity<=0 then raise exception'GARAGE_QUANTITY_INVALID';end if;
 select*into t from public.garage_tanks where id=p_tank_id and archived_at is null for update;if not found then raise exception'GARAGE_TANK_NOT_FOUND';end if;
 if t.current_quantity+p_quantity>t.capacity then raise exception'GARAGE_TANK_CAPACITY_EXCEEDED';end if;
 update public.garage_tanks set current_quantity=current_quantity+p_quantity where id=t.id;
 insert into public.garage_inventory_movements(tank_id,movement_type,quantity,quantity_before,quantity_after,notes,actor_id)values(t.id,'stock_in',p_quantity,t.current_quantity,t.current_quantity+p_quantity,nullif(trim(coalesce(p_notes,'')),''),u)returning*into r;return r;end$$;

create or replace function public.garage_fill_vehicle(p_tank_id uuid,p_vehicle_id uuid,p_quantity numeric,p_next_refill_date date default null,p_notes text default null)
returns public.garage_inventory_movements language plpgsql security definer set search_path=public,app as $$
declare u uuid:=app.require_garage_actor();t public.garage_tanks;r public.garage_inventory_movements;
begin
 if not app.garage_tank_allowed(p_tank_id)then raise exception'GARAGE_TANK_SCOPE_FORBIDDEN';end if;
 if not app.garage_vehicle_allowed(p_vehicle_id)then raise exception'GARAGE_VEHICLE_SCOPE_FORBIDDEN';end if;
 if p_quantity is null or p_quantity<=0 then raise exception'GARAGE_QUANTITY_INVALID';end if;if length(coalesce(p_notes,''))>300 then raise exception'GARAGE_NOTES_TOO_LONG';end if;
 select*into t from public.garage_tanks where id=p_tank_id and archived_at is null for update;if not found then raise exception'GARAGE_TANK_NOT_FOUND';end if;
 if t.fuel_type='gas_oil'and p_next_refill_date is not null then raise exception'GARAGE_GAS_OIL_REFILL_DATE_NOT_ALLOWED';end if;
 if t.fuel_type<>'gas_oil'and(p_next_refill_date is null or p_next_refill_date<(now()at time zone'Asia/Baghdad')::date)then raise exception'GARAGE_NEXT_REFILL_DATE_INVALID';end if;
 if t.current_quantity<p_quantity then raise exception'GARAGE_TANK_BALANCE_INSUFFICIENT';end if;
 update public.garage_tanks set current_quantity=current_quantity-p_quantity where id=t.id;
 insert into public.garage_inventory_movements(tank_id,vehicle_id,movement_type,quantity,quantity_before,quantity_after,next_refill_date,notes,actor_id)values(t.id,p_vehicle_id,'vehicle_fill',-p_quantity,t.current_quantity,t.current_quantity-p_quantity,p_next_refill_date,nullif(trim(coalesce(p_notes,'')),''),u)returning*into r;return r;end$$;

create or replace function public.garage_request_tank_zero(p_tank_id uuid,p_reason text)
returns public.garage_tank_zero_requests language plpgsql security definer set search_path=public,app as $$
declare u uuid:=app.require_garage_actor();t public.garage_tanks;r public.garage_tank_zero_requests;
begin
 if not app.garage_tank_allowed(p_tank_id)then raise exception'GARAGE_TANK_SCOPE_FORBIDDEN';end if;
 if length(trim(coalesce(p_reason,'')))<5 then raise exception'GARAGE_ZERO_REASON_REQUIRED';end if;
 select*into t from public.garage_tanks where id=p_tank_id and archived_at is null;if not found then raise exception'GARAGE_TANK_NOT_FOUND';end if;if t.current_quantity<=0 then raise exception'GARAGE_TANK_ALREADY_EMPTY';end if;
 insert into public.garage_tank_zero_requests(tank_id,requested_quantity,reason,requested_by)values(t.id,t.current_quantity,trim(p_reason),u)returning*into r;
 insert into public.notifications(user_id,title,body,type,link)select distinct ur.user_id,'طلب تصفير خزان في الكراج المركزي',format('الخزان %s، الرصيد %s، السبب: %s',t.tank_name,t.current_quantity,trim(p_reason)),'warning','/it/central-garage-approvals'from public.user_roles ur where ur.role in('it_admin','super_admin');return r;
exception when unique_violation then raise exception'GARAGE_ZERO_REQUEST_ALREADY_PENDING';end$$;


-- اللوحة والتقرير لا يعرضان مخزون أو حركات القاطع الآخر.
create or replace function public.garage_dashboard_summary(p_from date default null,p_to date default null,p_sector_id smallint default null,p_fuel_type text default null)
returns jsonb language plpgsql stable security definer set search_path=public,app as $$
declare v_from date:=coalesce(p_from,timezone('Asia/Baghdad',now())::date-29);v_to date:=coalesce(p_to,timezone('Asia/Baghdad',now())::date);v_result jsonb;
begin
  perform app.require_garage_actor();
  if p_sector_id is not null and not app.garage_sector_allowed(p_sector_id) then raise exception 'GARAGE_SECTOR_SCOPE_FORBIDDEN'; end if;
  if v_from>v_to or v_to-v_from>366 then raise exception 'GARAGE_DATE_RANGE_INVALID'; end if;
  if p_sector_id is not null and not exists(select 1 from public.sectors where id=p_sector_id) then raise exception 'GARAGE_SECTOR_INVALID'; end if;
  if p_fuel_type is not null and p_fuel_type not in ('gas_oil','hydraulic','grease','c_oil') then raise exception 'GARAGE_FUEL_TYPE_INVALID'; end if;
  select jsonb_build_object(
    'vehiclesTotal',(select count(*) from public.garage_vehicles v where v.archived_at is null and app.garage_vehicle_allowed(v.id) and (p_sector_id is null or v.sector_id=p_sector_id)),
    'driversTotal',(select count(distinct a.driver_name) from public.garage_driver_assignments a join public.garage_vehicles v on v.id=a.vehicle_id where a.ends_at is null and v.archived_at is null and app.garage_vehicle_allowed(v.id) and (p_sector_id is null or a.sector_id=p_sector_id)),
    'dispatchesTotal',(select count(*) from public.garage_departures d where timezone('Asia/Baghdad',d.departed_at)::date between v_from and v_to and app.garage_vehicle_allowed(d.vehicle_id) and (p_sector_id is null or d.sector_id=p_sector_id)),
    'vehiclesByShift',(select coalesce(jsonb_object_agg(shift,total),'{}') from(select v.shift,count(*) total from public.garage_vehicles v where v.archived_at is null and app.garage_vehicle_allowed(v.id) and (p_sector_id is null or v.sector_id=p_sector_id) group by v.shift)s),
    'vehiclesByArea',(select coalesce(jsonb_agg(jsonb_build_object('sectorId',s.id,'sector',s.parent_sector,'area',s.name,'total',coalesce(v.total,0)) order by s.sort),'[]') from public.sectors s left join(select sector_id,count(*) total from public.garage_vehicles where archived_at is null group by sector_id)v on v.sector_id=s.id where app.garage_sector_allowed(s.id) and (p_sector_id is null or s.id=p_sector_id)),
    'tankStock',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'fuelType',fuel_type,'name',tank_name,'unit',unit,'capacity',capacity,'quantity',current_quantity,'percent',round(current_quantity*100/nullif(capacity,0),2),'lowStock',current_quantity<=low_stock_threshold) order by fuel_type,tank_name),'[]') from public.garage_tanks where app.garage_tank_allowed(id) and archived_at is null and (p_fuel_type is null or fuel_type=p_fuel_type)),
    'fuelUnits',(select coalesce(jsonb_object_agg(fuel_type,unit),'{}') from(select distinct on(fuel_type) fuel_type,unit from public.garage_tanks where app.garage_tank_allowed(id) order by fuel_type,created_at desc)x),
    'consumptionByType',(select coalesce(jsonb_object_agg(fuel_type,total),'{}') from(select t.fuel_type,sum(-m.quantity) total from public.garage_inventory_movements m join public.garage_tanks t on t.id=m.tank_id join public.garage_vehicles v on v.id=m.vehicle_id where m.movement_type='vehicle_fill' and app.garage_vehicle_allowed(v.id) and app.garage_tank_allowed(t.id) and timezone('Asia/Baghdad',m.created_at)::date between v_from and v_to and (p_sector_id is null or v.sector_id=p_sector_id) and (p_fuel_type is null or t.fuel_type=p_fuel_type) group by t.fuel_type)x),
    'consumptionByUnit',(select coalesce(jsonb_object_agg(unit,total),'{}') from(select t.unit,sum(-m.quantity) total from public.garage_inventory_movements m join public.garage_tanks t on t.id=m.tank_id join public.garage_vehicles v on v.id=m.vehicle_id where m.movement_type='vehicle_fill' and app.garage_vehicle_allowed(v.id) and app.garage_tank_allowed(t.id) and timezone('Asia/Baghdad',m.created_at)::date between v_from and v_to and (p_sector_id is null or v.sector_id=p_sector_id) and (p_fuel_type is null or t.fuel_type=p_fuel_type) group by t.unit)x),
    'dailyConsumption',case when p_fuel_type is not null and (select count(distinct unit) from public.garage_tanks where app.garage_tank_allowed(id) and archived_at is null and fuel_type=p_fuel_type)=1 then (select coalesce(jsonb_agg(jsonb_build_object('date',d.day,'quantity',coalesce(x.total,0)) order by d.day),'[]') from generate_series(v_from,v_to,'1 day'::interval)d(day) left join(select timezone('Asia/Baghdad',m.created_at)::date movement_date,sum(-m.quantity) total from public.garage_inventory_movements m join public.garage_tanks t on t.id=m.tank_id join public.garage_vehicles v on v.id=m.vehicle_id where m.movement_type='vehicle_fill' and app.garage_vehicle_allowed(v.id) and app.garage_tank_allowed(t.id) and timezone('Asia/Baghdad',m.created_at)::date between v_from and v_to and (p_sector_id is null or v.sector_id=p_sector_id) and (p_fuel_type is null or t.fuel_type=p_fuel_type) group by 1)x on x.movement_date=d.day::date) else '[]'::jsonb end,
    'monthlyConsumption',case when p_fuel_type is not null and (select count(distinct unit) from public.garage_tanks where app.garage_tank_allowed(id) and archived_at is null and fuel_type=p_fuel_type)=1 then (select coalesce(jsonb_agg(jsonb_build_object('month',x.month_key,'quantity',x.total) order by x.month_key),'[]') from(select to_char(date_trunc('month',timezone('Asia/Baghdad',m.created_at)),'YYYY-MM') month_key,sum(-m.quantity) total from public.garage_inventory_movements m join public.garage_tanks t on t.id=m.tank_id join public.garage_vehicles v on v.id=m.vehicle_id where m.movement_type='vehicle_fill' and app.garage_vehicle_allowed(v.id) and app.garage_tank_allowed(t.id) and timezone('Asia/Baghdad',m.created_at)::date between v_from and v_to and (p_sector_id is null or v.sector_id=p_sector_id) and (p_fuel_type is null or t.fuel_type=p_fuel_type) group by 1)x) else '[]'::jsonb end,
    'topConsumers',(select coalesce(jsonb_agg(to_jsonb(x) order by x.quantity desc),'[]') from(select v.id "vehicleId",v.vehicle_name "vehicleName",v.db_number "dbNumber",t.unit,sum(-m.quantity) quantity from public.garage_inventory_movements m join public.garage_tanks t on t.id=m.tank_id join public.garage_vehicles v on v.id=m.vehicle_id where m.movement_type='vehicle_fill' and app.garage_vehicle_allowed(v.id) and app.garage_tank_allowed(t.id) and timezone('Asia/Baghdad',m.created_at)::date between v_from and v_to and (p_sector_id is null or v.sector_id=p_sector_id) and (p_fuel_type is null or t.fuel_type=p_fuel_type) group by v.id,v.vehicle_name,v.db_number,t.unit order by quantity desc limit 5)x),
    'recentFills',(select coalesce(jsonb_agg(to_jsonb(x) order by x."createdAt" desc),'[]') from(select m.id,v.vehicle_name "vehicleName",v.db_number "dbNumber",t.tank_name "tankName",t.fuel_type "fuelType",t.unit,-m.quantity quantity,m.next_refill_date "nextRefillDate",m.created_at "createdAt" from public.garage_inventory_movements m join public.garage_tanks t on t.id=m.tank_id join public.garage_vehicles v on v.id=m.vehicle_id where m.movement_type='vehicle_fill' and app.garage_vehicle_allowed(v.id) and app.garage_tank_allowed(t.id) and (p_sector_id is null or v.sector_id=p_sector_id) and (p_fuel_type is null or t.fuel_type=p_fuel_type) order by m.created_at desc limit 8)x),
    'pendingZeroItems',(select coalesce(jsonb_agg(to_jsonb(x) order by x."requestedAt" desc),'[]') from(select r.id,t.tank_name "tankName",t.fuel_type "fuelType",t.unit,r.requested_quantity "requestedQuantity",r.reason,r.requested_at "requestedAt" from public.garage_tank_zero_requests r join public.garage_tanks t on t.id=r.tank_id where app.garage_tank_allowed(t.id) and r.status='pending' and (p_fuel_type is null or t.fuel_type=p_fuel_type) order by r.requested_at desc limit 8)x),
    'pendingZeroRequests',(select count(*) from public.garage_tank_zero_requests r join public.garage_tanks t on t.id=r.tank_id where app.garage_tank_allowed(t.id) and r.status='pending' and (p_fuel_type is null or t.fuel_type=p_fuel_type)),
    'from',v_from,'to',v_to,'sectorId',p_sector_id,'fuelType',p_fuel_type
  ) into v_result;
  return v_result;
end$$;

create or replace function public.garage_consumption_report(
  p_from date default null,p_to date default null,p_sector_id smallint default null,
  p_fuel_type text default null,p_tank_id uuid default null,p_vehicle_id uuid default null,
  p_vehicle_ids uuid[] default null,p_movement_type text default null,p_limit integer default 50,p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path=public,app as $$
declare v_from date:=coalesce(p_from,timezone('Asia/Baghdad',now())::date-29);v_to date:=coalesce(p_to,timezone('Asia/Baghdad',now())::date);v_result jsonb;v_vehicle_ids uuid[];
begin
  perform app.require_garage_actor();
  v_vehicle_ids:=case when p_vehicle_ids is null then null else array(select distinct x from unnest(p_vehicle_ids) x) end;
  if p_tank_id is not null and not app.garage_tank_allowed(p_tank_id) then raise exception 'GARAGE_TANK_SCOPE_FORBIDDEN'; end if;
  if p_sector_id is not null and not app.garage_sector_allowed(p_sector_id) then raise exception 'GARAGE_SECTOR_SCOPE_FORBIDDEN'; end if;
  if p_vehicle_id is not null and not app.garage_vehicle_allowed(p_vehicle_id) then raise exception 'GARAGE_VEHICLE_SCOPE_FORBIDDEN'; end if;
  if v_vehicle_ids is not null and exists(select 1 from unnest(v_vehicle_ids) x where not app.garage_vehicle_allowed(x)) then raise exception 'GARAGE_VEHICLE_SCOPE_FORBIDDEN'; end if;
  if v_from>v_to or v_to-v_from>366 then raise exception 'GARAGE_REPORT_DATE_RANGE_INVALID'; end if;
  if p_limit<1 or p_limit>100 or p_offset<0 then raise exception 'GARAGE_REPORT_PAGINATION_INVALID'; end if;
  if cardinality(v_vehicle_ids)>50 or array_position(v_vehicle_ids,null) is not null then raise exception 'GARAGE_REPORT_VEHICLES_INVALID'; end if;
  if p_vehicle_id is not null and v_vehicle_ids is not null then raise exception 'GARAGE_REPORT_VEHICLE_FILTER_CONFLICT'; end if;
  if v_vehicle_ids is not null and exists(select 1 from unnest(v_vehicle_ids) x left join public.garage_vehicles v on v.id=x where v.id is null) then raise exception 'GARAGE_REPORT_VEHICLE_NOT_FOUND'; end if;
  if p_fuel_type is not null and p_fuel_type not in ('gas_oil','hydraulic','grease','c_oil') then raise exception 'GARAGE_FUEL_TYPE_INVALID'; end if;
  if p_movement_type is not null and p_movement_type not in ('stock_in','vehicle_fill','approved_reset') then raise exception 'GARAGE_MOVEMENT_TYPE_INVALID'; end if;
  if p_sector_id is not null and not exists(select 1 from public.sectors where id=p_sector_id) then raise exception 'GARAGE_SECTOR_INVALID'; end if;
  with filtered as materialized (
    select m.id,m.tank_id,m.vehicle_id,m.movement_type,m.quantity,m.quantity_before,m.quantity_after,
      m.next_refill_date,m.notes,m.actor_id,coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email,m.actor_id::text) actor_name,m.created_at,t.tank_name,t.fuel_type,t.unit,
      v.vehicle_name,v.db_number,v.sector_id,s.name area_name,s.parent_sector
    from public.garage_inventory_movements m join public.garage_tanks t on t.id=m.tank_id
    left join auth.users u on u.id=m.actor_id left join public.garage_vehicles v on v.id=m.vehicle_id left join public.sectors s on s.id=v.sector_id
    where app.garage_tank_allowed(t.id)
      and timezone('Asia/Baghdad',m.created_at)::date between v_from and v_to
      and (m.vehicle_id is null or app.garage_vehicle_allowed(m.vehicle_id))
      and (p_sector_id is null or v.sector_id=p_sector_id)
      and (p_fuel_type is null or t.fuel_type=p_fuel_type)
      and (p_tank_id is null or m.tank_id=p_tank_id)
      and (p_vehicle_id is null or m.vehicle_id=p_vehicle_id)
      and (v_vehicle_ids is null or m.vehicle_id=any(v_vehicle_ids))
      and (p_movement_type is null or m.movement_type=p_movement_type)
  ) select jsonb_build_object(
    'totalCount',(select count(*) from filtered),
    'selectedVehicles',(select coalesce(jsonb_agg(to_jsonb(x) order by x."vehicleName",x."dbNumber"),'[]') from(select v.id,v.vehicle_name "vehicleName",v.db_number "dbNumber",v.driver_name "driverName",v.plate_number "plateNumber",s.name "areaName" from public.garage_vehicles v left join public.sectors s on s.id=v.sector_id where app.garage_vehicle_allowed(v.id) and (v.id=p_vehicle_id or (v_vehicle_ids is not null and v.id=any(v_vehicle_ids))))x),
    'stockInTotal',(select coalesce(sum(quantity),0) from filtered where movement_type='stock_in'),
    'consumptionTotal',(select coalesce(sum(-quantity),0) from filtered where movement_type='vehicle_fill'),
    'resetTotal',(select coalesce(sum(-quantity),0) from filtered where movement_type='approved_reset'),
    'byType',(select coalesce(jsonb_agg(to_jsonb(x) order by x.quantity desc),'[]') from(select fuel_type "fuelType",unit,sum(case when movement_type='vehicle_fill' then -quantity else 0 end) quantity from filtered group by fuel_type,unit)x),
    'byTank',(select coalesce(jsonb_agg(to_jsonb(x) order by x.consumption desc),'[]') from(select tank_id "tankId",tank_name "tankName",fuel_type "fuelType",unit,sum(case when movement_type='stock_in' then quantity else 0 end) "stockIn",sum(case when movement_type='vehicle_fill' then -quantity else 0 end) consumption from filtered group by tank_id,tank_name,fuel_type,unit)x),
    'byVehicle',(select coalesce(jsonb_agg(to_jsonb(x) order by x.quantity desc),'[]') from(select vehicle_id "vehicleId",vehicle_name "vehicleName",db_number "dbNumber",unit,sum(-quantity) quantity from filtered where movement_type='vehicle_fill' group by vehicle_id,vehicle_name,db_number,unit order by quantity desc limit 100)x),
    'byUnit',(select coalesce(jsonb_agg(to_jsonb(x) order by x.unit),'[]') from(select unit,sum(case when movement_type='stock_in' then quantity else 0 end) "stockIn",sum(case when movement_type='vehicle_fill' then -quantity else 0 end) consumption,sum(case when movement_type='approved_reset' then -quantity else 0 end) reset from filtered group by unit)x),
    'rows',(select coalesce(jsonb_agg(to_jsonb(x) order by x."createdAt" desc),'[]') from(select id,"tankId","vehicleId","movementType",quantity,"quantityBefore","quantityAfter","nextRefillDate",notes,"actorId","actorName","createdAt","tankName","fuelType",unit,"vehicleName","dbNumber","areaName","parentSector" from (select id,tank_id "tankId",vehicle_id "vehicleId",movement_type "movementType",quantity,quantity_before "quantityBefore",quantity_after "quantityAfter",next_refill_date "nextRefillDate",notes,actor_id "actorId",actor_name "actorName",created_at "createdAt",tank_name "tankName",fuel_type "fuelType",unit,vehicle_name "vehicleName",db_number "dbNumber",area_name "areaName",parent_sector "parentSector" from filtered order by created_at desc limit p_limit offset p_offset)y)x),
    'from',v_from,'to',v_to
  ) into v_result;
  return v_result;
end$$;

-- غلاف التوافق القديم يستفيد من التقرير المحمي أعلاه.
create or replace function public.garage_consumption_report(p_from date,p_to date,p_sector_id smallint,p_fuel_type text,p_tank_id uuid,p_vehicle_id uuid,p_movement_type text,p_limit integer,p_offset integer)
returns jsonb language sql stable security definer set search_path=public,app as $$select public.garage_consumption_report(p_from,p_to,p_sector_id,p_fuel_type,p_tank_id,p_vehicle_id,null::uuid[],p_movement_type,p_limit,p_offset)$$;

