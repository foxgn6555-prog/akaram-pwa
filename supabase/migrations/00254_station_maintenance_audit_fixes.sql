-- 00254 · تدقيق المحطة/الصيانة — إصلاح ثلاث ثغرات مؤكدة
--   ① بلاغ العطل القصير كان يبقى «مفتوحاً» بعد عودة الآلية إلى الكراج وإغلاق الانطلاقة ⇒ الآلية تظهر متوقفة وهي في الكراج،
--      ولا يستطيع المسؤول تسجيل عطل جديد لها غداً (BREAKDOWN_ALREADY_OPEN). الآن يُغلق تلقائياً عند استلام الكراج.
--   ② طلب صيانة «بانتظار موافقة الكراج»: كانت مرحلة الرحلة تظهر «داخل الصيانة» والآلية في الموقع، ويُسمح بإرسالها إلى المحطة
--      بينما يُمنع إرسالها إلى الكراج ⇒ تعلق في الموقع حتى يقرر الكراج. الآن: المرحلة «عطل مُبلَّغ»، المحطة ممنوعة،
--      والإرسال إلى الكراج يلغي الطلب تلقائياً (garage_decision_status = cancelled) ويبلّغ الكراج والصيانة.
--   ③ صرف قطع من المخزن على حالة غادرت الورشة فعلاً (to_work/to_garage) كان مسموحاً ⇒ ممنوع الآن.

-- ② حالة قرار جديدة: cancelled
alter table public.vehicle_maintenance_cases drop constraint if exists vehicle_maintenance_cases_garage_decision_status_check;
alter table public.vehicle_maintenance_cases add constraint vehicle_maintenance_cases_garage_decision_status_check
  check (garage_decision_status in ('not_required','awaiting_ack','acknowledged','awaiting_approval','approved','rejected','cancelled'));

create or replace function app.maintenance_cancel_pending_approval(p_departure_id uuid, p_actor uuid, p_reason text) returns int
language plpgsql security definer set search_path = public, app as $$
declare c public.vehicle_maintenance_cases; v public.garage_vehicles; n int := 0;
begin
  for c in select * from public.vehicle_maintenance_cases where departure_id = p_departure_id and completed_at is null and garage_decision_status = 'awaiting_approval' for update loop
    update public.vehicle_maintenance_cases
       set garage_decision_status = 'cancelled', garage_decided_at = now(), garage_decided_by = p_actor, garage_decision_notes = p_reason,
           status = 'cancelled', completed_at = now(), updated_at = now()
     where id = c.id;
    select * into v from public.garage_vehicles where id = c.vehicle_id;
    insert into public.notifications (user_id, title, body, type, category, priority, link, entity_type, entity_id, dedupe_key)
    select ur.user_id, 'أُلغي طلب صيانة بانتظار موافقتكم',
           format('الآلية DB %s — %s. %s', v.db_number, c.fault_type, p_reason), 'warning', 'maintenance', 'normal',
           case ur.role when 'maintenance' then '/maintenance/vehicle-cases' else '/central-garage/maintenance-coordination' end,
           'maintenance_case', c.id, 'maintenance_case:' || c.id::text || ':cancelled:' || ur.user_id::text
    from public.user_roles ur where ur.role in ('central_garage_officer', 'maintenance')
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
    n := n + 1;
  end loop;
  return n;
end$$;

