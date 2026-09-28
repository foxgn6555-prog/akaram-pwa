-- 00147 · تدقيق دورة حياة الانطلاقة (كراج → عمل → محطة/صيانة → كراج) وإصلاح ما كشفه الاختبار التكاملي
--         tests/db/trip-lifecycle-test.sql. كل إصلاح هنا جذري ومغطى بفحص.

-- ① maintenance_update_case كان يمسح التشخيص/ملاحظات العمل/القطع/الموعد المتوقع/الكلفة التقديرية/سبب التأخير
--    عند أي تحديث لا يعيد إرسالها (nullif بدل coalesce) ⇒ فقدان بيانات صامت، ويفشل اعتماد الجاهزية لاحقاً
--    (MAINTENANCE_READINESS_NOT_APPROVABLE) لأن التشخيص المسجّل في مرحلة التشخيص اختفى.
--    الحل: القيم غير المرسلة تُحفظ كما هي؛ لمسح حقل يُرسل نص فارغ صراحة ('').
create or replace function public.maintenance_update_case(p_case_id uuid,p_status text,p_progress integer,p_diagnosis text default null,p_work_notes text default null,p_parts_notes text default null,p_expected_completion_at timestamptz default null,p_assigned_technician text default null,p_estimated_cost numeric default null,p_actual_cost numeric default null,p_delay_reason text default null,p_assigned_technician_id uuid default null)
returns public.vehicle_maintenance_cases language plpgsql security definer set search_path=public,app as $$
declare u uuid:=auth.uid();c public.vehicle_maintenance_cases;tech_name text;
begin
  if not app.has_role(array['maintenance'])then raise exception 'MAINTENANCE_FORBIDDEN';end if;
  if p_status not in('at_maintenance','diagnosing','waiting_parts','in_repair','paused','ready')or p_progress not between 0 and 100 then raise exception 'MAINTENANCE_UPDATE_INVALID';end if;
  if p_status='ready'and(p_progress<>100 or exists(select 1 from public.vehicle_maintenance_parts where case_id=p_case_id and part_status='issued'))then raise exception 'MAINTENANCE_READY_REQUIRES_INSTALLED_PARTS';end if;
  if p_actual_cost<0 or p_estimated_cost<0 then raise exception 'MAINTENANCE_COST_INVALID';end if;
  if p_assigned_technician_id is not null then
    select coalesce(nullif(trim(e.full_name),''),au.email,p_assigned_technician_id::text)into tech_name from auth.users au left join public.employees e on e.user_id=au.id where au.id=p_assigned_technician_id and exists(select 1 from public.user_roles ur where ur.user_id=au.id and ur.role='maintenance');
    if not found then raise exception 'MAINTENANCE_TECHNICIAN_INVALID';end if;
  else tech_name:=nullif(trim(coalesce(p_assigned_technician,'')),'');end if;
  update public.vehicle_maintenance_cases set
    status=p_status,progress=p_progress,
    diagnosis=case when p_diagnosis is null then diagnosis else nullif(trim(p_diagnosis),'') end,
    work_notes=case when p_work_notes is null then work_notes else nullif(trim(p_work_notes),'') end,
    parts_notes=case when p_parts_notes is null then parts_notes else nullif(trim(p_parts_notes),'') end,
    expected_completion_at=coalesce(p_expected_completion_at,expected_completion_at),
    assigned_technician=coalesce(tech_name,assigned_technician),assigned_technician_id=coalesce(p_assigned_technician_id,assigned_technician_id),
    estimated_cost=coalesce(p_estimated_cost,estimated_cost),
    service_cost=coalesce(p_actual_cost,service_cost),actual_cost=coalesce(p_actual_cost,service_cost)+parts_actual_cost,
    delay_reason=case when p_delay_reason is null then delay_reason else nullif(trim(p_delay_reason),'') end,
    ready_at=case when p_status='ready'then coalesce(ready_at,now())else ready_at end,
    ready_declared_by=case when p_status='ready'then u else ready_declared_by end,
    readiness_approved_at=case when p_status='ready'then null else readiness_approved_at end,
    readiness_approved_by=case when p_status='ready'then null else readiness_approved_by end,
    readiness_approval_notes=case when p_status='ready'then null else readiness_approval_notes end,
    updated_at=now()
  where id=p_case_id and arrived_at is not null and completed_at is null returning * into c;
  if not found then raise exception 'MAINTENANCE_CASE_NOT_OPEN';end if;
  insert into public.vehicle_maintenance_updates(case_id,status,progress,diagnosis,work_notes,parts_notes,assigned_technician,assigned_technician_id,estimated_cost,actual_cost,delay_reason,expected_completion_at,created_by)
  values(c.id,c.status,c.progress,c.diagnosis,c.work_notes,c.parts_notes,c.assigned_technician,c.assigned_technician_id,c.estimated_cost,c.actual_cost,c.delay_reason,c.expected_completion_at,u);
  return c;
