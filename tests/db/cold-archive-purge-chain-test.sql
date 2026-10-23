-- اختبار 00281 (00338): حذف الأرشيف البارد عبر سلسلة الموافقات — بلا سلسلة السلوك القديم، مع سلسلة: فتح/إشعار/مهامي/رفض/إعادة طلب/موافقة أخيرة/بدء الحذف. مستقل (بادئة fe).
set client_min_messages = notice;
insert into auth.users (id, email) values ('fe000000-0000-0000-0000-000000000031', 'it1-ch@t.iq'), ('fe000000-0000-0000-0000-000000000032', 'it2-ch@t.iq'), ('fe000000-0000-0000-0000-000000000033', 'dep-ch@t.iq'), ('fe000000-0000-0000-0000-000000000034', 'boss-ch@t.iq'), ('fe000000-0000-0000-0000-000000000035', 'mgr-ch@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('fe000000-0000-0000-0000-000000000031', 'it_admin'), ('fe000000-0000-0000-0000-000000000032', 'it_admin'), ('fe000000-0000-0000-0000-000000000033', 'deputy_director'), ('fe000000-0000-0000-0000-000000000034', 'super_admin'), ('fe000000-0000-0000-0000-000000000035', 'department_manager') on conflict do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;
create or replace function pg_temp.mk_package(p_mgr uuid, p_path text, p_day date) returns uuid language plpgsql as $$
declare sub uuid; pk jsonb; sha text := repeat('e', 64);
begin
  insert into public.media_submissions (id, mode, title, work_type, sector_parent, sector_ids, event_date, photo_count, submitted_by, submitted_by_name)
  values (gen_random_uuid(), 'street', 'شارع هـ', 'كنس', 'karrada', '{4}', p_day, 1, p_mgr, 'م') returning id into sub;
  insert into public.media_submission_photos (submission_id, storage_path, created_by) values (sub, p_path, p_mgr);
  insert into storage.objects (bucket_id, name, metadata) values ('media-photos', p_path, '{"size": 10}');
  pk := public.cold_archive_package_create(p_day - 1, p_day + 1, null);
  perform public.cold_archive_items_downloaded((pk ->> 'id')::uuid, jsonb_build_array(jsonb_build_object('bucket', 'media-photos', 'path', p_path, 'sha256', sha, 'bytes', 10)));
  pk := public.cold_archive_copy_verify((pk ->> 'id')::uuid, 'قرص-1', jsonb_build_array(jsonb_build_object('bucket', 'media-photos', 'path', p_path, 'sha256', sha)));
  if pk ->> 'status' <> 'verified' then raise exception 'mk_package not verified: %', pk; end if;
  return (pk ->> 'id')::uuid;
end $$;

do $$
declare it1 uuid := 'fe000000-0000-0000-0000-000000000031'; it2 uuid := 'fe000000-0000-0000-0000-000000000032'; dep uuid := 'fe000000-0000-0000-0000-000000000033';
        boss uuid := 'fe000000-0000-0000-0000-000000000034'; mgr uuid := 'fe000000-0000-0000-0000-000000000035';
        pk jsonb; pkid uuid; pk2 uuid; cid uuid; n int; r record;
begin
  perform pg_temp.as_user(it1);
  perform public.cold_archive_settings_set(1, 0, '{}'::jsonb, '{}'::jsonb, false);   -- لا موافقة ثنائية
  -- C1: بلا سلسلة ⇒ السلوك القديم تماماً: can_purge فوراً بلا طلب
  pkid := pg_temp.mk_package(mgr, mgr::text || '/ch1.jpg', '2026-02-10');
  pk := public.cold_archive_package_get(pkid);
  assert (pk ->> 'can_purge')::boolean and not (pk ->> 'purge_approval_required')::boolean and pk -> 'purge_chain' = 'null'::jsonb, 'C1: ' || pk::text;
  -- C2: ضبط السلسلة — النوع لا يُقبل إلا لدور IT؛ it_admin صار خطوة تسلسلية
  perform pg_temp.expect_error($q$ select public.approval_chain_save('admin_ops', 'cold_archive_purge', '[{"kind":"hierarchy","role":"deputy_director"}]') $q$, 'APPROVAL_ROLE_INVALID');
  cid := public.approval_chain_save('it_admin', 'cold_archive_purge', '[{"kind":"hierarchy","role":"it_admin"},{"kind":"hierarchy","role":"deputy_director"}]');
  select count(*) into n from public.approval_chains_list() l where l.id = cid and l.request_type = 'cold_archive_purge'; assert n = 1, 'C2: السلسلة محفوظة';
  -- C3: بعد السلسلة: الحزمة نفسها تحتاج موافقة، والبدء ممنوع قبل الطلب
  pk := public.cold_archive_package_get(pkid);
  assert (pk ->> 'purge_approval_required')::boolean and not (pk ->> 'can_purge')::boolean, 'C3: وجود سلسلة لدوري ⇒ لا حذف قبل الطلب والموافقة؛ ' || pk::text;
  perform pg_temp.expect_error(format('select public.cold_archive_purge_begin(%L)', pkid), 'COLD_ARCHIVE_APPROVAL_REQUIRED');
  pk := public.cold_archive_purge_request(pkid);
  assert (pk ->> 'purge_chain_id')::uuid = cid and (pk -> 'purge_chain' ->> 'current_step')::int = 1 and (pk -> 'purge_chain' ->> 'total_steps')::int = 2 and not (pk ->> 'can_purge')::boolean, 'C4: ' || (pk -> 'purge_chain')::text;
  perform pg_temp.expect_error(format('select public.cold_archive_purge_begin(%L)', pkid), 'COLD_ARCHIVE_APPROVAL_REQUIRED');
  -- C5: الموافقة المباشرة ممنوعة والسلسلة تحكم؛ الطالب ليس من الموافقين (it2 فقط في الخطوة 1)
  perform pg_temp.as_user(it2);
  perform pg_temp.expect_error(format('select public.cold_archive_purge_approve(%L)', pkid), 'COLD_ARCHIVE_CHAIN_ACTIVE');
  select approvers into r from public.approval_tasks where request_kind = 'cold_archive_purge' and request_id = pkid and step_no = 1;
  assert it2 = any(r.approvers) and not (it1 = any(r.approvers)), 'C5: ' || r::text;
  select count(*) into n from public.notifications where user_id = it2 and title like 'طلب حذف أرشيف بارد%' and link = '/it/approvals'; assert n = 1, 'C5b: إشعار IT برابط /it/approvals';
  -- C6: تظهر في مهامي بتفاصيلها، ومسارها الزمني متاح
  select * into r from public.approval_my_tasks() where request_kind = 'cold_archive_purge';
  assert r.request_id = pkid and r.type_name = 'حذف أرشيف بارد' and (r.details ->> 'file_count')::int = 1 and r.details ->> 'copies' = 'قرص-1' and r.requester_role = 'it_admin' and r.total_steps = 2, 'C6: ' || r::text;
  select count(*) into n from public.approval_timeline('cold_archive_purge', pkid); assert n = 2, 'C6b';
  -- C7: الرفض يحتاج سبباً، ويُلغي الطلب ويُشعر الطالب
  perform pg_temp.expect_error(format('select public.approval_decide_request(%L, %L, false, null)', 'cold_archive_purge', pkid), 'HR_REASON_REQUIRED');
  perform public.approval_decide_request('cold_archive_purge', pkid, false, 'نسخة القرص لم تُفحص');
  pk := public.cold_archive_package_get(pkid);
  assert pk ->> 'purge_requested_at' is null and pk ->> 'purge_chain_id' is null and pk ->> 'purge_approved_at' is null and pk ->> 'status' = 'verified', 'C7: ' || pk::text;
  select count(*) into n from public.notifications where user_id = it1 and title like 'رُفض طلب حذف%'; assert n = 1, 'C7b: إشعار الرفض';
  select count(*) into n from public.cold_archive_events where package_id = pkid and action = 'purge_rejected'; assert n = 1, 'C7c: حدث الرفض';
  -- C8: إعادة الطلب تعمل (المهام القديمة تُستبدل) ثم موافقتان ⇒ موافقة الحذف مسجّلة والبدء يعمل
  perform pg_temp.as_user(it1);
  pk := public.cold_archive_purge_request(pkid);
  assert (pk -> 'purge_chain' ->> 'current_step')::int = 1, 'C8: ' || pk::text;
  perform pg_temp.as_user(it2);
  perform public.approval_decide_request('cold_archive_purge', pkid, true, null);
  pk := public.cold_archive_package_get(pkid);
  assert (pk -> 'purge_chain' ->> 'current_step')::int = 2 and pk ->> 'purge_approved_at' is null, 'C8b: الخطوة 2 معلّقة ' || (pk -> 'purge_chain')::text;
  perform pg_temp.as_user(mgr);
  perform pg_temp.expect_error(format('select public.approval_decide_request(%L, %L, true, null)', 'cold_archive_purge', pkid), 'HR_FORBIDDEN');
  perform pg_temp.as_user(dep);
  perform public.approval_decide_request('cold_archive_purge', pkid, true, 'موافق');
  perform pg_temp.expect_error(format('select public.cold_archive_purge_begin(%L)', pkid), 'IT_FORBIDDEN');   -- C9: الحذف النهائي ليس للمعاون
  perform pg_temp.as_user(it1);
  pk := public.cold_archive_package_get(pkid);
  assert pk ->> 'purge_approved_by' = dep::text and (pk ->> 'can_purge')::boolean and (pk -> 'purge_chain' ->> 'current_step') is null, 'C8c: ' || pk::text;
  select count(*) into n from public.notifications where user_id = it1 and title like 'اعتُمد حذف%'; assert n = 1, 'C8d: إشعار الاعتماد';
  perform pg_temp.expect_error(format('select public.approval_decide_request(%L, %L, true, null)', 'cold_archive_purge', pkid), 'COLD_ARCHIVE_ALREADY_DECIDED');
  -- C9: الحذف النهائي: IT فقط
  pk := public.cold_archive_purge_begin(pkid);
  assert pk ->> 'status' = 'purging', 'C9: ' || (pk ->> 'status');
  -- C10: تعطيل السلسلة ⇒ العودة للسلوك القديم (الإعداد الثنائي معطّل ⇒ بلا طلب)
  perform public.approval_chain_save('it_admin', 'cold_archive_purge', '[{"kind":"hierarchy","role":"deputy_director"}]', false);
  pk2 := pg_temp.mk_package(mgr, mgr::text || '/ch2.jpg', '2026-02-20');
  pk := public.cold_archive_package_get(pk2);
  assert (pk ->> 'can_purge')::boolean and not (pk ->> 'purge_approval_required')::boolean, 'C10: ' || pk::text;
  pk := public.cold_archive_purge_request(pk2);
  assert pk ->> 'purge_chain_id' is null and (pk ->> 'can_purge')::boolean, 'C10b: طلب بلا سلسلة لا يفتح شيئاً';
  perform public.cold_archive_settings_set(1, 7, '{}'::jsonb, '{}'::jsonb, false);
  raise notice 'cold archive purge chain: OK';
end $$;
