-- تقارير آلية واحدة ومجموعة آليات مع عزل الفلتر والتحقق من الحد.
do $$
declare u uuid='74000000-0000-0000-0000-000000000001';v1 uuid;v2 public.garage_vehicles;r jsonb;single_count int;
begin
  perform set_config('role','authenticated',false);perform set_config('request.jwt.claim.sub',u::text,false);
  select id into v1 from public.garage_vehicles where db_number='DB-740';
  v2:=public.garage_add_vehicle('حوضية اختبار','DB-741','بغداد 54321','CHASSIS-741-LONG',u::text||'/vehicle-741.webp','morning','سائق ثان',1::smallint);
  r:=public.garage_consumption_report(p_vehicle_ids=>array[v1],p_limit=>100);
  single_count:=(r->>'totalCount')::int;
  if jsonb_array_length(r->'selectedVehicles')<>1 or r->'selectedVehicles'->0->>'dbNumber'<>'DB-740' then raise exception 'SINGLE_VEHICLE_REPORT_METADATA_FAIL';end if;
  r:=public.garage_consumption_report(p_vehicle_ids=>array[v1,v2.id],p_limit=>100);
  if jsonb_array_length(r->'selectedVehicles')<>2 or (r->>'totalCount')::int<>single_count then raise exception 'MULTI_VEHICLE_REPORT_FILTER_FAIL';end if;
  r:=public.garage_consumption_report(p_vehicle_ids=>array[]::uuid[],p_limit=>100);
  if (r->>'totalCount')::int<>0 or jsonb_array_length(r->'selectedVehicles')<>0 then raise exception 'EMPTY_SELECTION_MUST_NOT_RETURN_ALL';end if;
  begin perform public.garage_consumption_report(p_vehicle_id=>v1,p_vehicle_ids=>array[v2.id]);raise exception 'CONFLICTING_VEHICLE_FILTER_ACCEPTED';exception when others then if sqlerrm='CONFLICTING_VEHICLE_FILTER_ACCEPTED' then raise;end if;if sqlerrm not like '%GARAGE_REPORT_VEHICLE_FILTER_CONFLICT%' then raise;end if;end;
  begin perform public.garage_consumption_report(p_vehicle_ids=>array(select gen_random_uuid() from generate_series(1,51)));raise exception 'TOO_MANY_VEHICLES_ACCEPTED';exception when others then if sqlerrm='TOO_MANY_VEHICLES_ACCEPTED' then raise;end if;if sqlerrm not like '%GARAGE_REPORT_VEHICLES_INVALID%' then raise;end if;end;
  begin perform public.garage_consumption_report(p_vehicle_ids=>array[gen_random_uuid()]);raise exception 'UNKNOWN_VEHICLE_ACCEPTED';exception when others then if sqlerrm='UNKNOWN_VEHICLE_ACCEPTED' then raise;end if;if sqlerrm not like '%GARAGE_REPORT_VEHICLE_NOT_FOUND%' then raise;end if;end;
  execute 'reset role';raise notice '✅ تقارير آلية واحدة/مجموعة/اختيار فارغ/حد 50 والتحقق من الهوية ناجحة';
end$$;
