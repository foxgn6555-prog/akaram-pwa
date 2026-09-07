-- سلامة هيكل قاطعي مسؤولي الأقسام وإسناد المناطق الثماني

do $$
declare
  v_user uuid;
  v_invalid_user uuid;
  v_names text[];
begin
  select array_agg(name order by sort) into v_names from public.sectors;
  if v_names is distinct from array['أرخيته','الرياض','الواثق','الجادرية','السندباد','الزعفرانية','ديالى','الوليد']::text[] then
    raise exception 'MANAGER_AREA_NAMES_MISMATCH: %', v_names;
  end if;

  if (select count(*) from public.sectors where parent_sector='karrada') <> 4
     or (select count(*) from public.sectors where parent_sector='zaafaraniya') <> 4 then
    raise exception 'MANAGER_AREA_GROUPS_MISMATCH';
  end if;

  insert into auth.users(email) values('manager-all-areas@test.local') returning id into v_user;
  insert into public.manager_profiles(user_id,shift,sectors)
  values(v_user,'morning',array[1,2,3,4,5,6,7,8]::smallint[]);

  perform set_config('request.jwt.claim.sub',v_user::text,true);
  if app.manager_owns_sectors(array[1,4,5,8]::smallint[]) is distinct from true
     or app.manager_manages_sector(8::smallint) is distinct from true then
    raise exception 'MANAGER_ALL_AREAS_ACCESS_FAILED';
  end if;
  if app.manager_manages_sector(9::smallint) is distinct from false then
    raise exception 'MANAGER_AREA_ISOLATION_FAILED';
  end if;
  perform set_config('request.jwt.claim.sub','',true);

  insert into auth.users(email) values('manager-invalid-area@test.local') returning id into v_invalid_user;
  begin
    insert into public.manager_profiles(user_id,shift,sectors)
    values(v_invalid_user,'morning',array[9]::smallint[]);
    raise exception 'MANAGER_INVALID_AREA_WAS_ACCEPTED';
  exception when check_violation then
    null;
  end;

  raise notice '✅ قاطعان، أربع مناطق لكل قاطع، وإسناد المناطق الثماني صالح';
end $$;
