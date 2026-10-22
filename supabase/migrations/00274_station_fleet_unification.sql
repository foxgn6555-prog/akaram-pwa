-- ═══════════════════════════════════════════════════════════
-- 00274 · المحطة التحويلية (١/٥) — توحيد الأسطول وقاعدة البيانات
--   ① vehicle_categories: قائمة فئات واحدة للمنصة تديرها غرفة العمليات
--      (فئات الكراج + أنواع وزن المحطة + نسافة/ناقلة حاويات مكبسية).
--      ts_vehicle_kinds تصبح view فوقها (كل الاستعلامات القديمة تعمل).
--   ② garage_vehicles.is_station_vehicle: آلية محطة؛ المحطة تراها للقراءة.
--   ③ station_destinations: الوجهات (النهروان، النباعي…) + زون GPS لكل وجهة.
--   ④ station_external_drivers: سائقو المتعهدين الخارجيون (غرفة العمليات).
--   ⑤ ts_saksat_records / ts_carrier_records: أعمدة الربط (آلية، سائق،
--      وجهة، تتبع، وصول، شفت HR). القديم يبقى نصاً للقراءة.
--   ⑥ station_record_exit: تسجيل الخروج من القوائم فقط.
--   ⑦ الوصول آلياً: trigger على مواقع GPS ⇒ arrived_at + إشعار غرفة العمليات.
-- ═══════════════════════════════════════════════════════════

-- ── ① فئات الآليات الموحّدة ──
create table public.vehicle_categories (
  code                text primary key check (code ~ '^[a-z0-9_]{2,40}$'),
  label               text not null check (length(trim(label)) between 2 and 80),
  min_tons            numeric(6,2) check (min_tons is null or (min_tons > 0 and min_tons < 100)),
  max_tons            numeric(6,2) check (max_tons is null or (max_tons < 100 and (min_tons is null or max_tons >= min_tons))),
  weighing_destination text check (weighing_destination is null or weighing_destination in ('press','transfer_station','both')),
  garage_usable       boolean not null default true,
  station_outbound    boolean not null default false,
  active              boolean not null default true,
  sort                smallint not null default 0,
  updated_at          timestamptz,
  updated_by          uuid references auth.users(id),
  constraint vehicle_categories_weighing_needs_min check (weighing_destination is null or min_tons is not null)
);
alter table public.vehicle_categories enable row level security;
create policy "vehicle categories read" on public.vehicle_categories for select to authenticated using (true);

insert into public.vehicle_categories (code, label, min_tons, max_tons, weighing_destination, garage_usable, station_outbound, sort)
values
  ('compactor_small',   'كابسة صغيرة',            2,  3,    'both',             true,  false, 1),
  ('compactor_medium',  'كابسة وسط',              4,  6,    'both',             true,  false, 2),
  ('compactor_large',   'كابسة كبيرة',            6,  8,    'both',             true,  false, 3),
  ('kia',               'كيا',                    2,  null, 'transfer_station', true,  false, 4),
  ('canter',            'كنتر',                   5,  null, 'transfer_station', true,  false, 5),
  ('tak',               'تك',                     7,  null, 'transfer_station', true,  false, 6),
  ('six',               'سكس',                    10, null, 'transfer_station', true,  true,  7),
  ('nasafa',            'نسافة',                  null, null, null,             true,  true,  8),
  ('container_carrier', 'ناقلة حاويات مكبسية',    null, null, null,             true,  true,  9),
  ('truck',             'كميون',                  null, null, null,             true,  false, 20),
  ('shovel',            'شفل',                    null, null, null,             true,  false, 21),
  ('tipper',            'قلاب',                   null, null, null,             true,  false, 22),
  ('tanker',            'تنكر',                   null, null, null,             true,  false, 23),
  ('sweeper',           'كناسة',                  null, null, null,             true,  false, 24),
  ('strat',             'استرات',                 null, null, null,             true,  false, 25),
  ('other',             'أخرى',                   null, null, null,             true,  false, 99);

-- نقل أي أنواع أضافتها غرفة العمليات يدوياً إلى القائمة الموحّدة (بما فيها الموقوفة)
insert into public.vehicle_categories (code, label, min_tons, max_tons, weighing_destination, garage_usable, station_outbound, active, sort, updated_at, updated_by)
select k.kind, k.label, k.min_tons, k.max_tons, k.destination, true, false, k.active, k.sort, k.updated_at, k.updated_by
from public.ts_vehicle_kinds k
on conflict (code) do update set active = excluded.active, min_tons = excluded.min_tons, max_tons = excluded.max_tons,
  weighing_destination = excluded.weighing_destination, label = excluded.label;

