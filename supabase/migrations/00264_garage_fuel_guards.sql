-- 00308 · تدقيق وقود الكراج المركزي:
--   (1) كان يمكن تعبئة آلية مؤرشفة بالوقود ⇒ GARAGE_VEHICLE_ARCHIVED.
--   (2) أثناء طلب تصفير معلّق كانت حركات الخزان (إدخال/تعبئة) مسموحة ⇒ تتغيّر الكمية فتفشل موافقة IT بـ GARAGE_TANK_BALANCE_CHANGED ويعلق الطلب بلا مخرج.
--       الآن تُمنع حركات الخزان حتى يُبتّ في الطلب ⇒ GARAGE_TANK_ZERO_PENDING.
create or replace function public.garage_add_tank_stock(p_tank_id uuid,p_quantity numeric,p_notes text default null)
returns public.garage_inventory_movements language plpgsql security definer set search_path=public,app as $$
declare u uuid:=app.require_garage_actor();t public.garage_tanks;r public.garage_inventory_movements;
begin
 if not app.garage_tank_allowed(p_tank_id)then raise exception'GARAGE_TANK_SCOPE_FORBIDDEN';end if;
 if p_quantity is null or p_quantity<=0 then raise exception'GARAGE_QUANTITY_INVALID';end if;
 select*into t from public.garage_tanks where id=p_tank_id and archived_at is null for update;if not found then raise exception'GARAGE_TANK_NOT_FOUND';end if;
 if exists(select 1 from public.garage_tank_zero_requests where tank_id=t.id and status='pending')then raise exception'GARAGE_TANK_ZERO_PENDING';end if;   -- 00308
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
 if exists(select 1 from public.garage_tank_zero_requests where tank_id=t.id and status='pending')then raise exception'GARAGE_TANK_ZERO_PENDING';end if;   -- 00308
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

create or replace function public.garage_fill_vehicle(p_tank_id uuid,p_vehicle_id uuid,p_quantity numeric,p_next_refill_date date default null,p_notes text default null)
returns public.garage_inventory_movements language plpgsql security definer set search_path=public,app as $$
declare u uuid:=app.require_garage_actor();t public.garage_tanks;r public.garage_inventory_movements;
begin
 if not app.garage_tank_allowed(p_tank_id)then raise exception'GARAGE_TANK_SCOPE_FORBIDDEN';end if;
 if not app.garage_vehicle_allowed(p_vehicle_id)then raise exception'GARAGE_VEHICLE_SCOPE_FORBIDDEN';end if;
 if not exists(select 1 from public.garage_vehicles where id=p_vehicle_id and archived_at is null)then raise exception'GARAGE_VEHICLE_ARCHIVED';end if;   -- 00308
 if p_quantity is null or p_quantity<=0 then raise exception'GARAGE_QUANTITY_INVALID';end if;if length(coalesce(p_notes,''))>300 then raise exception'GARAGE_NOTES_TOO_LONG';end if;
 select*into t from public.garage_tanks where id=p_tank_id and archived_at is null for update;if not found then raise exception'GARAGE_TANK_NOT_FOUND';end if;
 if exists(select 1 from public.garage_tank_zero_requests where tank_id=t.id and status='pending')then raise exception'GARAGE_TANK_ZERO_PENDING';end if;   -- 00308
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
