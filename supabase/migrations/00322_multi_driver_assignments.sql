-- 00322 — 00377: سائقون متعددون للآلية (لكل شفت أساسي + احتياطي) من لحظة الإضافة، وسائقو خروج المحطة من السجل فقط
--  ① garage_vehicle_shift_assignments.driver_role (primary|backup): إسنادان نشطان كحد أقصى لكل شفت؛ garage_departures.driver_external_id/driver_role.
--  ② garage_add_vehicle(..., p_drivers jsonb): قائمة سائقين {shift, role, driver_employee_id|driver_external_id, sector_id?}.
--  ③ garage_set_vehicle_shift_assignment(..., p_driver_role, p_driver_external_id) + garage_end_vehicle_shift_assignment للاحتياطي.
--  ④ garage_record_shift_departure(..., p_driver_role): الانطلاق بالأساسي أو الاحتياطي؛ الانطلاقة تحمل هوية السائق (موظف/متعهد).
--  ⑤ إصلاح: مزامنة الإسناد الأول تنقل driver_external_id إلى إسناد الشفت (كانت تسقطه في 00375).
--  ⑥ station_record_exit: نوع «متعاقد» بالاسم الحر أُغلق — من السجل فقط.

alter table public.garage_vehicle_shift_assignments add column if not exists driver_role text not null default 'primary';
alter table public.garage_vehicle_shift_assignments drop constraint if exists gvsa_driver_role_check;
alter table public.garage_vehicle_shift_assignments add constraint gvsa_driver_role_check check (driver_role in ('primary','backup'));
drop index if exists public.one_active_vehicle_shift_assignment;
create unique index if not exists one_active_vehicle_shift_role_assignment on public.garage_vehicle_shift_assignments(vehicle_id, shift, driver_role) where ends_at is null;
alter table public.garage_departures add column if not exists driver_external_id uuid references public.station_external_drivers(id);
alter table public.garage_departures add column if not exists driver_role text not null default 'primary';
alter table public.garage_departures drop constraint if exists garage_departures_driver_role_check;
alter table public.garage_departures add constraint garage_departures_driver_role_check check (driver_role in ('primary','backup'));
-- ⑤ ترميم إسنادات الشفت لسائقي المتعهدين المضافة في 00375
update public.garage_vehicle_shift_assignments a set driver_external_id = g.driver_external_id
from public.garage_driver_assignments g
where a.driver_external_id is null and a.driver_employee_id is null and g.vehicle_id = a.vehicle_id and g.shift = a.shift and g.driver_external_id is not null and g.ends_at is null and a.ends_at is null and a.driver_name = g.driver_name;

create or replace function app.sync_initial_garage_shift_assignment() returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.garage_vehicle_shift_assignments set ends_at=new.starts_at, change_reason=coalesce(new.change_reason,'تحديث الإسناد الرئيسي')
   where vehicle_id=new.vehicle_id and shift=new.shift and ends_at is null and driver_role='primary'
     and (driver_name is distinct from new.driver_name or sector_id is distinct from new.sector_id or driver_employee_id is distinct from new.driver_employee_id or driver_external_id is distinct from new.driver_external_id);
  insert into public.garage_vehicle_shift_assignments(vehicle_id,shift,driver_role,driver_name,driver_employee_id,driver_external_id,sector_id,starts_at,change_reason,created_by)
  values(new.vehicle_id,new.shift,'primary',new.driver_name,new.driver_employee_id,new.driver_external_id,new.sector_id,new.starts_at,coalesce(new.change_reason,'إنشاء الإسناد الأول مع الآلية'),new.assigned_by)
  on conflict do nothing;
  return new;
end$$;

create or replace function app.fill_departure_driver() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.driver_employee_id is null and new.driver_external_id is null then
    select a.driver_employee_id, a.driver_external_id into new.driver_employee_id, new.driver_external_id
    from public.garage_vehicle_shift_assignments a
    where a.vehicle_id=new.vehicle_id and a.shift=new.shift and a.ends_at is null and a.driver_role=coalesce(new.driver_role,'primary');
  end if;
  if new.driver_employee_id is null and new.driver_external_id is null then
    select e.id into new.driver_employee_id from public.employees e where lower(trim(e.full_name))=lower(trim(new.driver_name)) and e.employment_status<>'terminated' order by e.hire_date desc limit 1;
  end if;
  return new;
end$$;

