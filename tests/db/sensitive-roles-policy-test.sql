-- الجولة ٢ — جدول الأدوار الحساسة القابل للتعديل (20261120130000): معاملة كاملة تُرجَع في النهاية.
-- بادئة b9. لا تترك أدواراً ولا طلبات ولا تعديلات على sensitive_roles.
--   A) الزرع: تسعة أدوار نشطة · الحارس صحيح للأدوار الأخرى
--   B) المستخدم العادي لا يطلب دوراً حسّاساً — حتى لو كان hr_officer (ROLE_SENSITIVE_FORBIDDEN)
--   C) تقنية المعلومات تطلب ⇒ طلب معلّق + مهمة موافقة للمدير المفوض + الدور لم يُمنح
--   D) اعتماد المدير المفوض ⇒ يُمنح الدور ويُغلق الطلب
--   E) الأدوار غير الحساسة كما كانت: منح مباشر بلا طلب
--   F) تعديل الجدول يغيّر السلوك فوراً (تعطيل ⇒ منح مباشر، تفعيل ⇒ حجب)
--   G) حراسة sensitive_role_set: IT فقط · لا تعطيل لـ it_admin/super_admin · رفض دور مجهول · تدقيق
--   H) القراءة: IT يرى القائمة، غيره ممنوع، والجدول نفسه غير مقروء مباشرة
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

-- ═══ بيانات: تقنية · مدير مفوض · موارد بشرية · موظف · هدف ═══
insert into auth.users (id, email) values
  ('b9000000-0000-4000-8000-000000000001', 'b9-it@t.iq'),
  ('b9000000-0000-4000-8000-000000000002', 'b9-md@t.iq'),
  ('b9000000-0000-4000-8000-000000000003', 'b9-hr@t.iq'),
  ('b9000000-0000-4000-8000-000000000004', 'b9-emp@t.iq'),
  ('b9000000-0000-4000-8000-000000000005', 'b9-target@t.iq')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  ('b9000000-0000-4000-8000-000000000001', 'it_admin'),
  ('b9000000-0000-4000-8000-000000000002', 'super_admin'),
  ('b9000000-0000-4000-8000-000000000003', 'hr_officer'),
  ('b9000000-0000-4000-8000-000000000004', 'employee'),
  ('b9000000-0000-4000-8000-000000000005', 'employee')
on conflict do nothing;

-- ═══ A) الزرع والحارس ═══
do $$
declare n int; r record;
begin
  select count(*) into n from public.sensitive_roles where active;
  if n <> 9 then raise exception 'A: يجب أن تكون الأدوار الحساسة النشطة 9، جاء %', n; end if;
  for r in select unnest(array['super_admin','executive_director','deputy_director','finance_officer',
                               'admin_ops','field_ops','it_admin','ops_room_manager','ops_room']) as role loop
    if not app.is_sensitive_role(r.role) then raise exception 'A: الدور % يجب أن يكون حسّاساً', r.role; end if;
  end loop;
  for r in select unnest(array['employee','hr_officer','department_manager','maintenance','transfer_station']) as role loop
    if app.is_sensitive_role(r.role) then raise exception 'A: الدور % يجب ألا يكون حسّاساً', r.role; end if;
  end loop;
  if app.is_sensitive_role(null) then raise exception 'A: null ليس دوراً حسّاساً'; end if;
end $$;

-- ═══ B) المستخدم العادي لا يطلب دوراً حسّاساً ═══
select pg_temp.as_user('b9000000-0000-4000-8000-000000000004');
select pg_temp.expect_error(
  $$select public.set_user_role('b9000000-0000-4000-8000-000000000005', 'ops_room', true)$$, 'USERS_FORBIDDEN');

-- 20261120140000: المنح حصراً لتقنية المعلومات ⇒ الموارد البشرية تُرفض من بوابة الفاعل نفسها
select pg_temp.as_user('b9000000-0000-4000-8000-000000000003');
select pg_temp.expect_error(
  $$select public.set_user_role('b9000000-0000-4000-8000-000000000005', 'finance_officer', true)$$, 'USERS_FORBIDDEN');
