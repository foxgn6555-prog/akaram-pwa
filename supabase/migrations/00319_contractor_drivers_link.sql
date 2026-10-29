-- 00375 — سائقو المتعهدين مرتبطون بحسابات المتعهدين في النظام + سائق متعهد عند إضافة الآلية
--  ① contractor_options(): حسابات المتعهدين النشطة (بوابة المتعهدين) لغرفة العمليات/الكراج/المحطة.
--  ② station_external_drivers.contractor_user_id → contractor_profiles؛ station_external_driver_save_v2 تأخذ الحساب لا نصاً حراً
--     (contractor_name يُملأ من اسم الحساب للتوافق والعرض). الصلاحية: غرفة العمليات + ضابط الكراج.
--  ③ garage_vehicles/garage_driver_assignments/garage_vehicle_shift_assignments.driver_external_id؛ garage_add_vehicle تقبل
--     p_driver_external_id بدل الموظف (أحدهما فقط).

alter table public.station_external_drivers add column if not exists contractor_user_id uuid references public.contractor_profiles(user_id);
create index if not exists station_external_drivers_contractor_idx on public.station_external_drivers(contractor_user_id) where active;
alter table public.garage_vehicles add column if not exists driver_external_id uuid references public.station_external_drivers(id);
alter table public.garage_driver_assignments add column if not exists driver_external_id uuid references public.station_external_drivers(id);
alter table public.garage_vehicle_shift_assignments add column if not exists driver_external_id uuid references public.station_external_drivers(id);
alter table public.garage_vehicles drop constraint if exists garage_vehicles_one_driver_ref;
alter table public.garage_vehicles add constraint garage_vehicles_one_driver_ref check (driver_employee_id is null or driver_external_id is null);

-- ① حسابات المتعهدين
create or replace function public.contractor_options(p_include_inactive boolean default false)
returns table(user_id uuid, full_name text, sector_id smallint, area_name text, parent_sector text, is_active boolean, drivers_count integer)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if auth.uid() is null or not app.has_role(array['ops_room','central_garage_officer','transfer_station','deputy_director','it_admin','super_admin']) then
    raise exception 'CONTRACTOR_OPTIONS_FORBIDDEN';
  end if;
  return query
  select p.user_id, app.manager_display_name(p.user_id), p.sector_id, s.name, s.parent_sector, p.is_active,
         (select count(*)::integer from public.station_external_drivers x where x.contractor_user_id = p.user_id and x.active)
  from public.contractor_profiles p left join public.sectors s on s.id = p.sector_id
  where p.is_active or p_include_inactive
  order by p.is_active desc, 2;
end $$;
revoke all on function public.contractor_options(boolean) from public, anon;
grant execute on function public.contractor_options(boolean) to authenticated;

