-- 00079 · تصنيف الآليات وملكيتها وتفاصيل المؤجر/العقد
alter table public.garage_vehicles
  add column vehicle_category text not null default 'other' check(vehicle_category in('compactor_small','compactor_large','truck','shovel','tipper','tanker','sweeper','strat','other')),
  add column ownership_type text not null default 'owned' check(ownership_type in('owned','rented')),
  add column lessor_name text,
  add column rental_contract_no text,
  add column rental_start_date date,
  add column rental_end_date date,
  add column model_year smallint,
  add column vehicle_color text,
  add column specifications text,
  add constraint garage_vehicle_model_year_check check(model_year is null or model_year between 1950 and extract(year from current_date)::int+1),
  add constraint garage_vehicle_rental_dates_check check(rental_end_date is null or rental_start_date is not null and rental_end_date>=rental_start_date),
  add constraint garage_vehicle_ownership_details_check check(
    (ownership_type='owned' and lessor_name is null and rental_contract_no is null and rental_start_date is null and rental_end_date is null)
    or (ownership_type='rented' and length(trim(coalesce(lessor_name,''))) between 2 and 160)
  ),
  add constraint garage_vehicle_details_lengths_check check(
    (vehicle_color is null or length(trim(vehicle_color)) between 2 and 50)
    and (rental_contract_no is null or length(trim(rental_contract_no)) between 1 and 80)
    and (specifications is null or length(trim(specifications)) between 3 and 1000)
  );
create index idx_garage_vehicle_category_ownership on public.garage_vehicles(vehicle_category,ownership_type) where archived_at is null;

drop function if exists public.garage_add_vehicle(text,text,text,text,text,text,text,smallint);
create or replace function public.garage_add_vehicle(
 p_vehicle_name text,p_db_number text,p_plate_number text,p_chassis_number text,p_image_path text,p_shift text,p_driver_name text,p_sector_id smallint,
 p_vehicle_category text default 'other',p_ownership_type text default 'owned',p_lessor_name text default null,p_rental_contract_no text default null,
 p_rental_start_date date default null,p_rental_end_date date default null,p_model_year smallint default null,p_vehicle_color text default null,p_specifications text default null
) returns public.garage_vehicles language plpgsql security definer set search_path=public,app as $$
declare v_uid uuid:=app.require_garage_actor();v_row public.garage_vehicles;
begin
 if p_shift not in('morning','evening','night') then raise exception 'GARAGE_SHIFT_INVALID';end if;
 if p_vehicle_category not in('compactor_small','compactor_large','truck','shovel','tipper','tanker','sweeper','strat','other') then raise exception 'GARAGE_VEHICLE_CATEGORY_INVALID';end if;
 if p_ownership_type not in('owned','rented') then raise exception 'GARAGE_OWNERSHIP_TYPE_INVALID';end if;
 if p_ownership_type='rented' and length(trim(coalesce(p_lessor_name,'')))<2 then raise exception 'GARAGE_LESSOR_REQUIRED';end if;
 if p_rental_end_date is not null and (p_rental_start_date is null or p_rental_end_date<p_rental_start_date) then raise exception 'GARAGE_RENTAL_DATES_INVALID';end if;
 if not exists(select 1 from public.sectors where id=p_sector_id) then raise exception 'GARAGE_AREA_INVALID';end if;
 if length(trim(coalesce(p_vehicle_name,'')))<2 then raise exception 'GARAGE_VEHICLE_NAME_REQUIRED';end if;
 if length(trim(coalesce(p_db_number,'')))<1 then raise exception 'GARAGE_DB_NUMBER_REQUIRED';end if;
 if length(trim(coalesce(p_plate_number,'')))<1 then raise exception 'GARAGE_PLATE_REQUIRED';end if;
 if length(trim(coalesce(p_chassis_number,'')))<3 then raise exception 'GARAGE_CHASSIS_REQUIRED';end if;
 if length(trim(coalesce(p_driver_name,'')))<2 then raise exception 'GARAGE_DRIVER_REQUIRED';end if;
 if p_image_path is null or p_image_path not like v_uid::text||'/%' then raise exception 'GARAGE_IMAGE_PATH_INVALID';end if;
 insert into public.garage_vehicles(vehicle_name,db_number,plate_number,chassis_number,image_path,shift,driver_name,sector_id,created_by,vehicle_category,ownership_type,lessor_name,rental_contract_no,rental_start_date,rental_end_date,model_year,vehicle_color,specifications)
 values(trim(p_vehicle_name),trim(p_db_number),trim(p_plate_number),trim(p_chassis_number),trim(p_image_path),p_shift,trim(p_driver_name),p_sector_id,v_uid,p_vehicle_category,p_ownership_type,case when p_ownership_type='rented' then nullif(trim(coalesce(p_lessor_name,'')),'') end,case when p_ownership_type='rented' then nullif(trim(coalesce(p_rental_contract_no,'')),'') end,case when p_ownership_type='rented' then p_rental_start_date end,case when p_ownership_type='rented' then p_rental_end_date end,p_model_year,nullif(trim(coalesce(p_vehicle_color,'')),''),nullif(trim(coalesce(p_specifications,'')),'')) returning * into v_row;
 insert into public.garage_driver_assignments(vehicle_id,driver_name,shift,sector_id,assigned_by,change_reason) values(v_row.id,v_row.driver_name,v_row.shift,v_row.sector_id,v_uid,'الإسناد الأول عند إضافة الآلية');return v_row;