-- حارس الإسناد يشمل سائق المتعهد أيضاً، ويمنع الشخص نفسه أساسياً واحتياطياً في الشفت نفسه
create or replace function app.guard_driver_shift_assignment() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare other text;
begin
  if (new.driver_employee_id is null and new.driver_external_id is null) or new.ends_at is not null then return new; end if;
  select v.db_number into other
  from public.garage_vehicle_shift_assignments a join public.garage_vehicles v on v.id = a.vehicle_id
  where a.shift = new.shift and a.ends_at is null and a.vehicle_id <> new.vehicle_id and v.archived_at is null
    and ((new.driver_employee_id is not null and a.driver_employee_id = new.driver_employee_id) or (new.driver_external_id is not null and a.driver_external_id = new.driver_external_id))
  limit 1;
  if other is not null then raise exception 'FLEET_DRIVER_ALREADY_ASSIGNED' using detail = other; end if;
  if exists (select 1 from public.garage_vehicle_shift_assignments a
             where a.vehicle_id = new.vehicle_id and a.shift = new.shift and a.ends_at is null and a.driver_role <> new.driver_role and a.id <> new.id
               and ((new.driver_employee_id is not null and a.driver_employee_id = new.driver_employee_id) or (new.driver_external_id is not null and a.driver_external_id = new.driver_external_id)))
  then raise exception 'FLEET_DRIVER_DUPLICATE_IN_SHIFT'; end if;
  return new;
end$$;

-- سائق المتعهد لا يكون في الميدان بآلية أخرى
create or replace function app.assert_departure_external_driver(p_vehicle_id uuid, p_external_id uuid) returns void
language plpgsql stable security definer set search_path = public, app as $$
declare x public.station_external_drivers; other text;
begin
  if p_external_id is null then return; end if;
  select * into x from public.station_external_drivers where id = p_external_id;
  if found and not x.active then raise exception 'FLEET_EXTERNAL_DRIVER_NOT_FOUND' using detail = x.full_name; end if;
  select v.db_number into other from public.garage_departures d join public.garage_vehicles v on v.id = d.vehicle_id
  where d.driver_external_id = p_external_id and d.returned_at is null and d.vehicle_id <> p_vehicle_id limit 1;
  if other is not null then raise exception 'GARAGE_DRIVER_IN_FIELD' using detail = other; end if;
end$$;

-- ② إضافة آلية بسائقين متعددين
drop function if exists public.garage_add_vehicle(text,text,text,text,text,text,uuid,smallint,text,text,text,text,date,date,smallint,text,text,uuid);
create or replace function public.garage_add_vehicle(p_vehicle_name text,p_db_number text,p_plate_number text,p_chassis_number text,p_image_path text,p_shift text,p_driver_employee_id uuid,p_sector_id smallint,p_vehicle_category text default 'other',p_ownership_type text default 'owned',p_lessor_name text default null,p_rental_contract_no text default null,p_rental_start_date date default null,p_rental_end_date date default null,p_model_year smallint default null,p_vehicle_color text default null,p_specifications text default null,p_driver_external_id uuid default null,p_drivers jsonb default null)
returns public.garage_vehicles language plpgsql security definer set search_path=public,app as $$
declare u uuid:=app.require_fleet_master_actor();r public.garage_vehicles;e public.employees;x public.station_external_drivers;v_driver_name text;v_emp uuid;v_ext uuid;
  d jsonb;d_shift text;d_role text;d_emp uuid;d_ext uuid;d_sector smallint;d_name text;n_primary int:=0;
