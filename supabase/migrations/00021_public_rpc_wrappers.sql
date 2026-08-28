-- ═══════════════════════════════════════════════════════════════
-- 00021 · إصلاح 404: دوال RPC يجب أن تعيش في المخطط public
-- PostgREST (الذي يستدعيه supabase.rpc()) يكشف مخطط public فقط،
-- والدوال كانت في app الداخلي → 404. الحل: غلافان رفيعان في public
-- يفوضان لـ app.* — مصدر الحقيقة واحد، والوصول عبر الاسم الصحيح.
-- القواعد الأمنية كاملة: فحص الدور داخل كل دالة إدارية (موروث من app.*).
-- ═══════════════════════════════════════════════════════════════

-- ── أمن الدخول (تستدعى قبل المصادقة → anon) ──
create or replace function public.record_login_attempt(p_email text, p_success boolean)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
begin
  perform app.record_login_attempt(p_email, p_success);
end;
$$;

create or replace function public.is_login_locked(p_email text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, app
as $$
begin
  return app.is_login_locked(p_email);
end;
$$;

create or replace function public.login_lock_remaining_seconds(p_email text)
returns integer
language plpgsql
stable
security definer
set search_path = public, app
as $$
begin
  return app.login_lock_remaining_seconds(p_email);
end;
$$;

create or replace function public.unlock_login(p_email text)
returns void
language sql
security definer
set search_path = public, app
as $$
  select app.unlock_login(p_email);
$$;

revoke all on function public.unlock_login(text) from public, anon, authenticated;
grant execute on function public.unlock_login(text) to authenticated;

grant execute on function public.record_login_attempt(text, boolean) to anon, authenticated;
grant execute on function public.is_login_locked(text)              to anon, authenticated;
grant execute on function public.login_lock_remaining_seconds(text) to anon, authenticated;

-- ── البوابة التقنية (authenticated — الدالة تتحقق من الدور داخلياً) ──
create or replace function public.list_platform_users(p_query text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
begin
  return app.list_platform_users(p_query);
end;
$$;

create or replace function public.set_user_role(p_user_id uuid, p_role text, p_grant boolean)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
begin
  perform app.set_user_role(p_user_id, p_role, p_grant);
end;
$$;

create or replace function public.db_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
begin
  return app.db_stats();
end;
$$;

create or replace function public.db_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
begin
  return app.db_overview();
end;
$$;

create or replace function public.db_table_details(p_table text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
begin
  return app.db_table_details(p_table);
end;
$$;

grant execute on function public.list_platform_users(text)          to authenticated;
grant execute on function public.set_user_role(uuid, text, boolean) to authenticated;
grant execute on function public.db_stats()                         to authenticated;
grant execute on function public.db_overview()                      to authenticated;
grant execute on function public.db_table_details(text)             to authenticated;

comment on schema app is 'دوال داخلية (RLS/Triggers) — لا تُكشف عبر PostgREST. دوال العميل في public تفوض إليها';
