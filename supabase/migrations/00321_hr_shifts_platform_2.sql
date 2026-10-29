-- 00321 — شفتات الموارد البشرية في كل المنصة (الجزء الثاني): المحطة التحويلية (الأوزان)، الكشوفات، تقارير العمليات
-- إزالة قيود الشفت الثابت من ts_weight_records و disclosures + محفّز التحقق من hr_shifts؛ الدوال تتحقق عبر app.shift_code_valid.
do $$
declare t text; c record;
begin
  foreach t in array array['ts_weight_records','disclosures'] loop
    for c in select conname from pg_constraint where conrelid = ('public.' || t)::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%shift%' and pg_get_constraintdef(oid) ilike '%''morning''%' loop
      execute format('alter table public.%I drop constraint %I', t, c.conname);
    end loop;
    execute format('drop trigger if exists trg_enforce_shift_code on public.%I', t);
    execute format('create trigger trg_enforce_shift_code before insert or update of shift on public.%I for each row execute function app.enforce_shift_code()', t);
  end loop;
end $$;

-- منع حذف شفت مستخدم: إضافة جدولي الأوزان والكشوفات
create or replace function app.hr_shift_delete_guard() returns trigger language plpgsql security definer set search_path = public, app as $$
declare t text; n bigint;
begin
  foreach t in array array['garage_vehicles','garage_driver_assignments','garage_vehicle_shift_assignments','garage_departures','contractor_profiles','manager_profiles','ts_weight_records','disclosures','employee_shift_assignments'] loop
    if t = 'employee_shift_assignments' then
      select count(*) into n from public.employee_shift_assignments a where a.shift_id = old.id;
    else
      execute format('select count(*) from public.%I where shift = $1', t) into n using old.code;
    end if;
    if n > 0 then raise exception 'HR_SHIFT_IN_USE'; end if;
  end loop;
  return old;
end$$;

-- ts_weight_send_to_ops: أي شفت من hr_shifts
create or replace function app.ts_weight_send_to_ops(
  p_date date, p_shift text
)
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare v_count integer;
begin
  if not app.has_role(array['transfer_station','super_admin']) then
    raise exception 'SEND_FORBIDDEN: الإرسال من المحطة التحويلية حصراً';
  end if;
  if not app.shift_code_valid(p_shift, false) then
    raise exception 'INVALID_SHIFT: الشفت غير صحيح';
  end if;

  update public.ts_weight_records
  set status = 'submitted_to_ops', submitted_to_ops_at = now()
  where log_date = p_date and shift = p_shift
    and archived_at is null and status = 'draft';

  get diagnostics v_count = row_count;

  insert into public.audit_logs (table_name, record_id, operation, new_row, actor_id, actor_role)
  values ('ts_weight_records', p_date::text || ':' || p_shift, 'SEND_TO_OPS',
          jsonb_build_object('date', p_date, 'shift', p_shift, 'count', v_count),
          auth.uid(), app.current_role());

  perform app.notify_by_role(
    array['ops_room','super_admin'],
    'دفتر أوزان للتدقيق — المحطة التحويلية',
    format('وصل دفتر أوزان %s بتاريخ %s (%s سجل) للتدقيق.',
           app.shift_label(p_shift),
           p_date, v_count),
    'info',
    '/ops-room'
  );

  return v_count;
end;
$$;

