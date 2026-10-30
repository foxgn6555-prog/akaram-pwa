-- 0003 (00382-أ): wh_ping يضم حجم تخزين المستودع (ملفات الأرشيف) وعدد الملفات — تُعرض في لوحة المساحة بالمشروع الأول
insert into public.wh_schema_version (version, note) values (3, '00382-أ حجم التخزين في الفحص') on conflict (version) do nothing;

create or replace function public.wh_ping() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ok', true,
    'schema_version', (select max(version) from public.wh_schema_version),
    'vehicles', (select count(*) from public.wh_vehicles where active),
    'jobs', jsonb_build_object(
      'queued', (select count(*) from public.wh_pull_jobs where status = 'queued'),
      'running', (select count(*) from public.wh_pull_jobs where status = 'running'),
      'done', (select count(*) from public.wh_pull_jobs where status = 'done'),
      'failed', (select count(*) from public.wh_pull_jobs where status = 'failed')),
    'raw_points', (select count(*) from public.wh_raw_points),
    'stops', (select count(*) from public.wh_stops),
    'archive_files', (select count(*) from public.wh_archive_files),
    'db_bytes', pg_database_size(current_database()),
    'storage_bytes', (select coalesce(sum(nullif(o.metadata ->> 'size', '')::bigint), 0) from storage.objects o),
    'storage_objects', (select count(*) from storage.objects),
    'settings', (select to_jsonb(s) - 'id' - 'pull_locked_until' from public.wh_settings s where id = 1),
    'progress', public.wh_progress(),
    'server_time', now());
$$;
revoke all on function public.wh_ping() from public, anon, authenticated;
