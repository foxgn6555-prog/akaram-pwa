-- اختبار 00368: تنظيف البيانات التجريبية (IT فقط) — صور البوابات الميدانية ونقاط توقف GPS. بادئة dc.
set client_min_messages = notice;
insert into auth.users (id, email) values ('dc000000-0000-0000-0000-000000000001', 'it-dc@t.iq'), ('dc000000-0000-0000-0000-000000000002', 'ops-dc@t.iq'), ('dc000000-0000-0000-0000-000000000003', 'mgr-dc@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('dc000000-0000-0000-0000-000000000001', 'it_admin'), ('dc000000-0000-0000-0000-000000000002', 'ops_room'), ('dc000000-0000-0000-0000-000000000003', 'department_manager') on conflict do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

do $$
declare it1 uuid := 'dc000000-0000-0000-0000-000000000001'; ops uuid := 'dc000000-0000-0000-0000-000000000002'; mgr uuid := 'dc000000-0000-0000-0000-000000000003';
        sub uuid; j jsonb; run uuid; n int; cover text; objs jsonb; prov uuid;
begin
  -- بيانات تجريبية: صورة إعلامية + غلاف محمي + صورة قاطع + ملف وثيقة موظف (خارج النطاق)
  insert into public.media_submissions (id, mode, title, work_type, sector_parent, sector_ids, event_date, photo_count, submitted_by, submitted_by_name)
  values (gen_random_uuid(), 'street', 'شارع د', 'كنس', 'karrada', '{4}', current_date, 1, mgr, 'م') returning id into sub;
  insert into public.media_submission_photos (submission_id, storage_path, created_by) values (sub, mgr::text || '/dc1.jpg', mgr);
  insert into storage.objects (bucket_id, name, metadata) values ('media-photos', mgr::text || '/dc1.jpg', '{"size": 100}');
  select storage_path into cover from public.media_covers limit 1;
  if cover is null then
    insert into public.media_covers (title, storage_path) values ('غلاف تجريبي', 'covers/dc-cover.png') returning storage_path into cover;
  end if;
  insert into storage.objects (bucket_id, name, metadata) values ('media-photos', cover, '{"size": 5}') on conflict do nothing;
  insert into public.sector_photos (manager_id, manager_name, shift, sectors, storage_path) values (mgr, 'م', 'morning', '{4}', 'dc/sector1.jpg');
  insert into storage.objects (bucket_id, name, metadata) values ('sector-photos', 'dc/sector1.jpg', '{"size": 7}');
  insert into storage.objects (bucket_id, name, metadata) values ('employee-documents', 'dc/keep.pdf', '{"size": 9}');

  -- D1: الصلاحية — غرفة العمليات ممنوعة
  perform pg_temp.as_user(ops);
  perform pg_temp.expect_error('select public.dev_cleanup_preview()', 'IT_FORBIDDEN');
  perform pg_temp.expect_error('select public.dev_cleanup_gps_stops()', 'IT_FORBIDDEN');
  perform pg_temp.expect_error('select public.dev_cleanup_photos_begin()', 'IT_FORBIDDEN');

  -- D2: المعاينة تعدّ الملفات غير المحمية فقط
  perform pg_temp.as_user(it1);
  j := public.dev_cleanup_preview();
  select (b ->> 'objects')::int into n from jsonb_array_elements(j -> 'buckets') b where b ->> 'bucket' = 'media-photos';
  assert n = 1, 'D2: media-photos objects = 1 (الغلاف محمي) got ' || n;
  assert (j -> 'photo_rows' ->> 'sector_photos')::int >= 1, 'D2b';
  assert j -> 'photos_run' = 'null'::jsonb, 'D2c: لا تشغيل جارٍ';
  -- D3: قبل البدء سياسة التخزين مغلقة
  assert not app.dev_cleanup_object_removable('media-photos', mgr::text || '/dc1.jpg'), 'D3: مغلقة قبل البدء';
  -- D4: البدء يفتح السياسة للملفات المشمولة فقط؛ الغلاف ووثائق الموظفين محمية
  j := public.dev_cleanup_photos_begin();
  run := (j ->> 'id')::uuid;
  assert (j ->> 'planned_objects')::int >= 2 and not (j ->> 'resumed')::boolean, 'D4: ' || j::text;
  assert app.dev_cleanup_object_removable('media-photos', mgr::text || '/dc1.jpg'), 'D4b: مفتوحة للصورة';
  assert app.dev_cleanup_object_removable('sector-photos', 'dc/sector1.jpg'), 'D4c';
  assert not app.dev_cleanup_object_removable('media-photos', cover), 'D4d: الغلاف محمي';
  assert not app.dev_cleanup_object_removable('employee-documents', 'dc/keep.pdf'), 'D4e: وثائق الموظفين خارج النطاق';
  -- بدء ثانٍ = استئناف لا تشغيل جديد
  j := public.dev_cleanup_photos_begin();
  assert (j ->> 'id')::uuid = run and (j ->> 'resumed')::boolean, 'D4f: استئناف';
  -- D5: الإنهاء ممنوع ما دامت ملفات باقية
  perform pg_temp.expect_error(format('select public.dev_cleanup_photos_finish(%L)', run), 'DEV_CLEANUP_OBJECTS_REMAIN');
  -- D6: الدفعة التالية لا تحوي الغلاف ولا وثائق الموظفين
  objs := public.dev_cleanup_photos_objects(run, 100);
  assert jsonb_array_length(objs) = (select count(*) from storage.objects o where o.bucket_id = any(app.dev_cleanup_photo_buckets()) and not app.dev_cleanup_object_protected(o.bucket_id, o.name)), 'D6: ' || objs::text;
  assert not exists (select 1 from jsonb_array_elements(objs) x where x ->> 'path' = cover or x ->> 'bucket' = 'employee-documents'), 'D6b';
  -- حذف المتصفح (نحاكيه): حذف الملفات المشمولة من التخزين وفق السياسة نفسها
  delete from storage.objects o where app.dev_cleanup_object_removable(o.bucket_id, o.name);
  j := public.dev_cleanup_photos_progress(run, 2);
  assert (j ->> 'remaining')::int = 0 and (j ->> 'removed_objects')::int = 2, 'D6c: ' || j::text;
  assert exists (select 1 from storage.objects where bucket_id = 'media-photos' and name = cover), 'D6d: الغلاف باقٍ';
  assert exists (select 1 from storage.objects where bucket_id = 'employee-documents' and name = 'dc/keep.pdf'), 'D6e';
  -- D7: الإنهاء يحذف السجلات ويغلق التشغيل والسياسة
  j := public.dev_cleanup_photos_finish(run);
  assert (j -> 'deleted_rows' ->> 'media_submission_photos')::int >= 1 and (j -> 'deleted_rows' ->> 'sector_photos')::int >= 1, 'D7: ' || j::text;
  select count(*) into n from public.media_submission_photos; assert n = 0, 'D7b';
  select count(*) into n from public.media_covers; assert n >= 1, 'D7c: مكتبة الأغلفة باقية';
  select photo_count into n from public.media_submissions where id = sub; assert n = 0, 'D7d';
  assert not app.dev_cleanup_object_removable('media-photos', 'x/y.jpg'), 'D7e: السياسة أُغلقت';
  perform pg_temp.expect_error(format('select public.dev_cleanup_photos_finish(%L)', run), 'DEV_CLEANUP_RUN_INVALID');

  -- D8: نقاط توقف GPS — تحرير المزامنة العالقة وحذف الأحداث وحالة السحب
  select id into prov from public.gps_providers limit 1;
  if prov is null then
    insert into public.gps_providers (name, type, base_url, is_active) values ('LVN dc', 'vendor_api', 'https://lvn.example/dc', true) returning id into prov;
  end if;
  insert into public.gps_sync_runs (provider_id, sync_type, requested_by, status) values (prov, 'incremental', it1, 'running');
  j := public.dev_cleanup_gps_stops();
  assert (j -> 'deleted_rows' ->> 'gps_sync_running_released')::int = 1, 'D8: ' || j::text;
  select count(*) into n from public.gps_sync_runs; assert n = 0, 'D8b';
  select count(*) into n from public.gps_stop_events; assert n = 0, 'D8c';
  select count(*) into n from public.gps_stop_scan_state; assert n = 0, 'D8d';
  -- D9: السجل
  j := public.dev_cleanup_preview();
  assert jsonb_array_length(j -> 'history') >= 2 and (j -> 'gps' ->> 'gps_sync_running')::int = 0, 'D9: ' || (j -> 'history')::text;
  raise notice 'dev cleanup ok';
end $$;
