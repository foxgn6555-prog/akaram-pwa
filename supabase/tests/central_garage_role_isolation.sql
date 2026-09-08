-- اختبار فعلي لمنح دور الكراج المركزي وعزله قبل إنشاء جداول أعمال البوابة.
do $$
declare
  garage_u uuid := '00000000-0000-0000-0000-000000000073';
  actor_u uuid := '00000000-0000-0000-0000-000000000074';
  visible_count bigint;
begin
  insert into auth.users (id, email) values
    (garage_u, 'isolation-central-garage@akram.iq'),
    (actor_u, 'central-garage-role-actor@akram.iq')
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role)
  values (actor_u, 'it_admin')
  on conflict (user_id, role) do nothing;

  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', actor_u::text, false);
  perform public.set_user_role(garage_u, 'central_garage_officer', true);
  perform set_config('request.jwt.claim.sub', garage_u::text, false);

  if not exists (
    select 1 from public.user_roles
    where user_id = garage_u and role = 'central_garage_officer'
  ) then
    raise exception 'ROLE FAIL — RPC لم يمنح دور الكراج المركزي';
  end if;

  select
    (select count(*) from public.employees) +
    (select count(*) from public.payrolls) +
    (select count(*) from public.payslips) +
    (select count(*) from public.budget_allocations) +
    (select count(*) from public.audit_logs) +
    (select count(*) from public.app_errors) +
    (select count(*) from public.complaint_inbox_messages) +
    (select count(*) from public.complaint_items)
  into visible_count;

  if visible_count <> 0 then
    raise exception 'ISOLATION FAIL — دور الكراج المركزي يرى % سجلاً من مجالات غير مخولة', visible_count;
  end if;

  reset role;
  delete from public.user_roles where user_id in (garage_u, actor_u);
  delete from auth.users where id in (garage_u, actor_u);
  raise notice '✅ دور الكراج المركزي قابل للمنح ومعزول عن المجالات غير المخولة';
end $$;
