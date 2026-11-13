-- 00415 — تقليص إسنادات anon_exec (البند ⑨ من فحص ما قبل الإطلاق)
--
-- الوضع قبل: 664 دالة يستطيع دور `anon` تنفيذها، منها 310 في مخطط `app`.
-- سببها: الامتياز الافتراضي في PostgreSQL يمنح EXECUTE إلى PUBLIC عند إنشاء الدالة،
-- و`anon` يرثه — لا لأن أحدًا منحها بقصد.
--
-- لماذا `app` أولًا (أضيق خطوة آمنة):
--   · مخطط `app` **غير مكشوف** في PostgREST (تحقّقنا: كل نداء عليه يعيد 404)،
--     فلا يمكن لأي زائر استدعاء دالة منه عبر الشبكة أصلًا.
--   · دوال `public` تستدعي `app.*` وهي SECURITY DEFINER (تعمل بامتياز المالك) ⇒ لا تحتاج منحًا للزائر.
--   · الدالة الوحيدة التي يحتاجها الزائر فعليًا هي `app.citizen_token_valid`
--     لأن سياسات تخزين صور الشكاوى (bucket citizen-complaints) تعمل بدور anon ⇒ تُمنح صراحةً.
--
-- ⚠️ لماذا `GRANT ... TO authenticated` إلزامي: 313 سياسة RLS تستدعي دوال `app.*`،
-- وسياسات RLS تُنفَّذ بامتيازات الدور المستعلِم ⇒ سحب PUBLIC بلا منح بديل يكسر كل البوابات.
--
-- لا يُغيَّر أي تعريف دالة ولا أي سياسة ولا أي بيانات — امتيازات تنفيذ فقط.

begin;

revoke execute on all functions in schema app from public, anon;

grant execute on all functions in schema app to authenticated;
grant execute on all functions in schema app to service_role;

-- الاستثناء الوحيد: سياسة تخزين صور الشكاوى للمواطن (بلا حساب)
grant execute on function app.citizen_token_valid(text) to anon;

-- الدوال التي تُنشأ مستقبلًا في app ترث القاعدة نفسها (لا تعود الثغرة بالنسيان)
alter default privileges in schema app revoke execute on functions from public;
alter default privileges in schema app grant execute on functions to authenticated;
alter default privileges in schema app grant execute on functions to service_role;

commit;

-- تحقّق بعد التنفيذ:
--   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'app' and has_function_privilege('anon', p.oid, 'EXECUTE');  -- يجب أن يكون 1
