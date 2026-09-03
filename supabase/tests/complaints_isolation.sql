-- اختبار عزل دور الشكاوى قبل إنشاء جداول أعمال خاصة به.
-- يثبت أن الدور قابل للإسناد ولا يرث قراءة بيانات المجالات الحساسة القائمة.

do $$
declare
  complaints_u uuid := '00000000-0000-0000-0000-000000000046';
  visible_count bigint;
begin
  insert into auth.users (id, email)
  values (complaints_u, 'isolation-complaints@akram.iq')
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role)
  values (complaints_u, 'complaints_officer')
  on conflict (user_id, role) do nothing;

  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', complaints_u::text, false);

  select
    (select count(*) from public.employees) +
    (select count(*) from public.payrolls) +
    (select count(*) from public.payslips) +
    (select count(*) from public.budget_allocations) +
    (select count(*) from public.audit_logs) +
    (select count(*) from public.app_errors)
  into visible_count;

  if visible_count <> 0 then
    raise exception 'ISOLATION FAIL — دور الشكاوى يرى % سجلاً من مجالات غير مخولة', visible_count;
  end if;

  reset role;
  delete from public.user_roles where user_id = complaints_u;
  delete from auth.users where id = complaints_u;
  raise notice '✅ دور الشكاوى معزول عن مجالات الموظفين والمالية والتدقيق والأخطاء';
end $$;