begin
  if not app.shift_code_valid(p_shift)then raise exception'GARAGE_SHIFT_INVALID';end if;
  perform app.require_garage_category(p_vehicle_category);
  if p_ownership_type not in('owned','rented')then raise exception'GARAGE_OWNERSHIP_TYPE_INVALID';end if;
  if p_ownership_type='rented'and length(trim(coalesce(p_lessor_name,'')))<2 then raise exception'GARAGE_LESSOR_REQUIRED';end if;
  if p_rental_end_date is not null and(p_rental_start_date is null or p_rental_end_date<p_rental_start_date)then raise exception'GARAGE_RENTAL_DATES_INVALID';end if;
  if not exists(select 1 from public.sectors where id=p_sector_id)then raise exception'GARAGE_AREA_INVALID';end if;
  if length(trim(coalesce(p_vehicle_name,'')))<2 or length(trim(coalesce(p_db_number,'')))<1 or length(trim(coalesce(p_plate_number,'')))<1 or length(trim(coalesce(p_chassis_number,'')))<3 then raise exception'GARAGE_VEHICLE_FIELDS_REQUIRED';end if;
  if p_image_path is null or p_image_path not like u::text||'/%'then raise exception'GARAGE_IMAGE_PATH_INVALID';end if;
  -- 00377: سائقون متعددون عند الإضافة: p_drivers = [{shift, role(primary|backup), driver_employee_id | driver_external_id, sector_id?}]
  --         بلا p_drivers ⇒ سائق واحد (p_driver_employee_id أو p_driver_external_id) على الشفت الرئيسي كما سبق.
  if p_drivers is null or jsonb_typeof(p_drivers) <> 'array' or jsonb_array_length(p_drivers) = 0 then
    p_drivers := jsonb_build_array(jsonb_build_object('shift', p_shift, 'role', 'primary', 'driver_employee_id', p_driver_employee_id, 'driver_external_id', p_driver_external_id, 'sector_id', p_sector_id));
  end if;
  if jsonb_array_length(p_drivers) > 12 then raise exception 'FLEET_DRIVERS_TOO_MANY'; end if;
  create temp table if not exists tmp_add_vehicle_drivers(shift text, role text, emp uuid, ext uuid, sector smallint, driver_name text) on commit drop;
  delete from tmp_add_vehicle_drivers where shift is not null;
  for d in select * from jsonb_array_elements(p_drivers) loop
    d_shift := coalesce(nullif(d->>'shift',''), p_shift); d_role := coalesce(nullif(d->>'role',''), 'primary');
    d_emp := nullif(d->>'driver_employee_id','')::uuid; d_ext := nullif(d->>'driver_external_id','')::uuid; d_sector := coalesce(nullif(d->>'sector_id','')::smallint, p_sector_id);
    if not app.shift_code_valid(d_shift) then raise exception 'GARAGE_SHIFT_INVALID'; end if;
    if d_role not in ('primary','backup') then raise exception 'FLEET_DRIVER_ROLE_INVALID'; end if;
    if not exists(select 1 from public.sectors where id=d_sector) then raise exception 'GARAGE_AREA_INVALID'; end if;
    if d_emp is not null and d_ext is not null then raise exception 'FLEET_DRIVER_ONE_ONLY'; end if;
    if d_ext is not null then
      select * into x from public.station_external_drivers where id=d_ext and active;
      if x.id is null then raise exception 'FLEET_EXTERNAL_DRIVER_NOT_FOUND'; end if;
      d_name := x.full_name;
    else
      e := app.require_fleet_driver(d_emp); d_name := e.full_name;
    end if;
    if exists(select 1 from tmp_add_vehicle_drivers t where t.shift=d_shift and t.role=d_role) then raise exception 'FLEET_DRIVER_SLOT_DUPLICATE' using detail = d_shift||'/'||d_role; end if;
    if exists(select 1 from tmp_add_vehicle_drivers t where (d_emp is not null and t.emp=d_emp and t.shift=d_shift) or (d_ext is not null and t.ext=d_ext and t.shift=d_shift)) then raise exception 'FLEET_DRIVER_DUPLICATE_IN_SHIFT'; end if;
    insert into tmp_add_vehicle_drivers values (d_shift, d_role, d_emp, d_ext, d_sector, d_name);
  end loop;
  -- لكل شفت فيه احتياطي يلزم أساسي؛ والشفت الرئيسي للآلية يلزمه أساسي (هو سائق الآلية الظاهر)
  if exists(select 1 from tmp_add_vehicle_drivers b where b.role='backup' and not exists(select 1 from tmp_add_vehicle_drivers p where p.shift=b.shift and p.role='primary')) then raise exception 'FLEET_BACKUP_NEEDS_PRIMARY'; end if;
  select t.emp, t.ext, t.driver_name into v_emp, v_ext, v_driver_name from tmp_add_vehicle_drivers t where t.shift=p_shift and t.role='primary';
  if v_driver_name is null then raise exception 'FLEET_PRIMARY_DRIVER_REQUIRED'; end if;
  insert into public.garage_vehicles(vehicle_name,db_number,plate_number,chassis_number,image_path,shift,driver_name,driver_employee_id,driver_external_id,sector_id,created_by,vehicle_category,ownership_type,lessor_name,rental_contract_no,rental_start_date,rental_end_date,model_year,vehicle_color,specifications)
  values(trim(p_vehicle_name),trim(p_db_number),trim(p_plate_number),trim(p_chassis_number),trim(p_image_path),p_shift,v_driver_name,v_emp,v_ext,p_sector_id,u,p_vehicle_category,p_ownership_type,case when p_ownership_type='rented'then nullif(trim(coalesce(p_lessor_name,'')),'')end,case when p_ownership_type='rented'then nullif(trim(coalesce(p_rental_contract_no,'')),'')end,case when p_ownership_type='rented'then p_rental_start_date end,case when p_ownership_type='rented'then p_rental_end_date end,p_model_year,nullif(trim(coalesce(p_vehicle_color,'')),''),nullif(trim(coalesce(p_specifications,'')),''))returning*into r;
  -- الإسناد الرئيسي (سجل تاريخي) ⇒ المحفّز ينشئ إسناد الشفت الأساسي للشفت الرئيسي
  insert into public.garage_driver_assignments(vehicle_id,driver_name,driver_employee_id,driver_external_id,shift,sector_id,assigned_by,change_reason)values(r.id,v_driver_name,v_emp,v_ext,r.shift,r.sector_id,u,'الإسناد الأول من غرفة العمليات');
  -- بقية السائقين (شفتات أخرى + احتياطيون) إسنادات شفت مباشرة
  insert into public.garage_vehicle_shift_assignments(vehicle_id,shift,driver_role,driver_name,driver_employee_id,driver_external_id,sector_id,change_reason,created_by)
  select r.id, t.shift, t.role, t.driver_name, t.emp, t.ext, t.sector, 'الإسناد الأول من غرفة العمليات', u
  from tmp_add_vehicle_drivers t where not (t.shift=p_shift and t.role='primary');
  return r;