end$$;

-- ② تفكيك دقائق الانطلاقة من مصدر واحد (app.trip_minutes) تستخدمه كل تقارير غرفة العمليات.
--    ما كان خاطئاً:
--    · operational_vehicle_kpis: رحلة العودة من الموقع إلى الكراج لم تُحتسب حركة (كانت «غير مصنف»)،
--      والساق المفتوحة (في الطريق الآن) لم تُحتسب حركة أيضاً.
--    · operational_garage_trips.work_minutes اعتمد site_departed_at الذي يُثبَّت عند أول مغادرة (زيارة محطة)
--      فيهمل كل وقت العمل بعد أول زيارة ⇒ أرقام مختلفة عن مؤشرات الآليات لنفس الانطلاقة.
--    الآن: الإجمالي = حركة + عمل منتج + محطة + صيانة + غير مصنف (هوية مضمونة)، والتقريران متطابقان.
create or replace function app.trip_minutes(p_departure_id uuid)
returns table(total_minutes integer,movement_minutes integer,productive_minutes integer,station_minutes integer,maintenance_minutes integer,downtime_minutes integer,other_minutes integer,station_visit_count integer,breakdown_count integer,maintenance_count integer)
language plpgsql stable security definer set search_path=public,app as $$
declare d public.garage_departures; fin timestamptz; tot int; mov int; st int; mnt int; dt int; sf int; site int; last_leg_arrival timestamptz;
begin
  select * into d from public.garage_departures where id=p_departure_id;
  if not found then return; end if;
  fin:=coalesce(d.returned_at,now());
  tot:=floor(extract(epoch from(fin-d.departed_at))/60)::int;
  -- الحركة: كراج→موقع + كل السيقان (المغلقة حتى وصولها، والمفتوحة حتى الآن) + العودة المباشرة من الموقع إلى الكراج
  mov:=floor(extract(epoch from(coalesce(d.arrived_at,fin)-d.departed_at))/60)::int
      +coalesce((select sum(floor(extract(epoch from(coalesce(l.arrived_at,fin)-l.departed_at))/60)::int) from public.vehicle_trip_legs l where l.departure_id=d.id),0)::int;
  select max(l.arrived_at) into last_leg_arrival from public.vehicle_trip_legs l where l.departure_id=d.id;
  if d.site_departed_at is not null and d.arrived_at is not null
     and not exists(select 1 from public.vehicle_trip_legs l where l.departure_id=d.id and l.arrived_at is null)
     and not exists(select 1 from public.vehicle_trip_legs l where l.departure_id=d.id and l.destination_type='garage')
     and (last_leg_arrival is null or d.site_departed_at>=last_leg_arrival) then
    mov:=mov+floor(extract(epoch from(fin-d.site_departed_at))/60)::int;
  end if;
  -- المحطة: من تأكيد الوصول حتى مغادرتها (أو الآن)
  st:=coalesce((select sum(floor(extract(epoch from(coalesce(o.departed_at,fin)-i.arrived_at))/60)::int)
        from public.vehicle_trip_legs i left join public.vehicle_trip_legs o on o.departure_id=i.departure_id and o.sequence_no=i.sequence_no+1 and o.origin_type='transfer_station'
        where i.departure_id=d.id and i.destination_type='transfer_station' and i.arrived_at is not null),0)::int;
  -- الصيانة: من وصول الورشة حتى مغادرتها (أو الإغلاق أو الآن)
  mnt:=coalesce((select sum(floor(extract(epoch from(coalesce(c.departed_maintenance_at,c.completed_at,fin)-c.arrived_at))/60)::int) from public.vehicle_maintenance_cases c where c.departure_id=d.id and c.arrived_at is not null),0)::int;
  -- الأعطال: كل بلاغ من تسجيله حتى حله (أو الآن)؛ والقصيرة (بلا حالة صيانة) تُخصم من العمل المنتج
  dt:=coalesce((select sum(floor(extract(epoch from(coalesce(b.resolved_at,fin)-b.created_at))/60)::int) from public.sector_breakdowns b where b.departure_id=d.id),0)::int;
  sf:=coalesce((select sum(floor(extract(epoch from(coalesce(b.resolved_at,fin)-b.created_at))/60)::int) from public.sector_breakdowns b where b.departure_id=d.id and not exists(select 1 from public.vehicle_maintenance_cases c where c.breakdown_id=b.id)),0)::int;
  site:=greatest(0,tot-mov-st-mnt);
  total_minutes:=tot; movement_minutes:=least(mov,tot); station_minutes:=st; maintenance_minutes:=mnt; downtime_minutes:=dt;
  productive_minutes:=greatest(0,site-sf); other_minutes:=greatest(0,tot-movement_minutes-productive_minutes-st-mnt);
  station_visit_count:=(select count(*) from public.vehicle_trip_legs i where i.departure_id=d.id and i.destination_type='transfer_station')::int;
  breakdown_count:=(select count(*) from public.sector_breakdowns b where b.departure_id=d.id)::int;
  maintenance_count:=(select count(*) from public.vehicle_maintenance_cases c where c.departure_id=d.id)::int;
  return next;