exception when unique_violation then raise exception 'GARAGE_VEHICLE_IDENTIFIER_DUPLICATE';end$$;

drop function if exists public.garage_update_vehicle(uuid,text,text,text,text,text);
create or replace function public.garage_update_vehicle(
 p_vehicle_id uuid,p_vehicle_name text,p_db_number text,p_plate_number text,p_chassis_number text,p_image_path text default null,
 p_vehicle_category text default 'other',p_ownership_type text default 'owned',p_lessor_name text default null,p_rental_contract_no text default null,
 p_rental_start_date date default null,p_rental_end_date date default null,p_model_year smallint default null,p_vehicle_color text default null,p_specifications text default null
) returns public.garage_vehicles language plpgsql security definer set search_path=public,app as $$
declare v_uid uuid:=app.require_garage_actor();v_row public.garage_vehicles;
begin
 if p_vehicle_category not in('compactor_small','compactor_large','truck','shovel','tipper','tanker','sweeper','strat','other') then raise exception 'GARAGE_VEHICLE_CATEGORY_INVALID';end if;
 if p_ownership_type not in('owned','rented') then raise exception 'GARAGE_OWNERSHIP_TYPE_INVALID';end if;
 if p_ownership_type='rented' and length(trim(coalesce(p_lessor_name,'')))<2 then raise exception 'GARAGE_LESSOR_REQUIRED';end if;
 if p_rental_end_date is not null and (p_rental_start_date is null or p_rental_end_date<p_rental_start_date) then raise exception 'GARAGE_RENTAL_DATES_INVALID';end if;
 if length(trim(coalesce(p_vehicle_name,'')))<2 or length(trim(coalesce(p_db_number,'')))<1 or length(trim(coalesce(p_plate_number,'')))<1 or length(trim(coalesce(p_chassis_number,'')))<3 then raise exception 'GARAGE_VEHICLE_FIELDS_REQUIRED';end if;
 if p_image_path is not null and p_image_path not like v_uid::text||'/%' then raise exception 'GARAGE_IMAGE_PATH_INVALID';end if;
 update public.garage_vehicles set vehicle_name=trim(p_vehicle_name),db_number=trim(p_db_number),plate_number=trim(p_plate_number),chassis_number=trim(p_chassis_number),image_path=coalesce(nullif(trim(coalesce(p_image_path,'')),''),image_path),vehicle_category=p_vehicle_category,ownership_type=p_ownership_type,lessor_name=case when p_ownership_type='rented' then nullif(trim(coalesce(p_lessor_name,'')),'') end,rental_contract_no=case when p_ownership_type='rented' then nullif(trim(coalesce(p_rental_contract_no,'')),'') end,rental_start_date=case when p_ownership_type='rented' then p_rental_start_date end,rental_end_date=case when p_ownership_type='rented' then p_rental_end_date end,model_year=p_model_year,vehicle_color=nullif(trim(coalesce(p_vehicle_color,'')),''),specifications=nullif(trim(coalesce(p_specifications,'')),'') where id=p_vehicle_id and archived_at is null returning * into v_row;
 if not found then raise exception 'GARAGE_VEHICLE_NOT_FOUND';end if;return v_row;
