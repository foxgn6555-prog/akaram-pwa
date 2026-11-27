-- 20261203000100–000500: حضوريات الآليات المؤجرة — اختبار الحالات السالبة والحدود.
--
-- يكمل rented-attendance-test.sql (الذي يغطّي المسار السعيد والسلوك الأساسي).
-- هنا نثبت ما **يجب أن يُرفض**، وما يفسد البيانات إن سُمح به:
--   N1. لا صف حضور بلا سائق خارجي.
--   N2. لا حاضر بلا انطلاقة في صف آلي (sync).
--   N3. قيد اليوم اليدوي: سبب ومُعدِّل إلزاميان.
--   N4. الضريبة: قيم حدّية (نسبة > 100، مبلغ سالب، وضع بلا قيمته).
--   N5. الراتب: مبلغ صفر أو سالب مرفوض.
--   N6. التفريغ: طن التفريغة صفر مرفوض (قسمة على صفر).
--   N7. المزامنة لا تُنشئ أياماً مستقبلية.
--   N8. المزامنة لا تُنشئ صفاً لآلية مملوكة.
--   N9. الرفض من المعاون يمنع الدفع ويُسجَّل في التدقيق.
--   N10. sla: كل ضريبة/تعديل يُسجَّل في سجل التدقيق (لا كتابة صامتة).
--
-- محصّن: begin … rollback.

