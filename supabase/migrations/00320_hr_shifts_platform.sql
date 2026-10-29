-- 00320 — شفتات الموارد البشرية في كل المنصة (الجزء الأول: الكراج/الآليات/الإسنادات/الانطلاقات/Excel/المتعهدون/مسؤولو الأقسام)
--  ① hr_shifts.code (رمز ثابت) + sort_order؛ الشفتات الثلاث القديمة تُربط بالرموز morning/evening/night فلا تُفقد بيانات.
--  ② shift_options() لكل مستخدم مسجَّل: قائمة الشفتات (تتحدث فور إضافة شفت في HR).
--  ③ إزالة قيود الشفت الثابت من الجداول واستبدالها بمحفّز يتحقق من hr_shifts؛ منع حذف شفت مستخدم.
--  ④ دوال الكراج/الاستيراد تتحقق عبر app.shift_code_valid/app.shift_resolve/app.shift_label.

-- ① الرمز
alter table public.hr_shifts add column if not exists code text;
alter table public.hr_shifts add column if not exists sort_order smallint not null default 100;
update public.hr_shifts set code = 'morning', sort_order = 1 where code is null and name in ('صباحي', 'الصباحي', 'صباحية');
update public.hr_shifts set code = 'evening', sort_order = 2 where code is null and name in ('مسائي', 'المسائي', 'مسائية');
update public.hr_shifts set code = 'night',   sort_order = 3 where code is null and name in ('ليلي', 'الليلي', 'ليلية');
update public.hr_shifts set code = 'shift_' || substr(md5(id::text), 1, 8) where code is null;
-- الرموز الثلاثة مستخدمة في بيانات المنصة: إن لم توجد تُنشأ (بلا فقدان بيانات)
insert into public.hr_shifts (name, start_time, end_time, grace_minutes, code, sort_order)
select v.name, v.st::time, v.et::time, 10, v.code, v.so
from (values ('صباحي','08:00','16:00','morning',1), ('مسائي','16:00','00:00','evening',2), ('ليلي','00:00','08:00','night',3)) v(name, st, et, code, so)
where not exists (select 1 from public.hr_shifts h where h.code = v.code)
on conflict (name) do update set code = excluded.code where public.hr_shifts.code is null;
alter table public.hr_shifts alter column code set not null;
create unique index if not exists hr_shifts_code_uidx on public.hr_shifts (code);
alter table public.hr_shifts drop constraint if exists hr_shifts_code_format;
alter table public.hr_shifts add constraint hr_shifts_code_format check (code ~ '^[a-z][a-z0-9_]{1,40}$');

create or replace function app.hr_shift_code_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.code is null or new.code = '' then new.code := 'shift_' || substr(md5(new.id::text || clock_timestamp()::text), 1, 8); end if;
    new.code := lower(new.code);
  elsif new.code is distinct from old.code then
    raise exception 'HR_SHIFT_CODE_IMMUTABLE';
  end if;
  return new;
end$$;
drop trigger if exists trg_hr_shift_code_guard on public.hr_shifts;
create trigger trg_hr_shift_code_guard before insert or update on public.hr_shifts for each row execute function app.hr_shift_code_guard();

-- دوال التحقق والتسمية
create or replace function app.shift_code_valid(p_code text, p_active_only boolean default true) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from public.hr_shifts s where s.code = p_code and (not p_active_only or s.is_active))
$$;
create or replace function app.shift_label(p_code text) returns text
language sql stable security definer set search_path = public, app as $$
  select coalesce((select s.name from public.hr_shifts s where s.code = p_code), p_code, '—')
$$;
-- حلّ نص (رمز أو اسم عربي/إنجليزي) إلى رمز شفت نشط — للاستيراد من Excel؛ الفارغ = الشفت الأول
create or replace function app.shift_resolve(p_text text) returns text
language plpgsql stable security definer set search_path = public, app as $$
declare t text := app.fleet_norm_text(coalesce(p_text, '')); c text;
begin
  if t = '' then
    select s.code into c from public.hr_shifts s where s.is_active order by s.sort_order, s.start_time limit 1; return c;
  end if;
  select s.code into c from public.hr_shifts s where s.is_active and (lower(s.code) = lower(t) or app.fleet_norm_text(s.name) = t) limit 1;
  if c is not null then return c; end if;
  -- مرادفات شائعة للشفتات الأساسية
  c := case when t in ('morning','صباحي','صباحيه','الصباحيه','الصباحي','صباح') then 'morning'
            when t in ('evening','مسائي','مسائيه','المسائيه','المسائي','مساء','عصر') then 'evening'
            when t in ('night','ليلي','ليليه','الليليه','الليلي','ليل') then 'night' end;
  if c is not null and app.shift_code_valid(c) then return c; end if;
  return null;
