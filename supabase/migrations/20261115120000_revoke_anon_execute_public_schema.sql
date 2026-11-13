-- 00416 — تقليص إسنادات anon_exec: مخطط public (البند ⑨-ب من فحص ما قبل الإطلاق)
--
-- الوضع قبل: 354 دالة في مخطط public يستطيع دور `anon` تنفيذها.
-- سببها: الامتياز الافتراضي في PostgreSQL يمنح EXECUTE إلى PUBLIC عند إنشاء الدالة،
-- و`anon` يرثه — لا لأن أحدًا منحها بقصد.
--
-- ماذا نسحب وماذا نستثني (قائمة بيضاء):
--   · نسثني دوال `citizen_*` (13 دالة، كلها SECURITY DEFINER) — يستدعيها الزائر
--     مباشرة من بوابة المواطن عبر PostgREST (الدخول، رفع شكوى، المحادثة، التقييم).
--     سحب EXECUTE منها يكسر بوابة المواطن كلها.
--   · نسحب EXECUTE من كل دوال public الأخرى، منها:
--       - دوال الامتدادات (pg_trgm / pgstattuple: gin_*, gtrgm_*, similarity*, pgstattuple...):
--         دوال بحث/إحصاء قياسية لا تكشف بيانات تطبيقية، والزائر لا يستعمل البحث النصي.
--       - دوال التطبيق الخاصة (ts_vehicle_kinds_list, vehicle_categories_list, ops_*, mgr_*, ...):
--         فحصنا src: ts_vehicle_kinds_list و vehicle_categories_list يُستدعيان فقط من
--         بوابة محطة النقل وغرفة العمليات (دور داخلي مسجل)، لا من واجهة الزائر.
--
-- ⚠️ لماذا GRANT ... TO authenticated إلزامي:
--   · لا توجد سياسة RLS في أي مخطط تستدعي دوال public غير SECURITY DEFINER
--     (تحقّقنا: pg_policy polqual/polwithcheck — 0 نتائج)، لكن دوال secdef في public
--     تُستدعى من الواجهة بواسطة الأدوار المسجّلة ⇒ يجب أن يحتفظوا بـEXECUTE.
--   · المنح البديل يحافظ على عمل كل البوابات الداخلية.
--
-- لا يُغيَّر أي تعريف دالة ولا أي سياسة ولا أي بيانات — امتيازات تنفيذ فقط.

begin;

revoke execute on all functions in schema public from public, anon;

grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema public to service_role;

-- القائمة البيضاء للزوار: دوال بوابة المواطن (الزائر بلا حساب يناديها مباشرة)
grant execute on function public.citizen_portal_info() to anon;
grant execute on function public.citizen_sign_in(text, text) to anon;
grant execute on function public.citizen_complaint_submit(uuid, text, text, double precision, double precision, text, text[]) to anon;
grant execute on function public.citizen_my_complaints(uuid) to anon;
grant execute on function public.citizen_complaint_rate(uuid, uuid, integer) to anon;
grant execute on function public.citizen_complaint_add_note(uuid, text) to anon;
grant execute on function public.citizen_complaint_set_status(uuid, text, text) to anon;
grant execute on function public.citizen_chat_request(uuid) to anon;
grant execute on function public.citizen_chat_state(uuid, bigint) to anon;
grant execute on function public.citizen_chat_send(uuid, text, text) to anon;
grant execute on function public.citizen_chat_close(uuid) to anon;
grant execute on function public.citizen_chat_rate(uuid, uuid, integer, text) to anon;
grant execute on function public.citizen_complaints_report(date, date) to anon;

-- الدوال التي تُنشأ مستقبلًا في public ترث القاعدة نفسها (لا تعود الثغرة بالنسيان)
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public grant execute on functions to authenticated;
alter default privileges in schema public grant execute on functions to service_role;

commit;

-- تحقّق بعد التنفيذ:
--   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE');
--   يجب أن يكون 13 (دوال citizen_* فقط).
--   دوال authenticated يجب أن تبقى 912 (كل دوال public).