end$$;
revoke all on function app.trip_minutes(uuid) from public,anon;

create or replace function public.operational_vehicle_kpis(p_from date,p_to date,p_search text default null,p_sector_id smallint default null,p_shift text default null)
returns table(departure_id uuid,vehicle_id uuid,vehicle_name text,db_number text,driver_name text,shift text,sector_id smallint,area_name text,manager_name text,started_at timestamptz,completed_at timestamptz,total_minutes integer,movement_minutes integer,productive_minutes integer,station_minutes integer,maintenance_minutes integer,downtime_minutes integer,other_minutes integer,station_visit_count integer,breakdown_count integer,maintenance_count integer)
language plpgsql stable security definer set search_path=public,app as $$
begin
 if not app.has_role(array['ops_room','super_admin']) then raise exception 'OPS_ROOM_FORBIDDEN';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'OPS_DATE_RANGE_INVALID';end if;
 if p_shift is not null and p_shift not in('morning','evening','night') then raise exception 'OPS_SHIFT_INVALID';end if;
 return query
 select d.id,d.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.shift,d.sector_id,s.name,d.recipient_manager_name,d.departed_at,d.returned_at,
        m.total_minutes,m.movement_minutes,m.productive_minutes,m.station_minutes,m.maintenance_minutes,m.downtime_minutes,m.other_minutes,m.station_visit_count,m.breakdown_count,m.maintenance_count
 from public.garage_departures d join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
 cross join lateral app.trip_minutes(d.id) m
 where(d.departed_at at time zone 'Asia/Baghdad')::date between p_from and p_to
  and(p_search is null or trim(p_search)='' or v.db_number ilike '%'||trim(p_search)||'%' or v.vehicle_name ilike '%'||trim(p_search)||'%' or d.driver_name ilike '%'||trim(p_search)||'%' or d.recipient_manager_name ilike '%'||trim(p_search)||'%')
  and(p_sector_id is null or d.sector_id=p_sector_id) and(p_shift is null or d.shift=p_shift)
 order by d.departed_at desc;
end$$;

create or replace function public.operational_garage_trips(p_from date,p_to date)
returns table(id uuid,vehicle_id uuid,vehicle_name text,db_number text,driver_name text,shift text,area_name text,manager_name text,departed_at timestamptz,arrived_at timestamptz,site_departed_at timestamptz,returned_at timestamptz,total_minutes integer,work_minutes integer,downtime_minutes integer)
language plpgsql stable security definer set search_path=public,app as $$
begin
 if not app.has_role(array['ops_room','super_admin']) then raise exception 'OPS_ROOM_FORBIDDEN';end if;
 return query select d.id,d.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.shift,s.name,d.recipient_manager_name,d.departed_at,d.arrived_at,d.site_departed_at,d.returned_at,
  case when d.returned_at is null then null else m.total_minutes end,
  case when d.arrived_at is null then null else m.productive_minutes end,
  m.downtime_minutes
 from public.garage_departures d join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
 cross join lateral app.trip_minutes(d.id) m
 where(d.departed_at at time zone 'Asia/Baghdad')::date between p_from and p_to order by d.departed_at desc;
end$$;

