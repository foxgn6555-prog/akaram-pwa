-- ═══════════════════════════════════════════════════════════════
-- 00034 · إصلاح شامل نهائي — يضمن أن كل دوال RPC موجودة في public
-- (يدمج كل مهاجرات 00021/00026/00032/00033 في ملف واحد مؤكد)
-- ═══════════════════════════════════════════════════════════════

-- ═══ أمن الدخول ═══
create or replace function public.is_login_locked(p_email text)
returns boolean language plpgsql stable security definer
set search_path = public, app as $$
begin
  return app.is_login_locked(p_email);
end $$;

create or replace function public.record_login_attempt(p_email text, p_success boolean)
returns void language plpgsql security definer
set search_path = public, app as $$
begin
  perform app.record_login_attempt(p_email, p_success);
end $$;

-- ═══ البوابة التقنية ═══
create or replace function public.list_platform_users(p_query text default null)
returns jsonb language plpgsql stable security definer
set search_path = public, app as $$
begin
  return app.list_platform_users(p_query);
end $$;

create or replace function public.set_user_role(p_user_id uuid, p_role text, p_grant boolean)
returns void language plpgsql security definer
set search_path = public, app as $$
begin
  perform app.set_user_role(p_user_id, p_role, p_grant);
end $$;

create or replace function public.db_stats()
returns jsonb language plpgsql stable security definer
set search_path = public, app as $$
begin
  return app.db_stats();
end $$;

create or replace function public.db_overview()
returns jsonb language plpgsql stable security definer
set search_path = public, app as $$
begin
  return app.db_overview();
end $$;

create or replace function public.db_table_details(p_table text)
returns jsonb language plpgsql stable security definer
set search_path = public, app as $$
begin
  return app.db_table_details(p_table);
end $$;

-- ═══ الصلاحيات ═══
create or replace function public.can_i_see(p_page_key text)
returns boolean language plpgsql stable security definer
set search_path = public, app as $$
declare v_uid uuid;
begin
  select auth.uid() into v_uid;
  if v_uid is null then return false; end if;
  return app.page_access(p_page_key, v_uid);
end $$;

-- ═══ الأرشيف ═══
create or replace function public.archive_counts()
returns jsonb language plpgsql stable security definer
set search_path = public, app as $$
begin
  return app.archive_counts();
end $$;

create or replace function public.archive_record(p_table text, p_id text, p_reason text)
returns boolean language plpgsql security definer
set search_path = public, app as $$
begin
  return app.archive_record(p_table, p_id, p_reason);
end $$;

create or replace function public.archive_restore(p_table text, p_id text)
returns boolean language plpgsql security definer
set search_path = public, app as $$
begin
  return app.archive_restore(p_table, p_id);
end $$;

-- ═══ القياسات ═══
create or replace function public.connection_sample(p_latency_ms integer)
returns void language plpgsql security definer
set search_path = public, app as $$
begin
  perform app.connection_sample(p_latency_ms);
end $$;

create or replace function public.connection_history()
returns jsonb language plpgsql stable security definer
set search_path = public, app as $$
begin
  return app.connection_history();
end $$;

-- ═══ Grants موحدة ═══
grant execute on function public.is_login_locked(text)                     to anon, authenticated;
grant execute on function public.record_login_attempt(text, boolean)     to anon, authenticated;
grant execute on function public.list_platform_users(text)               to authenticated;
grant execute on function public.set_user_role(uuid,text,boolean)        to authenticated;
grant execute on function public.db_stats()                              to authenticated;
grant execute on function public.db_overview()                           to authenticated;
grant execute on function public.db_table_details(text)                  to authenticated;
grant execute on function public.can_i_see(text)                         to authenticated;
grant execute on function public.archive_counts()                        to authenticated;
grant execute on function public.archive_record(text,text,text)          to authenticated;
grant execute on function public.archive_restore(text,text)              to authenticated;
grant execute on function public.connection_sample(integer)              to authenticated;
grant execute on function public.connection_history()                    to authenticated;

-- ═══ التحقق الذاتي: كل الدوال موجودة في public ═══
do $$
declare
  fn text; missing text := '';
  expected text[] := array[
    'is_login_locked', 'record_login_attempt', 'list_platform_users',
    'set_user_role', 'db_stats', 'db_overview', 'db_table_details',
    'can_i_see', 'archive_counts', 'archive_record', 'archive_restore',
    'connection_sample', 'connection_history'
  ];
begin
  foreach fn in array expected loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = fn
    ) then
      missing := missing || ' ' || fn;
    end if;
  end loop;
  if missing <> '' then
    raise exception 'FINALIZE FAIL — دوال مفقودة في public:%', missing;
  end if;
  raise notice '✅ كل الدوال الـ 13 موجودة في public — RPC كامل';
end $$;
