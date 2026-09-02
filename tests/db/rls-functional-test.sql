-- ═══════════════════════════════════════════════════════════════
-- اختبار وظيفي حي لعزل بيانات مسؤولي القواطع (يعمل على قاعدة مُهاجَر لها)
-- ينشئ مديرين بقواطع مختلفة ويتحقق أن كلاً منهما يرى/يكتب قواطعه فقط.
-- يُطبَّق بـ: psql -d akram_mig_test -f tests/db/rls-functional-test.sql
-- ═══════════════════════════════════════════════════════════════
\timing off
\set ON_ERROR_STOP on

-- ⓪ تنظيف أي بيانات من تشغيل سابق (قابلية تكرار)
delete from public.sector_attendance;
delete from public.sector_photos;
delete from public.sector_breakdowns;
delete from public.sector_supply_requests;
delete from public.sector_vehicles;
delete from public.sector_workers;
delete from public.manager_profiles;
delete from public.user_roles where user_id in
  ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333');
delete from public.employees where user_id in
  ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
delete from auth.users where id in
  ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333');

-- ① مستخدمان في auth.users
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'manager1@akram.iq'),
  ('22222222-2222-2222-2222-222222222222', 'manager2@akram.iq')
on conflict (id) do nothing;

-- ربط سجلات موظفين (لاشتقاق الاسم)
insert into public.employees (id, user_id, employee_number, full_name) values
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'MGR-T1', 'مدير القاطع الأول'),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'MGR-T2', 'مدير القاطع الثاني')
on conflict (employee_number) do nothing;

-- ② الأدوار
insert into public.user_roles (user_id, role) values
  ('11111111-1111-1111-1111-111111111111','department_manager'),
  ('22222222-2222-2222-2222-222222222222','department_manager')
on conflict do nothing;

-- ③ ملفات الإسناد: مدير1 = قواطع {1} صباحي · مدير2 = قواطع {2,3} مسائي
insert into public.manager_profiles (user_id, shift, sectors) values
  ('11111111-1111-1111-1111-111111111111','morning','{1}'),
  ('22222222-2222-2222-2222-222222222222','evening','{2,3}')
on conflict (user_id) do update set shift=excluded.shift, sectors=excluded.sectors;

-- ④ عمال/آليات كل مدير (بصفة مالك عبر superuser للتهيئة)
insert into public.sector_workers (full_name, sector_id, shift, created_by)
values ('عامل-قاطع1', 1, 'morning', '11111111-1111-1111-1111-111111111111')
on conflict do nothing;
insert into public.sector_workers (full_name, sector_id, shift, created_by)
values ('عامل-قاطع2', 2, 'evening', '22222222-2222-2222-2222-222222222222')
on conflict do nothing;
insert into public.sector_vehicles (db_number, sector_id, shift, created_by)
values ('DB-100', 1, 'morning', '11111111-1111-1111-1111-111111111111')
on conflict do nothing;
insert into public.sector_vehicles (db_number, sector_id, shift, created_by)
values ('DB-200', 3, 'evening', '22222222-2222-2222-2222-222222222222')
on conflict do nothing;

-- ═══════════════ الاختبارات كدور authenticated مع هوية مدير1 ═══════════════
set role authenticated;
set local role authenticated;
select set_config('auth.user_id','11111111-1111-1111-1111-111111111111', false);
select set_config('auth.role','authenticated', false);
select set_config('request.jwt.claims', json_build_object('sub','11111111-1111-1111-1111-111111111111','role','authenticated')::text, false);

-- ت1: يرى عمال قاطعه فقط (1 عامل)
do $$
declare n int;
begin
  select count(*) into n from public.sector_workers where archived_at is null;
  raise notice 'T1 مدير1 يرى % عاملاً (المتوقع 1)', n;
  if n <> 1 then raise exception 'T1 FAIL: المدير1 رأى % عاملاً بدل 1', n; end if;
end $$;

-- ت2: يرى آليته فقط
do $$
declare n int;
begin
  select count(*) into n from public.sector_vehicles where archived_at is null;
  raise notice 'T2 مدير1 يرى % آلية (المتوقع 1)', n;
  if n <> 1 then raise exception 'T2 FAIL: المدير1 رأى % آلية بدل 1', n; end if;
end $$;

-- ت3: current_manager_sectors يعيد {1}
do $$
declare s smallint[];
begin
  select app.current_manager_sectors() into s;
  raise notice 'T3 قواطع مدير1 = % (المتوقع {1})', s;
  if s <> array[1]::smallint[] then raise exception 'T3 FAIL: %', s; end if;
