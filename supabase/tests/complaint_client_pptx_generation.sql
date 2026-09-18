-- توليد PowerPoint داخل المتصفح: رفع الملف بدور الموظف وربط المسار يعيد التقرير لقيد التدقيق.
begin;
do $$
declare
  officer uuid := '10000000-0000-0000-0000-000000000081';
  stranger uuid := '10000000-0000-0000-0000-000000000082';
  message_id uuid; complaint_id uuid; template_id uuid; report_id uuid;
  path text; rejected boolean := false;
begin
  insert into auth.users(id,email) values(officer,'pptx-officer@akram.iq'),(stranger,'pptx-stranger@akram.iq');
  insert into public.user_roles(user_id,role) values(officer,'complaints_officer');
  insert into public.complaint_inbox_messages(internet_message_id,sender_email,subject,source_sector,received_at,import_status)
    values('client-pptx-mail','sender@test.iq','بريد اختبار توليد pptx','karrada','2026-09-18 07:00+00','ready') returning id into message_id;
  insert into public.complaints(inbox_message_id,sector,status,created_by,sender_email,received_at)
    values(message_id,'karrada','under_review',officer,'sender@test.iq','2026-09-18 07:00+00') returning id into complaint_id;
  insert into public.complaint_items(complaint_id,sequence_no,title,status)
    values(complaint_id,1,'تراكم نفايات','approved');

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claim.sub',officer::text,true);
  select public.complaint_save_template(null,'قالب pptx',null,'karrada','{"accent":"#cf63c6"}',true,true) into template_id;

  -- الموظف يستطيع رفع ملف التقرير المولد داخل المتصفح إلى مجلد reports/
  insert into storage.objects(bucket_id,name)
    values('complaint-media','reports/00000000-0000-0000-0000-000000000001/complaints-karrada-2026-09-18-test.pptx');

  -- الغريب لا يستطيع الرفع إلى مجلد تقارير الشكاوى
  perform set_config('request.jwt.claim.sub',stranger::text,true);
  begin
    insert into storage.objects(bucket_id,name)
      values('complaint-media','reports/00000000-0000-0000-0000-000000000002/complaints-karrada-2026-09-18-nope.pptx');
  exception when others then
    rejected := true;
  end;
  if not rejected then raise exception 'STRANGER_UPLOAD_ACCEPTED'; end if;
  perform set_config('request.jwt.claim.sub',officer::text,true);

  -- ربط المسار ينقل المسودة إلى قيد التدقيق
  select public.complaint_prepare_email_report(message_id,template_id) into report_id;
  path := 'reports/' || report_id || '/complaints-karrada-2026-09-18-generation.pptx';
  perform public.complaint_attach_pptx(report_id,path);
  if (select status from public.complaint_reports where id=report_id)<>'quality_review' then raise exception 'STATUS_NOT_QUALITY_REVIEW'; end if;
  if (select pptx_path from public.complaint_reports where id=report_id)<>path then raise exception 'PATH_NOT_ATTACHED'; end if;

  -- بعد الاعتماد، إعادة التوليد تعيد التقرير إلى قيد التدقيق وتمسح آثار الاعتماد
  perform public.complaint_approve_report(report_id, path, true);
  if (select status from public.complaint_reports where id=report_id)<>'approved' then raise exception 'APPROVAL_FAILED'; end if;
  path := 'reports/' || report_id || '/complaints-karrada-2026-09-18-regeneration.pptx';
  perform public.complaint_attach_pptx(report_id,path);
  if (select status from public.complaint_reports where id=report_id)<>'quality_review' then raise exception 'STATUS_NOT_RESET'; end if;
  if (select approved_by from public.complaint_reports where id=report_id) is not null then raise exception 'APPROVAL_NOT_CLEARED'; end if;
  if (select pptx_path from public.complaint_reports where id=report_id)<>path then raise exception 'REGENERATED_PATH_NOT_ATTACHED'; end if;

  -- مسار خارج نمط تقارير الشكاوى يُرفض
  rejected := false;
  begin
    perform public.complaint_attach_pptx(report_id,'item/evil.png');
  exception when others then
    rejected := position('COMPLAINT_PPTX_PATH_INVALID' in sqlerrm)>0;
  end;
  if not rejected then raise exception 'INVALID_PATH_ACCEPTED'; end if;

  -- الغريب يُمنع من ربط مسار بتقرير
  perform set_config('request.jwt.claim.sub',stranger::text,true);
  rejected := false;
  begin
    perform public.complaint_attach_pptx(report_id,path);
  exception when others then
    rejected := position('COMPLAINT_FORBIDDEN' in sqlerrm)>0;
  end;
  if not rejected then raise exception 'STRANGER_ATTACH_ALLOWED'; end if;

  reset role;
  raise notice '✅ رفع ملف pptx للموظف فقط + ربط المسار يعيد قيد التدقيق + رفض المسارات والغرباء';
end $$;
rollback;
