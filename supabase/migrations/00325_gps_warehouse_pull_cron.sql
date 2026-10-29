-- 00325 — 00381: المجدول الخادمي لسحب المستودع: كل دقيقة يستدعي دالة الحافة gps-warehouse (action=pull) بمفتاح الخدمة من Vault
-- (السرّان project_url / edge_service_role موجودان منذ إعداد مجدول LVN — انظر docs/GPS_PUSH_SCHEDULER_SETUP_AR.md). لا مفاتيح هنا.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'gps-warehouse-pull: pg_cron/pg_net غير مفعّلين — يُجدول لاحقاً'; return;
  end if;
  if not exists (select 1 from pg_namespace where nspname = 'vault') then raise notice 'gps-warehouse-pull: Vault غير متاح'; return; end if;
  if not exists (select 1 from vault.decrypted_secrets where name in ('project_url', 'edge_service_role') having count(*) = 2) then
    raise notice 'gps-warehouse-pull: أسرار Vault (project_url / edge_service_role) غير موجودة — طبّق إعداد المجدول أولاً'; return;
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'gps-warehouse-pull-minute';
  perform cron.schedule('gps-warehouse-pull-minute', '* * * * *', $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/gps-warehouse',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_service_role')),
      body := '{"action":"pull"}'::jsonb,
      timeout_milliseconds := 120000);
  $job$);
end $$;

-- حالة المجدول لبطاقة IT: هل المهمة مجدولة؟ وآخر تشغيل لها
create or replace function public.gps_warehouse_cron_status() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare scheduled boolean := false; last_run timestamptz; last_status text;
begin
  if auth.uid() is null or not app.has_role(array['ops_room','it_admin','super_admin']) then raise exception 'GPS_FORBIDDEN'; end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute 'select exists (select 1 from cron.job where jobname = ''gps-warehouse-pull-minute'')' into scheduled;
    if scheduled then
      execute 'select d.start_time, d.status from cron.job_run_details d join cron.job j on j.jobid = d.jobid where j.jobname = ''gps-warehouse-pull-minute'' order by d.start_time desc limit 1' into last_run, last_status;
    end if;
  end if;
  return jsonb_build_object('scheduled', scheduled, 'last_run_at', last_run, 'last_status', last_status);
end $$;
revoke all on function public.gps_warehouse_cron_status() from public, anon;
grant execute on function public.gps_warehouse_cron_status() to authenticated;

-- gps_warehouse_link_get يضم حالة المجدول
create or replace function public.gps_warehouse_link_get() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
begin
  if auth.uid() is null or not app.has_role(array['ops_room','it_admin','super_admin']) then raise exception 'GPS_FORBIDDEN'; end if;
  return (select to_jsonb(l) from public.gps_warehouse_link l where id = 1) || jsonb_build_object('cron', public.gps_warehouse_cron_status());
end $$;