-- ts_vehicle_kinds ⇒ view (نفس الأعمدة؛ أنواع الوزن فقط)
alter table public.ts_visit_weighing_steps drop constraint if exists ts_visit_weighing_steps_vehicle_kind_fkey;
drop function if exists public.ts_vehicle_kinds_list(boolean);
drop function if exists public.ops_ts_vehicle_kind_save(text,text,numeric,numeric,text,integer,boolean);
drop table public.ts_vehicle_kinds;
create view public.ts_vehicle_kinds with (security_invoker = true) as
  select code as kind, label, min_tons, max_tons, weighing_destination as destination, sort, active, updated_at, updated_by
  from public.vehicle_categories where weighing_destination is not null;
grant select on public.ts_vehicle_kinds to authenticated;
alter table public.ts_visit_weighing_steps
  add constraint ts_visit_weighing_steps_vehicle_kind_fkey foreign key (vehicle_kind) references public.vehicle_categories(code);

create function public.ts_vehicle_kinds_list(p_include_inactive boolean default false)
returns setof public.ts_vehicle_kinds
language sql stable security invoker set search_path = public as $$
  select * from public.ts_vehicle_kinds where p_include_inactive or active order by sort, kind
$$;
grant execute on function public.ts_vehicle_kinds_list(boolean) to authenticated;

-- حفظ فئة (غرفة العمليات فقط) — يخدم شاشة أنواع الوزن القديمة وشاشة الفئات الجديدة
create or replace function public.ops_vehicle_category_save(
  p_code text, p_label text, p_min_tons numeric default null, p_max_tons numeric default null,
  p_weighing_destination text default null, p_garage_usable boolean default true,
  p_station_outbound boolean default false, p_sort integer default 0, p_active boolean default true)
returns public.vehicle_categories
language plpgsql security definer set search_path = public, app as $$
declare u uuid := auth.uid(); c public.vehicle_categories; old_c public.vehicle_categories;
begin
  if u is null or not app.has_role(array['ops_room','super_admin']) then raise exception 'OPS_ROOM_FORBIDDEN'; end if;
  if p_code !~ '^[a-z0-9_]{2,40}$' then raise exception 'TS_KIND_CODE_INVALID'; end if;
  if p_label is null or length(trim(p_label)) < 2 then raise exception 'TS_KIND_LABEL_REQUIRED'; end if;
  if p_min_tons is not null and (p_min_tons <= 0 or p_min_tons >= 100) then raise exception 'TS_KIND_MIN_INVALID'; end if;
  if p_max_tons is not null and (p_min_tons is null or p_max_tons < p_min_tons or p_max_tons >= 100) then raise exception 'TS_KIND_MAX_INVALID'; end if;
  if p_weighing_destination is not null and p_weighing_destination not in ('press','transfer_station','both') then raise exception 'STATION_DESTINATION_INVALID'; end if;
  if p_weighing_destination is not null and p_min_tons is null then raise exception 'TS_KIND_MIN_INVALID'; end if;
  if p_code = 'other' and not p_active then raise exception 'VEHICLE_CATEGORY_OTHER_LOCKED'; end if;
  select * into old_c from public.vehicle_categories where code = p_code;
  insert into public.vehicle_categories (code, label, min_tons, max_tons, weighing_destination, garage_usable, station_outbound, sort, active, updated_at, updated_by)
  values (p_code, trim(p_label), round(p_min_tons, 2), round(p_max_tons, 2), p_weighing_destination, coalesce(p_garage_usable, true), coalesce(p_station_outbound, false), coalesce(p_sort, 0), coalesce(p_active, true), now(), u)
  on conflict (code) do update set label = excluded.label, min_tons = excluded.min_tons, max_tons = excluded.max_tons,
    weighing_destination = excluded.weighing_destination, garage_usable = excluded.garage_usable, station_outbound = excluded.station_outbound,
    sort = excluded.sort, active = excluded.active, updated_at = now(), updated_by = u
  returning * into c;
  insert into public.audit_logs (table_name, record_id, operation, old_row, new_row, actor_id, actor_role)
  values ('ts_vehicle_kinds', c.code, 'SAVE_VEHICLE_KIND', case when old_c.code is null then null else to_jsonb(old_c) end, to_jsonb(c), u, app.current_role());
  return c;
end $$;
revoke all on function public.ops_vehicle_category_save(text,text,numeric,numeric,text,boolean,boolean,integer,boolean) from public, anon;
grant execute on function public.ops_vehicle_category_save(text,text,numeric,numeric,text,boolean,boolean,integer,boolean) to authenticated;

