-- 00306 · تدقيق الأمان (RLS): مسح آلي لكل جداول public ودوال security definer وسياسات القراءة.
--   (1) maintenance_workshops كان الجدول الوحيد بلا RLS ⇒ أي حامل لمفتاح anon يقرأ/يعدّل/يحذف الورش مباشرة عبر REST. الآن RLS: قراءة للمصادَقين، والكتابة عبر الدوال فقط.
--   (2) user_page_overrides (القيود الفردية على الصفحات لكل المستخدمين) كان مقروءاً لكل المصادَقين؛ الآن: المستخدم يرى قيوده فقط، وIT/مدير النظام يرون الكل.
--   (3) اختبار يضمن مستقبلاً: لا جدول في public بلا RLS.

alter table public.maintenance_workshops enable row level security;
drop policy if exists "maintenance_workshops: read" on public.maintenance_workshops;
create policy "maintenance_workshops: read" on public.maintenance_workshops for select to authenticated using (true);
revoke all on public.maintenance_workshops from anon;

drop policy if exists "upo: قراءة للمصادقين" on public.user_page_overrides;
create policy "upo: قراءة قيودي أو IT" on public.user_page_overrides for select to authenticated
  using (user_id = auth.uid() or app.has_role(array['it_admin', 'super_admin']));
