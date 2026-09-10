-- ═══════════════════════════════════════════════════════════════
-- 00078 · تقارير مخصصة: آلية واحدة أو مجموعة آليات محددة
-- ═══════════════════════════════════════════════════════════════

drop function if exists public.garage_consumption_report(date,date,smallint,text,uuid,uuid,text,integer,integer);

create or replace function public.garage_consumption_report(
  p_from date default null,p_to date default null,p_sector_id smallint default null,
  p_fuel_type text default null,p_tank_id uuid default null,p_vehicle_id uuid default null,
  p_vehicle_ids uuid[] default null,p_movement_type text default null,p_limit integer default 50,p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path=public,app as $$
declare v_from date:=coalesce(p_from,timezone('Asia/Baghdad',now())::date-29);v_to date:=coalesce(p_to,timezone('Asia/Baghdad',now())::date);v_result jsonb;v_vehicle_ids uuid[];
begin
  perform app.require_garage_actor();
  v_vehicle_ids:=case when p_vehicle_ids is null then null else array(select distinct x from unnest(p_vehicle_ids) x) end;
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
    where timezone('Asia/Baghdad',m.created_at)::date between v_from and v_to
      and (p_sector_id is null or v.sector_id=p_sector_id)
      and (p_fuel_type is null or t.fuel_type=p_fuel_type)
      and (p_tank_id is null or m.tank_id=p_tank_id)
      and (p_vehicle_id is null or m.vehicle_id=p_vehicle_id)
      and (v_vehicle_ids is null or m.vehicle_id=any(v_vehicle_ids))
      and (p_movement_type is null or m.movement_type=p_movement_type)
  ) select jsonb_build_object(
    'totalCount',(select count(*) from filtered),
    'selectedVehicles',(select coalesce(jsonb_agg(to_jsonb(x) order by x."vehicleName",x."dbNumber"),'[]') from(select v.id,v.vehicle_name "vehicleName",v.db_number "dbNumber",v.driver_name "driverName",v.plate_number "plateNumber",s.name "areaName" from public.garage_vehicles v left join public.sectors s on s.id=v.sector_id where v.id=p_vehicle_id or (v_vehicle_ids is not null and v.id=any(v_vehicle_ids)))x),
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

-- غلاف توافق للعملاء والاختبارات الأقدم التي ترسل آلية واحدة بالمعاملات الموضعية.
create or replace function public.garage_consumption_report(
  p_from date,p_to date,p_sector_id smallint,p_fuel_type text,p_tank_id uuid,p_vehicle_id uuid,
  p_movement_type text,p_limit integer,p_offset integer
) returns jsonb language sql stable security definer set search_path=public,app as $$
  select public.garage_consumption_report(p_from,p_to,p_sector_id,p_fuel_type,p_tank_id,p_vehicle_id,null::uuid[],p_movement_type,p_limit,p_offset)
$$;

revoke all on function public.garage_consumption_report(date,date,smallint,text,uuid,uuid,uuid[],text,integer,integer),public.garage_consumption_report(date,date,smallint,text,uuid,uuid,text,integer,integer) from public,anon;
grant execute on function public.garage_consumption_report(date,date,smallint,text,uuid,uuid,uuid[],text,integer,integer),public.garage_consumption_report(date,date,smallint,text,uuid,uuid,text,integer,integer) to authenticated;