end$$;

-- ② قائمة الشفتات لكل مستخدم مسجَّل
drop function if exists public.shift_options(boolean);
create function public.shift_options(p_include_inactive boolean default false)
returns table(code text, name text, start_time time, end_time time, grace_minutes integer, is_active boolean, sort_order smallint)
language sql stable security definer set search_path = public, app as $$
  select s.code, s.name, s.start_time, s.end_time, s.grace_minutes, s.is_active, s.sort_order
  from public.hr_shifts s
  where auth.uid() is not null and (p_include_inactive or s.is_active)
  order by s.sort_order, s.start_time, s.name
$$;
revoke all on function public.shift_options(boolean) from public, anon;
grant execute on function public.shift_options(boolean) to authenticated;

-- ③ الجداول: إزالة القيد الثابت + محفّز التحقق
create or replace function app.enforce_shift_code() returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if new.shift is null then return new; end if;
  if tg_op = 'UPDATE' and new.shift = old.shift then return new; end if;
  if not app.shift_code_valid(new.shift, false) then raise exception 'SHIFT_INVALID'; end if;
  return new;
end$$;
do $$
declare t text; c record;
begin
  foreach t in array array['garage_vehicles','garage_driver_assignments','garage_vehicle_shift_assignments','garage_departures',
    'contractor_profiles','manager_profiles','sector_workers','sector_vehicles','sector_supply_requests','sector_breakdowns','sector_photos','sector_attendance'] loop
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'shift') then continue; end if;
    for c in select conname from pg_constraint where conrelid = ('public.' || t)::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%shift%' and pg_get_constraintdef(oid) ilike '%''morning''%' loop
      execute format('alter table public.%I drop constraint %I', t, c.conname);
    end loop;
    execute format('drop trigger if exists trg_enforce_shift_code on public.%I', t);
    execute format('create trigger trg_enforce_shift_code before insert or update of shift on public.%I for each row execute function app.enforce_shift_code()', t);
  end loop;
end $$;

-- منع حذف شفت مستخدم في المنصة (الإيقاف متاح)
create or replace function app.hr_shift_delete_guard() returns trigger language plpgsql security definer set search_path = public, app as $$
declare t text; n bigint;
begin
  foreach t in array array['garage_vehicles','garage_driver_assignments','garage_vehicle_shift_assignments','garage_departures','contractor_profiles','manager_profiles','employee_shift_assignments'] loop
    if t = 'employee_shift_assignments' then
      select count(*) into n from public.employee_shift_assignments a where a.shift_id = old.id;
    else
      execute format('select count(*) from public.%I where shift = $1', t) into n using old.code;
    end if;
    if n > 0 then raise exception 'HR_SHIFT_IN_USE'; end if;
  end loop;
  return old;
end$$;
drop trigger if exists trg_hr_shift_delete_guard on public.hr_shifts;
create trigger trg_hr_shift_delete_guard before delete on public.hr_shifts for each row execute function app.hr_shift_delete_guard();

-- ④ الدوال
-- public.garage_add_vehicle: التحقق من الشفت عبر hr_shifts
create or replace function public.garage_add_vehicle(p_vehicle_name text,p_db_number text,p_plate_number text,p_chassis_number text,p_image_path text,p_shift text,p_driver_employee_id uuid,p_sector_id smallint,p_vehicle_category text default 'other',p_ownership_type text default 'owned',p_lessor_name text default null,p_rental_contract_no text default null,p_rental_start_date date default null,p_rental_end_date date default null,p_model_year smallint default null,p_vehicle_color text default null,p_specifications text default null,p_driver_external_id uuid default null)
returns public.garage_vehicles language plpgsql security definer set search_path=public,app as $$
declare u uuid:=app.require_fleet_master_actor();r public.garage_vehicles;e public.employees;x public.station_external_drivers;v_driver_name text;v_emp uuid;
begin
  if not app.shift_code_valid(p_shift)then raise exception'GARAGE_SHIFT_INVALID';end if;
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

