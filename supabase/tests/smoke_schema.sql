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
    'app_errors', 'complaint_inbox_messages', 'complaints', 'complaint_items',
    'complaint_media', 'complaint_status_history', 'complaint_sender_rules',
    'complaint_email_deliveries', 'complaint_email_events', 'complaint_templates',
    'complaint_reports', 'complaint_report_items', 'complaint_contacts', 'complaint_settings'
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
                 where n.nspname = 'app' and p.proname = 'set_employee_profile') then
    raise exception 'SMOKE FAIL — set_employee_profile مفقود (00036)';
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
    'list_platform_users', 'set_user_role', 'db_stats', 'db_overview', 'db_table_details',
    'set_employee_profile', 'complaint_review_item', 'complaint_prepare_daily_report',
    'complaint_approve_report', 'complaint_dashboard_summary'
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

  -- 6) الدور الجديد قابل للتخزين (قيد CHECK النهائي يشمل complaints_officer)
  begin
    insert into auth.users (id, email)
    values ('00000000-0000-0000-0000-000000000046', 'smoke-complaints@akram.iq');
    insert into public.user_roles (user_id, role)
    values ('00000000-0000-0000-0000-000000000046', 'complaints_officer');
  exception when others then
    raise exception 'SMOKE FAIL — دور complaints_officer غير قابل للإسناد: %', sqlerrm;
  end;
  delete from public.user_roles where user_id = '00000000-0000-0000-0000-000000000046';
  delete from auth.users where id = '00000000-0000-0000-0000-000000000046';

  -- 7) Buckets الأربعة موجودة
  if (select count(*) from storage.buckets
      where id in ('employee-documents', 'payroll', 'avatars', 'complaint-media')) <> 4 then
    raise exception 'SMOKE FAIL — buckets غير مكتملة';
  end if;

  if (select count(*) from pg_trigger where tgname like 'trg_no_delete_complaint%') < 6 then
    raise exception 'SMOKE FAIL — حواجز منع الحذف الفيزيائي غير مكتملة';
  end if;
  if not exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='complaint_email_deliveries' and column_name='report_id') then
    raise exception 'SMOKE FAIL — ربط delivery بالتقرير مفقود';
  end if;

  raise notice 'SMOKE OK — RLS كامل · % سياسة · دوال البوابة التقنية + أمن الدخول · triggers مثبتة · 4 buckets', policies_count;
end $$;
