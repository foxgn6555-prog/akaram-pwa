-- 00406 — إضافة الدور الجديد «مدير غرفة العمليات» إلى دالتين مركزيتين كانتا لا تعرفانه
--
-- العيب (مؤكَّد بتعريف الدالتين في قاعدة الإنتاج):
--   (١) app.approval_role_label لا تعرف 'ops_room_manager' ⇒ يظهر المفتاح الخام بالإنجليزية
--       في سجل الموافقات وصفحات العرض بدل «مدير غرفة العمليات».
--   (٢) app.current_role() (مصفوفة أولوية ١٧ دورًا) لا تعرف الدور ⇒ لصاحب الدور وحده
--       ترجع 'authenticated' ⇒ سطر التدقيق يسجّل صلاحية القاعدة بدل الدور الوظيفي
--       (نفس صنف V-44 المُصلَح في الجولة 22، لكن الدور أُضيف بعده في 00400).
--
-- لماذا هذا آمن:
--   · صفر سياسة RLS تعتمد على app.current_role() (تم التحقق: 0 صف في pg_policies).
--   · الترتيب في current_role() = أولوية العرض فقط؛ الدور الجديد يُضاف في آخر المصفوفة
--     فلا يتغيّر ناتج أي مستخدم قائم يملك أدوارًا أخرى (it_admin/super_admin/ops_room… أولًا).
--   · لا تغيير في has_role() ولا في أي منح/سحب صلاحية.

-- (١) التسمية العربية
create or replace function app.approval_role_label(p_role text)
returns text
language sql
immutable
as $function$
  select case p_role
    when 'department' then 'موظفو القسم'
    when 'employee' then 'متعهد' when 'department_manager' then 'مسؤول قسم' when 'admin_ops' then 'مسؤول قاطع' when 'field_ops' then 'العمليات الميدانية'
    when 'maintenance' then 'الصيانة' when 'central_garage_officer' then 'الكراج المركزي' when 'transfer_station' then 'المحطة التحويلية'
    when 'ops_room' then 'غرفة العمليات' when 'hr_officer' then 'الموارد البشرية' when 'finance_officer' then 'المالية' when 'it_admin' then 'التطوير المركزية'
    when 'deputy_director' then 'معاون المدير المفوض' when 'executive_director' then 'المدير التنفيذي' when 'super_admin' then 'المدير المفوض'
    when 'media_officer' then 'مسؤول الإعلام' when 'complaints_officer' then 'مسؤول الشكاوى' when 'disclosures_officer' then 'مسؤول الكشوفات' when 'follow_up' then 'المتابعة'
    when 'ops_room_manager' then 'مدير غرفة العمليات'
    else coalesce(p_role, '—') end
$function$;

-- (٢) الدور الوظيفي لسطر التدقيق — الدور الجديد آخر المصفوفة (أولوية دنيا كما يجب)
create or replace function app."current_role"()
returns text
language sql
stable security definer
set search_path to 'public', 'app'
as $function$
  select coalesce(
    (
      select t.r
      from unnest(array['it_admin','super_admin','executive_director','deputy_director','ops_room','finance_officer','hr_officer','admin_ops','field_ops','follow_up','maintenance','transfer_station','complaints_officer','media_officer','central_garage_officer','department_manager','employee','ops_room_manager']) with ordinality as t(r, i)
      where exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role::text = t.r)
      order by t.i
      limit 1
    ),
    app.jwt_claim('role')
  );
$function$;

-- لا تغيير في المنح: صلاحيات التنفيذ الحالية (anon/authenticated/service_role) تبقى كما هي