-- public.garage_assign_driver: التحقق من الشفت عبر hr_shifts
create or replace function public.garage_assign_driver(p_vehicle_id uuid,p_driver_employee_id uuid,p_shift text,p_sector_id smallint,p_reason text default null)
returns public.garage_driver_assignments language plpgsql security definer set search_path=public,app as $$
declare u uuid:=app.require_fleet_master_actor();r public.garage_driver_assignments;e public.employees;
begin
  if not app.shift_code_valid(p_shift)or not exists(select 1 from public.sectors where id=p_sector_id)then raise exception'GARAGE_ASSIGNMENT_INVALID';end if;
  e:=app.require_fleet_driver(p_driver_employee_id);
  if exists(select 1 from public.garage_departures where vehicle_id=p_vehicle_id and returned_at is null)then raise exception'GARAGE_VEHICLE_IN_FIELD';end if;
  update public.garage_driver_assignments set ends_at=now(),change_reason=coalesce(nullif(trim(coalesce(p_reason,'')),''),change_reason)where vehicle_id=p_vehicle_id and ends_at is null;
  insert into public.garage_driver_assignments(vehicle_id,driver_name,driver_employee_id,shift,sector_id,assigned_by,change_reason)values(p_vehicle_id,e.full_name,e.id,p_shift,p_sector_id,u,nullif(trim(coalesce(p_reason,'')),''))returning*into r;
  update public.garage_vehicles set driver_name=r.driver_name,driver_employee_id=r.driver_employee_id,shift=r.shift,sector_id=r.sector_id where id=p_vehicle_id and archived_at is null;
  if not found then raise exception'GARAGE_VEHICLE_NOT_FOUND';end if;
  return r;
end$$;

-- public.garage_set_vehicle_shift_assignment: التحقق من الشفت عبر hr_shifts
create or replace function public.garage_set_vehicle_shift_assignment(p_vehicle_id uuid,p_shift text,p_driver_employee_id uuid,p_sector_id smallint,p_reason text)
returns public.garage_vehicle_shift_assignments language plpgsql security definer set search_path=public,app as $$
declare u uuid:=app.require_fleet_master_actor();r public.garage_vehicle_shift_assignments;e public.employees;
begin
  if not app.shift_code_valid(p_shift)or length(trim(coalesce(p_reason,'')))<3 then raise exception'GARAGE_SHIFT_ASSIGNMENT_INVALID';end if;
  e:=app.require_fleet_driver(p_driver_employee_id);
  if not exists(select 1 from public.garage_vehicles where id=p_vehicle_id and archived_at is null)then raise exception'GARAGE_VEHICLE_NOT_FOUND';end if;
  if not exists(select 1 from public.sectors where id=p_sector_id)then raise exception'GARAGE_AREA_INVALID';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_vehicle_id::text||p_shift,0));
  if exists(select 1 from public.garage_departures where vehicle_id=p_vehicle_id and shift=p_shift and returned_at is null)then raise exception'GARAGE_SHIFT_IN_FIELD';end if;
  update public.garage_vehicle_shift_assignments set ends_at=now(),change_reason=trim(p_reason)where vehicle_id=p_vehicle_id and shift=p_shift and ends_at is null;
  insert into public.garage_vehicle_shift_assignments(vehicle_id,shift,driver_name,driver_employee_id,sector_id,change_reason,created_by)values(p_vehicle_id,p_shift,e.full_name,e.id,p_sector_id,trim(p_reason),u)returning*into r;
  -- الشفت الرئيسي للآلية يتبع إسناده فقط (لا يغيّر قاطع الآلية الثابت إن كان الشفت مختلفاً)
  update public.garage_vehicles set driver_name=r.driver_name,driver_employee_id=r.driver_employee_id,sector_id=r.sector_id where id=p_vehicle_id and shift=p_shift;
  return r;
end$$;