exception when unique_violation then raise exception'GARAGE_VEHICLE_IDENTIFIER_DUPLICATE';
end$$;
revoke all on function public.garage_add_vehicle(text,text,text,text,text,text,uuid,smallint,text,text,text,text,date,date,smallint,text,text,uuid,jsonb) from public,anon;
grant execute on function public.garage_add_vehicle(text,text,text,text,text,text,uuid,smallint,text,text,text,text,date,date,smallint,text,text,uuid,jsonb) to authenticated;

-- الإسناد الرئيسي (يغيّر سائق الآلية وشفتها الرئيسي): موظف أو سائق متعهد
drop function if exists public.garage_assign_driver(uuid,uuid,text,smallint,text);
create function public.garage_assign_driver(p_vehicle_id uuid,p_driver_employee_id uuid,p_shift text,p_sector_id smallint,p_reason text default null,p_driver_external_id uuid default null)
returns public.garage_driver_assignments language plpgsql security definer set search_path=public,app as $$
declare u uuid:=app.require_fleet_master_actor();r public.garage_driver_assignments;e public.employees;x public.station_external_drivers;v_name text;v_emp uuid;
begin
  if not app.shift_code_valid(p_shift)or not exists(select 1 from public.sectors where id=p_sector_id)then raise exception'GARAGE_ASSIGNMENT_INVALID';end if;
  if p_driver_external_id is not null then
    if p_driver_employee_id is not null then raise exception 'FLEET_DRIVER_ONE_ONLY'; end if;
    select * into x from public.station_external_drivers where id=p_driver_external_id and active;
    if x.id is null then raise exception 'FLEET_EXTERNAL_DRIVER_NOT_FOUND'; end if;
    v_name:=x.full_name; v_emp:=null;
  else
    e:=app.require_fleet_driver(p_driver_employee_id); v_name:=e.full_name; v_emp:=e.id;
  end if;
  if exists(select 1 from public.garage_departures where vehicle_id=p_vehicle_id and returned_at is null)then raise exception'GARAGE_VEHICLE_IN_FIELD';end if;
  update public.garage_driver_assignments set ends_at=now(),change_reason=coalesce(nullif(trim(coalesce(p_reason,'')),''),change_reason)where vehicle_id=p_vehicle_id and ends_at is null;
  insert into public.garage_driver_assignments(vehicle_id,driver_name,driver_employee_id,driver_external_id,shift,sector_id,assigned_by,change_reason)values(p_vehicle_id,v_name,v_emp,p_driver_external_id,p_shift,p_sector_id,u,nullif(trim(coalesce(p_reason,'')),''))returning*into r;
  update public.garage_vehicles set driver_name=r.driver_name,driver_employee_id=r.driver_employee_id,driver_external_id=r.driver_external_id,shift=r.shift,sector_id=r.sector_id where id=p_vehicle_id and archived_at is null;
  if not found then raise exception'GARAGE_VEHICLE_NOT_FOUND';end if;
  return r;
end$$;
revoke all on function public.garage_assign_driver(uuid,uuid,text,smallint,text,uuid) from public,anon;
grant execute on function public.garage_assign_driver(uuid,uuid,text,smallint,text,uuid) to authenticated;

