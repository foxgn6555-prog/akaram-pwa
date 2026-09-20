-- 00135 · اتساق مراحل رحلة الآلية: «العودة للكراج» بعد زيارة المحطة/الصيانة + أهلية أوسع للمسؤول + أكواد أدق.
-- المشكلة الجذرية الأولى: sector_send_vehicle_to_garage (00080) يشترط site_departed_at IS NULL،
--   بينما sector_send_vehicle_to_station (00082) يضبط site_departed_at ولا يُصفَّر بعد تأكيد العودة
--   إلى الموقع ⇒ بعد أي زيارة محطة/صيانة يفشل «إنهاء الوردية للكراج» دائماً بـ 400
--   GARAGE_SITE_DEPARTURE_NOT_ALLOWED رغم أن الواجهة تعرض الزر بصورة صحيحة.
-- المشكلة الجذرية الثانية: كل دوال طرف المسؤول مقفلة على recipient_manager_id = u فقط،
--   فأي مسؤول مؤهل وفق عقد 00134 (ارتداد للقاطع أو اختيار يدوي) يُرفض بـ 400.
-- الحل: آلة حالة موحدة مطابقة للواجهة (لا ساق مفتوحة + آخر ساق = عودة موقع مؤكدة) +
--   مساعد أهلية app.sector_stage_eligible (دور + تغطية مباشرة أو ضمن القاطع الأب) +
--   أكواد أخطاء دقيقة تفصل «حركة مفتوحة» عن «ليست في الموقع» عن «لم يؤكد الوصول».

-- ① مساعد الأهلية الموحّد لعقد 00134 (دور + تغطية مباشرة أو قاطع أب)
create or replace function app.sector_stage_eligible(p_user uuid, p_sector_id smallint)
returns boolean
language sql stable security definer set search_path=public,app as $$
  select p_user is not null
     and exists(select 1 from public.user_roles ur
                 where ur.user_id = p_user and ur.role = 'department_manager')
     and exists(select 1 from public.manager_profiles mp
                 where mp.user_id = p_user
                   and (p_sector_id = any(mp.sectors)
                        or exists(select 1 from public.sectors sx
                                  where sx.id = any(mp.sectors)
                                    and sx.parent_sector = (select s.parent_sector
                                                            from public.sectors s
                                                            where s.id = p_sector_id))));
$$;
revoke all on function app.sector_stage_eligible(uuid, smallint) from public, anon;

-- ② تأكيد وصول الآلية للموقع: المستلم المسجل أو أي مسؤول مؤهل (00134)
create or replace function public.sector_confirm_vehicle_arrival(p_departure_id uuid, p_notes text default null)
returns public.garage_departures
language plpgsql security definer set search_path=public,app as $$
declare u uuid := auth.uid(); d public.garage_departures; nm text;
begin
  if u is null or not app.has_role(array['department_manager']) then raise exception 'SECTOR_MANAGER_FORBIDDEN'; end if;
  if length(coalesce(p_notes,'')) > 500 then raise exception 'GARAGE_STAGE_NOTES_TOO_LONG'; end if;
  select * into d from public.garage_departures where id = p_departure_id and returned_at is null for update;
  if not found or d.arrived_at is not null
     or not (d.recipient_manager_id = u
             or (d.recipient_manager_id is null
                 and exists(select 1 from public.manager_profiles mp
                             where mp.user_id = u and d.sector_id = any(mp.sectors) and d.shift = mp.shift))
             or app.sector_stage_eligible(u, d.sector_id))
  then raise exception 'GARAGE_ARRIVAL_NOT_ALLOWED'; end if;
  select coalesce(nullif(e.full_name,''), au.email, u::text) into nm
  from auth.users au left join public.employees e on e.user_id = au.id where au.id = u;
  update public.garage_departures
     set recipient_manager_id = u, recipient_manager_name = nm,
         arrived_at = now(), arrived_by = u,
         arrival_notes = nullif(trim(coalesce(p_notes,'')),'')
   where id = d.id returning * into d;
  insert into public.notifications(user_id, title, body, type, link)
  values(d.departed_by, 'تم تأكيد وصول الآلية',
         format('أكد مسؤول القسم وصول الآلية DB %s إلى موقع العمل',
                (select db_number from public.garage_vehicles where id = d.vehicle_id)),
         'success', '/central-garage/drivers-dispatch');
  return d;
