-- اختبار 00271: الموافقة الثنائية الاختيارية على الحذف + صلاحية حذف التخزين
set client_min_messages = notice;
insert into auth.users (id, email) values ('fd000000-0000-0000-0000-000000000021', 'it1-cc@t.iq'), ('fd000000-0000-0000-0000-000000000022', 'it2-cc@t.iq'), ('fd000000-0000-0000-0000-000000000023', 'mgr-cc@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('fd000000-0000-0000-0000-000000000021', 'it_admin'), ('fd000000-0000-0000-0000-000000000022', 'it_admin'), ('fd000000-0000-0000-0000-000000000023', 'department_manager') on conflict do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

do $$
declare it1 uuid := 'fd000000-0000-0000-0000-000000000021'; it2 uuid := 'fd000000-0000-0000-0000-000000000022'; mgr uuid := 'fd000000-0000-0000-0000-000000000023';
  d1 date := '2026-01-10'; sub uuid; pk jsonb; pkid uuid; js jsonb; path1 text; path2 text; sha text := repeat('d', 64);
begin
  path1 := mgr::text || '/cc1.jpg'; path2 := mgr::text || '/cc2.jpg';
  insert into public.media_submissions (id, mode, title, work_type, sector_parent, sector_ids, event_date, photo_count, submitted_by, submitted_by_name)
  values (gen_random_uuid(), 'street', 'شارع د', 'كنس', 'karrada', '{4}', d1, 2, mgr, 'م') returning id into sub;
  insert into public.media_submission_photos (submission_id, storage_path, created_by) values (sub, path1, mgr), (sub, path2, mgr);
  insert into storage.objects (bucket_id, name, metadata) values ('media-photos', path1, '{"size": 10}'), ('media-photos', path2, '{"size": 10}');

  perform pg_temp.as_user(it1);
  -- T1: الإعداد الجديد يظهر ويُحفظ (افتراضي معطّل)؛ التوقيع القديم (4 وسائط) ما زال يعمل
  js := public.cold_archive_settings_get();
  if (js ->> 'purge_approval')::boolean then raise exception 'T1 default should be false'; end if;
  js := public.cold_archive_settings_set(1, 0, '{}'::jsonb, '{}'::jsonb);
  if (js ->> 'purge_approval')::boolean then raise exception 'T1b old signature changed approval'; end if;
  js := public.cold_archive_settings_set(1, 0, '{}'::jsonb, '{}'::jsonb, true);
  if not (js ->> 'purge_approval')::boolean then raise exception 'T1c approval not saved'; end if;

  -- حزمة: إنشاء → تنزيل → تحقق (مهلة 0)
  pk := public.cold_archive_package_create(d1 - 1, d1 + 1, null); pkid := (pk ->> 'id')::uuid;
  perform public.cold_archive_items_downloaded(pkid, jsonb_build_array(jsonb_build_object('bucket', 'media-photos', 'path', path1, 'sha256', sha, 'bytes', 10), jsonb_build_object('bucket', 'media-photos', 'path', path2, 'sha256', sha, 'bytes', 10)));
  pk := public.cold_archive_copy_verify(pkid, 'قرص-1', jsonb_build_array(jsonb_build_object('bucket', 'media-photos', 'path', path1, 'sha256', sha), jsonb_build_object('bucket', 'media-photos', 'path', path2, 'sha256', sha)));
  if pk ->> 'status' <> 'verified' then raise exception 'T2 not verified: %', pk ->> 'status'; end if;
  -- T3: الموافقة مفعّلة → can_purge false ولا يمكن البدء
  if (pk ->> 'can_purge')::boolean then raise exception 'T3 can_purge should be false without approval'; end if;
  if (pk ->> 'purge_approval_required')::boolean is not true then raise exception 'T3b flag missing'; end if;
  perform pg_temp.expect_error(format('select public.cold_archive_purge_begin(%L)', pkid), 'COLD_ARCHIVE_APPROVAL_REQUIRED');
  -- T4: الموافقة قبل الطلب مرفوضة؛ الطالب لا يوافق على نفسه
  perform pg_temp.expect_error(format('select public.cold_archive_purge_approve(%L)', pkid), 'COLD_ARCHIVE_NOT_REQUESTED');
  pk := public.cold_archive_purge_request(pkid);
  if not (pk ->> 'purge_requested_by_me')::boolean then raise exception 'T4 requested_by_me'; end if;
  perform pg_temp.expect_error(format('select public.cold_archive_purge_approve(%L)', pkid), 'COLD_ARCHIVE_SAME_APPROVER');
  -- T5: حساب IT آخر يوافق → can_purge true → البدء يعمل؛ غير IT ممنوع
  perform pg_temp.as_user(mgr);
  perform pg_temp.expect_error(format('select public.cold_archive_purge_approve(%L)', pkid), 'IT_FORBIDDEN');
  perform pg_temp.as_user(it2);
  pk := public.cold_archive_purge_approve(pkid);
  if not (pk ->> 'can_purge')::boolean then raise exception 'T5 can_purge after approval'; end if;
  if pk ->> 'purge_approved_by' <> it2::text then raise exception 'T5b approver'; end if;
  -- T6: قبل البدء لا صلاحية حذف تخزين؛ بعد البدء نعم؛ بعد التأكيد تُغلق
  if app.cold_archive_object_purgeable('media-photos', path1) then raise exception 'T6 purgeable before begin'; end if;
  pk := public.cold_archive_purge_begin(pkid);
  if pk ->> 'status' <> 'purging' then raise exception 'T6b status'; end if;
  if not app.cold_archive_object_purgeable('media-photos', path1) then raise exception 'T6c not purgeable while purging'; end if;
  if not app.cold_archive_object_in_active_package('media-photos', path1) then raise exception 'T6d read closed during purging'; end if;
  pk := public.cold_archive_purge_confirm(pkid, jsonb_build_array(jsonb_build_object('bucket', 'media-photos', 'path', path1)));
  if pk ->> 'status' <> 'purging' or (pk ->> 'purged_count')::int <> 1 then raise exception 'T6e partial'; end if;
  if app.cold_archive_object_purgeable('media-photos', path1) then raise exception 'T6f still purgeable after confirm'; end if;
  pk := public.cold_archive_purge_confirm(pkid, jsonb_build_array(jsonb_build_object('bucket', 'media-photos', 'path', path2)));
  if pk ->> 'status' <> 'purged' then raise exception 'T6g final status'; end if;
  -- T7: الموافقة معطّلة → حزمة جديدة تُحذف بلا طلب/موافقة
  perform public.cold_archive_settings_set(1, 0, '{}'::jsonb, '{}'::jsonb, false);
  insert into public.media_submission_photos (submission_id, storage_path, created_by) values (sub, mgr::text || '/cc3.jpg', mgr);
  insert into storage.objects (bucket_id, name, metadata) values ('media-photos', mgr::text || '/cc3.jpg', '{"size": 10}');
  pk := public.cold_archive_package_create(d1 - 1, d1 + 1, null); pkid := (pk ->> 'id')::uuid;
  perform public.cold_archive_items_downloaded(pkid, jsonb_build_array(jsonb_build_object('bucket', 'media-photos', 'path', mgr::text || '/cc3.jpg', 'sha256', sha, 'bytes', 10)));
  pk := public.cold_archive_copy_verify(pkid, 'قرص-1', jsonb_build_array(jsonb_build_object('bucket', 'media-photos', 'path', mgr::text || '/cc3.jpg', 'sha256', sha)));
  if not (pk ->> 'can_purge')::boolean then raise exception 'T7 can_purge without approval setting'; end if;
  pk := public.cold_archive_purge_begin(pkid);
  if pk ->> 'status' <> 'purging' then raise exception 'T7b'; end if;
  -- T8: سياسة الحذف موجودة
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'cold-archive: IT purges packaged files') <> 1 then raise exception 'T8 policy'; end if;
  -- إعادة الإعدادات الافتراضية حتى لا تؤثر على اختبارات أخرى في نفس القاعدة
  perform public.cold_archive_settings_set(1, 7, '{}'::jsonb, '{}'::jsonb, false);
  raise notice 'cold archive purge approval: OK';
end $$;