-- disclosure_save: الشفت من hr_shifts (المجهول مرفوض بدل إسكاته إلى الصباحي)
create or replace function public.disclosure_save(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare d public.disclosures; t public.disclosure_types; v record; e record; v_id uuid; v_kind text := coalesce(p ->> 'target_kind', 'vehicle');
        v_db text; v_driver text; v_sector text; v_shift text; v_vehicle uuid; v_emp uuid; v_empno text; v_dept text; v_job text; v_amount numeric;
begin
  if not app.disclosure_is_ops() then raise exception 'DISCLOSURE_FORBIDDEN'; end if;
  if v_kind not in ('vehicle','employee') then raise exception 'DISCLOSURE_TARGET_INVALID'; end if;
  if app.disclosure_restricted() and v_kind <> 'employee' then raise exception 'DISCLOSURE_GARAGE_EMPLOYEE_ONLY'; end if;   -- الكراج ومسؤول القاطع: موظفون فقط
  select * into t from public.disclosure_types where key = p ->> 'violation_type';
  if t.key is null or not t.is_active then raise exception 'DISCLOSURE_TYPE_INVALID'; end if;
  if (p ->> 'penalty_type') is not null and not ((p ->> 'penalty_type') = any(t.allowed_penalties)) then raise exception 'DISCLOSURE_PENALTY_NOT_ALLOWED'; end if;
  if length(trim(coalesce(p ->> 'details', ''))) < 5 then raise exception 'DISCLOSURE_DETAILS_REQUIRED'; end if;
  if (p ->> 'log_date') is null or (p ->> 'log_date')::date > current_date then raise exception 'DISCLOSURE_DATE_INVALID'; end if;
  v_amount := nullif(p ->> 'amount', '')::numeric;
  if v_amount is not null and v_amount < 0 then raise exception 'DISCLOSURE_AMOUNT_INVALID'; end if;
  if (p ->> 'penalty_type') = 'fine' and coalesce(v_amount, 0) <= 0 then raise exception 'DISCLOSURE_FINE_AMOUNT_REQUIRED'; end if;

  if v_kind = 'vehicle' then
    v_vehicle := nullif(p ->> 'vehicle_id', '')::uuid;
    if v_vehicle is null then raise exception 'DISCLOSURE_VEHICLE_REQUIRED'; end if;
    select gv.*, s.name as sector_name into v from public.garage_vehicles gv left join public.sectors s on s.id = gv.sector_id where gv.id = v_vehicle and gv.archived_at is null;
    if v.id is null then raise exception 'DISCLOSURE_VEHICLE_NOT_FOUND'; end if;
    v_db := v.db_number; v_driver := coalesce(nullif(trim(coalesce(p ->> 'driver_name', '')), ''), v.driver_name); v_sector := coalesce(nullif(p ->> 'sector', ''), v.sector_name); v_shift := coalesce(nullif(p ->> 'shift', ''), v.shift);
    v_emp := v.driver_employee_id;
  else
    v_emp := nullif(p ->> 'employee_id', '')::uuid;
    if v_emp is null then raise exception 'DISCLOSURE_EMPLOYEE_REQUIRED'; end if;
    v_db := coalesce(nullif(p ->> 'db_number', ''), '—'); v_sector := nullif(p ->> 'sector', ''); v_shift := coalesce(nullif(p ->> 'shift', ''), 'morning');
  end if;
  if v_emp is not null then
    select x.full_name, x.employee_number, x.job_title, dp.name as dept into e from public.employees x left join public.departments dp on dp.id = x.department_id where x.id = v_emp and x.archived_at is null;
    if e.full_name is null then raise exception 'DISCLOSURE_EMPLOYEE_NOT_FOUND'; end if;
    if not app.disclosure_employee_allowed(v_emp) then raise exception 'DISCLOSURE_OUT_OF_SCOPE'; end if;
    v_empno := e.employee_number; v_dept := e.dept; v_job := e.job_title;
    if v_kind = 'employee' then v_driver := e.full_name; end if;
  end if;
  if not app.shift_code_valid(v_shift, false) then raise exception 'HR_SHIFT_INVALID'; end if;

  if p_id is null then
    insert into public.disclosures (ref_no, target_kind, vehicle_id, employee_id, employee_number, department_name, job_title, db_number, driver_name, vehicle_type, contractor_name, sector, shift, log_date, period_month,
      violation_type, penalty_type, details, amount, status, prepared_by, prepared_by_name, created_by)
    values (app.disclosure_ref_no(), v_kind, v_vehicle, v_emp, v_empno, v_dept, v_job, v_db, v_driver, nullif(p ->> 'vehicle_type', ''), nullif(p ->> 'contractor_name', ''), v_sector, v_shift, (p ->> 'log_date')::date, date_trunc('month', (p ->> 'log_date')::date)::date,
      t.key, nullif(p ->> 'penalty_type', ''), trim(p ->> 'details'), v_amount, 'draft', auth.uid(), app.manager_display_name(auth.uid()), auth.uid()) returning id into v_id;
    perform app.disclosure_event(v_id, 'created', null, v_amount);
  else
    select * into d from public.disclosures where id = p_id;
    if d.id is null then raise exception 'DISCLOSURE_NOT_FOUND'; end if;
    if d.status not in ('draft','returned') then raise exception 'DISCLOSURE_NOT_EDITABLE'; end if;
    if not app.disclosure_in_scope(d) then raise exception 'DISCLOSURE_OUT_OF_SCOPE'; end if;
    update public.disclosures set target_kind = v_kind, vehicle_id = v_vehicle, employee_id = v_emp, employee_number = v_empno, department_name = v_dept, job_title = v_job, db_number = v_db, driver_name = v_driver,
      vehicle_type = nullif(p ->> 'vehicle_type', ''), contractor_name = nullif(p ->> 'contractor_name', ''), sector = v_sector, shift = v_shift, log_date = (p ->> 'log_date')::date, period_month = date_trunc('month', (p ->> 'log_date')::date)::date,
      violation_type = t.key, penalty_type = nullif(p ->> 'penalty_type', ''), details = trim(p ->> 'details'), amount = v_amount
    where id = p_id;
    v_id := p_id;
    perform app.disclosure_event(v_id, 'updated', null, v_amount);
  end if;
  return public.disclosure_get(v_id);
end$$;

-- public.operational_live_alerts
create or replace function public.operational_live_alerts(p_sector_id smallint default null,p_shift text default null,p_severity text default null)
returns table(alert_id text,alert_type text,severity text,departure_id uuid,case_id uuid,vehicle_id uuid,vehicle_name text,db_number text,driver_name text,shift text,sector_id smallint,area_name text,manager_name text,title text,details text,started_at timestamptz,threshold_minutes integer,elapsed_minutes integer,action_link text)
language plpgsql stable security definer set search_path=public,app as $$
begin
 if not app.has_role(array['ops_room','super_admin']) then raise exception 'OPS_ROOM_FORBIDDEN';end if;
 if p_shift is not null and not app.shift_code_valid(p_shift, false) then raise exception 'OPS_SHIFT_INVALID';end if;
 if p_severity is not null and p_severity not in('warning','critical') then raise exception 'OPS_ALERT_SEVERITY_INVALID';end if;
 return query
 with raw as(
  select 'garage_arrival_delay'::text alert_type,case when now()-d.departed_at>interval '120 minutes' then 'critical' else 'warning' end severity,d.id departure_id,null::uuid case_id,d.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.shift,d.sector_id,s.name area_name,d.recipient_manager_name manager_name,
   'تأخر الوصول من الكراج'::text title,format('لم يؤكد مسؤول القسم وصول الآلية DB %s إلى موقع العمل',v.db_number) details,d.departed_at started_at,60 threshold_minutes,floor(extract(epoch from(now()-d.departed_at))/60)::int elapsed_minutes,'/manager/vehicle-trips'::text action_link
  from public.garage_departures d join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
  where d.arrived_at is null and d.returned_at is null and now()-d.departed_at>interval '60 minutes'
  union all
  select 'leg_transit_delay',case when now()-l.departed_at>interval '90 minutes' then 'critical' else 'warning' end,d.id,null::uuid,d.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.shift,d.sector_id,s.name,d.recipient_manager_name,
   'تأخر انتقال الآلية',format('انتقال DB %s من %s إلى %s ما زال دون تأكيد وصول',v.db_number,app.trip_place_label(l.origin_type),app.trip_place_label(l.destination_type)),l.departed_at,45,floor(extract(epoch from(now()-l.departed_at))/60)::int,
   case l.destination_type when 'transfer_station' then '/transfer-station/vehicle-movements' when 'maintenance' then '/maintenance/vehicle-cases' else '/manager/vehicle-trips' end
  from public.vehicle_trip_legs l join public.garage_departures d on d.id=l.departure_id join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
  where l.arrived_at is null and d.returned_at is null and now()-l.departed_at>interval '45 minutes'
  union all
  select 'station_stay_delay',case when now()-i.arrived_at>interval '180 minutes' then 'critical' else 'warning' end,d.id,null::uuid,d.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.shift,d.sector_id,s.name,d.recipient_manager_name,
   'طول البقاء في المحطة',format('الآلية DB %s داخل المحطة ولم تسجل مغادرتها',v.db_number),i.arrived_at,60,floor(extract(epoch from(now()-i.arrived_at))/60)::int,'/transfer-station/vehicle-movements'
  from public.vehicle_trip_legs i join public.garage_departures d on d.id=i.departure_id join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
  where i.destination_type='transfer_station' and i.arrived_at is not null and d.returned_at is null and not exists(select 1 from public.vehicle_trip_legs o where o.departure_id=i.departure_id and o.sequence_no=i.sequence_no+1 and o.origin_type='transfer_station') and now()-i.arrived_at>interval '60 minutes'
  union all
  select 'maintenance_overdue','critical',d.id,c.id,d.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.shift,d.sector_id,s.name,d.recipient_manager_name,
   'تجاوز موعد إنجاز الصيانة',format('تجاوزت حالة DB %s الموعد المتوقع وما زالت مفتوحة بنسبة %s%%',v.db_number,c.progress),c.expected_completion_at,0,floor(extract(epoch from(now()-c.expected_completion_at))/60)::int,'/maintenance/vehicle-cases'
  from public.vehicle_maintenance_cases c join public.garage_departures d on d.id=c.departure_id join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
  where c.completed_at is null and c.expected_completion_at is not null and c.expected_completion_at<now()
  union all
  select 'maintenance_no_update',case when now()-coalesce(u.last_update,c.arrived_at,c.reported_at)>interval '48 hours' then 'critical' else 'warning' end,d.id,c.id,d.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.shift,d.sector_id,s.name,d.recipient_manager_name,
   'الصيانة دون تحديث',format('حالة صيانة DB %s لم تسجل تحديثاً حديثاً',v.db_number),coalesce(u.last_update,c.arrived_at,c.reported_at),1440,floor(extract(epoch from(now()-coalesce(u.last_update,c.arrived_at,c.reported_at)))/60)::int,'/maintenance/vehicle-cases'
  from public.vehicle_maintenance_cases c join public.garage_departures d on d.id=c.departure_id join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
  left join lateral(select max(mu.created_at) last_update from public.vehicle_maintenance_updates mu where mu.case_id=c.id)u on true
  where c.completed_at is null and c.arrived_at is not null and now()-coalesce(u.last_update,c.arrived_at,c.reported_at)>interval '24 hours'
  union all
  select 'trip_stale','critical',d.id,null::uuid,d.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.shift,d.sector_id,s.name,d.recipient_manager_name,
   'رحلة مفتوحة دون تحديث',format('الرحلة المفتوحة للآلية DB %s لم تشهد أي حركة حديثة',v.db_number),a.last_activity,720,floor(extract(epoch from(now()-a.last_activity))/60)::int,'/ops-room/operations-data'
  from public.garage_departures d join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
  cross join lateral(select greatest(d.departed_at,coalesce(d.arrived_at,d.departed_at),coalesce(d.site_departed_at,d.departed_at),coalesce((select max(greatest(l.departed_at,coalesce(l.arrived_at,l.departed_at))) from public.vehicle_trip_legs l where l.departure_id=d.id),d.departed_at))last_activity)a
  where d.returned_at is null and now()-a.last_activity>interval '12 hours'
  union all
  select 'breakdown_stale',case when now()-b.created_at>interval '8 hours' then 'critical' else 'warning' end,d.id,null::uuid,d.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.shift,d.sector_id,s.name,d.recipient_manager_name,
   'عطل مفتوح دون حسم',format('العطل المفتوح للآلية DB %s: %s',v.db_number,b.fault_type),b.created_at,240,floor(extract(epoch from(now()-b.created_at))/60)::int,'/manager/breakdown'
  from public.sector_breakdowns b join public.garage_departures d on d.id=b.departure_id join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
  where b.status='logged' and b.archived_at is null and d.returned_at is null and now()-b.created_at>interval '4 hours' and not exists(select 1 from public.vehicle_maintenance_cases c where c.breakdown_id=b.id and c.completed_at is null)
 )
 select md5(r.alert_type||':'||coalesce(r.departure_id::text,'')||':'||coalesce(r.case_id::text,'')),r.alert_type,r.severity,r.departure_id,r.case_id,r.vehicle_id,r.vehicle_name,r.db_number,r.driver_name,r.shift,r.sector_id,r.area_name,r.manager_name,r.title,r.details,r.started_at,r.threshold_minutes,r.elapsed_minutes,r.action_link
 from raw r where(p_sector_id is null or r.sector_id=p_sector_id)and(p_shift is null or r.shift=p_shift)and(p_severity is null or r.severity=p_severity)
 order by case r.severity when 'critical' then 0 else 1 end,r.elapsed_minutes desc;
end$$;

-- public.operational_vehicle_kpis
create or replace function public.operational_vehicle_kpis(p_from date,p_to date,p_search text default null,p_sector_id smallint default null,p_shift text default null)
returns table(departure_id uuid,vehicle_id uuid,vehicle_name text,db_number text,driver_name text,driver_employee_id uuid,shift text,sector_id smallint,area_name text,manager_name text,
              started_at timestamptz,work_started_at timestamptz,site_departed_at timestamptz,completed_at timestamptz,trip_status text,
              total_minutes integer,movement_minutes integer,productive_minutes integer,station_minutes integer,maintenance_minutes integer,downtime_minutes integer,other_minutes integer,
              station_visit_count integer,breakdown_count integer,maintenance_count integer)
language plpgsql stable security definer set search_path=public,app as $$
begin
 if not app.has_role(array['ops_room','super_admin']) then raise exception 'OPS_ROOM_FORBIDDEN';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'OPS_DATE_RANGE_INVALID';end if;
 if p_shift is not null and not app.shift_code_valid(p_shift, false) then raise exception 'OPS_SHIFT_INVALID';end if;
 return query
 select d.id,d.vehicle_id,v.vehicle_name,v.db_number,d.driver_name,d.driver_employee_id,d.shift,d.sector_id,s.name,d.recipient_manager_name,
        d.departed_at,d.arrived_at,d.site_departed_at,d.returned_at,app.trip_status(d.id),
        m.total_minutes,m.movement_minutes,m.productive_minutes,m.station_minutes,m.maintenance_minutes,m.downtime_minutes,m.other_minutes,m.station_visit_count,m.breakdown_count,m.maintenance_count
 from public.garage_departures d join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
 cross join lateral app.trip_minutes(d.id) m
 where(d.departed_at at time zone 'Asia/Baghdad')::date between p_from and p_to
  and(p_search is null or trim(p_search)='' or v.db_number ilike '%'||trim(p_search)||'%' or v.vehicle_name ilike '%'||trim(p_search)||'%' or d.driver_name ilike '%'||trim(p_search)||'%' or d.recipient_manager_name ilike '%'||trim(p_search)||'%')
  and(p_sector_id is null or d.sector_id=p_sector_id) and(p_shift is null or d.shift=p_shift)
 order by d.departed_at desc;
end$$;