-- ③ إسناد شفت بدور (أساسي/احتياطي) وبسائق موظف أو متعهد
drop function if exists public.garage_set_vehicle_shift_assignment(uuid,text,uuid,smallint,text);
create or replace function public.garage_set_vehicle_shift_assignment(p_vehicle_id uuid,p_shift text,p_driver_employee_id uuid,p_sector_id smallint,p_reason text,p_driver_role text default 'primary',p_driver_external_id uuid default null)
returns public.garage_vehicle_shift_assignments language plpgsql security definer set search_path=public,app as $$
declare u uuid:=app.require_fleet_master_actor();r public.garage_vehicle_shift_assignments;e public.employees;x public.station_external_drivers;v_name text;v_emp uuid;
begin
  if not app.shift_code_valid(p_shift)or length(trim(coalesce(p_reason,'')))<3 then raise exception'GARAGE_SHIFT_ASSIGNMENT_INVALID';end if;
  if coalesce(p_driver_role,'primary') not in ('primary','backup') then raise exception 'FLEET_DRIVER_ROLE_INVALID'; end if;
  if p_driver_external_id is not null then
    if p_driver_employee_id is not null then raise exception 'FLEET_DRIVER_ONE_ONLY'; end if;
    select * into x from public.station_external_drivers where id=p_driver_external_id and active;
    if x.id is null then raise exception 'FLEET_EXTERNAL_DRIVER_NOT_FOUND'; end if;
    v_name:=x.full_name; v_emp:=null;
  else
    e:=app.require_fleet_driver(p_driver_employee_id); v_name:=e.full_name; v_emp:=e.id;
  end if;
  if not exists(select 1 from public.garage_vehicles where id=p_vehicle_id and archived_at is null)then raise exception'GARAGE_VEHICLE_NOT_FOUND';end if;
  if not exists(select 1 from public.sectors where id=p_sector_id)then raise exception'GARAGE_AREA_INVALID';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_vehicle_id::text||p_shift,0));
  if exists(select 1 from public.garage_departures where vehicle_id=p_vehicle_id and shift=p_shift and returned_at is null and coalesce(driver_role,'primary')=coalesce(p_driver_role,'primary'))then raise exception'GARAGE_SHIFT_IN_FIELD';end if;
  -- الاحتياطي يحتاج أساسياً نشطاً في الشفت نفسه، ولا يكون الشخص نفسه
  if coalesce(p_driver_role,'primary')='backup' and not exists(select 1 from public.garage_vehicle_shift_assignments a where a.vehicle_id=p_vehicle_id and a.shift=p_shift and a.ends_at is null and a.driver_role='primary') then raise exception 'FLEET_BACKUP_NEEDS_PRIMARY'; end if;
  if exists(select 1 from public.garage_vehicle_shift_assignments a where a.vehicle_id=p_vehicle_id and a.shift=p_shift and a.ends_at is null and a.driver_role<>coalesce(p_driver_role,'primary') and ((v_emp is not null and a.driver_employee_id=v_emp) or (p_driver_external_id is not null and a.driver_external_id=p_driver_external_id))) then raise exception 'FLEET_DRIVER_DUPLICATE_IN_SHIFT'; end if;
  update public.garage_vehicle_shift_assignments set ends_at=now(),change_reason=trim(p_reason)where vehicle_id=p_vehicle_id and shift=p_shift and ends_at is null and driver_role=coalesce(p_driver_role,'primary');
  insert into public.garage_vehicle_shift_assignments(vehicle_id,shift,driver_role,driver_name,driver_employee_id,driver_external_id,sector_id,change_reason,created_by)values(p_vehicle_id,p_shift,coalesce(p_driver_role,'primary'),v_name,v_emp,p_driver_external_id,p_sector_id,trim(p_reason),u)returning*into r;
  -- الشفت الرئيسي للآلية يتبع إسناده فقط (لا يغيّر قاطع الآلية الثابت إن كان الشفت مختلفاً)
  if r.driver_role='primary' then update public.garage_vehicles set driver_name=r.driver_name,driver_employee_id=r.driver_employee_id,driver_external_id=r.driver_external_id,sector_id=r.sector_id where id=p_vehicle_id and shift=p_shift; end if;
  return r;
end$$;
revoke all on function public.garage_set_vehicle_shift_assignment(uuid,text,uuid,smallint,text,text,uuid) from public,anon;
grant execute on function public.garage_set_vehicle_shift_assignment(uuid,text,uuid,smallint,text,text,uuid) to authenticated;

-- إنهاء إسناد احتياطي (الأساسي يُستبدل ولا يُزال)
create or replace function public.garage_end_vehicle_shift_assignment(p_assignment_id uuid, p_reason text)
returns public.garage_vehicle_shift_assignments language plpgsql security definer set search_path=public,app as $$
declare u uuid:=app.require_fleet_master_actor(); r public.garage_vehicle_shift_assignments;
begin
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'GARAGE_SHIFT_ASSIGNMENT_INVALID'; end if;
  select * into r from public.garage_vehicle_shift_assignments where id=p_assignment_id and ends_at is null for update;
  if r.id is null then raise exception 'GARAGE_SHIFT_ASSIGNMENT_NOT_FOUND'; end if;
  if r.driver_role<>'backup' then raise exception 'FLEET_PRIMARY_CANNOT_BE_REMOVED'; end if;
  if exists(select 1 from public.garage_departures d where d.vehicle_id=r.vehicle_id and d.shift=r.shift and d.returned_at is null and d.driver_role='backup') then raise exception 'GARAGE_SHIFT_IN_FIELD'; end if;
  update public.garage_vehicle_shift_assignments set ends_at=now(), change_reason=trim(p_reason) where id=r.id returning * into r;
  perform u; return r;
