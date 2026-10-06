-- 00180 · قاعدة بيانات الشكاوى (بادئة cd): الأعمدة، الشفت، منجز/متأخر، المرفقات، تأكيد الاستلام، الصلاحيات، الإعدادات
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
insert into auth.users (id, email) values
  ('cd000000-0000-0000-0000-00000000000a', 'cd-comp@t.iq'), ('cd000000-0000-0000-0000-00000000000b', 'cd-mgr@t.iq'), ('cd000000-0000-0000-0000-00000000000c', 'cd-emp@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('cd000000-0000-0000-0000-00000000000a', 'complaints_officer'), ('cd000000-0000-0000-0000-00000000000b', 'department_manager'), ('cd000000-0000-0000-0000-00000000000c', 'employee')
on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date) values
  ('cd000000-0000-0000-0000-0000000000e1', 'cd000000-0000-0000-0000-00000000000b', 'CD-MGR', 'مهدي قاسم', '2024-01-01') on conflict (employee_number) do nothing;
insert into public.manager_profiles (user_id, shift, sectors) values ('cd000000-0000-0000-0000-00000000000b', 'morning', array[3]::smallint[]) on conflict (user_id) do update set sectors = excluded.sectors;
insert into public.complaint_inbox_messages (id, internet_message_id, sender_email, sender_name, source_sector, received_at, import_status) values
  ('cd000000-0000-0000-0000-0000000000a1', '<cd-1@t>', 'ishraf@baghdad.iq', 'لجنة الاشراف', 'karrada', '2026-02-05 06:24:00+00', 'imported') on conflict (id) do nothing;
-- شكوى صباحية (09:24 بغداد) ببريد، عنصران: الأول منجز خلال 5 ساعات، الثاني قيد المعالجة قديم → متأخر
insert into public.complaints (id, inbox_message_id, reference_no, sector, municipal_center, source, sender_email, received_at, status) values
  ('cd000000-0000-0000-0000-0000000000c1', 'cd000000-0000-0000-0000-0000000000a1', 'CMP-CD-1', 'karrada', 'الرياض', 'email', 'ishraf@baghdad.iq', '2026-02-05 06:24:00+00', 'in_progress')
on conflict (id) do nothing;
insert into public.complaint_items (id, complaint_id, sequence_no, title, municipal_center, neighborhood, alley, assigned_to, status, processed_at, reviewed_at) values
  ('cd000000-0000-0000-0000-00000000001a', 'cd000000-0000-0000-0000-0000000000c1', 1, 'تراكم النفايات', 'الرياض', '908', '5', 'cd000000-0000-0000-0000-00000000000b', 'approved', '2026-02-05 10:00:00+00', '2026-02-05 11:24:00+00'),
  ('cd000000-0000-0000-0000-00000000001b', 'cd000000-0000-0000-0000-0000000000c1', 2, 'تراكم النفايات', 'الرياض', '908', 'شارع مأمون', null, 'under_review', null, null)
on conflict (id) do nothing;
insert into public.complaint_media (inbox_message_id, item_id, media_kind, storage_path, mime_type) values
  ('cd000000-0000-0000-0000-0000000000a1', 'cd000000-0000-0000-0000-00000000001a', 'email_attachment', 'cd/1a-before.jpg', 'image/jpeg'),
  (null, 'cd000000-0000-0000-0000-00000000001a', 'after', 'cd/1a-after.jpg', 'image/jpeg')
on conflict do nothing;
-- شكوى مسائية يدوية في الزعفرانية (16:10 بغداد) منجزة متأخرة (بعد 30 ساعة)
insert into public.complaints (id, reference_no, sector, municipal_center, source, received_at, status) values
  ('cd000000-0000-0000-0000-0000000000c2', 'CMP-CD-2', 'zaafaraniya', 'الزعفرانية', 'manual', '2026-02-06 13:10:00+00', 'processed') on conflict (id) do nothing;
insert into public.complaint_items (id, complaint_id, sequence_no, title, neighborhood, location_text, status, processed_at, reviewed_at) values
  ('cd000000-0000-0000-0000-00000000002a', 'cd000000-0000-0000-0000-0000000000c2', 1, 'ردم حفرة', '101', 'قرب الجامع', 'approved', '2026-02-07 18:00:00+00', '2026-02-07 19:10:00+00') on conflict (id) do nothing;
-- تقرير مُرسل يشمل العنصر الأول → تأكيد الاستلام نعم
insert into public.complaint_reports (id, report_date, sector, title, status, created_by, sent_at) values
  ('cd000000-0000-0000-0000-0000000000f1', '2026-02-05', 'karrada', 'تقرير 5 شباط', 'sent', 'cd000000-0000-0000-0000-00000000000a', now()) on conflict (id) do nothing;
