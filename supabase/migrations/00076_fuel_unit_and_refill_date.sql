-- ═══════════════════════════════════════════════════════════════
-- 00076 · وحدات الخزانات وموعد التعبئة التالي
-- الكاز بلا موعد تالٍ. الأنواع الأخرى تتطلب موعداً من يوم بغداد أو بعده.
-- ═══════════════════════════════════════════════════════════════

alter table public.garage_tanks add column unit text;
update public.garage_tanks set unit='liter' where unit is null or trim(unit) in ('','لتر');
alter table public.garage_tanks alter column unit set default 'liter';
alter table public.garage_tanks alter column unit set not null;
alter table public.garage_tanks add constraint garage_tanks_unit_check
  check (unit in ('liter','kilogram','gallon','barrel','container','piece'));

-- إزالة التوقيع القديم حتى لا يبقى مسار عام يتجاوز الوحدة الجديدة.
drop function public.garage_add_tank(text,text,numeric,numeric,numeric);

create or replace function public.garage_add_tank(
  p_fuel_type text,p_tank_name text,p_unit text,p_capacity numeric,p_initial_quantity numeric default 0,p_low_stock_threshold numeric default 20
) returns public.garage_tanks language plpgsql security definer set search_path=public,app as $$
declare v_uid uuid:=app.require_garage_actor();v_row public.garage_tanks;
begin
  if p_fuel_type not in ('gas_oil','hydraulic','grease','c_oil') then raise exception 'GARAGE_FUEL_TYPE_INVALID'; end if;
  if length(trim(coalesce(p_tank_name,'')))<2 then raise exception 'GARAGE_TANK_NAME_REQUIRED'; end if;
  if p_unit not in ('liter','kilogram','gallon','barrel','container','piece') then raise exception 'GARAGE_TANK_UNIT_INVALID'; end if;
  if p_capacity is null or p_capacity<=0 then raise exception 'GARAGE_TANK_CAPACITY_INVALID'; end if;
  if coalesce(p_initial_quantity,0)<0 or coalesce(p_initial_quantity,0)>p_capacity then raise exception 'GARAGE_TANK_INITIAL_QUANTITY_INVALID'; end if;
  if p_low_stock_threshold is null or p_low_stock_threshold<0 or p_low_stock_threshold>100 then raise exception 'GARAGE_LOW_STOCK_THRESHOLD_INVALID'; end if;
  insert into public.garage_tanks(fuel_type,tank_name,unit,capacity,current_quantity,low_stock_threshold,created_by)
  values(p_fuel_type,trim(p_tank_name),p_unit,p_capacity,coalesce(p_initial_quantity,0),p_low_stock_threshold,v_uid) returning * into v_row;
  if v_row.current_quantity>0 then
    insert into public.garage_inventory_movements(tank_id,movement_type,quantity,quantity_before,quantity_after,notes,actor_id)
    values(v_row.id,'stock_in',v_row.current_quantity,0,v_row.current_quantity,'الكمية الابتدائية عند إنشاء الخزان',v_uid);
  end if;
  return v_row;
exception when unique_violation then raise exception 'GARAGE_TANK_DUPLICATE';
end$$;

alter table public.garage_inventory_movements drop constraint garage_inventory_movements_check;
alter table public.garage_inventory_movements add constraint garage_inventory_movements_check check (
  (movement_type='stock_in' and quantity>0 and vehicle_id is null and next_refill_date is null)
  or (movement_type='vehicle_fill' and quantity<0 and vehicle_id is not null)
  or (movement_type='approved_reset' and quantity<=0 and vehicle_id is null and next_refill_date is null)
);