-- التوافق مع شاشة أنواع الوزن الحالية (نفس التوقيع القديم) — يحافظ على خصائص الفئة الأخرى
create function public.ops_ts_vehicle_kind_save(p_kind text, p_label text, p_min_tons numeric, p_max_tons numeric, p_destination text, p_sort integer default 0, p_active boolean default true)
returns public.ts_vehicle_kinds
language plpgsql security definer set search_path = public, app as $$
declare c public.vehicle_categories; k public.ts_vehicle_kinds;
begin
  if p_min_tons is null then raise exception 'TS_KIND_MIN_INVALID'; end if;
  if p_destination is null then raise exception 'STATION_DESTINATION_INVALID'; end if;
  select * into c from public.vehicle_categories where code = p_kind;
  c := public.ops_vehicle_category_save(p_kind, p_label, p_min_tons, p_max_tons, p_destination,
         coalesce(c.garage_usable, true), coalesce(c.station_outbound, false), p_sort, p_active);
  select * into k from public.ts_vehicle_kinds where kind = c.code;
  return k;
end $$;
revoke all on function public.ops_ts_vehicle_kind_save(text,text,numeric,numeric,text,integer,boolean) from public, anon;
grant execute on function public.ops_ts_vehicle_kind_save(text,text,numeric,numeric,text,integer,boolean) to authenticated;

create or replace function public.vehicle_categories_list(p_include_inactive boolean default false)
returns setof public.vehicle_categories
language sql stable security invoker set search_path = public as $$
  select * from public.vehicle_categories where p_include_inactive or active order by sort, code
$$;
grant execute on function public.vehicle_categories_list(boolean) to authenticated;

-- فئة الآلية في الكراج ⇒ مرجع للقائمة الموحّدة بدل القائمة الثابتة
alter table public.garage_vehicles drop constraint if exists garage_vehicles_vehicle_category_check;
alter table public.garage_vehicles add constraint garage_vehicles_vehicle_category_fkey foreign key (vehicle_category) references public.vehicle_categories(code);
alter table public.notification_workflow_policies drop constraint if exists workflow_vehicle_category_check;
alter table public.notification_workflow_policies add constraint notification_workflow_policies_vehicle_category_fkey foreign key (vehicle_category) references public.vehicle_categories(code);

create or replace function app.require_garage_category(p_code text) returns text
language plpgsql stable security definer set search_path = public, app as $$
begin
  if p_code is null or not exists (select 1 from public.vehicle_categories where code = p_code and active and garage_usable) then
    raise exception 'GARAGE_VEHICLE_CATEGORY_INVALID';
  end if;
  return p_code;
end $$;
revoke all on function app.require_garage_category(text) from public, anon;

create or replace function public.garage_add_vehicle(p_vehicle_name text,p_db_number text,p_plate_number text,p_chassis_number text,p_image_path text,p_shift text,p_driver_employee_id uuid,p_sector_id smallint,p_vehicle_category text default 'other',p_ownership_type text default 'owned',p_lessor_name text default null,p_rental_contract_no text default null,p_rental_start_date date default null,p_rental_end_date date default null,p_model_year smallint default null,p_vehicle_color text default null,p_specifications text default null)
returns public.garage_vehicles language plpgsql security definer set search_path=public,app as $$
declare u uuid:=app.require_fleet_master_actor();r public.garage_vehicles;e public.employees;
begin
  if p_shift not in('morning','evening','night')then raise exception'GARAGE_SHIFT_INVALID';end if;
  perform app.require_garage_category(p_vehicle_category);
  if p_ownership_type not in('owned','rented')then raise exception'GARAGE_OWNERSHIP_TYPE_INVALID';end if;
  if p_ownership_type='rented'and length(trim(coalesce(p_lessor_name,'')))<2 then raise exception'GARAGE_LESSOR_REQUIRED';end if;
  if p_rental_end_date is not null and(p_rental_start_date is null or p_rental_end_date<p_rental_start_date)then raise exception'GARAGE_RENTAL_DATES_INVALID';end if;
  if not exists(select 1 from public.sectors where id=p_sector_id)then raise exception'GARAGE_AREA_INVALID';end if;
  if length(trim(coalesce(p_vehicle_name,'')))<2 or length(trim(coalesce(p_db_number,'')))<1 or length(trim(coalesce(p_plate_number,'')))<1 or length(trim(coalesce(p_chassis_number,'')))<3 then raise exception'GARAGE_VEHICLE_FIELDS_REQUIRED';end if;
  if p_image_path is null or p_image_path not like u::text||'/%'then raise exception'GARAGE_IMAGE_PATH_INVALID';end if;
  e:=app.require_fleet_driver(p_driver_employee_id);
  insert into public.garage_vehicles(vehicle_name,db_number,plate_number,chassis_number,image_path,shift,driver_name,driver_employee_id,sector_id,created_by,vehicle_category,ownership_type,lessor_name,rental_contract_no,rental_start_date,rental_end_date,model_year,vehicle_color,specifications)
  values(trim(p_vehicle_name),trim(p_db_number),trim(p_plate_number),trim(p_chassis_number),trim(p_image_path),p_shift,e.full_name,e.id,p_sector_id,u,p_vehicle_category,p_ownership_type,case when p_ownership_type='rented'then nullif(trim(coalesce(p_lessor_name,'')),'')end,case when p_ownership_type='rented'then nullif(trim(coalesce(p_rental_contract_no,'')),'')end,case when p_ownership_type='rented'then p_rental_start_date end,case when p_ownership_type='rented'then p_rental_end_date end,p_model_year,nullif(trim(coalesce(p_vehicle_color,'')),''),nullif(trim(coalesce(p_specifications,'')),''))returning*into r;
  insert into public.garage_driver_assignments(vehicle_id,driver_name,driver_employee_id,shift,sector_id,assigned_by,change_reason)values(r.id,e.full_name,e.id,r.shift,r.sector_id,u,'الإسناد الأول من غرفة العمليات');
  return r;
