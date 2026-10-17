-- 00244 — دليل التشغيل التقني (٤/٤): لوحة الحالة الحية — دالة واحدة للقراءة فقط تعيد صورة الحالة الفنية للمنصة (IT فقط).
-- • القاعدة: الوقت، الإصدار، آخر ترحيل مطبّق وعددها (من سجل Supabase إن وُجد).
-- • البصمة: لكل مصدر آخر اتصال/آخر بصمة/بصمات اليوم/آخر عملية سحب وحالتها/الأوامر المعلّقة، وإجمالي اليوم وغير المطابَقين.
-- • GPS: آخر إحداثية وعدد الآليات التي أرسلت خلال آخر ١٠ دقائق.
-- لا كتابة، لا بيانات مالية، لا أسرار.

create or replace function public.devops_status() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare
  v_mig_count int; v_mig_last text; v_mig_at timestamptz; v_has_mig boolean := false;
  v_devices jsonb; v_bio jsonb; v_gps jsonb; v_signins int;
  v_today_start timestamptz := date_trunc('day', now() at time zone 'Asia/Baghdad') at time zone 'Asia/Baghdad';
begin
  if not app.has_role(array['it_admin','super_admin']) then raise exception 'IT_FORBIDDEN'; end if;

  -- سجل الترحيلات الذي تديره أداة supabase (قد لا يوجد في بيئة الاختبار المحلية)
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    v_has_mig := true;
    execute 'select count(*), max(version) from supabase_migrations.schema_migrations' into v_mig_count, v_mig_last;
    begin
      execute 'select max(inserted_at) from supabase_migrations.schema_migrations' into v_mig_at;
    exception when undefined_column then v_mig_at := null;
    end;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id, 'name', d.name, 'serial', d.serial_number, 'mode', d.mode, 'is_active', d.is_active,
      'last_seen_at', greatest(d.last_seen_at, d.bridge_last_seen_at),
      'bridge_last_error', d.bridge_last_error,
      'last_punch_at', p.last_punch_at, 'punches_today', coalesce(p.today, 0),
      'last_pull', case when l.id is null then null else jsonb_build_object('status', l.status, 'started_at', l.started_at, 'inserted', l.inserted, 'received', l.received, 'error', l.error) end,
      'queued_commands', coalesce(c.n, 0)
    ) order by d.is_active desc, d.name), '[]'::jsonb)
  into v_devices
  from public.biometric_devices d
  left join lateral (select max(x.punched_at) as last_punch_at, count(*) filter (where x.punched_at >= v_today_start) as today from public.biometric_punches x where x.device_serial = d.serial_number) p on true
  left join lateral (select * from public.biometric_pulls x where x.device_id = d.id order by x.started_at desc limit 1) l on true
  left join lateral (select count(*) as n from public.biometric_device_commands x where x.device_serial = d.serial_number and x.status in ('queued','sent')) c on true;

  select jsonb_build_object(
    'devices', v_devices,
    'punches_today', (select count(*) from public.biometric_punches where punched_at >= v_today_start),
    'unmatched_today', (select count(*) from public.biometric_punches where punched_at >= v_today_start and employee_id is null),
    'last_punch_at', (select max(punched_at) from public.biometric_punches),
    'failed_pulls_24h', (select count(*) from public.biometric_pulls where started_at >= now() - interval '24 hours' and status = 'failed')
  ) into v_bio;

  -- last_sign_in_at موجود في Supabase الحقيقي؛ قد يغيب في محاكاة الاختبار
  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'last_sign_in_at') then
    execute 'select count(*) from auth.users where last_sign_in_at >= now() - interval ''24 hours''' into v_signins;
  end if;

  select jsonb_build_object(
    'last_fix_at', (select max(fix_time) from public.vehicle_positions),
    'vehicles_10m', (select count(distinct vehicle_id) from public.vehicle_positions where fix_time >= now() - interval '10 minutes')
  ) into v_gps;

  return jsonb_build_object(
    'generated_at', now(),
    'database', jsonb_build_object(
      'now', now(),
      'version', split_part(version(), ' on ', 1),
      'migrations_tracked', v_has_mig,
      'migrations_count', v_mig_count,
      'last_migration', v_mig_last,
      'last_migration_at', v_mig_at,
      'functions_count', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','app')),
      'tables_count', (select count(*) from pg_tables where schemaname = 'public'),
      'rls_disabled_tables', (select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity)
    ),
    'biometric', v_bio,
    'gps', v_gps,
    'auth', jsonb_build_object(
      'users_total', (select count(*) from auth.users),
      'signins_24h', v_signins
    )
  );
end$$;

revoke all on function public.devops_status() from public, anon;
grant execute on function public.devops_status() to authenticated;