select pg_temp.expect_error(
  $$select public.set_user_role('b9000000-0000-4000-8000-000000000005', 'ops_room_manager', true)$$, 'USERS_FORBIDDEN');
-- وحتى الدور غير الحساس ممنوع على الموارد البشرية بعد التضييق
select pg_temp.expect_error(
  $$select public.set_user_role('b9000000-0000-4000-8000-000000000005', 'follow_up', true)$$, 'USERS_FORBIDDEN');

do $$ begin
  if (select count(*) from public.role_grant_requests) <> 0 then
    raise exception 'B: أُنشئ طلب رغم منع المستخدم العادي';
  end if;
  if exists (select 1 from public.user_roles where user_id = 'b9000000-0000-4000-8000-000000000005' and role = 'ops_room') then
    raise exception 'B: مُنح الدور رغم المنع';
  end if;
end $$;

-- ═══ C) تقنية المعلومات تطلب ⇒ طلب معلّق بلا تنفيذ ═══
select pg_temp.as_user('b9000000-0000-4000-8000-000000000001');
select public.set_user_role('b9000000-0000-4000-8000-000000000005', 'ops_room', true);

do $$
declare q record; t record;
begin
  select * into q from public.role_grant_requests where target_user = 'b9000000-0000-4000-8000-000000000005' and role = 'ops_room';
  if q.id is null or q.status <> 'pending' then raise exception 'C: لم يُنشأ طلب معلّق'; end if;
  if q.requested_by <> 'b9000000-0000-4000-8000-000000000001' then raise exception 'C: الطالب غير صحيح'; end if;
  if exists (select 1 from public.user_roles where user_id = q.target_user and role = 'ops_room') then
    raise exception 'C: مُنح الدور قبل الموافقة';
  end if;
  select * into t from public.approval_tasks where request_kind = 'role_grant' and request_id = q.id;
  if t.id is null then raise exception 'C: لم تُنشأ مهمة موافقة'; end if;
  if not ('b9000000-0000-4000-8000-000000000002' = any (t.approvers)) then
    raise exception 'C: المعتمِد يجب أن يكون المدير المفوض';
  end if;
end $$;

-- ═══ D) اعتماد المدير المفوض ═══
select pg_temp.as_user('b9000000-0000-4000-8000-000000000002');
select public.role_grant_decide(
  (select id from public.role_grant_requests where target_user = 'b9000000-0000-4000-8000-000000000005' and role = 'ops_room'),
  true, 'موافقة اختبار');

do $$
declare q record;
begin
  if not exists (select 1 from public.user_roles where user_id = 'b9000000-0000-4000-8000-000000000005' and role = 'ops_room') then
    raise exception 'D: لم يُمنح الدور بعد الموافقة';
  end if;
  select * into q from public.role_grant_requests where target_user = 'b9000000-0000-4000-8000-000000000005' and role = 'ops_room';
  if q.status <> 'approved' then raise exception 'D: حالة الطلب يجب أن تكون approved، جاء %', q.status; end if;
  if q.decided_by <> 'b9000000-0000-4000-8000-000000000002' then raise exception 'D: المعتمِد غير مسجّل'; end if;
end $$;

-- ═══ E) الأدوار غير الحساسة: منح مباشر من تقنية المعلومات (بلا طلب) ═══
select pg_temp.as_user('b9000000-0000-4000-8000-000000000001');   -- تقنية المعلومات
select public.set_user_role('b9000000-0000-4000-8000-000000000005', 'follow_up', true);

do $$ begin
  if not exists (select 1 from public.user_roles where user_id = 'b9000000-0000-4000-8000-000000000005' and role = 'follow_up') then
    raise exception 'E: منح الدور غير الحساس لم ينجح';
  end if;
  if exists (select 1 from public.role_grant_requests where role = 'follow_up') then
    raise exception 'E: أُنشئ طلب لدور غير حساس';
  end if;
end $$;