end$$;

-- ③ إنهاء الوردية وإرسال الآلية للكراج: آلة الحالة الموحدة
--    مسموح عندما: لا ساق مفتوحة + الوصول مؤكد + (لم تغادر الموقع قط
--    أو آخر ساق = عودة مؤكدة إلى موقع العمل بعد زيارة محطة/صيانة).
create or replace function public.sector_send_vehicle_to_garage(p_departure_id uuid, p_notes text default null)
returns public.garage_departures
language plpgsql security definer set search_path=public,app as $$
declare u uuid := auth.uid(); d public.garage_departures;
begin
  if u is null or not app.has_role(array['department_manager']) then raise exception 'SECTOR_MANAGER_FORBIDDEN'; end if;
  if length(coalesce(p_notes,'')) > 500 then raise exception 'GARAGE_STAGE_NOTES_TOO_LONG'; end if;
  select * into d from public.garage_departures where id = p_departure_id and returned_at is null for update;
  if not found then raise exception 'GARAGE_SITE_DEPARTURE_NOT_ALLOWED'; end if;
  if not (d.recipient_manager_id = u or app.sector_stage_eligible(u, d.sector_id))
  then raise exception 'GARAGE_SITE_DEPARTURE_NOT_ALLOWED'; end if;
  if d.arrived_at is null then raise exception 'GARAGE_ARRIVAL_NOT_CONFIRMED'; end if;
  if exists(select 1 from public.vehicle_trip_legs
             where departure_id = d.id and arrived_at is null)
  then raise exception 'TRIP_LEG_ALREADY_OPEN'; end if;
  if d.site_departed_at is not null
     and not exists(select 1 from public.vehicle_trip_legs lg
                     where lg.departure_id = d.id
                       and lg.destination_type = 'work_site'
                       and lg.arrived_at is not null
                       and lg.sequence_no = (select max(sequence_no) from public.vehicle_trip_legs
                                              where departure_id = d.id))
  then raise exception 'GARAGE_SITE_DEPARTURE_NOT_ALLOWED'; end if;
  update public.garage_departures
     set site_departed_at = now(), site_departed_by = u,
         site_departure_notes = nullif(trim(coalesce(p_notes,'')),'')
   where id = d.id returning * into d;
  insert into public.notifications(user_id, title, body, type, link)
  values(d.departed_by, 'الآلية في طريقها إلى الكراج',
         format('أنهت الآلية DB %s ورديتها وغادرت موقع العمل باتجاه الكراج',
                (select db_number from public.garage_vehicles where id = d.vehicle_id)),
         'warning', '/central-garage/drivers-dispatch');
  return d;
end$$;