end$$;
revoke all on function public.garage_end_vehicle_shift_assignment(uuid,text) from public,anon;
grant execute on function public.garage_end_vehicle_shift_assignment(uuid,text) to authenticated;

-- قائمة إسنادات الشفت مع الدور وسائق المتعهد
drop function if exists public.garage_vehicle_shift_assignments_list(uuid);
create function public.garage_vehicle_shift_assignments_list(p_vehicle_id uuid)
returns table(id uuid,vehicle_id uuid,shift text,driver_name text,sector_id smallint,area_name text,parent_sector text,starts_at timestamptz,ends_at timestamptz,change_reason text,driver_employee_id uuid,driver_employee_number text,driver_role text,driver_external_id uuid,contractor_name text)
language plpgsql stable security definer set search_path=public,app as $$
begin
  if auth.uid() is null or not app.has_role(array['central_garage_officer','ops_room','super_admin']) then raise exception 'GARAGE_FORBIDDEN'; end if;
  if not app.garage_vehicle_allowed(p_vehicle_id) then raise exception 'GARAGE_VEHICLE_SCOPE_FORBIDDEN'; end if;
  return query select a.id,a.vehicle_id,a.shift,a.driver_name,a.sector_id,s.name,s.parent_sector,a.starts_at,a.ends_at,a.change_reason,a.driver_employee_id,e.employee_number,a.driver_role,a.driver_external_id,x.contractor_name
  from public.garage_vehicle_shift_assignments a join public.sectors s on s.id=a.sector_id left join public.employees e on e.id=a.driver_employee_id left join public.station_external_drivers x on x.id=a.driver_external_id
  where a.vehicle_id=p_vehicle_id order by (a.ends_at is null) desc, a.starts_at desc;
end$$;
revoke all on function public.garage_vehicle_shift_assignments_list(uuid) from public,anon;
grant execute on function public.garage_vehicle_shift_assignments_list(uuid) to authenticated;

-- ④ الانطلاق بالأساسي أو الاحتياطي
drop function if exists public.garage_record_shift_departure(uuid,text,text,uuid);
create or replace function public.garage_record_shift_departure(p_vehicle_id uuid, p_shift text, p_notes text default null, p_manager_id uuid default null, p_driver_role text default 'primary')
returns public.garage_departures
language plpgsql security definer set search_path=public,app as $$
declare
  actor_id uuid := app.require_garage_actor();
  vehicle_row public.garage_vehicles;
  assignment_row public.garage_vehicle_shift_assignments;
  departure_row public.garage_departures;
  picked_id uuid;
  picked_label text;
  mode text;
