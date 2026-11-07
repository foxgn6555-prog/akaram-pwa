-- 00369: اكتمال تصنيفات التصفير والاحتفاظ، ونشر البقع الشهرية بصورة مغلقة حتى اكتمال النسخ.

-- كل أرشيف/تعديل للمطابقين غير المعروفين يتبع تصفير الحضور؛ صلاحيات الوحدة تتبع الحسابات.
alter function app.platform_reset_catalog() rename to platform_reset_catalog_00368;
create function app.platform_reset_catalog()
returns table(key text, label text, grp text, sort int, tables text[], buckets text[])
language sql immutable as $$
  select c.key, c.label, c.grp, c.sort,
    case
      when c.key = 'attendance' then c.tables || array[
        'unmatched_archive_device_users', 'unmatched_archive_punches',
        'unmatched_unit_people_edits', 'unmatched_unit_day_edits',
        'unmatched_unit_audit', 'unmatched_unit_independent_people']
      when c.key = 'accounts' then c.tables || array['unmatched_unit_permissions']
      else c.tables
    end,
    c.buckets
  from app.platform_reset_catalog_00368() c
$$;

-- כל الجداول الجديدة ظاهرة في شاشة الاحتفاظ، ومقفلة زمنياً لأنها بنية/سجل إثبات
-- أو لا تملك مفتاح id وعمود زمن يدعمان محرك الحذف العام.
alter function app.data_retention_catalog() rename to data_retention_catalog_00368;
create function app.data_retention_catalog()
returns table(data_key text, portal_key text, label text, description text, table_name text, time_column text, keep_where text,
              safety_lock text, deletable boolean, default_months int, default_export_required boolean)
language sql immutable as $$
  select * from app.data_retention_catalog_00368()
  union all values
    ('attendance_edit_requests', 'hr', 'طلبات تعديل الحضور', 'طلبات وسجل موافقات تعديلات الحضور.', 'attendance_edit_requests', null::text, null::text, 'سجل طلبات وموافقات محمي من الحذف الزمني', false, 0, false),
    ('attendance_edit_items', 'hr', 'بنود تعديل الحضور', 'تفاصيل الطلبات المعتمدة أو المرفوضة.', 'attendance_edit_items', null::text, null::text, 'تفاصيل إثبات مرتبطة بطلبات الحضور؛ محمية من الحذف الزمني', false, 0, false),
    ('parent_sectors', 'sectors', 'القطاعات الرئيسية', 'هيكل مرجعي؛ الإيقاف بدلاً من الحذف.', 'parent_sectors', null::text, null::text, 'بيانات هيكلية مرجعية محمية من الحذف الزمني', false, 0, false),
    ('platform_reset_requests', 'archive', 'طلبات التصفير', 'سجل طلبات واعتمادات ونتائج التصفير.', 'platform_reset_requests', null::text, null::text, 'سجل إثبات وأثر تدقيقي محمي من الحذف الزمني', false, 0, false),
    ('unmatched_archive_device_users', 'hr', 'أرشيف مستخدمي الأجهزة غير المطابقين', 'لقطة تاريخية لمستخدمي أجهزة البصمة غير المرتبطين بموظف.', 'unmatched_archive_device_users', null::text, null::text, 'أرشيف بصمات/هوية محمي؛ لا حذف زمني آلي', false, 0, false),
    ('unmatched_archive_punches', 'hr', 'أرشيف بصمات غير المطابقين', 'أدلة بصمة محفوظة حتى بعد تغيّر ربط الموظف.', 'unmatched_archive_punches', null::text, null::text, 'دليل حضور محفوظ ومحمي من الحذف الزمني الآلي', false, 0, false),
    ('unmatched_unit_permissions', 'hr', 'صلاحيات وحدة غير المطابقين', 'صلاحيات وصول حالية لموظفي الموارد البشرية.', 'unmatched_unit_permissions', null::text, null::text, 'إعداد صلاحيات حالية محمي من الحذف الزمني', false, 0, false),
    ('unmatched_unit_people_edits', 'hr', 'تعديلات أسماء غير المطابقين', 'تعديلات عرض الأسماء مع رقم المراجعة.', 'unmatched_unit_people_edits', null::text, null::text, 'تعديل موثق محمي من الحذف الزمني الآلي', false, 0, false),
    ('unmatched_unit_day_edits', 'hr', 'تعديلات أيام غير المطابقين', 'تعديلات الحضور اليومية المنفصلة عن الحضور الرسمي.', 'unmatched_unit_day_edits', null::text, null::text, 'تعديل حضور موثق محمي من الحذف الزمني الآلي', false, 0, false),
    ('unmatched_unit_audit', 'hr', 'تدقيق وحدة غير المطابقين', 'سجل تغييرات الأسماء والأيام والصلاحيات.', 'unmatched_unit_audit', null::text, null::text, 'سجل تدقيق محمي من الحذف الزمني الآلي', false, 0, false),
    ('unmatched_unit_independent_people', 'hr', 'الأشخاص المستقلون المؤكدون', 'إثباتات الأشخاص غير المنسوبين إلى موظف.', 'unmatched_unit_independent_people', null::text, null::text, 'إثبات هوية/حضور محمي من الحذف الزمني الآلي', false, 0, false)
