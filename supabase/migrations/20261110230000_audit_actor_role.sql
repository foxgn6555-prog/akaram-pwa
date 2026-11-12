-- ④-51 / V-44 — دور الفاعل في سجل التدقيق: من «صلاحية القاعدة» إلى «الدور الوظيفي»
-- العيب: app.current_role() كانت تُرجع claim‏ `role` من JWT، وهي في Supabase قيمة صلاحية القاعدة
--        (`authenticated`) لا الدور الوظيفي. النتيجة: 3080 سطر تدقيق بـ `authenticated`
--        مقابل 7 أسطر فقط بدور وظيفي حقيقي (من أصل 8953).
-- الإصلاح: القراءة من public.user_roles بترتيب أولوية مطابق لـ ROLE_PRIORITY في الواجهة،
--          مع الرجوع إلى claim القديم عند عدم وجود دور (service_role / edge / بلا دور).
-- الأمان: 0 سياسة RLS تعتمد على هذه الدالة (تحقّق) — 22 دالة تستخدمها كلها لكتابة حقل actor_role.
--        security definer لازمة حتى يقرأ الكاتبُ أدوارَه ولو منعته RLS.

create or replace function app.current_role()
returns text
language sql
stable
security definer
set search_path = public, app
as $$
  select coalesce(
    (
      select t.r
      from unnest(array[
        'it_admin', 'super_admin', 'executive_director', 'deputy_director', 'ops_room',
        'finance_officer', 'hr_officer', 'admin_ops', 'field_ops', 'follow_up',
        'maintenance', 'transfer_station', 'complaints_officer', 'media_officer',
        'central_garage_officer', 'department_manager', 'employee'
      ]) with ordinality as t(r, i)
      where exists (
        select 1 from public.user_roles ur
        where ur.user_id = auth.uid() and ur.role::text = t.r
      )
      order by t.i
      limit 1
    ),
    app.jwt_claim('role')
  );
$$;

comment on function app.current_role() is
  'V-44: الدور الوظيفي للفاعل (من user_roles بترتيب الأولوية)، وليس صلاحية القاعدة. رجوع إلى JWT role عند غياب الدور.';

-- تحقّق بعد التطبيق (لا يغيّر شيئاً): التعريف الجديد + عيّنة أدوار حقيقية
select position('user_roles' in pg_get_functiondef(p.oid)) > 0 as reads_user_roles,
       position('security definer' in lower(pg_get_functiondef(p.oid))) > 0 as is_secdef
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'app' and p.proname = 'current_role';
