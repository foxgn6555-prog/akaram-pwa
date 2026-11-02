-- depends: tests/db/attendance-missing-punch-guard-test.sql
set client_min_messages=warning;
do $$ declare d date:=current_setting('test.mpday')::date; m date:=date_trunc('month',d)::date; j jsonb; begin
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000005');
 perform public.it_missing_punch_settings_set(3,1000);
 perform pg_temp.as_user('39940000-0000-0000-0000-000000000001');
 j:=public.ops_missing_punch_month_preview(m,200,0);
 assert exists(select 1 from jsonb_array_elements(j->'rows') r cross join lateral jsonb_array_elements(r->'dates') x
   where r->>'employee_id'='39940000-0000-0000-0000-000000000011' and x->>'date'=d::text and x->>'classification'='confirmed'),
   'actual manual correction still counted after second real punch';
 assert exists(select 1 from jsonb_array_elements(j->'rows') r cross join lateral jsonb_array_elements(r->'dates') x
   where r->>'employee_id'='39940000-0000-0000-0000-000000000014' and x->>'date'=d::text and x->>'classification'='confirmed'),
   'night correction counted';
 assert exists(select 1 from jsonb_array_elements(j->'rows') r cross join lateral jsonb_array_elements(r->'dates') x
   where r->>'employee_id'='39940000-0000-0000-0000-000000000015' and x->>'date'=d::text and x->>'classification'='confirmed'),
   'flex correction counted';
 assert not exists(select 1 from jsonb_array_elements(j->'rows') r cross join lateral jsonb_array_elements(r->'dates') x
   where r->>'employee_id'='39940000-0000-0000-0000-000000000013' and x->>'date'=d::text and x->>'classification'='confirmed'),
   'approved no-punch case not a missing single punch';
 raise warning 'test ok: actual corrected single punch, later arrival, night, flex and no-punch';
end$$;
