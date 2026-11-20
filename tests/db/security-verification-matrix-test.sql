-- الجولة ٨ — مصفوفة التحقق الشاملة: تُثبت الوضع الأمني كاملاً في معاملة واحدة تُرجَع.
-- بادئة e8. كل بند مطالب به في وثيقة الصلاحيات (§3–§9) له تأكيد خادمي هنا.
begin;
set client_min_messages = notice;

create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('auth.user_id', p::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
end $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;

insert into auth.users (id, email) values
  ('e8000000-0000-4000-8000-000000000001', 'e8-plain@t.iq'),
  ('e8000000-0000-4000-8000-000000000002', 'e8-hr@t.iq'),
  ('e8000000-0000-4000-8000-000000000003', 'e8-it@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('e8000000-0000-4000-8000-000000000001', 'employee'),
  ('e8000000-0000-4000-8000-000000000002', 'hr_officer'),
  ('e8000000-0000-4000-8000-000000000003', 'it_admin')
on conflict do nothing;

-- ═══ M1 · §3/§8 — قائمة الأدوار التسعة الحساسة جدول قابل للتعديل، لا ثابت في الكود
do $$
declare n int; arr text[];
begin
  select count(*) into n from public.sensitive_roles;
  if n <> 9 then raise exception 'M1: يجب أن تكون الأدوار الحساسة ٩، جاء %', n; end if;

  select array_agg(role order by role) into arr from public.sensitive_roles where active;
  if arr <> array['admin_ops','deputy_director','executive_director','field_ops','finance_officer',
                  'it_admin','ops_room','ops_room_manager','super_admin'] then
    raise exception 'M1: القائمة لا تطابق المعتمد: %', arr;
  end if;

  -- قابلية التعديل: عمود active موجود (تعطيل بلا حذف)
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='sensitive_roles' and column_name='active') then
    raise exception 'M1: الجدول يجب أن يبقى قابلاً للتعديل (active)';
  end if;
end $$;

-- ═══ M2 · §3 — المستخدم العادي لا يمنح ولا يسحب أي دور (ولو دوراً عادياً)
select pg_temp.as_user('e8000000-0000-4000-8000-000000000001');
select pg_temp.expect_error(
  $$select public.set_user_role('e8000000-0000-4000-8000-000000000001', 'it_admin', true)$$, 'USERS_FORBIDDEN');
select pg_temp.expect_error(
  $$select public.set_user_role('e8000000-0000-4000-8000-000000000001', 'employee', false)$$, 'USERS_FORBIDDEN');

-- ═══ M3 · §3/«كل المنح حصراً لتقنية المعلومات» — مسؤول الموارد البشرية ممنوع أيضاً
select pg_temp.as_user('e8000000-0000-4000-8000-000000000002');
select pg_temp.expect_error(
  $$select public.set_user_role('e8000000-0000-4000-8000-000000000001', 'hr_officer', true)$$, 'USERS_FORBIDDEN');

-- ═══ M4 · تقنية المعلومات تمرّ من البوابة (لا USERS_FORBIDDEN) — الحساس يحتاج اعتماداً
select pg_temp.as_user('e8000000-0000-4000-8000-000000000003');
do $$
declare msg text;
begin
  begin
    perform public.set_user_role('e8000000-0000-4000-8000-000000000001', 'employee', true);
  exception when others then
    if sqlerrm like '%USERS_FORBIDDEN%' then raise exception 'M4: IT يجب ألا تُمنع من البوابة'; end if;
  end;
end $$;

-- ═══ M5 · §5 — الدعم الفني: الموظف ينشئ تذكرة ولا يقرأ صندوق IT
select pg_temp.as_user('e8000000-0000-4000-8000-000000000001');
do $$
declare v jsonb;
begin
  v := public.support_ticket_create('طلب تحقق شامل', 'هذه تذكرة من حزمة التحقق الآلية.');
  if (v ->> 'ticket_number')::bigint < 1 then raise exception 'M5: رقم التذكرة غير صحيح'; end if;
  if public.support_contact() is null then raise exception 'M5: رقم الدعم غير معاد'; end if;
end $$;
select pg_temp.expect_error($$select * from public.support_tickets_list()$$, 'PERMISSION_DENIED');

select pg_temp.as_user('e8000000-0000-4000-8000-000000000003');
do $$ begin
  if (select count(*) from public.support_tickets_list()) < 1 then raise exception 'M5: IT يجب أن ترى التذاكر'; end if;
end $$;

-- ═══ M6 · §6/§7 — الجلسات: إدارة أي حساب لتقنية المعلومات فقط
select pg_temp.as_user('e8000000-0000-4000-8000-000000000001');
select pg_temp.expect_error(
  $$select * from public.admin_session_list('e8000000-0000-4000-8000-000000000002')$$, 'PERMISSION_DENIED');
-- رمز الموافقة: harmless للحساب نفسه، لكنه يُخزَّن مجزَّأً ولا يُنشأ بلا جلسة
do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='device_switch_codes' and column_name='code') then
    raise exception 'M6: الرمز يجب أن يُخزَّن مجزَّأً (code_hash) لا نصاً';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='device_switch_codes' and column_name='code_hash') then
    raise exception 'M6: عمود code_hash مفقود';
  end if;
end $$;

-- ═══ M7 · §9 — سقف الصفحة يمنع الكتابة فعلياً عند نقطة الربط الخادمية
select pg_temp.as_user('e8000000-0000-4000-8000-000000000003');
select public.it_account_level_set('e8000000-0000-4000-8000-000000000002', 'hr.employees', 'view');

