-- 00369 — إصلاح تنظيف البيانات التجريبية على Supabase: الامتداد safeupdate يرفض DELETE/UPDATE بلا WHERE داخل جلسات المستخدمين
-- («DELETE requires a WHERE clause»). كل حذف شامل صار بشرط صريح على المفتاح الأساسي (where id is not null) — السلوك نفسه.

create or replace function public.dev_cleanup_photos_finish(p_run uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, app as $$
declare v_run public.dev_cleanup_runs; remaining int; d jsonb := '{}'::jsonb; n int;
begin
  perform app.require_it();
  select * into v_run from public.dev_cleanup_runs where id = p_run and kind = 'photos' and status = 'running' for update;
  if not found then raise exception 'DEV_CLEANUP_RUN_INVALID'; end if;
  select count(*) into remaining from storage.objects o where o.bucket_id = any(app.dev_cleanup_photo_buckets()) and not app.dev_cleanup_object_protected(o.bucket_id, o.name);
  if remaining > 0 then raise exception 'DEV_CLEANUP_OBJECTS_REMAIN:%', remaining; end if;

  delete from public.complaint_media_revisions where id is not null; get diagnostics n = row_count; d := d || jsonb_build_object('complaint_media_revisions', n);
  update public.complaint_media set superseded_by = null where superseded_by is not null;
  delete from public.complaint_media where id is not null; get diagnostics n = row_count; d := d || jsonb_build_object('complaint_media', n);
  update public.complaint_reports set pptx_path = null where pptx_path is not null; get diagnostics n = row_count; d := d || jsonb_build_object('complaint_report_files', n);
  delete from public.citizen_complaint_photos where id is not null; get diagnostics n = row_count; d := d || jsonb_build_object('citizen_complaint_photos', n);
  update public.citizen_chat_messages set attachment_path = null where attachment_path is not null; get diagnostics n = row_count; d := d || jsonb_build_object('citizen_chat_attachments', n);
  delete from public.sector_photos where id is not null; get diagnostics n = row_count; d := d || jsonb_build_object('sector_photos', n);
  update public.gbs_container_updates set photo_path = null where photo_path is not null; get diagnostics n = row_count; d := d || jsonb_build_object('gbs_container_photos', n);
  -- صور المتعهدين إلزامية في السجل (تسجيل حضور) — تبقى السجلات ويُستبدل المسار بعلامة محذوف
  update public.contractor_checkins set selfie_path = 'purged/' || id::text, team_photo_path = 'purged/' || id::text where selfie_path not like 'purged/%';
  get diagnostics n = row_count; d := d || jsonb_build_object('contractor_checkin_photos', n);
  delete from public.vehicle_maintenance_attachments where id is not null; get diagnostics n = row_count; d := d || jsonb_build_object('vehicle_maintenance_attachments', n);
  delete from public.media_design_photos where id is not null; get diagnostics n = row_count; d := d || jsonb_build_object('media_design_photos', n);
  delete from public.media_submission_photos where id is not null; get diagnostics n = row_count; d := d || jsonb_build_object('media_submission_photos', n);
  update public.media_submissions set photo_count = 0 where photo_count <> 0;

  update public.dev_cleanup_runs set status = 'done', finished_at = now(), deleted_rows = d where id = p_run returning * into v_run;
  return jsonb_build_object('id', v_run.id, 'removed_objects', v_run.removed_objects, 'deleted_rows', d);
end$$;

create or replace function public.dev_cleanup_gps_stops() returns jsonb
language plpgsql volatile security definer set search_path = public, app as $$
declare d jsonb := '{}'::jsonb; n int; v_run public.dev_cleanup_runs;
begin
  perform app.require_it();
  delete from public.gps_stop_events where id is not null; get diagnostics n = row_count; d := d || jsonb_build_object('gps_stop_events', n);
  delete from public.gps_stop_scan_state where device_id is not null; get diagnostics n = row_count; d := d || jsonb_build_object('gps_stop_scan_state', n);
  select count(*) into n from public.gps_sync_runs where status = 'running'; d := d || jsonb_build_object('gps_sync_running_released', n);
  delete from public.gps_sync_runs where id is not null; get diagnostics n = row_count; d := d || jsonb_build_object('gps_sync_runs', n);
  update public.gps_stop_hotspot_settings set last_refresh_at = null, last_refresh_ms = null, needs_reeval = false where id = 1;
  insert into public.dev_cleanup_runs (kind, status, started_by, started_by_name, finished_at, deleted_rows)
  values ('gps_stops', 'done', auth.uid(), app.user_display_name(auth.uid()), now(), d) returning * into v_run;
  return jsonb_build_object('id', v_run.id, 'deleted_rows', d);
end$$;
