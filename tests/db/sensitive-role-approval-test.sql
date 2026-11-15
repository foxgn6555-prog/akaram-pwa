-- V-36 + 00400: حاجز الأدوار الحساسة، أولوية JWT، وقراءة الكراج بلا كتابة.
-- معاملة كاملة تُرجَع في النهاية: لا تترك مستخدمين أو أدواراً أو طلبات في قاعدة الاختبار.
begin;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true)
$$;
create or replace function pg_temp.expect_err(q text, code text) returns void language plpgsql as $$
begin
  execute q;
  raise exception 'TEST_FAIL: expected % for %', code, q;
exception when others then
  if sqlerrm not like '%' || code || '%' then raise; end if;
end $$;

do $$
declare
  requester uuid := '93600000-0000-0000-0000-000000000001';
  approver  uuid := '93600000-0000-0000-0000-000000000002';
  target    uuid := '93600000-0000-0000-0000-000000000003';
  outsider  uuid := '93600000-0000-0000-0000-000000000004';
  holder    uuid := '93600000-0000-0000-0000-000000000005';
  req uuid;
  n integer;
begin
  insert into auth.users (id, email) values
    (requester, 'role-grant-it@test.invalid'),
    (approver,  'role-grant-approver@test.invalid'),
    (target,    'role-grant-target@test.invalid'),
    (outsider,  'role-grant-outsider@test.invalid'),
    (holder,    'role-grant-holder@test.invalid');
  insert into public.user_roles (user_id, role) values
    (requester, 'it_admin'),
    (approver,  'super_admin'),
    (target,    'employee'),
    (target,    'ops_room'),
    (target,    'ops_room_manager'),
    (outsider,  'employee'),
    (holder,    'finance_officer');

  -- 00400: الاقتباس المصحّح يجب أن يُنتج أولوية صحيحة في JWT، لا نصاً مكسوراً.
  -- الترتيب المعتمد: ops_room قبل ops_room_manager، وكلاهما قبل employee.
  if app.custom_access_token_hook(jsonb_build_object('user_id', target, 'claims', '{}'::jsonb)) -> 'claims' ->> 'role' <> 'ops_room' then
    raise exception 'FAIL JWT_PRIORITY: ops_room must precede ops_room_manager/employee';
  end if;
  delete from public.user_roles where user_id = target and role = 'ops_room';
  if app.custom_access_token_hook(jsonb_build_object('user_id', target, 'claims', '{}'::jsonb)) -> 'claims' ->> 'role' <> 'ops_room_manager' then
    raise exception 'FAIL JWT_PRIORITY: ops_room_manager must precede employee';
  end if;
  delete from public.user_roles where user_id = target and role = 'ops_room_manager';
  if app.custom_access_token_hook(jsonb_build_object('user_id', target, 'claims', '{}'::jsonb)) -> 'claims' ->> 'role' <> 'employee' then
    raise exception 'FAIL JWT_PRIORITY: employee fallback';
  end if;
  -- أعِد الأدوار غير الحساسة لاختبار قراءة الكراج بالدور الجديد.
  insert into public.user_roles (user_id, role) values (target, 'ops_room_manager');

  -- 00400: الدور الجديد يقرأ تقارير الكراج ولا يمرّ من بوابة الكتابة.
  perform pg_temp.as_user(target);
  if app.garage_report_actor() <> target then raise exception 'FAIL GARAGE_READ_ACTOR'; end if;
  perform pg_temp.expect_err('select app.require_garage_actor()', 'GARAGE_FORBIDDEN');

  -- امنع حارس التكرار الزمني كي نختبر idempotence الخاصة بطلبات الأدوار نفسها.
  perform set_config('app.dedup_window_seconds', '0', true);

  -- V-36: IT تطلب دوراً حساساً؛ لا يتغيّر الدور قبل موافقة المدير المفوض.
  perform pg_temp.as_user(requester);
  perform public.set_user_role(target, 'finance_officer', true);
  if exists (select 1 from public.user_roles where user_id = target and role = 'finance_officer') then
    raise exception 'FAIL SENSITIVE_GRANT: role changed before approval';
  end if;
  select count(*) into n from public.role_grant_requests where target_user = target and role = 'finance_officer' and is_grant and status = 'pending';
  if n <> 1 then raise exception 'FAIL REQUEST_COUNT: %', n; end if;
  select id into req from public.role_grant_requests where target_user = target and role = 'finance_officer' and is_grant and status = 'pending';
  select count(*) into n from public.approval_tasks where request_kind = 'role_grant' and request_id = req and status = 'pending' and approvers = array[approver];
  if n <> 1 then raise exception 'FAIL APPROVAL_TASK_COUNT: %', n; end if;
  if not exists (select 1 from public.audit_logs where table_name = 'user_roles' and record_id = target::text and operation = 'UPDATE' and new_row ->> 'awaiting_approval' = 'true' and actor_id = requester) then
    raise exception 'FAIL PENDING_AUDIT';
  end if;

  -- تكرار الطلب لا ينشئ طلباً/مهمة ثانية.
  perform public.set_user_role(target, 'finance_officer', true);
  select count(*) into n from public.role_grant_requests where target_user = target and role = 'finance_officer' and is_grant and status = 'pending';
  if n <> 1 then raise exception 'FAIL DUPLICATE_REQUEST: %', n; end if;
  select count(*) into n from public.approval_tasks where request_kind = 'role_grant' and request_id = req and status = 'pending';
  if n <> 1 then raise exception 'FAIL DUPLICATE_TASK: %', n; end if;

  -- القائمة تظهر لطالبها والمدير المفوض، لا لمستخدم عادي.
  select count(*) into n from public.role_grant_requests_list(target);
  if n <> 1 then raise exception 'FAIL REQUESTER_LIST: %', n; end if;
  perform pg_temp.as_user(outsider);
  select count(*) into n from public.role_grant_requests_list(target);
  if n <> 0 then raise exception 'FAIL OUTSIDER_LIST: %', n; end if;
  perform pg_temp.expect_err(format('select public.role_grant_decide(%L, false, ''مرفوض'')', req), 'ROLE_GRANT_FORBIDDEN');

  -- الرفض يوثّق القرار ولا يمنح الدور.
  perform pg_temp.as_user(approver);
  perform public.role_grant_decide(req, false, 'مرفوض للاختبار');
  if (select status from public.role_grant_requests where id = req) <> 'rejected' then raise exception 'FAIL REJECT_STATUS'; end if;
  if exists (select 1 from public.user_roles where user_id = target and role = 'finance_officer') then raise exception 'FAIL REJECT_GRANTED_ROLE'; end if;
  if (select status from public.approval_tasks where request_kind = 'role_grant' and request_id = req) <> 'rejected' then raise exception 'FAIL REJECT_TASK'; end if;

  -- طلب جديد + اعتماد عبر محرك الموافقات العام يختبر توصيل role_grant في approval_decide_request.
  perform pg_temp.as_user(requester);
  perform public.set_user_role(target, 'finance_officer', true);
  select id into req from public.role_grant_requests where target_user = target and role = 'finance_officer' and is_grant and status = 'pending';
  perform pg_temp.as_user(approver);
  perform public.approval_decide_request('role_grant', req, true, 'موافق للاختبار');
  if not exists (select 1 from public.user_roles where user_id = target and role = 'finance_officer') then raise exception 'FAIL APPROVED_GRANT'; end if;
  if (select status from public.role_grant_requests where id = req) <> 'approved' then raise exception 'FAIL APPROVED_STATUS'; end if;
  if (select decided_by from public.role_grant_requests where id = req) <> approver then raise exception 'FAIL APPROVER_AUDIT'; end if;
  if coalesce(current_setting('app.role_grant_approved', true), '') <> 'off' then raise exception 'FAIL APPROVAL_FLAG_NOT_RESET'; end if;

  -- سحب دور حساس يمرّ بالموافقة أيضاً، ولا يُحذف فوراً.
  perform pg_temp.as_user(requester);
  perform public.set_user_role(target, 'finance_officer', false);
  if not exists (select 1 from public.user_roles where user_id = target and role = 'finance_officer') then raise exception 'FAIL REVOKE_BEFORE_APPROVAL'; end if;
  select id into req from public.role_grant_requests where target_user = target and role = 'finance_officer' and not is_grant and status = 'pending';
  perform pg_temp.as_user(approver);
  perform public.role_grant_decide(req, true, 'موافقة سحب');
  if exists (select 1 from public.user_roles where user_id = target and role = 'finance_officer') then raise exception 'FAIL APPROVED_REVOKE'; end if;

  raise notice 'sensitive role approval + JWT priority + garage read-only test ok';
end $$;

rollback;