exception when unique_violation then raise exception'GARAGE_VEHICLE_IDENTIFIER_DUPLICATE';
end$$;

create or replace function public.garage_update_vehicle(p_vehicle_id uuid,p_vehicle_name text,p_db_number text,p_plate_number text,p_chassis_number text,p_image_path text default null,p_vehicle_category text default'other',p_ownership_type text default'owned',p_lessor_name text default null,p_rental_contract_no text default null,p_rental_start_date date default null,p_rental_end_date date default null,p_model_year smallint default null,p_vehicle_color text default null,p_specifications text default null)
returns public.garage_vehicles language plpgsql security definer set search_path=public,app as $$
declare u uuid:=app.require_fleet_master_actor();r public.garage_vehicles;
begin
  if p_ownership_type not in('owned','rented')then raise exception'GARAGE_VEHICLE_FIELDS_INVALID';end if;
  perform app.require_garage_category(p_vehicle_category);
  if p_ownership_type='rented'and length(trim(coalesce(p_lessor_name,'')))<2 then raise exception'GARAGE_LESSOR_REQUIRED';end if;
  if length(trim(coalesce(p_vehicle_name,'')))<2 or length(trim(coalesce(p_db_number,'')))<1 or length(trim(coalesce(p_plate_number,'')))<1 or length(trim(coalesce(p_chassis_number,'')))<3 then raise exception'GARAGE_VEHICLE_FIELDS_REQUIRED';end if;
  if p_image_path is not null and p_image_path not like u::text||'/%'then raise exception'GARAGE_IMAGE_PATH_INVALID';end if;
  update public.garage_vehicles set vehicle_name=trim(p_vehicle_name),db_number=trim(p_db_number),plate_number=trim(p_plate_number),chassis_number=trim(p_chassis_number),image_path=coalesce(nullif(trim(coalesce(p_image_path,'')),''),image_path),vehicle_category=p_vehicle_category,ownership_type=p_ownership_type,lessor_name=case when p_ownership_type='rented'then nullif(trim(coalesce(p_lessor_name,'')),'')end,rental_contract_no=case when p_ownership_type='rented'then nullif(trim(coalesce(p_rental_contract_no,'')),'')end,rental_start_date=case when p_ownership_type='rented'then p_rental_start_date end,rental_end_date=case when p_ownership_type='rented'then p_rental_end_date end,model_year=p_model_year,vehicle_color=nullif(trim(coalesce(p_vehicle_color,'')),''),specifications=nullif(trim(coalesce(p_specifications,'')),''),updated_at=now()
  where id=p_vehicle_id and archived_at is null returning*into r;
  if r.id is null then raise exception'GARAGE_VEHICLE_NOT_FOUND';end if;
  return r;
exception when unique_violation then raise exception'GARAGE_VEHICLE_IDENTIFIER_DUPLICATE';
end$$;

-- ── ② آلية محطة ──
alter table public.garage_vehicles add column is_station_vehicle boolean not null default false;
create index idx_garage_vehicle_station on public.garage_vehicles(is_station_vehicle) where is_station_vehicle and archived_at is null;

