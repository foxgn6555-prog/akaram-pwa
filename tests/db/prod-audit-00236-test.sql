-- اختبار إصلاحات فحص الإنتاج (00236): دوال الصيانة الثلاث تعمل بلا 42804/42702، وقيمة SEND_TO_OPS مقبولة في audit_logs. مستقل.
set client_min_messages = notice;
insert into auth.users (id, email) values ('a6000000-0000-0000-0000-000000000001', 'mt-a6@t.iq'), ('a6000000-0000-0000-0000-000000000002', 'mt2-a6@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('a6000000-0000-0000-0000-000000000001', 'maintenance'), ('a6000000-0000-0000-0000-000000000002', 'maintenance') on conflict do nothing;
do $$
declare n int; r record;
begin
  perform set_config('auth.user_id', 'a6000000-0000-0000-0000-000000000001', false);
  -- ① email varchar في auth.users الحقيقي ⇒ يجب أن تعمل مع إعلان text
  select count(*) into n from public.maintenance_technicians() where email = 'mt2-a6@t.iq';
  if n <> 1 then raise exception 'technicians: expected 1 got %', n; end if;
  -- ② stage_no smallint
  select count(*) into n from public.maintenance_vehicle_cases();
  -- ③ لا غموض في id (حالة غير موجودة ⇒ FORBIDDEN وليس 42702)
  begin
    perform * from public.maintenance_case_technicians(gen_random_uuid());
    raise exception 'expected MAINTENANCE_CASE_FORBIDDEN';
  exception when others then
    if sqlerrm <> 'MAINTENANCE_CASE_FORBIDDEN' then raise exception 'case_technicians wrong error: %', sqlerrm; end if;
  end;
  -- ④ SEND_TO_OPS مقبولة
  insert into public.audit_logs (table_name, record_id, operation, new_row, actor_id, actor_role) values ('ts_weight_records', 'x', 'SEND_TO_OPS', '{}'::jsonb, 'a6000000-0000-0000-0000-000000000001', 'transfer_station');
  raise notice 'PROD_AUDIT_00236_OK';
end $$;