begin
  if not app.shift_code_valid(p_shift) then raise exception 'GARAGE_SHIFT_INVALID'; end if;
  if coalesce(p_driver_role,'primary') not in ('primary','backup') then raise exception 'FLEET_DRIVER_ROLE_INVALID'; end if;
  if length(coalesce(p_notes, '')) > 500 then raise exception 'GARAGE_DEPARTURE_NOTES_TOO_LONG'; end if;
  select * into vehicle_row from public.garage_vehicles where id = p_vehicle_id and archived_at is null for update;
  if not found then raise exception 'GARAGE_VEHICLE_NOT_FOUND'; end if;
  if not app.garage_vehicle_allowed(p_vehicle_id) then raise exception 'GARAGE_VEHICLE_SCOPE_FORBIDDEN'; end if;
  if exists (select 1 from public.vehicle_maintenance_cases mc where mc.vehicle_id = vehicle_row.id and mc.completed_at is null) then raise exception 'GARAGE_VEHICLE_IN_MAINTENANCE'; end if;
  if exists (select 1 from public.garage_departures gd where gd.vehicle_id = vehicle_row.id and gd.returned_at is null) then raise exception 'GARAGE_DEPARTURE_ALREADY_OPEN'; end if;
  select * into assignment_row from public.garage_vehicle_shift_assignments a
   where a.vehicle_id = vehicle_row.id and a.shift = p_shift and a.ends_at is null and a.driver_role = coalesce(p_driver_role,'primary');
  if not found then
    if coalesce(p_driver_role,'primary') = 'backup' then raise exception 'GARAGE_BACKUP_DRIVER_NOT_FOUND'; end if;
    raise exception 'GARAGE_SHIFT_ASSIGNMENT_NOT_FOUND';
  end if;
  -- 00252: السائق صالح للانطلاق (غير مُنهى وليس في الميدان بآلية أخرى)
  perform app.assert_departure_driver(vehicle_row.id, assignment_row.driver_employee_id);
  perform app.assert_departure_external_driver(vehicle_row.id, assignment_row.driver_external_id);

  if p_manager_id is not null then
    -- يدوي: المؤهل فقط (دور + تغطية مباشرة أو ضمن القاطع الأب)
    if exists (
      select 1 from public.manager_profiles mp
      where mp.user_id = p_manager_id
        and exists (select 1 from public.user_roles ur where ur.user_id = mp.user_id and ur.role = 'department_manager')
        and (assignment_row.sector_id = any(mp.sectors)
             or exists (select 1 from public.sectors sx
                         where sx.id = any(mp.sectors)
                           and sx.parent_sector = (select s.parent_sector from public.sectors s where s.id = assignment_row.sector_id)))
    ) then
      picked_id := p_manager_id;
      mode := 'manual';
    else
      raise exception 'GARAGE_RECIPIENT_NOT_ELIGIBLE';
    end if;
  else
    -- تلقائي حتمي
    select r.user_id into picked_id
    from app.resolve_sector_shift_manager(assignment_row.sector_id, p_shift) r;
    if picked_id is null then raise exception 'GARAGE_SECTOR_MANAGER_NOT_CONFIGURED'; end if;
    mode := 'auto';
  end if;

  select coalesce(nullif(e.full_name, ''), au.email, picked_id::text) into picked_label
  from auth.users au left join public.employees e on e.user_id = au.id
  where au.id = picked_id;

  insert into public.garage_departures(vehicle_id, driver_name, shift, sector_id, departed_by, notes,
                                       recipient_manager_id, recipient_manager_name, assignment_mode, driver_employee_id, driver_external_id, driver_role)
  values (vehicle_row.id, assignment_row.driver_name, p_shift, assignment_row.sector_id, actor_id,
          nullif(btrim(coalesce(p_notes, '')), ''), picked_id, picked_label, mode, assignment_row.driver_employee_id, assignment_row.driver_external_id, coalesce(p_driver_role,'primary'))
  returning * into departure_row;

  insert into public.notifications(user_id, title, body, type, link, category, entity_type, entity_id, dedupe_key)
  values (picked_id, 'آلية في الطريق إلى موقع العمل',
          format('%s · DB %s انطلقت إلى منطقتك في الشفت %s', vehicle_row.vehicle_name, vehicle_row.db_number, p_shift),
          'info', '/manager/vehicle-trips', 'departure', 'garage_departure', departure_row.id,
          'departure:auto-manager:' || departure_row.id::text)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  return departure_row;
exception when unique_violation then raise exception 'GARAGE_DEPARTURE_ALREADY_OPEN';
end$$;
revoke all on function public.garage_record_shift_departure(uuid,text,text,uuid,text) from public,anon;
grant execute on function public.garage_record_shift_departure(uuid,text,text,uuid,text) to authenticated;

-- ⑥ خروج المحطة: لا اسم حر
create or replace function public.station_record_exit(
  p_vehicle_id uuid, p_driver_kind text, p_destination_id uuid,
  p_driver_employee_id uuid default null, p_external_driver_id uuid default null, p_driver_name text default null,
  p_weight_tons numeric default null, p_log_date date default null)
returns jsonb language plpgsql security definer set search_path=public,app as $$
declare
  u uuid := auth.uid(); v public.garage_vehicles; c public.vehicle_categories; d public.station_destinations;
  e public.employees; x public.station_external_drivers; dev uuid; drv text; trk text; sh text; rid uuid; tbl text; ldate date;
