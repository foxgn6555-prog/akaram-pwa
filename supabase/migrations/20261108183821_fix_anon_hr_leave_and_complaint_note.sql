-- 00372 · Prevent anonymous write/read bypasses through privileged RPCs.
-- These functions operate on employee and citizen records and are authenticated-only.

create or replace function public.hr_leave_balance(p_employee uuid, p_year int default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare me uuid := app.current_employee_id();
begin
  if not (
    app.has_role(array['hr_officer', 'finance_officer', 'ops_room', 'super_admin'])
    or coalesce(p_employee = me, false)
    or exists (
      select 1
      from public.employees e
      left join public.employees m on m.id = e.manager_id
      where e.id = p_employee
        and (e.manager_id = me or m.manager_id = me)
    )
    or app.garage_can_act_on(p_employee)
  ) then
    raise exception 'HR_FORBIDDEN';
  end if;

  return app.hr_balance_of(p_employee, p_year);
end;
$$;

-- Remove the default PUBLIC grant as well as anon; retain the existing signed-in UX.
revoke all on function public.hr_leave_balance(uuid, integer) from public, anon;
grant execute on function public.hr_leave_balance(uuid, integer) to authenticated;

create or replace function public.citizen_complaint_add_note(p_complaint uuid, p_note text) returns void
language plpgsql security definer set search_path = public, app as $$
declare c public.citizen_complaints;
begin
  select * into c from public.citizen_complaints where id = p_complaint;
  if not found then raise exception 'CITIZEN_COMPLAINT_NOT_FOUND'; end if;

  -- Anonymous auth.uid() is NULL. Reject it explicitly before evaluating assignment/role.
  if auth.uid() is null
     or not (app.citizen_is_staff() or c.assigned_to = auth.uid()) then
    raise exception 'CITIZEN_FORBIDDEN';
  end if;
  if length(btrim(coalesce(p_note, ''))) = 0 then raise exception 'CITIZEN_NOTE_REQUIRED'; end if;

  insert into public.citizen_complaint_events (complaint_id, kind, note, actor_id, actor_name)
  values (p_complaint, 'note', btrim(p_note), auth.uid(), app.citizen_actor_name());
  update public.citizen_complaints set updated_at = now() where id = p_complaint;
end;
$$;

-- This RPC is for assigned staff/users, not the public citizen token API.
revoke all on function public.citizen_complaint_add_note(uuid, text) from public, anon;
grant execute on function public.citizen_complaint_add_note(uuid, text) to authenticated;
