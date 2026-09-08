-- ═══════════════════════════════════════════════════════════════
-- 00076 · وحدة الخزان (لتر) وإلغاء موعد التعبئة التالي للكاز
-- ═══════════════════════════════════════════════════════════════

-- إضافة عمود الوحدة للخزانات (الافتراضي لتر)
alter table public.garage_tanks
  add column if not exists unit text not null default 'لتر';

-- تعديل دالة إضافة الخزان لقبول الوحدة
create or replace function public.garage_add_tank(
  p_fuel_type text, p_tank_name text, p_unit text, p_capacity numeric, p_initial_quantity numeric default 0, p_low_stock_threshold numeric default 20
) returns public.garage_tanks language plpgsql security definer set search_path=public,app as $$
declare v_uid uuid:=app.require_garage_actor();v_row public.garage_tanks;
begin
  if p_fuel_type not in ('gas_oil','hydraulic','grease','c_oil') then raise exception 'GARAGE_FUEL_TYPE_INVALID'; end if;
  if p_capacity is null or p_capacity<=0 then raise exception 'GARAGE_TANK_CAPACITY_INVALID'; end if;
  if p_initial_quantity is null or p_initial_quantity<0 then raise exception 'GARAGE_TANK_INITIAL_INVALID'; end if;
  if p_initial_quantity>p_capacity then raise exception 'GARAGE_TANK_INITIAL_EXCEEDS'; end if;
  insert into public.garage_tanks(fuel_type,tank_name,unit,capacity,current_quantity,low_stock_threshold,created_by)
    values(p_fuel_type,trim(p_tank_name),coalesce(nullif(trim(p_unit,''),''),'لتر'),p_capacity,p_initial_quantity,p_low_stock_threshold,v_uid)
    returning * into v_row;
  if p_initial_quantity>0 then
    insert into public.garage_inventory_movements(tank_id,movement_type,quantity,quantity_before,quantity_after,notes,actor_id)
    values(v_row.id,'stock_in',p_initial_quantity,0,p_initial_quantity,'الكمية الابتدائية عند إنشاء الخزان',v_uid);
  end if;
  return v_row;
exception when unique_violation then raise exception 'GARAGE_TANK_DUPLICATE';
end$$;

-- تعديل قيد التحقق: السماح بموعد تعبئة فارغ في حالة vehicle_fill
alter table public.garage_inventory_movements
  drop constraint if exists garage_inventory_movements_check;

alter table public.garage_inventory_movements
  add constraint garage_inventory_movements_check check (
    (movement_type = 'stock_in' and quantity > 0 and vehicle_id is null and next_refill_date is null)
    or (movement_type = 'vehicle_fill' and quantity < 0 and vehicle_id is not null)
    or (movement_type = 'approved_reset' and quantity <= 0 and vehicle_id is null and next_refill_date is null)
  );

-- تعديل دالة تعبئة الآلية: موعد التعبئة التالي مطلوب فقط للخزانات غير الكاز
create or replace function public.garage_fill_vehicle(
  p_tank_id uuid, p_vehicle_id uuid, p_quantity numeric, p_next_refill_date date default null, p_notes text default null
) returns public.garage_inventory_movements language plpgsql security definer set search_path=public,app as $$
declare v_uid uuid:=app.require_garage_actor();v_tank public.garage_tanks;v_row public.garage_inventory_movements;
begin
  if p_quantity is null or p_quantity<=0 then raise exception 'GARAGE_QUANTITY_INVALID'; end if;
  if not exists(select 1 from public.garage_vehicles where id=p_vehicle_id and archived_at is null) then raise exception 'GARAGE_VEHICLE_NOT_FOUND'; end if;
  select * into v_tank from public.garage_tanks where id=p_tank_id and archived_at is null for update;
  if not found then raise exception 'GARAGE_TANK_NOT_FOUND'; end if;
  -- موعد التعبئة التالي مطلوب فقط للخزانات غير الكاز
  if v_tank.fuel_type<>'gas_oil' and (p_next_refill_date is null or p_next_refill_date<(now() AT TIME ZONE 'Asia/Baghdad')::date) then raise exception 'GARAGE_NEXT_REFILL_DATE_INVALID'; end if;
  if v_tank.current_quantity<p_quantity then raise exception 'GARAGE_TANK_BALANCE_INSUFFICIENT'; end if;
  update public.garage_tanks set current_quantity=current_quantity-p_quantity where id=p_tank_id;
  insert into public.garage_inventory_movements(tank_id,vehicle_id,movement_type,quantity,quantity_before,quantity_after,next_refill_date,notes,actor_id)
    values(p_tank_id,p_vehicle_id,'vehicle_fill',-p_quantity,v_tank.current_quantity,v_tank.current_quantity-p_quantity,p_next_refill_date,nullif(trim(coalesce(p_notes,'')),''),v_uid)
    returning * into v_row;
  return v_row;
end$$;
