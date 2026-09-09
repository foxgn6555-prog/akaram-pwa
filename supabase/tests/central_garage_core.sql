-- اختبار تشغيلي شامل لأساس الكراج المركزي: قيود، توقيت، مخزون، صرف، موافقة وعزل.
do $$
declare
  garage_u uuid := '74000000-0000-0000-0000-000000000001';
  it_u uuid := '74000000-0000-0000-0000-000000000002';
  outsider_u uuid := '74000000-0000-0000-0000-000000000003';
  v public.garage_vehicles;
  t public.garage_tanks;
  t2 public.garage_tanks;
  m public.garage_inventory_movements;
  r public.garage_tank_zero_requests;
  a public.garage_driver_assignments;
  summary jsonb;
  n bigint;
begin
  insert into auth.users(id,email) values
    (garage_u,'garage-core@akram.iq'),(it_u,'garage-it@akram.iq'),(outsider_u,'garage-outsider@akram.iq');
  insert into public.user_roles(user_id,role) values
    (garage_u,'central_garage_officer'),(it_u,'it_admin'),(outsider_u,'employee');

  perform set_config('role','authenticated',false);
  perform set_config('request.jwt.claim.sub',garage_u::text,false);

  -- الصورة إلزامية ومقيدة بمجلد المستخدم، والوقت يولده الخادم.
  v := public.garage_add_vehicle('كابسة نفايات','DB-740','بغداد 12345','CHASSIS-740',
    garage_u::text||'/vehicle.webp','morning','سائق الاختبار',1::smallint);
  if v.created_at is null or abs(extract(epoch from(now()-v.created_at)))>10 then raise exception 'VEHICLE_SERVER_TIME_FAIL'; end if;
  if v.sector_id<>1 or v.driver_name<>'سائق الاختبار' then raise exception 'VEHICLE_FIELDS_FAIL'; end if;
  select count(*) into n from public.garage_driver_assignments where vehicle_id=v.id and ends_at is null;
  if n<>1 then raise exception 'INITIAL_ASSIGNMENT_FAIL'; end if;

  begin
    perform public.garage_add_vehicle('آلية مكررة','db-740','لوحة أخرى','هيكل آخر طويل',garage_u::text||'/duplicate.webp','evening','سائق ثان',2::smallint);
    raise exception 'DUPLICATE_DB_WAS_ACCEPTED';
  exception when others then
    if sqlerrm='DUPLICATE_DB_WAS_ACCEPTED' then raise; end if;
    if sqlerrm not like '%GARAGE_VEHICLE_IDENTIFIER_DUPLICATE%' then raise; end if;
  end;
  begin
    perform public.garage_add_vehicle('آلية','DB-X','P-X','CH-X','wrong-user/image.jpg','morning','سائق',1::smallint);
    raise exception 'FOREIGN_IMAGE_PATH_ACCEPTED';
  exception when others then
    if sqlerrm='FOREIGN_IMAGE_PATH_ACCEPTED' then raise; end if;
    if sqlerrm not like '%GARAGE_IMAGE_PATH_INVALID%' then raise; end if;
  end;

  -- تبديل السائق/الشفت/الموقع يغلق القديم ويحفظ تاريخاً وحالة حالية واحدة.
  a := public.garage_assign_driver(v.id,'السائق الجديد','night',8::smallint,'نقل إلى الوليد');
  select count(*) into n from public.garage_driver_assignments where vehicle_id=v.id and ends_at is null;
  if n<>1 or a.sector_id<>8 or a.shift<>'night' then raise exception 'ASSIGNMENT_CURRENT_FAIL'; end if;
  select count(*) into n from public.garage_driver_assignments where vehicle_id=v.id and ends_at is not null;
  if n<>1 then raise exception 'ASSIGNMENT_HISTORY_FAIL'; end if;
  select count(*) into n from public.garage_vehicles where id=v.id and driver_name='السائق الجديد' and shift='night' and sector_id=8;
  if n<>1 then raise exception 'VEHICLE_CURRENT_ASSIGNMENT_FAIL'; end if;

  -- إنشاء خزان بكمية أولية يسجل حركة آلية، ثم إضافة مخزون ضمن السعة.
  t := public.garage_add_tank('gas_oil','خزان الكاز الرئيسي','liter',1000,200,15);
  if t.current_quantity<>200 then raise exception 'TANK_INITIAL_FAIL'; end if;
  select count(*) into n from public.garage_inventory_movements where tank_id=t.id and movement_type='stock_in' and quantity=200 and quantity_before=0 and quantity_after=200;
  if n<>1 then raise exception 'INITIAL_STOCK_MOVEMENT_FAIL'; end if;
  m := public.garage_add_tank_stock(t.id,100,'وصول وجبة جديدة');
  if m.quantity_before<>200 or m.quantity_after<>300 or m.created_at is null then raise exception 'STOCK_IN_FAIL'; end if;
  begin
    perform public.garage_add_tank_stock(t.id,701,null);
    raise exception 'CAPACITY_OVERFLOW_ACCEPTED';
  exception when others then
    if sqlerrm='CAPACITY_OVERFLOW_ACCEPTED' then raise; end if;
    if sqlerrm not like '%GARAGE_TANK_CAPACITY_EXCEEDED%' then raise; end if;
  end;

  -- صرف آمن مع الموعد التالي؛ لا يرسل العميل وقت العملية.
  m := public.garage_fill_vehicle(t.id,v.id,50,null,'تعبئة كاز بلا موعد تالٍ');
  if m.quantity<>-50 or m.quantity_before<>300 or m.quantity_after<>250 then raise exception 'VEHICLE_FILL_BALANCE_FAIL'; end if;
  if m.next_refill_date is not null then raise exception 'GAS_OIL_REFILL_DATE_STORED'; end if;
  if abs(extract(epoch from(now()-m.created_at)))>10 then raise exception 'FILL_SERVER_TIME_FAIL'; end if;
  begin
    perform public.garage_fill_vehicle(t.id,v.id,251,null,null);
    raise exception 'INSUFFICIENT_FILL_ACCEPTED';
  exception when others then
    if sqlerrm='INSUFFICIENT_FILL_ACCEPTED' then raise; end if;
    if sqlerrm not like '%GARAGE_TANK_BALANCE_INSUFFICIENT%' then raise; end if;
  end;
  begin
    perform public.garage_fill_vehicle(t.id,v.id,1,(timezone('Asia/Baghdad',now())::date-1),null);
    raise exception 'PAST_REFILL_DATE_ACCEPTED';
  exception when others then
    if sqlerrm='PAST_REFILL_DATE_ACCEPTED' then raise; end if;
    if sqlerrm not like '%GARAGE_GAS_OIL_REFILL_DATE_NOT_ALLOWED%' then raise; end if;
  end;

  -- البحث والفلاتر يعيدان الآلية الصحيحة.
  select count(*) into n from public.garage_search_vehicles('السائق الجديد',8::smallint,'night',48,0,false);
  if n<>1 then raise exception 'VEHICLE_SEARCH_FILTER_FAIL'; end if;

  summary := public.garage_dashboard_summary(null,null);
  if (summary->>'vehiclesTotal')::int<>1 or (summary->>'driversTotal')::int<>1
    or (summary->>'dispatchesTotal')::int<>0 or (summary->'consumptionByType'->>'gas_oil')::numeric<>50
    or summary->'tankStock'->0->>'unit'<>'liter' or (summary->'consumptionByUnit'->>'liter')::numeric<>50
    or jsonb_array_length(summary->'dailyConsumption')<>0 or jsonb_array_length(summary->'topConsumers')<>1
    or jsonb_array_length(summary->'recentFills')<>1 then raise exception 'DASHBOARD_SUMMARY_FAIL'; end if;
  summary := public.garage_dashboard_summary(null,null,8::smallint,'gas_oil');
  if (summary->>'vehiclesTotal')::int<>1 or (summary->>'sectorId')::int<>8
    or summary->>'fuelType'<>'gas_oil' or jsonb_array_length(summary->'dailyConsumption')<>30
    or jsonb_array_length(summary->'monthlyConsumption')<>1 then raise exception 'DASHBOARD_FILTER_FAIL'; end if;

  -- مركز التقارير يجمع الإضافة والاستهلاك ويطبق فلاتر الآلية والخزان والمادة والموقع.
  summary := public.garage_consumption_report(null,null,null,'gas_oil',t.id,null,null,50,0);
  if (summary->>'totalCount')::int<>3 or (summary->>'stockInTotal')::numeric<>300
    or (summary->>'consumptionTotal')::numeric<>50 or jsonb_array_length(summary->'rows')<>3
    or jsonb_array_length(summary->'byTank')<>1 or jsonb_array_length(summary->'byVehicle')<>1
    or jsonb_array_length(summary->'byUnit')<>1 or summary->'byUnit'->0->>'unit'<>'liter'
    or summary->'rows'->0->>'unit'<>'liter'
  then raise exception 'GARAGE_REPORT_SUMMARY_FAIL'; end if;
  summary := public.garage_consumption_report(null,null,8::smallint,'gas_oil',t.id,v.id,'vehicle_fill',10,0);
  if (summary->>'totalCount')::int<>1 or (summary->>'consumptionTotal')::numeric<>50
    or summary->'rows'->0->>'dbNumber'<>'DB-740' or summary->'rows'->0->>'actorName'<>'garage-core@akram.iq' then raise exception 'GARAGE_REPORT_FILTER_FAIL'; end if;

  -- طلب التصفير لا ينفذ مباشرة ويرسل إشعاراً للتطوير.
  r := public.garage_request_tank_zero(t.id,'مطابقة الخزان الفعلية');
  select current_quantity into n from public.garage_tanks where id=t.id;
  if r.status<>'pending' or r.requested_quantity<>250 or n<>250 then raise exception 'ZERO_REQUEST_FAIL'; end if;
  begin
    perform public.garage_decide_tank_zero(r.id,true,'محاولة غير مصرح بها');
    raise exception 'GARAGE_APPROVED_OWN_RESET';
  exception when others then
    if sqlerrm='GARAGE_APPROVED_OWN_RESET' then raise; end if;
    if sqlerrm not like '%GARAGE_ZERO_APPROVAL_FORBIDDEN%' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub',it_u::text,false);
  select count(*) into n from public.notifications where user_id=it_u and title like '%تصفير خزان%'
    and link='/it/central-garage-approvals';
  if n<>1 then raise exception 'IT_NOTIFICATION_FAIL'; end if;
  r := public.garage_decide_tank_zero(r.id,true,'تمت المطابقة والموافقة');
  select current_quantity into n from public.garage_tanks where id=t.id;
  if r.status<>'executed' or n<>0 then raise exception 'APPROVED_ZERO_FAIL'; end if;
  select count(*) into n from public.garage_inventory_movements where tank_id=t.id and movement_type='approved_reset' and quantity_before=250 and quantity_after=0 and actor_id=it_u;
  if n<>1 then raise exception 'RESET_AUDIT_MOVEMENT_FAIL'; end if;

  -- إذا تغير الرصيد بعد الطلب تُمنع الموافقة القديمة لمنع فقد مخزون جديد.
  perform set_config('request.jwt.claim.sub',garage_u::text,false);
  t2 := public.garage_add_tank('hydraulic','خزان الهيدروليك','gallon',500,100,20);
  begin
    perform public.garage_fill_vehicle(t2.id,v.id,10,null,null);
    raise exception 'NON_GAS_REFILL_DATE_OMITTED';
  exception when others then
    if sqlerrm='NON_GAS_REFILL_DATE_OMITTED' then raise; end if;
    if sqlerrm not like '%GARAGE_NEXT_REFILL_DATE_INVALID%' then raise; end if;
  end;
  m := public.garage_fill_vehicle(t2.id,v.id,10,(timezone('Asia/Baghdad',now())::date+5),'موعد هيدروليك');
  if m.next_refill_date<>(timezone('Asia/Baghdad',now())::date+5) then raise exception 'NON_GAS_REFILL_DATE_FAIL'; end if;
  r := public.garage_request_tank_zero(t2.id,'اختبار تغير الرصيد');
  perform public.garage_add_tank_stock(t2.id,10,'إضافة بعد الطلب');
  perform public.garage_add_tank('grease','خزان الدهن','kilogram',300,30,20);
  perform public.garage_add_tank('c_oil','خزان C-Oil','barrel',300,40,20);
  select count(distinct fuel_type) into n from public.garage_tanks;
  if n<>4 then raise exception 'FOUR_FUEL_TYPES_FAIL'; end if;
  select count(distinct unit) into n from public.garage_tanks;
  if n<>4 then raise exception 'GARAGE_TANK_UNITS_FAIL'; end if;
  if to_regprocedure('public.garage_add_tank(text,text,numeric,numeric,numeric)') is not null then raise exception 'OLD_ADD_TANK_OVERLOAD_LEFT'; end if;
  begin
    perform public.garage_add_tank('c_oil','وحدة مرفوضة','meter',100,0,20);
    raise exception 'INVALID_TANK_UNIT_ACCEPTED';
  exception when others then
    if sqlerrm='INVALID_TANK_UNIT_ACCEPTED' then raise; end if;
    if sqlerrm not like '%GARAGE_TANK_UNIT_INVALID%' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',it_u::text,false);
  begin
    perform public.garage_decide_tank_zero(r.id,true,'موافقة قديمة');
    raise exception 'CHANGED_BALANCE_RESET_ACCEPTED';
  exception when others then
    if sqlerrm='CHANGED_BALANCE_RESET_ACCEPTED' then raise; end if;
    if sqlerrm not like '%GARAGE_TANK_BALANCE_CHANGED%' then raise; end if;
  end;
  select count(*) into n from public.garage_tank_zero_requests where id=r.id and status='pending';
  if n<>1 then raise exception 'CHANGED_BALANCE_REQUEST_MUTATED'; end if;

  -- الأرشفة تحفظ السبب وتنهي الانطلاقة، والاستعادة تنشئ انطلاقة جديدة وتبقى الحركات في التدقيق.
  perform set_config('request.jwt.claim.sub',garage_u::text,false);
  perform public.garage_archive_vehicle(v.id,'خروج مؤقت من الخدمة');
  select count(*) into n from public.garage_vehicles where id=v.id and archived_at is not null and archive_reason='خروج مؤقت من الخدمة';
  if n<>1 or exists(select 1 from public.garage_driver_assignments where vehicle_id=v.id and ends_at is null) then raise exception 'VEHICLE_ARCHIVE_FAIL'; end if;
  v := public.garage_restore_vehicle(v.id,'إعادتها بعد الصيانة');
  if v.archived_at is not null or not exists(select 1 from public.garage_driver_assignments where vehicle_id=v.id and ends_at is null and change_reason like 'استعادة الآلية:%') then raise exception 'VEHICLE_RESTORE_FAIL'; end if;
  execute 'reset role';
  select count(*) into n from public.audit_logs where table_name='garage_vehicles' and record_id=v.id::text and operation='UPDATE';
  if n<2 then raise exception 'VEHICLE_ARCHIVE_AUDIT_FAIL'; end if;
  perform set_config('role','authenticated',false);
  perform set_config('request.jwt.claim.sub',it_u::text,false);

  -- IT يرى طلبات الموافقة والخزانات، لكنه لا يرى سجل الآليات.
  select count(*) into n from public.garage_vehicles;
  if n<>0 then raise exception 'IT_VEHICLE_ISOLATION_FAIL'; end if;
  select count(*) into n from public.garage_tanks;
  if n<>4 then raise exception 'IT_TANK_APPROVAL_VISIBILITY_FAIL'; end if;

  -- موظف غير مخول لا يرى أي بيانات ولا يستطيع الكتابة المباشرة.
  perform set_config('request.jwt.claim.sub',outsider_u::text,false);
  select (select count(*) from public.garage_vehicles)+(select count(*) from public.garage_tanks)+
    (select count(*) from public.garage_inventory_movements)+(select count(*) from public.garage_tank_zero_requests) into n;
  if n<>0 then raise exception 'OUTSIDER_RLS_FAIL'; end if;
  begin
    perform public.garage_consumption_report(null,null,null,null,null,null,null,50,0);
    raise exception 'OUTSIDER_REPORT_ACCEPTED';
  exception when others then
    if sqlerrm='OUTSIDER_REPORT_ACCEPTED' then raise; end if;
    if sqlerrm not like '%GARAGE_FORBIDDEN%' then raise; end if;
  end;
  begin
    insert into public.garage_tanks(fuel_type,tank_name,capacity,created_by) values('c_oil','مرفوض',100,outsider_u);
    raise exception 'DIRECT_INSERT_ACCEPTED';
  exception when others then
    if sqlerrm='DIRECT_INSERT_ACCEPTED' then raise; end if;
  end;

  reset role;
  raise notice '✅ الكراج: الآليات/الانطلاقية/الخزانات/الإضافة/الصرف/الموعد/التوقيت/الموافقة/RLS ناجحة';
end$$;
