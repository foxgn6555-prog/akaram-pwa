-- Restrict the telemetry write RPC to signed-in clients; its UI is on authenticated IT dashboards.
revoke all on function public.connection_sample(integer) from public, anon;
grant execute on function public.connection_sample(integer) to authenticated, service_role;

-- An unauthenticated caller must not claim a successful login for an arbitrary email
-- and thereby clear that account's failed-login counter.
create or replace function app.record_login_attempt(p_email text, p_success boolean)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare v_auth_email text;
begin
  if p_success then
    if auth.uid() is null then
      raise exception 'LOGIN_SUCCESS_REQUIRES_AUTH';
    end if;
    select lower(email) into v_auth_email from auth.users where id = auth.uid();
    if v_auth_email is null or v_auth_email is distinct from lower(btrim(p_email)) then
      raise exception 'LOGIN_SUCCESS_EMAIL_MISMATCH';
    end if;
  end if;

  insert into public.login_attempts (email, success) values (lower(p_email), p_success);

  -- Existing retention behavior retained: this cleanup is not invoked during probes.
  delete from public.login_attempts
  where attempted_at < now() - interval '30 days';

  if p_success then
    delete from public.login_attempts
    where email = lower(p_email) and not success;
  end if;
end;
$$;
