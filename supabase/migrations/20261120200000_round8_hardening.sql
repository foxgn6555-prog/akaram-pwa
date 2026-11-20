-- 20261120200000_round8_hardening.sql — تصليب نهائي (الجولة ٨: التحقق الشامل)
--
-- ما وجدته مصفوفة التحقق: أربعة جداول في عائلة الصلاحيات تحمل منح DML كاملة لـ anon وauthenticated
-- من إنشاء الجداول القديمة (00023/00294)، بينما الكتابة عليها لا تحدث إلا عبر دوال security definer:
--   · permission_audit            — قراءة IT فقط (سياسة SELECT)، ولا سياسة كتابة
--   · role_grant_requests         — قراءة IT/المدير المفوض أو صاحب الطلب، ولا سياسة كتابة
--   · user_permission_overrides   — قراءة IT أو صاحبها، ولا سياسة كتابة
--   · user_permission_template    — قراءة IT أو صاحبها، ولا سياسة كتابة
--
-- RLS كان يمنع الكتابة فعلياً (لا سياسة ⇒ رفض)، لكن الصلاحية الجدولية تبقى باباً زائداً:
-- أي سياسة تُضاف لاحقاً بالخطأ تفتح الكتابة فوراً. هذه الترحيلة تسحب الصلاحيات غير المستخدمة،
-- وتُبقي فقط ما تعتمد عليه الواجهة فعلاً (SELECT المحكوم بـ RLS).
--
-- لا تغيير في السلوك: الواجهة تقرأ عبر RLS وتكتب عبر دوال محروسة.
-- التراجع: grant select, insert, update, delete على الجداول الأربعة لـ anon, authenticated.

-- ⓪ فحص مسبق: الجداول موجودة وRLS مفعّل (وإلا لا معنى للسحب)
do $pre$
declare t text;
begin
  foreach t in array array['permission_audit', 'role_grant_requests', 'user_permission_overrides', 'user_permission_template']
  loop
    if to_regclass('public.' || t) is null then
      raise exception 'HARDENING_PRECHECK: الجدول % غير موجود', t;
    end if;
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception 'HARDENING_PRECHECK: RLS غير مفعّل على % — أوقف وأصلح السبب', t;
    end if;
  end loop;
end $pre$;

-- ① سحب شامل ثم إعادة القراءة فقط
--    (revoke all في PostgreSQL 17 يشمل صلاحية MAINTAIN الجديدة أيضاً؛ وفي 16 لا يضر)
revoke all
  on public.permission_audit, public.role_grant_requests,
     public.user_permission_overrides, public.user_permission_template
  from anon, authenticated;

-- ② القراءة للمصادقين وحدها، محكومة بسياسات RLS القائمة (IT / صاحب الحساب)
grant select
  on public.permission_audit, public.role_grant_requests,
     public.user_permission_overrides, public.user_permission_template
  to authenticated;

-- ③ القراءة للمصادقين تبقى محكومة بسياساتها القائمة (IT / صاحب الحساب) — لا تُلمس.

-- ④ فحص ذاتي
do $check$
declare t text; v_priv text;
begin
  foreach t in array array['permission_audit', 'role_grant_requests', 'user_permission_overrides', 'user_permission_template']
  loop
    foreach v_priv in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege('authenticated', 'public.' || t, v_priv) then
        raise exception 'HARDENING_CHECK: authenticated ما زال يملك % على %', v_priv, t;
      end if;
    end loop;
    if has_table_privilege('anon', 'public.' || t, 'SELECT') then
      raise exception 'HARDENING_CHECK: anon ما زال يقرأ %', t;
    end if;
  end loop;

  -- القراءة المحكومة بـ RLS باقية للمصادقين (الواجهة تعتمد عليها)
  if not has_table_privilege('authenticated', 'public.permission_audit', 'SELECT') then
    raise exception 'HARDENING_CHECK: سحبت قراءة المصادقين — سيتعطل تدقيق الصلاحيات';
  end if;
end $check$;
