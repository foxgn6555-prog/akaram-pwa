-- 00368 — تنظيف البيانات التجريبية من بوابة التطوير المركزية (IT فقط):
--  • «تنظيف بيانات الصور»: كل صور البوابات الميدانية (الإعلام، الشكاوى الرسمية، شكاوى المواطنين ومرفقات محادثاتهم، القواطع، GBS،
--    المتعهدين، مرفقات الصيانة) — الملفات من التخزين عبر المتصفح بسياسة مؤقتة أثناء تشغيل التنظيف فقط، ثم السجلات من القاعدة.
--    لا تُمسّ: وثائق الموظفين، صور الآليات، الصور الشخصية، الرواتب، مكتبة الأغلفة الإعلامية وأغلفة القوالب.
--  • «تنظيف نقاط توقف GPS»: أحداث التوقف + حالة السحب + سجل المزامنة (يحرّر أي مزامنة عالقة فوراً).
--  كل تشغيل يُسجَّل في dev_cleanup_runs (من، متى، كم).

create table if not exists public.dev_cleanup_runs (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('photos', 'gps_stops')),
  status          text not null default 'running' check (status in ('running', 'done', 'cancelled')),
  started_by      uuid references auth.users(id),
  started_by_name text,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  planned_objects integer not null default 0,
  removed_objects integer not null default 0,
  deleted_rows    jsonb not null default '{}'::jsonb
);
alter table public.dev_cleanup_runs enable row level security;
create unique index if not exists dev_cleanup_runs_one_running_idx on public.dev_cleanup_runs(kind) where status = 'running';
drop policy if exists "dev-cleanup: IT reads runs" on public.dev_cleanup_runs;
create policy "dev-cleanup: IT reads runs" on public.dev_cleanup_runs for select to authenticated
  using (app.has_role(array['it_admin', 'super_admin']));

-- الحاويات المشمولة بتنظيف الصور (ميدانية فقط)
create or replace function app.dev_cleanup_photo_buckets() returns text[]
language sql immutable as $$
  select array['media-photos', 'complaint-media', 'citizen-complaints', 'sector-photos', 'gbs-containers', 'contractor-photos', 'maintenance-attachments']
$$;

-- ملفات محمية داخل الحاويات المشمولة: مكتبة الأغلفة الإعلامية وأغلفة قوالب التصميم
create or replace function app.dev_cleanup_object_protected(p_bucket text, p_name text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select p_bucket = 'media-photos' and (
       exists (select 1 from public.media_covers c where c.storage_path = p_name)
    or exists (select 1 from public.media_design_templates t where t.cover_path = p_name))
$$;

-- هل يوجد تنظيف صور جارٍ (بدأ خلال ساعتين) — تفتح سياسة التخزين المؤقتة
create or replace function app.dev_cleanup_photos_active() returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from public.dev_cleanup_runs r where r.kind = 'photos' and r.status = 'running' and r.started_at > now() - interval '2 hours')
$$;
create or replace function app.dev_cleanup_object_removable(p_bucket text, p_name text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select p_bucket = any(app.dev_cleanup_photo_buckets())
     and app.dev_cleanup_photos_active()
     and not app.dev_cleanup_object_protected(p_bucket, p_name)
$$;
revoke all on function app.dev_cleanup_object_removable(text, text) from public;
grant execute on function app.dev_cleanup_object_removable(text, text) to authenticated;

drop policy if exists "dev-cleanup: IT reads portal photos while cleaning" on storage.objects;
create policy "dev-cleanup: IT reads portal photos while cleaning" on storage.objects for select to authenticated
  using (app.has_role(array['it_admin', 'super_admin']) and app.dev_cleanup_object_removable(bucket_id, name));
drop policy if exists "dev-cleanup: IT removes portal photos while cleaning" on storage.objects;
create policy "dev-cleanup: IT removes portal photos while cleaning" on storage.objects for delete to authenticated
  using (app.has_role(array['it_admin', 'super_admin']) and app.dev_cleanup_object_removable(bucket_id, name));

-- ───────────── المعاينة: ماذا سيُحذف؟ ─────────────
create or replace function public.dev_cleanup_preview() returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare v_buckets jsonb; v_rows jsonb; v_gps jsonb; v_run record;
begin
  perform app.require_it();
  select coalesce(jsonb_agg(jsonb_build_object('bucket', b, 'objects', n, 'bytes', bytes) order by b), '[]'::jsonb) into v_buckets
  from (
    select b, count(o.id) n, coalesce(sum((o.metadata ->> 'size')::bigint), 0) bytes
    from unnest(app.dev_cleanup_photo_buckets()) b
    left join storage.objects o on o.bucket_id = b and not app.dev_cleanup_object_protected(o.bucket_id, o.name)
    group by b) x;
  v_rows := jsonb_build_object(
    'media_submission_photos', (select count(*) from public.media_submission_photos),
    'media_design_photos', (select count(*) from public.media_design_photos),
    'complaint_media', (select count(*) from public.complaint_media),
    'citizen_complaint_photos', (select count(*) from public.citizen_complaint_photos),
    'citizen_chat_attachments', (select count(*) from public.citizen_chat_messages where attachment_path is not null),
    'sector_photos', (select count(*) from public.sector_photos),
    'gbs_container_photos', (select count(*) from public.gbs_container_updates where photo_path is not null),
    'contractor_checkin_photos', (select count(*) from public.contractor_checkins where selfie_path not like 'purged/%'),
    'vehicle_maintenance_attachments', (select count(*) from public.vehicle_maintenance_attachments));
  v_gps := jsonb_build_object(
    'gps_stop_events', (select count(*) from public.gps_stop_events),
    'gps_stop_scan_state', (select count(*) from public.gps_stop_scan_state),
    'gps_sync_runs', (select count(*) from public.gps_sync_runs),
    'gps_sync_running', (select count(*) from public.gps_sync_runs where status = 'running'));
  select * into v_run from public.dev_cleanup_runs where kind = 'photos' and status = 'running' limit 1;
  return jsonb_build_object(
    'buckets', v_buckets,
    'photo_rows', v_rows,
    'gps', v_gps,
    'photos_run', case when v_run.id is null then null else jsonb_build_object('id', v_run.id, 'started_at', v_run.started_at, 'planned_objects', v_run.planned_objects, 'removed_objects', v_run.removed_objects) end,
    'history', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'status', r.status, 'started_by_name', r.started_by_name,
                        'started_at', r.started_at, 'finished_at', r.finished_at, 'removed_objects', r.removed_objects, 'deleted_rows', r.deleted_rows) order by r.started_at desc), '[]'::jsonb)
                from (select * from public.dev_cleanup_runs order by started_at desc limit 20) r));
end$$;

-- ───────────── الصور: بدء ─────────────
create or replace function public.dev_cleanup_photos_begin() returns jsonb
language plpgsql volatile security definer set search_path = public, app as $$
declare v_run public.dev_cleanup_runs; n int;
begin
  perform app.require_it();
  select * into v_run from public.dev_cleanup_runs where kind = 'photos' and status = 'running' limit 1;
  if found then
    if v_run.started_at <= now() - interval '2 hours' then
      update public.dev_cleanup_runs set status = 'cancelled', finished_at = now() where id = v_run.id;   -- تشغيل مهجور
    else
      return jsonb_build_object('id', v_run.id, 'planned_objects', v_run.planned_objects, 'resumed', true);
    end if;
  end if;
  select count(*) into n from storage.objects o where o.bucket_id = any(app.dev_cleanup_photo_buckets()) and not app.dev_cleanup_object_protected(o.bucket_id, o.name);
  insert into public.dev_cleanup_runs (kind, started_by, started_by_name, planned_objects)
  values ('photos', auth.uid(), app.user_display_name(auth.uid()), n) returning * into v_run;
  return jsonb_build_object('id', v_run.id, 'planned_objects', n, 'resumed', false);
end$$;

-- الدفعة التالية من الملفات (المحذوف يختفي من storage.objects فيتقدّم السحب تلقائياً)
create or replace function public.dev_cleanup_photos_objects(p_run uuid, p_limit int default 200) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
begin
  perform app.require_it();
  if not exists (select 1 from public.dev_cleanup_runs where id = p_run and kind = 'photos' and status = 'running') then
    raise exception 'DEV_CLEANUP_RUN_INVALID';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('bucket', o.bucket_id, 'path', o.name)) from (
    select o.bucket_id, o.name from storage.objects o
    where o.bucket_id = any(app.dev_cleanup_photo_buckets()) and not app.dev_cleanup_object_protected(o.bucket_id, o.name)
    order by o.bucket_id, o.name limit greatest(1, least(p_limit, 500))) o), '[]'::jsonb);
end$$;

create or replace function public.dev_cleanup_photos_progress(p_run uuid, p_removed int) returns jsonb
language plpgsql volatile security definer set search_path = public, app as $$
declare v_run public.dev_cleanup_runs; remaining int;
begin
  perform app.require_it();
  update public.dev_cleanup_runs set removed_objects = removed_objects + greatest(0, p_removed)
   where id = p_run and kind = 'photos' and status = 'running' returning * into v_run;
  if not found then raise exception 'DEV_CLEANUP_RUN_INVALID'; end if;
  select count(*) into remaining from storage.objects o where o.bucket_id = any(app.dev_cleanup_photo_buckets()) and not app.dev_cleanup_object_protected(o.bucket_id, o.name);
  return jsonb_build_object('id', v_run.id, 'removed_objects', v_run.removed_objects, 'planned_objects', v_run.planned_objects, 'remaining', remaining);
end$$;