-- ③ station_dispatch_vehicle (00082) لم يشترط إكمال الوزن؛ الواجهة فقط كانت تخفي الأزرار.
--    العقد: الوزن يدوي إلزامي من موظف المحطة قبل أي خروج (للعمل أو الكراج) — يُفرض الآن في الخادم.
create or replace function public.station_dispatch_vehicle(p_departure_id uuid,p_destination text,p_notes text default null)
returns public.vehicle_trip_legs language plpgsql security definer set search_path=public,app as $$
declare u uuid:=auth.uid();d public.garage_departures;l public.vehicle_trip_legs;i public.vehicle_trip_legs;dest text;
begin
 if not app.has_role(array['transfer_station']) then raise exception 'STATION_FORBIDDEN';end if;
 dest:=case p_destination when 'work_site' then 'work_site' when 'garage' then 'garage' else null end;
 if dest is null then raise exception 'STATION_DESTINATION_INVALID';end if;
 if length(coalesce(p_notes,''))>1000 then raise exception 'TRIP_NOTES_TOO_LONG';end if;
 select * into d from public.garage_departures where id=p_departure_id and returned_at is null for update;
 if not found or exists(select 1 from public.vehicle_trip_legs where departure_id=d.id and arrived_at is null) then raise exception 'VEHICLE_NOT_AT_STATION';end if;
 select * into i from public.vehicle_trip_legs where departure_id=d.id and destination_type='transfer_station' and arrived_at is not null order by sequence_no desc limit 1;
 if not found or exists(select 1 from public.vehicle_trip_legs o where o.departure_id=d.id and o.sequence_no>i.sequence_no) then raise exception 'VEHICLE_NOT_AT_STATION';end if;
 if not exists(select 1 from public.ts_visit_weighing_steps s where s.visit_leg_id=i.id and s.completed_at is not null) then raise exception 'STATION_WEIGHING_REQUIRED';end if;
 insert into public.vehicle_trip_legs(departure_id,sequence_no,origin_type,destination_type,departed_by,departure_notes)
 values(d.id,app.next_trip_leg_sequence(d.id),'transfer_station',dest,u,nullif(trim(coalesce(p_notes,'')),'')) returning * into l;
 if dest='work_site' then
   insert into public.notifications(user_id,title,body,type,link) values(d.recipient_manager_id,'الآلية عائدة إلى موقع العمل',format('غادرت الآلية DB %s المحطة باتجاه موقعك',(select db_number from public.garage_vehicles where id=d.vehicle_id)),'info','/manager/vehicle-trips');
 else
   insert into public.notifications(user_id,title,body,type,link) values(d.recipient_manager_id,'الآلية غادرت المحطة إلى الكراج',format('الآلية DB %s لن تعود للموقع وغادرت باتجاه الكراج',(select db_number from public.garage_vehicles where id=d.vehicle_id)),'warning','/manager/vehicle-trips');
   insert into public.notifications(user_id,title,body,type,link) values(d.departed_by,'آلية في الطريق من المحطة إلى الكراج',format('الآلية DB %s في الطريق إلى الكراج',(select db_number from public.garage_vehicles where id=d.vehicle_id)),'info','/central-garage/drivers-dispatch');
 end if;
 return l;
end$$;

-- ④ ربط السائق بموظف الموارد البشرية (السائقون موظفون لهم بصمة). لا اسم حرّ بعد اليوم:
--    غرفة العمليات تختار السائق من قائمة الموظفين عند إضافة الآلية/تغيير السائق/تغيير سائق انطلاقة،
--    والاسم يُشتق من ملف الموظف ويبقى نسخة مجمّدة في كل انطلاقة (تاريخياً صحيح).
alter table public.employees add column if not exists is_driver boolean not null default false;
comment on column public.employees.is_driver is 'يقود آليات الشركة (يظهر في قائمة سائقي غرفة العمليات بغض النظر عن العنوان الوظيفي)';
alter table public.garage_vehicles add column if not exists driver_employee_id uuid references public.employees(id);
alter table public.garage_driver_assignments add column if not exists driver_employee_id uuid references public.employees(id);
alter table public.garage_vehicle_shift_assignments add column if not exists driver_employee_id uuid references public.employees(id);
alter table public.garage_departures add column if not exists driver_employee_id uuid references public.employees(id);
create index if not exists idx_garage_departures_driver_emp on public.garage_departures(driver_employee_id, departed_at desc);
create index if not exists idx_garage_vehicles_driver_emp on public.garage_vehicles(driver_employee_id);