create or replace function app.garage_vehicle_allowed(p_vehicle_id uuid)returns boolean language sql stable security definer set search_path=public,app as $$
select case
  when app.has_role(array['ops_room','super_admin'])then true
  when app.has_role(array['central_garage_officer'])then exists(select 1 from public.garage_vehicles v join public.sectors s on s.id=v.sector_id join public.garage_user_profiles gp on gp.user_id=auth.uid() where v.id=p_vehicle_id and s.parent_sector=gp.parent_sector)
  when app.has_role(array['transfer_station'])then exists(select 1 from public.garage_vehicles v where v.id=p_vehicle_id and v.is_station_vehicle)
  else false end$$;

create or replace function public.garage_set_station_vehicle(p_vehicle_id uuid, p_is_station boolean)
returns public.garage_vehicles language plpgsql security definer set search_path=public,app as $$
declare u uuid := auth.uid(); r public.garage_vehicles; old_r public.garage_vehicles;
begin
  if u is null or not app.has_role(array['ops_room','super_admin']) then raise exception 'OPS_ROOM_FORBIDDEN'; end if;
  select * into old_r from public.garage_vehicles where id = p_vehicle_id and archived_at is null;
  if old_r.id is null then raise exception 'GARAGE_VEHICLE_NOT_FOUND'; end if;
  update public.garage_vehicles set is_station_vehicle = coalesce(p_is_station, false), updated_at = now() where id = p_vehicle_id returning * into r;
  insert into public.audit_logs (actor_id, table_name, record_id, operation, old_row, new_row)
  values (u, 'garage_vehicles', r.id, 'UPDATE', jsonb_build_object('is_station_vehicle', old_r.is_station_vehicle), jsonb_build_object('is_station_vehicle', r.is_station_vehicle));
  return r;
end $$;
revoke all on function public.garage_set_station_vehicle(uuid, boolean) from public, anon;
grant execute on function public.garage_set_station_vehicle(uuid, boolean) to authenticated;

-- أسطول المحطة (للمحطة وغرفة العمليات): الفئة + جهاز GPS + السائق الحالي
create or replace function public.station_fleet_list()
returns table(id uuid, vehicle_name text, db_number text, plate_number text, vehicle_category text, category_label text,
              station_outbound boolean, driver_employee_id uuid, driver_name text, has_gps boolean, device_id uuid, ownership_type text)
language plpgsql stable security definer set search_path=public,app as $$
begin
  if auth.uid() is null or not app.has_role(array['transfer_station','ops_room','super_admin']) then raise exception 'STATION_FORBIDDEN'; end if;
  return query
  select v.id, v.vehicle_name, v.db_number, v.plate_number, v.vehicle_category, c.label, c.station_outbound,
         v.driver_employee_id, v.driver_name, (b.device_id is not null), b.device_id, v.ownership_type
  from public.garage_vehicles v
  join public.vehicle_categories c on c.code = v.vehicle_category
  left join public.gps_vehicle_bindings b on b.garage_vehicle_id = v.id
  where v.is_station_vehicle and v.archived_at is null
  order by c.sort, v.db_number;
end $$;
revoke all on function public.station_fleet_list() from public, anon;
grant execute on function public.station_fleet_list() to authenticated;

-- ── ③ الوجهات ──
create table public.station_destinations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 2 and 80),
  geofence_id uuid references public.gps_geofences(id) on delete set null,
  active      boolean not null default true,
  sort        smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);
create unique index uq_station_destination_name on public.station_destinations(lower(trim(name)));
alter table public.station_destinations enable row level security;
create policy "station destinations read" on public.station_destinations for select to authenticated
  using (app.has_role(array['transfer_station','ops_room','it_admin','super_admin','deputy']));
insert into public.station_destinations (id, name, sort) values
  ('00000000-0000-4000-8000-00000000d001', 'النهروان', 1),
  ('00000000-0000-4000-8000-00000000d002', 'النباعي', 2);

create or replace function public.station_destination_save(p_id uuid, p_name text, p_geofence_id uuid default null, p_sort integer default 0, p_active boolean default true)
returns public.station_destinations language plpgsql security definer set search_path=public,app as $$
declare u uuid := auth.uid(); d public.station_destinations; old_d public.station_destinations;
begin
  if u is null or not app.has_role(array['ops_room','super_admin']) then raise exception 'OPS_ROOM_FORBIDDEN'; end if;
  if length(trim(coalesce(p_name,''))) not between 2 and 80 then raise exception 'STATION_DESTINATION_NAME_INVALID'; end if;
  if p_geofence_id is not null and not exists (select 1 from public.gps_geofences g where g.id = p_geofence_id and g.is_active) then raise exception 'STATION_DESTINATION_ZONE_NOT_FOUND'; end if;
  if p_id is null then
    insert into public.station_destinations (name, geofence_id, sort, active, updated_by) values (trim(p_name), p_geofence_id, coalesce(p_sort,0), coalesce(p_active,true), u) returning * into d;
  else
    select * into old_d from public.station_destinations where id = p_id;
    if old_d.id is null then raise exception 'STATION_DESTINATION_NOT_FOUND'; end if;
    update public.station_destinations set name = trim(p_name), geofence_id = p_geofence_id, sort = coalesce(p_sort,0), active = coalesce(p_active,true), updated_at = now(), updated_by = u where id = p_id returning * into d;
  end if;
  insert into public.audit_logs (actor_id, table_name, record_id, operation, old_row, new_row)
  values (u, 'station_destinations', d.id, case when old_d.id is null then 'INSERT' else 'UPDATE' end, to_jsonb(old_d), to_jsonb(d));
  return d;
