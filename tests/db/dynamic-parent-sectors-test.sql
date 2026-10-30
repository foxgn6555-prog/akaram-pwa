-- 00393 · القطاعات ديناميكية (بادئة ds): جدول القطاعات، إضافة قطاع ثالث بمناطقه من التطوير المركزية، استخدامه في الشكاوى والكراج
--   والإعلام ومسؤول القاطع بلا خطأ، الإيقاف يخفي ولا يمسّ السجلات، لا قيد ولا دالة بقيت مثبّتة على القطاعين، التدقيق يسجّل.
set client_min_messages = notice;
reset role; select set_config('auth.user_id','', false);
insert into auth.users (id, email) values
  ('d5000000-0000-0000-0000-000000000008', 'ds-it@t.iq'), ('d5000000-0000-0000-0000-00000000000a', 'ds-comp@t.iq'), ('d5000000-0000-0000-0000-00000000000b', 'ds-adminops@t.iq'),
  ('d5000000-0000-0000-0000-00000000000c', 'ds-garage@t.iq'), ('d5000000-0000-0000-0000-00000000000e', 'ds-emp@t.iq')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('d5000000-0000-0000-0000-000000000008', 'it_admin'), ('d5000000-0000-0000-0000-00000000000a', 'complaints_officer'), ('d5000000-0000-0000-0000-00000000000b', 'admin_ops'),
  ('d5000000-0000-0000-0000-00000000000c', 'central_garage_officer'), ('d5000000-0000-0000-0000-00000000000e', 'employee')
on conflict do nothing;

-- ═══ S0 · لا بقايا ثابتة: لا قيد فحص ولا دالة في public/app تحتوي القطاعين حرفياً (عدا عدّادي لوحة الشكاوى المؤقتين) ═══
do $$ declare n int; r record; begin
  select count(*) into n from pg_constraint where contype = 'c' and pg_get_constraintdef(oid) like '%zaafaraniya%';
  assert n = 0, format('S0 %s check constraints still hard-code sectors', n);
  for r in select n2.nspname, p.proname from pg_proc p join pg_namespace n2 on n2.oid = p.pronamespace where n2.nspname in ('public','app') and p.prosrc like '%zaafaraniya%'
           and p.proname not in ('complaint_dashboard_summary', 'exec_overview') loop
    raise exception 'S0 function %.% still hard-codes sectors', r.nspname, r.proname;
  end loop;
  assert (select count(*) from public.parent_sectors where is_active) = 2, 'S0 seed';
  assert app.parent_sector_name('karrada') = 'الكرادة' and app.parent_sector_name('zaafaraniya') = 'الزعفرانية', 'S0 names';
  assert (select count(*) from public.sectors where is_active) >= 8, 'S0 areas active';
  raise notice 'S0 ✅ لا قيود ولا دوال مثبّتة';
end $$;

-- ═══ S1 · غير التطوير لا يضيف؛ التطوير يضيف قطاعاً ثالثاً بمنطقتين؛ الأرقام 1..8 لا تتغير ═══
select auth.set_test_user('d5000000-0000-0000-0000-00000000000a');
do $$ begin
  begin perform public.it_parent_sector_save('dora', 'الدورة'); raise exception 'S1 non-IT must fail'; exception when others then if sqlerrm <> 'IT_FORBIDDEN' then raise; end if; end;
end $$;
select auth.set_test_user('d5000000-0000-0000-0000-000000000008');
do $$ declare t jsonb; p jsonb; a jsonb; begin
  begin perform public.it_parent_sector_save('Bad Code!', 'س'); raise exception 'S1 code'; exception when others then if sqlerrm <> 'PARENT_SECTOR_CODE_INVALID' then raise; end if; end;
  begin perform public.it_parent_sector_save('dora', 'الكرادة'); raise exception 'S1 dup name'; exception when others then if sqlerrm <> 'PARENT_SECTOR_NAME_DUPLICATE' then raise; end if; end;
  t := public.it_parent_sector_save('dora', 'الدورة');
  assert jsonb_array_length(t) = 3, 'S1 three sectors: ' || t::text;
  t := public.it_area_save(null, 'dora', 'حي الميكانيك');
  t := public.it_area_save(null, 'dora', 'حي الشرطة', 5);
  begin perform public.it_area_save(null, 'dora', 'حي الشرطة'); raise exception 'S1 dup area'; exception when others then if sqlerrm <> 'AREA_NAME_DUPLICATE' then raise; end if; end;
  begin perform public.it_area_save(null, 'nowhere', 'س س'); raise exception 'S1 bad parent'; exception when others then if sqlerrm <> 'PARENT_SECTOR_INVALID' then raise; end if; end;
  select x into p from jsonb_array_elements(t) x where x->>'code' = 'dora';
  assert p->>'name' = 'الدورة' and (p->>'sort')::int = 3 and jsonb_array_length(p->'areas') = 2, 'S1 dora: ' || p::text;
  assert (select count(*) from public.sectors where parent_sector = 'dora') = 2, 'S1 areas rows';
  assert (select min(id) from public.sectors where parent_sector = 'dora') >= 9, 'S1 new ids after 8';
  assert (select string_agg(name, ',' order by id) from public.sectors where id between 1 and 8) = 'أرخيته,الرياض,الواثق,الجادرية,السندباد,الزعفرانية,ديالى,الوليد', 'S1 old areas untouched';
  assert (select code from public.sectors where parent_sector = 'dora' order by id limit 1) = 'S' || (select min(id) from public.sectors where parent_sector = 'dora'), 'S1 area code';
  -- تعديل اسم/قطاع منطقة
  select x into a from jsonb_array_elements(p->'areas') x where x->>'name' = 'حي الشرطة';
  t := public.it_area_save((a->>'id')::int, 'dora', 'حي الشرطة الجديد', 1);
  assert (select name from public.sectors where id = (a->>'id')::int) = 'حي الشرطة الجديد', 'S1 rename';
  -- تعديل اسم القطاع
  t := public.it_parent_sector_save('dora', 'قطاع الدورة');
  assert app.parent_sector_name('dora') = 'قطاع الدورة', 'S1 rename parent';
  -- سجل التدقيق
  assert (select count(*) from public.audit_logs where table_name = 'parent_sectors') >= 2, 'S1 audit parent';
  assert (select count(*) from public.audit_logs where table_name = 'sectors') >= 2, 'S1 audit areas';
  raise notice 'S1 ✅ قطاع ثالث بمنطقتين من التطوير المركزية';