begin
  if u is null or not app.has_role(array['transfer_station','super_admin']) then raise exception 'STATION_FORBIDDEN'; end if;
  select * into v from public.garage_vehicles where id = p_vehicle_id and archived_at is null;
  if v.id is null then raise exception 'STATION_VEHICLE_NOT_FOUND'; end if;
  if not v.is_station_vehicle then raise exception 'STATION_VEHICLE_NOT_STATION'; end if;
  select * into c from public.vehicle_categories where code = v.vehicle_category;
  if not coalesce(c.station_outbound, false) then raise exception 'STATION_VEHICLE_CATEGORY_NOT_OUTBOUND'; end if;
  select * into d from public.station_destinations where id = p_destination_id and active;
  if d.id is null then raise exception 'STATION_DESTINATION_NOT_FOUND'; end if;
  if p_driver_kind = 'employee' then
    e := app.require_fleet_driver(p_driver_employee_id); drv := e.full_name;
  elsif p_driver_kind = 'external' then
    select * into x from public.station_external_drivers where id = p_external_driver_id;
    if x.id is null then raise exception 'STATION_DRIVER_NOT_FOUND'; end if;
    if not x.active then raise exception 'STATION_DRIVER_INACTIVE'; end if;
    drv := x.full_name;
  elsif p_driver_kind = 'contracted' then
    -- 00377: لا اسم حر — سائق الآلية المؤجرة يُختار من سجل سائقي المتعهدين (external)
    raise exception 'STATION_DRIVER_KIND_RETIRED';
  else
    raise exception 'STATION_DRIVER_KIND_INVALID';
  end if;
  if c.code = 'container_carrier' and (p_weight_tons is null or p_weight_tons <= 0) then raise exception 'STATION_WEIGHT_REQUIRED'; end if;
  if p_weight_tons is not null and (p_weight_tons <= 0 or p_weight_tons >= 1000) then raise exception 'STATION_WEIGHT_INVALID'; end if;
  select b.device_id into dev from public.gps_vehicle_bindings b where b.garage_vehicle_id = v.id;
  trk := case when dev is null then 'none' else 'gps' end;
  select w.shift_name into sh from app.live_shift_window(u, now()) w;
  ldate := coalesce(p_log_date, (now() at time zone 'Asia/Baghdad')::date);
  tbl := case when c.code = 'container_carrier' then 'ts_carrier_records' else 'ts_saksat_records' end;
  execute format($i$
    insert into public.%I (driver_name, vehicle_type, weight_tons, exit_time, log_date, created_by,
      vehicle_id, vehicle_category, driver_kind, driver_employee_id, external_driver_id, destination_id, tracking, device_id, shift_name, exited_by)
    values ($1, $2, $3, now(), $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $5) returning id $i$, tbl)
    into rid using drv, c.label, p_weight_tons, ldate, u, v.id, c.code, p_driver_kind,
      case when p_driver_kind = 'employee' then e.id end, case when p_driver_kind = 'external' then x.id end, d.id, trk, dev, sh;
  if trk = 'none' then
    insert into public.notifications (user_id, title, body, type, link)
    select ur.user_id, 'خروج آلية بلا تتبع من المحطة',
      format('%s DB %s غادرت المحطة إلى %s بقيادة %s دون جهاز GPS مرتبط — الوصول لن يُسجَّل آلياً', c.label, v.db_number, d.name, drv),
      'warning', '/ops-room/station-outbound'
    from public.user_roles ur where ur.role = 'ops_room';
  end if;
  return jsonb_build_object('id', rid, 'table', tbl, 'tracking', trk, 'driver_name', drv, 'shift_name', sh, 'destination', d.name, 'category', c.label);
end $$;
revoke all on function public.station_record_exit(uuid,text,uuid,uuid,uuid,text,numeric,date) from public,anon;
grant execute on function public.station_record_exit(uuid,text,uuid,uuid,uuid,text,numeric,date) to authenticated;

-- قائمة آليات المحطة تحمل هوية السائق الحالي (موظف أو متعهد) كي يُقترح تلقائياً في نموذج الخروج
drop function if exists public.station_fleet_list();
create function public.station_fleet_list()
returns table(id uuid, vehicle_name text, db_number text, plate_number text, vehicle_category text, category_label text,
              station_outbound boolean, driver_employee_id uuid, driver_name text, has_gps boolean, device_id uuid, ownership_type text, driver_external_id uuid)
language plpgsql stable security definer set search_path=public,app as $$
begin
  if auth.uid() is null or not app.has_role(array['transfer_station','ops_room','super_admin']) then raise exception 'STATION_FORBIDDEN'; end if;
  return query
  select v.id, v.vehicle_name, v.db_number, v.plate_number, v.vehicle_category, c.label, c.station_outbound,
         v.driver_employee_id, v.driver_name, (b.device_id is not null), b.device_id, v.ownership_type, v.driver_external_id
  from public.garage_vehicles v
  join public.vehicle_categories c on c.code = v.vehicle_category
  left join public.gps_vehicle_bindings b on b.garage_vehicle_id = v.id
  where v.is_station_vehicle and v.archived_at is null
  order by c.sort, v.db_number;
end $$;
revoke all on function public.station_fleet_list() from public, anon;
grant execute on function public.station_fleet_list() to authenticated;

-- ⑦ إعادة تثبيت حارس الكتابة (00291) وإنفاذ الصلاحيات (00296) على الدالتين المعاد تعريفهما.
--    إصلاح جذري: 00320 أعادت تعريف garage_record_shift_departure فوق غلافها فسقط الحارس — يُعاد هنا، ويُفحص في write-guards-test.
drop function if exists app.garage_record_shift_departure__raw(uuid,text,text,uuid);
drop function if exists app.station_record_exit__raw(uuid,text,uuid,uuid,uuid,text,numeric,date);
do $$ begin
  perform app.wrap_write_guard('garage_record_shift_departure');
  perform app.wrap_write_guard('station_record_exit');
end $$;
do $$ declare bad text; begin
  select string_agg(fn, ', ') into bad from app.write_guard_audit() where not guarded;
  if bad is not null then raise exception 'WRITE_GUARD_MISSING: %', bad; end if;
end $$;