-- ترحيل البيانات التجريبية الحالية: مطابقة الاسم الكامل تماماً؛ ما لم يطابق يبقى بلا رابط ويظهر لغرفة العمليات لتصحيحه
update public.garage_vehicles v set driver_employee_id = e.id from public.employees e where v.driver_employee_id is null and lower(trim(v.driver_name)) = lower(trim(e.full_name)) and e.employment_status <> 'terminated';
update public.garage_driver_assignments a set driver_employee_id = e.id from public.employees e where a.driver_employee_id is null and lower(trim(a.driver_name)) = lower(trim(e.full_name));
update public.garage_vehicle_shift_assignments a set driver_employee_id = e.id from public.employees e where a.driver_employee_id is null and lower(trim(a.driver_name)) = lower(trim(e.full_name));
update public.garage_departures d set driver_employee_id = e.id from public.employees e where d.driver_employee_id is null and lower(trim(d.driver_name)) = lower(trim(e.full_name));

-- السائق المؤهل: موظف مسجّل وغير مُنهى الخدمة (مرن: لا نشترط العنوان الوظيفي)
create or replace function app.require_fleet_driver(p_employee_id uuid) returns public.employees
language plpgsql stable security definer set search_path=public,app as $$
declare e public.employees;
begin
  if p_employee_id is null then raise exception 'FLEET_DRIVER_REQUIRED'; end if;
  select * into e from public.employees where id = p_employee_id;
  if not found then raise exception 'FLEET_DRIVER_NOT_FOUND'; end if;
  if e.employment_status = 'terminated' then raise exception 'FLEET_DRIVER_TERMINATED'; end if;
  return e;
end$$;
revoke all on function app.require_fleet_driver(uuid) from public, anon;

-- قائمة السائقين لغرفة العمليات: من فُعّلت له خانة «سائق» أو عنوانه الوظيفي يحوي «سائق»، مع بحث حر يشمل كل الموظفين
create or replace function public.fleet_driver_options(p_search text default null, p_all boolean default false)
returns table(employee_id uuid, full_name text, employee_number text, job_title text, department_name text, has_biometric boolean, employment_status text, assigned_vehicles text[])
language plpgsql stable security definer set search_path=public,app as $$
declare q text := trim(coalesce(p_search, ''));
begin
  perform app.require_fleet_master_actor();
  return query
  select e.id, e.full_name, e.employee_number, e.job_title, d.name, e.biometric_pin is not null, e.employment_status,
         coalesce((select array_agg(distinct v.db_number order by v.db_number) from public.garage_vehicle_shift_assignments a join public.garage_vehicles v on v.id = a.vehicle_id where a.driver_employee_id = e.id and a.ends_at is null and v.archived_at is null), '{}')
  from public.employees e left join public.departments d on d.id = e.department_id
  where e.employment_status <> 'terminated'
    and (p_all or e.is_driver or coalesce(e.job_title, '') ilike '%سائق%' or (q <> '' and (e.full_name ilike '%' || q || '%' or e.employee_number ilike '%' || q || '%')))
    and (q = '' or e.full_name ilike '%' || q || '%' or e.employee_number ilike '%' || q || '%' or coalesce(e.job_title, '') ilike '%' || q || '%')
  order by e.full_name limit 200;
end$$;
revoke all on function public.fleet_driver_options(text, boolean) from public, anon;
grant execute on function public.fleet_driver_options(text, boolean) to authenticated;

-- ⑤ إضافة آلية: السائق موظف
drop function if exists public.garage_add_vehicle(text,text,text,text,text,text,text,smallint,text,text,text,text,date,date,smallint,text,text);
create function public.garage_add_vehicle(p_vehicle_name text,p_db_number text,p_plate_number text,p_chassis_number text,p_image_path text,p_shift text,p_driver_employee_id uuid,p_sector_id smallint,p_vehicle_category text default 'other',p_ownership_type text default 'owned',p_lessor_name text default null,p_rental_contract_no text default null,p_rental_start_date date default null,p_rental_end_date date default null,p_model_year smallint default null,p_vehicle_color text default null,p_specifications text default null)
returns public.garage_vehicles language plpgsql security definer set search_path=public,app as $$
declare u uuid:=app.require_fleet_master_actor();r public.garage_vehicles;e public.employees;
begin
  if p_shift not in('morning','evening','night')then raise exception'GARAGE_SHIFT_INVALID';end if;
  if p_vehicle_category not in('compactor_small','compactor_large','truck','shovel','tipper','tanker','sweeper','strat','other')then raise exception'GARAGE_VEHICLE_CATEGORY_INVALID';end if;
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
revoke all on function public.garage_add_vehicle(text,text,text,text,text,text,uuid,smallint,text,text,text,text,date,date,smallint,text,text) from public,anon;
grant execute on function public.garage_add_vehicle(text,text,text,text,text,text,uuid,smallint,text,text,text,text,date,date,smallint,text,text) to authenticated;

