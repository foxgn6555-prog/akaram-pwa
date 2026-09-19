-- 00130 · سير العمل بالخطوات في المحطة التحويلية: وزن ← وجهة ← اكتمال ← مخالفة/تنبيه/دفتر/غرفة عمليات.
do $$
declare
  g uuid:='84000000-0000-0000-0000-000000000001';
  m uuid:='84000000-0000-0000-0000-000000000002';
  st uuid:='84000000-0000-0000-0000-000000000003';
  op uuid:='84000000-0000-0000-0000-000000000004';
  v public.garage_vehicles; d public.garage_departures; l public.vehicle_trip_legs;
  s public.ts_visit_weighing_steps; n bigint; mo text;
begin
  insert into auth.users(id,email) values(g,'wf-garage@x.iq'),(m,'wf-manager@x.iq'),(st,'wf-station@x.iq'),(op,'wf-ops@x.iq');
  insert into public.user_roles(user_id,role) values(g,'central_garage_officer'),(g,'ops_room'),(m,'department_manager'),(st,'transfer_station'),(op,'ops_room');
  insert into public.manager_profiles(user_id,shift,sectors) values(m,'morning',array[7]::smallint[]);
  insert into public.garage_user_profiles(user_id,parent_sector) values(g,'zaafaraniya');

  -- أنواع الآليات المرجعية seeded كما في المتطلبات
  select count(*) into n from public.ts_vehicle_kinds;
  if n <> 7 then raise exception 'KINDS_SEED_FAIL %', n; end if;
  select count(*) into n from public.ts_vehicle_kinds k
   where exists (select 1 from (values ('compactor_small',2,3),('compactor_medium',4,6),('compactor_large',6,8),('kia',2,null),('canter',5,null),('tak',7,null),('six',10,null)) as t(kind, min_tons, max_tons)
                  where t.kind = k.kind and t.min_tons = k.min_tons and t.max_tons is not distinct from k.max_tons);
  if n <> 7 then raise exception 'KINDS_LIMITS_FAIL %', n; end if;

  -- زيارة أولى: انطلاق ← وصول موقع ← إرسال للمحطة ← تأكيد الوصول
  perform set_config('role','authenticated',false);
  perform set_config('request.jwt.claim.sub',g::text,false);
  v := public.garage_add_vehicle('كابسة دورة','DB-WF1','P-WF1','C-WF1',g::text||'/x.webp','morning','سائق الوزن',7::smallint);
  d := public.garage_record_shift_departure(v.id,'morning',null);
  perform set_config('request.jwt.claim.sub',m::text,false);
  d := public.sector_confirm_vehicle_arrival(d.id,null);
  l := public.sector_send_vehicle_to_station(d.id,'زيارة الوزن');
  -- الوزن قبل تأكيد الوصول مرفوض
  perform set_config('request.jwt.claim.sub',st::text,false);
  begin perform public.ts_record_weighing(l.id,5); raise exception 'WEIGH_BEFORE_ARRIVAL_ACCEPTED';
  exception when others then if sqlerrm='WEIGH_BEFORE_ARRIVAL_ACCEPTED' then raise; end if;
    if sqlerrm not like '%STATION_VISIT_NOT_ARRIVED%' then raise; end if; end;
  l := public.station_confirm_vehicle_arrival(l.id,null);

  -- وزن خارج الحدود مرفوض
  begin perform public.ts_record_weighing(l.id,0); raise exception 'ZERO_WEIGHT_ACCEPTED';
  exception when others then if sqlerrm='ZERO_WEIGHT_ACCEPTED' then raise; end if;
    if sqlerrm not like '%STATION_WEIGHT_INVALID%' then raise; end if; end;
  s := public.ts_record_weighing(l.id,5);
  if s.weight_tons <> 5 or s.weighed_at is null or s.completed_at is not null then raise exception 'WEIGH_STEP_SHAPE_FAIL'; end if;

  -- غرفة العمليات لا تكتب الوزن
  perform set_config('request.jwt.claim.sub',op::text,false);
  begin perform public.ts_record_weighing(l.id,6); raise exception 'OPS_WRITE_ACCEPTED';
  exception when others then if sqlerrm='OPS_WRITE_ACCEPTED' then raise; end if;
    if sqlerrm not like '%STATION_FORBIDDEN%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',st::text,false);

  -- نوع غير صالح / نوع لا ينتمي للوجهة
  begin perform public.ts_complete_weighing(l.id,'press','kia'); raise exception 'KIND_DEST_ACCEPTED';
  exception when others then if sqlerrm='KIND_DEST_ACCEPTED' then raise; end if;
    if sqlerrm not like '%STATION_KIND_DESTINATION_INVALID%' then raise; end if; end;
  begin perform public.ts_complete_weighing(l.id,'press','nope'); raise exception 'BAD_KIND_ACCEPTED';
  exception when others then if sqlerrm='BAD_KIND_ACCEPTED' then raise; end if;
    if sqlerrm not like '%STATION_KIND_INVALID%' then raise; end if; end;

  -- اكتمال ضمن المدى: لا مخالفة + صف دفتر تلقائي
  s := public.ts_complete_weighing(l.id,'press','compactor_medium');
  if s.completed_at is null or s.violation then raise exception 'IN_RANGE_VIOLATION_FAIL'; end if;
  select count(*) into n from public.ts_weight_records where db_number='DB-WF1' and net_weight=5 and vehicle_type='كابسة وسط → المكبس';
  if n <> 1 then raise exception 'AUTO_LEDGER_FAIL %', n; end if;
  begin perform public.ts_complete_weighing(l.id,'press','compactor_medium'); raise exception 'RECOMPLETE_ACCEPTED';
  exception when others then if sqlerrm='RECOMPLETE_ACCEPTED' then raise; end if;
    if sqlerrm not like '%STATION_WEIGHING_COMPLETED%' then raise; end if; end;

  -- زيارة ثانية: وزن أقل من الحد ⇒ مخالفة + تنبيه غرفة العمليات
  l := public.station_dispatch_vehicle(d.id,'work_site','عودة');
  perform set_config('request.jwt.claim.sub',m::text,false);
  l := public.sector_confirm_vehicle_site_return(l.id,null);
  l := public.sector_send_vehicle_to_station(d.id,'زيارة المخالفة');
  perform set_config('request.jwt.claim.sub',st::text,false);
  l := public.station_confirm_vehicle_arrival(l.id,null);
  -- اكتمال بلا وزن مسبق مرفوض
  begin perform public.ts_complete_weighing(l.id,'transfer_station','kia'); raise exception 'COMPLETE_WITHOUT_WEIGHT_ACCEPTED';
  exception when others then if sqlerrm='COMPLETE_WITHOUT_WEIGHT_ACCEPTED' then raise; end if;
    if sqlerrm not like '%STATION_WEIGHING_REQUIRED%' then raise; end if; end;
  s := public.ts_record_weighing(l.id,1.5);
  s := public.ts_complete_weighing(l.id,'transfer_station','kia');
  if not s.violation or s.deficit_tons <> 0.5 then raise exception 'VIOLATION_DEFICIT_FAIL %', s.deficit_tons; end if;
  select count(*) into n from public.ts_violations where db_number='DB-WF1' and deficit_tons=0.5 and vehicle_kind='kia';
  if n <> 1 then raise exception 'VIOLATION_ROW_FAIL %', n; end if;
  perform set_config('request.jwt.claim.sub',op::text,false);
  select count(*) into n from public.notifications where user_id=op and title='مخالفة وزن في المحطة التحويلية';
  if n < 1 then raise exception 'OPS_VIOLATION_NOTIFICATION_FAIL %', n; end if;
  perform set_config('request.jwt.claim.sub',st::text,false);
  -- الأكثر مسموح: وزن فوق الاستيعاب بلا مخالفة (زيارة ثالثة)
  l := public.station_dispatch_vehicle(d.id,'garage','إنهاء');
  perform set_config('request.jwt.claim.sub',g::text,false);
  d := public.garage_record_return(d.id);
  d := public.garage_record_shift_departure(v.id,'morning',null);
  perform set_config('request.jwt.claim.sub',m::text,false);
  d := public.sector_confirm_vehicle_arrival(d.id,null);
  l := public.sector_send_vehicle_to_station(d.id,'زيارة الفائض');
  perform set_config('request.jwt.claim.sub',st::text,false);
  l := public.station_confirm_vehicle_arrival(l.id,null);
  s := public.ts_record_weighing(l.id,12);
  s := public.ts_complete_weighing(l.id,'transfer_station','six');
  if s.violation then raise exception 'OVER_CAP_VIOLATION_FAIL'; end if;

  -- أعمدة الخطوة في station_visits_for_day
  select count(*) into n from public.station_visits_for_day((now() at time zone 'Asia/Baghdad')::date,null,null,null)
   where db_number='DB-WF1' and step_weight_tons is not null;
  if n <> 3 then raise exception 'VISITS_STEP_COLUMNS_FAIL %', n; end if;

  -- جدول غرفة العمليات الاحترافي
  perform set_config('request.jwt.claim.sub',op::text,false);
  select count(*) into n from public.ops_station_workflow(null,null) where db_number='DB-WF1' and weigh_wait_minutes >= 0 and process_minutes >= 0 and transit_minutes >= 0;
  if n <> 3 then raise exception 'OPS_WORKFLOW_ROWS_FAIL %', n; end if;
  select count(*) into n from public.ops_station_workflow(null,null) where db_number='DB-WF1' and violation and destination_label='المحطة التحويلية' and kind_label='كيا';
  if n <> 1 then raise exception 'OPS_WORKFLOW_VIOLATION_FAIL %', n; end if;
  perform set_config('request.jwt.claim.sub',st::text,false);
  select count(*) into n from public.ts_violations_list(null) where db_number='DB-WF1';
  if n <> 1 then raise exception 'VIOLATIONS_LIST_FAIL %', n; end if;
  select coalesce((public.ts_weight_summary(7)->'today_violations')::int,-1) into n;
  if n <> 1 then raise exception 'SUMMARY_VIOLATIONS_FAIL %', n; end if;

  -- الكتابة المباشرة على الخطوات/المخالفات ممنوعة (RLS)
  begin insert into public.ts_violations(step_id,visit_leg_id,driver_name,db_number,vehicle_kind,weight_tons,min_tons,deficit_tons)
        values(s.id,l.id,'س','DB-X','kia',1,2,1); raise exception 'DIRECT_VIOLATION_INSERT_ACCEPTED';
  exception when others then if sqlerrm='DIRECT_VIOLATION_INSERT_ACCEPTED' then raise; end if;
    if sqlerrm not like '%row-level security%' then raise; end if; end;

  -- ناقلة الحاويات المكبسية + وزن السكسات + فولدر شهري
  insert into public.ts_carrier_records(driver_name,vehicle_type,weight_tons) values('سائق الناقلة','ناقلة حاويات',7.5);
  insert into public.ts_saksat_records(driver_name,vehicle_type,weight_tons) values('سائق سكسة','سكس',9);
  mo := to_char(now(),'YYYY-MM');
  n := public.ts_carrier_send_folder(mo);
  if n <> 1 then raise exception 'CARRIER_FOLDER_FAIL %', n; end if;
  begin n := public.ts_carrier_send_folder(mo); raise exception 'EMPTY_FOLDER_ACCEPTED';
  exception when others then if sqlerrm='EMPTY_FOLDER_ACCEPTED' then raise; end if;
    if sqlerrm not like '%FOLDER_EMPTY%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',op::text,false);
  begin n := public.ts_carrier_send_folder(mo); raise exception 'OPS_FOLDER_ACCEPTED';
  exception when others then if sqlerrm='OPS_FOLDER_ACCEPTED' then raise; end if;
    if sqlerrm not like '%SEND_FORBIDDEN%' then raise; end if; end;

  raise notice '✅ سير عمل المحطة: وزن ← وجهة ← اكتمال ← مخالفة/تنبيه/دفتر/غرفة عمليات ناجح';
end$$;
