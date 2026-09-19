-- 00131 · التقرير اليومي والمحاسبة الوزنية: وارد/صادر/مجاميع/قواطع/إرسال يومي للمعاون.
do $$
declare
  g uuid:='85000000-0000-0000-0000-000000000001';
  m uuid:='85000000-0000-0000-0000-000000000002';
  st uuid:='85000000-0000-0000-0000-000000000003';
  op uuid:='85000000-0000-0000-0000-000000000004';
  dep uuid:='85000000-0000-0000-0000-000000000005';
  v public.garage_vehicles; d public.garage_departures; l public.vehicle_trip_legs;
  s public.ts_visit_weighing_steps; rep public.deputy_daily_reports;
  r jsonb; n bigint; t numeric; b_zaf numeric := 0; day date := (now() at time zone 'Asia/Baghdad')::date;
begin
  insert into auth.users(id,email) values(g,'dr-garage@x.iq'),(m,'dr-manager@x.iq'),(st,'dr-station@x.iq'),(op,'dr-ops@x.iq'),(dep,'dr-deputy@x.iq');
  insert into public.user_roles(user_id,role) values(g,'central_garage_officer'),(g,'ops_room'),(m,'department_manager'),(st,'transfer_station'),(op,'ops_room'),(dep,'deputy_director');
  insert into public.manager_profiles(user_id,shift,sectors) values(m,'morning',array[8]::smallint[]);
  -- هذا آخر اختبار في القائمة: نضمن مدير وحيد للقطاع 8 (الـ resolve منذ 00114 لا يفصل بالشفت)
  delete from public.manager_profiles mp
   using public.user_roles ur
   where mp.user_id = ur.user_id and ur.role = 'department_manager'
     and 8 = any(mp.sectors) and mp.user_id <> m;
  insert into public.garage_user_profiles(user_id,parent_sector) values(g,'zaafaraniya');

  -- الحمولات القياسية كما في المتطلبات
  select count(*) into n from public.ts_unit_capacities where (unit,capacity_tons) in (('saksat',10),('trips',25),('carrier',16));
  if n <> 3 then raise exception 'CAPACITIES_SEED_FAIL %', n; end if;

  -- خط الأساس للتقرير اليومي قبل إدخالات هذا الاختبار (اليوم مشترك بين الاختبارات)
  perform set_config('role','authenticated',false);
  perform set_config('request.jwt.claim.sub',op::text,false);
  r := public.ops_station_daily_report(day);
  select coalesce(sum(inbound_tons),0) into b_zaf from public.ops_sector_tonnage(day, day) where parent_sector='zaafaraniya';

  -- ثلاث زيارات: مكبس 5 طن · محطة 3 طن · مخالفة 1 طن (كيا)
  perform set_config('role','authenticated',false);
  perform set_config('request.jwt.claim.sub',g::text,false);
  v := public.garage_add_vehicle('كابسة تقرير','DB-DR1','P-DR1','C-DR1',g::text||'/x.webp','morning','سائق التقرير',8::smallint);
  for i in 1..3 loop
    d := public.garage_record_shift_departure(v.id,'morning',null);
    perform set_config('request.jwt.claim.sub',m::text,false);
    d := public.sector_confirm_vehicle_arrival(d.id,null);
    l := public.sector_send_vehicle_to_station(d.id,'زيارة تقرير');
    perform set_config('request.jwt.claim.sub',st::text,false);
    l := public.station_confirm_vehicle_arrival(l.id,null);
    s := public.ts_record_weighing(l.id, (array[5,3,1])[i]);
    s := public.ts_complete_weighing(l.id, (array['press','transfer_station','transfer_station'])[i], (array['compactor_medium','kia','kia'])[i]);
    if i < 3 then
      l := public.station_dispatch_vehicle(d.id,'garage','إنهاء');
      perform set_config('request.jwt.claim.sub',g::text,false);
      d := public.garage_record_return(d.id);
    end if;
    perform set_config('request.jwt.claim.sub',g::text,false);
  end loop;

  -- الفروق بعد إدخالات هذا الاختبار
  declare
    b_inbound int := jsonb_array_length(r->'inbound');
    b_press numeric := (r->'inbound_totals'->'press'->>'tons')::numeric;
    b_station numeric := (r->'inbound_totals'->'transfer_station'->>'tons')::numeric;
    b_total numeric := (r->'inbound_totals'->>'total_tons')::numeric;
    b_sak int := (r->'outbound'->'saksat'->>'count')::int;
    b_sak_t numeric := (r->'outbound'->'saksat'->>'tons')::numeric;
    b_trip int := (r->'outbound'->'trips'->>'count')::int;
    b_car int := (r->'outbound'->'carrier'->>'count')::int;
    b_out_t numeric := (r->'outbound'->>'total_tons')::numeric;
    b_vio int := jsonb_array_length(r->'violations');
  begin

    -- صادرات اليوم: سكسة بوزن مسجل · نسافة بلا وزن (قياسي 25) · ناقلة 16
    perform set_config('request.jwt.claim.sub',st::text,false);
    insert into public.ts_saksat_records(driver_name,weight_tons) values('سائق سكسة',10);
    insert into public.ts_trips_records(driver_name) values('سائق نسافة');
    insert into public.ts_carrier_records(driver_name,weight_tons) values('سائق ناقلة',16);

    perform set_config('request.jwt.claim.sub',op::text,false);
    r := public.ops_station_daily_report(day);
    if jsonb_array_length(r->'inbound') <> b_inbound + 3 then raise exception 'DAILY_INBOUND_FAIL %', jsonb_array_length(r->'inbound'); end if;
    if (r->'inbound_totals'->'press'->>'tons')::numeric <> b_press + 5 then raise exception 'DAILY_PRESS_TONS_FAIL %', r->'inbound_totals'->'press'->>'tons'; end if;
    if (r->'inbound_totals'->'transfer_station'->>'tons')::numeric <> b_station + 4 then raise exception 'DAILY_STATION_TONS_FAIL %', r->'inbound_totals'->'transfer_station'->>'tons'; end if;
    if (r->'inbound_totals'->>'total_tons')::numeric <> b_total + 9 then raise exception 'DAILY_TOTAL_TONS_FAIL %', r->'inbound_totals'->>'total_tons'; end if;
    if (r->'outbound'->'saksat'->>'count')::int <> b_sak + 1 or (r->'outbound'->'saksat'->>'tons')::numeric <> b_sak_t + 10 then raise exception 'DAILY_SAKSAT_FAIL'; end if;
    if (r->'outbound'->'trips'->>'count')::int <> b_trip + 1 then raise exception 'DAILY_TRIPS_COUNT_FAIL'; end if;
    if (r->'outbound'->'carrier'->>'count')::int <> b_car + 1 then raise exception 'DAILY_CARRIER_COUNT_FAIL'; end if;
    if (r->'outbound'->>'total_count')::int <> b_sak + b_trip + b_car + 3 then raise exception 'DAILY_OUTBOUND_COUNT_FAIL'; end if;
    if (r->'outbound'->>'total_tons')::numeric <> b_out_t + 51 then raise exception 'DAILY_OUTBOUND_TOTAL_FAIL %', r->'outbound'->>'total_tons'; end if;
    if jsonb_array_length(r->'violations') <> b_vio + 1 then raise exception 'DAILY_VIOLATIONS_FAIL %', jsonb_array_length(r->'violations'); end if;

    -- تقرير القواطع: الزعفرانية (قطاع 8) زادت 9 أطنان ولا تسريب للكرادة
    select coalesce(sum(inbound_tons),0) into t from public.ops_sector_tonnage(day, day) where parent_sector='zaafaraniya';
    if t <> b_zaf + 9 then raise exception 'SECTOR_TONNAGE_FAIL %', t; end if;
    select count(*) into n from public.ops_sector_tonnage(day, day) where parent_sector='karrada';
    if n <> 0 then raise exception 'SECTOR_KARRADA_LEAK_FAIL %', n; end if;
    perform set_config('request.jwt.claim.sub',m::text,false);
    begin perform public.ops_sector_tonnage(day, day); raise exception 'MANAGER_SECTOR_ACCEPTED';
    exception when others then if sqlerrm='MANAGER_SECTOR_ACCEPTED' then raise; end if;
      if sqlerrm not like '%OPS_SECTOR_FORBIDDEN%' then raise; end if; end;

    -- الإرسال اليومي إلى المعاون بعد التدقيق
    perform set_config('request.jwt.claim.sub',st::text,false);
    begin rep := public.ops_send_daily_to_deputy(day, 'محاولة محطة'); raise exception 'STATION_SEND_ACCEPTED';
    exception when others then if sqlerrm='STATION_SEND_ACCEPTED' then raise; end if;
      if sqlerrm not like '%OPS_SEND_FORBIDDEN%' then raise; end if; end;
    perform set_config('request.jwt.claim.sub',op::text,false);
    rep := public.ops_send_daily_to_deputy(day, 'دقيق ومدقق');
    if (rep.payload->'inbound_totals'->>'total_tons')::numeric <> b_total + 9 then raise exception 'SEND_PAYLOAD_FAIL'; end if;
    perform set_config('request.jwt.claim.sub',dep::text,false);
    select count(*) into n from public.deputy_daily_reports_list(10)
     where report_day=day and (payload->'outbound'->>'total_count')::int = b_sak + b_trip + b_car + 3;
    if n <> 1 then raise exception 'DEPUTY_DAILY_LIST_FAIL %', n; end if;
    select count(*) into n from public.notifications where user_id=dep and title='التقرير اليومي للمحطة التحويلية';
    if n < 1 then raise exception 'DEPUTY_DAILY_NOTIFICATION_FAIL %', n; end if;
    -- إعادة الإرسال تحدّث نفس اليوم ولا تكرره
    perform set_config('request.jwt.claim.sub',op::text,false);
    rep := public.ops_send_daily_to_deputy(day, 'تحديث بعد التدقيق');
    select count(*) into n from public.deputy_daily_reports where report_day=day;
    if n <> 1 then raise exception 'DEPUTY_DAILY_UPSERT_FAIL %', n; end if;
  end;

  raise notice '✅ التقارير اليومية والمحاسبة الوزنية والقواطع والإرسال للمعاون ناجحة';
end$$;
