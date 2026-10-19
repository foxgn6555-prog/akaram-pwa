-- 00252 · حراسة سائق الانطلاقة (تدقيق دورة الانطلاقيات)
--   ① لا انطلاقة بسائق مُنهى الخدمة (GARAGE_DRIVER_TERMINATED) ولا بسائق هو الآن في الميدان بآلية أخرى (GARAGE_DRIVER_IN_FIELD).
--   ② لا يُسند السائق نفسه إلى آليتين فعّالتين في الشفت نفسه (FLEET_DRIVER_ALREADY_ASSIGNED) — trigger يغطي كل مسارات الإسناد.
--   ③ إنهاء خدمة موظف مرتبط بآلية (سائق أساسي أو سائق شفت فعّال) ⇒ تبليغ غرفة العمليات لإعادة الإسناد (لا نفكّ الإسناد تلقائياً؛ القرار لغرفة العمليات).

-- ② تعارض إسناد الشفت
create or replace function app.guard_driver_shift_assignment() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare other text;
begin
  if new.driver_employee_id is null or new.ends_at is not null then return new; end if;
  select v.db_number into other
  from public.garage_vehicle_shift_assignments a join public.garage_vehicles v on v.id = a.vehicle_id
  where a.driver_employee_id = new.driver_employee_id and a.shift = new.shift and a.ends_at is null and a.vehicle_id <> new.vehicle_id and v.archived_at is null
  limit 1;
  if other is not null then raise exception 'FLEET_DRIVER_ALREADY_ASSIGNED' using detail = other; end if;
  return new;
end$$;
drop trigger if exists trg_guard_driver_shift_assignment on public.garage_vehicle_shift_assignments;
create trigger trg_guard_driver_shift_assignment before insert on public.garage_vehicle_shift_assignments
for each row execute function app.guard_driver_shift_assignment();

-- ① حارس الانطلاقة
create or replace function app.assert_departure_driver(p_vehicle_id uuid, p_driver_employee_id uuid) returns void
language plpgsql stable security definer set search_path = public, app as $$
declare e public.employees; other text;
begin
  if p_driver_employee_id is null then return; end if;
  select * into e from public.employees where id = p_driver_employee_id;
  if found and e.employment_status = 'terminated' then raise exception 'GARAGE_DRIVER_TERMINATED' using detail = e.full_name; end if;
  select v.db_number into other
  from public.garage_departures d join public.garage_vehicles v on v.id = d.vehicle_id
  where d.driver_employee_id = p_driver_employee_id and d.returned_at is null and d.vehicle_id <> p_vehicle_id
  limit 1;
  if other is not null then raise exception 'GARAGE_DRIVER_IN_FIELD' using detail = other; end if;
end$$;

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
  if p_shift not in ('morning', 'evening', 'night') then raise exception 'GARAGE_SHIFT_INVALID'; end if;
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
revoke all on function public.garage_record_shift_departure(uuid, text, text, uuid) from public, anon;
grant execute on function public.garage_record_shift_departure(uuid, text, text, uuid) to authenticated;

-- ③ تبليغ غرفة العمليات عند إنهاء خدمة سائق مرتبط بآلية
create or replace function app.fleet_notify_driver_terminated(p_employee uuid) returns int
language plpgsql security definer set search_path = public, app as $$
declare e public.employees; vehicles text; n int := 0;
begin
  select * into e from public.employees where id = p_employee;
  if not found then return 0; end if;
  select string_agg(distinct v.db_number, ' · ' order by v.db_number) into vehicles
  from public.garage_vehicles v
  where v.archived_at is null
    and (v.driver_employee_id = p_employee
         or exists (select 1 from public.garage_vehicle_shift_assignments a where a.vehicle_id = v.id and a.ends_at is null and a.driver_employee_id = p_employee));
  if vehicles is null then return 0; end if;
  insert into public.notifications (user_id, title, body, type, link)
  select ur.user_id, 'سائق مُنهى الخدمة ما زال مسنداً إلى آلية',
         format('أُنهيت خدمة السائق %s (%s) وهو مسند إلى: %s — لن يستطيع الكراج تسجيل انطلاقة بهذه الآليات حتى تُعيد إسناد السائق.', e.full_name, e.employee_number, vehicles),
         'warning', '/ops-room/vehicles-database'
  from public.user_roles ur where ur.role in ('ops_room');
  get diagnostics n = row_count;
  return n;
end$$;

create or replace function public.hr_employee_terminate(p_employee uuid, p_type text, p_last_day date, p_reason text, p_attachment text default null)
returns void language plpgsql security definer set search_path = public, app as $$
begin
  if not app.has_role(array['hr_officer', 'super_admin']) then raise exception 'HR_FORBIDDEN'; end if;
  if p_type not in ('resignation', 'dismissal', 'contract_end', 'retirement', 'death') then raise exception 'HR_TERMINATION_TYPE_INVALID'; end if;
  if p_last_day is null then raise exception 'HR_DATE_INVALID'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'HR_REASON_REQUIRED'; end if;
  update public.employees set employment_status = 'terminated', terminated_at = p_last_day, termination_type = p_type,
    termination_reason = trim(p_reason), termination_attachment_path = p_attachment, terminated_by = auth.uid(), updated_at = now()
  where id = p_employee and employment_status <> 'terminated';
  if not found then raise exception 'HR_ALREADY_TERMINATED'; end if;
  insert into public.finance_hr_notices (employee_id, kind, payload)
  values (p_employee, 'termination_settlement', jsonb_build_object('type', p_type, 'last_day', p_last_day, 'reason', trim(p_reason)));
  perform app.fleet_notify_driver_terminated(p_employee);   -- 00252