select pg_temp.as_user('e8000000-0000-4000-8000-000000000002');
do $$ begin
  if not app.can(auth.uid(), 'hr.employees', 'view') then raise exception 'M7: العرض يجب أن يبقى'; end if;
  if app.can(auth.uid(), 'hr.employees', 'create') then raise exception 'M7: الإنشاء يجب أن يُمنع'; end if;
end $$;
select pg_temp.expect_error($$select app.guard_duplicate('hr_employee_create', '{"m":"7"}'::jsonb)$$, 'PERMISSION_DENIED');

-- ═══ M8 · §8 — اللوحة الأمنية والمراقبة لتقنية المعلومات فقط
select pg_temp.expect_error($$select * from public.it_security_timeline()$$, 'PERMISSION_DENIED');
select pg_temp.expect_error($$select public.it_security_overview()$$, 'PERMISSION_DENIED');
select pg_temp.expect_error($$select * from public.security_events_list()$$, 'PERMISSION_DENIED');
select pg_temp.expect_error($$select * from public.session_policy_list()$$, 'PERMISSION_DENIED');
select pg_temp.expect_error($$select * from public.it_account_levels('e8000000-0000-4000-8000-000000000002')$$, 'PERMISSION_DENIED');

-- ═══ M9 · لا تجاوز عبر الـ API: لا جدول حساس مقروء/مكتوب مباشرة، ولا دالة داخلية مكشوفة
do $$
declare t text; c text; v_priv text;
begin
  foreach t in array array['security_events','permission_audit','account_page_levels','support_tickets',
                            'account_session_policy','role_grant_requests','device_switch_codes','sensitive_roles']
  loop
    if not (select relrowsecurity from pg_class where oid = format('public.%I', t)::regclass) then
      raise exception 'M9: RLS غير مفعّل على %', t;
    end if;
    if has_table_privilege('anon', format('public.%I', t), 'SELECT') then
      raise exception 'M9: anon يقرأ %', t;
    end if;
    -- لا كتابة مباشرة من العميل على أي جدول أمني (الكتابة عبر دوال security definer فقط)
    foreach v_priv in array array['INSERT','UPDATE','DELETE'] loop
      if has_table_privilege('authenticated', format('public.%I', t), v_priv) then
        raise exception 'M9: authenticated يملك % على %', v_priv, t;
      end if;
    end loop;
    -- أي قراءة باقية للمصادقين يجب أن تكون محكومة بسياسة RLS صريحة
    if has_table_privilege('authenticated', format('public.%I', t), 'SELECT')
       and not exists (select 1 from pg_policies where schemaname='public' and tablename=t and cmd in ('SELECT','ALL')) then
      raise exception 'M9: قراءة % بلا سياسة RLS', t;
    end if;
  end loop;

  -- لا دالة داخلية للجلسات مكشوفة للمستخدمين
  foreach c in array array['session_gate_check','session_switch_apply','session_revoke_new',
                            'device_switch_code_verify','session_is_sensitive'] loop
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname='public' and p.proname = c
                  and (has_function_privilege('authenticated', p.oid, 'execute')
                       or has_function_privilege('anon', p.oid, 'execute'))) then
      raise exception 'M9: الدالة الداخلية % مكشوفة', c;
    end if;
  end loop;

  -- كاتب الأحداث الأمنية: service_role فقط
  if has_function_privilege('authenticated',
       'public.security_event_record(text,text,uuid,text,uuid,text,inet,text,jsonb)', 'execute') then
    raise exception 'M9: authenticated يستطيع كتابة الأحداث الأمنية مباشرة';
  end if;
  if has_function_privilege('anon',
       'public.security_event_record(text,text,uuid,text,uuid,text,inet,text,jsonb)', 'execute') then
    raise exception 'M9: anon يستطيع كتابة الأحداث الأمنية';
  end if;
  if not has_function_privilege('service_role',
       'public.security_event_record(text,text,uuid,text,uuid,text,inet,text,jsonb)', 'execute') then
    raise exception 'M9: service_role يجب أن يكتب الأحداث (staff-login)';
  end if;

  -- لا دالة إدارية قابلة للتنفيذ من anon
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname ~ '^(security_|session_|device_switch|role_grant|it_account|it_security|support_ticket|admin_session)'
       and has_function_privilege('anon', p.oid, 'execute')
  ) then
    raise exception 'M9: توجد دالة أمنية مكشوفة لـ anon';
  end if;
end $$;

-- ═══ M10 · §8 — لا ادّعاء دقة الموقع: لا عمود إحداثيات، والبلد اختياري
do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='security_events'
                and column_name in ('latitude','longitude','lat','lng','accuracy')) then
    raise exception 'M10: يجب ألا تُخزَّن إحداثيات GPS في سجل الأحداث';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='security_events' and column_name='country') then
    raise exception 'M10: عمود البلد التقريبي مفقود';
  end if;
end $$;

-- ═══ M11 · §10 — التدقيق قائم: كل ضبط سقف/دور يُسجَّل
do $$
declare n int;
begin
  select count(*) into n from public.permission_audit where kind = 'level_set';
  if n < 1 then raise exception 'M11: ضبط السقف لم يُدوَّن'; end if;
  if not exists (select 1 from public.permission_audit where kind = 'level_set' and actor_id is not null) then
    raise exception 'M11: التدقيق بلا فاعل';
  end if;
end $$;

rollback;