end $$;

-- ═══ S2 · القطاع الجديد يُستخدم فعلاً: شكوى، قاعدة مرسل، كراج، إعلام، مسؤول قاطع، متابعة — بلا خطأ قيد ═══
reset role; select set_config('auth.user_id','', false);
do $$ declare v_id uuid; begin
  insert into public.complaints (reference_no, sector, municipal_center, source, received_at, status) values ('CMP-DS-1', 'dora', 'حي الميكانيك', 'manual', now(), 'under_review');
  insert into public.complaint_sender_rules (sector, sender_pattern, created_by) values ('dora', 'ds-pattern-%', 'd5000000-0000-0000-0000-00000000000a') on conflict do nothing;
  begin insert into public.complaints (reference_no, sector, municipal_center, source, received_at, status) values ('CMP-DS-2', 'ghost', 'x', 'manual', now(), 'under_review'); raise exception 'S2 unknown sector must fail';
  exception when foreign_key_violation then null; end;
  -- ملف الكراج
  perform set_config('auth.user_id', 'd5000000-0000-0000-0000-000000000008', true);
  perform public.garage_profile_save('d5000000-0000-0000-0000-00000000000c', 'dora');
  begin perform public.garage_profile_save('d5000000-0000-0000-0000-00000000000c', 'ghost'); raise exception 'S2 garage ghost'; exception when others then if sqlerrm not like '%INVALID%' then raise; end if; end;
  -- مسؤول القاطع والمتابعة
  perform public.sector_manager_profile_save('d5000000-0000-0000-0000-00000000000b', array['dora']);
  begin perform public.sector_manager_profile_save('d5000000-0000-0000-0000-00000000000b', array['ghost']); raise exception 'S2 smp ghost'; exception when others then if sqlerrm <> 'PARENT_SECTOR_INVALID' then raise; end if; end;
  assert exists (select 1 from public.sector_manager_options() o where o.parent_sector = 'dora' and o.name = 'قطاع الدورة' and o.areas = 2), 'S2 options include dora';
  perform set_config('auth.user_id', '', true);
  -- الإعلام
  insert into public.media_designs (title, sector_parent, period_type, period_start, period_end, created_by) values ('ds تصميم', 'dora', 'monthly', '2026-10-01', '2026-10-31', 'd5000000-0000-0000-0000-00000000000a');
  -- الكشف للجميع
  assert (select jsonb_array_length(public.sectors_tree())) = 3, 'S2 tree';
  raise notice 'S2 ✅ القطاع الجديد يعمل في كل الجداول';
exception when undefined_column or undefined_table or not_null_violation then
  raise exception 'S2 schema assumption: %', sqlerrm;
end $$;

-- ═══ S3 · الإيقاف: يختفي من القوائم والتحقق، تبقى سجلاته، لا يمكن إيقاف آخر قطاع فعّال ═══
select auth.set_test_user('d5000000-0000-0000-0000-000000000008');
do $$ declare t jsonb; begin
  t := public.it_parent_sector_set_active('dora', false);
  assert (select jsonb_array_length(public.sectors_tree())) = 2, 'S3 hidden from tree';
  assert (select jsonb_array_length(public.sectors_tree(true))) = 3, 'S3 visible to IT with inactive';
  assert (select count(*) from public.sectors where parent_sector = 'dora' and not is_active) = 2, 'S3 areas deactivated';
  assert (select count(*) from public.complaints where sector = 'dora') = 1, 'S3 records kept';
  assert app.parent_sector_name('dora') = 'قطاع الدورة', 'S3 label kept for history';
  assert not exists (select 1 from public.sector_manager_options() o where o.parent_sector = 'dora'), 'S3 options hide inactive';
  -- إعادة التفعيل
  t := public.it_parent_sector_set_active('dora', true);
  assert (select jsonb_array_length(public.sectors_tree())) = 3, 'S3 reactivated';
  assert (select count(*) from public.sectors where parent_sector = 'dora' and not is_active) = 2, 'S3 areas stay off until enabled one by one';
  t := public.it_parent_sector_set_active('dora', false);
  t := public.it_parent_sector_set_active('karrada', false);
  begin perform public.it_parent_sector_set_active('zaafaraniya', false); raise exception 'S3 last active'; exception when others then if sqlerrm <> 'PARENT_SECTOR_LAST_ACTIVE' then raise; end if; end;
  t := public.it_parent_sector_set_active('karrada', true);
  perform public.it_area_save(1, 'karrada', 'أرخيته', null, true);
  raise notice 'S3 ✅ الإيقاف بلا حذف';
end $$;
select 'test ok' as result;
