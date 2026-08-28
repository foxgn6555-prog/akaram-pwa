-- ═══ إنشاء المستخدم الإداري الأول ═══
-- إنشاء auth.users يتطلب صلاحيات service_role — لا يمكن عبر seed SQL العادي.
-- الطريقة المعتمدة (اختر واحدة):
--   1) Supabase Studio (localhost:54323) → Authentication → Add user
--   2) CLI: supabase admin create-user? — أو Admin API عبر سكربت tsx
-- ثم: insert into public.user_roles (user_id, role) values ('<uuid>', 'super_admin');
-- وتعديل employee مرتبط به. التفاصيل في docs/onboarding.md.
select 1; -- placeholder
