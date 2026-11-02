-- إعداد مستقل: لا يغيّر الحضور أو الرواتب ولا يسمح به إلا للتطوير.
set client_min_messages=warning;
insert into auth.users(id,email) values
 ('40000000-0000-0000-0000-000000000001','settings-it@test.invalid'),
 ('40000000-0000-0000-0000-000000000002','settings-ops@test.invalid');
insert into public.user_roles(user_id,role) values
 ('40000000-0000-0000-0000-000000000001','it_admin'),
 ('40000000-0000-0000-0000-000000000002','ops_room');
create function pg_temp.expect_error(q text, expected text) returns void language plpgsql as $$
begin
  execute q;
  raise exception 'TEST_FAIL: expected %',expected;
exception when others then
  if sqlerrm not like '%'||expected||'%' then raise; end if;
end$$;
do $$
declare p jsonb; original jsonb; n int; a int; x int;
begin
 select settings into original from public.hr_policy where id=1;
 assert not (original ? 'missing_punch_threshold') and not (original ? 'missing_punch_fixed_amount'), 'no automatic defaults';
 select count(*) into n from public.hr_attendance_days;
 select count(*) into a from public.hr_attendance_deductions;
 select count(*) into x from public.hr_month_exports;
 perform set_config('auth.user_id','40000000-0000-0000-0000-000000000002',false);
 perform pg_temp.expect_error('select public.it_missing_punch_settings_set(3,5000)','IT_FORBIDDEN');
 perform set_config('auth.user_id','40000000-0000-0000-0000-000000000001',false);
 perform pg_temp.expect_error('select public.it_missing_punch_settings_set(0,5000)','HR_MISSING_PUNCH_SETTINGS_INVALID');
 perform pg_temp.expect_error('select public.it_missing_punch_settings_set(32,5000)','HR_MISSING_PUNCH_SETTINGS_INVALID');
 perform pg_temp.expect_error('select public.it_missing_punch_settings_set(3,-1)','HR_MISSING_PUNCH_SETTINGS_INVALID');
 perform pg_temp.expect_error('select public.it_missing_punch_settings_set(3,1.001)','HR_MISSING_PUNCH_SETTINGS_INVALID');
 perform pg_temp.expect_error('select public.it_missing_punch_settings_set(3,null)','HR_MISSING_PUNCH_SETTINGS_INVALID');
 -- حتى غلاف السياسة القديم أو تعديل مباشر لا يتجاوز التحقق.
 perform pg_temp.expect_error($q$select public.hr_policy_set('{"missing_punch_threshold":3}'::jsonb)$q$,'HR_MISSING_PUNCH_SETTINGS_INVALID');
 perform pg_temp.expect_error($q$select public.hr_policy_set('{"missing_punch_threshold":"3","missing_punch_fixed_amount":100}'::jsonb)$q$,'HR_MISSING_PUNCH_SETTINGS_INVALID');
 p:=public.it_missing_punch_settings_set(3,5000.25);
 assert (p->>'missing_punch_threshold')::int=3 and (p->>'missing_punch_fixed_amount')::numeric=5000.25,'values saved';
 assert (p-'missing_punch_threshold'-'missing_punch_fixed_amount')=original,'other policy settings unchanged';
 assert (select count(*)=1 from public.hr_deduction_rule_audit where action='missing_punch_settings' and actor='40000000-0000-0000-0000-000000000001' and (after->>'amount')::numeric=5000.25), 'audit';
 perform public.it_missing_punch_settings_set(3,5000.25);
 assert (select count(*)=1 from public.hr_deduction_rule_audit where action='missing_punch_settings'), 'unchanged setting not audited twice';
 perform public.it_missing_punch_settings_set(4,0);
 assert (select count(*)=2 from public.hr_deduction_rule_audit where action='missing_punch_settings'), 'subsequent change audited';
 assert (select count(*) from public.hr_attendance_days)=n and (select count(*) from public.hr_attendance_deductions)=a and (select count(*) from public.hr_month_exports)=x,'settings do not change attendance, deductions or exports';
 raise warning 'settings validation, authorisation, history and no financial effect passed';
end$$;
-- أيضاً تحت دور قاعدة البيانات authenticated نفسه، لا بمجرد تبديل auth.uid.
set role authenticated;
select set_config('auth.user_id','40000000-0000-0000-0000-000000000002',false);
do $$ begin
  begin
    perform public.it_missing_punch_settings_set(3,12000);
    raise exception 'TEST_FAIL expected IT_FORBIDDEN';
  exception when others then
    if sqlerrm <> 'IT_FORBIDDEN' then raise; end if;
  end;
  begin
    update public.hr_policy set settings=settings||'{"missing_punch_threshold":5,"missing_punch_fixed_amount":10}'::jsonb where id=1;
    if found then raise exception 'TEST_FAIL ops changed policy directly'; end if;
  exception when insufficient_privilege then null;
  end;
end$$;
select set_config('auth.user_id','40000000-0000-0000-0000-000000000001',false);
do $$ begin
  perform public.it_missing_punch_settings_set(3,12000);
  assert (public.hr_policy_get()->>'missing_punch_threshold')::int=3,'it can save under real role';
end$$;
reset role;
