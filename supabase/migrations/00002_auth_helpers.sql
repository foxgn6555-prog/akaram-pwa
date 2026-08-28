-- ═══════════════════════════════════════════════════════════════
-- 00002 · الدوال المساعدة للـ Auth و RLS
-- استراتيجية الأداء: كل policy تلف استدعاء helper بـ (select ...)
-- ليُحسَب مرة واحدة (InitPlan) بدل كل صف — نمط MakerKit للأداء.
-- ═══════════════════════════════════════════════════════════════

-- قراءة claim من JWT الحالي
create or replace function app.jwt_claim(claim text)
returns text
language sql stable
set search_path = ''
as $$
  select coalesce(nullif(auth.jwt() ->> claim, ''), null);
$$;

-- الدور الأساسي للمستخدم (يُحقن في JWT عند login — انظر 00003)
create or replace function app.current_role()
returns text
language sql stable
set search_path = ''
as $$
  select app.jwt_claim('role');
$$;

-- هل يملك المستخدم أحد الأدوار المطلوبة؟ (يقرأ user_roles وليس JWT فقط،
-- لأن المستخدم قد يملك أكثر من دور — بوابة PortalSelector)
-- ⚠️ plpgsql عمداً: جسده لا يُتحقق منه عند الإنشاء — يسمح بأن تُنشأ هذه الدالة
--    قبل جداولها (user_roles في 00003) في ترتيب المهاجرات.
create or replace function app.has_role(roles text[])
returns boolean
language plpgsql stable
security definer
set search_path = public, app
as $$
begin
  return exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = any (roles)
  );
end;
$$;

-- بيانات الموظف المرتبط بالمستخدم الحالي (plpgsql — انظر الملاحظة أعلاه؛ employees في 00005)
create or replace function app.current_employee_id()
returns uuid
language plpgsql stable
security definer
set search_path = public
as $$
begin
  return (
    select e.id
    from public.employees e
    where e.user_id = auth.uid()
    limit 1
  );
end;
$$;

-- قسم الموظف الحالي (لمديري الأقسام) (plpgsql — انظر الملاحظة أعلاه)
create or replace function app.current_department_id()
returns uuid
language plpgsql stable
security definer
set search_path = public
as $$
begin
  return (
    select e.department_id
    from public.employees e
    where e.user_id = auth.uid()
    limit 1
  );
end;
$$;

-- ═══ Trigger عام: تحديث updated_at تلقائياً ═══
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ═══ Trigger عام: رفع version تلقائياً (سياسة تعارض Offline — ADR 006) ═══
create or replace function app.bump_version()
returns trigger
language plpgsql
as $$
begin
  new.version = coalesce(old.version, 0) + 1;
  return new;
end;
$$;