end $$;

-- ت4: إضافة عامل لقاطع خارجي عبر RPC يجب أن تفشل
do $$
begin
  perform public.sector_add_worker('مخترق'::text, 2::smallint, 'morning'::text);
  raise exception 'T4 FAIL: سُمح بإضافة عامل لقاطع 2 من مدير قاطع 1';
exception
  when others then
    if sqlerrm like '%قواطعك%' then
      raise notice 'T4 ✅ رُفضت إضافة عامل لقاطع خارجي: %', sqlerrm;
    else
      raise;
    end if;
end $$;

-- ت5: إضافة آلية لقاطع خارجي يجب أن تفشل
do $$
begin
  perform public.sector_add_vehicle('DB-HACK'::text, 2::smallint, 'morning'::text);
  raise exception 'T5 FAIL: سُمح بإضافة آلية لقاطع خارجي';
exception
  when others then
    if sqlerrm like '%قواطعك%' then
      raise notice 'T5 ✅ رُفضت إضافة آلية لقاطع خارجي';
    else
      raise;
    end if;
end $$;

-- ت6: إدخال مباشر لجدول العمال بقاطع خارجي يجب أن يمنعه RLS
do $$
begin
  insert into public.sector_workers (full_name, sector_id, shift, created_by)
  values ('تسلل', 2, 'morning', auth.uid());
  raise exception 'T6 FAIL: RLS سمح بإدخال مباشر لقاطع خارجي';
exception
  when others then
    if sqlerrm like '%rls%' or sqlerrm like '%policy%' or sqlerrm like '%new row%' then
      raise notice 'T6 ✅ RLS منع الإدخال المباشر لقاطع خارجي';
    else
      raise;
    end if;
end $$;

-- ت7: كتاب مستلزمات عبر RPC: يثبّت الهوية من الخادم (اسم المدير + القواطع)
do $$
declare r public.sector_supply_requests;
begin
  select * into r from public.sector_submit_supply('أكياس نفايات'::text, 50::integer, 'ملاحظة'::text, true::boolean);
  raise notice 'T7 كتاب: ref=% مدير=% قواطع=%', r.ref_no, r.manager_name, r.sectors;
  if r.manager_name <> 'مدير القاطع الأول' then raise exception 'T7 FAIL اسم المدير: %', r.manager_name; end if;
  if r.sectors <> array[1]::smallint[] then raise exception 'T7 FAIL قواطع: %', r.sectors; end if;
  if r.signed is not true then raise exception 'T7 FAIL التوقيع غير مثبت'; end if;
end $$;

-- ت8: إرسال كتاب بدون توقيع يجب أن يفشل
do $$
begin
  perform public.sector_submit_supply('بلا توقيع'::text, 5::integer, null::text, false::boolean);
  raise exception 'T8 FAIL: قُبل كتاب بدون توقيع';
exception
  when others then
    if sqlerrm like '%توقيع%' or sqlerrm like '%إقرار%' then
      raise notice 'T8 ✅ رُفض كتاب بدون توقيع: %', sqlerrm;
    else
      raise;
    end if;
end $$;

-- ت9: لا يرى كتب مدير2 (ولا أي صف له)
do $$
declare n int;
begin
  select count(*) into n from public.sector_supply_requests where manager_id <> auth.uid();
  raise notice 'T9 كتب المديرين الآخرين المرئية لمدير1 = % (المتوقع 0)', n;
  if n <> 0 then raise exception 'T9 FAIL: تسرب % من كتب الغير', n; end if;
end $$;

reset role;

-- ═══════════════ اختبارات مدير2 ═══════════════
set role authenticated;
set local role authenticated;
select set_config('auth.user_id','22222222-2222-2222-2222-222222222222', false);
select set_config('auth.role','authenticated', false);

-- ت10: مدير2 يرى عامليه فقط (قاطعا 2،3 → عامل واحد مُدخل = قاطع2)
do $$
declare n int;
begin
  select count(*) into n from public.sector_workers where archived_at is null;
  raise notice 'T10 مدير2 يرى % عاملاً (المتوقع 1)', n;
  if n <> 1 then raise exception 'T10 FAIL: %', n; end if;
end $$;

