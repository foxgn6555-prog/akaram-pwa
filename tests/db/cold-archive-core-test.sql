-- اختبار 00269: الأرشيف البارد — الإعدادات، المعاينة، الحزمة، التنزيل، التحقق، المهلة، الحذف، البطاقة. مستقل (بادئة fd).
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('fd000000-0000-0000-0000-000000000001', 'it-ca@t.iq'), ('fd000000-0000-0000-0000-000000000002', 'mgr-ca@t.iq'),
  ('fd000000-0000-0000-0000-000000000003', 'contr-ca@t.iq'), ('fd000000-0000-0000-0000-000000000004', 'hr-ca@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('fd000000-0000-0000-0000-000000000001', 'it_admin'), ('fd000000-0000-0000-0000-000000000002', 'department_manager'),
  ('fd000000-0000-0000-0000-000000000003', 'employee'), ('fd000000-0000-0000-0000-000000000004', 'hr_officer')
on conflict do nothing;
insert into public.manager_profiles (user_id, shift, sectors) values ('fd000000-0000-0000-0000-000000000002', 'morning', '{7}') on conflict do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

do $$
declare it uuid := 'fd000000-0000-0000-0000-000000000001'; mgr uuid := 'fd000000-0000-0000-0000-000000000002'; ctr uuid := 'fd000000-0000-0000-0000-000000000003';
  d1 date := '2026-03-10'; d2 date := '2026-03-20'; sub1 uuid; sub2 uuid; p1 uuid; p2 uuid; p3 uuid; des uuid; ck uuid;
  js jsonb; pk jsonb; pkid uuid; eff jsonb; n int; items jsonb; sha1 text := repeat('a', 64); sha2 text := repeat('b', 64); sha3 text := repeat('c', 64); sha4 text := repeat('d', 64);
begin
  -- ── بذور: تذكرتا إعلام (3 صور) إحداها صورة مستخدمة في تصميم؛ تسجيل متعهد (صورتان) لشهر غير معتمد ──
  insert into public.media_submissions (id, mode, title, work_type, sector_parent, sector_ids, event_date, photo_count, submitted_by, submitted_by_name)
  values (gen_random_uuid(), 'street', 'شارع أ', 'كنس', 'karrada', '{4}', d1, 2, mgr, 'م') returning id into sub1;
  insert into public.media_submissions (id, mode, title, work_type, sector_parent, sector_ids, event_date, photo_count, submitted_by, submitted_by_name)
  values (gen_random_uuid(), 'street', 'شارع ب', 'كنس', 'karrada', '{4}', d2, 1, mgr, 'م') returning id into sub2;
  insert into public.media_submission_photos (submission_id, storage_path, created_by) values (sub1, mgr::text || '/ca1.jpg', mgr) returning id into p1;
  insert into public.media_submission_photos (submission_id, storage_path, created_by) values (sub1, mgr::text || '/ca2.jpg', mgr) returning id into p2;
  insert into public.media_submission_photos (submission_id, storage_path, created_by) values (sub2, mgr::text || '/ca3.jpg', mgr) returning id into p3;
  insert into storage.objects (bucket_id, name, metadata) values ('media-photos', mgr::text || '/ca1.jpg', '{"size": 1000}'), ('media-photos', mgr::text || '/ca2.jpg', '{"size": 2000}'), ('media-photos', mgr::text || '/ca3.jpg', '{"size": 4000}');
  insert into public.media_designs (id, sector_parent, period_type, period_start, period_end, title, cover_image_path, created_by) values (gen_random_uuid(), 'karrada', 'daily', d2, d2, 'تصميم الاختبار', 'builtin:c1', it) returning id into des;
  insert into public.media_design_photos (design_id, source_photo_id, source_submission_id, work_type, storage_path, sort_order) values (des, p3, sub2, 'كنس', mgr::text || '/ca3.jpg', 1);
  insert into public.contractor_profiles (user_id, manager_user_id, sector_id, assigned_by) values (ctr, mgr, 7, it) on conflict do nothing;
  insert into public.contractor_checkins (id, contractor_user_id, sector_id, log_date, checked_at, latitude, longitude, accuracy_m, in_zone, selfie_path, team_photo_path)
  values (gen_random_uuid(), ctr, 7, d1, d1::timestamptz + interval '6 hours', 33.3, 44.4, 5, true, ctr::text || '/s.jpg', ctr::text || '/t.jpg') returning id into ck;

  -- T0 · غير IT ممنوع
  perform pg_temp.as_user(mgr);
  perform pg_temp.expect_error($q$ select public.cold_archive_settings_get() $q$, 'IT_FORBIDDEN');
  perform pg_temp.expect_error($q$ select public.cold_archive_preview('2026-03-01', '2026-03-31') $q$, 'IT_FORBIDDEN');

  -- T1 · الإعدادات الافتراضية: قرص واحد، 7 أيام، مستندات الموظفين معطّلة، صور الإعلام مفعّلة
  perform pg_temp.as_user(it);
  eff := public.cold_archive_settings_get();
  if (eff ->> 'required_copies')::int <> 1 or (eff ->> 'grace_days')::int <> 7 then raise exception 'T1a %', eff; end if;
  if (eff #>> '{sources,employee_documents,enabled}')::boolean or not (eff #>> '{sources,media_submission_photos,enabled}')::boolean then raise exception 'T1b'; end if;
  if not (eff #>> '{protections,protect_design_photos,on}')::boolean then raise exception 'T1c'; end if;

  -- T2 · المعاينة: الإعلام 2 ملفات (3000 بايت) + 1 محمية (تصميم)؛ المتعهد 0 ملفات + 2 محمية (شهر غير معتمد)
  js := public.cold_archive_preview('2026-03-01', '2026-03-31');
  select x into js from jsonb_array_elements(js -> 'sources') x where x ->> 'source_key' = 'media_submission_photos';
  if (js ->> 'files')::int <> 2 or (js ->> 'bytes')::bigint <> 3000 or (js ->> 'protected')::int <> 1 then raise exception 'T2a %', js; end if;
  js := public.cold_archive_preview('2026-03-01', '2026-03-31');
  select x into js from jsonb_array_elements(js -> 'sources') x where x ->> 'source_key' = 'contractor_checkins';
  if (js ->> 'files')::int <> 0 or (js ->> 'protected')::int <> 2 then raise exception 'T2b %', js; end if;

  -- T3 · إيقاف حماية التصميم ⇒ تصبح 3 ملفات؛ اعتماد شهر المتعهدين ⇒ صورتاه تدخلان
  eff := public.cold_archive_settings_set(1, 0, '{}'::jsonb, '{"protect_design_photos": false}'::jsonb);
  if (eff #>> '{protections,protect_design_photos,on}')::boolean then raise exception 'T3a'; end if;
  insert into public.contractor_month_approvals (month, approved_source, approved_by) values ('2026-03-01', 'contractor', it) on conflict do nothing;
  js := public.cold_archive_preview('2026-03-01', '2026-03-31');
  if (js #>> '{totals,files}')::int <> 5 or (js #>> '{totals,protected}')::int <> 0 then raise exception 'T3b %', js -> 'totals'; end if;
  -- مصدر معطّل لا يظهر؛ مفتاح غير معروف يُرفض
  perform pg_temp.expect_error($q$ select public.cold_archive_settings_set(1, 7, '{"nope": {"enabled": true}}', '{}') $q$, 'COLD_ARCHIVE_INPUT_INVALID');
  perform pg_temp.expect_error($q$ select public.cold_archive_settings_set(9, 7, '{}', '{}') $q$, 'COLD_ARCHIVE_INPUT_INVALID');

  -- T4 · إنشاء الحزمة: فترة لم تنتهِ تُرفض؛ فترة فارغة تُرفض؛ الصحيحة تثبّت 5 ملفات
  perform pg_temp.expect_error(format($q$ select public.cold_archive_package_create('2026-03-01', %L) $q$, current_date), 'COLD_ARCHIVE_PERIOD_NOT_CLOSED');
  perform pg_temp.expect_error($q$ select public.cold_archive_package_create('2020-01-01', '2020-01-31') $q$, 'COLD_ARCHIVE_EMPTY');
  pk := public.cold_archive_package_create('2026-03-01', '2026-03-31', 'اختبار');
  pkid := (pk ->> 'id')::uuid;
  if (pk ->> 'file_count')::int <> 5 or pk ->> 'status' <> 'ready' or (pk ->> 'required_copies')::int <> 1 or (pk ->> 'grace_days')::int <> 0 then raise exception 'T4 %', pk; end if;
  if pk ->> 'code' not like 'PKG-2026-03-01_2026-03-31-%' then raise exception 'T4 code %', pk ->> 'code'; end if;
  -- نفس الفترة مرة ثانية: لا شيء جديد (الملفات محجوزة في حزمة قائمة)
  perform pg_temp.expect_error($q$ select public.cold_archive_package_create('2026-03-01', '2026-03-31') $q$, 'COLD_ARCHIVE_EMPTY');
  js := public.cold_archive_preview('2026-03-01', '2026-03-31');
  if (js #>> '{totals,already_archived}')::int <> 5 or (js #>> '{totals,files}')::int <> 0 then raise exception 'T4b %', js -> 'totals'; end if;

  -- T5 · قبل التنزيل الكامل: التحقق مرفوض؛ الحذف مرفوض
  select count(*) into n from public.cold_archive_items_list(pkid, 0, 100);
  if n <> 5 then raise exception 'T5 list %', n; end if;
  perform pg_temp.expect_error(format($q$ select public.cold_archive_copy_verify(%L, 'E', '[]') $q$, pkid), 'COLD_ARCHIVE_NOT_FULLY_DOWNLOADED');
  perform pg_temp.expect_error(format($q$ select public.cold_archive_purge_begin(%L) $q$, pkid), 'COLD_ARCHIVE_NOT_VERIFIED');

  -- T6 · تسجيل التنزيل (بصمة غير صالحة تُرفض)؛ ملف يتيم يُستثنى
  items := jsonb_build_array(
    jsonb_build_object('bucket', 'media-photos', 'path', mgr::text || '/ca1.jpg', 'sha256', sha1, 'bytes', 1000),
    jsonb_build_object('bucket', 'media-photos', 'path', mgr::text || '/ca2.jpg', 'sha256', sha2, 'bytes', 2000),
    jsonb_build_object('bucket', 'media-photos', 'path', mgr::text || '/ca3.jpg', 'sha256', 'xyz', 'bytes', 4000),
    jsonb_build_object('bucket', 'contractor-photos', 'path', ctr::text || '/s.jpg', 'sha256', sha3, 'bytes', 500));
  js := public.cold_archive_items_downloaded(pkid, items);
  if (js ->> 'updated')::int <> 3 or (js ->> 'rejected')::int <> 1 then raise exception 'T6a %', js; end if;
  perform public.cold_archive_item_missing(pkid, 'contractor-photos', ctr::text || '/t.jpg');
  pk := public.cold_archive_package_get(pkid);
  if (pk ->> 'file_count')::int <> 4 or (pk ->> 'downloaded_count')::int <> 3 then raise exception 'T6b %', pk; end if;
  js := public.cold_archive_items_downloaded(pkid, jsonb_build_array(jsonb_build_object('bucket', 'media-photos', 'path', mgr::text || '/ca3.jpg', 'sha256', sha4, 'bytes', 4000)));

  -- T7 · التحقق: بصمة مختلفة على القرص ⇒ مرفوض ولا تُسجَّل نسخة؛ المطابقة الكاملة ⇒ verified + الحذف متاح فوراً (مهلة 0)
  perform pg_temp.expect_error(format($q$ select public.cold_archive_copy_verify(%L, 'E', %L) $q$, pkid, jsonb_build_array(
    jsonb_build_object('bucket', 'media-photos', 'path', mgr::text || '/ca1.jpg', 'sha256', sha1),
    jsonb_build_object('bucket', 'media-photos', 'path', mgr::text || '/ca2.jpg', 'sha256', repeat('9', 64)),
    jsonb_build_object('bucket', 'media-photos', 'path', mgr::text || '/ca3.jpg', 'sha256', sha4),
    jsonb_build_object('bucket', 'contractor-photos', 'path', ctr::text || '/s.jpg', 'sha256', sha3))::text), 'COLD_ARCHIVE_VERIFY_MISMATCH');
  if exists (select 1 from public.cold_archive_copies where package_id = pkid) then raise exception 'T7a copy recorded on mismatch'; end if;
  pk := public.cold_archive_copy_verify(pkid, 'E', jsonb_build_array(
    jsonb_build_object('bucket', 'media-photos', 'path', mgr::text || '/ca1.jpg', 'sha256', sha1),
    jsonb_build_object('bucket', 'media-photos', 'path', mgr::text || '/ca2.jpg', 'sha256', sha2),
    jsonb_build_object('bucket', 'media-photos', 'path', mgr::text || '/ca3.jpg', 'sha256', sha4),
    jsonb_build_object('bucket', 'contractor-photos', 'path', ctr::text || '/s.jpg', 'sha256', sha3)));
  if pk ->> 'status' <> 'verified' or (pk ->> 'verified_copies')::int <> 1 or not (pk ->> 'can_purge')::boolean then raise exception 'T7b %', pk; end if;

  -- T8 · الحذف: بدء ⇒ purging؛ تأكيد جزئي ⇒ يبقى purging؛ تأكيد الباقي ⇒ purged؛ البطاقة تعرف الحزمة والقرص
  pk := public.cold_archive_purge_begin(pkid);
  if pk ->> 'status' <> 'purging' then raise exception 'T8a %', pk ->> 'status'; end if;
  pk := public.cold_archive_purge_confirm(pkid, jsonb_build_array(jsonb_build_object('bucket', 'media-photos', 'path', mgr::text || '/ca1.jpg')));
  if pk ->> 'status' <> 'purging' or (pk ->> 'purged_count')::int <> 1 then raise exception 'T8b %', pk; end if;
  pk := public.cold_archive_purge_confirm(pkid, jsonb_build_array(
    jsonb_build_object('bucket', 'media-photos', 'path', mgr::text || '/ca2.jpg'), jsonb_build_object('bucket', 'media-photos', 'path', mgr::text || '/ca3.jpg'),
    jsonb_build_object('bucket', 'contractor-photos', 'path', ctr::text || '/s.jpg')));
  if pk ->> 'status' <> 'purged' or (pk ->> 'purged_count')::int <> 4 or pk ->> 'purged_at' is null then raise exception 'T8c %', pk; end if;
  perform pg_temp.as_user(mgr);
  js := public.cold_archive_lookup('media-photos', array[mgr::text || '/ca1.jpg', mgr::text || '/nope.jpg']);
  if js -> (mgr::text || '/ca1.jpg') ->> 'package_code' <> (pk ->> 'code') or (js -> (mgr::text || '/ca1.jpg') -> 'disks') <> '["E"]'::jsonb or js ? (mgr::text || '/nope.jpg') then raise exception 'T8d %', js; end if;
  -- الملف اليتيم (missing) لا يظهر كمحذوف
  js := public.cold_archive_lookup('contractor-photos', array[ctr::text || '/t.jpg']);
  if js <> '{}'::jsonb then raise exception 'T8e %', js; end if;

  -- T9 · المهلة: حزمة جديدة بمهلة 7 أيام وقرصين ⇒ بعد قرص واحد ليست verified؛ بعد قرصين verified لكن الحذف ممنوع (GRACE)
  perform pg_temp.as_user(it);
  perform public.cold_archive_settings_set(2, 7, '{}'::jsonb, '{}'::jsonb);
  insert into public.media_submission_photos (submission_id, storage_path, created_by) values (sub1, mgr::text || '/ca4.jpg', mgr);
  pk := public.cold_archive_package_create('2026-03-01', '2026-03-31');
  pkid := (pk ->> 'id')::uuid;
  if (pk ->> 'file_count')::int <> 1 or (pk ->> 'required_copies')::int <> 2 then raise exception 'T9a %', pk; end if;
  perform public.cold_archive_items_downloaded(pkid, jsonb_build_array(jsonb_build_object('bucket', 'media-photos', 'path', mgr::text || '/ca4.jpg', 'sha256', sha1, 'bytes', 10)));
  pk := public.cold_archive_copy_verify(pkid, 'E', jsonb_build_array(jsonb_build_object('bucket', 'media-photos', 'path', mgr::text || '/ca4.jpg', 'sha256', sha1)));
  if pk ->> 'status' <> 'ready' or (pk ->> 'verified_copies')::int <> 1 then raise exception 'T9b %', pk; end if;
  perform pg_temp.expect_error(format($q$ select public.cold_archive_purge_begin(%L) $q$, pkid), 'COLD_ARCHIVE_NOT_VERIFIED');
  pk := public.cold_archive_copy_verify(pkid, 'F', jsonb_build_array(jsonb_build_object('bucket', 'media-photos', 'path', mgr::text || '/ca4.jpg', 'sha256', sha1)));
  if pk ->> 'status' <> 'verified' or (pk ->> 'verified_copies')::int <> 2 or (pk ->> 'can_purge')::boolean then raise exception 'T9c %', pk; end if;
  perform pg_temp.expect_error(format($q$ select public.cold_archive_purge_begin(%L) $q$, pkid), 'COLD_ARCHIVE_GRACE_ACTIVE');
  -- إلغاء بسبب
  perform pg_temp.expect_error(format($q$ select public.cold_archive_package_cancel(%L, '') $q$, pkid), 'COLD_ARCHIVE_REASON_REQUIRED');
  pk := public.cold_archive_package_cancel(pkid, 'تجربة');
  if pk ->> 'status' <> 'cancelled' then raise exception 'T9d'; end if;
  -- بعد الإلغاء يعود الملف متاحاً للمعاينة
  js := public.cold_archive_preview('2026-03-01', '2026-03-31');
  if (js #>> '{totals,files}')::int <> 1 then raise exception 'T9e %', js -> 'totals'; end if;
  -- سجل الأحداث
  select count(*) into n from public.cold_archive_events where package_id = pkid;
  if n < 4 then raise exception 'T9f events %', n; end if;
  raise notice 'cold archive core test ok';
end $$;
