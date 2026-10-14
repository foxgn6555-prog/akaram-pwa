-- اختبار 00224: مفاتيح رسومات لوحة الموارد البشرية
set client_min_messages = notice;
insert into auth.users (id,email) values ('ee240000-0000-0000-0000-000000000001','hrd@t.iq') on conflict do nothing;
insert into public.user_roles (user_id, role) values ('ee240000-0000-0000-0000-000000000001','hr_officer') on conflict do nothing;
select auth.set_test_user('ee240000-0000-0000-0000-000000000001');
do $$ declare j jsonb; begin
  j := public.hr_dashboard_stats();
  assert jsonb_array_length(j->'attendance_30d') = 30, '30d: ' || jsonb_array_length(j->'attendance_30d');
  assert jsonb_array_length(j->'movement_6m') = 6, '6m';
  assert (j->'by_contract') ? 'monthly' and (j->'tenure') ? 'lt1' and (j->'month_attendance') ? 'days' and (j ? 'incomplete_profiles') and (j ? 'leaves_pending'), 'keys: ' || j::text;
  assert (j->'attendance_30d'->29->>'d') = to_char(current_date,'YYYY-MM-DD'), 'last day today';
  raise notice 'dash ok %', (j->'by_status')::text;
end $$;