-- public.garage_search_vehicles: التحقق من الشفت عبر hr_shifts
create or replace function public.garage_search_vehicles(p_search text default null,p_sector_id smallint default null,p_shift text default null,p_limit integer default 48,p_offset integer default 0,p_archived boolean default false)
returns table(id uuid,vehicle_name text,db_number text,plate_number text,chassis_number text,image_path text,vehicle_category text,ownership_type text,lessor_name text,rental_contract_no text,rental_start_date date,rental_end_date date,model_year smallint,vehicle_color text,specifications text,shift text,driver_name text,sector_id smallint,area_name text,parent_sector text,created_at timestamptz,updated_at timestamptz,archived_at timestamptz,archived_by uuid,archive_reason text,total_count bigint,driver_employee_id uuid,driver_employee_number text,driver_has_biometric boolean)
language plpgsql stable security definer set search_path=public,app as $$
declare q text:=trim(coalesce(p_search,''));garage_parent text:=app.current_garage_parent_sector();
begin
  if auth.uid()is null or not app.has_role(array['central_garage_officer','ops_room','super_admin'])then raise exception'GARAGE_FORBIDDEN';end if;
  if app.has_role(array['central_garage_officer'])and not app.has_role(array['ops_room','super_admin'])and garage_parent is null then raise exception'GARAGE_PROFILE_NOT_CONFIGURED';end if;
  if p_shift is not null and not app.shift_code_valid(p_shift)then raise exception'GARAGE_SHIFT_INVALID';end if;
  if p_limit<1 or p_limit>100 or p_offset<0 then raise exception'GARAGE_PAGINATION_INVALID';end if;
  return query select v.id,v.vehicle_name,v.db_number,v.plate_number,v.chassis_number,v.image_path,v.vehicle_category,v.ownership_type,v.lessor_name,v.rental_contract_no,v.rental_start_date,v.rental_end_date,v.model_year,v.vehicle_color,v.specifications,v.shift,v.driver_name,v.sector_id,s.name,v.garage_parent_sector,v.created_at,v.updated_at,v.archived_at,v.archived_by,v.archive_reason,count(*)over(),v.driver_employee_id,e.employee_number,(e.biometric_pin is not null)
  from public.garage_vehicles v join public.sectors s on s.id=v.sector_id left join public.employees e on e.id=v.driver_employee_id
  where(case when p_archived then v.archived_at is not null else v.archived_at is null end)and(garage_parent is null or app.has_role(array['ops_room','super_admin'])or v.garage_parent_sector=garage_parent)and(p_sector_id is null or v.sector_id=p_sector_id)and(p_shift is null or v.shift=p_shift)and(q=''or v.db_number ilike'%'||q||'%'or v.vehicle_name ilike'%'||q||'%'or v.driver_name ilike'%'||q||'%'or v.plate_number ilike'%'||q||'%'or v.chassis_number ilike'%'||q||'%'or v.lessor_name ilike'%'||q||'%'or e.employee_number ilike'%'||q||'%')
  order by case when p_archived then v.archived_at else v.created_at end desc limit p_limit offset p_offset;
end$$;

-- public.garage_record_shift_departure: التحقق من الشفت عبر hr_shifts
create or replace function public.garage_record_shift_departure(p_vehicle_id uuid, p_shift text, p_notes text default null, p_manager_id uuid default null)
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
  if length(coalesce(p_notes, '')) > 500 then raise exception 'GARAGE_DEPARTURE_NOTES_TOO_LONG'; end if;
  select * into vehicle_row from public.garage_vehicles where id = p_vehicle_id and archived_at is null for update;
  if not found then raise exception 'GARAGE_VEHICLE_NOT_FOUND'; end if;
  if not app.garage_vehicle_allowed(p_vehicle_id) then raise exception 'GARAGE_VEHICLE_SCOPE_FORBIDDEN'; end if;
  if exists (select 1 from public.vehicle_maintenance_cases mc where mc.vehicle_id = vehicle_row.id and mc.completed_at is null) then raise exception 'GARAGE_VEHICLE_IN_MAINTENANCE'; end if;
  if exists (select 1 from public.garage_departures gd where gd.vehicle_id = vehicle_row.id and gd.returned_at is null) then raise exception 'GARAGE_DEPARTURE_ALREADY_OPEN'; end if;
  select * into assignment_row from public.garage_vehicle_shift_assignments a
   where a.vehicle_id = vehicle_row.id and a.shift = p_shift and a.ends_at is null;
  if not found then raise exception 'GARAGE_SHIFT_ASSIGNMENT_NOT_FOUND'; end if;
  -- 00252: السائق صالح للانطلاق (غير مُنهى وليس في الميدان بآلية أخرى)
  perform app.assert_departure_driver(vehicle_row.id, assignment_row.driver_employee_id);

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
                                       recipient_manager_id, recipient_manager_name, assignment_mode)
  values (vehicle_row.id, assignment_row.driver_name, p_shift, assignment_row.sector_id, actor_id,
          nullif(btrim(coalesce(p_notes, '')), ''), picked_id, picked_label, mode)
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

