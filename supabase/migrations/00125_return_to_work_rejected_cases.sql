-- ═══════════════════════════════════════════════════════════════
-- 00125 · إعادة الآلية للعمل: الحالات المرفوضة لا تمنع العودة
-- حالة صيانة مرفوضة من الكراج تعني أن الآلية لم تدخل الصيانة،
-- فلا يجوز أن تبقى حاجبةً لإغلاق العطل وإعادة الآلية للعمل.
-- ═══════════════════════════════════════════════════════════════

drop function if exists public.sector_return_vehicle_to_work(uuid, text);

create or replace function public.sector_return_vehicle_to_work(
  p_breakdown_id uuid,
  p_resolution_notes text
)
returns public.sector_breakdowns
language plpgsql
security definer
set search_path = public, app
as $$
declare
  u uuid := auth.uid();
  r public.sector_breakdowns;
begin
  if not app.has_role(array['department_manager']) then
    raise exception 'SECTOR_MANAGER_FORBIDDEN';
  end if;
  if exists (
    select 1
      from public.vehicle_maintenance_cases
     where breakdown_id = p_breakdown_id
       and completed_at is null
       and coalesce(garage_decision_status, '') <> 'rejected'
  ) then
    raise exception 'BREAKDOWN_CONTROLLED_BY_MAINTENANCE';
  end if;
  if length(trim(coalesce(p_resolution_notes, ''))) < 3 then
    raise exception 'BREAKDOWN_RESOLUTION_NOTES_REQUIRED';
  end if;
  update public.sector_breakdowns
     set status = 'resolved',
         resolved_at = now(),
         resolved_by = u,
         resolution_notes = trim(p_resolution_notes)
   where id = p_breakdown_id
     and manager_id = u
     and status = 'logged'
     and archived_at is null
  returning * into r;
  if not found then
    raise exception 'BREAKDOWN_OPEN_NOT_FOUND';
  end if;
  return r;
end;
$$;

grant execute on function public.sector_return_vehicle_to_work(uuid, text) to authenticated;
