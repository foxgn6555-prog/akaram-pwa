-- ═══════════════════════════════════════════════════════════════
-- 00019 · الهيكل التنظيمي من البوابة التقنية
-- الطلب: إنشاء الهيكل التنظيمي يتم من بوابة IT (لا HR فقط)
-- الحل: توسيع سياسة إدارة الأقسام لتشمل it_admin
-- ═══════════════════════════════════════════════════════════════

drop policy if exists "departments: إدارة بواسطة HR" on public.departments;

create policy "departments: إدارة بواسطة HR أو IT" on public.departments
  for all to authenticated
  using      (app.has_role(array['hr_officer', 'super_admin', 'it_admin']))
  with check (app.has_role(array['hr_officer', 'super_admin', 'it_admin']));

comment on policy "departments: إدارة بواسطة HR أو IT" on public.departments is
  'الهيكل التنظيمي يُدار من بوابة الموارد البشرية والبوابة التقنية';