-- ت11: تسجيل حضور لعامل قاطع1 (ليس ضمن قواطعه) يجب أن يفشل:
-- إما يراه RLS «غير موجود» (مخفي) أو يرفضه فحص ملكية القاطع
do $$
declare w_id uuid;
begin
  select id into w_id from public.sector_workers where full_name='عامل-قاطع1' limit 1;
  perform public.sector_set_attendance(w_id, current_date, true::boolean, null::text);
  raise exception 'T11 FAIL: سُجل حضور عامل قاطع خارجي';
exception
  when others then
    if sqlerrm like '%قواطعك%' or sqlerrm like '%العامل غير موجود%' then
      raise notice 'T11 ✅ رُفض تسجيل حضور عامل قاطع خارجي: %', sqlerrm;
    else
      raise;
    end if;
end $$;

-- ت12: تسجيل حضور عامله نفسه (قاطع2) يجب أن ينجح، ثم يظهر حاضر
do $$
declare w_id uuid; v_present boolean;
begin
  select id into w_id from public.sector_workers where full_name='عامل-قاطع2' limit 1;
  perform public.sector_set_attendance(w_id, current_date, true::boolean, null::text);
  select is_present into v_present from public.sector_attendance where worker_id = w_id;
  if v_present is not true then raise exception 'T12 FAIL: حضور عامل قاطعه غير مسجل'; end if;
  raise notice 'T12 ✅ سُجل حضور عامل قاطع2 لمدير2 بنجاح';
end $$;

reset role;

-- ═══════════════ اختبارات المعاون: يرى كل الكتب ═══════════════
do $$
declare u uuid := '33333333-3333-3333-3333-333333333333';
begin
  insert into auth.users (id, email) values (u, 'deputy@akram.iq') on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (u,'deputy_director');
end $$;

set role authenticated;
set local role authenticated;
select set_config('auth.user_id','33333333-3333-3333-3333-333333333333', false);

-- ت13: المعاون يرى كتاب مدير1 (على الأقل 1، من كل المديرين)
do $$
declare n int;
begin
  select count(*) into n from public.sector_supply_requests;
  raise notice 'T13 المعاون يرى % كتاباً (المتوقع >=1 من كل المديرين)', n;
  if n < 1 then raise exception 'T13 FAIL: المعاون لم ير الكتب'; end if;
end $$;
reset role;

-- ═══════════════ التسلسل والتحقق من تدفق الصور ═══════════════
-- ت14: رقم الكتاب الثاني لمدير1 يتسلسل (0002)
set role authenticated;
set local role authenticated;
select set_config('auth.user_id','11111111-1111-1111-1111-111111111111', false);
do $$
declare r public.sector_supply_requests;
begin
  select * into r from public.sector_submit_supply('قفازات عمل'::text, 200::integer, null::text, true::boolean);
  raise notice 'T14 رقم الكتاب الثاني = % (المتوقع أن ينتهي 0002)', r.ref_no;
  if r.ref_no not like '%/0002' then raise exception 'T14 FAIL: التسلسل خاطئ: %', r.ref_no; end if;
end $$;

-- ت15: تسجيل صورة عبر RPC (بعد رفع Storage) يثبّت اسم/قواطع المدير
do $$
declare p public.sector_photos;
begin
  select * into p from public.sector_register_photo('11111111-1111-1111-1111-111111111111/x.jpg'::text, 'صورة ميدانية'::text);
  raise notice 'T15 صورة مسجلة: مدير=% قواطع=%', p.manager_name, p.sectors;
  if p.manager_name <> 'مدير القاطع الأول' then raise exception 'T15 FAIL'; end if;
  if p.sectors <> array[1]::smallint[] then raise exception 'T15 FAIL قواطع صورة: %', p.sectors; end if;
end $$;
reset role;

-- ت16: بلاغ عطل عبر RPC لمدير2 يحمل قواطعه {2,3}
set role authenticated;
set local role authenticated;
select set_config('auth.user_id','22222222-2222-2222-2222-222222222222', false);
do $$
declare b public.sector_breakdowns;
begin
  select * into b from public.sector_submit_breakdown('DB-200'::text,'عطل هيدروليك'::text,null::text);
  raise notice 'T16 بلاغ: مدير=% قواطع=% DB=%', b.manager_name, b.sectors, b.db_number;
  if b.sectors <> array[2,3]::smallint[] then raise exception 'T16 FAIL قواطع البلاغ: %', b.sectors; end if;
end $$;
reset role;

\echo '════════════ ✅ كل اختبارات العزل الوظيفية نجحت (16 اختباراً) ════════════'
