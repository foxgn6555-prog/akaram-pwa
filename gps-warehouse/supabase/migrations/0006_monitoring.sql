-- 00386-ب — مراقبة السحب: ملخص الأخطاء حسب الرمز والجهاز، المهام العالقة، إعادة محاولة الفاشلة، سرعة/تقدير عامّان
insert into public.wh_schema_version (version, note) values (6, '00386-ب مراقبة السحب') on conflict (version) do nothing;

-- إعادة المهام الفاشلة نهائياً إلى الطابور (كل الأشهر داخل النافذة أو شهر محدد). تُصفَّر المحاولات وتبدأ فوراً.
create or replace function public.wh_retry_failed(p_month date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int; cutoff date := public.wh_cutoff();
begin
  with u as (
    update public.wh_pull_jobs set status = 'queued', attempts = 0, next_try_at = now(), started_at = null, finished_at = null, error_code = null, error_message = null
    where status = 'failed' and day >= cutoff and (p_month is null or date_trunc('month', day)::date = date_trunc('month', p_month)::date)
    returning 1)
  select count(*) into n from u;
  return jsonb_build_object('requeued', n, 'month', case when p_month is null then null else to_char(date_trunc('month', p_month), 'YYYY-MM') end);
end $$;

create or replace function public.wh_progress() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'window', public.wh_window(),
    'months', coalesce((select jsonb_agg(m order by m ->> 'month' desc) from (
        select jsonb_build_object('month', to_char(date_trunc('month', day), 'YYYY-MM'),
          'role', case when date_trunc('month', day)::date = date_trunc('month', (now() at time zone 'Asia/Baghdad'))::date then 'collecting'
                       when date_trunc('month', day)::date = (date_trunc('month', (now() at time zone 'Asia/Baghdad')) - interval '1 month')::date then 'displayed'
                       when date_trunc('month', day)::date < public.wh_cutoff() then 'expired' else 'kept' end,
          'total', count(*), 'done', count(*) filter (where status = 'done'),
          'queued', count(*) filter (where status = 'queued'), 'running', count(*) filter (where status = 'running'), 'failed', count(*) filter (where status = 'failed'),
          'points', coalesce(sum(points), 0), 'stops', coalesce(sum(stops), 0), 'devices', count(distinct device_external_id),
          'first_started_at', min(started_at), 'last_finished_at', max(finished_at) filter (where status = 'done'),
          'done_last_hour', count(*) filter (where status = 'done' and finished_at > now() - interval '1 hour')) m
        from public.wh_pull_jobs group by date_trunc('month', day)) x), '[]'::jsonb),
    'errors', coalesce((select jsonb_agg(jsonb_build_object('device_external_id', device_external_id, 'day', day, 'error_code', error_code, 'attempts', attempts, 'at', finished_at) order by finished_at desc)
        from (select * from public.wh_pull_jobs where error_code is not null order by finished_at desc nulls last limit 10) e), '[]'::jsonb),
    -- 00386-ب: ملخص الأخطاء حسب الرمز (الفاشلة نهائياً + التي تنتظر محاولة أخرى)
    'error_summary', coalesce((select jsonb_agg(jsonb_build_object('error_code', error_code, 'failed', failed, 'retrying', retrying, 'devices', devices, 'last_at', last_at) order by failed desc, retrying desc)
        from (select error_code, count(*) filter (where status = 'failed') failed, count(*) filter (where status = 'queued') retrying, count(distinct device_external_id) devices, max(finished_at) last_at
              from public.wh_pull_jobs where error_code is not null and status in ('failed', 'queued') group by error_code) s), '[]'::jsonb),
    -- 00386-ب: الأجهزة الأكثر فشلاً (حتى 10) مع آخر رمز
    'failed_devices', coalesce((select jsonb_agg(jsonb_build_object('device_external_id', device_external_id, 'failed_days', failed_days, 'last_error_code', last_error_code, 'last_at', last_at) order by failed_days desc)
        from (select device_external_id, count(*) failed_days, (array_agg(error_code order by finished_at desc nulls last))[1] last_error_code, max(finished_at) last_at
              from public.wh_pull_jobs where status = 'failed' group by device_external_id order by count(*) desc limit 10) d), '[]'::jsonb),
    'failed_total', (select count(*) from public.wh_pull_jobs where status = 'failed'),
    -- مهام «تعمل» منذ أكثر من 15 دقيقة = عالقة (تُحرَّر مع الدورة التالية عبر wh_jobs_claim)
    'stale_running', (select count(*) from public.wh_pull_jobs where status = 'running' and started_at < now() - interval '15 minutes'),
    -- سرعة وتقدير عامّان عبر كل الأشهر
    'throughput', jsonb_build_object(
      'done_last_hour', (select count(*) from public.wh_pull_jobs where status = 'done' and finished_at > now() - interval '1 hour'),
      'points_last_hour', (select coalesce(sum(points), 0) from public.wh_pull_jobs where status = 'done' and finished_at > now() - interval '1 hour'),
      'remaining', (select count(*) from public.wh_pull_jobs where status in ('queued', 'running')),
      'eta_minutes', (select case when count(*) filter (where status = 'done' and finished_at > now() - interval '1 hour') = 0 then null
                             else ceil(60.0 * count(*) filter (where status in ('queued', 'running')) / count(*) filter (where status = 'done' and finished_at > now() - interval '1 hour')) end from public.wh_pull_jobs)),
    'paused', (select paused from public.wh_settings where id = 1),
    'locked', (select coalesce(pull_locked_until > now(), false) from public.wh_settings where id = 1),
    'last_rollover_at', (select last_rollover_at from public.wh_settings where id = 1),
    'last_rollover', (select last_rollover from public.wh_settings where id = 1),
    'stops_by_class', coalesce((select jsonb_object_agg(class, c) from (select class, count(*) c from public.wh_stops group by class) y), '{}'::jsonb));
$$;

revoke all on function public.wh_retry_failed(date), public.wh_progress() from public, anon, authenticated;