-- ④ الإرسال إلى المحطة التحويلية: المستلم المسجل أو أي مسؤول مؤهل + تحقق الساق الأخيرة
create or replace function public.sector_send_vehicle_to_station(p_departure_id uuid, p_notes text default null)
returns public.vehicle_trip_legs
language plpgsql security definer set search_path=public,app as $$
declare u uuid := auth.uid(); d public.garage_departures; l public.vehicle_trip_legs;
begin
  if not app.has_role(array['department_manager']) then raise exception 'SECTOR_MANAGER_FORBIDDEN'; end if;
  if length(coalesce(p_notes,'')) > 1000 then raise exception 'TRIP_NOTES_TOO_LONG'; end if;
  select * into d from public.garage_departures
   where id = p_departure_id and arrived_at is not null and returned_at is null
     and (recipient_manager_id = u or app.sector_stage_eligible(u, sector_id))
   for update;
  if not found then raise exception 'TRIP_NOT_AT_MANAGER_SITE'; end if;
  if exists(select 1 from public.vehicle_trip_legs where departure_id = d.id and arrived_at is null)
  then raise exception 'TRIP_LEG_ALREADY_OPEN'; end if;
  if exists(select 1 from public.vehicle_trip_legs where departure_id = d.id)
     and not exists(select 1 from public.vehicle_trip_legs lg
                     where lg.departure_id = d.id
                       and lg.destination_type = 'work_site'
                       and lg.arrived_at is not null
                       and lg.sequence_no = (select max(sequence_no) from public.vehicle_trip_legs
                                              where departure_id = d.id))
  then raise exception 'TRIP_NOT_AT_MANAGER_SITE'; end if;
  update public.garage_departures
     set site_departed_at = coalesce(site_departed_at, now()),
         site_departed_by = coalesce(site_departed_by, u),
         site_departure_notes = coalesce(site_departure_notes, nullif(trim(coalesce(p_notes,'')),''))
   where id = d.id;
  insert into public.vehicle_trip_legs(departure_id, sequence_no, origin_type, destination_type, departed_by, departure_notes)
  values(d.id, app.next_trip_leg_sequence(d.id), 'work_site', 'transfer_station', u, nullif(trim(coalesce(p_notes,'')),''))
  returning * into l;
  insert into public.notifications(user_id, title, body, type, link)
  select ur.user_id, 'آلية في الطريق إلى المحطة التحويلية',
         format('الآلية DB %s غادرت موقع العمل باتجاه المحطة',
                (select db_number from public.garage_vehicles where id = d.vehicle_id)),
         'info', '/transfer-station/vehicle-movements'
  from public.user_roles ur where ur.role = 'transfer_station';
  return l;
end$$;

-- ⑤ تأكيد عودة الآلية إلى موقع العمل: المستلم المسجل أو أي مسؤول مؤهل
--    (مع إغلاق حالة الصيانة المرتبطة وتحليل العطل كما في العقد الأصلي 00082)
create or replace function public.sector_confirm_vehicle_site_return(p_leg_id uuid, p_notes text default null)
returns public.vehicle_trip_legs
language plpgsql security definer set search_path=public,app as $$
declare u uuid := auth.uid(); l public.vehicle_trip_legs; c public.vehicle_maintenance_cases;
begin
  if not app.has_role(array['department_manager']) then raise exception 'SECTOR_MANAGER_FORBIDDEN'; end if;
  update public.vehicle_trip_legs l0
     set arrived_at = now(), arrived_by = u,
         arrival_notes = nullif(trim(coalesce(p_notes,'')),'')
    from public.garage_departures d
   where l0.id = p_leg_id and d.id = l0.departure_id
     and (d.recipient_manager_id = u or app.sector_stage_eligible(u, d.sector_id))
     and l0.destination_type = 'work_site' and l0.arrived_at is null
  returning l0.* into l;
  if not found then raise exception 'SITE_RETURN_NOT_ALLOWED'; end if;
  update public.vehicle_maintenance_cases
     set status = 'returned_to_work', completed_at = now(), updated_at = now()
   where departure_id = l.departure_id and status = 'to_work' and completed_at is null
  returning * into c;
  if found then
    update public.sector_breakdowns
       set status = 'resolved', resolved_at = now(), resolved_by = u,
           resolution_notes = coalesce(nullif(trim(coalesce(p_notes,'')),''), 'عادت الآلية من الصيانة إلى موقع العمل')
     where id = c.breakdown_id;
  end if;
  return l;
end$$;

-- ⑥ الإرسال إلى الصيانة (عطل): المستلم المسجل أو أي مسؤول مؤهل.
--    القاعدة = أحدث تعريف (00097: سياسة الموافقات + دمج الأعطال + منع التكرار) مع توسيع الأهلية فقط.
create or replace function public.sector_send_vehicle_to_maintenance(p_departure_id uuid, p_fault_type text, p_priority text default 'normal', p_notes text default null)
returns public.vehicle_maintenance_cases
language plpgsql security definer set search_path=public,app as $$
declare u uuid := auth.uid(); d public.garage_departures; v public.garage_vehicles;
        b public.sector_breakdowns; c public.vehicle_maintenance_cases; l public.vehicle_trip_legs;
        nm text; pol public.notification_workflow_policies; effective_mode text;