create or replace function public.garage_fill_vehicle(
  p_tank_id uuid,p_vehicle_id uuid,p_quantity numeric,p_next_refill_date date default null,p_notes text default null
) returns public.garage_inventory_movements language plpgsql security definer set search_path=public,app as $$
declare v_uid uuid:=app.require_garage_actor();v_tank public.garage_tanks;v_row public.garage_inventory_movements;
begin
  if p_quantity is null or p_quantity<=0 then raise exception 'GARAGE_QUANTITY_INVALID'; end if;
  if length(coalesce(p_notes,''))>300 then raise exception 'GARAGE_NOTES_TOO_LONG'; end if;
  if not exists(select 1 from public.garage_vehicles where id=p_vehicle_id and archived_at is null) then raise exception 'GARAGE_VEHICLE_NOT_FOUND'; end if;
  select * into v_tank from public.garage_tanks where id=p_tank_id and archived_at is null for update;
  if not found then raise exception 'GARAGE_TANK_NOT_FOUND'; end if;
  if v_tank.fuel_type='gas_oil' and p_next_refill_date is not null then raise exception 'GARAGE_GAS_OIL_REFILL_DATE_NOT_ALLOWED'; end if;
  if v_tank.fuel_type<>'gas_oil' and (p_next_refill_date is null or p_next_refill_date<(now() at time zone 'Asia/Baghdad')::date) then raise exception 'GARAGE_NEXT_REFILL_DATE_INVALID'; end if;
  if v_tank.current_quantity<p_quantity then raise exception 'GARAGE_TANK_BALANCE_INSUFFICIENT'; end if;
  update public.garage_tanks set current_quantity=current_quantity-p_quantity where id=p_tank_id;
  insert into public.garage_inventory_movements(tank_id,vehicle_id,movement_type,quantity,quantity_before,quantity_after,next_refill_date,notes,actor_id)
  values(p_tank_id,p_vehicle_id,'vehicle_fill',-p_quantity,v_tank.current_quantity,v_tank.current_quantity-p_quantity,p_next_refill_date,nullif(trim(coalesce(p_notes,'')),''),v_uid) returning * into v_row;
  return v_row;
end$$;

revoke all on function public.garage_add_tank(text,text,text,numeric,numeric,numeric) from public,anon;
grant execute on function public.garage_add_tank(text,text,text,numeric,numeric,numeric) to authenticated;

