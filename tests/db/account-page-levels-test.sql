-- الجولة ٦ — سقف صلاحية الصفحة لكل حساب (20261120180000): معاملة كاملة تُرجَع في النهاية.
-- بادئة e6.
--   A) الافتراضي: لا سقف ⇒ full (لا تغيير على السلوك القائم)
--   B) level=view  ⇒ القراءة مسموحة، الإنشاء مرفوض في نقطة الربط الخادمية (guard_duplicate)
--   C) level=create⇒ الإنشاء مسموح، التعديل مرفوض
--   D) الإزالة    ⇒ عودة إلى full
--   E) الحساب المالي: level=view على الرواتب يمنع الاعتماد/التعديل ويُبقي العرض
--   F) IT لا يقيّدها السقف
--   G) الحراسة: غير IT · مستوى/وحدة غير صحيحة · حساب غير موجود · anon
--   H) التدقيق: كل ضبط يُسجَّل
--   I) السقف لا يمنح صلاحية: موظف عادي بحالة full على المالية يبقى مرفوضاً
--   J) it_account_levels يعيد stored/effective/accessible
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
  ('e6000000-0000-4000-8000-000000000001', 'e6-emp@t.iq'),
  ('e6000000-0000-4000-8000-000000000002', 'e6-hr@t.iq'),
  ('e6000000-0000-4000-8000-000000000003', 'e6-fin@t.iq'),
  ('e6000000-0000-4000-8000-000000000004', 'e6-it@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('e6000000-0000-4000-8000-000000000001', 'employee'),
  ('e6000000-0000-4000-8000-000000000002', 'hr_officer'),
  ('e6000000-0000-4000-8000-000000000003', 'finance_officer'),
  ('e6000000-0000-4000-8000-000000000004', 'it_admin')
on conflict do nothing;

-- ═══ A) الافتراضي full ═══
select pg_temp.as_user('e6000000-0000-4000-8000-000000000002');
do $$
begin
  if not app.can(auth.uid(), 'hr.employees', 'create') then raise exception 'A: بلا سقف يجب أن يُسمح بالإنشاء'; end if;
  if not app.can(auth.uid(), 'hr.employees', 'edit')   then raise exception 'A: بلا سقف يجب أن يُسمح بالتعديل'; end if;
  if app.account_level(auth.uid(), 'hr.employees') <> 'full' then raise exception 'A: السقف الافتراضي ليس full'; end if;
  -- نقطة الربط الخادمية الفعلية التي تناديها كل دوال الكتابة
  perform app.guard_duplicate('hr_employee_create', '{"seed":"a"}'::jsonb);
end $$;

-- ═══ B) view ⇒ عرض فقط ═══
select pg_temp.as_user('e6000000-0000-4000-8000-000000000004');
select public.it_account_level_set('e6000000-0000-4000-8000-000000000002', 'hr.employees', 'view');

select pg_temp.as_user('e6000000-0000-4000-8000-000000000002');
do $$
begin
  if not app.can(auth.uid(), 'hr.employees', 'view') then raise exception 'B: العرض يجب أن يبقى مسموحاً'; end if;
  if app.can(auth.uid(), 'hr.employees', 'create') then raise exception 'B: الإنشاء يجب أن يُمنع بسقف view'; end if;
  if not app.can(auth.uid(), 'hr.employees', 'export') then raise exception 'B: التصدير يتبع العرض'; end if;
end $$;
select pg_temp.expect_error($$select app.guard_duplicate('hr_employee_create', '{"seed":"b"}'::jsonb)$$, 'PERMISSION_DENIED');

-- ═══ C) create ⇒ إنشاء بلا تعديل ═══
select pg_temp.as_user('e6000000-0000-4000-8000-000000000004');
select public.it_account_level_set('e6000000-0000-4000-8000-000000000002', 'hr.employees', 'create');

select pg_temp.as_user('e6000000-0000-4000-8000-000000000002');
do $$
begin
  perform app.guard_duplicate('hr_employee_create', '{"seed":"c"}'::jsonb);
  if app.can(auth.uid(), 'hr.employees', 'edit') then raise exception 'C: التعديل يجب أن يُمنع بسقف create'; end if;
  if app.can(auth.uid(), 'hr.employees', 'delete') then raise exception 'C: الحذف يجب أن يُمنع بسقف create'; end if;
  if app.can(auth.uid(), 'hr.employees', 'execute') then raise exception 'C: التنفيذ يجب أن يُمنع بسقف create'; end if;
end $$;

-- ═══ D) الإزالة تعيد full ═══
select pg_temp.as_user('e6000000-0000-4000-8000-000000000004');
select public.it_account_level_clear('e6000000-0000-4000-8000-000000000002', 'hr.employees');

select pg_temp.as_user('e6000000-0000-4000-8000-000000000002');
do $$ begin
  if not app.can(auth.uid(), 'hr.employees', 'edit') then raise exception 'D: الإزالة يجب أن تعيد full'; end if;
end $$;

-- ═══ E) حساب مالي بسقف view ═══
select pg_temp.as_user('e6000000-0000-4000-8000-000000000004');
select public.it_account_level_set('e6000000-0000-4000-8000-000000000003', 'finance.payroll', 'view');

select pg_temp.as_user('e6000000-0000-4000-8000-000000000003');
do $$ begin
  if not app.can(auth.uid(), 'finance.payroll', 'view') then raise exception 'E: عرض الرواتب يجب أن يبقى مسموحاً'; end if;
  if app.can(auth.uid(), 'finance.payroll', 'edit') then raise exception 'E: تعديل الرواتب يجب أن يُمنع'; end if;