exception when unique_violation then raise exception 'STATION_DESTINATION_DUPLICATE';
end $$;
revoke all on function public.station_destination_save(uuid,text,uuid,integer,boolean) from public, anon;
grant execute on function public.station_destination_save(uuid,text,uuid,integer,boolean) to authenticated;

create or replace function public.station_destinations_list(p_include_inactive boolean default false)
returns table(id uuid, name text, geofence_id uuid, geofence_name text, has_zone boolean, active boolean, sort smallint)
language plpgsql stable security definer set search_path=public,app as $$
begin
  if auth.uid() is null or not app.has_role(array['transfer_station','ops_room','it_admin','super_admin','deputy']) then raise exception 'STATION_FORBIDDEN'; end if;
  return query
  select d.id, d.name, d.geofence_id, g.name, (g.id is not null and g.is_active), d.active, d.sort
  from public.station_destinations d left join public.gps_geofences g on g.id = d.geofence_id
  where p_include_inactive or d.active order by d.sort, d.name;
end $$;
revoke all on function public.station_destinations_list(boolean) from public, anon;
grant execute on function public.station_destinations_list(boolean) to authenticated;

-- ── ④ السائقون الخارجيون ──
create table public.station_external_drivers (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null check (length(trim(full_name)) between 2 and 120),
  phone           text check (phone is null or phone ~ '^[0-9+]{7,20}$'),
  contractor_name text not null check (length(trim(contractor_name)) between 2 and 120),
  license_no      text check (license_no is null or length(trim(license_no)) between 2 and 60),
  license_image_path text,
  notes           text check (notes is null or length(notes) <= 500),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id)
);
alter table public.station_external_drivers enable row level security;
create policy "station external drivers read" on public.station_external_drivers for select to authenticated
  using (app.has_role(array['transfer_station','ops_room','it_admin','super_admin','deputy']));

create or replace function public.station_external_driver_save(p_id uuid, p_full_name text, p_contractor_name text, p_phone text default null, p_license_no text default null, p_license_image_path text default null, p_notes text default null, p_active boolean default true)
returns public.station_external_drivers language plpgsql security definer set search_path=public,app as $$
declare u uuid := auth.uid(); d public.station_external_drivers; old_d public.station_external_drivers;
begin
  if u is null or not app.has_role(array['ops_room','super_admin']) then raise exception 'OPS_ROOM_FORBIDDEN'; end if;
  if length(trim(coalesce(p_full_name,''))) not between 2 and 120 then raise exception 'STATION_DRIVER_NAME_INVALID'; end if;
  if length(trim(coalesce(p_contractor_name,''))) not between 2 and 120 then raise exception 'STATION_DRIVER_CONTRACTOR_REQUIRED'; end if;
  if p_phone is not null and nullif(trim(p_phone),'') is not null and trim(p_phone) !~ '^[0-9+]{7,20}$' then raise exception 'STATION_DRIVER_PHONE_INVALID'; end if;
  if p_id is null then
    insert into public.station_external_drivers (full_name, contractor_name, phone, license_no, license_image_path, notes, active, updated_by)
    values (trim(p_full_name), trim(p_contractor_name), nullif(trim(coalesce(p_phone,'')),''), nullif(trim(coalesce(p_license_no,'')),''), nullif(trim(coalesce(p_license_image_path,'')),''), nullif(trim(coalesce(p_notes,'')),''), coalesce(p_active,true), u)
    returning * into d;
  else
    select * into old_d from public.station_external_drivers where id = p_id;
    if old_d.id is null then raise exception 'STATION_DRIVER_NOT_FOUND'; end if;
    update public.station_external_drivers set full_name = trim(p_full_name), contractor_name = trim(p_contractor_name), phone = nullif(trim(coalesce(p_phone,'')),''),
      license_no = nullif(trim(coalesce(p_license_no,'')),''), license_image_path = nullif(trim(coalesce(p_license_image_path,'')),''), notes = nullif(trim(coalesce(p_notes,'')),''),
      active = coalesce(p_active,true), updated_at = now(), updated_by = u where id = p_id returning * into d;
  end if;
  insert into public.audit_logs (actor_id, table_name, record_id, operation, old_row, new_row)
  values (u, 'station_external_drivers', d.id, case when old_d.id is null then 'INSERT' else 'UPDATE' end, to_jsonb(old_d), to_jsonb(d));
  return d;
