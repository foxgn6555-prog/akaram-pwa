-- V-34 — حماية «آخر مسؤول» لبوابات: التطوير · المدير المفوض · المالية · معاون المدير المفوض
--
-- السبب: بعد إلغاء استثناء «كل البوابات» (V-32) صار الوصول بالدور حصراً؛ وسحب دور
-- آخر حساب يحمله يُغلق البوابة نهائياً بلا أي طريق للعودة من الواجهة.
-- الحماية موجودة أصلاً لـ it_admin؛ هذا الامتداد يجعلها قاعدة عامة للأدوار الحساسة الأربعة.
--
-- التنفيذ: إضافة كتلة حماية داخل app.set_user_role قبل تنفيذ المنح/السحب، بلا أي تغيير آخر
-- في الدالة (اختيار الدور، التحقق من المندوب، التدقيق actor_role — كلها كما هي).
--
-- الأثر: محاولة سحب دور حساس من آخر حامليه ⇒ استثناء LAST_ROLE_HOLDER.
-- لا يمسّ المسار الموافَق عليه لتصفير المنصة (platform_reset_execute له مساره المستقل).

do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('app.set_user_role(uuid,text,boolean,uuid)'::regprocedure);
  if position('LAST_ROLE_HOLDER' in v_def) > 0 then
    raise notice 'V-34 already applied';
    return;
  end if;
  v_def := replace(v_def, chr(10) || '  if p_grant then', chr(10) ||
    '  -- V-34: حماية آخر مسؤول لكل بوابة حساسة' || chr(10) ||
    '  if not p_grant and p_role in (''super_admin'',''finance_officer'',''deputy_director'') then' || chr(10) ||
    '    perform pg_advisory_xact_lock(hashtext(''user_roles:last_'' || p_role)::bigint);' || chr(10) ||
    '    if exists (select 1 from public.user_roles where user_id = p_user_id and role = p_role)' || chr(10) ||
    '       and (select count(*) from public.user_roles where role = p_role) <= 1 then' || chr(10) ||
    '      raise exception ''LAST_ROLE_HOLDER: لا يمكن سحب دور % من آخر حساب مسؤول (البوابة تُغلق نهائياً)'', p_role;' || chr(10) ||
    '    end if;' || chr(10) ||
    '  end if;' || chr(10) ||
    '  if p_grant then');
  execute v_def;
end $$;
