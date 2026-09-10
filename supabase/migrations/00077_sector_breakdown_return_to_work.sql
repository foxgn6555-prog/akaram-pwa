-- ═══════════════════════════════════════════════════════════════
-- 00077 · دورة حياة عطل الآلية — تسجيل العطل ثم العودة إلى العمل
-- كل التوقيتات من الخادم، وكل التغييرات عبر RPC محمية.
-- ═══════════════════════════════════════════════════════════════

alter table public.sector_breakdowns
  add column resolved_at timestamptz,
  add column resolved_by uuid references auth.users(id),
  add column resolution_notes text;

update public.sector_breakdowns
set resolved_at=coalesce(archived_at,created_at),resolved_by=manager_id,resolution_notes=coalesce(resolution_notes,'سجل قديم قبل إضافة دورة العودة للعمل')
where status='resolved';

alter table public.sector_breakdowns
  add constraint sector_breakdowns_resolution_notes_check check (resolution_notes is null or length(trim(resolution_notes)) between 3 and 1000),
  add constraint sector_breakdowns_resolution_state_check check (
    (status='logged' and resolved_at is null and resolved_by is null)
    or (status='resolved' and resolved_at is not null and resolved_by is not null and resolution_notes is not null)
    or status='archived'
  );

create index idx_sector_breakdowns_open on public.sector_breakdowns(manager_id,lower(trim(db_number)),created_at desc)
  where status='logged' and archived_at is null;

create trigger trg_audit_sector_breakdowns after insert or update or delete on public.sector_breakdowns
  for each row execute function app.audit_trigger();

create or replace function public.sector_submit_breakdown(p_db_number text,p_fault_type text,p_notes text default null)
returns public.sector_breakdowns language plpgsql security definer set search_path=public,app as $$
declare v_uid uuid:=auth.uid();v_profile public.manager_profiles;v_name text;v_row public.sector_breakdowns;v_db text:=upper(trim(coalesce(p_db_number,'')));
begin
  if v_uid is null then raise exception 'NO_AUTH'; end if;
  select * into v_profile from public.manager_profiles where user_id=v_uid;
  if not found or not app.has_role(array['department_manager']) then raise exception 'SECTOR_MANAGER_FORBIDDEN'; end if;
  if length(v_db)<1 or length(v_db)>30 then raise exception 'BREAKDOWN_DB_INVALID'; end if;
  if length(trim(coalesce(p_fault_type,'')))<3 or length(p_fault_type)>300 then raise exception 'BREAKDOWN_FAULT_INVALID'; end if;
  if length(coalesce(p_notes,''))>1000 then raise exception 'BREAKDOWN_NOTES_TOO_LONG'; end if;
  if not exists(select 1 from public.sector_vehicles where lower(trim(db_number))=lower(v_db) and archived_at is null and sector_id=any(v_profile.sectors)) then raise exception 'BREAKDOWN_VEHICLE_NOT_ASSIGNED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text||':'||lower(v_db),0));
  if exists(select 1 from public.sector_breakdowns where manager_id=v_uid and lower(trim(db_number))=lower(v_db) and status='logged' and archived_at is null) then raise exception 'BREAKDOWN_ALREADY_OPEN'; end if;
  select coalesce(nullif(trim(full_name),''),v_uid::text) into v_name from public.employees where user_id=v_uid limit 1;
  v_name:=coalesce(v_name,v_uid::text);
  insert into public.sector_breakdowns(manager_id,manager_name,shift,sectors,db_number,fault_type,notes,status)
  values(v_uid,v_name,v_profile.shift,v_profile.sectors,v_db,trim(p_fault_type),nullif(trim(coalesce(p_notes,'')),''),'logged') returning * into v_row;
  return v_row;
end$$;

create or replace function public.sector_return_vehicle_to_work(p_breakdown_id uuid,p_resolution_notes text default null)
returns public.sector_breakdowns language plpgsql security definer set search_path=public,app as $$
declare v_uid uuid:=auth.uid();v_row public.sector_breakdowns;
begin
  if v_uid is null then raise exception 'NO_AUTH'; end if;
  if not app.has_role(array['department_manager']) then raise exception 'SECTOR_MANAGER_FORBIDDEN'; end if;
  if length(trim(coalesce(p_resolution_notes,'')))<3 or length(p_resolution_notes)>1000 then raise exception 'BREAKDOWN_RESOLUTION_NOTES_REQUIRED'; end if;
  update public.sector_breakdowns set status='resolved',resolved_at=now(),resolved_by=v_uid,resolution_notes=trim(p_resolution_notes)
  where id=p_breakdown_id and manager_id=v_uid and status='logged' and archived_at is null returning * into v_row;
  if not found then raise exception 'BREAKDOWN_OPEN_NOT_FOUND'; end if;
  return v_row;
end$$;

-- لا تحديث مباشر: زمن العودة وحالة البلاغ يحددهما الخادم فقط.
drop policy if exists "breakdown: تحديث" on public.sector_breakdowns;
revoke all on function public.sector_submit_breakdown(text,text,text),public.sector_return_vehicle_to_work(uuid,text) from public,anon;
grant execute on function public.sector_submit_breakdown(text,text,text),public.sector_return_vehicle_to_work(uuid,text) to authenticated;
