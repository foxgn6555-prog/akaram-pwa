-- اختبار 00282 (00339): اعتماد تقرير الشكاوى عبر سلسلة الموافقات — بلا سلسلة الاعتماد الفوري القديم؛ مع سلسلة: فتح/مهامي/رفض/إعادة/ملف جديد يُلغي/اعتماد نهائي/قراءة الملف. مستقل (بادئة fc).
set client_min_messages = notice;
insert into auth.users (id, email) values ('fc000000-0000-0000-0000-000000000041', 'co-cr@t.iq'), ('fc000000-0000-0000-0000-000000000042', 'dep-cr@t.iq'), ('fc000000-0000-0000-0000-000000000043', 'it-cr@t.iq'), ('fc000000-0000-0000-0000-000000000044', 'mgr-cr@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('fc000000-0000-0000-0000-000000000041', 'complaints_officer'), ('fc000000-0000-0000-0000-000000000042', 'deputy_director'), ('fc000000-0000-0000-0000-000000000043', 'it_admin'), ('fc000000-0000-0000-0000-000000000044', 'department_manager') on conflict do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

do $$
declare co uuid := 'fc000000-0000-0000-0000-000000000041'; dep uuid := 'fc000000-0000-0000-0000-000000000042'; it uuid := 'fc000000-0000-0000-0000-000000000043'; mgr uuid := 'fc000000-0000-0000-0000-000000000044';
        rid uuid; rid2 uuid; cid uuid; p1 text; p2 text; r record; n int;
begin
  -- تقريران في حالة مسودة (بلا سلسلة بعد)
  insert into public.complaint_reports (report_date, sector, title, created_by) values ('2026-03-01', 'karrada', 'تقرير الكرادة 2026-03-01', co) returning id into rid;
  insert into public.complaint_reports (report_date, sector, title, created_by) values ('2026-03-02', 'zaafaraniya', 'تقرير الزعفرانية 2026-03-02', co) returning id into rid2;
  p1 := 'reports/' || rid::text || '/complaints-v1.pptx'; p2 := 'reports/' || rid::text || '/complaints-v2.pptx';
  insert into storage.objects (bucket_id, name, metadata) values ('complaint-media', p1, '{"size": 10}'), ('complaint-media', p2, '{"size": 10}');
  perform pg_temp.as_user(co);
  -- R1: بلا سلسلة ⇒ الاعتماد فوري كما اليوم
  perform public.complaint_attach_pptx(rid2, 'reports/' || rid2::text || '/complaints-v1.pptx');
  perform public.complaint_approve_report(rid2, 'reports/' || rid2::text || '/complaints-v1.pptx', true);
  select status, approved_by, approval_chain_id into r from public.complaint_reports where id = rid2; assert r.status = 'approved' and r.approved_by = co and r.approval_chain_id is null, 'R1: ' || r::text;
  -- R2: ضبط سلسلة: موظف الشكاوى ← المعاون؛ النوع مرفوض لدور آخر
  perform pg_temp.as_user(it);
  perform pg_temp.expect_error($q$ select public.approval_chain_save('admin_ops', 'complaint_report', '[{"kind":"hierarchy","role":"deputy_director"}]') $q$, 'APPROVAL_ROLE_INVALID');
  cid := public.approval_chain_save('complaints_officer', 'complaint_report', '[{"kind":"hierarchy","role":"deputy_director"}]');
  -- R3: مع سلسلة: الاعتماد يفتح السلسلة ولا يعتمد؛ الشروط القديمة باقية (ملف/تأكيد)
  perform pg_temp.as_user(co);
  perform public.complaint_attach_pptx(rid, p1);
  perform pg_temp.expect_error(format('select public.complaint_approve_report(%L, %L, false)', rid, p1), 'COMPLAINT_REPORT_REVIEW_CONFIRMATION_REQUIRED');
  perform pg_temp.expect_error(format('select public.complaint_approve_report(%L, %L, true)', rid, p2), 'COMPLAINT_REPORT_REVIEWED_FILE_MISMATCH');
  perform public.complaint_approve_report(rid, p1, true);
  select * into r from public.complaint_reports where id = rid;
  assert r.status = 'quality_review' and r.approval_chain_id = cid and r.approval_requested_by = co and r.review_confirmed_at is not null and r.reviewed_pptx_path = p1 and r.approved_at is null, 'R3: ' || r.status || ' ' || coalesce(r.approval_chain_id::text, 'null');
  perform pg_temp.expect_error(format('select public.complaint_approve_report(%L, %L, true)', rid, p1), 'COMPLAINT_REPORT_CHAIN_ACTIVE');
  select count(*) into n from public.notifications where user_id = dep and title like 'تقرير شكاوى بانتظار اعتمادك%' and link = '/deputy/approvals'; assert n = 1, 'R3b: إشعار المعاون';
  -- R4: مهامي لدى المعاون + قراءة الملف أثناء المهمة فقط
  perform pg_temp.as_user(dep);
  select * into r from public.approval_my_tasks() where request_kind = 'complaint_report';
  assert r.request_id = rid and r.type_name = 'تقرير شكاوى' and r.details ->> 'sector_label' = 'الكرادة' and r.details ->> 'pptx_path' = p1 and r.attachment_path = p1 and r.requester_role = 'complaints_officer', 'R4: ' || r::text;
  assert app.complaint_report_pptx_readable(p1), 'R4b: المعاون يقرأ ملف العرض أثناء مهمته';
  assert not app.complaint_report_pptx_readable(p2), 'R4c: لا يقرأ ملفاً آخر';
  perform pg_temp.as_user(mgr); assert not app.complaint_report_pptx_readable(p1), 'R4d: غير الموافق لا يقرأ';
  perform pg_temp.expect_error(format('select public.approval_decide_request(%L, %L, true, null)', 'complaint_report', rid), 'HR_FORBIDDEN');
  -- R5: الرفض بسبب ⇒ يعود للمراجعة، تُمسح السلسلة والإقرار، ويُشعر الموظف
  perform pg_temp.as_user(dep);
  perform pg_temp.expect_error(format('select public.approval_decide_request(%L, %L, false, null)', 'complaint_report', rid), 'HR_REASON_REQUIRED');
  perform public.approval_decide_request('complaint_report', rid, false, 'صورة «بعد» غير واضحة في الموقع 3');
  select * into r from public.complaint_reports where id = rid;
  assert r.status = 'quality_review' and r.approval_chain_id is null and r.review_confirmed_at is null and r.approval_rejected_note like 'صورة%', 'R5: ' || r.status;
  select count(*) into n from public.notifications where user_id = co and title like 'أُعيد تقرير الشكاوى%'; assert n = 1, 'R5b';
  assert not app.complaint_report_pptx_readable(p1), 'R5c: انتهت المهمة ⇒ لا قراءة';
  -- R6: إعادة الاعتماد تفتح سلسلة جديدة؛ ملف جديد أثناءها يُلغيها
  perform pg_temp.as_user(co);
  perform public.complaint_approve_report(rid, p1, true);
  select approval_chain_id into r from public.complaint_reports where id = rid; assert r.approval_chain_id = cid, 'R6';
  perform public.complaint_attach_pptx(rid, p2);
  select * into r from public.complaint_reports where id = rid; assert r.approval_chain_id is null and r.pptx_path = p2 and r.review_confirmed_at is null, 'R6b: الملف الجديد ألغى السلسلة';
  select count(*) into n from public.approval_tasks where request_kind = 'complaint_report' and request_id = rid and status = 'pending'; assert n = 0, 'R6c: لا مهام معلّقة';
  perform pg_temp.as_user(dep); select count(*) into n from public.approval_my_tasks() where request_kind = 'complaint_report'; assert n = 0, 'R6d';
  -- R7: الاعتماد النهائي عبر السلسلة ⇒ approved بالمعاون + إشعار الموظف + سجل تدقيق
  perform pg_temp.as_user(co);
  perform public.complaint_approve_report(rid, p2, true);
  perform pg_temp.as_user(dep);
  perform public.approval_decide_request('complaint_report', rid, true, 'ممتاز');
  select * into r from public.complaint_reports where id = rid;
  assert r.status = 'approved' and r.approved_by = dep and r.approved_at is not null and r.reviewed_pptx_path = p2 and r.approval_chain_id = cid, 'R7: ' || r.status;
  select count(*) into n from public.notifications where user_id = co and title like 'اعتُمد تقرير الشكاوى%'; assert n = 1, 'R7b';
  select count(*) into n from public.audit_logs where table_name = 'complaint_reports' and record_id = rid::text and new_row ->> 'viaChain' = 'true'; assert n = 1, 'R7c';
  perform pg_temp.expect_error(format('select public.approval_decide_request(%L, %L, true, null)', 'complaint_report', rid), 'COMPLAINT_REPORT_NOT_REVIEWABLE');
  select count(*) into n from public.approval_timeline('complaint_report', rid); assert n = 1, 'R7d: المسار';
  -- R8: تعطيل السلسلة ⇒ الاعتماد فوري مجدداً
  perform pg_temp.as_user(it); perform public.approval_chain_save('complaints_officer', 'complaint_report', '[{"kind":"hierarchy","role":"deputy_director"}]', false);
  perform pg_temp.as_user(co);
  insert into public.complaint_reports (report_date, sector, title, created_by) values ('2026-03-03', 'karrada', 'تقرير 3', co) returning id into rid2;
  perform public.complaint_attach_pptx(rid2, 'reports/' || rid2::text || '/complaints-v1.pptx');
  perform public.complaint_approve_report(rid2, 'reports/' || rid2::text || '/complaints-v1.pptx', true);
  select status, approved_by into r from public.complaint_reports where id = rid2; assert r.status = 'approved' and r.approved_by = co, 'R8';
  raise notice 'complaint report chain: OK';
end $$;