end $$;
revoke all on function public.station_external_driver_save(uuid,text,text,text,text,text,text,boolean) from public, anon;
grant execute on function public.station_external_driver_save(uuid,text,text,text,text,text,text,boolean) to authenticated;

-- السائقون المتاحون للمحطة: موظفون سائقون + خارجيون (قائمة واحدة مرتّبة)
create or replace function public.station_drivers_list()
returns table(driver_kind text, ref_id uuid, full_name text, detail text, phone text)
language plpgsql stable security definer set search_path=public,app as $$
begin
  if auth.uid() is null or not app.has_role(array['transfer_station','ops_room','super_admin']) then raise exception 'STATION_FORBIDDEN'; end if;
  return query
  select 'employee'::text, e.id, e.full_name, coalesce(e.job_title, 'موظف') || ' · ' || e.employee_number, e.phone
  from public.employees e where e.is_driver and e.employment_status <> 'terminated' and e.archived_at is null
  union all
  select 'external'::text, x.id, x.full_name, 'متعهد: ' || x.contractor_name, x.phone
  from public.station_external_drivers x where x.active
  order by 1, 3;
end $$;
revoke all on function public.station_drivers_list() from public, anon;
grant execute on function public.station_drivers_list() to authenticated;

-- ── ⑤ أعمدة الربط على سجلات الخروج ──
do $$
declare t text;
begin
  foreach t in array array['ts_saksat_records','ts_carrier_records'] loop
    execute format($f$
      alter table public.%1$I
        add column vehicle_id uuid references public.garage_vehicles(id),
        add column vehicle_category text references public.vehicle_categories(code),
        add column driver_kind text not null default 'legacy' check (driver_kind in ('legacy','employee','external','contracted')),
        add column driver_employee_id uuid references public.employees(id),
        add column external_driver_id uuid references public.station_external_drivers(id),
        add column destination_id uuid references public.station_destinations(id),
        add column tracking text not null default 'none' check (tracking in ('gps','none')),
        add column device_id uuid references public.gps_devices(id) on delete set null,
        add column shift_name text,
        add column exited_by uuid references auth.users(id),
        add column arrived_at timestamptz,
        add column arrival_latitude double precision,
        add column arrival_longitude double precision,
        add constraint %1$s_driver_ref_check check (
          (driver_kind = 'legacy') or
          (driver_kind = 'employee' and driver_employee_id is not null and external_driver_id is null) or
          (driver_kind = 'external' and external_driver_id is not null and driver_employee_id is null) or
          (driver_kind = 'contracted' and driver_employee_id is null and external_driver_id is null)),
        add constraint %1$s_arrival_check check (arrived_at is null or arrived_at >= exit_time)
    $f$, t);
    execute format('create index idx_%1$s_open_tracking on public.%1$I(device_id, exit_time) where arrived_at is null and tracking = ''gps'' and archived_at is null', t);
    execute format('create index idx_%1$s_vehicle on public.%1$I(vehicle_id, exit_time desc) where vehicle_id is not null', t);
  end loop;
end $$;

-- ── ⑥ تسجيل الخروج من القوائم ──
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
    if v.ownership_type <> 'rented' then raise exception 'STATION_CONTRACTED_REQUIRES_RENTED_VEHICLE'; end if;
    if length(trim(coalesce(p_driver_name,''))) not between 2 and 120 then raise exception 'STATION_DRIVER_NAME_INVALID'; end if;
    drv := trim(p_driver_name);
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
revoke all on function public.station_record_exit(uuid,text,uuid,uuid,uuid,text,numeric,date) from public, anon;
grant execute on function public.station_record_exit(uuid,text,uuid,uuid,uuid,text,numeric,date) to authenticated;

