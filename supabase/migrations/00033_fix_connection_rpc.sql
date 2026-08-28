-- ═══════════════════════════════════════════════════════════════
-- 00033 · إصلاح connection_rpc — الدوال الأصلية في public كانت صحيحة
-- الغلاف في 00032 يشير لـ app.* غير الموجود. ننشئ النسخ في app ونصحح.
-- ═══════════════════════════════════════════════════════════════

create or replace function app.connection_cleanup()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.connection_samples where sampled_at < now() - interval '24 hours';
$$;

create or replace function app.connection_history()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not app.has_role(array['it_admin','super_admin']) then '[]'::jsonb
    else coalesce((
      select jsonb_agg(jsonb_build_object(
        'at', s.sampled_at, 'ms', s.latency_ms
      ) order by s.sampled_at)
      from (
        select sampled_at, latency_ms from public.connection_samples
        where sampled_at > now() - interval '2 hours'
        order by sampled_at desc limit 100
      ) s
    ), '[]'::jsonb)
  end;
$$;

create or replace function app.connection_sample(p_latency_ms integer)
returns void
language sql
security definer
set search_path = public, app
as $$
  insert into public.connection_samples (user_id, latency_ms)
  values (auth.uid(), greatest(0, least(p_latency_ms, 60000)));
  select app.connection_cleanup();
$$;

revoke all on function app.connection_cleanup()              from public, anon, authenticated;
revoke all on function app.connection_history()              from public, anon, authenticated;
revoke all on function app.connection_sample(integer)        from public, anon, authenticated;
grant execute on function app.connection_sample(integer)     to authenticated;
grant execute on function app.connection_history()           to authenticated;
