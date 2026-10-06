-- اختبار 00183: استرداد حاويات GBS من Excel (غرفة العمليات فقط). مستقل (بادئة dd).
set client_min_messages = notice;
insert into auth.users (id, email) values ('dd000000-0000-0000-0000-000000000002', 'ops-c@t.iq'), ('dd000000-0000-0000-0000-000000000003', 'dm-c@t.iq'), ('dd000000-0000-0000-0000-000000000007', 'ops2-c@t.iq') on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values ('dd000000-0000-0000-0000-000000000002', 'ops_room'), ('dd000000-0000-0000-0000-000000000007', 'ops_room'), ('dd000000-0000-0000-0000-000000000003', 'department_manager') on conflict do nothing;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$ select set_config('auth.user_id', p::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if msg not like '%' || p_code || '%' then raise exception 'WRONG_ERROR for %: got [%] wanted [%]', p_sql, msg, p_code; end if;
end $$;
do $$
declare res jsonb; rows jsonb; c record; n int; existing_code text;
begin
  perform pg_temp.as_user('dd000000-0000-0000-0000-000000000003');
  perform pg_temp.expect_error($q$ select public.gbs_containers_import('[]'::jsonb) $q$, 'GBS_FORBIDDEN');
  perform pg_temp.expect_error($q$ select * from public.gbs_containers_export() $q$, 'GBS_FORBIDDEN');
  perform pg_temp.as_user('dd000000-0000-0000-0000-000000000002');
  -- حاوية موجودة مسبقاً عبر الحفظ العادي
  select x.code into existing_code from public.gbs_container_save(null::uuid, 'حاوية الاختبار الأصلية', 33.31::float8, 44.42::float8, 'ok', 4::smallint) x;
  res := public.gbs_containers_import(format($j$[
    {"label":"أمام مدرسة الرافدين","latitude":"33.3152","longitude":"44.3661","status":"سليمة","area":"4"},
    {"label":"شارع 60 قرب الجسر","coords":"33.30, 44.45","status":"متضررة","area":"منطقة 7","notes":"غطاء مكسور"},
    {"label":"بلا إحداثيات","area":"4"},
    {"label":"حالة غريبة","latitude":"33.3","longitude":"44.4","status":"؟؟","area":"4"},
    {"code":"%s","label":"حاوية الاختبار بعد الاسترداد","latitude":"33.32","longitude":"44.43","status":"يجب استبدالها","area":"7"},
    {"label":"خارج العراق","latitude":"48.8","longitude":"2.3","area":"4"}
  ]$j$, existing_code)::jsonb, true, true);
  if (res ->> 'total')::int <> 6 or (res ->> 'inserted')::int <> 3 or (res ->> 'updated')::int <> 1 or (res ->> 'failed')::int <> 2 then raise exception 'dry summary: % %', res - 'rows', res -> 'rows'; end if;
  rows := res -> 'rows';
  if not (rows -> 2 -> 'errors') ? 'GBS_POINT_INVALID' or not (rows -> 3 -> 'errors') ? 'GBS_STATUS_INVALID' or not (rows -> 5 -> 'warnings') ? 'GBS_IMPORT_POINT_OUTSIDE_IRAQ' then raise exception 'row errors: %', rows; end if;
  if (rows -> 1 ->> 'latitude')::float8 <> 33.30 or (rows -> 1 ->> 'status') <> 'damaged' or (rows -> 1 ->> 'area') <> (select name from public.sectors where id = 7) then raise exception 'coords row: %', rows -> 1; end if;
  select count(*) into n from public.gbs_containers where label = 'أمام مدرسة الرافدين'; if n <> 0 then raise exception 'dry run wrote'; end if;
  -- تنفيذ
  res := public.gbs_containers_import(format($j$[
    {"label":"أمام مدرسة الرافدين","latitude":"33.3152","longitude":"44.3661","status":"سليمة","area":"4"},
    {"label":"شارع 60 قرب الجسر","coords":"33.30, 44.45","status":"متضررة","area":"منطقة 7","notes":"غطاء مكسور"},
    {"code":"%s","label":"حاوية الاختبار بعد الاسترداد","latitude":"33.32","longitude":"44.43","status":"يجب استبدالها","area":"7"}
  ]$j$, existing_code)::jsonb, false, true);
  if (res ->> 'inserted')::int <> 2 or (res ->> 'updated')::int <> 1 or (res ->> 'failed')::int <> 0 then raise exception 'exec summary: %', res - 'rows'; end if;
  select * into c from public.gbs_containers where label = 'شارع 60 قرب الجسر';
  if c.code not like 'GBS-%' or c.status <> 'damaged' or c.sector_id <> 7 or c.latitude <> 33.30 or c.longitude <> 44.45 or c.notes <> 'غطاء مكسور' then raise exception 'inserted wrong: %', c; end if;
  select * into c from public.gbs_containers where code = existing_code;
  if c.label <> 'حاوية الاختبار بعد الاسترداد' or c.status <> 'replace' or c.sector_id <> 7 then raise exception 'update wrong: %', c; end if;
  -- تجاوز عند تعطيل التحديث
  res := public.gbs_containers_import(format('[{"code":"%s","label":"x y","latitude":"33","longitude":"44","area":"4"}]', existing_code)::jsonb, false, false);
  if (res ->> 'skipped')::int <> 1 or (res ->> 'updated')::int <> 0 then raise exception 'skip mode: %', res - 'rows'; end if;
  select count(*) into n from public.notifications where user_id = 'dd000000-0000-0000-0000-000000000007' and title like 'استرداد حاويات GBS%'; if n < 1 then raise exception 'ops colleague notice'; end if;
  select count(*) into n from public.gbs_containers_export() x where x.code = existing_code and x.area_name is not null and not x.has_photo; if n <> 1 then raise exception 'export'; end if;
  raise notice 'C1 ✅ استرداد الحاويات: محاكاة، إدراج، تحديث بالرمز، إحداثيات مدمجة، تحذيرات، إشعار، تصدير';
end $$;
select 'test ok' as result;