-- ⑥ الإسناد الأول/الرئيسي يُزامَن إلى إسناد الشفت: كان «on conflict do nothing» فيبقى السائق القديم نشطاً في الشفت
--    ⇒ تغيير السائق من غرفة العمليات لا يصل إلى الانطلاقة (تنطلق باسم القديم). الآن يُغلق الإسناد النشط لنفس الشفت ويُستبدل.
create or replace function app.sync_initial_garage_shift_assignment() returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.garage_vehicle_shift_assignments set ends_at=new.starts_at, change_reason=coalesce(new.change_reason,'تحديث الإسناد الرئيسي')
   where vehicle_id=new.vehicle_id and shift=new.shift and ends_at is null and (driver_name is distinct from new.driver_name or sector_id is distinct from new.sector_id or driver_employee_id is distinct from new.driver_employee_id);
  insert into public.garage_vehicle_shift_assignments(vehicle_id,shift,driver_name,driver_employee_id,sector_id,starts_at,change_reason,created_by)
  values(new.vehicle_id,new.shift,new.driver_name,new.driver_employee_id,new.sector_id,new.starts_at,coalesce(new.change_reason,'إنشاء الإسناد الأول مع الآلية'),new.assigned_by)
  on conflict do nothing;
  return new;
end$$;

drop function if exists public.garage_assign_driver(uuid,text,text,smallint,text);
create function public.garage_assign_driver(p_vehicle_id uuid,p_driver_employee_id uuid,p_shift text,p_sector_id smallint,p_reason text default null)
returns public.garage_driver_assignments language plpgsql security definer set search_path=public,app as $$
declare u uuid:=app.require_fleet_master_actor();r public.garage_driver_assignments;e public.employees;
begin
  if p_shift not in('morning','evening','night')or not exists(select 1 from public.sectors where id=p_sector_id)then raise exception'GARAGE_ASSIGNMENT_INVALID';end if;
  e:=app.require_fleet_driver(p_driver_employee_id);
  if exists(select 1 from public.garage_departures where vehicle_id=p_vehicle_id and returned_at is null)then raise exception'GARAGE_VEHICLE_IN_FIELD';end if;
  update public.garage_driver_assignments set ends_at=now(),change_reason=coalesce(nullif(trim(coalesce(p_reason,'')),''),change_reason)where vehicle_id=p_vehicle_id and ends_at is null;
  insert into public.garage_driver_assignments(vehicle_id,driver_name,driver_employee_id,shift,sector_id,assigned_by,change_reason)values(p_vehicle_id,e.full_name,e.id,p_shift,p_sector_id,u,nullif(trim(coalesce(p_reason,'')),''))returning*into r;
  update public.garage_vehicles set driver_name=r.driver_name,driver_employee_id=r.driver_employee_id,shift=r.shift,sector_id=r.sector_id where id=p_vehicle_id and archived_at is null;
  if not found then raise exception'GARAGE_VEHICLE_NOT_FOUND';end if;
  return r;
end$$;
revoke all on function public.garage_assign_driver(uuid,uuid,text,smallint,text) from public,anon;
grant execute on function public.garage_assign_driver(uuid,uuid,text,smallint,text) to authenticated;

drop function if exists public.garage_set_vehicle_shift_assignment(uuid,text,text,smallint,text);
create function public.garage_set_vehicle_shift_assignment(p_vehicle_id uuid,p_shift text,p_driver_employee_id uuid,p_sector_id smallint,p_reason text)
returns public.garage_vehicle_shift_assignments language plpgsql security definer set search_path=public,app as $$
declare u uuid:=app.require_fleet_master_actor();r public.garage_vehicle_shift_assignments;e public.employees;
begin
  if p_shift not in('morning','evening','night')or length(trim(coalesce(p_reason,'')))<3 then raise exception'GARAGE_SHIFT_ASSIGNMENT_INVALID';end if;
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
revoke all on function public.garage_set_vehicle_shift_assignment(uuid,text,uuid,smallint,text) from public,anon;
grant execute on function public.garage_set_vehicle_shift_assignment(uuid,text,uuid,smallint,text) to authenticated;

