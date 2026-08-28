-- ═══════════════════════════════════════════════════════════════
-- 00015 · Buckets + سياسات Storage
-- اتفاقية المسارات: {bucket}/{employee_id}/{...} — تعتمد عليها السياسات أدناه
-- ═══════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('employee-documents', 'employee-documents', false, 10485760,
   array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']),
  ('payroll', 'payroll', false, 5242880, array['application/pdf']),
  ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- ── employee-documents: مالك المجلد أو HR ──
create policy "storage-docs: قراءة مجلدي" on storage.objects
  for select to authenticated
  using (bucket_id = 'employee-documents'
         and ((storage.foldername(name))[1] = (select app.current_employee_id())::text
              or (app.has_role(array['hr_officer', 'super_admin']))));

create policy "storage-docs: رفع إلى مجلدي" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'employee-documents'
              and ((storage.foldername(name))[1] = (select app.current_employee_id())::text
                   or (app.has_role(array['hr_officer', 'super_admin']))));

create policy "storage-docs: حذف بواسطة HR" on storage.objects
  for delete to authenticated
  using (bucket_id = 'employee-documents'
         and (app.has_role(array['hr_officer', 'super_admin'])));

-- ── payroll: HR / Finance كتابة · الموظف يقرأ مجلده ──
create policy "storage-payroll: قراءة قسائمي" on storage.objects
  for select to authenticated
  using (bucket_id = 'payroll'
         and ((storage.foldername(name))[1] = (select app.current_employee_id())::text
              or (app.has_role(array['hr_officer', 'finance_officer', 'super_admin']))));

create policy "storage-payroll: كتابة بواسطة الإدارات" on storage.objects
  for all to authenticated
  using      (bucket_id = 'payroll'
              and (app.has_role(array['hr_officer', 'finance_officer', 'super_admin'])))
  with check (bucket_id = 'payroll'
              and (app.has_role(array['hr_officer', 'finance_officer', 'super_admin'])));

-- ── avatars: عام القراءة · الكتابة لمجلد الموظف نفسه ──
create policy "storage-avatars: قراءة عامة" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars');

create policy "storage-avatars: رفع صورتنا" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars'
              and (storage.foldername(name))[1] = (select app.current_employee_id())::text);

create policy "storage-avatars: تحديث صورتنا" on storage.objects
  for update to authenticated
  using      (bucket_id = 'avatars'
              and (storage.foldername(name))[1] = (select app.current_employee_id())::text)
  with check (bucket_id = 'avatars'
              and (storage.foldername(name))[1] = (select app.current_employee_id())::text);
