-- The browser no longer calls these account-wide legacy RPCs. Revoke them so
-- clients cannot fabricate failed attempts or inspect old account-level locks.
revoke all on function public.record_login_attempt(text, boolean) from public, anon, authenticated;
revoke all on function public.is_login_locked(text) from public, anon, authenticated;
revoke all on function app.record_login_attempt(text, boolean) from public, anon, authenticated;
revoke all on function app.is_login_locked(text) from public, anon, authenticated;