-- ② حفظ سائق متعهد مرتبط بحساب
create or replace function public.station_external_driver_save_v2(p_id uuid, p_full_name text, p_contractor_user_id uuid, p_phone text default null, p_license_no text default null, p_license_image_path text default null, p_notes text default null, p_active boolean default true)
returns public.station_external_drivers language plpgsql security definer set search_path=public,app as $$
declare u uuid := auth.uid(); d public.station_external_drivers; old_d public.station_external_drivers; c_name text;
begin
  if u is null or not app.has_role(array['ops_room','central_garage_officer','super_admin']) then raise exception 'OPS_ROOM_FORBIDDEN'; end if;
  if length(trim(coalesce(p_full_name,''))) not between 2 and 120 then raise exception 'STATION_DRIVER_NAME_INVALID'; end if;
  if p_contractor_user_id is null or not exists (select 1 from public.contractor_profiles p where p.user_id = p_contractor_user_id) then raise exception 'STATION_DRIVER_CONTRACTOR_REQUIRED'; end if;
  if p_phone is not null and nullif(trim(p_phone),'') is not null and trim(p_phone) !~ '^[0-9+]{7,20}$' then raise exception 'STATION_DRIVER_PHONE_INVALID'; end if;
  c_name := coalesce(nullif(trim(app.manager_display_name(p_contractor_user_id)), ''), 'متعهد');
  if p_id is null then
    insert into public.station_external_drivers (full_name, contractor_name, contractor_user_id, phone, license_no, license_image_path, notes, active, updated_by)
    values (trim(p_full_name), c_name, p_contractor_user_id, nullif(trim(coalesce(p_phone,'')),''), nullif(trim(coalesce(p_license_no,'')),''), nullif(trim(coalesce(p_license_image_path,'')),''), nullif(trim(coalesce(p_notes,'')),''), coalesce(p_active,true), u)
    returning * into d;
  else
    select * into old_d from public.station_external_drivers where id = p_id;
    if old_d.id is null then raise exception 'STATION_DRIVER_NOT_FOUND'; end if;
    update public.station_external_drivers set full_name = trim(p_full_name), contractor_name = c_name, contractor_user_id = p_contractor_user_id, phone = nullif(trim(coalesce(p_phone,'')),''),
      license_no = nullif(trim(coalesce(p_license_no,'')),''), license_image_path = nullif(trim(coalesce(p_license_image_path,'')),''), notes = nullif(trim(coalesce(p_notes,'')),''),
      active = coalesce(p_active,true), updated_at = now(), updated_by = u where id = p_id returning * into d;
    -- اسم السائق يتبع الآليات المسندة إليه
    update public.garage_vehicles set driver_name = d.full_name where driver_external_id = d.id and archived_at is null and driver_name is distinct from d.full_name;
  end if;
  insert into public.audit_logs (actor_id, table_name, record_id, operation, old_row, new_row)
  values (u, 'station_external_drivers', d.id, case when old_d.id is null then 'INSERT' else 'UPDATE' end, to_jsonb(old_d), to_jsonb(d));
  return d;
end $$;
revoke all on function public.station_external_driver_save_v2(uuid,text,uuid,text,text,text,text,boolean) from public, anon;
grant execute on function public.station_external_driver_save_v2(uuid,text,uuid,text,text,text,text,boolean) to authenticated;

-- الدالة القديمة (نص حر) تُغلق: لا متعهد خارج النظام
create or replace function public.station_external_driver_save(p_id uuid, p_full_name text, p_contractor_name text, p_phone text default null, p_license_no text default null, p_license_image_path text default null, p_notes text default null, p_active boolean default true)
returns public.station_external_drivers language plpgsql security definer set search_path=public,app as $$
begin
  raise exception 'STATION_DRIVER_CONTRACTOR_ACCOUNT_REQUIRED';
end $$;

-- قائمة سائقي المتعهدين (للكراج والعمليات والمحطة) مع اسم الحساب
create or replace function public.station_external_drivers_list(p_include_inactive boolean default false)
returns table(id uuid, full_name text, phone text, contractor_user_id uuid, contractor_name text, license_no text, notes text, active boolean, vehicles text[])
language plpgsql stable security definer set search_path=public,app as $$
begin
  if auth.uid() is null or not app.has_role(array['ops_room','central_garage_officer','transfer_station','deputy_director','it_admin','super_admin']) then raise exception 'STATION_FORBIDDEN'; end if;
  return query
  select x.id, x.full_name, x.phone, x.contractor_user_id,
         coalesce(case when x.contractor_user_id is not null then app.manager_display_name(x.contractor_user_id) end, x.contractor_name),
         x.license_no, x.notes, x.active,
         coalesce((select array_agg(v.db_number order by v.db_number) from public.garage_vehicles v where v.driver_external_id = x.id and v.archived_at is null), '{}')
  from public.station_external_drivers x
  where x.active or p_include_inactive
  order by x.active desc, x.full_name;
end $$;
revoke all on function public.station_external_drivers_list(boolean) from public, anon;
grant execute on function public.station_external_drivers_list(boolean) to authenticated;