end $$;
select pg_temp.expect_error($$select app.guard_duplicate('finance_payroll_adjust', '{"seed":"e"}'::jsonb)$$, 'PERMISSION_DENIED');

-- ═══ F) IT لا يقيّدها السقف ═══
select pg_temp.as_user('e6000000-0000-4000-8000-000000000004');
select public.it_account_level_set('e6000000-0000-4000-8000-000000000004', 'it.permissions', 'view');
do $$
begin
  if not app.can(auth.uid(), 'it.permissions', 'edit') then raise exception 'F: IT يجب ألا تُقيَّد بالسقف'; end if;
  if app.account_level(auth.uid(), 'it.permissions') <> 'view' then raise exception 'F: السقف المخزَّن لم يُقرأ'; end if;
  perform app.guard_duplicate('it_deduction_exemption_add', '{"seed":"f"}'::jsonb);
end $$;

-- ═══ G) الحراسة ═══
select pg_temp.as_user('e6000000-0000-4000-8000-000000000001');
select pg_temp.expect_error(
  $$select public.it_account_level_set('e6000000-0000-4000-8000-000000000001', 'hr.employees', 'view')$$,
  'PERMISSION_DENIED');
select pg_temp.expect_error(
  $$select public.it_account_levels('e6000000-0000-4000-8000-000000000002')$$, 'PERMISSION_DENIED');

select pg_temp.as_user('e6000000-0000-4000-8000-000000000004');
select pg_temp.expect_error(
  $$select public.it_account_level_set('e6000000-0000-4000-8000-000000000002', 'hr.employees', 'bogus')$$,
  'INVALID_INPUT');
select pg_temp.expect_error(
  $$select public.it_account_level_set('e6000000-0000-4000-8000-000000000002', 'no.such.unit', 'view')$$,
  'INVALID_INPUT');
select pg_temp.expect_error(
  $$select public.it_account_level_set('e6000000-0000-4000-8000-0000000000ff', 'hr.employees', 'view')$$,
  'IT_USER_NOT_FOUND');

set local role anon;
select pg_temp.expect_error($$select public.it_account_levels('e6000000-0000-4000-8000-000000000002')$$, 'permission denied');
select pg_temp.expect_error($$select public.my_unit_levels()$$, 'permission denied');
reset role;

-- ═══ H) التدقيق ═══
do $$
declare n int;
begin
  select count(*) into n from public.permission_audit
   where kind in ('level_set', 'level_clear')
     and target_user in ('e6000000-0000-4000-8000-000000000002', 'e6000000-0000-4000-8000-000000000003', 'e6000000-0000-4000-8000-000000000004');
  if n < 5 then raise exception 'H: التدقيق يجب أن يسجّل كل ضبط، جاء %', n; end if;
  if exists (select 1 from public.permission_audit where kind = 'level_set' and actor_id is null) then
    raise exception 'H: فعل الضبط يجب أن يُنسب إلى منفّذه';
  end if;
end $$;

-- ═══ I) السقف لا يمنح صلاحية ═══
select pg_temp.as_user('e6000000-0000-4000-8000-000000000004');
select public.it_account_level_set('e6000000-0000-4000-8000-000000000001', 'finance.payroll', 'full');

select pg_temp.as_user('e6000000-0000-4000-8000-000000000001');
do $$ begin
  if app.can(auth.uid(), 'finance.payroll', 'view') then raise exception 'I: السقف منح وصولاً — وهذا ممنوع'; end if;
end $$;
select pg_temp.expect_error($$select app.guard_duplicate('finance_payroll_adjust', '{"seed":"i"}'::jsonb)$$, 'PERMISSION_DENIED');

-- ═══ J) قراءة الحالة لتقنية المعلومات ═══
select pg_temp.as_user('e6000000-0000-4000-8000-000000000004');
do $$
declare v jsonb; row_payroll jsonb; row_emp jsonb;
begin
  v := public.it_account_levels('e6000000-0000-4000-8000-000000000003');
  select x into row_payroll from jsonb_array_elements(v) x where x ->> 'unit_key' = 'finance.payroll';
  if row_payroll is null then raise exception 'J: وحدة الرواتب غير معروضة'; end if;
  if (row_payroll ->> 'stored') <> 'view' then raise exception 'J: stored يجب أن يكون view، جاء %', row_payroll ->> 'stored'; end if;
  if (row_payroll ->> 'accessible')::boolean is not true then raise exception 'J: الوحدة يجب أن تكون متاحة للحساب'; end if;

  v := public.it_account_levels('e6000000-0000-4000-8000-000000000001');
  select x into row_emp from jsonb_array_elements(v) x where x ->> 'unit_key' = 'finance.payroll';
  if (row_emp ->> 'accessible')::boolean is not false then raise exception 'J: موظف عادي يجب ألا يرى الرواتب'; end if;
  if (row_emp ->> 'effective') <> 'full' then raise exception 'J: effective الافتراضي full'; end if;
end $$;

do $$
declare v jsonb;
begin
  perform pg_temp.as_user('e6000000-0000-4000-8000-000000000003');
  v := public.my_unit_levels();
  if (v ->> 'finance.payroll') <> 'view' then raise exception 'J: my_unit_levels يجب أن يعكس السقف'; end if;
end $$;

rollback;