$$;

-- إبطال علامة النشر عند بدء إعادة النسخ؛ لا تعرض الواجهة صفوفاً جزئية حتى اكتمال آخر صفحة.
alter function public.gps_hotspots_replace_month(date, jsonb, boolean, boolean, jsonb)
  rename to gps_hotspots_replace_month_00368;
create function public.gps_hotspots_replace_month(p_month date, p_rows jsonb, p_first boolean default false,
                                                    p_final boolean default false, p_thresholds jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare m date := date_trunc('month', p_month)::date;
begin
  if auth.role() <> 'service_role' then raise exception 'GPS_FORBIDDEN'; end if;
  if p_first then delete from public.gps_hotspots_sync where month = m; end if;
  return public.gps_hotspots_replace_month_00368(p_month, p_rows, p_first, p_final, p_thresholds);
end $$;
revoke all on function public.gps_hotspots_replace_month(date, jsonb, boolean, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.gps_hotspots_replace_month(date, jsonb, boolean, boolean, jsonb) to service_role;
-- الـEdge Function يستعمل service_role مباشرةً لحذف الأشهر خارج النافذة.
grant execute on function public.gps_hotspots_prune(date[]) to service_role;

-- استمرارية القراءة: أخفِ النسخة غير المكتملة حتى تُنشأ علامة المزامنة النهائية.
alter function public.gps_hotspots_list(date, text[], text[], integer, integer[])
  rename to gps_hotspots_list_00368;
create function public.gps_hotspots_list(p_month date default null, p_classes text[] default array['medium','heavy'], p_recurrence text[] default null,
                                         p_min_vehicles integer default 1, p_sector_ids integer[] default null)
returns jsonb language plpgsql stable security definer set search_path = public, app as $$
declare result jsonb;
begin
  result := public.gps_hotspots_list_00368(p_month, p_classes, p_recurrence, p_min_vehicles, p_sector_ids);
  if result -> 'sync' is null or result -> 'sync' = 'null'::jsonb then
    result := jsonb_set(result, '{rows}', '[]'::jsonb, true);
    result := jsonb_set(result, '{total}', '0'::jsonb, true);
  end if;
  return result;
end $$;
revoke all on function public.gps_hotspots_list(date, text[], text[], integer, integer[]) from public, anon;
grant execute on function public.gps_hotspots_list(date, text[], text[], integer, integer[]) to authenticated, service_role;

-- إعادة محاولة جدولة فحص الاحتفاظ اليومي إذا كان pg_cron قد فُعّل بعد الترحيل القديم.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'data_retention_scan_daily';
    perform cron.schedule('data_retention_scan_daily', '0 1 * * *', $job$ select app.data_retention_scan() $job$);
  else
    raise notice 'Data retention cron skipped: pg_cron is not enabled';
  end if;
end $$;

-- إعادة محاولة إنشاء مجدولي GPS عند وجود الأسرار/الإضافات وقت تطبيق هذا الترحيل.
-- الأسرار تُقرأ من Vault فقط، ولا تُحفظ داخل المستودع.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'GPS warehouse cron skipped: pg_cron/pg_net are not enabled'; return;
  end if;
  if not exists (select 1 from pg_namespace where nspname = 'vault') then
    raise notice 'GPS warehouse cron skipped: Vault is unavailable'; return;
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name in ('project_url', 'edge_service_role') having count(*) = 2) then
    raise notice 'GPS warehouse cron skipped: Vault secrets are missing'; return;
  end if;

  perform cron.unschedule(jobid) from cron.job where jobname in ('gps-warehouse-pull-minute', 'gps-warehouse-hotspots-nightly');
  perform cron.schedule('gps-warehouse-pull-minute', '* * * * *', $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/gps-warehouse',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_service_role')),
      body := '{"action":"pull"}'::jsonb, timeout_milliseconds := 120000);
  $job$);
  perform cron.schedule('gps-warehouse-hotspots-nightly', '30 20 * * *', $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/gps-warehouse',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_service_role')),
      body := '{"action":"sync_hotspots"}'::jsonb, timeout_milliseconds := 120000);
  $job$);
end $$;