-- fleet_vehicles_import: الشفت بالاسم أو الرمز من hr_shifts
create or replace function public.fleet_vehicles_import(p_rows jsonb, p_dry_run boolean default true, p_update_existing boolean default true)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare
  u uuid := app.require_fleet_master_actor();
  r jsonb; i int := 0; results jsonb := '[]'::jsonb; errs text[]; warns text[]; seen text[] := '{}';
  v_db text; v_name text; v_plate text; v_chassis text; v_sector smallint; v_shift text; v_cat text; v_own text; v_lessor text; v_year smallint; v_action text; v_id uuid;
  e public.employees; v_driver text; existing public.garage_vehicles; t text;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'FLEET_IMPORT_EMPTY'; end if;
  if jsonb_array_length(p_rows) > 3000 then raise exception 'FLEET_IMPORT_TOO_LARGE'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1; errs := '{}'; warns := '{}'; v_action := 'skipped'; v_id := null; e := null; existing := null;
    v_db := nullif(trim(coalesce(r ->> 'db_number', '')), '');
    v_name := nullif(trim(coalesce(r ->> 'vehicle_name', '')), '');
    if v_db is null then errs := array_append(errs, 'FLEET_IMPORT_DB_REQUIRED');
    elsif lower(v_db) = any(seen) then errs := array_append(errs, 'FLEET_IMPORT_DUP_IN_FILE'); end if;
    seen := array_append(seen, lower(coalesce(v_db, '')));

    -- التصنيف
    t := app.fleet_norm_text(r ->> 'vehicle_category');
    v_cat := case
      when t in ('compactor_small', 'كابسه صغيره', 'كابسه صغيرة', 'كابسة صغيرة') then 'compactor_small'
      when t in ('compactor_large', 'كابسه كبيره', 'كابسة كبيرة') then 'compactor_large'
      when t like 'كابس%' then 'compactor_large'
      when t in ('truck', 'كميون', 'شاحنه', 'لوري') then 'truck'
      when t in ('shovel', 'شفل', 'شفل كبير', 'شفل صغير') then 'shovel'
      when t in ('tipper', 'قلاب') then 'tipper'
      when t in ('tanker', 'تنكر', 'صهريج', 'حوضيه') then 'tanker'
      when t in ('sweeper', 'كناسه', 'مكنسه') then 'sweeper'
      when t in ('strat', 'استرات', 'سترات') then 'strat'
      when t = '' then 'other'
      else null end;
    if v_cat is null then warns := array_append(warns, 'FLEET_IMPORT_CATEGORY_UNKNOWN'); v_cat := 'other'; end if;
    if v_name is null then
      if v_db is not null then v_name := (case v_cat when 'compactor_small' then 'كابسة صغيرة' when 'compactor_large' then 'كابسة كبيرة' when 'truck' then 'كميون' when 'shovel' then 'شفل' when 'tipper' then 'قلاب' when 'tanker' then 'تنكر' when 'sweeper' then 'كناسة' when 'strat' then 'استرات' else 'آلية' end) || ' ' || v_db; warns := array_append(warns, 'FLEET_IMPORT_NAME_GENERATED'); end if;
    end if;

    -- اللوحة والشاصي
    v_plate := nullif(trim(coalesce(r ->> 'plate_number', '')), '');
    if v_plate is null and v_db is not null then v_plate := 'بلا-لوحة-' || v_db; warns := array_append(warns, 'FLEET_IMPORT_PLATE_PLACEHOLDER'); end if;
    v_chassis := nullif(trim(coalesce(r ->> 'chassis_number', '')), '');
    if v_chassis is null and v_db is not null then v_chassis := 'بلا-شاصي-' || v_db; warns := array_append(warns, 'FLEET_IMPORT_CHASSIS_PLACEHOLDER'); end if;

    -- المنطقة والشفت
    v_sector := app.fleet_resolve_sector(coalesce(nullif(trim(coalesce(r ->> 'area', '')), ''), r ->> 'sector_id'));
    if v_sector is null then errs := array_append(errs, 'FLEET_IMPORT_AREA_UNKNOWN'); end if;
    t := app.fleet_norm_text(r ->> 'shift');
    v_shift := app.shift_resolve(t);
    if v_shift is null then errs := array_append(errs, 'FLEET_IMPORT_SHIFT_INVALID'); end if;

    -- الملكية
    t := app.fleet_norm_text(r ->> 'ownership_type');
    v_own := case when t in ('', 'owned', 'ذاتيه', 'اليه ذاتيه', 'مملوكه', 'ملك', 'ذاتي') then 'owned' when t in ('rented', 'مؤجره', 'موجره', 'اليه مؤجره', 'ايجار', 'مستأجره', 'مستاجره') then 'rented' else null end;
    if v_own is null then errs := array_append(errs, 'FLEET_IMPORT_OWNERSHIP_INVALID'); end if;
    v_lessor := nullif(trim(coalesce(r ->> 'lessor_name', '')), '');
    if v_own = 'rented' and coalesce(length(v_lessor), 0) < 2 then errs := array_append(errs, 'GARAGE_LESSOR_REQUIRED'); end if;
    begin perform (r ->> 'rental_start_date')::date; perform (r ->> 'rental_end_date')::date; exception when others then errs := array_append(errs, 'FLEET_IMPORT_DATE_INVALID'); end;
    begin v_year := nullif(trim(coalesce(r ->> 'model_year', '')), '')::smallint; if v_year is not null and (v_year < 1950 or v_year > 2100) then errs := array_append(errs, 'FLEET_IMPORT_YEAR_INVALID'); end if; exception when others then errs := array_append(errs, 'FLEET_IMPORT_YEAR_INVALID'); end;

    -- السائق
    v_driver := nullif(trim(coalesce(r ->> 'driver', '')), '');
    e := app.fleet_resolve_driver(coalesce(nullif(trim(coalesce(r ->> 'driver_employee_number', '')), ''), v_driver));
    if e.id is null and v_driver is not null then e := app.fleet_resolve_driver(v_driver); end if;
    if e.id is null then
      if v_driver is null then v_driver := 'غير مسنَد'; warns := array_append(warns, 'FLEET_IMPORT_DRIVER_MISSING'); else warns := array_append(warns, 'FLEET_IMPORT_DRIVER_NOT_LINKED'); end if;
    else v_driver := e.full_name; end if;

    if v_db is not null then select * into existing from public.garage_vehicles where lower(trim(db_number)) = lower(v_db); end if;
    if existing.id is not null then
      if existing.archived_at is not null then errs := array_append(errs, 'FLEET_IMPORT_DB_ARCHIVED');
      elsif not p_update_existing then v_action := 'skipped'; warns := array_append(warns, 'FLEET_IMPORT_EXISTS_SKIPPED');
      else v_action := 'updated'; end if;
    elsif cardinality(errs) = 0 then v_action := 'inserted'; end if;

    if cardinality(errs) = 0 and not p_dry_run and v_action <> 'skipped' then
      begin
        if v_action = 'inserted' then
          insert into public.garage_vehicles (vehicle_name, db_number, plate_number, chassis_number, image_path, shift, driver_name, driver_employee_id, sector_id, created_by, vehicle_category, ownership_type, lessor_name, rental_contract_no, rental_start_date, rental_end_date, model_year, vehicle_color, specifications)
          values (v_name, v_db, v_plate, v_chassis, 'import/no-photo', v_shift, v_driver, e.id, v_sector, u, v_cat, v_own,
                  case when v_own = 'rented' then v_lessor end, case when v_own = 'rented' then nullif(trim(coalesce(r ->> 'rental_contract_no', '')), '') end,
                  case when v_own = 'rented' then (r ->> 'rental_start_date')::date end, case when v_own = 'rented' then (r ->> 'rental_end_date')::date end,
                  v_year, nullif(trim(coalesce(r ->> 'vehicle_color', '')), ''), nullif(trim(coalesce(r ->> 'specifications', '')), ''))
          returning id into v_id;
          if e.id is not null then
            insert into public.garage_driver_assignments (vehicle_id, driver_name, driver_employee_id, shift, sector_id, assigned_by, change_reason) values (v_id, e.full_name, e.id, v_shift, v_sector, u, 'استرداد من Excel');
          end if;
          warns := array_append(warns, 'FLEET_IMPORT_PHOTO_MISSING');
        else
          v_id := existing.id;
          update public.garage_vehicles set vehicle_name = v_name,
            plate_number = case when (r ->> 'plate_number') is not null and trim(r ->> 'plate_number') <> '' then v_plate else plate_number end,
            chassis_number = case when (r ->> 'chassis_number') is not null and trim(r ->> 'chassis_number') <> '' then v_chassis else chassis_number end,
            sector_id = v_sector, shift = v_shift, vehicle_category = v_cat, ownership_type = v_own,
            lessor_name = case when v_own = 'rented' then v_lessor end, rental_contract_no = case when v_own = 'rented' then nullif(trim(coalesce(r ->> 'rental_contract_no', '')), '') end,
            rental_start_date = case when v_own = 'rented' then (r ->> 'rental_start_date')::date end, rental_end_date = case when v_own = 'rented' then (r ->> 'rental_end_date')::date end,
            model_year = coalesce(v_year, model_year), vehicle_color = coalesce(nullif(trim(coalesce(r ->> 'vehicle_color', '')), ''), vehicle_color), specifications = coalesce(nullif(trim(coalesce(r ->> 'specifications', '')), ''), specifications),
            driver_name = case when e.id is not null then e.full_name else driver_name end, driver_employee_id = coalesce(e.id, driver_employee_id), updated_at = now()
          where id = existing.id;
          if e.id is not null and (existing.driver_employee_id is distinct from e.id or existing.shift <> v_shift or existing.sector_id <> v_sector) then
            if not exists (select 1 from public.garage_departures d where d.vehicle_id = existing.id and d.returned_at is null) then
              update public.garage_driver_assignments set ends_at = now(), change_reason = 'استرداد من Excel' where vehicle_id = existing.id and ends_at is null;
              insert into public.garage_driver_assignments (vehicle_id, driver_name, driver_employee_id, shift, sector_id, assigned_by, change_reason) values (existing.id, e.full_name, e.id, v_shift, v_sector, u, 'استرداد من Excel');
            else warns := array_append(warns, 'FLEET_IMPORT_VEHICLE_IN_FIELD'); end if;
          end if;
        end if;
      exception when unique_violation then errs := array_append(errs, 'GARAGE_VEHICLE_IDENTIFIER_DUPLICATE'); v_action := 'skipped';
        when others then errs := array_append(errs, sqlerrm); v_action := 'skipped';
      end;
    end if;
    if cardinality(errs) > 0 then v_action := 'skipped'; end if;

    results := results || jsonb_build_object('row', i, 'db_number', v_db, 'vehicle_name', v_name, 'area', (select name from public.sectors where id = v_sector), 'driver', v_driver, 'driver_linked', e.id is not null,
      'action', v_action, 'ok', cardinality(errs) = 0, 'id', v_id, 'errors', to_jsonb(errs), 'warnings', to_jsonb(warns));
  end loop;

  if not p_dry_run then
    insert into public.notifications (user_id, title, body, type, category, priority, link, dedupe_key)
    select n.user_id, 'استرداد قاعدة بيانات الآليات من Excel', app.manager_display_name(u) || ' · مُدرج ' || (select count(*) from jsonb_array_elements(results) x where x ->> 'action' = 'inserted') || ' · محدَّث ' || (select count(*) from jsonb_array_elements(results) x where x ->> 'action' = 'updated'), 'info', 'system', 'normal', '/ops-room/vehicles-database', 'fleet_import:' || now()::text || ':' || n.user_id::text
    from unnest(app.ops_room_users()) as n(user_id) where n.user_id <> u
    on conflict do nothing;
  end if;

  return jsonb_build_object('dry_run', p_dry_run, 'total', i,
    'inserted', (select count(*) from jsonb_array_elements(results) x where x ->> 'action' = 'inserted'),
    'updated', (select count(*) from jsonb_array_elements(results) x where x ->> 'action' = 'updated'),
    'skipped', (select count(*) from jsonb_array_elements(results) x where x ->> 'action' = 'skipped'),
    'failed', (select count(*) from jsonb_array_elements(results) x where not (x ->> 'ok')::boolean),
    'rows', results);
