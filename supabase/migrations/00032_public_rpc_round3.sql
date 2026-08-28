-- ═══════════════════════════════════════════════════════════════
-- 00032 · أغلفة public للأرشيف والقياسات — PostgREST يكشف public فقط
-- (نفس عيب 00021 الذي حُل — نكرر النمط للدوال الجديدة)
-- ═══════════════════════════════════════════════════════════════

create or replace function public.archive_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
begin
  return app.archive_counts();
end;
$$;

create or replace function public.archive_record(p_table text, p_id text, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public, app
as $$
begin
  return app.archive_record(p_table, p_id, p_reason);
end;
$$;

create or replace function public.archive_restore(p_table text, p_id text)
returns boolean
language plpgsql
security definer
set search_path = public, app
as $$
begin
  return app.archive_restore(p_table, p_id);
end;
$$;

create or replace function public.connection_sample(p_latency_ms integer)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
begin
  perform app.connection_sample(p_latency_ms);
end;
$$;

create or replace function public.connection_history()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app
as $$
begin
  return app.connection_history();
end;
$$;

grant execute on function public.archive_counts()                        to authenticated;
grant execute on function public.archive_record(text,text,text)         to authenticated;
grant execute on function public.archive_restore(text,text)             to authenticated;
grant execute on function public.connection_sample(integer)             to authenticated;
grant execute on function public.connection_history()                   to authenticated;