create or replace function app.trip_status(p_departure_id uuid) returns text
language plpgsql stable security definer set search_path=public,app as $$
declare d public.garage_departures; l public.vehicle_trip_legs;
begin
  select * into d from public.garage_departures where id = p_departure_id;
  if not found then return null; end if;
  if d.returned_at is not null then return 'returned'; end if;
  if d.arrived_at is null then return 'to_site'; end if;
  select * into l from public.vehicle_trip_legs where departure_id = p_departure_id order by sequence_no desc limit 1;
  if found then
    if l.arrived_at is null then
      return case l.destination_type when 'transfer_station' then 'to_station' when 'maintenance' then 'to_maintenance' when 'garage' then 'to_garage' else 'to_site' end;
    end if;
    if l.destination_type = 'transfer_station' then return 'at_station'; end if;
    if l.destination_type = 'maintenance' then return 'at_maintenance'; end if;
    if l.destination_type = 'garage' then return 'to_garage'; end if;
    -- الساق الأخيرة عادت إلى موقع العمل: الآلية تعمل في الموقع بغضّ النظر عن site_departed_at القديم
  elsif d.site_departed_at is not null then
    return 'to_garage';
  end if;
  -- 00254: طلب صيانة بانتظار موافقة الكراج = الآلية ما زالت في الموقع (عطل مُبلَّغ)، لا «داخل الصيانة»
  if exists (select 1 from public.vehicle_maintenance_cases mc where mc.departure_id = p_departure_id and mc.completed_at is null and mc.garage_decision_status <> 'awaiting_approval') then return 'at_maintenance'; end if;
  if exists (select 1 from public.vehicle_maintenance_cases mc where mc.departure_id = p_departure_id and mc.completed_at is null and mc.garage_decision_status = 'awaiting_approval') then return 'breakdown'; end if;
  if exists (select 1 from public.sector_breakdowns b where b.departure_id = p_departure_id and b.status = 'logged' and b.archived_at is null) then return 'breakdown'; end if;
  return 'at_site';
end$$;

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
  -- 00254: آلية عليها طلب صيانة بانتظار موافقة الكراج لا تُرسل إلى المحطة (كانت تُرسل بينما تظهر «داخل الصيانة»)
  if exists(select 1 from public.vehicle_maintenance_cases mc where mc.departure_id = d.id and mc.completed_at is null)
  then raise exception 'MAINTENANCE_APPROVAL_PENDING'; end if;
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

create or replace function public.sector_send_vehicle_to_garage(p_departure_id uuid, p_notes text default null)
returns public.garage_departures language plpgsql security definer set search_path=public,app as $$
declare u uuid := auth.uid(); d public.garage_departures; st text;
begin
  if u is null or not app.has_role(array['department_manager']) then raise exception 'SECTOR_MANAGER_FORBIDDEN'; end if;
  if length(coalesce(p_notes,'')) > 500 then raise exception 'GARAGE_STAGE_NOTES_TOO_LONG'; end if;
  select * into d from public.garage_departures where id = p_departure_id and returned_at is null for update;
  if not found then raise exception 'GARAGE_SITE_DEPARTURE_NOT_ALLOWED'; end if;
  if not (d.recipient_manager_id = u or app.sector_stage_eligible(u, d.sector_id))
  then raise exception 'GARAGE_SITE_DEPARTURE_NOT_ALLOWED'; end if;
  if d.arrived_at is null then raise exception 'GARAGE_ARRIVAL_NOT_CONFIRMED'; end if;
  if exists(select 1 from public.vehicle_trip_legs where departure_id = d.id and arrived_at is null)
  then raise exception 'TRIP_LEG_ALREADY_OPEN'; end if;
  st := app.trip_status(d.id);
  if st not in ('at_site','breakdown') then raise exception 'GARAGE_SITE_DEPARTURE_NOT_ALLOWED'; end if;
  -- 00254: طلب صيانة بانتظار موافقة الكراج لا يحبس الآلية في الموقع — إرسالها إلى الكراج يلغي الطلب ويبلّغ الكراج والصيانة
  perform app.maintenance_cancel_pending_approval(d.id, u, 'أُرسلت الآلية إلى الكراج قبل قرار الكراج');
  update public.garage_departures
     set site_departed_at = now(), site_departed_by = u,
         site_departure_notes = nullif(trim(coalesce(p_notes,'')),'')
   where id = d.id returning * into d;
  insert into public.vehicle_trip_legs(departure_id, sequence_no, origin_type, destination_type, departed_by, departure_notes)
  values (d.id, app.next_trip_leg_sequence(d.id), 'work_site', 'garage', u, nullif(trim(coalesce(p_notes,'')),''));
  insert into public.notifications(user_id, title, body, type, link)
  values (d.departed_by, 'الآلية في طريقها إلى الكراج',
          format('أنهت الآلية DB %s ورديتها وغادرت موقع العمل باتجاه الكراج', (select db_number from public.garage_vehicles where id = d.vehicle_id)),
          'warning', '/central-garage/drivers-dispatch');
  return d;
