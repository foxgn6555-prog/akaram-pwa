-- 00151 · الجولة 5 من تدقيق الانطلاقيات: الكراج المركزي + مسؤول القسم
-- المبدأ: مرونة وسلاسة بلا تعقيد —
--  · العطل القصير في الموقع يحلّه مسؤول القسم الذي سجّله، أو المسؤول المستلم الحالي للانطلاقية (البديل/اليدوي)،
--    أو غرفة العمليات بملاحظة حلّ إلزامية (مع تدقيق وإبلاغ المسؤول).
--  · لا مساس بمسار الصيانة: العطل المحال إلى الصيانة يبقى تحت سيطرتها.

alter table public.audit_logs drop constraint if exists audit_logs_operation_check;
alter table public.audit_logs add constraint audit_logs_operation_check
  check (operation in ('INSERT','UPDATE','DELETE','ARCHIVE','RESTORE','SEND_FOLDER_TO_DEPUTY','RECORD_WEIGHING','COMPLETE_WEIGHING','SET_DRIVER','CORRECT_WEIGHING','SAVE_VEHICLE_KIND','CORRECT_MAINTENANCE','RESOLVE_BREAKDOWN'));

-- مسؤول القسم: صاحب البلاغ أو المستلم الحالي للانطلاقية
create or replace function public.sector_return_vehicle_to_work(p_breakdown_id uuid, p_resolution_notes text)
returns public.sector_breakdowns
language plpgsql security definer set search_path = public, app as $$
declare u uuid := auth.uid(); r public.sector_breakdowns;
begin
  if not app.has_role(array['department_manager']) then raise exception 'SECTOR_MANAGER_FORBIDDEN'; end if;
  if exists (select 1 from public.vehicle_maintenance_cases where breakdown_id = p_breakdown_id and completed_at is null and coalesce(garage_decision_status, '') <> 'rejected') then
    raise exception 'BREAKDOWN_CONTROLLED_BY_MAINTENANCE';
  end if;
  if length(trim(coalesce(p_resolution_notes, ''))) < 3 then raise exception 'BREAKDOWN_RESOLUTION_NOTES_REQUIRED'; end if;
  update public.sector_breakdowns b
     set status = 'resolved', resolved_at = now(), resolved_by = u, resolution_notes = trim(p_resolution_notes)
   where b.id = p_breakdown_id and b.status = 'logged' and b.archived_at is null
     and (b.manager_id = u or exists (select 1 from public.garage_departures d where d.id = b.departure_id and d.recipient_manager_id = u and d.returned_at is null))
  returning b.* into r;
  if not found then raise exception 'BREAKDOWN_OPEN_NOT_FOUND'; end if;
  return r;
end$$;
grant execute on function public.sector_return_vehicle_to_work(uuid, text) to authenticated;

-- غرفة العمليات: حلّ العطل القصير المفتوح لانطلاقية (من تنبيه «عطل مفتوح دون حسم» أو التقارير)
create or replace function public.ops_resolve_breakdown(p_departure_id uuid, p_resolution_notes text)
returns public.sector_breakdowns
language plpgsql security definer set search_path = public, app as $$
declare u uuid := auth.uid(); b public.sector_breakdowns; v public.garage_vehicles;
begin
  if u is null or not app.has_role(array['ops_room','super_admin']) then raise exception 'OPS_ROOM_FORBIDDEN'; end if;
  if length(trim(coalesce(p_resolution_notes, ''))) < 3 then raise exception 'BREAKDOWN_RESOLUTION_NOTES_REQUIRED'; end if;
  select * into b from public.sector_breakdowns where departure_id = p_departure_id and status = 'logged' and archived_at is null for update;
  if not found then raise exception 'BREAKDOWN_OPEN_NOT_FOUND'; end if;
  if exists (select 1 from public.vehicle_maintenance_cases where breakdown_id = b.id and completed_at is null and coalesce(garage_decision_status, '') <> 'rejected') then
    raise exception 'BREAKDOWN_CONTROLLED_BY_MAINTENANCE';
  end if;
  update public.sector_breakdowns set status = 'resolved', resolved_at = now(), resolved_by = u, resolution_notes = trim(p_resolution_notes) where id = b.id returning * into b;
  insert into public.audit_logs (table_name, record_id, operation, new_row, actor_id, actor_role)
  values ('sector_breakdowns', b.id::text, 'RESOLVE_BREAKDOWN', jsonb_build_object('departure_id', p_departure_id, 'fault_type', b.fault_type, 'notes', trim(p_resolution_notes)), u, app.current_role());
  select * into v from public.garage_vehicles where id = b.vehicle_id;
  insert into public.notifications (user_id, title, body, type, link)
  values (b.manager_id, 'حلّت غرفة العمليات العطل المفتوح', format('DB %s — %s. الملاحظة: %s', coalesce(v.db_number, b.db_number), b.fault_type, trim(p_resolution_notes)), 'info', '/manager/breakdown');
  return b;
end$$;
revoke all on function public.ops_resolve_breakdown(uuid, text) from public, anon;
grant execute on function public.ops_resolve_breakdown(uuid, text) to authenticated;

-- القراءة: غرفة العمليات ترى كل البلاغات، والمستلم الحالي للانطلاقية يرى بلاغها (حتى لو سجّله مسؤول آخر)
drop policy if exists "breakdown: غرفة العمليات والمستلم" on public.sector_breakdowns;
create policy "breakdown: غرفة العمليات والمستلم" on public.sector_breakdowns
  for select to authenticated
  using (
    app.has_role(array['ops_room'])
    or exists (select 1 from public.garage_departures d where d.id = sector_breakdowns.departure_id and d.recipient_manager_id = auth.uid())
  );
