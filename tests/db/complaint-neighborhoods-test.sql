-- 00251 · بيانات المحلة والزقاق (بادئة cn): سجل المحلات لكل منطقة، التوحيد، التكرار، الصلاحيات، مناطق المسؤولين في complaint_list_managers
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
insert into auth.users (id, email) values
  ('cd000000-0000-0000-0000-00000000000a', 'cn-comp@t.iq'), ('cd000000-0000-0000-0000-00000000000b', 'cn-mgr@t.iq'), ('cd000000-0000-0000-0000-00000000000c', 'cn-emp@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('cd000000-0000-0000-0000-00000000000a', 'complaints_officer'), ('cd000000-0000-0000-0000-00000000000b', 'department_manager'), ('cd000000-0000-0000-0000-00000000000c', 'employee')
on conflict do nothing;
insert into public.employees (id, user_id, employee_number, full_name, hire_date) values
  ('cd000000-0000-0000-0000-0000000000e1', 'cd000000-0000-0000-0000-00000000000b', 'CN-MGR', 'مسؤول الواثق', '2024-01-01') on conflict (employee_number) do nothing;
insert into public.manager_profiles (user_id, shift, sectors) values ('cd000000-0000-0000-0000-00000000000b', 'morning', array[3,4]::smallint[]) on conflict (user_id) do update set sectors = excluded.sectors;
insert into public.complaints (id, reference_no, sector, municipal_center, source, received_at, status) values
  ('cd000000-0000-0000-0000-0000000000c9', 'CMP-CN-1', 'karrada', 'الواثق', 'manual', '2026-02-05 06:24:00+00', 'under_review') on conflict (id) do nothing;
insert into public.complaint_items (id, complaint_id, sequence_no, title, neighborhood, alley, status) values
  ('cd000000-0000-0000-0000-00000000009a', 'cd000000-0000-0000-0000-0000000000c9', 1, 'أنقاض', 'محلة 903', '12', 'under_review'),
  ('cd000000-0000-0000-0000-00000000009b', 'cd000000-0000-0000-0000-0000000000c9', 2, 'أنقاض', '903', '14', 'under_review')
on conflict (id) do nothing;

-- 1) التوحيد
do $$ begin
  if app.normalize_arabic_name('محلة الوَاثق  ') <> 'الواثق' then raise exception 'normalize failed: %', app.normalize_arabic_name('محلة الوَاثق  '); end if;
  if app.normalize_arabic_name('أرخيتة') <> app.normalize_arabic_name('ارخيته') then raise exception 'normalize hamza/taa failed'; end if;
  if app.normalize_arabic_name('903') <> '903' then raise exception 'normalize digits failed'; end if;
end $$;

-- 2) موظف الشكاوي يضيف محلات؛ التكرار (ولو بصيغة مختلفة) مرفوض
select auth.set_test_user('cd000000-0000-0000-0000-00000000000a');
select set_config('test.cn_id', public.complaint_neighborhood_save(null, 3::smallint, '  903 ', true)::text, false);
select public.complaint_neighborhood_save(null, 3::smallint, 'الكرادة الشرقية', true);
select public.complaint_neighborhood_save(null, 7::smallint, '903', true); -- المنطقة الأخرى مسموحة
do $$ begin
  begin perform public.complaint_neighborhood_save(null, 3::smallint, 'محلة 903', true); raise exception 'dup accepted';
  exception when others then if sqlerrm <> 'COMPLAINT_NEIGHBORHOOD_DUPLICATE' then raise; end if; end;
  begin perform public.complaint_neighborhood_save(null, 3::smallint, 'x', true); raise exception 'short accepted';
  exception when others then if sqlerrm <> 'COMPLAINT_NEIGHBORHOOD_NAME_INVALID' then raise; end if; end;
  begin perform public.complaint_neighborhood_save(null, 9::smallint, 'ok name', true); raise exception 'sector 9 accepted';
  exception when others then if sqlerrm <> 'COMPLAINT_NEIGHBORHOOD_SECTOR_INVALID' then raise; end if; end;
end $$;

-- 3) القائمة: اسم المنطقة والقاطع الأب وعدد التذاكر المطابقة (903 في الكرادة ⇒ تذكرتان؛ 903 في ديالى ⇒ صفر)
do $$ declare r record; begin
  select * into r from public.complaint_neighborhoods_list() l where l.id = current_setting('test.cn_id')::uuid;
  if r.sector_name <> 'الواثق' or r.parent_sector <> 'karrada' or r.name <> '903' or not r.is_active then raise exception 'list row wrong: %', r; end if;
  if r.usage_count <> 2 then raise exception 'usage_count expected 2 got %', r.usage_count; end if;
  select * into r from public.complaint_neighborhoods_list() l where l.sector_id = 7 and l.name = '903';
  if r.usage_count <> 0 then raise exception 'diyala usage expected 0 got %', r.usage_count; end if;
end $$;

-- 4) التعديل والتعطيل
select public.complaint_neighborhood_save(current_setting('test.cn_id')::uuid, 3::smallint, '903 أ', false);
do $$ declare r record; begin
  select * into r from public.complaint_neighborhoods where id = current_setting('test.cn_id')::uuid;
  if r.name <> '903 أ' or r.is_active then raise exception 'update failed: %', r; end if;
end $$;

-- 5) المسؤولون مع مناطقهم
do $$ declare v smallint[]; begin
  select sector_ids into v from public.complaint_list_managers() where user_id = 'cd000000-0000-0000-0000-00000000000b';
  if v is distinct from array[3,4]::smallint[] then raise exception 'manager sectors expected {3,4} got %', v; end if;
end $$;

-- 6) الصلاحيات: المسؤول يقرأ ولا يكتب؛ الموظف العادي لا يرى شيئاً
select auth.set_test_user('cd000000-0000-0000-0000-00000000000b');
do $$ declare n int; begin
  select count(*) into n from public.complaint_neighborhoods_list(); if n < 3 then raise exception 'manager cannot read list: %', n; end if;
  begin perform public.complaint_neighborhood_save(null, 3::smallint, 'ممنوع', true); raise exception 'manager write accepted';
  exception when others then if sqlerrm <> 'COMPLAINT_NEIGHBORHOOD_FORBIDDEN' then raise; end if; end;
end $$;
select auth.set_test_user('cd000000-0000-0000-0000-00000000000c');
set role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.complaint_neighborhoods; if n <> 0 then raise exception 'employee sees % rows', n; end if;
  select count(*) into n from public.complaint_neighborhoods_list(); if n <> 0 then raise exception 'employee list % rows', n; end if;
  begin insert into public.complaint_neighborhoods(sector_id, name) values (1, 'مباشر'); raise exception 'direct insert accepted';
  exception when insufficient_privilege or check_violation then null; end;
end $$;
reset role;
select 'test ok' as result;