-- ───────────── الصور: إنهاء — حذف السجلات بعد خلوّ التخزين ─────────────
create or replace function public.dev_cleanup_photos_finish(p_run uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, app as $$
declare v_run public.dev_cleanup_runs; remaining int; d jsonb := '{}'::jsonb; n int;
begin
  perform app.require_it();
  select * into v_run from public.dev_cleanup_runs where id = p_run and kind = 'photos' and status = 'running' for update;
  if not found then raise exception 'DEV_CLEANUP_RUN_INVALID'; end if;
  select count(*) into remaining from storage.objects o where o.bucket_id = any(app.dev_cleanup_photo_buckets()) and not app.dev_cleanup_object_protected(o.bucket_id, o.name);
  if remaining > 0 then raise exception 'DEV_CLEANUP_OBJECTS_REMAIN:%', remaining; end if;

  delete from public.complaint_media_revisions; get diagnostics n = row_count; d := d || jsonb_build_object('complaint_media_revisions', n);
  update public.complaint_media set superseded_by = null where superseded_by is not null;
  delete from public.complaint_media; get diagnostics n = row_count; d := d || jsonb_build_object('complaint_media', n);
  update public.complaint_reports set pptx_path = null where pptx_path is not null; get diagnostics n = row_count; d := d || jsonb_build_object('complaint_report_files', n);
  delete from public.citizen_complaint_photos; get diagnostics n = row_count; d := d || jsonb_build_object('citizen_complaint_photos', n);
  update public.citizen_chat_messages set attachment_path = null where attachment_path is not null; get diagnostics n = row_count; d := d || jsonb_build_object('citizen_chat_attachments', n);
  delete from public.sector_photos; get diagnostics n = row_count; d := d || jsonb_build_object('sector_photos', n);
  update public.gbs_container_updates set photo_path = null where photo_path is not null; get diagnostics n = row_count; d := d || jsonb_build_object('gbs_container_photos', n);
  -- صور المتعهدين إلزامية في السجل (تسجيل حضور) — تبقى السجلات ويُستبدل المسار بعلامة محذوف
  update public.contractor_checkins set selfie_path = 'purged/' || id::text, team_photo_path = 'purged/' || id::text where selfie_path not like 'purged/%';
  get diagnostics n = row_count; d := d || jsonb_build_object('contractor_checkin_photos', n);
  delete from public.vehicle_maintenance_attachments; get diagnostics n = row_count; d := d || jsonb_build_object('vehicle_maintenance_attachments', n);
  delete from public.media_design_photos; get diagnostics n = row_count; d := d || jsonb_build_object('media_design_photos', n);
  delete from public.media_submission_photos; get diagnostics n = row_count; d := d || jsonb_build_object('media_submission_photos', n);
  update public.media_submissions set photo_count = 0 where photo_count <> 0;

  update public.dev_cleanup_runs set status = 'done', finished_at = now(), deleted_rows = d where id = p_run returning * into v_run;
  return jsonb_build_object('id', v_run.id, 'removed_objects', v_run.removed_objects, 'deleted_rows', d);
end$$;

create or replace function public.dev_cleanup_cancel(p_run uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, app as $$
begin
  perform app.require_it();
  update public.dev_cleanup_runs set status = 'cancelled', finished_at = now() where id = p_run and status = 'running';
  return jsonb_build_object('ok', found);
end$$;

-- ───────────── نقاط توقف GPS: حذف مباشر ─────────────
create or replace function public.dev_cleanup_gps_stops() returns jsonb
language plpgsql volatile security definer set search_path = public, app as $$
declare d jsonb := '{}'::jsonb; n int; v_run public.dev_cleanup_runs;
begin
  perform app.require_it();
  delete from public.gps_stop_events; get diagnostics n = row_count; d := d || jsonb_build_object('gps_stop_events', n);
  delete from public.gps_stop_scan_state; get diagnostics n = row_count; d := d || jsonb_build_object('gps_stop_scan_state', n);
  select count(*) into n from public.gps_sync_runs where status = 'running'; d := d || jsonb_build_object('gps_sync_running_released', n);
  delete from public.gps_sync_runs; get diagnostics n = row_count; d := d || jsonb_build_object('gps_sync_runs', n);
  update public.gps_stop_hotspot_settings set last_refresh_at = null, last_refresh_ms = null, needs_reeval = false;
  insert into public.dev_cleanup_runs (kind, status, started_by, started_by_name, finished_at, deleted_rows)
  values ('gps_stops', 'done', auth.uid(), app.user_display_name(auth.uid()), now(), d) returning * into v_run;
  return jsonb_build_object('id', v_run.id, 'deleted_rows', d);
end$$;

revoke all on function public.dev_cleanup_preview() from public, anon;
revoke all on function public.dev_cleanup_photos_begin() from public, anon;
revoke all on function public.dev_cleanup_photos_objects(uuid, int) from public, anon;
revoke all on function public.dev_cleanup_photos_progress(uuid, int) from public, anon;
revoke all on function public.dev_cleanup_photos_finish(uuid) from public, anon;
revoke all on function public.dev_cleanup_cancel(uuid) from public, anon;
revoke all on function public.dev_cleanup_gps_stops() from public, anon;
grant execute on function public.dev_cleanup_preview() to authenticated;
grant execute on function public.dev_cleanup_photos_begin() to authenticated;
grant execute on function public.dev_cleanup_photos_objects(uuid, int) to authenticated;
grant execute on function public.dev_cleanup_photos_progress(uuid, int) to authenticated;
grant execute on function public.dev_cleanup_photos_finish(uuid) to authenticated;
grant execute on function public.dev_cleanup_cancel(uuid) to authenticated;
grant execute on function public.dev_cleanup_gps_stops() to authenticated;

-- ───────────── كتالوج الاحتفاظ: + dev_cleanup_runs (سجل إثبات) ─────────────
-- ───────────── كتالوج الاحتفاظ (مولَّد بـ scripts/gen-retention-catalog.py): + gps_stop_events, gps_stop_hotspot_settings, gps_stop_scan_state
create or replace function app.data_retention_catalog()
returns table (data_key text, portal_key text, label text, description text, table_name text, time_column text, keep_where text, safety_lock text,
               deletable boolean, default_months int, default_export_required boolean)
language sql immutable as $$
  values
    ('audit_logs', 'it', 'سجل التدقيق العام', 'كل تعديل على الجداول (قبل/بعد). يُستثنى ما يخص الرواتب والمالية.', 'audit_logs', 'created_at', 'table_name in (''payrolls'',''payslips'',''employee_salary_profiles'',''hr_month_exports'',''hr_month_export_rows'',''treasury_transactions'',''advances'',''advance_installments'',''hr_attendance_deductions'',''disclosures'')', 'سجلات التدقيق المتعلقة بالرواتب والمالية والخصومات محمية دائماً', true, 36, true),
    ('app_errors', 'it', 'أخطاء التطبيق', 'أخطاء الواجهة والخادم المسجَّلة تلقائياً.', 'app_errors', 'created_at', 'resolved is not true and archived_at is null', 'الأخطاء غير المحلولة وغير المؤرشفة محمية', true, 6, false),
    ('integration_logs', 'it', 'سجل التكاملات الخارجية', 'طلبات/ردود مزوّدي GPS والبريد وغيرها.', 'integration_logs', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 6, false),
    ('login_attempts', 'it', 'محاولات تسجيل الدخول', 'ناجحة وفاشلة، مع العنوان والوقت.', 'login_attempts', 'attempted_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 12, false),
    ('connection_samples', 'it', 'عينات جودة الاتصال', 'قياسات زمن الاستجابة من أجهزة المستخدمين.', 'connection_samples', 'sampled_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 3, false),
    ('biometric_pulls', 'it', 'سجل سحب البصمات من الأجهزة', 'كل عملية سحب يدوية/آلية ونتيجتها. البصمات نفسها نوع مستقل.', 'biometric_pulls', 'started_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 6, false),
    ('biometric_pushes', 'it', 'سجل دفع الموظفين إلى الأجهزة', 'كل عملية إرسال موظف لجهاز بصمة.', 'biometric_pushes', 'received_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 6, false),
    ('biometric_device_commands', 'it', 'أوامر أجهزة البصمة', 'الأوامر المرسلة للأجهزة (ADMS).', 'biometric_device_commands', 'created_at', 'acked_at is null', 'الأوامر التي لم يؤكدها الجهاز بعد محمية', true, 3, false),
    ('biometric_raw_punches', 'it', 'البصمات الخام من الأجهزة', 'كل لمسة إصبع كما وصلت من الجهاز. سجل الحضور المحسوب والخصومات لا يُمسّان.', 'biometric_punches', 'punched_at', null, 'لا تُحذف بصمات شهر لم تعتمده المالية (راتب معتمد أو مدفوع)', true, 6, true),
    ('biometric_devices', 'it', 'أجهزة البصمة', '', 'biometric_devices', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('biometric_device_users', 'it', 'موظفو أجهزة البصمة (المسجَّلون على كل جهاز)', '', 'biometric_device_users', null, null, 'حالة حالية تُحدَّث ولا تتراكم — لا معنى لحذفها زمنياً', false, 0, false),
    ('biometric_adms_endpoints', 'it', 'نقاط ADMS', '', 'biometric_adms_endpoints', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('it_assets', 'it', 'أصول تقنية المعلومات', '', 'it_assets', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('it_tickets', 'it', 'تذاكر الدعم الفني', '', 'it_tickets', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('system_settings', 'it', 'إعدادات النظام', '', 'system_settings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('dynamic_portals', 'it', 'البوابات الديناميكية', '', 'dynamic_portals', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('portal_units', 'it', 'وحدات البوابات', '', 'portal_units', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('portal_hidden_units', 'it', 'الوحدات المخفية لكل مستخدم', '', 'portal_hidden_units', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('role_page_permissions', 'it', 'صلاحيات الصفحات حسب الدور', '', 'role_page_permissions', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('user_page_overrides', 'it', 'استثناءات صلاحيات المستخدمين', '', 'user_page_overrides', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('permission_units', 'it', 'وحدات الصلاحيات (كتالوج 00350)', '', 'permission_units', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('permission_portal_roles', 'it', 'دور كل بوابة (صلاحيات 00350)', '', 'permission_portal_roles', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('permission_templates', 'it', 'قوالب الصلاحيات', '', 'permission_templates', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('permission_template_rules', 'it', 'قواعد قوالب الصلاحيات', '', 'permission_template_rules', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('user_permission_template', 'it', 'قالب الصلاحيات لكل مستخدم', '', 'user_permission_template', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('user_permission_overrides', 'it', 'استثناءات الصلاحيات الفردية', '', 'user_permission_overrides', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('permission_audit', 'it', 'سجل تدقيق الصلاحيات', '', 'permission_audit', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false),
    ('permission_write_bindings', 'it', 'ربط دوال الكتابة بالصلاحيات (00350-B)', '', 'permission_write_bindings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('user_roles', 'it', 'أدوار المستخدمين', '', 'user_roles', null, null, 'حسابات/هويات مستخدمين — لا تُحذف زمنياً', false, 0, false),
    ('manager_profiles', 'it', 'ملفات المديرين', '', 'manager_profiles', null, null, 'حسابات/هويات مستخدمين — لا تُحذف زمنياً', false, 0, false),
    ('documents', 'it', 'المستندات العامة', '', 'documents', null, null, 'الصور والملفات تُدار عبر الأرشيف البارد؛ السجل النصي يبقى', false, 0, false),
    ('notifications', 'notifications', 'الإشعارات', 'إشعارات الجرس لكل مستخدم.', 'notifications', 'created_at', 'is_read is not true and read_at is null and dismissed_at is null', 'الإشعارات غير المقروءة محمية', true, 6, false),
    ('notification_push_deliveries', 'notifications', 'سجل تسليم إشعارات الدفع', 'محاولات إرسال Push لكل اشتراك ونتيجتها.', 'notification_push_deliveries', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 3, false),
    ('notification_push_admin_actions', 'notifications', 'إجراءات IT على إشعارات الدفع', 'إعادة إرسال/إيقاف من بوابة IT.', 'notification_push_admin_actions', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 12, false),
    ('notification_push_subscriptions', 'notifications', 'اشتراكات Push للأجهزة', '', 'notification_push_subscriptions', null, null, 'حالة حالية تُحدَّث ولا تتراكم — لا معنى لحذفها زمنياً', false, 0, false),
    ('notification_preferences', 'notifications', 'تفضيلات الإشعارات', '', 'notification_preferences', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('notification_workflow_policies', 'notifications', 'سياسات إشعارات سير العمل', '', 'notification_workflow_policies', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('announcements', 'notifications', 'التعميمات', '', 'announcements', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('announcement_receipts', 'notifications', 'إيصالات قراءة التعميمات', '', 'announcement_receipts', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('gps_position_history', 'gps', 'نقاط GPS التفصيلية للآليات', 'إحداثيات كل آلية كل ثوانٍ. ملخصات الرحلات والتنبيهات تبقى.', 'gps_device_position_history', 'fix_time', null, 'لا تُحذف نقاط رحلة عليها تحقيق مفتوح', true, 3, false),
    ('vehicle_positions', 'gps', 'مواقع المركبات (النظام القديم)', 'نقاط موقع من التكامل الأول قبل مزوّدي GPS.', 'vehicle_positions', 'fix_time', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 3, false),
    ('gps_events', 'gps', 'أحداث GPS العامة', 'تشغيل/إطفاء/سرعة وغيرها كما وصلت.', 'gps_events', 'occurred_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 6, false),
    ('gps_vendor_events', 'gps', 'أحداث مزوّد GPS الخام', 'الأحداث كما أرسلها المزوّد.', 'gps_vendor_events', 'occurred_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 6, false),
    ('gps_zone_events', 'gps', 'أحداث دخول/خروج المناطق', 'دخول وخروج الآليات من المناطق الجغرافية.', 'gps_zone_events', 'occurred_at', 'departure_id in (select ti.departure_id from public.gps_trip_investigations ti where ti.status <> ''resolved'')', 'أحداث رحلة عليها تحقيق مفتوح محمية', true, 6, false),
    ('gps_sync_runs', 'gps', 'سجل مزامنات GPS', 'كل دورة مزامنة مع المزوّد ونتيجتها.', 'gps_sync_runs', 'started_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 3, false),
    ('gps_history_import_runs', 'gps', 'سجل استيراد تاريخ GPS', 'عمليات استيراد المسارات القديمة.', 'gps_history_import_runs', 'started_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 6, false),
    ('gps_operational_alerts', 'gps', 'تنبيهات GPS التشغيلية', 'توقف طويل، خروج عن المسار… المحلولة فقط.', 'gps_operational_alerts', 'opened_at', 'resolved_at is null', 'التنبيهات غير المحلولة محمية', true, 12, false),
    ('live_track_points', 'gps', 'نقاط المشاركة الحية للموظفين', 'إحداثيات مشاركة الموقع من هواتف الميدان.', 'live_track_points', 'recorded_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 3, false),
    ('live_track_sessions', 'gps', 'جلسات المشاركة الحية', 'كل جلسة مشاركة موقع (بداية/نهاية/عدد النقاط).', 'live_track_sessions', 'started_at', 'ended_at is null', 'الجلسات الجارية محمية', true, 12, false),
    ('trip_route_points', 'gps', 'نقاط مسارات الانطلاقيات', 'النقاط المنظَّفة لكل انطلاقية (00342). ملخص المسار والتوقفات تبقى.', 'trip_route_points', 'fix_time', 'departure_id in (select ti.departure_id from public.gps_trip_investigations ti where ti.status <> ''resolved'')', 'نقاط انطلاقية عليها تحقيق مفتوح محمية', true, 12, false),
    ('trip_route_gaps', 'gps', 'فجوات GPS في مسارات الانطلاقيات', 'فترات انقطاع الإشارة لكل انطلاقية.', 'trip_route_gaps', 'started_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 24, false),
    ('trip_routes', 'gps', 'ملخصات مسارات الانطلاقيات', '', 'trip_routes', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('trip_route_stops', 'gps', 'توقفات مسارات الانطلاقيات', '', 'trip_route_stops', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('trip_route_settings', 'gps', 'إعدادات محرّك المسار', '', 'trip_route_settings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('gps_devices', 'gps', 'أجهزة GPS', '', 'gps_devices', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('gps_providers', 'gps', 'مزوّدو GPS', '', 'gps_providers', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('gps_device_positions', 'gps', 'آخر موقع لكل جهاز', '', 'gps_device_positions', null, null, 'حالة حالية تُحدَّث ولا تتراكم — لا معنى لحذفها زمنياً', false, 0, false),
    ('gps_geofences', 'gps', 'المناطق الجغرافية', '', 'gps_geofences', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('gps_vehicle_geofences', 'gps', 'ربط الآليات بالمناطق', '', 'gps_vehicle_geofences', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('gps_vehicle_bindings', 'gps', 'ربط الأجهزة بالآليات', '', 'gps_vehicle_bindings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('gps_map_landmarks', 'gps', 'معالم الخريطة', '', 'gps_map_landmarks', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('gps_route_deviation_settings', 'gps', 'إعدادات الانحراف عن المسار', '', 'gps_route_deviation_settings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('gps_route_presence_state', 'gps', 'حالة التواجد على المسار', '', 'gps_route_presence_state', null, null, 'حالة حالية تُحدَّث ولا تتراكم — لا معنى لحذفها زمنياً', false, 0, false),
    ('gps_stop_events', 'gps', 'أحداث التوقف (بقع التوقف)', 'نقطة ومدة كل توقف للآليات المربوطة (00362). يحذفها المحرك تلقائياً بعد الحد الأقصى بالأيام المضبوط في إعدادات بقع التوقف؛ هذا سقف أمان إضافي.', 'gps_stop_events', 'ended_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 1, false),
    ('gps_stop_hotspot_settings', 'gps', 'إعدادات بقع التوقف', '', 'gps_stop_hotspot_settings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('gps_stop_scan_state', 'gps', 'حالة مسح بقع التوقف (علامة مائية لكل جهاز)', '', 'gps_stop_scan_state', null, null, 'حالة حالية تُحدَّث ولا تتراكم — لا معنى لحذفها زمنياً', false, 0, false),
    ('gps_zone_presence_state', 'gps', 'حالة التواجد في المناطق', '', 'gps_zone_presence_state', null, null, 'حالة حالية تُحدَّث ولا تتراكم — لا معنى لحذفها زمنياً', false, 0, false),
    ('gps_alert_notification_policies', 'gps', 'سياسات إشعارات تنبيهات GPS', '', 'gps_alert_notification_policies', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('gps_trip_investigations', 'gps', 'تحقيقات الرحلات', '', 'gps_trip_investigations', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('live_track_settings', 'gps', 'إعدادات المشاركة الحية', '', 'live_track_settings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('hr_attendance_audit', 'hr', 'سجل تدقيق تعديلات الحضور', 'من عدّل ماذا ولماذا في أيام الحضور.', 'hr_attendance_audit', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 36, true),
    ('hr_deduction_review_audit', 'hr', 'سجل مراجعة الخصومات', 'قرارات نائب المدير على الخصومات.', 'hr_deduction_review_audit', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 36, true),
    ('hr_deduction_rule_audit', 'hr', 'سجل تعديل قواعد الخصم', 'تاريخ تغيير قواعد الخصم.', 'hr_deduction_rule_audit', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 36, true),
    ('rented_vehicle_tax_audit', 'hr', 'سجل تدقيق ضريبة المركبات المستأجرة', 'تعديلات إعدادات/استثناءات الضريبة.', 'rented_vehicle_tax_audit', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 36, true),
    ('hr_alerts', 'hr', 'تنبيهات الموارد البشرية', 'تنبيهات تجاوز العتبات (غياب/تأخير). المؤكَّدة فقط.', 'hr_alerts', 'created_at', 'acknowledged_at is null', 'التنبيهات غير المؤكَّدة محمية', true, 24, false),
    ('finance_hr_notices', 'hr', 'إشعارات HR إلى المالية', 'تبليغات تغيّر الراتب/الإنهاء. المنجَزة فقط.', 'finance_hr_notices', 'created_at', 'is_done is not true', 'الإشعارات غير المنجَزة محمية', true, 24, false),
    ('employees', 'hr', 'الموظفون', '', 'employees', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('departments', 'hr', 'الأقسام', '', 'departments', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('branches', 'hr', 'الفروع', '', 'branches', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('employee_documents', 'hr', 'وثائق الموظفين', '', 'employee_documents', null, null, 'الصور والملفات تُدار عبر الأرشيف البارد؛ السجل النصي يبقى', false, 0, false),
    ('hr_shifts', 'hr', 'الورديات', '', 'hr_shifts', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('employee_shift_assignments', 'hr', 'تعيين الورديات', '', 'employee_shift_assignments', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('hr_leave_types', 'hr', 'أنواع الإجازات', '', 'hr_leave_types', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('hr_leaves', 'hr', 'الإجازات', '', 'hr_leaves', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('hr_leave_ledger', 'hr', 'رصيد الإجازات', '', 'hr_leave_ledger', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('termination_requests', 'hr', 'طلبات إنهاء الخدمة', '', 'termination_requests', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('hire_requests', 'hr', 'طلبات تعيين الموظفين (00348)', '', 'hire_requests', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('requests', 'hr', 'الطلبات العامة للموظفين', '', 'requests', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('attendance_records', 'hr', 'سجلات الحضور (القديمة)', '', 'attendance_records', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_attendance_days', 'hr', 'أيام الحضور المحسوبة', '', 'hr_attendance_days', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_attendance_confirmations', 'hr', 'تأكيدات شهر الحضور', '', 'hr_attendance_confirmations', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_attendance_pending_auto', 'hr', 'الخصومات الآلية بانتظار التأكيد', '', 'hr_attendance_pending_auto', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_attendance_deductions', 'hr', 'خصومات الحضور', '', 'hr_attendance_deductions', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_deduction_rules', 'hr', 'قواعد الخصم', '', 'hr_deduction_rules', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('hr_deduction_rule_targets', 'hr', 'نطاق قواعد الخصم', '', 'hr_deduction_rule_targets', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('hr_deduction_exemptions', 'hr', 'إعفاءات الخصم', '', 'hr_deduction_exemptions', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_month_exports', 'hr', 'تصدير الشهر إلى المالية', '', 'hr_month_exports', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_month_export_rows', 'hr', 'صفوف تصدير الشهر', '', 'hr_month_export_rows', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_policy', 'hr', 'سياسة الموارد البشرية', '', 'hr_policy', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('hr_settings', 'hr', 'إعدادات الموارد البشرية', '', 'hr_settings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('rented_vehicle_tax_settings', 'hr', 'إعدادات ضريبة المركبات المستأجرة', '', 'rented_vehicle_tax_settings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('rented_vehicle_tax_overrides', 'hr', 'استثناءات ضريبة المركبات المستأجرة', '', 'rented_vehicle_tax_overrides', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_overtime_rates', 'hr', 'أجر الساعة الثابت للإضافي المدفوع', '', 'hr_overtime_rates', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_overtime_payouts', 'hr', 'صرف الساعات الإضافية', '', 'hr_overtime_payouts', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_overtime_members', 'hr', 'الموظفون المشمولون بالإضافي المدفوع', '', 'hr_overtime_members', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_overtime_member_events', 'hr', 'سجل إدراج/إزالة المشمولين بالإضافي المدفوع', '', 'hr_overtime_member_events', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_settlements', 'finance', 'تصفيات نهاية الخدمة', '', 'hr_settlements', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('hr_settlement_events', 'finance', 'سجل أحداث تصفيات نهاية الخدمة', '', 'hr_settlement_events', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('official_letters', 'finance', 'الكتب الرسمية (إنهاء خدمة/تصفية)', '', 'official_letters', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('advance_events', 'finance', 'سجل أحداث السلف', 'مسار كل سلفة (طلب/موافقة/تسليم/تسديد). السلف غير المسدَّدة محمية.', 'advance_events', 'created_at', 'advance_id in (select a.id from public.advances a where a.settled_at is null and a.cancelled_at is null)', 'أحداث السلف غير المسدَّدة محمية', true, 36, true),
    ('disclosure_events', 'finance', 'سجل أحداث الكشوفات', 'مسار كل كشف (إرسال/موافقة/إرجاع). الكشوفات غير المنتهية محمية.', 'disclosure_events', 'created_at', 'disclosure_id in (select d.id from public.disclosures d where d.approved_at is null and d.cancelled_at is null)', 'أحداث الكشوفات غير المنتهية محمية', true, 36, true),
    ('payrolls', 'finance', 'الرواتب الشهرية', '', 'payrolls', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('payslips', 'finance', 'قسائم الرواتب', '', 'payslips', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('employee_salary_profiles', 'finance', 'ملفات الرواتب', '', 'employee_salary_profiles', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('advances', 'finance', 'السلف', '', 'advances', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('advance_installments', 'finance', 'أقساط السلف', '', 'advance_installments', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('advance_types', 'finance', 'أنواع السلف', '', 'advance_types', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('budget_allocations', 'finance', 'مخصصات الموازنة', '', 'budget_allocations', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('treasury_transactions', 'finance', 'حركات الخزينة', '', 'treasury_transactions', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('treasury_receivable_types', 'finance', 'أنواع المقبوضات', '', 'treasury_receivable_types', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('treasury_expense_types', 'finance', 'أنواع المصاريف', '', 'treasury_expense_types', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('disclosures', 'finance', 'الكشوفات', '', 'disclosures', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('disclosure_types', 'finance', 'أنواع الكشوفات', '', 'disclosure_types', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('approval_delegations', 'approvals', 'تفويضات الموافقة', 'تفويض مؤقت لصلاحية الموافقة. السارية محمية.', 'approval_delegations', 'created_at', 'cancelled_at is null and ends_on >= current_date', 'التفويضات السارية محمية', true, 24, false),
    ('approval_chains', 'approvals', 'سلاسل الموافقات', '', 'approval_chains', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('approval_chain_versions', 'approvals', 'تاريخ تعديل سلاسل الموافقات', '', 'approval_chain_versions', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false),
    ('approval_tasks', 'approvals', 'مهام الموافقة', '', 'approval_tasks', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false),
    ('sector_notices', 'ops', 'بلاغات غرفة العمليات للقطاعات', 'رسائل مرسلة من غرفة العمليات إلى مديري القطاعات.', 'sector_notices', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 12, false),
    ('deputy_daily_reports', 'ops', 'التقارير اليومية لنائب المدير', 'لقطة التقرير اليومي المرسَل.', 'deputy_daily_reports', 'sent_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 24, true),
    ('gbs_container_updates', 'ops', 'طلبات تحديث الحاويات', 'طلبات تغيير حالة/موقع حاوية. غير المراجَعة محمية.', 'gbs_container_updates', 'created_at', 'reviewed_at is null', 'الطلبات غير المراجَعة محمية', true, 12, false),
    ('vehicles', 'ops', 'المركبات (الأسطول)', '', 'vehicles', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('vehicle_categories', 'ops', 'فئات المركبات', '', 'vehicle_categories', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('garage_vehicles', 'ops', 'آليات الكراج', '', 'garage_vehicles', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('garage_departures', 'ops', 'خروج ورجوع الآليات', '', 'garage_departures', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('garage_driver_assignments', 'ops', 'تعيين السائقين', '', 'garage_driver_assignments', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('garage_vehicle_shift_assignments', 'ops', 'ورديات الآليات', '', 'garage_vehicle_shift_assignments', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('garage_tanks', 'ops', 'خزانات الوقود', '', 'garage_tanks', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('garage_inventory_movements', 'ops', 'حركات الوقود والمخزون', '', 'garage_inventory_movements', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('garage_tank_zero_requests', 'ops', 'طلبات تصفير الخزان', '', 'garage_tank_zero_requests', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('garage_user_profiles', 'ops', 'حسابات الكراج', '', 'garage_user_profiles', null, null, 'حسابات/هويات مستخدمين — لا تُحذف زمنياً', false, 0, false),
    ('vehicle_trip_legs', 'ops', 'أرجل الرحلات', '', 'vehicle_trip_legs', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('ops_store_items', 'ops', 'مواد مخزن العمليات', '', 'ops_store_items', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('ops_store_movements', 'ops', 'حركات مخزن العمليات', '', 'ops_store_movements', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('gbs_containers', 'ops', 'الحاويات', '', 'gbs_containers', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('follow_up_profiles', 'ops', 'حسابات المتابعة الميدانية', '', 'follow_up_profiles', null, null, 'حسابات/هويات مستخدمين — لا تُحذف زمنياً', false, 0, false),
    ('sectors', 'ops', 'القطاعات', '', 'sectors', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('vehicle_maintenance_updates', 'maintenance', 'تحديثات حالات الصيانة', 'التحديثات التفصيلية (تشخيص/عمل). الحالات غير المكتملة محمية.', 'vehicle_maintenance_updates', 'created_at', 'case_id in (select c.id from public.vehicle_maintenance_cases c where c.completed_at is null)', 'تحديثات الحالات غير المكتملة محمية', true, 24, false),
    ('vehicle_maintenance_stages', 'maintenance', 'مراحل حالات الصيانة', 'مراحل الوصول/التشخيص/الإصلاح/الفحص/التسليم. الحالات غير المكتملة محمية.', 'vehicle_maintenance_stages', 'created_at', 'case_id in (select c.id from public.vehicle_maintenance_cases c where c.completed_at is null)', 'مراحل الحالات غير المكتملة محمية', true, 24, false),
    ('vehicle_maintenance_cases', 'maintenance', 'حالات الصيانة', '', 'vehicle_maintenance_cases', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('vehicle_maintenance_parts', 'maintenance', 'قطع الغيار المستخدمة', '', 'vehicle_maintenance_parts', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('vehicle_maintenance_attachments', 'maintenance', 'مرفقات الصيانة', '', 'vehicle_maintenance_attachments', null, null, 'الصور والملفات تُدار عبر الأرشيف البارد؛ السجل النصي يبقى', false, 0, false),
    ('vehicle_maintenance_case_technicians', 'maintenance', 'فنيو الحالات', '', 'vehicle_maintenance_case_technicians', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('maintenance_workshops', 'maintenance', 'الورش', '', 'maintenance_workshops', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('maintenance_workshop_accounts', 'maintenance', 'حسابات الورش', '', 'maintenance_workshop_accounts', null, null, 'حسابات/هويات مستخدمين — لا تُحذف زمنياً', false, 0, false),
    ('maintenance_inventory_items', 'maintenance', 'مواد مخزن الصيانة', '', 'maintenance_inventory_items', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('maintenance_inventory_movements', 'maintenance', 'حركات مخزن الصيانة', '', 'maintenance_inventory_movements', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('maintenance_purchase_orders', 'maintenance', 'أوامر الشراء', '', 'maintenance_purchase_orders', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('maintenance_purchase_items', 'maintenance', 'بنود أوامر الشراء', '', 'maintenance_purchase_items', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('complaint_email_events', 'complaints', 'أحداث البريد الإلكتروني للشكاوى', 'إشعارات المزوّد (تسليم/فتح/ارتداد).', 'complaint_email_events', 'event_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 12, false),
    ('complaint_media_revisions', 'complaints', 'سجل استبدال صور الشكاوى', 'من استبدل أي صورة ولماذا.', 'complaint_media_revisions', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 24, false),
    ('complaint_inbox_messages', 'complaints', 'رسائل صندوق وارد الشكاوى', 'الرسائل الواردة بالبريد. المؤرشفة فقط.', 'complaint_inbox_messages', 'received_at', 'archived_at is null', 'الرسائل غير المؤرشفة محمية', true, 12, false),
    ('complaints', 'complaints', 'الشكاوى', '', 'complaints', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('complaint_items', 'complaints', 'بنود الشكاوى', '', 'complaint_items', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('complaint_status_history', 'complaints', 'تاريخ حالات الشكاوى', '', 'complaint_status_history', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('complaint_media', 'complaints', 'صور الشكاوى', '', 'complaint_media', null, null, 'الصور والملفات تُدار عبر الأرشيف البارد؛ السجل النصي يبقى', false, 0, false),
    ('complaint_reports', 'complaints', 'تقارير الشكاوى', '', 'complaint_reports', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('complaint_report_items', 'complaints', 'بنود تقارير الشكاوى', '', 'complaint_report_items', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('complaint_templates', 'complaints', 'قوالب الشكاوى', '', 'complaint_templates', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('complaint_settings', 'complaints', 'إعدادات الشكاوى', '', 'complaint_settings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('complaint_contacts', 'complaints', 'جهات اتصال الشكاوى', '', 'complaint_contacts', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('complaint_neighborhoods', 'complaints', 'الأحياء', '', 'complaint_neighborhoods', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('complaint_sender_rules', 'complaints', 'قواعد المرسلين', '', 'complaint_sender_rules', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('complaint_archive_folders', 'complaints', 'مجلدات أرشيف الشكاوى', '', 'complaint_archive_folders', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('complaint_deletion_requests', 'complaints', 'طلبات حذف الشكاوى', '', 'complaint_deletion_requests', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false),
    ('complaint_email_deliveries', 'complaints', 'إرسالات البريد للتقارير', '', 'complaint_email_deliveries', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('citizen_complaint_events', 'citizen', 'أحداث شكاوى المواطنين', 'مسار كل شكوى مواطن. الشكاوى غير المحلولة محمية.', 'citizen_complaint_events', 'created_at', 'complaint_id in (select c.id from public.citizen_complaints c where c.resolved_at is null)', 'أحداث الشكاوى غير المحلولة محمية', true, 24, false),
    ('citizen_chat_messages', 'citizen', 'رسائل محادثات المواطنين', 'نصوص المحادثة. الجلسات المفتوحة محمية.', 'citizen_chat_messages', 'created_at', 'session_id in (select s.id from public.citizen_chat_sessions s where s.closed_at is null)', 'رسائل الجلسات المفتوحة محمية', true, 12, false),
    ('citizen_chat_sessions', 'citizen', 'جلسات محادثات المواطنين', 'جلسة المحادثة (طلب/قبول/إغلاق/تقييم). المفتوحة محمية.', 'citizen_chat_sessions', 'requested_at', 'closed_at is null', 'الجلسات المفتوحة محمية', true, 12, false),
    ('citizen_accounts', 'citizen', 'حسابات المواطنين', '', 'citizen_accounts', null, null, 'حسابات/هويات مستخدمين — لا تُحذف زمنياً', false, 0, false),
    ('citizen_complaints', 'citizen', 'شكاوى المواطنين', '', 'citizen_complaints', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('citizen_complaint_photos', 'citizen', 'صور شكاوى المواطنين', '', 'citizen_complaint_photos', null, null, 'الصور والملفات تُدار عبر الأرشيف البارد؛ السجل النصي يبقى', false, 0, false),
    ('citizen_portal_settings', 'citizen', 'إعدادات بوابة المواطن', '', 'citizen_portal_settings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('contractor_audit_log', 'contractors', 'سجل تدقيق المقاولين', 'تعديلات العمال/الأعداد وأسبابها.', 'contractor_audit_log', 'created_at', null, 'لا قفل إضافي — تُحذف الصفوف الأقدم من المدة فقط', true, 36, true),
    ('contractor_checkins', 'contractors', 'تسجيلات حضور المقاولين الميدانية', 'موقع + سيلفي + صورة الفريق عند الحضور. الأشهر غير المعتمدة مالياً محمية.', 'contractor_checkins', 'checked_at', 'not exists (select 1 from public.contractor_month_approvals a where a.month = date_trunc(''month'', log_date)::date and a.approved_at is not null)', 'تسجيلات شهر لم تعتمده المالية محمية', true, 24, true),
    ('contractor_profiles', 'contractors', 'حسابات المقاولين', '', 'contractor_profiles', null, null, 'حسابات/هويات مستخدمين — لا تُحذف زمنياً', false, 0, false),
    ('contractor_workers', 'contractors', 'عمال المقاولين', '', 'contractor_workers', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('contractor_worker_attendance', 'contractors', 'حضور عمال المقاولين', '', 'contractor_worker_attendance', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('contractor_daily_counts', 'contractors', 'الأعداد اليومية', '', 'contractor_daily_counts', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('contractor_rates', 'contractors', 'أجور المقاولين', '', 'contractor_rates', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('contractor_worker_wages', 'contractors', 'أجور العمال', '', 'contractor_worker_wages', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('contractor_month_approvals', 'contractors', 'اعتماد أشهر المقاولين', '', 'contractor_month_approvals', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('sector_manager_profiles', 'sectors', 'حسابات مديري القطاعات', '', 'sector_manager_profiles', null, null, 'حسابات/هويات مستخدمين — لا تُحذف زمنياً', false, 0, false),
    ('sector_workers', 'sectors', 'عمال القطاعات', '', 'sector_workers', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('sector_vehicles', 'sectors', 'آليات القطاعات', '', 'sector_vehicles', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('sector_attendance', 'sectors', 'حضور عمال القطاعات', '', 'sector_attendance', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('sector_photos', 'sectors', 'صور القطاعات', '', 'sector_photos', null, null, 'الصور والملفات تُدار عبر الأرشيف البارد؛ السجل النصي يبقى', false, 0, false),
    ('sector_breakdowns', 'sectors', 'أعطال القطاعات', '', 'sector_breakdowns', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('sector_supply_requests', 'sectors', 'طلبات التجهيز', '', 'sector_supply_requests', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('sector_support_requests', 'sectors', 'طلبات الإسناد', '', 'sector_support_requests', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('sector_support_assignments', 'sectors', 'تعيينات الإسناد', '', 'sector_support_assignments', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('ts_attendance_records', 'station', 'حضور المحطة التحويلية', '', 'ts_attendance_records', null, null, 'سجلات مالية/رواتب/خصومات — تبقى للأبد', false, 0, false),
    ('ts_carrier_records', 'station', 'سجلات الناقلات', '', 'ts_carrier_records', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('ts_saksat_records', 'station', 'سجلات السكسات', '', 'ts_saksat_records', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('ts_trips_records', 'station', 'سجلات رحلات المحطة', '', 'ts_trips_records', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('ts_weight_records', 'station', 'سجلات الوزن', '', 'ts_weight_records', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('ts_visit_weighing_steps', 'station', 'خطوات الوزن', '', 'ts_visit_weighing_steps', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('ts_violations', 'station', 'مخالفات الحد الأدنى', '', 'ts_violations', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('ts_unit_capacities', 'station', 'سعات الوحدات', '', 'ts_unit_capacities', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('station_destinations', 'station', 'وجهات المحطة', '', 'station_destinations', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('station_external_drivers', 'station', 'السائقون الخارجيون', '', 'station_external_drivers', null, null, 'بيانات أساسية/مرجعية — لا تخضع للحذف الزمني', false, 0, false),
    ('media_submissions', 'media', 'إرسالات الإعلام', '', 'media_submissions', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('media_submission_photos', 'media', 'صور الإرسالات', '', 'media_submission_photos', null, null, 'الصور والملفات تُدار عبر الأرشيف البارد؛ السجل النصي يبقى', false, 0, false),
    ('media_designs', 'media', 'تصاميم التقارير', '', 'media_designs', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('media_design_sheets', 'media', 'صفحات التصاميم', '', 'media_design_sheets', null, null, 'سجل تشغيلي أساسي يُرجع إليه — يبقى للأبد', false, 0, false),
    ('media_design_photos', 'media', 'صور التصاميم', '', 'media_design_photos', null, null, 'الصور والملفات تُدار عبر الأرشيف البارد؛ السجل النصي يبقى', false, 0, false),
    ('media_design_templates', 'media', 'قوالب التصاميم', '', 'media_design_templates', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('media_covers', 'media', 'أغلفة التقارير', '', 'media_covers', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('cold_archive_settings', 'archive', 'إعدادات الأرشيف البارد', '', 'cold_archive_settings', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('cold_archive_packages', 'archive', 'حزم الأرشيف البارد', '', 'cold_archive_packages', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false),
    ('cold_archive_items', 'archive', 'عناصر الأرشيف البارد', '', 'cold_archive_items', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false),
    ('cold_archive_copies', 'archive', 'النسخ الموثَّقة', '', 'cold_archive_copies', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false),
    ('cold_archive_events', 'archive', 'سجل أحداث الأرشيف البارد', '', 'cold_archive_events', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false),
    ('data_retention_policies', 'archive', 'سياسات الاحتفاظ', '', 'data_retention_policies', null, null, 'إعدادات — لا تخضع للحذف الزمني', false, 0, false),
    ('data_retention_requests', 'archive', 'طلبات حذف الاحتفاظ', '', 'data_retention_requests', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false),
    ('data_retention_events', 'archive', 'سجل أحداث الاحتفاظ', '', 'data_retention_events', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false),
    ('dev_cleanup_runs', 'archive', 'سجل تنظيف البيانات التجريبية', '', 'dev_cleanup_runs', null, null, 'سجل إثبات (حذف/أرشفة/موافقات) — يبقى للأبد', false, 0, false)
$$;

-- ───────────── كتالوج الصلاحيات: + it.dev-cleanup ─────────────
-- <<catalog>>  (مولَّد — لا يُحرَّر يدوياً: npx vite-node scripts/gen-permission-catalog.ts)
-- upsert (لا حذف+إدراج) كي لا تُفقد قواعد القوالب والاستثناءات المرتبطة بالوحدات الباقية
insert into public.permission_units (key, portal, path, label, parent_key, actions, sort) values
  ('employee', 'employee', '/employee', 'الرئيسية', null, '{view}', 0),
  ('employee.attendance', 'employee', '/employee/attendance', 'إثبات التواجد والعدد', null, '{view,create}', 1),
  ('employee.photos', 'employee', '/employee/photos', 'إرسال الصور', null, '{view,create}', 2),
  ('hr', 'hr', '/hr', 'الرئيسية', null, '{view}', 3),
  ('hr.recruitment', 'hr', '/hr/recruitment', 'التوظيف وإنهاء الخدمات', null, '{view,create,execute}', 4),
  ('hr.hire-requests', 'hr', '/hr/hire-requests', 'تعيينات بانتظار الإكمال', null, '{view,execute}', 5),
  ('hr.employees', 'hr', '/hr/employees', 'الموظفون', null, '{view,create,edit,export,execute}', 6),
  ('hr.attendance', 'hr', '/hr/attendance', 'الحضور والانصراف', null, '{view,edit,export}', 7),
  ('hr.leaves', 'hr', '/hr/leaves', 'الإجازات والزمنيات', null, '{view,create,decide,export}', 8),
  ('hr.biometric', 'hr', '/hr/biometric', 'دفتر البصمة', null, '{view,export}', 9),
  ('hr.org', 'hr', '/hr/org', 'الهيكل التنظيمي', null, '{view,create,edit,delete}', 10),
  ('hr.behavior', 'hr', '/hr/behavior', 'تقارير سلوك الموظفين', null, '{view,export}', 11),
  ('manager', 'manager', '/manager', 'الرئيسية', null, '{view}', 12),
  ('manager.team', 'manager', '/manager/team', 'فريقي', null, '{view}', 13),
  ('manager.request', 'manager', '/manager/request', 'إنشاء طلب', null, '{view,create}', 14),
  ('manager.leaves', 'manager', '/manager/leaves', 'إجازات فريقي', null, '{view,create,decide}', 15),
  ('manager.breakdown', 'manager', '/manager/breakdown', 'عطل آلية', null, '{view,create}', 16),
  ('manager.vehicle-trips', 'manager', '/manager/vehicle-trips', 'حركة آليات الوردية', null, '{view,execute}', 17),
  ('manager.support', 'manager', '/manager/support', 'طلبات الدعم', null, '{view,create}', 18),
  ('manager.gbs-containers', 'manager', '/manager/gbs-containers', 'حاويات GBS', null, '{view}', 19),
  ('manager.complaints', 'manager', '/manager/complaints', 'الشكاوى المسندة', null, '{view,create,execute}', 20),
  ('manager.citizen-complaints', 'manager', '/manager/citizen-complaints', 'شكاوى المواطنين', null, '{view,execute}', 21),
  ('manager.photos', 'manager', '/manager/photos', 'إرسال صور', null, '{view,create}', 22),
  ('manager.archive', 'manager', '/manager/archive', 'الأرشيف', null, '{view}', 23),
  ('finance', 'finance', '/finance', 'الرئيسية', null, '{view}', 24),
  ('finance.reports', 'finance', '/finance/reports', 'التقارير', null, '{view,export}', 25),
  ('finance.payroll', 'finance', '/finance/payroll', 'الرواتب', null, '{view,edit,decide,execute,export}', 26),
  ('finance.contractor-wages', 'finance', '/finance/contractor-wages', 'أجور المتعهدين', null, '{view,edit,decide,export}', 27),
  ('finance.advances', 'finance', '/finance/advances', 'السلف', null, '{view,execute,export}', 28),
  ('finance.settlements', 'finance', '/finance/settlements', 'المنتهية خدماتهم والتصفية', null, '{view,decide,execute,export}', 29),
  ('finance.letters', 'finance', '/finance/letters', 'سجل الكتب الرسمية', null, '{view,export}', 30),
  ('finance.purchases', 'finance', '/finance/purchases', 'مشتريات قطع الصيانة', null, '{view,decide}', 31),
  ('finance.budget', 'finance', '/finance/budget', 'القاصة', null, '{view,create,edit,decide}', 32),
  ('finance.expenses', 'finance', '/finance/expenses', 'المصاريف', null, '{view,create,edit,export}', 33),
  ('finance.announcements', 'finance', '/finance/announcements', 'التبليغات', null, '{view,create}', 34),
  ('it', 'it', '/it', 'الرئيسية', null, '{view}', 35),
  ('it.user-management', 'it', '/it/user-management', 'إدارة المستخدمين', null, '{view}', 36),
  ('it.user-management.list', 'it', '/it/user-management/list', 'المستخدمون', 'it.user-management', '{view,edit}', 37),
  ('it.user-management.create', 'it', '/it/user-management/create', 'إنشاء مستخدم', 'it.user-management', '{view,create}', 38),
  ('it.user-management.approval-chains', 'it', '/it/user-management/approval-chains', 'سلاسل الموافقات', 'it.user-management', '{view,edit,delete}', 39),
  ('it.user-management.approval-performance', 'it', '/it/user-management/approval-performance', 'أداء الموافقات', 'it.user-management', '{view}', 40),
  ('it.approvals', 'it', '/it/approvals', 'طلبات الموافقة', 'it.user-management', '{view,decide}', 41),
  ('it.user-management.disclosure-types', 'it', '/it/user-management/disclosure-types', 'أنواع الكشوفات', 'it.user-management', '{view,edit}', 42),
  ('it.user-management.maintenance-workshops', 'it', '/it/user-management/maintenance-workshops', 'ورش الصيانة', 'it.user-management', '{view,edit}', 43),
  ('it.database', 'it', '/it/database', 'قاعدة البيانات', null, '{view}', 44),
  ('it.database.tables', 'it', '/it/database/tables', 'الجداول والأعمدة', 'it.database', '{view}', 45),
  ('it.branches', 'it', '/it/branches', 'فروع الشركة', null, '{view,create,edit}', 46),
  ('it.permissions', 'it', '/it/permissions', 'قوالب الصلاحيات', null, '{view,edit}', 47),
  ('it.integrations', 'it', '/it/integrations', 'التكاملات', null, '{view}', 48),
  ('it.integrations.biometric', 'it', '/it/integrations/biometric', 'أجهزة البصمة', 'it.integrations', '{view,edit,execute}', 49),
  ('it.integrations.biometric.unmatched', 'it', '/it/integrations/biometric/unmatched', 'الأشخاص غير المطابقين', 'it.integrations', '{view}', 50),
  ('it.integrations.biometric.attendance-audit', 'it', '/it/integrations/biometric/attendance-audit', 'سجل تعديلات الحضور', 'it.integrations', '{view}', 51),
  ('it.integrations.gps', 'it', '/it/integrations/gps', 'تتبع الشاحنات', 'it.integrations', '{view,edit,execute}', 52),
  ('it.integrations.gps-health', 'it', '/it/integrations/gps-health', 'سلامة تكامل GPS', 'it.integrations', '{view}', 53),
  ('it.integrations.hr-policy', 'it', '/it/integrations/hr-policy', 'سياسة الحضور والإجازات', 'it.integrations', '{view,edit}', 54),
  ('it.integrations.auto-deductions', 'it', '/it/integrations/auto-deductions', 'الاستقطاعات التلقائية', 'it.integrations', '{view,edit}', 55),
  ('it.integrations.advances', 'it', '/it/integrations/advances', 'السلف — الأنواع والسياسة', 'it.integrations', '{view,edit}', 56),
  ('it.integrations.live-tracking', 'it', '/it/integrations/live-tracking', 'البث المباشر — الإعدادات', 'it.integrations', '{view,edit}', 57),
  ('it.notification-policies', 'it', '/it/notification-policies', 'سياسات الإشعارات والانطلاقات', null, '{view,edit,delete}', 58),
  ('it.updates', 'it', '/it/updates', 'التحديثات والمراقبة', null, '{view,execute}', 59),
  ('it.archive', 'it', '/it/archive', 'الأرشيف', null, '{view,delete}', 60),
  ('it.central-garage-approvals', 'it', '/it/central-garage-approvals', 'موافقات تصفير خزانات الكراج', 'it.archive', '{view,decide}', 61),
  ('it.cold-archive', 'it', '/it/cold-archive', 'الأرشيف البارد', 'it.archive', '{view,create,decide,delete}', 62),
  ('it.data-retention', 'it', '/it/data-retention', 'الاحتفاظ بالبيانات', 'it.archive', '{view,edit,delete}', 63),
  ('it.dev-cleanup', 'it', '/it/dev-cleanup', 'تنظيف البيانات التجريبية', 'it.archive', '{view,delete}', 64),
  ('it.console', 'it', '/it/console', 'Console — رصد الأخطاء', null, '{view}', 65),
  ('it.devops', 'it', '/it/devops', 'دليل التشغيل التقني', null, '{view}', 66),
  ('it.devops.git', 'it', '/it/devops/git', 'Git ورفع التحديثات', 'it.devops', '{view}', 67),
  ('it.devops.database', 'it', '/it/devops/database', 'قاعدة البيانات والترحيلات', 'it.devops', '{view}', 68),
  ('it.devops.tests', 'it', '/it/devops/tests', 'الاختبارات', 'it.devops', '{view}', 69),
  ('it.devops.hosting', 'it', '/it/devops/hosting', 'الاستضافة والبصمة في الإنتاج', 'it.devops', '{view}', 70),
  ('it.devops.status', 'it', '/it/devops/status', 'لوحة الحالة الحية', 'it.devops', '{view}', 71),
  ('admin', 'admin', '/admin', 'الرئيسية', null, '{view}', 72),
  ('admin.reports', 'admin', '/admin/reports', 'التقارير', null, '{view}', 73),
  ('admin.announcements', 'admin', '/admin/announcements', 'التبليغات', null, '{view,create}', 74),
  ('admin.approvals', 'admin', '/admin/approvals', 'طلبات الموافقة', null, '{view,decide}', 75),
  ('admin.approval-performance', 'admin', '/admin/approval-performance', 'أداء الموافقات', null, '{view}', 76),
  ('admin.procedures', 'admin', '/admin/procedures', 'الإجراءات', null, '{view,execute}', 77),
  ('admin.disclosures', 'admin', '/admin/disclosures', 'الكشوفات', null, '{view,decide}', 78),
  ('field-ops', 'field-ops', '/field-ops', 'الرئيسية', null, '{view}', 79),
  ('field-ops.requests', 'field-ops', '/field-ops/requests', 'طلبات فريقي', null, '{view,decide}', 80),
  ('field-ops.sectors', 'field-ops', '/field-ops/sectors', 'القواطع والمسؤولون', null, '{view}', 81),
  ('field-ops.reports', 'field-ops', '/field-ops/reports', 'التقارير', null, '{view}', 82),
  ('field-ops.notify', 'field-ops', '/field-ops/notify', 'التبليغ', null, '{view,create}', 83),
  ('field-ops.procedures', 'field-ops', '/field-ops/procedures', 'الإجراءات', null, '{view,execute}', 84),
  ('field-ops.my-requests', 'field-ops', '/field-ops/my-requests', 'طلباتي', null, '{view,create}', 85),
  ('admin-ops', 'admin-ops', '/admin-ops', 'الرئيسية', null, '{view}', 86),
  ('admin-ops.requests', 'admin-ops', '/admin-ops/requests', 'طلبات فريقي', null, '{view,create,decide}', 87),
  ('admin-ops.reports', 'admin-ops', '/admin-ops/reports', 'التقارير', null, '{view}', 88),
  ('admin-ops.notify', 'admin-ops', '/admin-ops/notify', 'التبليغ', null, '{view,create}', 89),
  ('admin-ops.procedures', 'admin-ops', '/admin-ops/procedures', 'الإجراءات', null, '{view,create,execute}', 90),
  ('admin-ops.disclosures', 'admin-ops', '/admin-ops/disclosures', 'الكشوفات', null, '{view,create,decide}', 91),
  ('admin-ops.contractors', 'admin-ops', '/admin-ops/contractors', 'متابعة المتعهدين والعمال', null, '{view,decide}', 92),
  ('admin-ops.my-requests', 'admin-ops', '/admin-ops/my-requests', 'طلباتي', null, '{view,create}', 93),
  ('maintenance', 'maintenance', '/maintenance', 'الرئيسية', null, '{view}', 94),
  ('maintenance.purchases', 'maintenance', '/maintenance/purchases', 'مشتريات قطع الصيانة', null, '{view,create}', 95),
  ('maintenance.inventory', 'maintenance', '/maintenance/inventory', 'مخزون قطع الصيانة', null, '{view,create,edit}', 96),
  ('maintenance.vehicle-cases', 'maintenance', '/maintenance/vehicle-cases', 'صيانة الآليات', null, '{view,create,decide,execute}', 97),
  ('maintenance.employees', 'maintenance', '/maintenance/employees', 'الموظفون', null, '{view,edit}', 98),
  ('maintenance.requests', 'maintenance', '/maintenance/requests', 'الطلبات', null, '{view,create}', 99),
  ('maintenance.procedures', 'maintenance', '/maintenance/procedures', 'الإجراءات', null, '{view,create,execute}', 100),
  ('maintenance.archive', 'maintenance', '/maintenance/archive', 'أرشيف الصيانة', null, '{view,delete}', 101),
  ('transfer-station', 'transfer-station', '/transfer-station', 'الرئيسية', null, '{view}', 102),
  ('transfer-station.weights', 'transfer-station', '/transfer-station/weights', 'الأوزان', null, '{view,create,execute}', 103),
  ('transfer-station.weights.log', 'transfer-station', '/transfer-station/weights/log', 'تسجيل الأوزان', 'transfer-station.weights', '{view,export}', 104),
  ('transfer-station.saksat', 'transfer-station', '/transfer-station/saksat', 'السكسات والنسافات الخارجة', null, '{view,create,export}', 105),
  ('transfer-station.carrier', 'transfer-station', '/transfer-station/carrier', 'ناقلات الحاويات المكبسية', null, '{view,create,export}', 106),
  ('transfer-station.vehicle-movements', 'transfer-station', '/transfer-station/vehicle-movements', 'حركة آليات المواقع', null, '{view,execute}', 107),
  ('transfer-station.employees', 'transfer-station', '/transfer-station/employees', 'الموظفون', null, '{view,edit}', 108),
  ('transfer-station.requests', 'transfer-station', '/transfer-station/requests', 'الطلبات', null, '{view,create}', 109),
  ('transfer-station.procedures', 'transfer-station', '/transfer-station/procedures', 'الإجراءات', null, '{view,create,execute}', 110),
  ('transfer-station.disclosures', 'transfer-station', '/transfer-station/disclosures', 'الكشوفات', null, '{view,create}', 111),
  ('transfer-station.fines', 'transfer-station', '/transfer-station/fines', 'الغرامات', null, '{view,create}', 112),
  ('transfer-station.archive', 'transfer-station', '/transfer-station/archive', 'أرشيف المحطة', null, '{view,delete}', 113),
  ('executive', 'executive', '/executive', 'الرئيسية', null, '{view}', 114),
  ('executive.reports', 'executive', '/executive/reports', 'التقارير', null, '{view,export}', 115),
  ('executive.announcements', 'executive', '/executive/announcements', 'التبليغات', null, '{view,create}', 116),
  ('executive.approvals', 'executive', '/executive/approvals', 'طلبات الموافقة', null, '{view,decide}', 117),
  ('executive.procedures', 'executive', '/executive/procedures', 'الإجراءات', null, '{view,execute}', 118),
  ('executive.receivables', 'executive', '/executive/receivables', 'مستحقات الشركة', null, '{view,create,edit,execute}', 119),
  ('executive.gps-payments', 'executive', '/executive/gps-payments', 'تسديد مستحقات GPS', null, '{view,create,edit}', 120),
  ('executive.rewards', 'executive', '/executive/rewards', 'المكافآت', null, '{view,create}', 121),
  ('executive.letters', 'executive', '/executive/letters', 'كتب الشكر والتنبيه', null, '{view,create}', 122),
  ('executive.events', 'executive', '/executive/events', 'فعاليات الشركة', null, '{view,create}', 123),
  ('executive.behavior', 'executive', '/executive/behavior', 'تقارير سلوك الموظفين', null, '{view,export}', 124),
  ('executive.stop-hotspots', 'executive', '/executive/stop-hotspots', 'بقع التوقف', null, '{view}', 125),
  ('deputy', 'deputy', '/deputy', 'الرئيسية', null, '{view}', 126),
  ('deputy.reports', 'deputy', '/deputy/reports', 'التقارير', null, '{view,export}', 127),
  ('deputy.announcements', 'deputy', '/deputy/announcements', 'التبليغات', null, '{view,create}', 128),
  ('deputy.statements', 'deputy', '/deputy/statements', 'الكشوفات', null, '{view,decide}', 129),
  ('deputy.deductions', 'deputy', '/deputy/deductions', 'مراجعة الاستقطاعات', null, '{view,decide,edit}', 130),
  ('deputy.rented-tax', 'deputy', '/deputy/rented-tax', 'ضريبة الآليات المؤجرة', null, '{view,edit}', 131),
  ('deputy.overtime', 'deputy', '/deputy/overtime', 'الساعات الإضافية المدفوعة', null, '{view,decide,edit}', 132),
  ('deputy.sector-supplies', 'deputy', '/deputy/sector-supplies', 'كتب مستلزمات القواطع', null, '{view,decide}', 133),
  ('deputy.station-folders', 'deputy', '/deputy/station-folders', 'فولدرات المحطة', null, '{view}', 134),
  ('deputy.data-analysis', 'deputy', '/deputy/data-analysis', 'تحليل البيانات', null, '{view}', 135),
  ('deputy.rewards', 'deputy', '/deputy/rewards', 'المكافآت', null, '{view,create}', 136),
  ('deputy.letters', 'deputy', '/deputy/letters', 'كتب الشكر والتنبيه', null, '{view,create}', 137),
  ('deputy.approvals', 'deputy', '/deputy/approvals', 'طلبات الموافقة', null, '{view,decide}', 138),
  ('deputy.procedures', 'deputy', '/deputy/procedures', 'الإجراءات', null, '{view,execute}', 139),
  ('deputy.behavior', 'deputy', '/deputy/behavior', 'تقارير سلوك الموظفين', null, '{view,export}', 140),
  ('deputy.stop-hotspots', 'deputy', '/deputy/stop-hotspots', 'بقع التوقف', null, '{view}', 141),
  ('ops-room', 'ops-room', '/ops-room', 'الرئيسية', null, '{view}', 142),
  ('ops-room.operations-data', 'ops-room', '/ops-room/operations-data', 'بيانات وتقارير العمليات', null, '{view,edit,export}', 143),
  ('ops-room.station-daily', 'ops-room', '/ops-room/station-daily', 'التقرير اليومي للمحطة', null, '{view,create,export}', 144),
  ('ops-room.station-fleet', 'ops-room', '/ops-room/station-fleet', 'أسطول المحطة التحويلية', null, '{view,create,edit}', 145),
  ('ops-room.station-outbound', 'ops-room', '/ops-room/station-outbound', 'متابعة خروج آليات المحطة', null, '{view,execute}', 146),
  ('ops-room.vehicles-database', 'ops-room', '/ops-room/vehicles-database', 'قاعدة بيانات الآليات', null, '{view,create,edit,export}', 147),
  ('ops-room.vehicles-archive', 'ops-room', '/ops-room/vehicles-archive', 'أرشيف الآليات', null, '{view,delete}', 148),
  ('ops-room.gps', 'ops-room', '/ops-room/gps', 'بيانات أجهزة GPS', null, '{view,edit,execute,export}', 149),
  ('ops-room.gbs-containers', 'ops-room', '/ops-room/gbs-containers', 'GBS الحاويات', null, '{view,edit}', 150),
  ('ops-room.attendance', 'ops-room', '/ops-room/attendance', 'الحضوريات', null, '{view,edit,decide,export}', 151),
  ('ops-room.store', 'ops-room', '/ops-room/store', 'المخزن', null, '{view,create,edit,execute}', 152),
  ('ops-room.campaigns', 'ops-room', '/ops-room/campaigns', 'متابعة الحملات', null, '{view,create,export}', 153),
  ('ops-room.citizen-complaints', 'ops-room', '/ops-room/citizen-complaints', 'استقبال الشكاوى', null, '{view,execute,delete}', 154),
  ('ops-room.disclosures', 'ops-room', '/ops-room/disclosures', 'الكشوفات', null, '{view,create,decide}', 155),
  ('ops-room.advances', 'ops-room', '/ops-room/advances', 'السلف', null, '{view,create}', 156),
  ('ops-room.contractor-headcounts', 'ops-room', '/ops-room/contractor-headcounts', 'حضوريات العمال', null, '{view,decide}', 157),
  ('ops-room.leaves', 'ops-room', '/ops-room/leaves', 'طلبات الإجازة', null, '{view,decide}', 158),
  ('ops-room.live-tracking', 'ops-room', '/ops-room/live-tracking', 'البث المباشر', null, '{view}', 159),
  ('ops-room.live-tracking.data', 'ops-room', '/ops-room/live-tracking/data', 'بيانات البث المباشر', null, '{view}', 160),
  ('complaints', 'complaints', '/complaints', 'الرئيسية', null, '{view}', 161),
  ('complaints.karrada-sector', 'complaints', '/complaints/karrada-sector', 'قاطع الكرادة', null, '{view,create,edit}', 162),
  ('complaints.zaafaraniya-sector', 'complaints', '/complaints/zaafaraniya-sector', 'قاطع الزعفرانية', null, '{view,create,edit}', 163),
  ('complaints.assignment', 'complaints', '/complaints/assignment', 'فرز وإسناد الشكاوى', null, '{view,create,edit}', 164),
  ('complaints.processing', 'complaints', '/complaints/processing', 'معالجة الشكاوى', null, '{view,decide,execute}', 165),
  ('complaints.templates', 'complaints', '/complaints/templates', 'القوالب', null, '{view,edit}', 166),
  ('complaints.data', 'complaints', '/complaints/data', 'بيانات الشكاوى', null, '{view,export}', 167),
  ('complaints.database', 'complaints', '/complaints/database', 'قاعدة بيانات الشكاوى', null, '{view,export}', 168),
  ('complaints.pages-contact-settings', 'complaints', '/complaints/pages-contact-settings', 'إعدادات الصفحات والتواصل', null, '{view,edit}', 169),
  ('complaints.archive', 'complaints', '/complaints/archive', 'أرشيف الشكاوى', null, '{view,execute,delete}', 170),
  ('complaints.technical-support', 'complaints', '/complaints/technical-support', 'الدعم الفني', null, '{view,create}', 171),
  ('media', 'media', '/media', 'الرئيسية', null, '{view}', 172),
  ('media.karrada-sector', 'media', '/media/karrada-sector', 'قاطع الكرادة', null, '{view,create}', 173),
  ('media.zaafaraniya-sector', 'media', '/media/zaafaraniya-sector', 'الزعفرانية', null, '{view,create}', 174),
  ('media.zaafaraniya-folder', 'media', '/media/zaafaraniya-folder', 'فولدر الزعفرانية', null, '{view,create,export}', 175),
  ('media.karrada-folder', 'media', '/media/karrada-folder', 'فولدر الكرادة', null, '{view,create,export}', 176),
  ('media.design-templates', 'media', '/media/design-templates', 'قوالب التصميم', null, '{view,create,edit,delete}', 177),
  ('media.archive', 'media', '/media/archive', 'الأرشيف', null, '{view,delete}', 178),
  ('central-garage', 'central-garage', '/central-garage', 'الرئيسية', null, '{view}', 179),
  ('central-garage.drivers-dispatch', 'central-garage', '/central-garage/drivers-dispatch', 'انطلاقية السائقين', null, '{view,create,execute}', 180),
  ('central-garage.maintenance-coordination', 'central-garage', '/central-garage/maintenance-coordination', 'تنسيق حركات الصيانة', null, '{view,create,decide,execute}', 181),
  ('central-garage.vehicles-database', 'central-garage', '/central-garage/vehicles-database', 'قاعدة بيانات الآليات', null, '{view,create,edit}', 182),
  ('central-garage.fuel', 'central-garage', '/central-garage/fuel', 'الوقود', null, '{view,create}', 183),
  ('central-garage.fuel.gas-oil', 'central-garage', '/central-garage/fuel/gas-oil', 'الكاز', 'central-garage.fuel', '{view,create}', 184),
  ('central-garage.fuel.hydraulic', 'central-garage', '/central-garage/fuel/hydraulic', 'الهيدروليك', 'central-garage.fuel', '{view,create}', 185),
  ('central-garage.fuel.grease', 'central-garage', '/central-garage/fuel/grease', 'الدهن', 'central-garage.fuel', '{view,create}', 186),
  ('central-garage.fuel.c-oil', 'central-garage', '/central-garage/fuel/c-oil', 'C-Oil', 'central-garage.fuel', '{view,create}', 187),
  ('central-garage.employees', 'central-garage', '/central-garage/employees', 'الموظفون', null, '{view,edit}', 188),
  ('central-garage.requests', 'central-garage', '/central-garage/requests', 'الطلبات', null, '{view,create}', 189),
  ('central-garage.procedures', 'central-garage', '/central-garage/procedures', 'الإجراءات', null, '{view,create,execute}', 190),
  ('central-garage.disclosures', 'central-garage', '/central-garage/disclosures', 'الكشوفات', null, '{view,create}', 191),
  ('central-garage.reports', 'central-garage', '/central-garage/reports', 'تقارير الكراج', null, '{view,export}', 192),
  ('central-garage.archive', 'central-garage', '/central-garage/archive', 'الأرشيف', null, '{view,delete}', 193),
  ('follow-up', 'follow-up', '/follow-up', 'الرئيسية', null, '{view}', 194),
  ('follow-up.containers', 'follow-up', '/follow-up/containers', 'متابعة الحاويات', null, '{view,edit}', 195),
  ('follow-up.workers', 'follow-up', '/follow-up/workers', 'متابعة العمال', null, '{view,edit}', 196)
on conflict (key) do update set portal = excluded.portal, path = excluded.path, label = excluded.label, parent_key = excluded.parent_key, actions = excluded.actions, sort = excluded.sort;
delete from public.permission_units where key not in ('employee', 'employee.attendance', 'employee.photos', 'hr', 'hr.recruitment', 'hr.hire-requests', 'hr.employees', 'hr.attendance', 'hr.leaves', 'hr.biometric', 'hr.org', 'hr.behavior', 'manager', 'manager.team', 'manager.request', 'manager.leaves', 'manager.breakdown', 'manager.vehicle-trips', 'manager.support', 'manager.gbs-containers', 'manager.complaints', 'manager.citizen-complaints', 'manager.photos', 'manager.archive', 'finance', 'finance.reports', 'finance.payroll', 'finance.contractor-wages', 'finance.advances', 'finance.settlements', 'finance.letters', 'finance.purchases', 'finance.budget', 'finance.expenses', 'finance.announcements', 'it', 'it.user-management', 'it.user-management.list', 'it.user-management.create', 'it.user-management.approval-chains', 'it.user-management.approval-performance', 'it.approvals', 'it.user-management.disclosure-types', 'it.user-management.maintenance-workshops', 'it.database', 'it.database.tables', 'it.branches', 'it.permissions', 'it.integrations', 'it.integrations.biometric', 'it.integrations.biometric.unmatched', 'it.integrations.biometric.attendance-audit', 'it.integrations.gps', 'it.integrations.gps-health', 'it.integrations.hr-policy', 'it.integrations.auto-deductions', 'it.integrations.advances', 'it.integrations.live-tracking', 'it.notification-policies', 'it.updates', 'it.archive', 'it.central-garage-approvals', 'it.cold-archive', 'it.data-retention', 'it.dev-cleanup', 'it.console', 'it.devops', 'it.devops.git', 'it.devops.database', 'it.devops.tests', 'it.devops.hosting', 'it.devops.status', 'admin', 'admin.reports', 'admin.announcements', 'admin.approvals', 'admin.approval-performance', 'admin.procedures', 'admin.disclosures', 'field-ops', 'field-ops.requests', 'field-ops.sectors', 'field-ops.reports', 'field-ops.notify', 'field-ops.procedures', 'field-ops.my-requests', 'admin-ops', 'admin-ops.requests', 'admin-ops.reports', 'admin-ops.notify', 'admin-ops.procedures', 'admin-ops.disclosures', 'admin-ops.contractors', 'admin-ops.my-requests', 'maintenance', 'maintenance.purchases', 'maintenance.inventory', 'maintenance.vehicle-cases', 'maintenance.employees', 'maintenance.requests', 'maintenance.procedures', 'maintenance.archive', 'transfer-station', 'transfer-station.weights', 'transfer-station.weights.log', 'transfer-station.saksat', 'transfer-station.carrier', 'transfer-station.vehicle-movements', 'transfer-station.employees', 'transfer-station.requests', 'transfer-station.procedures', 'transfer-station.disclosures', 'transfer-station.fines', 'transfer-station.archive', 'executive', 'executive.reports', 'executive.announcements', 'executive.approvals', 'executive.procedures', 'executive.receivables', 'executive.gps-payments', 'executive.rewards', 'executive.letters', 'executive.events', 'executive.behavior', 'executive.stop-hotspots', 'deputy', 'deputy.reports', 'deputy.announcements', 'deputy.statements', 'deputy.deductions', 'deputy.rented-tax', 'deputy.overtime', 'deputy.sector-supplies', 'deputy.station-folders', 'deputy.data-analysis', 'deputy.rewards', 'deputy.letters', 'deputy.approvals', 'deputy.procedures', 'deputy.behavior', 'deputy.stop-hotspots', 'ops-room', 'ops-room.operations-data', 'ops-room.station-daily', 'ops-room.station-fleet', 'ops-room.station-outbound', 'ops-room.vehicles-database', 'ops-room.vehicles-archive', 'ops-room.gps', 'ops-room.gbs-containers', 'ops-room.attendance', 'ops-room.store', 'ops-room.campaigns', 'ops-room.citizen-complaints', 'ops-room.disclosures', 'ops-room.advances', 'ops-room.contractor-headcounts', 'ops-room.leaves', 'ops-room.live-tracking', 'ops-room.live-tracking.data', 'complaints', 'complaints.karrada-sector', 'complaints.zaafaraniya-sector', 'complaints.assignment', 'complaints.processing', 'complaints.templates', 'complaints.data', 'complaints.database', 'complaints.pages-contact-settings', 'complaints.archive', 'complaints.technical-support', 'media', 'media.karrada-sector', 'media.zaafaraniya-sector', 'media.zaafaraniya-folder', 'media.karrada-folder', 'media.design-templates', 'media.archive', 'central-garage', 'central-garage.drivers-dispatch', 'central-garage.maintenance-coordination', 'central-garage.vehicles-database', 'central-garage.fuel', 'central-garage.fuel.gas-oil', 'central-garage.fuel.hydraulic', 'central-garage.fuel.grease', 'central-garage.fuel.c-oil', 'central-garage.employees', 'central-garage.requests', 'central-garage.procedures', 'central-garage.disclosures', 'central-garage.reports', 'central-garage.archive', 'follow-up', 'follow-up.containers', 'follow-up.workers');
insert into public.permission_portal_roles (portal, role) values
  ('employee', 'employee'),
  ('hr', 'hr_officer'),
  ('manager', 'department_manager'),
  ('finance', 'finance_officer'),
  ('it', 'it_admin'),
  ('admin', 'super_admin'),
  ('field-ops', 'field_ops'),
  ('admin-ops', 'admin_ops'),
  ('maintenance', 'maintenance'),
  ('transfer-station', 'transfer_station'),
  ('executive', 'executive_director'),
  ('deputy', 'deputy_director'),
  ('ops-room', 'ops_room'),
  ('complaints', 'complaints_officer'),
  ('media', 'media_officer'),
  ('central-garage', 'central_garage_officer'),
  ('follow-up', 'follow_up')
on conflict (portal) do update set role = excluded.role;
delete from public.permission_portal_roles where portal not in ('employee', 'hr', 'manager', 'finance', 'it', 'admin', 'field-ops', 'admin-ops', 'maintenance', 'transfer-station', 'executive', 'deputy', 'ops-room', 'complaints', 'media', 'central-garage', 'follow-up');
-- <<catalog/>>

-- <<bindings>>  (مولَّد — لا يُحرَّر يدوياً: npx vite-node scripts/gen-permission-catalog.ts)
delete from public.permission_write_bindings;
insert into public.permission_write_bindings (fn, unit_key, action) values
  ('hr_employee_create', 'hr.employees', 'create'),
  ('hr_employee_terminate', 'hr.recruitment', 'execute'),
  ('hire_request_complete', 'hr.hire-requests', 'execute'),
  ('supply_request_deliver', 'ops-room.store', 'execute'),
  ('advance_request_create', 'ops-room.advances', 'create'),
  ('ops_attendance_confirm', 'ops-room.attendance', 'decide'),
  ('ops_contractor_month_approve', 'ops-room.contractor-headcounts', 'decide'),
  ('advance_deliver', 'finance.advances', 'execute'),
  ('advance_settle_cash', 'finance.advances', 'execute'),
  ('finance_payroll_approve', 'finance.payroll', 'decide'),
  ('finance_payroll_adjust', 'finance.payroll', 'edit'),
  ('finance_payroll_reconcile', 'finance.payroll', 'execute'),
  ('finance_treasury_confirm', 'finance.budget', 'decide'),
  ('cold_archive_package_create', 'it.cold-archive', 'create'),
  ('cold_archive_purge_request', 'it.cold-archive', 'delete'),
  ('cold_archive_purge_approve', 'it.cold-archive', 'decide'),
  ('cold_archive_purge_confirm', 'it.cold-archive', 'delete'),
  ('it_deduction_exemption_add', 'it.integrations.auto-deductions', 'edit'),
  ('garage_decide_tank_zero', 'it.central-garage-approvals', 'decide'),
  ('complaint_approve_report', 'complaints.processing', 'decide'),
  ('complaint_create_item_from_inbox', 'complaints.assignment', 'create'),
  ('complaint_batch_create_items_from_inbox', 'complaints.assignment', 'create'),
  ('complaint_start_assignment_ticket', 'manager.complaints', 'execute'),
  ('complaint_complete_assignment_ticket', 'manager.complaints', 'execute'),
  ('sector_confirm_vehicle_arrival', 'manager.vehicle-trips', 'execute'),
  ('sector_confirm_vehicle_site_return', 'manager.vehicle-trips', 'execute'),
  ('sector_submit_breakdown', 'manager.breakdown', 'create'),
  ('sector_support_request_create', 'manager.support', 'create'),
  ('garage_record_departure', 'central-garage.drivers-dispatch', 'execute'),
  ('garage_record_return', 'central-garage.drivers-dispatch', 'execute'),
  ('garage_record_shift_departure', 'central-garage.drivers-dispatch', 'execute'),
  ('garage_decide_maintenance_dispatch', 'central-garage.maintenance-coordination', 'decide'),
  ('station_confirm_vehicle_arrival', 'transfer-station.vehicle-movements', 'execute'),
  ('station_record_exit', 'transfer-station.vehicle-movements', 'execute'),
  ('maintenance_approve_readiness', 'maintenance.vehicle-cases', 'decide'),
  ('maintenance_complete_case', 'maintenance.vehicle-cases', 'execute'),
  ('maintenance_confirm_arrival', 'maintenance.vehicle-cases', 'execute'),
  ('maintenance_inventory_create', 'maintenance.inventory', 'create'),
  ('maintenance_purchase_create', 'maintenance.purchases', 'create'),
  ('media_template_create', 'media.design-templates', 'create');
-- <<bindings/>>