insert into public.complaint_report_items (report_id, item_id, display_order, included) values ('cd000000-0000-0000-0000-0000000000f1', 'cd000000-0000-0000-0000-00000000001a', 1, true) on conflict do nothing;

-- ═══ C1 · الأعمدة والقيم المشتقة ═══
select auth.set_test_user('cd000000-0000-0000-0000-00000000000a');
do $$ declare r record; n int; begin
  select count(*) into n from public.complaint_database_rows('2026-02-01', '2026-02-28', null);
  assert n = 3, 'C1 rows: ' || n;
  select * into r from public.complaint_database_rows('2026-02-01', '2026-02-28', 'karrada') where item_id = 'cd000000-0000-0000-0000-00000000001a';
  assert r.received_date = '2026-02-05' and r.received_time = '09:24' and r.sender_name = 'لجنة الاشراف' and r.municipal_center = 'الواثق' and r.sector = 'الكرادة'
     and r.shift = 'الصباحية' and r.neighborhood = '908' and r.street = '5' and r.delay_type = 'تراكم النفايات' and r.source = 'البريد الإلكتروني'
     and r.handler_name = 'مهدي قاسم' and r.completion = 'منجز' and r.hours_to_complete = 5.0 and r.attachments = 'صور' and r.ack_confirmed, 'C1 row1: ' || row_to_json(r)::text;
  select * into r from public.complaint_database_rows('2026-02-01', '2026-02-28', 'karrada') where item_id = 'cd000000-0000-0000-0000-00000000001b';
  assert r.completion = 'متأخر' and r.handler_name is null and r.municipal_center = 'الرياض' and r.attachments = 'بلا مرفقات' and not r.ack_confirmed and r.street = 'شارع مأمون', 'C1 row2: ' || row_to_json(r)::text;
  select * into r from public.complaint_database_rows('2026-02-01', '2026-02-28', 'zaafaraniya');
  assert r.shift = 'المسائية' and r.source = 'إدخال يدوي' and r.sender_name = 'لجنة الاشراف' and r.completion = 'منجز متأخر' and r.hours_to_complete = 30.0 and r.street = 'قرب الجامع' and r.sector = 'الزعفرانية', 'C1 row3: ' || row_to_json(r)::text;
  raise notice 'C1 ✅ الأعمدة الأربعة عشر مشتقة بدقة';
end $$;

-- ═══ C2 · الإعدادات: حدّ الشفت 09:00 يجعل 09:24 مسائية؛ مهلة 48 ساعة تجعل «منجز متأخر» منجزاً ═══
reset role; select set_config('auth.user_id','', false);
update public.complaint_settings set value = '{"shiftCutoff":"09:00","lateHours":48}' where key = 'database';
select auth.set_test_user('cd000000-0000-0000-0000-00000000000a');
do $$ declare r record; begin
  select * into r from public.complaint_database_rows('2026-02-01', '2026-02-28', 'karrada') where item_id = 'cd000000-0000-0000-0000-00000000001a';
  assert r.shift = 'المسائية', 'C2 cutoff';
  select * into r from public.complaint_database_rows('2026-02-01', '2026-02-28', 'zaafaraniya');
  assert r.completion = 'منجز', 'C2 late hours';
  raise notice 'C2 ✅ الإعدادات تؤثر فوراً';
end $$;
reset role; select set_config('auth.user_id','', false);
update public.complaint_settings set value = '{"shiftCutoff":"14:00","lateHours":24}' where key = 'database';

-- ═══ C3 · الصلاحيات والمدخلات ═══
select auth.set_test_user('cd000000-0000-0000-0000-00000000000c');
do $$ declare ok boolean := false; begin
  begin perform * from public.complaint_database_rows('2026-02-01', '2026-02-28', null); exception when others then ok := sqlerrm like '%COMPLAINT_DATABASE_FORBIDDEN%'; end;
  assert ok, 'C3 employee forbidden';
end $$;
select auth.set_test_user('cd000000-0000-0000-0000-00000000000a');
do $$ declare ok boolean := false; begin
  begin perform * from public.complaint_database_rows('2026-02-28', '2026-02-01', null); exception when others then ok := sqlerrm like '%RANGE_INVALID%'; end;
  assert ok, 'C3 range';
  ok := false;
  begin perform * from public.complaint_database_rows('2026-02-01', '2026-02-28', 'x'); exception when others then ok := sqlerrm like '%SECTOR_INVALID%'; end;
  assert ok, 'C3 sector';
  raise notice 'C3 ✅ الصلاحيات والمدخلات محمية';
end $$;
reset role; select set_config('auth.user_id','', false);