-- إعادة تعريف الملخص والتقرير لإرجاع وحدة كل خزان وعدم جمع الوحدات المختلفة دون تمييز.
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
    'dispatchesTotal',(select count(*) from public.garage_departures d where timezone('Asia/Baghdad',d.departed_at)::date between v_from and v_to and (p_sector_id is null or d.sector_id=p_sector_id)),
    'vehiclesByShift',(select coalesce(jsonb_object_agg(shift,total),'{}') from(select shift,count(*) total from public.garage_vehicles where archived_at is null and (p_sector_id is null or sector_id=p_sector_id) group by shift)s),
    'vehiclesByArea',(select coalesce(jsonb_agg(jsonb_build_object('sectorId',s.id,'sector',s.parent_sector,'area',s.name,'total',coalesce(v.total,0)) order by s.sort),'[]') from public.sectors s left join(select sector_id,count(*) total from public.garage_vehicles where archived_at is null group by sector_id)v on v.sector_id=s.id where p_sector_id is null or s.id=p_sector_id),
    'tankStock',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'fuelType',fuel_type,'name',tank_name,'unit',unit,'capacity',capacity,'quantity',current_quantity,'percent',round(current_quantity*100/nullif(capacity,0),2),'lowStock',current_quantity<=low_stock_threshold) order by fuel_type,tank_name),'[]') from public.garage_tanks where archived_at is null and (p_fuel_type is null or fuel_type=p_fuel_type)),
    'fuelUnits',(select coalesce(jsonb_object_agg(fuel_type,unit),'{}') from(select distinct on(fuel_type) fuel_type,unit from public.garage_tanks order by fuel_type,created_at desc)x),
    'consumptionByType',(select coalesce(jsonb_object_agg(fuel_type,total),'{}') from(select t.fuel_type,sum(-m.quantity) total from public.garage_inventory_movements m join public.garage_tanks t on t.id=m.tank_id join public.garage_vehicles v on v.id=m.vehicle_id where m.movement_type='vehicle_fill' and timezone('Asia/Baghdad',m.created_at)::date between v_from and v_to and (p_sector_id is null or v.sector_id=p_sector_id) and (p_fuel_type is null or t.fuel_type=p_fuel_type) group by t.fuel_type)x),
    'consumptionByUnit',(select coalesce(jsonb_object_agg(unit,total),'{}') from(select t.unit,sum(-m.quantity) total from public.garage_inventory_movements m join public.garage_tanks t on t.id=m.tank_id join public.garage_vehicles v on v.id=m.vehicle_id where m.movement_type='vehicle_fill' and timezone('Asia/Baghdad',m.created_at)::date between v_from and v_to and (p_sector_id is null or v.sector_id=p_sector_id) and (p_fuel_type is null or t.fuel_type=p_fuel_type) group by t.unit)x),
    'dailyConsumption',case when p_fuel_type is not null and (select count(distinct unit) from public.garage_tanks where archived_at is null and fuel_type=p_fuel_type)=1 then (select coalesce(jsonb_agg(jsonb_build_object('date',d.day,'quantity',coalesce(x.total,0)) order by d.day),'[]') from generate_series(v_from,v_to,'1 day'::interval)d(day) left join(select timezone('Asia/Baghdad',m.created_at)::date movement_date,sum(-m.quantity) total from public.garage_inventory_movements m join public.garage_tanks t on t.id=m.tank_id join public.garage_vehicles v on v.id=m.vehicle_id where m.movement_type='vehicle_fill' and timezone('Asia/Baghdad',m.created_at)::date between v_from and v_to and (p_sector_id is null or v.sector_id=p_sector_id) and (p_fuel_type is null or t.fuel_type=p_fuel_type) group by 1)x on x.movement_date=d.day::date) else '[]'::jsonb end,
    'monthlyConsumption',case when p_fuel_type is not null and (select count(distinct unit) from public.garage_tanks where archived_at is null and fuel_type=p_fuel_type)=1 then (select coalesce(jsonb_agg(jsonb_build_object('month',x.month_key,'quantity',x.total) order by x.month_key),'[]') from(select to_char(date_trunc('month',timezone('Asia/Baghdad',m.created_at)),'YYYY-MM') month_key,sum(-m.quantity) total from public.garage_inventory_movements m join public.garage_tanks t on t.id=m.tank_id join public.garage_vehicles v on v.id=m.vehicle_id where m.movement_type='vehicle_fill' and timezone('Asia/Baghdad',m.created_at)::date between v_from and v_to and (p_sector_id is null or v.sector_id=p_sector_id) and (p_fuel_type is null or t.fuel_type=p_fuel_type) group by 1)x) else '[]'::jsonb end,
    'topConsumers',(select coalesce(jsonb_agg(to_jsonb(x) order by x.quantity desc),'[]') from(select v.id "vehicleId",v.vehicle_name "vehicleName",v.db_number "dbNumber",t.unit,sum(-m.quantity) quantity from public.garage_inventory_movements m join public.garage_tanks t on t.id=m.tank_id join public.garage_vehicles v on v.id=m.vehicle_id where m.movement_type='vehicle_fill' and timezone('Asia/Baghdad',m.created_at)::date between v_from and v_to and (p_sector_id is null or v.sector_id=p_sector_id) and (p_fuel_type is null or t.fuel_type=p_fuel_type) group by v.id,v.vehicle_name,v.db_number,t.unit order by quantity desc limit 5)x),
    'recentFills',(select coalesce(jsonb_agg(to_jsonb(x) order by x."createdAt" desc),'[]') from(select m.id,v.vehicle_name "vehicleName",v.db_number "dbNumber",t.tank_name "tankName",t.fuel_type "fuelType",t.unit,-m.quantity quantity,m.next_refill_date "nextRefillDate",m.created_at "createdAt" from public.garage_inventory_movements m join public.garage_tanks t on t.id=m.tank_id join public.garage_vehicles v on v.id=m.vehicle_id where m.movement_type='vehicle_fill' and (p_sector_id is null or v.sector_id=p_sector_id) and (p_fuel_type is null or t.fuel_type=p_fuel_type) order by m.created_at desc limit 8)x),
    'pendingZeroItems',(select coalesce(jsonb_agg(to_jsonb(x) order by x."requestedAt" desc),'[]') from(select r.id,t.tank_name "tankName",t.fuel_type "fuelType",t.unit,r.requested_quantity "requestedQuantity",r.reason,r.requested_at "requestedAt" from public.garage_tank_zero_requests r join public.garage_tanks t on t.id=r.tank_id where r.status='pending' and (p_fuel_type is null or t.fuel_type=p_fuel_type) order by r.requested_at desc limit 8)x),
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
      m.next_refill_date,m.notes,m.actor_id,coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email,m.actor_id::text) actor_name,m.created_at,t.tank_name,t.fuel_type,t.unit,
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
    'byType',(select coalesce(jsonb_agg(to_jsonb(x) order by x.quantity desc),'[]') from(select fuel_type "fuelType",unit,sum(case when movement_type='vehicle_fill' then -quantity else 0 end) quantity from filtered group by fuel_type,unit)x),
    'byTank',(select coalesce(jsonb_agg(to_jsonb(x) order by x.consumption desc),'[]') from(select tank_id "tankId",tank_name "tankName",fuel_type "fuelType",unit,sum(case when movement_type='stock_in' then quantity else 0 end) "stockIn",sum(case when movement_type='vehicle_fill' then -quantity else 0 end) consumption from filtered group by tank_id,tank_name,fuel_type,unit)x),
    'byVehicle',(select coalesce(jsonb_agg(to_jsonb(x) order by x.quantity desc),'[]') from(select vehicle_id "vehicleId",vehicle_name "vehicleName",db_number "dbNumber",unit,sum(-quantity) quantity from filtered where movement_type='vehicle_fill' group by vehicle_id,vehicle_name,db_number,unit order by quantity desc limit 100)x),
    'byUnit',(select coalesce(jsonb_agg(to_jsonb(x) order by x.unit),'[]') from(select unit,sum(case when movement_type='stock_in' then quantity else 0 end) "stockIn",sum(case when movement_type='vehicle_fill' then -quantity else 0 end) consumption,sum(case when movement_type='approved_reset' then -quantity else 0 end) reset from filtered group by unit)x),
    'rows',(select coalesce(jsonb_agg(to_jsonb(x) order by x."createdAt" desc),'[]') from(select id,"tankId","vehicleId","movementType",quantity,"quantityBefore","quantityAfter","nextRefillDate",notes,"actorId","actorName","createdAt","tankName","fuelType",unit,"vehicleName","dbNumber","areaName","parentSector" from (select id,tank_id "tankId",vehicle_id "vehicleId",movement_type "movementType",quantity,quantity_before "quantityBefore",quantity_after "quantityAfter",next_refill_date "nextRefillDate",notes,actor_id "actorId",actor_name "actorName",created_at "createdAt",tank_name "tankName",fuel_type "fuelType",unit,vehicle_name "vehicleName",db_number "dbNumber",area_name "areaName",parent_sector "parentSector" from filtered order by created_at desc limit p_limit offset p_offset)y)x),
    'from',v_from,'to',v_to
  ) into v_result;
  return v_result;
end$$;

revoke all on function public.garage_dashboard_summary(date,date,smallint,text),public.garage_consumption_report(date,date,smallint,text,uuid,uuid,text,integer,integer) from public,anon;
grant execute on function public.garage_dashboard_summary(date,date,smallint,text),public.garage_consumption_report(date,date,smallint,text,uuid,uuid,text,integer,integer) to authenticated;
