-- سلامة القالب الافتراضي وعدم مسح المسودة عند تكرار الإنشاء.
begin;
do $$
declare
  officer uuid := '10000000-0000-0000-0000-000000000067';
  message_id uuid; complaint_id uuid; item_id uuid;
  first_template uuid; second_template uuid; wrong_template uuid;
  first_report uuid; second_report uuid; rejected boolean := false;
begin
  insert into auth.users(id,email) values(officer,'template-safety@akram.iq');
  insert into public.user_roles(user_id,role) values(officer,'complaints_officer');
  insert into public.complaint_inbox_messages(internet_message_id,sender_email,subject,source_sector,received_at,import_status)
    values('template-safe-mail','sender@test.iq','بريد اختبار القالب','karrada','2026-09-07 07:00+00','ready') returning id into message_id;
  insert into public.complaints(inbox_message_id,sector,status,created_by,sender_email,received_at)
    values(message_id,'karrada','under_review',officer,'sender@test.iq','2026-09-07 07:00+00') returning id into complaint_id;
  insert into public.complaint_items(complaint_id,sequence_no,title,status)
    values(complaint_id,1,'تراكم نفايات','approved') returning id into item_id;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claim.sub',officer::text,true);

  select public.complaint_save_template(null,'قالب أول',null,'karrada','{"accent":"#111111"}',true,true) into first_template;
  select public.complaint_save_template(null,'قالب ثان',null,'karrada','{"accent":"#222222"}',true,true) into second_template;
  if (select is_default from public.complaint_templates where id=first_template) then raise exception 'OLD_DEFAULT_NOT_CLEARED'; end if;
  if not (select is_default from public.complaint_templates where id=second_template) then raise exception 'NEW_DEFAULT_NOT_SET'; end if;
  if (select count(*) from public.complaint_templates where sector='karrada' and is_default)<>1 then raise exception 'MULTIPLE_SCOPE_DEFAULTS'; end if;

  select public.complaint_save_template(null,'قالب زعفرانية',null,'zaafaraniya','{}',false,true) into wrong_template;
  begin
    perform public.complaint_prepare_daily_report('karrada','2026-09-07',wrong_template);
  exception when others then
    rejected := position('COMPLAINT_TEMPLATE_SECTOR_MISMATCH' in sqlerrm)>0;
  end;
  if not rejected then raise exception 'MISMATCHED_TEMPLATE_ACCEPTED'; end if;

  select public.complaint_prepare_email_report(message_id,second_template) into first_report;
  update public.complaint_reports set title='عنوان مخصص محفوظ',layout='{"accent":"#abcdef"}' where id=first_report;
  select public.complaint_prepare_email_report(message_id,first_template) into second_report;
  if first_report<>second_report then raise exception 'DUPLICATE_REPORT_CREATED'; end if;
  if (select title from public.complaint_reports where id=first_report)<>'عنوان مخصص محفوظ' then raise exception 'EXISTING_DRAFT_RESET'; end if;
  if (select layout->>'accent' from public.complaint_reports where id=first_report)<>'#abcdef' then raise exception 'EXISTING_LAYOUT_RESET'; end if;

  reset role;
  raise notice '✅ قالب افتراضي ذري + توافق القاطع + المسودة المتكررة لا تمسح التصميم';
end $$;
rollback;
