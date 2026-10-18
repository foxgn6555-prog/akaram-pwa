-- اختبار 00245 · أخطاء الإنتاج المتكررة: حساب المدير المفوض الوحيد يتفقد كل البوابات بلا أخطاء
--   ① contractor_me/contractor_my_month لغير المُسنَد ⇒ لا صفوف   ② gbs_container_request_location للمدير المفوض
--   ③ disclosure_submit بلا معاون ولا مدير مفوض آخر ⇒ يعتمد المدير المفوض بنفسه   ④ approval_open سلسلة تُحلّ إلى الطالب فقط (مدير مفوض)
--   ⑤ حذف صور محذوفة مسبقاً / إضافة صورة مصدر محذوفة ⇒ بلا خطأ
set client_min_messages = notice;
insert into auth.users (id, email) values
  ('e5000000-0000-0000-0000-000000000001', 'sole-admin@t.iq'), ('e5000000-0000-0000-0000-000000000002', 'ops-e5@t.iq'), ('e5000000-0000-0000-0000-000000000003', 'media-e5@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('e5000000-0000-0000-0000-000000000001', 'super_admin'), ('e5000000-0000-0000-0000-000000000002', 'ops_room'), ('e5000000-0000-0000-0000-000000000003', 'media_officer')
on conflict do nothing;
insert into public.employees (id, user_id, full_name, employee_number) values
  ('e5000000-0000-0000-0000-0000000000e1', 'e5000000-0000-0000-0000-000000000001', 'المدير المفوض الوحيد', 'E5-1'),
  ('e5000000-0000-0000-0000-0000000000e9', null, 'سجاد موظف الاختبار', 'E5-9')
on conflict (id) do nothing;
insert into public.sectors (id, code, name, sort, parent_sector) values (1, 'S1', 'الكرادة', 1, 'karrada') on conflict (id) do nothing;
-- عزل: لا معاون ولا مدير مفوض آخر أثناء هذا الاختبار (تُعاد بعده)
create temp table e5_saved as select user_id, role from public.user_roles where role in ('deputy_director','super_admin') and user_id <> 'e5000000-0000-0000-0000-000000000001';
delete from public.user_roles where role in ('deputy_director','super_admin') and user_id <> 'e5000000-0000-0000-0000-000000000001';
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

do $$
declare adm uuid := 'e5000000-0000-0000-0000-000000000001'; n int; c_id uuid; upd uuid; j jsonb; r record;
begin
  perform pg_temp.as_user(adm);
  -- ① بوابة المتعهد
  select count(*) into n from public.contractor_me(); if n <> 0 then raise exception 'P1 contractor_me should be empty for unassigned admin'; end if;
  select count(*) into n from public.contractor_my_month(); if n <> 0 then raise exception 'P1 contractor_my_month should be empty'; end if;
  perform pg_temp.expect_error($q$ select public.contractor_set_headcount(3) $q$, 'CONTRACTOR_NOT_ASSIGNED');
  raise notice 'P1 ✅ غير المُسنَد: لا صفوف بلا خطأ، والإجراءات ما زالت محمية';

  -- ② بوابة المتابعة: المدير المفوض يطلب تحديث موقع حاوية
  select id into c_id from public.gbs_container_save(null, 'حاوية e5', 33.31, 44.41, 'ok', 1::smallint, null, null);
  upd := public.gbs_container_request_location(c_id, 33.32, 44.42, 5, 'اختبار', null);
  if upd is null then raise exception 'P2 request failed'; end if;
  select * into r from public.gbs_container_updates where id = upd; if r.state <> 'pending' or r.kind <> 'location' then raise exception 'P2 wrong update %', r; end if;
  raise notice 'P2 ✅ المدير المفوض يستطيع طلب تحديث حاوية';

  -- ③ الكشوفات: بلا معاون ولا مدير مفوض آخر ⇒ لا APPROVAL_NO_APPROVER؛ المدير المفوض هو المُعتمِد
  j := public.disclosure_save(null, '{"target_kind":"employee","employee_id":"e5000000-0000-0000-0000-0000000000e9","violation_type":"delay","penalty_type":"warning","details":"تأخر عن الدوام ٤٠ دقيقة","log_date":"2026-10-10"}');
  j := public.disclosure_submit((j ->> 'id')::uuid);
  if j ->> 'status' <> 'pending' then raise exception 'P3 submit: %', j; end if;
  select * into r from public.approval_tasks where request_kind = 'disclosure' and request_id = (j ->> 'id')::uuid and status = 'pending' order by step_no limit 1;
  if r.approvers <> array[adm] then raise exception 'P3 approver should be the sole admin: %', r; end if;
  raise notice 'P3 ✅ الكشف يُرفع والمدير المفوض الوحيد يعتمد بنفسه';

  -- ③ب موظف غرفة عمليات عادي بلا أي مُعتمِد غير... المدير المفوض موجود ⇒ يذهب إليه (السلوك الأصلي)
  perform pg_temp.as_user('e5000000-0000-0000-0000-000000000002');
  j := public.disclosure_save(null, '{"target_kind":"employee","employee_id":"e5000000-0000-0000-0000-0000000000e9","violation_type":"delay","penalty_type":"warning","details":"تأخر عن الدوام ٣٠ دقيقة","log_date":"2026-10-11"}');
  j := public.disclosure_submit((j ->> 'id')::uuid);
  select * into r from public.approval_tasks where request_kind = 'disclosure' and request_id = (j ->> 'id')::uuid and status = 'pending' order by step_no limit 1;
  if r.approvers <> array[adm] then raise exception 'P3b approver should be admin: %', r; end if;

  -- ④ سلسلة مضبوطة تُحلّ إلى الطالب نفسه فقط (حساب محدد = المدير المفوض) ⇒ يعتمد بنفسه بدل الخطأ
  perform pg_temp.as_user(adm);
  perform public.approval_chain_save('super_admin', 'disclosure', format('[{"kind":"account","user_id":"%s"}]', adm)::jsonb);
  j := public.disclosure_save(null, '{"target_kind":"employee","employee_id":"e5000000-0000-0000-0000-0000000000e9","violation_type":"delay","penalty_type":"warning","details":"تأخر عن الدوام ٢٠ دقيقة","log_date":"2026-10-12"}');
  j := public.disclosure_submit((j ->> 'id')::uuid);
  select * into r from public.approval_tasks where request_kind = 'disclosure' and request_id = (j ->> 'id')::uuid and status = 'pending' order by step_no limit 1;
  if r.approvers <> array[adm] or r.chain_id is null then raise exception 'P4 chain fallback wrong: %', r; end if;
  raise notice 'P4 ✅ سلسلة تُحلّ إلى المدير المفوض نفسه ⇒ يعتمد بنفسه';

  -- ⑤ الإعلام: حذف صورة محذوفة مسبقاً ⇒ null بلا خطأ
  perform pg_temp.as_user('e5000000-0000-0000-0000-000000000003');
  if public.media_design_photo_remove('e5000000-0000-0000-0000-00000000ffff') is not null then raise exception 'P5 single remove should be no-op'; end if;
  if public.media_design_photos_remove(array['e5000000-0000-0000-0000-00000000ffff']::uuid[]) is not null then raise exception 'P5 bulk remove should be no-op'; end if;
  raise notice 'P5 ✅ حذف صور محذوفة مسبقاً بلا خطأ';
end $$;
-- إعادة الأدوار المعزولة
insert into public.user_roles (user_id, role) select user_id, role from e5_saved on conflict do nothing;
-- تنظيف: لا نترك كشوفاً معلّقة/حاويات/سلسلة تؤثر في اختبارات أخرى على نفس القاعدة
delete from public.approval_tasks where request_kind = 'disclosure' and request_id in (select id from public.disclosures where prepared_by::text like 'e5000000-%');
delete from public.disclosure_events where disclosure_id in (select id from public.disclosures where prepared_by::text like 'e5000000-%');
delete from public.disclosures where prepared_by::text like 'e5000000-%';
delete from public.approval_chains where requester_role = 'super_admin' and request_type = 'disclosure';
delete from public.gbs_container_updates where container_id in (select id from public.gbs_containers where label = 'حاوية e5');
delete from public.gbs_containers where label = 'حاوية e5';
delete from public.notifications where user_id::text like 'e5000000-%';
