-- ═══ أدوار البذور ═══
-- الأدوار تُعطى لكل مستخدم داخل user_roles بعد إنشاء حسابه من بوابة HR.
-- الترتيب أدناه هو أولوية الدور الأساسي في JWT (انظر 00003):
--   super_admin > it_admin > finance_officer > hr_officer > department_manager > employee
--
-- مثال (بعد إنشاء المستخدم في Studio أو عبر Admin API):
--   insert into public.user_roles (user_id, role)
--   values ('<auth-user-uuid>', 'super_admin');
select 1; -- placeholder — البذور الفعلية تعتمد على مستخدمين موجودين
