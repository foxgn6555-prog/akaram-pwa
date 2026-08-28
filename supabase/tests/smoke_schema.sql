-- ═══════════════════════════════════════════════════════════════
-- اختبار الدخان بعد `supabase db reset` (قاعدة فارغة → كل المهاجرات)
-- التشغيل: bash scripts/test-migrations-empty.sh
-- الفشل = RAISE EXCEPTION → nonzero exit
-- ═══════════════════════════════════════════════════════════════

do $$
declare
  t text;
  rls_missing text := '';
  expected_tables text[] := array[
    'user_roles', 'departments', 'employees', 'requests', 'notifications',
    'documents', 'payrolls', 'payslips', 'attendance_records',
    'budget_allocations', 'it_tickets', 'it_assets', 'audit_logs', 'login_attempts',
    'app_errors'
  ];
  missing text := '';
  policies_count integer;
begin

  -- 1) كل الجداول الـ 14 موجودة
  foreach t in array expected_tables loop
    if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = t) then
      missing := missing || ' ' || t;
    end if;
  end loop;
  if missing <> '' then
    raise exception 'SMOKE FAIL — جداول مفقودة:%', missing;
  end if;

  -- 2) RLS مفعّل على كل جدول (قاعدة أمنية صارمة)
  foreach t in array expected_tables loop
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and c.relrowsecurity = true
    ) then
      rls_missing := rls_missing || ' ' || t;
    end if;
  end loop;
  if rls_missing <> '' then
    raise exception 'SMOKE FAIL — جداول بلا RLS:%', rls_missing;
  end if;

  -- 3) عدد السياسات ≥ 50 (العد الفعلي عند اكتمال المرحلة: 51 — مقيس على PostgreSQL حقيقي)
  select count(*) into policies_count from pg_policies where schemaname = 'public';
  if policies_count < 50 then
    raise exception 'SMOKE FAIL — سياسات RLS قليلة جداً: %', policies_count;
  end if;

  -- 4) الدوال الحرجة موجودة
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'app' and p.proname = 'custom_access_token_hook') then
    raise exception 'SMOKE FAIL — custom_access_token_hook مفقود';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'app' and p.proname = 'is_login_locked') then
    raise exception 'SMOKE FAIL — is_login_locked مفقود';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'app' and p.proname = 'validate_request_transition') then
    raise exception 'SMOKE FAIL — validate_request_transition مفقود';
  end if;

  -- 4-ب) دوال البوابة التقنية في app (المصدر)
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'app' and p.proname = 'list_platform_users') then
    raise exception 'SMOKE FAIL — list_platform_users مفقود';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'app' and p.proname = 'set_user_role') then
    raise exception 'SMOKE FAIL — set_user_role مفقود';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'app' and p.proname = 'db_stats') then
    raise exception 'SMOKE FAIL — db_stats مفقود';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'app' and p.proname = 'db_overview') then
    raise exception 'SMOKE FAIL — db_overview مفقود';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'app' and p.proname = 'db_table_details') then
    raise exception 'SMOKE FAIL — db_table_details مفقود';
  end if;

  -- 4-ج) دوال أمن الدخول (00016)
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'app' and p.proname = 'record_login_attempt') then
    raise exception 'SMOKE FAIL — record_login_attempt مفقود';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'app' and p.proname = 'login_lock_remaining_seconds') then
    raise exception 'SMOKE FAIL — login_lock_remaining_seconds مفقود';
  end if;

  -- 4-د) أغلفة RPC في public — من يمنع خطأ 404 من PostgREST (00021)
  for t in select unnest(array[
    'record_login_attempt', 'is_login_locked', 'login_lock_remaining_seconds',
    'list_platform_users', 'set_user_role', 'db_stats', 'db_overview', 'db_table_details'
  ]) loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = t) then
      raise exception 'SMOKE FAIL — public.% مفقود (سينتج 404 في التطبيق!)', t;
    end if;
  end loop;
  raise notice 'SMOKE — أغلفة RPC الثمانية موجودة في public ✓';

  -- 5) الـ Triggers الحرجة مثبتة
  if not exists (select 1 from pg_trigger where tgname = 'trg_requests_workflow') then
    raise exception 'SMOKE FAIL — trg_requests_workflow غير مثبت';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_requests_notify') then
    raise exception 'SMOKE FAIL — trg_requests_notify غير مثبت';
  end if;
  if (select count(*) from pg_trigger where tgname like 'trg_audit_%') < 8 then
    raise exception 'SMOKE FAIL — audit triggers غير مكتملة';
  end if;

  -- 6) Buckets الثلاثة موجودة
  if (select count(*) from storage.buckets
      where id in ('employee-documents', 'payroll', 'avatars')) <> 3 then
    raise exception 'SMOKE FAIL — buckets غير مكتملة';
  end if;

  raise notice 'SMOKE OK — 15 جدولاً · RLS كامل · % سياسة · دوال البوابة التقنية + أمن الدخول · triggers مثبتة · 3 buckets', policies_count;
end $$;