end$$;

-- operational_departure_timeline: اسم الشفت من hr_shifts
CREATE OR REPLACE FUNCTION public.operational_departure_timeline(p_departure_id uuid)
 RETURNS TABLE(event_key text, event_type text, title text, details text, happened_at timestamp with time zone, minutes_since_prev integer, sequence_no integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
declare d public.garage_departures; v public.garage_vehicles;
begin
 if not app.has_role(array['ops_room','super_admin']) then raise exception 'OPS_ROOM_FORBIDDEN';end if;
 select * into d from public.garage_departures where id=p_departure_id;
 if not found then raise exception 'OPS_DEPARTURE_NOT_FOUND';end if;
 select * into v from public.garage_vehicles where id=d.vehicle_id;
 return query
 with ev as(
  select 'departure:garage'::text k,'departure'::text t,'انطلقت من الكراج المركزي'::text ttl,
         format('السائق %s · %s · %s',d.driver_name,app.shift_label(d.shift),coalesce((select s.name from public.sectors s where s.id=d.sector_id),''))::text det,
         d.departed_at at,0::int seq
  union all
  select 'departure:site-arrived','work_start','وصلت موقع العمل — بدء العمل الفعلي',coalesce('أكد الوصول: '||d.recipient_manager_name,'تأكيد الوصول'),d.arrived_at,1 where d.arrived_at is not null
  union all
  select 'leg:'||l.id::text||':departed','movement',case when l.origin_type='maintenance' and l.destination_type='maintenance' then 'غادرت الورشة الفرعية باتجاه الصيانة المركزية' else 'غادرت '||app.trip_place_label(l.origin_type)||' إلى '||app.trip_place_label(l.destination_type) end,l.departure_notes,l.departed_at,100+l.sequence_no*10
  from public.vehicle_trip_legs l where l.departure_id=d.id
  union all
  select 'leg:'||l.id::text||':arrived','movement',case when l.origin_type='maintenance' and l.destination_type='maintenance' then 'وصلت إلى الصيانة المركزية' else 'وصلت إلى '||app.trip_place_label(l.destination_type) end,l.arrival_notes,l.arrived_at,100+l.sequence_no*10+1
  from public.vehicle_trip_legs l where l.departure_id=d.id and l.arrived_at is not null
  union all
  select 'weighing:'||st.id::text,'weighing',case when st.violation then 'وزن في المحطة — نقص عن الحد الأدنى' else 'وزن في المحطة' end,
         format('%s طن · %s%s%s',st.weight_tons,case st.destination when 'press' then 'المكبس' when 'transfer_station' then 'المحطة التحويلية' else '—' end,
                coalesce(' · '||k.label,''),case when st.violation then format(' · النقص %s طن عن الحد %s',st.deficit_tons,k.min_tons) else '' end),
         st.weighed_at,100+l.sequence_no*10+2
  from public.ts_visit_weighing_steps st join public.vehicle_trip_legs l on l.id=st.visit_leg_id left join public.ts_vehicle_kinds k on k.kind=st.vehicle_kind where l.departure_id=d.id
  union all
  select 'weighing:'||st.id::text||':done','weighing','اكتملت عملية المحطة',null,st.completed_at,100+l.sequence_no*10+3
  from public.ts_visit_weighing_steps st join public.vehicle_trip_legs l on l.id=st.visit_leg_id where l.departure_id=d.id and st.completed_at is not null
  union all
  select 'breakdown:'||b.id::text,'breakdown','بلاغ عطل — '||app.breakdown_stage_label(b.trip_stage),b.fault_type||coalesce(' · '||b.notes,''),b.created_at,500
  from public.sector_breakdowns b where b.departure_id=d.id
  union all
  select 'breakdown:'||b.id::text||':resolved','breakdown','حُسم العطل ('||app.breakdown_stage_label(b.trip_stage)||')',b.fault_type,b.resolved_at,501
  from public.sector_breakdowns b where b.departure_id=d.id and b.resolved_at is not null
  union all
  select 'case:'||c.id::text||':reported','maintenance','إحالة إلى الصيانة',c.fault_type||' · أولوية '||case c.priority when 'critical' then 'حرجة' when 'urgent' then 'عاجلة' else 'عادية' end||' · الورشة: '||app.maintenance_workshop_name(coalesce(c.origin_workshop_key,c.workshop_key)),c.reported_at,600
  from public.vehicle_maintenance_cases c where c.departure_id=d.id
  union all
  select 'case:'||c.id::text||':arrived','maintenance','استلمتها الصيانة',c.diagnosis,c.arrived_at,601
  from public.vehicle_maintenance_cases c where c.departure_id=d.id and c.arrived_at is not null
  union all
  select 'case:'||u.id::text||':update','maintenance','تحديث الصيانة: '||case u.status when 'diagnosing' then 'قيد التشخيص' when 'waiting_parts' then 'بانتظار القطع' when 'in_repair' then 'قيد الإصلاح' when 'paused' then 'متوقفة مؤقتاً' when 'ready' then 'جاهزة' when 'at_maintenance' then 'داخل الصيانة' else u.status end||format(' (%s%%)',u.progress),
         coalesce(u.diagnosis,u.work_notes,u.parts_notes,u.delay_reason),u.created_at,700
  from public.vehicle_maintenance_updates u join public.vehicle_maintenance_cases c on c.id=u.case_id where c.departure_id=d.id and u.status<>'to_maintenance'
  union all
  select 'case:'||c.id::text||':forwarded','maintenance','تحويل إلى الصيانة المركزية','من '||app.maintenance_workshop_name(c.origin_workshop_key)||' — السبب: '||coalesce(c.forward_reason,''),c.forwarded_at,650
  from public.vehicle_maintenance_cases c where c.departure_id=d.id and c.forwarded_at is not null
  union all
  select 'case:'||c.id::text||':ready','maintenance','الآلية جاهزة للمغادرة',null,c.ready_at,800
  from public.vehicle_maintenance_cases c where c.departure_id=d.id and c.ready_at is not null
  union all
  select 'case:'||c.id::text||':completed','maintenance',case c.status when 'returned_to_work' then 'أُغلقت حالة الصيانة — عادت إلى العمل' when 'closed_at_garage' then 'أُغلقت حالة الصيانة — وصلت الكراج' else 'أُغلقت حالة الصيانة' end,c.work_notes,c.completed_at,801
  from public.vehicle_maintenance_cases c where c.departure_id=d.id and c.completed_at is not null
  union all
  select 'departure:site-departed','departure','غادرت موقع العمل باتجاه الكراج',null,d.site_departed_at,900 where d.site_departed_at is not null
  union all
  select 'departure:returned','departure','عادت إلى الكراج المركزي — انتهاء الانطلاقية',d.notes,d.returned_at,999 where d.returned_at is not null
 ), ordered as(
  select e.*, row_number() over(order by e.at,e.seq) rn, lag(e.at) over(order by e.at,e.seq) prev_at from ev e where e.at is not null
 )
 select o.k,o.t,o.ttl,o.det,o.at,case when o.prev_at is null then 0 else floor(extract(epoch from(o.at-o.prev_at))/60)::int end,o.rn::int from ordered o order by o.rn;
end$function$;