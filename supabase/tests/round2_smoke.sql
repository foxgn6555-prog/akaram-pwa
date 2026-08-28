begin;
-- ═══════════════════════════════════════════════════════════════
-- دخان الجولة 2: فروع · مصفوفة صلاحيات · بوابات ديناميكية · بصمة · GPS
-- كل فشل = EXCEPTION
-- ═══════════════════════════════════════════════════════════════
-- جدول تشخيص دائم (يُنظف عند بداية كل تشغيل)
create table if not exists public._round2_diag (
  id serial primary key,
  step text not null,
  note text not null,
  at timestamptz default now()
);
truncate public._round2_diag;

do $$
declare
  it_u uuid; target_u uuid; emp_u uuid; super_u uuid;
  branch1 uuid; portal1 uuid; unit1 uuid; vehicle1 uuid; pos_vehicle uuid;
  r boolean; ingested integer;

  diag text;
begin
  -- بذر الأشخاص
  insert into auth.users (email) values ('r2-it@akram.iq')  returning id into it_u;
  insert into auth.users (email) values ('r2-tgt@akram.iq') returning id into target_u;
  insert into auth.users (email) values ('r2-emp@akram.iq') returning id into emp_u;
  insert into auth.users (email) values ('r2-sup@akram.iq') returning id into super_u;
  insert into public.user_roles (user_id, role) values
    (it_u, 'it_admin'), (target_u, 'hr_officer'), (emp_u, 'employee'), (super_u, 'super_admin');

  -- سجل موظف (تحتاجه وحدة البصمة لربط PIN)
  insert into public.employees (user_id, employee_number, full_name)
  values (emp_u, '1001', 'موظف بصمة تجريبي');

  -- ═══ ① الفروع ═══
  insert into public.branches (name, code, city) values ('فرع الكرادة', 'KRR', 'بغداد') returning id into branch1;
  if (select count(*) from public.branches where code = 'KRR') <> 1 then
    raise exception '❌ الفروع: لم تُنشأ';
  end if;
  raise notice '✅ الفروع: أُنشئ فرع وربط employees.branch_id';

  -- ═══ ② مصفوفة الصلاحيات ═══
  -- منح صفحة لدور HR
  insert into public.role_page_permissions (role, page_key, effect, granted_by)
  values ('hr_officer', 'it.db.tables', 'grant', it_u);
  -- إخفاء صفحة عن HR
  insert into public.role_page_permissions (role, page_key, effect, granted_by)
  values ('hr_officer', 'employee.dashboard', 'hide', it_u);
  -- قفل فردي: HR ممنوع من صفحة ممنوح له دورياً
  insert into public.user_page_overrides (user_id, page_key, effect, reason, created_by)
  values (target_u, 'it.db.tables', 'lock', 'إجازة طويلة — قفل احترازي', it_u);
  -- فتح فردي: موظف مسموح له بصفحة خارج دوره
  insert into public.user_page_overrides (user_id, page_key, effect, created_by)
  values (emp_u, 'it.users.list', 'allow', it_u);

  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', target_u::text, false);
  r := public.can_i_see('it.db.tables');
  if r then raise exception '❌ المصفوفة: المقفل يرى صفحته الممنوحة!'; end if;
  raise notice '✅ المصفوفة: القفل الفردي يتجاوز المنح الدوري (lock يفوز)';

  r := public.can_i_see('employee.dashboard');
  if r then raise exception '❌ المصفوفة: HR يرى صفحة مخفية عن دوره!'; end if;
  raise notice '✅ المصفوفة: إخفاء الدور يعمل';

  r := public.can_i_see('hr.employees');
  if not r then raise exception '❌ المصفوفة: HR لا يرى صفحته الافتراضية!'; end if;
  raise notice '✅ المصفوفة: الافتراضي (دور البوابة يرى صفحاته) يعمل';

  perform set_config('request.jwt.claim.sub', emp_u::text, false);
  r := public.can_i_see('it.users.list');
  if not r then raise exception '❌ المصفوفة: الفتح الفردي لم يعمل!'; end if;
  raise notice '✅ المصفوفة: الفتح الفردي يتجاوز الدور (allow يفوز)';

  r := public.can_i_see('it.db.errors');
  if r then raise exception '❌ المصفوفة: موظف يرى صفحة IT!'; end if;
  raise notice '✅ المصفوفة: الرفض الافتراضي يعمل';

  -- عزل البوابات: it_admin يرى صفحات it فقط (حتى لو مفتاحها ممنوح لدور آخر بلا منح له)
  perform set_config('request.jwt.claim.sub', it_u::text, false);
  if public.can_i_see('admin.backup') then
    raise exception '❌ المصفوفة: it_admin يرى صفحة admin!';
  end if;
  if not public.can_i_see('it.db.errors') then
    raise exception '❌ المصفوفة: it_admin لا يرى صفحة بوابته!';
  end if;
  raise notice '✅ المصفوفة: عزل البوابات بين الأدوار يعمل (يرى بوابته حصراً)';

  -- super_admin يرى كل الصفحات افتراضياً (استثناء وحيد موثق)
  perform set_config('request.jwt.claim.sub', super_u::text, false);
  if not public.can_i_see('admin.backup') or not public.can_i_see('it.users.list') then
    raise exception '❌ المصفوفة: super_admin لا يرى كل الصفحات';
  end if;
  raise notice '✅ المصفوفة: super_admin الرؤية الشاملة';

  -- ═══ ③ البوابات الديناميكية ═══
  perform set_config('role', 'postgres', false);
  insert into public.dynamic_portals (slug, name, icon, color, created_by)
  values ('ops', 'بوابة العمليات', 'bar-chart', '#d97706', it_u) returning id into portal1;
  insert into public.portal_units (portal_id, unit_key, label, icon, page_keys, sort_order)
  values (portal1, 'tracking', 'التتبع الميداني', 'activity', array['ops.tracking.map'], 0) returning id into unit1;

  if (select count(*) from public.portal_units where portal_id = portal1) <> 1 then
    raise exception '❌ البوابات: الوحدة لم تُنشأ';
  end if;

  -- منح الدور الديناميكي
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', it_u::text, false);
  begin
    perform public.set_user_role(target_u, 'portal:ops', true);
  exception when others then
    raise exception '❌ البوابات: set_user_role رفض: [%] %', sqlstate, sqlerrm;
  end;
  raise notice '🔍 فور النداء: user_roles rows=%', (select count(*) from public.user_roles);
  -- التحقق عبر صلاحية عالية (RLS يخفي صفوف الآخرين عن authenticated — وهذا صحيح أمنياً!)
  perform set_config('role', 'postgres', false);
  if not exists (select 1 from public.user_roles where user_id = target_u and role = 'portal:ops') then
    raise exception '❌ البوابات: الدور الديناميكي لم يُمنح';
  end if;
  raise notice '✅ البوابات: أُنشئت بوابة ديناميكية + وحدة + دُور منح لشخص';
  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', it_u::text, false);
  reset role;
  -- ═══ ④ البصمة: جهاز + دفعة ATTLOG ═══
  insert into public.biometric_devices (serial_number, name, branch_id)
  values ('ZK-TEST-001', 'جهاز المدخل الرئيسي', branch1);

  -- ربط موظف البصمة بالفرع
  update public.employees set branch_id = branch1 where user_id = emp_u;

  perform set_config('role', 'authenticated', false);
  perform set_config('request.jwt.claim.sub', it_u::text, false);
  -- دفعة: حضور + انصراف + سطر فاسد
  ingested := public.biometric_ingest('ZK-TEST-001',
    '1001 2026-08-27 08:02:11 0 15
1001 2026-08-27 16:05:44 1 15
9999 2026-08-27 12:00:00 1 1',
    'ATTLOG');
  if ingested <> 2 then
    insert into public._round2_diag (step, note)
    select 'biometric', coalesce(error_note, 'OK') from public.biometric_pushes;
    select string_agg(step || ': ' || note, ' | ') into diag from public._round2_diag where step='biometric';
    raise exception '❌ البصمة: قُبل % بدل 2 | diag=% | emp1001=%',
      ingested, diag,
      (select count(*) from public.employees where employee_number='1001');
  end if;
  raise notice '✅ البصمة: دفعة 3 أسطر → حضور وانصراف مسجلا + سطر مجهول مرفوض';

  -- التحقق بصلاحية عالية (RLS يخفي سجل حضور الموظف عن it_admin — سلوك أمني صحيح!)
  perform set_config('role', 'postgres', false);
  if (select count(*) from public.attendance_records
      where work_date = '2026-08-27' and check_in is not null and check_out is not null) < 1 then
    raise exception '❌ البصمة: سجل الحضور لم يتحدث بالدفعين';
  end if;
  raise notice '✅ البصمة: دفعة 3 أسطر → حضور وانصراف مسجلا + سطر مجهول مرفوض';
  raise notice '✅ البصمة: check_in + check_out في سجل واحد (merge)';

  -- جهاز غير مسجل → رفض
  perform set_config('role', 'postgres', false);
  if public.biometric_ingest('FAKE-SN', '1001 2026-08-27 08:00:00 1 1') <> 0 then
    raise exception '❌ البصمة: جهاز مزيف قُبل!';
  end if;
  raise notice '✅ البصمة: جهاز غير مسجل مرفوض';

  perform set_config('role', 'postgres', false);

  -- ═══ ⑤ GPS ═══
  perform set_config('role', 'postgres', false);
  insert into public.vehicles (plate, name, device_unique_id)
  values ('بغداد-1234', 'شاحنة نقل النظافة', 'TRK-0001') returning id into vehicle1;

  pos_vehicle := public.gps_ingest('TRK-0001', 33.3152, 44.3661, 65.5, 180, true,
                                   '2026-08-27T10:00:00Z'::timestamptz);
  if pos_vehicle is null then raise exception '❌ GPS: موقع لم يُقبل'; end if;
  if public.gps_ingest('UNKNOWN-TRK', 0, 0, 0, null, null, now()) is not null then
    raise exception '❌ GPS: مركبة مجهولة قُبلت!';
  end if;
  reset role;
  raise notice '✅ GPS: موقع قُبل لمركبة معروفة + مجهولة مرفوضة';

  raise notice '';
  raise notice '═══ ✅ دخان الجولة 2 اكتمل — كل الوحدات الجديدة تعمل ═══';
end $$;

commit;