end$$;
grant execute on function public.hr_employee_terminate(uuid, text, date, text, text) to authenticated;

-- تنفيذ طلب إنهاء الخدمة (إجراءات) — التبليغ نفسه
create or replace function app.termination_execute(p_id uuid) returns void language plpgsql security definer set search_path = public, app as $$
declare r public.termination_requests; u uuid;
begin
  select * into r from public.termination_requests where id = p_id;
  if r.target_kind = 'employee' then
    update public.employees set employment_status = 'terminated', terminated_at = r.last_day, termination_type = r.termination_type,
      termination_reason = r.reason, termination_attachment_path = r.attachment_path, terminated_by = r.requester_user_id, updated_at = now()
    where id = r.target_employee_id and employment_status <> 'terminated';
    if not found then raise exception 'HR_ALREADY_TERMINATED'; end if;
    perform app.fleet_notify_driver_terminated(r.target_employee_id);   -- 00252
    insert into public.finance_hr_notices (employee_id, kind, payload)
    values (r.target_employee_id, 'termination_settlement', jsonb_build_object('type', r.termination_type, 'last_day', r.last_day, 'reason', r.reason, 'via', 'procedure', 'request_id', r.id));
    -- متعهد: إيقاف ملفه؛ مسؤول قاطع: إزالة إسناده
    update public.contractor_profiles set is_active = false, notes = left('إنهاء خدمة: ' || r.reason, 500) where user_id = r.target_user_id and is_active;
    delete from public.sector_manager_profiles where user_id = r.target_user_id;
    foreach u in array (select coalesce(array_agg(distinct ur.user_id), '{}') from public.user_roles ur where ur.role in ('hr_officer','it_admin')) loop
      perform app.hr_notify(u, 'أُنهيت خدمة ' || r.target_name, app.termination_type_label(r.termination_type) || ' · آخر يوم ' || r.last_day::text || ' · عطّلوا الحساب وأكملوا الإجراءات', '/hr/employees', 'termination_done:' || r.id::text || ':' || u::text, 'warning');
    end loop;
  else
    update public.contractor_workers set is_active = false, removed_at = now(), removed_by = r.requester_user_id, remove_reason = 'إنهاء خدمة: ' || r.reason where id = r.target_worker_id and is_active;
    if not found then raise exception 'CONTRACTOR_WORKER_NOT_FOUND'; end if;
    insert into public.contractor_audit_log(actor_id, action, contractor_user_id, worker_id, reason)
    select r.requester_user_id, 'worker_terminated', w.contractor_user_id, w.id, r.reason from public.contractor_workers w where w.id = r.target_worker_id;
  end if;
  update public.termination_requests set status = 'executed', executed_at = now(), decided_at = coalesce(decided_at, now()) where id = p_id;
  perform app.hr_notify(r.requester_user_id, 'نُفّذ إنهاء خدمة ' || r.target_name, 'اكتملت الموافقات ونُفّذ الإجراء', app.procedures_link_for(r.requester_user_id), 'termination_exec:' || r.id::text, 'success');
end$$;


-- تغيير سائق انطلاقة مفتوحة من غرفة العمليات يخضع للحارس نفسه
create or replace function public.ops_set_departure_driver(p_departure_id uuid, p_driver_employee_id uuid, p_reason text)
returns public.garage_departures language plpgsql security definer set search_path=public,app as $$
declare u uuid:=app.require_fleet_master_actor(); d public.garage_departures; e public.employees; old_name text; old_id uuid;
begin
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'OPS_DRIVER_CHANGE_REASON_REQUIRED'; end if;
  e:=app.require_fleet_driver(p_driver_employee_id);
  select * into d from public.garage_departures where id=p_departure_id for update;
  if not found then raise exception 'GARAGE_DEPARTURE_NOT_FOUND'; end if;
  if d.returned_at is not null and d.departed_at < now() - interval '3 days' then raise exception 'OPS_DRIVER_CHANGE_TOO_OLD'; end if;
  if d.returned_at is null then perform app.assert_departure_driver(d.vehicle_id, e.id); end if;   -- 00252
  old_name:=d.driver_name; old_id:=d.driver_employee_id;
  update public.garage_departures set driver_name=e.full_name, driver_employee_id=e.id where id=d.id returning * into d;
  insert into public.audit_logs(table_name,record_id,operation,old_row,new_row,actor_id,actor_role)
  values('garage_departures',d.id::text,'SET_DRIVER',jsonb_build_object('driver_name',old_name,'driver_employee_id',old_id),jsonb_build_object('driver_name',e.full_name,'driver_employee_id',e.id,'reason',trim(p_reason)),u,app.current_role());
  return d;
end$$;
revoke all on function public.ops_set_departure_driver(uuid,uuid,text) from public,anon;
grant execute on function public.ops_set_departure_driver(uuid,uuid,text) to authenticated;