end$$;

-- ①
create or replace function public.garage_record_return(p_departure_id uuid)
returns public.garage_departures language plpgsql security definer set search_path=public,app as $$
declare u uuid:=app.require_garage_actor(); d public.garage_departures; l public.vehicle_trip_legs; c public.vehicle_maintenance_cases; st text;
begin
  select * into d from public.garage_departures where id=p_departure_id and returned_at is null for update;
  if not found then raise exception 'GARAGE_OPEN_DEPARTURE_NOT_FOUND'; end if;
  if not app.garage_vehicle_allowed(d.vehicle_id) then raise exception 'GARAGE_VEHICLE_SCOPE_FORBIDDEN'; end if;
  st := app.trip_status(d.id);
  -- يُسمح فقط عندما تكون الآلية في طريقها إلى الكراج (أو انطلاقة قديمة بلا مستلم لم تصل)
  if not (st = 'to_garage' or (st = 'to_site' and d.recipient_manager_id is null)) then raise exception 'GARAGE_VEHICLE_NOT_SENT_BACK'; end if;
  select * into l from public.vehicle_trip_legs where departure_id=d.id and arrived_at is null for update;
  if found then
    if l.destination_type<>'garage' then raise exception 'GARAGE_VEHICLE_NOT_SENT_BACK'; end if;
    update public.vehicle_trip_legs set arrived_at=now(),arrived_by=u,arrival_notes='أكد الكراج الوصول' where id=l.id;
  end if;
  update public.garage_departures set arrived_at=coalesce(arrived_at,now()),arrived_by=coalesce(arrived_by,u),site_departed_at=coalesce(site_departed_at,now()),site_departed_by=coalesce(site_departed_by,u),returned_at=now(),returned_by=u where id=d.id returning * into d;
  update public.vehicle_maintenance_cases set status='closed_at_garage',completed_at=now(),updated_at=now() where departure_id=d.id and status='to_garage' and completed_at is null returning * into c;
  if found then update public.sector_breakdowns set status='resolved',resolved_at=now(),resolved_by=u,resolution_notes='أغلقت الحالة بعد وصول الآلية من الصيانة إلى الكراج' where id=c.breakdown_id; end if;
  -- 00254: أي بلاغ عطل قصير ما زال مفتوحاً على هذه الانطلاقة يُغلق بعودة الآلية (كان يبقى مفتوحاً ويمنع بلاغ الغد)
  update public.sector_breakdowns set status='resolved',resolved_at=now(),resolved_by=u,resolution_notes='أُغلق تلقائياً بعودة الآلية إلى الكراج وانتهاء الانطلاقة' where departure_id=d.id and status='logged' and archived_at is null;
  if d.recipient_manager_id is not null then
    insert into public.notifications(user_id,title,body,type,link) values(d.recipient_manager_id,'وصلت الآلية إلى الكراج',format('أكد الكراج استلام الآلية DB %s وإغلاق الانطلاقة',(select db_number from public.garage_vehicles where id=d.vehicle_id)),'success','/manager/vehicle-trips');
  end if;
  return d;
end$$;

-- ③ لا قطع بعد تسريح الآلية من الورشة
create or replace function app.guard_part_after_dispatch() returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if exists (select 1 from public.vehicle_maintenance_cases c where c.id = new.case_id and c.departed_maintenance_at is not null) then
    raise exception 'MAINTENANCE_VEHICLE_ALREADY_DISPATCHED';
  end if;
  return new;
end$$;
drop trigger if exists trg_guard_part_after_dispatch on public.vehicle_maintenance_parts;
create trigger trg_guard_part_after_dispatch before insert on public.vehicle_maintenance_parts for each row execute function app.guard_part_after_dispatch();
