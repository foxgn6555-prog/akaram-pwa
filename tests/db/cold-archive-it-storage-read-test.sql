-- اختبار 00270: قراءة IT لملفات التخزين محدودة بالحزم النشطة
set client_min_messages = notice;
insert into auth.users (id, email) values ('fd000000-0000-0000-0000-000000000011', 'it-cb@t.iq'), ('fd000000-0000-0000-0000-000000000012', 'mgr-cb@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('fd000000-0000-0000-0000-000000000011', 'it_admin'), ('fd000000-0000-0000-0000-000000000012', 'department_manager') on conflict do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;

do $$
declare it uuid := 'fd000000-0000-0000-0000-000000000011'; mgr uuid := 'fd000000-0000-0000-0000-000000000012';
  d1 date := '2026-02-10'; sub uuid; pk jsonb; pkid uuid; n int;
begin
  insert into public.media_submissions (id, mode, title, work_type, sector_parent, sector_ids, event_date, photo_count, submitted_by, submitted_by_name)
  values (gen_random_uuid(), 'street', 'شارع ج', 'كنس', 'karrada', '{4}', d1, 2, mgr, 'م') returning id into sub;
  insert into public.media_submission_photos (submission_id, storage_path, created_by) values (sub, mgr::text || '/cb1.jpg', mgr), (sub, mgr::text || '/cb2.jpg', mgr);
  insert into storage.objects (bucket_id, name, metadata) values ('media-photos', mgr::text || '/cb1.jpg', '{"size": 10}'), ('media-photos', mgr::text || '/cb2.jpg', '{"size": 10}'), ('media-photos', mgr::text || '/cb-other.jpg', '{"size": 10}');

  perform pg_temp.as_user(it);
  -- T1: قبل أي حزمة — IT لا يرى شيئاً عبر الدالة
  if app.cold_archive_object_in_active_package('media-photos', mgr::text || '/cb1.jpg') then raise exception 'T1 readable before package'; end if;
  -- T2: بعد إنشاء حزمة تشمل الملفين — يراهما، ولا يرى الملف الثالث غير المُدرج
  pk := public.cold_archive_package_create(d1 - 1, d1 + 1, null); pkid := (pk ->> 'id')::uuid;
  if not app.cold_archive_object_in_active_package('media-photos', mgr::text || '/cb1.jpg') then raise exception 'T2a packaged file not readable'; end if;
  if app.cold_archive_object_in_active_package('media-photos', mgr::text || '/cb-other.jpg') then raise exception 'T2b unpackaged file readable'; end if;
  -- T3: ملف مفقود يخرج من الحزمة فيُغلق
  perform public.cold_archive_item_missing(pkid, 'media-photos', mgr::text || '/cb2.jpg');
  if app.cold_archive_object_in_active_package('media-photos', mgr::text || '/cb2.jpg') then raise exception 'T3 missing item still readable'; end if;
  -- T4: إلغاء الحزمة يغلق القراءة
  perform public.cold_archive_package_cancel(pkid, 'اختبار الإغلاق');
  if app.cold_archive_object_in_active_package('media-photos', mgr::text || '/cb1.jpg') then raise exception 'T4 readable after cancel'; end if;
  -- T5: السياسة موجودة على storage.objects
  select count(*) into n from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'cold-archive: IT reads packaged files';
  if n <> 1 then raise exception 'T5 policy missing'; end if;
  raise notice 'cold archive IT storage read: OK';
end $$;
