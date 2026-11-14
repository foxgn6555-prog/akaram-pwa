-- Fix SQL three-valued-logic bypass for authenticated non-staff users on unassigned complaints.
create or replace function public.citizen_complaint_add_note(p_complaint uuid, p_note text) returns void
language plpgsql security definer set search_path = public, app as $$
declare c public.citizen_complaints;
begin
  select * into c from public.citizen_complaints where id = p_complaint;
  if not found then raise exception 'CITIZEN_COMPLAINT_NOT_FOUND'; end if;
  if auth.uid() is null
     or not (app.citizen_is_staff() or coalesce(c.assigned_to = auth.uid(), false)) then
    raise exception 'CITIZEN_FORBIDDEN';
  end if;
  if length(btrim(coalesce(p_note, ''))) = 0 then raise exception 'CITIZEN_NOTE_REQUIRED'; end if;
  insert into public.citizen_complaint_events (complaint_id, kind, note, actor_id, actor_name)
  values (p_complaint, 'note', btrim(p_note), auth.uid(), app.citizen_actor_name());
  update public.citizen_complaints set updated_at = now() where id = p_complaint;
end;
$$;