-- ── ⑦ الوصول آلياً من GPS ──
create or replace function app.station_mark_arrivals(p_device_id uuid, p_lat double precision, p_lng double precision, p_fix timestamptz)
returns integer language plpgsql security definer set search_path=public,app as $$
declare n integer := 0; r record; t text;
begin
  if p_device_id is null or p_lat is null or p_lng is null or p_fix is null then return 0; end if;
  foreach t in array array['ts_saksat_records','ts_carrier_records'] loop
    for r in execute format($q$
      select s.id, s.driver_name, s.vehicle_type, v.db_number, d.name dest_name, s.exit_time
      from public.%I s
      join public.station_destinations d on d.id = s.destination_id
      join public.gps_geofences g on g.id = d.geofence_id and g.is_active
      left join public.garage_vehicles v on v.id = s.vehicle_id
      where s.device_id = $1 and s.arrived_at is null and s.tracking = 'gps' and s.archived_at is null
        and s.exit_time <= $2 and s.exit_time >= $2 - interval '24 hours'
        and app.gps_point_in_polygon($3, $4, g.polygon)
      for update of s skip locked $q$, t) using p_device_id, p_fix, p_lat, p_lng
    loop
      execute format('update public.%I set arrived_at = $1, arrival_latitude = $2, arrival_longitude = $3 where id = $4', t) using p_fix, p_lat, p_lng, r.id;
      insert into public.notifications (user_id, title, body, type, link)
      select ur.user_id, 'وصلت الآلية إلى ' || r.dest_name,
        format('%s DB %s بقيادة %s وصلت إلى %s بعد %s دقيقة من الخروج', coalesce(r.vehicle_type,'آلية'), coalesce(r.db_number,'—'), r.driver_name, r.dest_name,
               greatest(0, floor(extract(epoch from (p_fix - r.exit_time)) / 60))::int),
        'success', '/ops-room/station-outbound'
      from public.user_roles ur where ur.role = 'ops_room';
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function app.station_mark_arrivals(uuid,double precision,double precision,timestamptz) from public, anon;

create or replace function app.station_arrival_on_position() returns trigger language plpgsql security definer set search_path=public,app as $$
begin
  perform app.station_mark_arrivals(new.device_id, new.latitude, new.longitude, new.fix_time);
  return new;
end $$;
create trigger trg_station_arrival_live after insert or update of latitude, longitude, fix_time on public.gps_device_positions
  for each row execute function app.station_arrival_on_position();
create trigger trg_station_arrival_history after insert on public.gps_device_position_history
  for each row execute function app.station_arrival_on_position();

-- ── سجل الخروج الموحّد (غرفة العمليات + المحطة) ──
create or replace function public.station_outbound_list(p_from date, p_to date, p_only_open boolean default false)
returns table(id uuid, source text, exit_time timestamptz, log_date date, vehicle_id uuid, db_number text, vehicle_category text, category_label text,
              driver_kind text, driver_name text, destination_id uuid, destination_name text, tracking text, arrived_at timestamptz,
              minutes_to_arrival integer, shift_name text, weight_tons numeric, status text)
language plpgsql stable security definer set search_path=public,app as $$
begin
  if auth.uid() is null or not app.has_role(array['transfer_station','ops_room','super_admin','deputy']) then raise exception 'STATION_FORBIDDEN'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 92 then raise exception 'STATION_DATE_RANGE_INVALID'; end if;
  return query
  with u as (
    select s.id, 'saksat'::text src, s.exit_time, s.log_date, s.vehicle_id, s.vehicle_category, s.driver_kind, s.driver_name, s.destination_id, s.tracking, s.arrived_at, s.shift_name, s.weight_tons, s.vehicle_type, s.archived_at
    from public.ts_saksat_records s
    union all
    select s.id, 'carrier', s.exit_time, s.log_date, s.vehicle_id, s.vehicle_category, s.driver_kind, s.driver_name, s.destination_id, s.tracking, s.arrived_at, s.shift_name, s.weight_tons, s.vehicle_type, s.archived_at
    from public.ts_carrier_records s)
  select u.id, u.src, u.exit_time, u.log_date, u.vehicle_id, v.db_number, u.vehicle_category, coalesce(c.label, u.vehicle_type),
         u.driver_kind, u.driver_name, u.destination_id, d.name, u.tracking, u.arrived_at,
         case when u.arrived_at is null then null else floor(extract(epoch from (u.arrived_at - u.exit_time)) / 60)::int end,
         u.shift_name, u.weight_tons,
         case when u.arrived_at is not null then 'arrived' when u.destination_id is null then 'legacy' when u.tracking = 'none' then 'untracked' else 'en_route' end
  from u left join public.garage_vehicles v on v.id = u.vehicle_id left join public.vehicle_categories c on c.code = u.vehicle_category
         left join public.station_destinations d on d.id = u.destination_id
  where u.archived_at is null and u.log_date between p_from and p_to
    and (not p_only_open or (u.arrived_at is null and u.destination_id is not null))
  order by u.exit_time desc;
end $$;
revoke all on function public.station_outbound_list(date,date,boolean) from public, anon;
grant execute on function public.station_outbound_list(date,date,boolean) to authenticated;
