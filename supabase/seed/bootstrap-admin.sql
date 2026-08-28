-- ═══════════════════════════════════════════════════════════════
-- إنشاء أول مدير نظام — يُنفَّذ مرة واحدة بعد أول db:push
-- ① أنشئ المستخدم من: Dashboard → Authentication → Users → Add user
--    (البريد + كلمة مرور + ✅ Auto Confirm User)
-- ② غيّر البريد في السطر التالي ليطابق، ثم شغّل الكود كله في SQL Editor
-- ═══════════════════════════════════════════════════════════════

do $$
declare
  v_email text := 'admin@akram.iq';   -- ← عدّل هنا فقط
  v_uid uuid;
begin
  select id into v_uid from auth.users where email = v_email;
  if v_uid is null then
    raise exception '❌ المستخدم غير موجود — أنشئه أولاً من Authentication → Users';
  end if;

  -- الدور الأعلى
  insert into public.user_roles (user_id, role)
  values (v_uid, 'super_admin')
  on conflict (user_id, role) do nothing;

  -- سجل موظف مرتبط (رقم 000 خاص بمدير النظام)
  insert into public.employees (user_id, employee_number, full_name, job_title)
  select v_uid, 'EMP-000', 'مدير النظام', 'مدير النظام'
  where not exists (select 1 from public.employees where user_id = v_uid);

  raise notice '✅ جاهز — سجل الدخول من التطبيق بالبريد: %', v_email;
end $$;