-- ═══ F) تعديل الجدول يغيّر السلوك فوراً ═══
select pg_temp.as_user('b9000000-0000-4000-8000-000000000001');   -- تقنية المعلومات

-- قبل التعطيل: طلب IT على الدور الحسّاس يبقى معلّقاً بلا منح
select pg_temp.as_user('b9000000-0000-4000-8000-000000000001');
select public.set_user_role('b9000000-0000-4000-8000-000000000005', 'field_ops', true);
do $$ begin
  if exists (select 1 from public.user_roles where user_id = 'b9000000-0000-4000-8000-000000000005' and role = 'field_ops') then
    raise exception 'F: مُنح الدور الحسّاس قبل الموافقة';
  end if;
  if not exists (select 1 from public.role_grant_requests where role = 'field_ops' and status = 'pending') then
    raise exception 'F: لم يُنشأ طلب للدور الحسّاس';
  end if;
end $$;

-- بعد التعطيل: يُمنح مباشرة بلا طلب
do $$
declare v jsonb;
begin
  v := public.sensitive_role_set('field_ops', false, 'تعطيل مؤقت للاختبار');
  if (v ->> 'changed')::boolean is not true then raise exception 'F: لم يُسجَّل تغيير'; end if;
  if app.is_sensitive_role('field_ops') then raise exception 'F: التعطيل لم يسري'; end if;
end $$;
select public.set_user_role('b9000000-0000-4000-8000-000000000005', 'field_ops', true);
do $$ begin
  if not exists (select 1 from public.user_roles where user_id = 'b9000000-0000-4000-8000-000000000005' and role = 'field_ops') then
    raise exception 'F: بعد التعطيل يجب أن يُمنح مباشرة';
  end if;
end $$;

-- إعادة التفعيل تعيد الحجب
select public.sensitive_role_set('field_ops', true, 'إعادة التفعيل');

-- ═══ G) حراسة sensitive_role_set ═══
select pg_temp.as_user('b9000000-0000-4000-8000-000000000002');   -- المدير المفوض ليس IT
select pg_temp.expect_error($$select public.sensitive_role_set('field_ops', false)$$, 'PERMISSION_DENIED');

select pg_temp.as_user('b9000000-0000-4000-8000-000000000001');
select pg_temp.expect_error($$select public.sensitive_role_set('it_admin', false)$$, 'ROLE_LOCKED');
select pg_temp.expect_error($$select public.sensitive_role_set('super_admin', false)$$, 'ROLE_LOCKED');
select pg_temp.expect_error($$select public.sensitive_role_set('not_a_role', false)$$, 'ROLE_INVALID');

do $$ begin
  if not exists (select 1 from public.audit_logs where table_name = 'sensitive_roles' and record_id = 'field_ops') then
    raise exception 'G: لا سجل تدقيق لتعديل الأدوار الحساسة';
  end if;
  if (select active from public.sensitive_roles where role = 'it_admin') is not true then
    raise exception 'G: it_admin يجب أن يبقى نشطاً';
  end if;
end $$;

-- ═══ H) القراءة ═══
do $$
declare n int;
begin
  select count(*) into n from public.sensitive_roles_list();
  if n <> 9 then raise exception 'H: القائمة يجب أن تعرض 9 أدوار، جاء %', n; end if;
end $$;

select pg_temp.as_user('b9000000-0000-4000-8000-000000000004');
select pg_temp.expect_error($$select * from public.sensitive_roles_list()$$, 'PERMISSION_DENIED');

set local role authenticated;
select pg_temp.expect_error($$select count(*) from public.sensitive_roles$$, 'permission denied');
reset role;

-- ═══ خلاصة ═══
do $$
declare n int;
begin
  select count(*) into n from public.sensitive_roles where active;
  if n <> 9 then raise exception 'SUMMARY: يجب أن تعود الأدوار التسعة نشطة، جاء %', n; end if;
  if (select count(*) from public.role_grant_requests where status = 'pending' and role <> 'field_ops') <> 0 then
    raise exception 'SUMMARY: بقيت طلبات معلّقة غير متوقعة';
  end if;
end $$;

rollback;