-- ③ إضافة آلية بسائق موظف أو سائق متعهد
drop function if exists public.garage_add_vehicle(text,text,text,text,text,text,uuid,smallint,text,text,text,text,date,date,smallint,text,text);
create or replace function public.garage_add_vehicle(p_vehicle_name text,p_db_number text,p_plate_number text,p_chassis_number text,p_image_path text,p_shift text,p_driver_employee_id uuid,p_sector_id smallint,p_vehicle_category text default 'other',p_ownership_type text default 'owned',p_lessor_name text default null,p_rental_contract_no text default null,p_rental_start_date date default null,p_rental_end_date date default null,p_model_year smallint default null,p_vehicle_color text default null,p_specifications text default null,p_driver_external_id uuid default null)
returns public.garage_vehicles language plpgsql security definer set search_path=public,app as $$
declare u uuid:=app.require_fleet_master_actor();r public.garage_vehicles;e public.employees;x public.station_external_drivers;v_driver_name text;v_emp uuid;
begin
  if p_shift not in('morning','evening','night')then raise exception'GARAGE_SHIFT_INVALID';end if;
  perform app.require_garage_category(p_vehicle_category);
  if p_ownership_type not in('owned','rented')then raise exception'GARAGE_OWNERSHIP_TYPE_INVALID';end if;
  if p_ownership_type='rented'and length(trim(coalesce(p_lessor_name,'')))<2 then raise exception'GARAGE_LESSOR_REQUIRED';end if;
  if p_rental_end_date is not null and(p_rental_start_date is null or p_rental_end_date<p_rental_start_date)then raise exception'GARAGE_RENTAL_DATES_INVALID';end if;
  if not exists(select 1 from public.sectors where id=p_sector_id)then raise exception'GARAGE_AREA_INVALID';end if;
  if length(trim(coalesce(p_vehicle_name,'')))<2 or length(trim(coalesce(p_db_number,'')))<1 or length(trim(coalesce(p_plate_number,'')))<1 or length(trim(coalesce(p_chassis_number,'')))<3 then raise exception'GARAGE_VEHICLE_FIELDS_REQUIRED';end if;
  if p_image_path is null or p_image_path not like u::text||'/%'then raise exception'GARAGE_IMAGE_PATH_INVALID';end if;
  -- 00375: السائق إمّا موظف HR أو سائق متعهد (من سجل سائقي المتعهدين المرتبط بحساب متعهد في النظام)
  if p_driver_external_id is not null then
    if p_driver_employee_id is not null then raise exception 'FLEET_DRIVER_ONE_ONLY'; end if;
    select * into x from public.station_external_drivers where id=p_driver_external_id and active;
    if x.id is null then raise exception 'FLEET_EXTERNAL_DRIVER_NOT_FOUND'; end if;
    v_driver_name:=x.full_name; v_emp:=null;
  else
    e:=app.require_fleet_driver(p_driver_employee_id);
    v_driver_name:=e.full_name; v_emp:=e.id;
  end if;
  insert into public.garage_vehicles(vehicle_name,db_number,plate_number,chassis_number,image_path,shift,driver_name,driver_employee_id,driver_external_id,sector_id,created_by,vehicle_category,ownership_type,lessor_name,rental_contract_no,rental_start_date,rental_end_date,model_year,vehicle_color,specifications)
  values(trim(p_vehicle_name),trim(p_db_number),trim(p_plate_number),trim(p_chassis_number),trim(p_image_path),p_shift,v_driver_name,v_emp,p_driver_external_id,p_sector_id,u,p_vehicle_category,p_ownership_type,case when p_ownership_type='rented'then nullif(trim(coalesce(p_lessor_name,'')),'')end,case when p_ownership_type='rented'then nullif(trim(coalesce(p_rental_contract_no,'')),'')end,case when p_ownership_type='rented'then p_rental_start_date end,case when p_ownership_type='rented'then p_rental_end_date end,p_model_year,nullif(trim(coalesce(p_vehicle_color,'')),''),nullif(trim(coalesce(p_specifications,'')),''))returning*into r;
  insert into public.garage_driver_assignments(vehicle_id,driver_name,driver_employee_id,driver_external_id,shift,sector_id,assigned_by,change_reason)values(r.id,v_driver_name,v_emp,p_driver_external_id,r.shift,r.sector_id,u,'الإسناد الأول من غرفة العمليات');
  return r;
exception when unique_violation then raise exception'GARAGE_VEHICLE_IDENTIFIER_DUPLICATE';
end$$;
revoke all on function public.garage_add_vehicle(text,text,text,text,text,text,uuid,smallint,text,text,text,text,date,date,smallint,text,text,uuid) from public,anon;
grant execute on function public.garage_add_vehicle(text,text,text,text,text,text,uuid,smallint,text,text,text,text,date,date,smallint,text,text,uuid) to authenticated;