-- ⑦ كل انطلاقة تحمل هوية السائق من إسناد الشفت النشط (يغطي كل مسارات الإنشاء)
create or replace function app.fill_departure_driver() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.driver_employee_id is null then
    select a.driver_employee_id into new.driver_employee_id from public.garage_vehicle_shift_assignments a where a.vehicle_id=new.vehicle_id and a.shift=new.shift and a.ends_at is null;
  end if;
  if new.driver_employee_id is null then
    select e.id into new.driver_employee_id from public.employees e where lower(trim(e.full_name))=lower(trim(new.driver_name)) and e.employment_status<>'terminated' order by e.hire_date desc limit 1;
  end if;
  return new;
end$$;
drop trigger if exists trg_fill_departure_driver on public.garage_departures;
create trigger trg_fill_departure_driver before insert on public.garage_departures for each row execute function app.fill_departure_driver();

-- ⑧ تغيير سائق انطلاقة (غرفة العمليات فقط)
alter table public.audit_logs drop constraint if exists audit_logs_operation_check;
alter table public.audit_logs add constraint audit_logs_operation_check
  check (operation in ('INSERT','UPDATE','DELETE','ARCHIVE','RESTORE','SEND_FOLDER_TO_DEPUTY','RECORD_WEIGHING','COMPLETE_WEIGHING','SET_DRIVER'));
-- لانطلاقة مفتوحة أو ضمن آخر 3 أيام، بسبب إلزامي وتدقيق كامل
create or replace function public.ops_set_departure_driver(p_departure_id uuid, p_driver_employee_id uuid, p_reason text)
returns public.garage_departures language plpgsql security definer set search_path=public,app as $$
declare u uuid:=app.require_fleet_master_actor(); d public.garage_departures; e public.employees; old_name text; old_id uuid;
begin
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'OPS_DRIVER_CHANGE_REASON_REQUIRED'; end if;
  e:=app.require_fleet_driver(p_driver_employee_id);
  select * into d from public.garage_departures where id=p_departure_id for update;
  if not found then raise exception 'GARAGE_DEPARTURE_NOT_FOUND'; end if;
  if d.returned_at is not null and d.departed_at < now() - interval '3 days' then raise exception 'OPS_DRIVER_CHANGE_TOO_OLD'; end if;
  old_name:=d.driver_name; old_id:=d.driver_employee_id;
  update public.garage_departures set driver_name=e.full_name, driver_employee_id=e.id where id=d.id returning * into d;
  insert into public.audit_logs(table_name,record_id,operation,old_row,new_row,actor_id,actor_role)
  values('garage_departures',d.id::text,'SET_DRIVER',jsonb_build_object('driver_name',old_name,'driver_employee_id',old_id),jsonb_build_object('driver_name',e.full_name,'driver_employee_id',e.id,'reason',trim(p_reason)),u,app.current_role());
  return d;
end$$;
revoke all on function public.ops_set_departure_driver(uuid,uuid,text) from public,anon;
grant execute on function public.ops_set_departure_driver(uuid,uuid,text) to authenticated;

-- ⑨ تغيير اسم الموظف في HR ينعكس على الآلية والإسنادات النشطة (الانطلاقات السابقة تبقى نسخة تاريخية)
create or replace function app.propagate_driver_name() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.full_name is distinct from old.full_name then
    update public.garage_vehicles set driver_name=new.full_name where driver_employee_id=new.id;
    update public.garage_vehicle_shift_assignments set driver_name=new.full_name where driver_employee_id=new.id and ends_at is null;
    update public.garage_driver_assignments set driver_name=new.full_name where driver_employee_id=new.id and ends_at is null;
  end if;
  return new;
end$$;
drop trigger if exists trg_propagate_driver_name on public.employees;
create trigger trg_propagate_driver_name after update of full_name on public.employees for each row execute function app.propagate_driver_name();

