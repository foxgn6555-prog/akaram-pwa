-- 20261120140000 — منح الأدوار وسحبها حصراً لتقنية المعلومات (تتميم الجولة ٢)
--
-- قرار المستخدم (2026-11-20): «كل المنح يبقى حصراً لتقنية المعلومات».
-- قبل هذه الترحيلة كان لموظف الموارد البشرية (hr_officer) أن يمنح ويسحب الأدوار غير الحساسة
-- مباشرةً عبر app.set_user_role. بعدها:
--   · الفاعل المسموح = it_admin فقط.
--   · المسار المعتمَد داخلياً (app.role_grant_approved='on') يبقى يعمل — وهو ما تستخدمه
--     دالة role_grant_decide عند اعتماد المدير المفوض، فلا تتأثر سلسلة الموافقات.
--   · حجب الأدوار الحساسة (ROLE_SENSITIVE_FORBIDDEN) يبقى قائماً كطبقة دفاع ثانية.
--
-- ما لا تغيّره: لا مفهوم موافقات جديد، لا تغيير في role_grant_decide، ولا في الأدوار
-- الممنوحة حالياً، ولا في خدمة admin-users (فاعلها دائماً حساب تقنية معلومات).
-- التراجع: إعادة النص السابق للبوابة (إضافة شرط hr_officer) من 20261120130000.

-- ⓪ فحص مسبق
do $pre$
declare v_def text;
begin
  v_def := pg_get_functiondef('app.set_user_role(uuid,text,boolean,uuid)'::regprocedure);
  if to_regprocedure('app.is_sensitive_role(text)') is null then
    raise exception 'IT_ONLY_GRANTS_PRECHECK: نفّذ 20261120130000 أولاً';
  end if;
  if position('role = ''hr_officer''' in v_def) = 0 then
    raise exception 'IT_ONLY_GRANTS_PRECHECK: شرط الموارد البشرية غير موجود — الترقيع مطبَّق سابقاً؟';
  end if;
end $pre$;

-- ① تضييق البوابة إلى تقنية المعلومات وحدها
do $patch$
declare
  v_def text;
  v_old text := '  if not v_is_it and coalesce(current_setting(''app.role_grant_approved'', true), '''') <> ''on'' and not exists (select 1 from public.user_roles where user_id = v_actor and role = ''hr_officer'') then' || chr(10) ||
                '    raise exception ''USERS_FORBIDDEN: لا تملك صلاحية تعديل الأدوار'';';
  v_new text := '  -- منح الأدوار وسحبها حصراً لتقنية المعلومات (تتميم الجولة ٢)' || chr(10) ||
                '  -- المسار المعتمَد داخلياً (role_grant_approved) يبقى نافذاً لسلسلة الموافقات' || chr(10) ||
                '  if not v_is_it and coalesce(current_setting(''app.role_grant_approved'', true), '''') <> ''on'' then' || chr(10) ||
                '    raise exception ''USERS_FORBIDDEN: منح الأدوار وسحبها حصراً لتقنية المعلومات'';';
begin
  v_def := pg_get_functiondef('app.set_user_role(uuid,text,boolean,uuid)'::regprocedure);
  if (length(v_def) - length(replace(v_def, v_old, ''))) <> length(v_old) then
    raise exception 'IT_ONLY_GRANTS_PRECHECK: مرساة البوابة غير موجودة مرة واحدة بالضبط';
  end if;
  v_def := replace(v_def, v_old, v_new);
  execute v_def;
end $patch$;

-- ② فحص ذاتي: لا أثر لشرط الموارد البشرية، والمسار المعتمَد باقٍ
do $check$
declare v_def text;
begin
  v_def := pg_get_functiondef('app.set_user_role(uuid,text,boolean,uuid)'::regprocedure);
  -- ملاحظة: 'hr_officer' يبقى في قائمة الأدوار الصالحة (دور يُمنح) — الممنوع هو شرط الفاعل
  if position('role = ''hr_officer'')' in v_def) > 0 then
    raise exception 'IT_ONLY_GRANTS_CHECK: ما زال شرط الموارد البشرية في بوابة الفاعل';
  end if;
  if position('app.role_grant_approved' in v_def) = 0 then
    raise exception 'IT_ONLY_GRANTS_CHECK: المسار المعتمَد فُقد — ستتعطل الموافقات';
  end if;
  if position('app.is_sensitive_role(p_role)' in v_def) = 0 then
    raise exception 'IT_ONLY_GRANTS_CHECK: حارس الأدوار الحساسة فُقد';
  end if;
end $check$;