begin
  if not app.has_role(array['department_manager']) then raise exception 'SECTOR_MANAGER_FORBIDDEN'; end if;
  if length(trim(coalesce(p_fault_type,''))) < 3 or p_priority not in ('normal','urgent','critical')
  then raise exception 'MAINTENANCE_INPUT_INVALID'; end if;
  select * into d from public.garage_departures
   where id = p_departure_id and arrived_at is not null and returned_at is null
     and (recipient_manager_id = u or app.sector_stage_eligible(u, sector_id))
   for update;
  if not found or exists(select 1 from public.vehicle_trip_legs where departure_id = d.id and arrived_at is null)
  then raise exception 'TRIP_NOT_AT_MANAGER_SITE'; end if;
  if exists(select 1 from public.vehicle_trip_legs where departure_id = d.id order by sequence_no desc limit 1)
     and (select destination_type from public.vehicle_trip_legs where departure_id = d.id order by sequence_no desc limit 1) <> 'work_site'
  then raise exception 'TRIP_NOT_AT_MANAGER_SITE'; end if;
  if exists(select 1 from public.vehicle_maintenance_cases where departure_id = d.id and completed_at is null)
  then raise exception 'MAINTENANCE_CASE_ALREADY_OPEN'; end if;
  select * into v from public.garage_vehicles where id = d.vehicle_id;
  pol := app.effective_notification_policy('maintenance_dispatch', d.sector_id, v.vehicle_category);
  effective_mode := coalesce(pol.mode, 'notify_only');
  if p_priority = 'critical' and coalesce(pol.emergency_bypass, true) then effective_mode := 'notify_only'; end if;
  select * into b from public.sector_breakdowns
   where manager_id = u and lower(trim(db_number)) = lower(trim(v.db_number))
     and status = 'logged' and archived_at is null
   order by created_at desc limit 1 for update;
  if found then
    if b.departure_id is not null and b.departure_id <> d.id then raise exception 'BREAKDOWN_ALREADY_OPEN'; end if;
    update public.sector_breakdowns
       set departure_id = d.id, vehicle_id = v.id, fault_type = trim(p_fault_type),
           notes = coalesce(nullif(trim(coalesce(p_notes,'')),''), notes)
     where id = b.id returning * into b;
  else
    select coalesce(nullif(trim(e.full_name),''), au.email, u::text) into nm
    from auth.users au left join public.employees e on e.user_id = au.id where au.id = u;
    insert into public.sector_breakdowns(manager_id, manager_name, shift, sectors, db_number, fault_type, notes, status, departure_id, vehicle_id)
    values(u, nm, d.shift, array[d.sector_id]::smallint[], v.db_number, trim(p_fault_type), nullif(trim(coalesce(p_notes,'')),''), 'logged', d.id, v.id)
    returning * into b;
  end if;
  insert into public.vehicle_maintenance_cases(departure_id, breakdown_id, vehicle_id, manager_id, fault_type, priority, dispatch_policy, garage_decision_status)
  values(d.id, b.id, v.id, u, trim(p_fault_type), p_priority, effective_mode,
         case effective_mode when 'ack_required' then 'awaiting_ack'
                             when 'approval_required' then 'awaiting_approval'
                             else 'not_required' end)
  returning * into c;
  if effective_mode <> 'approval_required' then
    insert into public.vehicle_trip_legs(departure_id, sequence_no, origin_type, destination_type, departed_by, departure_notes)
    values(d.id, app.next_trip_leg_sequence(d.id), 'work_site', 'maintenance', u, nullif(trim(coalesce(p_notes,'')),''))
    returning * into l;
    insert into public.notifications(user_id, title, body, type, category, priority, link, entity_type, entity_id, dedupe_key)
    select ur.user_id, 'آلية في الطريق إلى الصيانة',
           format('الآلية DB %s غادرت موقع العمل إلى الصيانة', v.db_number),
           'error', 'maintenance',
           case when p_priority = 'critical' then 'critical' else 'high' end,
           '/maintenance/vehicle-cases', 'maintenance_case', c.id,
           'maintenance_case:' || c.id::text || ':maintenance'
    from public.user_roles ur where ur.role = 'maintenance'
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return c;
end$$;