-- ⑩ قوائم الآليات والإسنادات تُظهر هوية السائق وحالة بصمته
drop function if exists public.garage_search_vehicles(text,smallint,text,integer,integer,boolean);
create function public.garage_search_vehicles(p_search text default null,p_sector_id smallint default null,p_shift text default null,p_limit integer default 48,p_offset integer default 0,p_archived boolean default false)
returns table(id uuid,vehicle_name text,db_number text,plate_number text,chassis_number text,image_path text,vehicle_category text,ownership_type text,lessor_name text,rental_contract_no text,rental_start_date date,rental_end_date date,model_year smallint,vehicle_color text,specifications text,shift text,driver_name text,sector_id smallint,area_name text,parent_sector text,created_at timestamptz,updated_at timestamptz,archived_at timestamptz,archived_by uuid,archive_reason text,total_count bigint,driver_employee_id uuid,driver_employee_number text,driver_has_biometric boolean)
language plpgsql stable security definer set search_path=public,app as $$
declare q text:=trim(coalesce(p_search,''));garage_parent text:=app.current_garage_parent_sector();
begin
  if auth.uid()is null or not app.has_role(array['central_garage_officer','ops_room','super_admin'])then raise exception'GARAGE_FORBIDDEN';end if;
  if app.has_role(array['central_garage_officer'])and not app.has_role(array['ops_room','super_admin'])and garage_parent is null then raise exception'GARAGE_PROFILE_NOT_CONFIGURED';end if;
  if p_shift is not null and p_shift not in('morning','evening','night')then raise exception'GARAGE_SHIFT_INVALID';end if;
  if p_limit<1 or p_limit>100 or p_offset<0 then raise exception'GARAGE_PAGINATION_INVALID';end if;
  return query select v.id,v.vehicle_name,v.db_number,v.plate_number,v.chassis_number,v.image_path,v.vehicle_category,v.ownership_type,v.lessor_name,v.rental_contract_no,v.rental_start_date,v.rental_end_date,v.model_year,v.vehicle_color,v.specifications,v.shift,v.driver_name,v.sector_id,s.name,v.garage_parent_sector,v.created_at,v.updated_at,v.archived_at,v.archived_by,v.archive_reason,count(*)over(),v.driver_employee_id,e.employee_number,(e.biometric_pin is not null)
  from public.garage_vehicles v join public.sectors s on s.id=v.sector_id left join public.employees e on e.id=v.driver_employee_id
  where(case when p_archived then v.archived_at is not null else v.archived_at is null end)and(garage_parent is null or app.has_role(array['ops_room','super_admin'])or v.garage_parent_sector=garage_parent)and(p_sector_id is null or v.sector_id=p_sector_id)and(p_shift is null or v.shift=p_shift)and(q=''or v.db_number ilike'%'||q||'%'or v.vehicle_name ilike'%'||q||'%'or v.driver_name ilike'%'||q||'%'or v.plate_number ilike'%'||q||'%'or v.chassis_number ilike'%'||q||'%'or v.lessor_name ilike'%'||q||'%'or e.employee_number ilike'%'||q||'%')
  order by case when p_archived then v.archived_at else v.created_at end desc limit p_limit offset p_offset;
end$$;
revoke all on function public.garage_search_vehicles(text,smallint,text,integer,integer,boolean) from public,anon;
grant execute on function public.garage_search_vehicles(text,smallint,text,integer,integer,boolean) to authenticated;

drop function if exists public.garage_vehicle_shift_assignments_list(uuid);
create function public.garage_vehicle_shift_assignments_list(p_vehicle_id uuid)
returns table(id uuid,vehicle_id uuid,shift text,driver_name text,sector_id smallint,area_name text,parent_sector text,starts_at timestamptz,ends_at timestamptz,change_reason text,driver_employee_id uuid,driver_employee_number text)
language plpgsql stable security definer set search_path=public,app as $$
begin
  if auth.uid() is null or not app.has_role(array['central_garage_officer','ops_room','super_admin']) then raise exception 'GARAGE_FORBIDDEN'; end if;
  if not app.garage_vehicle_allowed(p_vehicle_id) then raise exception 'GARAGE_VEHICLE_SCOPE_FORBIDDEN'; end if;
  return query select a.id,a.vehicle_id,a.shift,a.driver_name,a.sector_id,s.name,s.parent_sector,a.starts_at,a.ends_at,a.change_reason,a.driver_employee_id,e.employee_number
  from public.garage_vehicle_shift_assignments a join public.sectors s on s.id=a.sector_id left join public.employees e on e.id=a.driver_employee_id
  where a.vehicle_id=p_vehicle_id order by (a.ends_at is null) desc, a.starts_at desc;
end$$;
revoke all on function public.garage_vehicle_shift_assignments_list(uuid) from public,anon;
grant execute on function public.garage_vehicle_shift_assignments_list(uuid) to authenticated;
