-- غرفة العمليات: عارض إثباتات تواجد المتعهدين (قراءة فقط).
-- لا يمنح أي كتابة/تصحيح/اعتماد جديد؛ يعرض ما سجّله المتعهد/الجهات الأخرى مع الصور والموقع والوقت وحالة الزون.
-- صلاحية قراءة صور contractor-photos موجودة مسبقاً لدور ops_room (00231). هذه الدالة قراءة فقط behind security definer.

create or replace function public.ops_contractor_presence_proofs(
  p_date date default null,
  p_parent text default null,
  p_contractor uuid default null
)
returns table(
  contractor_user_id uuid,
  contractor_name text,
  contractor_phone text,
  sector_id smallint,
  area_name text,
  parent_sector text,
  shift text,
  department_manager_name text,
  checked_in boolean,
  checkin_at timestamptz,
  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  in_zone boolean,
  selfie_path text,
  team_photo_path text,
  contractor_headcount int,
  follow_up_headcount int,
  sector_manager_headcount int
)
language plpgsql stable security definer set search_path = public, app as $$
declare
  d date := coalesce(p_date, app.baghdad_today());
begin
  if not app.has_role(array['ops_room','super_admin']) then
    raise exception 'OPS_ROOM_FORBIDDEN';
  end if;

  return query
  select
    cp.user_id,
    app.manager_display_name(cp.user_id),
    (select e.phone from public.employees e where e.user_id = cp.user_id limit 1),
    cp.sector_id,
    s.name,
    s.parent_sector,
    cp.shift,
    app.manager_display_name(cp.manager_user_id),
    c.id is not null,
    c.checked_at,
    c.latitude,
    c.longitude,
    c.accuracy_m,
    c.in_zone,
    c.selfie_path,
    c.team_photo_path,
    (select x.headcount from public.contractor_daily_counts x where x.contractor_user_id = cp.user_id and x.log_date = d and x.source = 'contractor'),
    (select x.headcount from public.contractor_daily_counts x where x.contractor_user_id = cp.user_id and x.log_date = d and x.source = 'follow_up'),
    (select x.headcount from public.contractor_daily_counts x where x.contractor_user_id = cp.user_id and x.log_date = d and x.source = 'sector_manager')
  from public.contractor_profiles cp
  join public.sectors s on s.id = cp.sector_id
  left join public.contractor_checkins c on c.contractor_user_id = cp.user_id and c.log_date = d
  where (cp.is_active or c.id is not null or exists (
      select 1 from public.contractor_daily_counts x
      where x.contractor_user_id = cp.user_id and x.log_date = d
    ))
    and (p_contractor is null or cp.user_id = p_contractor)
    and (p_parent is null or s.parent_sector = p_parent)
  order by s.parent_sector, s.id, cp.user_id;
end$$;

revoke all on function public.ops_contractor_presence_proofs(date, text, uuid) from public, anon;
grant execute on function public.ops_contractor_presence_proofs(date, text, uuid) to authenticated;