exception when unique_violation then raise exception 'GARAGE_VEHICLE_IDENTIFIER_DUPLICATE';end$$;

drop function if exists public.garage_search_vehicles(text,smallint,text,integer,integer,boolean);
create or replace function public.garage_search_vehicles(p_search text default null,p_sector_id smallint default null,p_shift text default null,p_limit integer default 48,p_offset integer default 0,p_archived boolean default false)
returns table(id uuid,vehicle_name text,db_number text,plate_number text,chassis_number text,image_path text,vehicle_category text,ownership_type text,lessor_name text,rental_contract_no text,rental_start_date date,rental_end_date date,model_year smallint,vehicle_color text,specifications text,shift text,driver_name text,sector_id smallint,area_name text,parent_sector text,created_at timestamptz,updated_at timestamptz,archived_at timestamptz,archived_by uuid,archive_reason text,total_count bigint)
language plpgsql stable security definer set search_path=public,app as $$declare v_search text:=trim(coalesce(p_search,''));begin perform app.require_garage_actor();if p_shift is not null and p_shift not in('morning','evening','night') then raise exception 'GARAGE_SHIFT_INVALID';end if;if p_limit<1 or p_limit>100 or p_offset<0 then raise exception 'GARAGE_PAGINATION_INVALID';end if;return query select v.id,v.vehicle_name,v.db_number,v.plate_number,v.chassis_number,v.image_path,v.vehicle_category,v.ownership_type,v.lessor_name,v.rental_contract_no,v.rental_start_date,v.rental_end_date,v.model_year,v.vehicle_color,v.specifications,v.shift,v.driver_name,v.sector_id,s.name,s.parent_sector,v.created_at,v.updated_at,v.archived_at,v.archived_by,v.archive_reason,count(*) over() from public.garage_vehicles v join public.sectors s on s.id=v.sector_id where(case when p_archived then v.archived_at is not null else v.archived_at is null end) and(p_sector_id is null or v.sector_id=p_sector_id) and(p_shift is null or v.shift=p_shift) and(v_search='' or v.db_number ilike '%'||v_search||'%' or v.vehicle_name ilike '%'||v_search||'%' or v.driver_name ilike '%'||v_search||'%' or v.plate_number ilike '%'||v_search||'%' or v.chassis_number ilike '%'||v_search||'%' or v.lessor_name ilike '%'||v_search||'%') order by case when p_archived then v.archived_at else v.created_at end desc limit p_limit offset p_offset;end$$;

revoke all on function public.garage_add_vehicle(text,text,text,text,text,text,text,smallint,text,text,text,text,date,date,smallint,text,text),public.garage_update_vehicle(uuid,text,text,text,text,text,text,text,text,text,date,date,smallint,text,text),public.garage_search_vehicles(text,smallint,text,integer,integer,boolean) from public,anon;
grant execute on function public.garage_add_vehicle(text,text,text,text,text,text,text,smallint,text,text,text,text,date,date,smallint,text,text),public.garage_update_vehicle(uuid,text,text,text,text,text,text,text,text,text,date,date,smallint,text,text),public.garage_search_vehicles(text,smallint,text,integer,integer,boolean) to authenticated;