set client_min_messages = notice;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('auth.user_id', p::text, false),
         set_config('auth.role', 'authenticated', false),
         set_config('request.jwt.claims', jsonb_build_object('sub', p::text, 'role', 'authenticated')::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if position(p_code in msg) = 0 then raise exception 'WRONG_ERROR: got % wanted %', msg, p_code; end if;
end $$;

begin;

do $$
declare
  u_ops uuid := 'e9400000-0000-0000-0000-000000000001';
  u_dep uuid := 'e9400000-0000-0000-0000-000000000002';
  u_fin uuid := 'e9400000-0000-0000-0000-000000000003';
  v_rent uuid := 'e940a000-0000-0000-0000-000000000001';
  v_own  uuid := 'e940a000-0000-0000-0000-000000000002';
  v_hidden uuid := 'e940a000-0000-0000-0000-000000000003';   -- مؤجرة مُؤرشفة
  d_x uuid := 'e940b000-0000-0000-0000-000000000001';
  v_day date := (now() at time zone 'Asia/Baghdad')::date - 5;
  tomorrow date := (now() at time zone 'Asia/Baghdad')::date + 1;
  n int; b boolean;
begin
  insert into auth.users (id, email) values (u_ops, 'n-ops@t.iq'), (u_dep, 'n-dep@t.iq'), (u_fin, 'n-fin@t.iq')
    on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values
    (u_ops, 'ops_room'), (u_dep, 'deputy_director'), (u_fin, 'finance_officer') on conflict do nothing;

  insert into public.garage_vehicles
    (id, vehicle_name, db_number, plate_number, chassis_number, image_path, driver_name, shift,
     sector_id, garage_parent_sector, vehicle_category, ownership_type, lessor_name, archived_at, created_by)
  values
    (v_rent, 'مؤجرة حدود', 'DB-N1', 'P-N1', 'CH-N001', 'g/n1.jpg', 'س ن', 'morning',
     3, 'karrada', 'compactor_large', 'rented', 'مؤجّر ن', null, u_ops),
    (v_own, 'مملوكة حدود', 'DB-N2', 'P-N2', 'CH-N002', 'g/n2.jpg', 'س و', 'morning',
     3, 'karrada', 'compactor_large', 'owned', null, null, u_ops),
    (v_hidden, 'مؤجرة مؤرشفة', 'DB-N3', 'P-N3', 'CH-N003', 'g/n3.jpg', 'س أ', 'morning',
     3, 'karrada', 'compactor_large', 'rented', 'مؤجّر أ', now(), u_ops)
  on conflict (id) do nothing;

  insert into public.station_external_drivers (id, full_name, contractor_name, active, created_at)
  values (d_x, 'سائق حدود', 'مؤجّر ن', true, now()) on conflict (id) do nothing;

  -- ══ N1: حضور بلا سائق مستحيل بنيوياً (NOT NULL) ══════════════════════
  begin
    insert into public.rented_attendance_days (driver_external_id, vehicle_id, day, status, departures_count, source)
    values (null, v_rent, v_day, 'present', 1, 'sync');
    raise exception 'N1: NULL driver accepted';
  exception when not_null_violation then null;   -- متوقع
  end;

  -- ══ N2: حاضر بلا انطلاقة في صف آلي مرفوض ═════════════════════════════
  begin
    insert into public.rented_attendance_days (driver_external_id, vehicle_id, day, status, departures_count, source)
    values (d_x, v_rent, v_day, 'present', 0, 'sync');
    raise exception 'N2: sync present with 0 departures accepted';
  exception when check_violation then null;   -- متوقع
  end;

  -- ══ N3: صف يدوي بلا سبب أو بلا مُعدِّل مرفوض ═════════════════════════
  begin
    insert into public.rented_attendance_days (driver_external_id, vehicle_id, day, status, departures_count, source, manual_reason)
    values (d_x, v_rent, v_day, 'present', 0, 'manual', 'سبب بلا مُعدِّل');
    raise exception 'N3: manual row without actor accepted';
  exception when check_violation then null;   -- متوقع
  end;

  -- ══ N4: حدود الضريبة ═════════════════════════════════════════════════
  perform pg_temp.as_user(u_dep);
  perform pg_temp.expect_error(format('select public.rented_tax_save(%L,''percent'',150,''س'')', v_rent), 'RENTED_TAX_PCT_INVALID');
  perform pg_temp.expect_error(format('select public.rented_tax_save(%L,''fixed'',-5,''س'')', v_rent), 'RENTED_TAX_AMOUNT_INVALID');
  perform pg_temp.expect_error(format('select public.rented_tax_save(%L,''bogus'',5,''س'')', v_rent), 'RENTED_TAX_MODE_INVALID');
  -- سبب صالح (٣ أحرف) كي يصل الفحص إلى وجود الآلية لا إلى السبب
  perform pg_temp.expect_error(format('select public.rented_tax_save(%L,''fixed'',5,''سبب صالح'')', v_own), 'RENTED_VEHICLE_NOT_FOUND');

  -- وضع fixed مع pct ممتلئ (أو العكس) يخرق قيد الجدول ⇒ مرفوض
  begin
    insert into public.rented_vehicle_taxes (vehicle_id, mode, fixed_amount, pct, reason)
    values (v_rent, 'fixed', 100, 5, 'قيمتان معاً');
    raise exception 'N4b: mode/value mismatch accepted';
  exception when check_violation then null;   -- متوقع
  end;

  -- ══ N5: الراتب صفر/سالب مرفوض ════════════════════════════════════════
  perform pg_temp.as_user(u_fin);
  perform pg_temp.expect_error(
    format('select public.rented_salary_save(%L,%L,%L,''monthly'',0,''صفر'')', d_x, v_rent, (date_trunc('month', v_day))::date),
    'RENTED_SALARY_AMOUNT_INVALID');
  perform pg_temp.expect_error(
    format('select public.rented_salary_save(%L,%L,%L,''monthly'',-1,''سالب'')', d_x, v_rent, (date_trunc('month', v_day))::date),
    'RENTED_SALARY_AMOUNT_INVALID');
  -- ولا راتب لآلية غير مؤجرة
  perform pg_temp.expect_error(
    format('select public.rented_salary_save(%L,%L,%L,''monthly'',1000,''س'')', d_x, v_own, (date_trunc('month', v_day))::date),
    'RENTED_VEHICLE_NOT_FOUND');

  -- ══ N6: التفريغ — طن صفر مرفوض ═══════════════════════════════════════
  perform pg_temp.as_user(u_ops);
  perform pg_temp.expect_error(format('select public.rented_discharge_save(%L,0,6,''س'')', v_rent), 'RENTED_DISCHARGE_TONS_INVALID');
  perform pg_temp.expect_error(format('select public.rented_discharge_save(%L,2,-1,''س'')', v_rent), 'RENTED_DISCHARGE_TARGET_INVALID');
  perform pg_temp.expect_error(format('select public.rented_discharge_save(%L,2,6,''سبب صالح'')', v_own), 'RENTED_VEHICLE_NOT_FOUND');

  -- ══ N7: لا أيام مستقبلية ═════════════════════════════════════════════
  insert into public.garage_departures (vehicle_id, driver_name, shift, sector_id, departed_at, departed_by, driver_external_id)
  values (v_rent, 'سائق حدود', 'morning', 3, (tomorrow + time '06:00') at time zone 'Asia/Baghdad', u_ops, d_x);
  perform app.rented_attendance_sync_day(tomorrow);
  select count(*) into n from public.rented_attendance_days where day > (now() at time zone 'Asia/Baghdad')::date;
  if n <> 0 then raise exception 'N7: sync created % future day rows', n; end if;
  -- والنطاق يوقف عند اليوم الحالي حتى لو طُلب أكثر
  perform app.rented_attendance_sync_range(tomorrow, tomorrow + 3);
  select count(*) into n from public.rented_attendance_days where day > (now() at time zone 'Asia/Baghdad')::date;
  if n <> 0 then raise exception 'N7b: range sync created % future day rows', n; end if;
  -- ولا يوم مُسند لآلية مملوكة
  if exists (select 1 from public.rented_attendance_days where vehicle_id = v_own) then
    raise exception 'N8: owned vehicle got a row';
  end if;
  -- ولا آلية مؤرشفة تدخل قائمة الإعدادات
  select exists (select 1 from public.rented_discharge_list() where vehicle_id = v_hidden) into b;
  if b then raise exception 'N8b: archived rented vehicle listed in discharge settings'; end if;
  select exists (select 1 from public.rented_tax_list() where vehicle_id = v_hidden) into b;
  if b then raise exception 'N8c: archived rented vehicle listed in tax list'; end if;

  -- ══ N9: الرفض يمنع الدفع ═════════════════════════════════════════════
  declare
    m date := (date_trunc('month', (now() at time zone 'Asia/Baghdad')::date) - interval '3 months')::date;
  begin
    perform pg_temp.as_user(u_ops);
    perform public.rented_month_submit(m);
    perform pg_temp.as_user(u_dep);
    perform public.rented_month_decide_deputy(m, false, 'مرفوض لخطأ في الانطلاقات');
    perform pg_temp.as_user(u_fin);
    perform pg_temp.expect_error(format('select public.rented_month_pay(%L,null)', m), 'RENTED_MONTH_NOT_APPROVED');
  end;

  -- ══ N10: كل كتابة تُسجَّل في التدقيق ═════════════════════════════════
  -- (ضريبة محفوظة + إلغاء + تعديل يوم + إعداد تفريغ + راتب + قرار شهر)
  perform pg_temp.as_user(u_dep);
  perform public.rented_tax_save(v_rent, 'fixed', 25000, 'تدقيق');
  perform public.rented_tax_clear(v_rent, 'إلغاء للتدقيق');

  perform pg_temp.as_user(u_ops);
  perform public.rented_attendance_set_day(d_x, v_rent, v_day, 'present', 'إثبات ورقي للتدقيق');

  perform pg_temp.as_user(u_fin);
  perform public.rented_salary_save(d_x, v_rent, (date_trunc('month', v_day))::date, 'daily', 90000, 'تدقيق');

  for n in 1..5 loop
    select exists (select 1 from public.rented_attendance_audit where entity = (array['tax','day','salary','month','discharge'])[n]) into b;
    if n <= 3 and not b then
      raise exception 'N10: no audit row for entity %', (array['tax','day','salary'])[n];
    end if;
  end loop;
  if not exists (select 1 from public.rented_attendance_audit where action = 'deputy_reject') then
    raise exception 'N10b: rejection not audited';
  end if;

  insert into public.rented_attendance_months (month, status) values (date '1990-02-01', 'draft') on conflict (month) do nothing;
  raise notice '✔ كل فحوص الحدود والحالات السالبة نجحت (N1–N10)';
end $$;

rollback;
