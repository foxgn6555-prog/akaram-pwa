-- 20261203000100–000400: حضوريات الآليات المؤجرة — اختبار العقد الكامل.
--
-- يغطّي:
--   A. القاعدة الذهبية: انطلاقة واحدة على الأقل ⇒ حاضر؛ صفر انطلاقات ⇒ غائب (بتوقيت بغداد).
--   B. المزامنة idempotent، ولا تطمس تعديلاً يدوياً.
--   C. النطاق: الآليات المملوكة لا تدخل أبداً (حتى لو انطلقت).
--   D. إعدادات التفريغ: عدد الذهاب = ceil(المطلوب / طن-التفريغة).
--   E. الضريبة: مبلغ ثابت أو نسبة، ومحجوبة عن غير المعاون.
--   F. الرواتب: شهري/يومي، خصم الغياب، والضريبة تُخصم من الصافي.
--   G. سلسلة الاعتماد: draft ← deputy_approved ← finance_paid، ولا دفع قبل الاعتماد أو مع راتب ناقص.
--   H. الفلترة بالكراج.
--
-- 🧪 يزرع بياناته بنفسه (لا يعتمد على بيانات الإنتاج) — كل ما يزرعه يُحذف في النهاية.
-- محصّن: begin … rollback.

set client_min_messages = notice;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('auth.user_id', p::text, false),
         set_config('auth.role', 'authenticated', false),
         set_config('request.jwt.claims', json_build_object('sub', p::text, 'role', 'authenticated')::text, false) $$;
create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
declare raised boolean := false; msg text;
begin
  begin execute p_sql; exception when others then raised := true; msg := sqlerrm; end;
  if not raised then raise exception 'EXPECTED_ERROR_NOT_RAISED: % (wanted %)', p_sql, p_code; end if;
  if position(p_code in msg) = 0 then raise exception 'WRONG_ERROR: got % wanted %', msg, p_code; end if;
end $$;

begin;

do $$
declare
  u_ops   uuid := 'e9300000-0000-0000-0000-000000000001';
  u_dep   uuid := 'e9300000-0000-0000-0000-000000000002';
  u_fin   uuid := 'e9300000-0000-0000-0000-000000000003';
  u_it    uuid := 'e9300000-0000-0000-0000-000000000004';
  v_rent  uuid := 'e930a000-0000-0000-0000-000000000001';   -- مؤجرة — كرادة
  v_own   uuid := 'e930a000-0000-0000-0000-000000000002';   -- مملوكة — كرادة
  v_rent2 uuid := 'e930a000-0000-0000-0000-000000000003';   -- مؤجرة — زعفرانية
  d_a     uuid := 'e930b000-0000-0000-0000-000000000001';
  d_b     uuid := 'e930b000-0000-0000-0000-000000000002';
  d_c     uuid := 'e930b000-0000-0000-0000-000000000003';
  v_day   date := (now() at time zone 'Asia/Baghdad')::date - 3;   -- يوم ماضٍ ثابت (قاعدة الحضور)
  -- شهر الرواتب: قبل شهرين عمداً — كي لا تلوّث مزامنة قاعدة الحضور (v_day) عدّاد الشهر.
  v_month date := (date_trunc('month', (now() at time zone 'Asia/Baghdad')::date) - interval '2 months')::date;
  r jsonb; n int; net numeric; st text; secs int;
  v_dim int; v_expected numeric; v_prev date; v_absent numeric;
begin
  -- ══ تهيئة المستخدمين والأدوار ═══════════════════════════════════════
  insert into auth.users (id, email) values
    (u_ops, 'rent-ops@t.iq'), (u_dep, 'rent-dep@t.iq'), (u_fin, 'rent-fin@t.iq'), (u_it, 'rent-it@t.iq')
    on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values
    (u_ops, 'ops_room'), (u_dep, 'deputy_director'), (u_fin, 'finance_officer'), (u_it, 'it_admin')
    on conflict do nothing;

  -- ══ بيانات: ٣ آليات (٢ مؤجرة + ١ مملوكة) و٣ سائقين خارجيين ══════════
  insert into public.garage_vehicles
    (id, vehicle_name, db_number, plate_number, chassis_number, image_path, driver_name, shift,
     sector_id, garage_parent_sector, vehicle_category, ownership_type, lessor_name, created_by)
  values
    (v_rent,  'كابسة كبيرة مؤجرة', 'DB-RA1', 'P-RA1', 'CH-RA001', 'g/ra1.jpg', 'سائق أ', 'morning',
     3, 'karrada', 'compactor_large', 'rented', 'شركة الكرادة للنقل', u_ops),
    (v_own,   'كابسة مملوكة',      'DB-OW1', 'P-OW1', 'CH-OW001', 'g/ow1.jpg', 'سائق و', 'morning',
     3, 'karrada', 'compactor_large', 'owned', null, u_ops),
    (v_rent2, 'كابسة مؤجرة ٢',     'DB-RA2', 'P-RA2', 'CH-RA002', 'g/ra2.jpg', 'سائق ب', 'morning',
     6, 'zaafaraniya', 'compactor_small', 'rented', 'شركة الزعفرانية', u_ops)
  on conflict (id) do nothing;

  insert into public.station_external_drivers (id, full_name, contractor_name, active, created_at)
  values (d_a, 'علي مؤجرة أ', 'شركة الكرادة للنقل', true, now()),
         (d_b, 'حسن مؤجرة ب', 'شركة الزعفرانية',  true, now()),
         (d_c, 'كريم بلا آلية', 'شركة الكرادة للنقل', true, now())
  on conflict (id) do nothing;

  -- إسناد د_b على المؤجرة الثانية **بلا أي انطلاقة** ⇒ يجب أن يُسجَّل غائباً
  insert into public.garage_vehicle_shift_assignments
    (vehicle_id, shift, driver_role, driver_name, driver_external_id, sector_id, starts_at, created_by)
  values (v_rent2, 'morning', 'primary', 'حسن مؤجرة ب', d_b, 6, v_day::timestamptz, u_ops)
  on conflict do nothing;

  -- إسناد د_a على المؤجرة الأولى فقط
  insert into public.garage_vehicle_shift_assignments
    (vehicle_id, shift, driver_role, driver_name, driver_external_id, sector_id, starts_at, created_by)
  values (v_rent, 'morning', 'primary', 'علي مؤجرة أ', d_a, 3, v_day::timestamptz, u_ops)
  on conflict do nothing;

  -- ══ A. القاعدة الذهبية: انطلاقة ⇒ حاضر ══════════════════════════════
  insert into public.garage_departures (vehicle_id, driver_name, shift, sector_id, departed_at, departed_by, driver_external_id)
  values (v_rent, 'علي مؤجرة أ', 'morning', 3, (v_day + time '06:00') at time zone 'Asia/Baghdad', u_ops, d_a),
         (v_own,  'سائق و',      'morning', 3, (v_day + time '07:00') at time zone 'Asia/Baghdad', u_ops, null);

  n := app.rented_attendance_sync_day(v_day);
  if n = 0 then raise exception 'A1: sync inserted nothing'; end if;

  if not exists (select 1 from public.rented_attendance_days
                  where driver_external_id = d_a and vehicle_id = v_rent and day = v_day and status = 'present')
  then raise exception 'A2: departure did not produce present'; end if;

  -- A4: مُسند بلا أي انطلاقة ⇒ غائب (الوجه الآخر للقاعدة الذهبية)
  if not exists (select 1 from public.rented_attendance_days
                  where driver_external_id = d_b and vehicle_id = v_rent2 and day = v_day
                    and status = 'absent' and departures_count = 0)
  then raise exception 'A4: assignment with no departure is not absent'; end if;

  -- C. المملوكة لا تدخل إطلاقاً
  if exists (select 1 from public.rented_attendance_days where vehicle_id = v_own) then
    raise exception 'C1: owned vehicle leaked into rented attendance';
  end if;

  -- C2: حتى لو انطلقت المملوكة بسائق خارجي مسجّل، لا صف لها إطلاقاً
  insert into public.garage_departures (vehicle_id, driver_name, shift, sector_id, departed_at, departed_by, driver_external_id)
  values (v_own, 'كريم بلا آلية', 'morning', 3, (v_day + time '08:00') at time zone 'Asia/Baghdad', u_ops, d_c);
  perform app.rented_attendance_sync_day(v_day);
  if exists (select 1 from public.rented_attendance_days where vehicle_id = v_own) then
    raise exception 'C2: external-driven departure on an OWNED vehicle leaked in';
  end if;

  -- B. idempotent: تكرار المزامنة لا يضاعف ولا يغيّر
  select count(*) into n from public.rented_attendance_days where day = v_day;
  perform app.rented_attendance_sync_day(v_day);
  select count(*) - n into secs from public.rented_attendance_days where day = v_day;
  if secs <> 0 then raise exception 'B1: sync not idempotent (delta %)', secs; end if;

  -- لا حاضر بلا انطلاقة: حذف الانطلاقة ثم المزامنة يقلب الحالة (يوم آخر بلا انطلاق)
  if not exists (select 1 from public.rented_attendance_days
                  where driver_external_id = d_a and vehicle_id = v_rent and day = v_day and departures_count >= 1)
  then raise exception 'A3: departures_count not recorded'; end if;

  -- ══ D. إعدادات التفريغ ══════════════════════════════════════════════
  perform pg_temp.as_user(u_ops);
  -- كابسة كبيرة: ٦ طن للتفريغة، المطلوب ٦ ⇒ تفريغة واحدة
  perform public.rented_discharge_save(v_rent, 6, 6, 'كابسة كبيرة ٦ طن');
  -- كابسة صغيرة: ٢ طن للتفريغة، المطلوب ٦ ⇒ ٣ ذهاب
  perform public.rented_discharge_save(v_rent2, 2, 6, 'كابسة صغيرة ٢ طن');

  select trips_required into secs from public.rented_discharge_list() where vehicle_id = v_rent;
  if secs <> 1 then raise exception 'D1: big compactor trips_required=% (wanted 1)', secs; end if;
  select trips_required into secs from public.rented_discharge_list() where vehicle_id = v_rent2;
  if secs <> 3 then raise exception 'D2: small compactor trips_required=% (wanted 3)', secs; end if;
  if exists (select 1 from public.rented_discharge_list() where vehicle_id = v_own) then
    raise exception 'D3: owned vehicle listed in discharge settings';
  end if;

  -- ══ E. الضريبة ══════════════════════════════════════════════════════
  perform pg_temp.as_user(u_ops);
  perform pg_temp.expect_error(
    format('select public.rented_tax_save(%L,''fixed'',50000,''اختبار'')', v_rent), 'RENTED_TAX_FORBIDDEN');

  perform pg_temp.as_user(u_dep);
  perform public.rented_tax_save(v_rent, 'fixed', 50000, 'ضريبة شهرية ثابتة');
  perform public.rented_tax_save(v_rent2, 'percent', 10, 'عشرة بالمئة من المستحق');

  select count(*) into n from public.rented_tax_list() where is_set;
  if n <> 2 then raise exception 'E1: taxes set=% (wanted 2)', n; end if;

  -- ══ F. الرواتب والتسوية ═════════════════════════════════════════════
  -- الحضور لليوم الآخر من الشهر: ٣ أيام حضور لـ d_a على v_rent
  insert into public.rented_attendance_days (driver_external_id, vehicle_id, day, status, departures_count, source, tons_discharged, trips_count)
  select d_a, v_rent, v_month + g - 1, 'present', 1, 'sync', 6, 1 from generate_series(1, 3) g
  on conflict (driver_external_id, vehicle_id, day) do nothing;
  insert into public.rented_attendance_days (driver_external_id, vehicle_id, day, status, departures_count, source)
  select d_a, v_rent, v_month + g - 1, 'absent', 0, 'sync' from generate_series(4, 10) g
  on conflict (driver_external_id, vehicle_id, day) do nothing;

  -- المالية فقط تحدّد الراتب
  perform pg_temp.as_user(u_ops);
  perform pg_temp.expect_error(
    format('select public.rented_salary_save(%L,%L,%L,''monthly'',3100000,''x'')', d_a, v_rent, v_month),
    'RENTED_SALARY_FORBIDDEN');

  perform pg_temp.as_user(u_fin);
  perform public.rented_salary_save(d_a, v_rent, v_month, 'monthly', 3100000, 'راتب شهري');
  perform public.rented_salary_save(d_b, v_rent2, v_month, 'daily', 100000, 'أجر يومي');

  -- المستحق: ٣ حضور من أصل أيام الشهر × 3,100,000 − ضريبة 50,000
  select net_amount into net from app.rented_settlement_rows(v_month)
   where driver_external_id = d_a and vehicle_id = v_rent;
  -- الحرس: الشهر يجب أن يحتوي ٣ حضور و٧ غياب بالضبط — أي تلوّث يفشل هنا صراحةً
  select present_days, absent_days into v_dim, secs from app.rented_settlement_rows(v_month)
   where driver_external_id = d_a and vehicle_id = v_rent;
  if v_dim <> 3 or secs <> 7 then
    raise exception 'F0: fixture contaminated — present=% absent=% (wanted 3/7)', v_dim, secs;
  end if;

  v_dim := extract(day from (v_month + interval '1 month' - interval '1 day'))::int;
  v_expected := round(3100000 * 3 / v_dim, 2) - 50000;
  if net is distinct from v_expected then
    raise exception 'F1: net=% expected=% (dim=%)', net, v_expected, v_dim;
  end if;

  -- F3: خصم الغياب المُعلَن = الراتب الكامل − المستحق الأساسي (الوجه المُعلَن من نفس المعادلة)
  select base_amount, absence_deduction into v_expected, net from app.rented_settlement_rows(v_month)
   where driver_external_id = d_a and vehicle_id = v_rent;
  v_absent := round(3100000 - v_expected, 2);
  if net is distinct from v_absent then
    raise exception 'F3: absence_deduction=% expected=%', net, v_absent;
  end if;

  -- الضريبة نسبة: ١٠٪ من المستحق الأساسي (لا يوجد حضور لـ d_b ⇒ الأساس ٠ ⇒ الضريبة ٠)
  select tax_amount into net from app.rented_settlement_rows(v_month)
   where driver_external_id = d_b and vehicle_id = v_rent2;
  if coalesce(net, 0) <> 0 then raise exception 'F2: percent tax on zero base = % (wanted 0)', net; end if;

  -- سائق بحضور بلا راتب: الدفع يجب أن يُرفض من أجله تحديداً
  insert into public.rented_attendance_days (driver_external_id, vehicle_id, day, status, departures_count, source)
  select d_c, v_rent, v_month + g - 1, 'present', 1, 'sync' from generate_series(1, 2) g
  on conflict (driver_external_id, vehicle_id, day) do nothing;

  -- ══ G. سلسلة الاعتماد ═══════════════════════════════════════════════
  -- لا اعتماد قبل الإرسال
  perform pg_temp.as_user(u_dep);
  perform pg_temp.expect_error(
    format('select public.rented_month_decide_deputy(%L,true,null)', v_month), 'RENTED_MONTH_NOT_SUBMITTED');

  -- لا إرسال لشهر جارٍ
  perform pg_temp.as_user(u_ops);
  perform pg_temp.expect_error(
    format('select public.rented_month_submit(%L)', date_trunc('month', (now() at time zone 'Asia/Baghdad')::date)),
    'RENTED_MONTH_NOT_ENDED');

  -- إرسال الشهر الماضي (يُختار شهر منتهٍ فعلاً)
  -- نستخدم شهر الرواتب النظيف نفسه (منتهٍ بلا شك، وقبل شهرين)
  v_prev := v_month;
  perform public.rented_month_submit(v_prev);
  select status into st from public.rented_attendance_months where month = v_prev;
  if st <> 'draft' then raise exception 'G1: submit status=% (wanted draft)', st; end if;

  -- المالية لا تدفع قبل اعتماد المعاون
  perform pg_temp.as_user(u_fin);
  perform pg_temp.expect_error(
    format('select public.rented_month_pay(%L,null)', v_prev), 'RENTED_MONTH_NOT_APPROVED');

  -- المعاون يعتمد
  perform pg_temp.as_user(u_dep);
  perform public.rented_month_decide_deputy(v_prev, true, 'معتمد');
  select status into st from public.rented_attendance_months where month = v_prev;
  if st <> 'deputy_approved' then raise exception 'G2: deputy status=% (wanted deputy_approved)', st; end if;

  -- المالية تدفع — لكن سائقاً بحضور بلا راتب ⇒ يجب أن يُرفض
  perform pg_temp.as_user(u_fin);
  perform pg_temp.expect_error(
    format('select public.rented_month_pay(%L,null)', v_prev), 'RENTED_SALARY_MISSING');

  -- بعد استكمال الراتب الناقص: الدفع ينجح وتُغلق السلسلة
  perform public.rented_salary_save(d_c, v_rent, v_month, 'daily', 120000, 'استكمال الراتب');
  perform public.rented_month_pay(v_prev, 'صُرف');
  select status into st from public.rented_attendance_months where month = v_prev;
  if st <> 'finance_paid' then raise exception 'G3: pay status=% (wanted finance_paid)', st; end if;

  -- لا تعديل راتب بعد الدفع
  perform pg_temp.expect_error(
    format('select public.rented_salary_save(%L,%L,%L,''monthly'',999,''بعد الدفع'')', d_a, v_rent, v_month),
    'RENTED_MONTH_LOCKED');

  -- ولا اعتماد ثانٍ بعد الدفع
  perform pg_temp.as_user(u_dep);
  perform pg_temp.expect_error(
    format('select public.rented_month_decide_deputy(%L,true,null)', v_prev), 'RENTED_MONTH_WRONG_STATE');

  -- ══ J. التعديل اليدوي لا تطمسه المزامنة ══════════════════════════════
  -- (d_a حاضر بانطلاقة؛ نجعله غائباً يدوياً ثم نعيد المزامنة)
  insert into public.garage_departures (vehicle_id, driver_name, shift, sector_id, departed_at, departed_by, driver_external_id)
  values (v_rent, 'علي مؤجرة أ', 'morning', 3, (v_day + time '06:00') at time zone 'Asia/Baghdad', u_ops, d_a)
  on conflict do nothing;
  perform app.rented_attendance_sync_day(v_day);

  perform pg_temp.as_user(u_ops);
  perform pg_temp.expect_error(
    format('select public.rented_attendance_set_day(%L,%L,%L,''absent'',''x'')', d_a, v_rent, v_day),
    'RENTED_ATT_REASON_REQUIRED');
  perform public.rented_attendance_set_day(d_a, v_rent, v_day, 'absent', 'الانطلاقة كانت لسائق آخر');

  -- المزامنة من جديد يجب ألا تُرجع الصف إلى 'present'
  perform app.rented_attendance_sync_day(v_day);
  select status || ':' || source into st from public.rented_attendance_days
   where driver_external_id = d_a and vehicle_id = v_rent and day = v_day;
  if st <> 'absent:manual' then
    raise exception 'J1: manual override lost after re-sync — got %', st;
  end if;

  -- ══ H. الفلترة بالكراج ══════════════════════════════════════════════
  perform pg_temp.as_user(u_ops);
  r := public.rented_attendance_month(v_month, 'karrada');
  if exists (select 1 from jsonb_array_elements(r->'rows') e where e->>'garage_parent_sector' <> 'karrada') then
    raise exception 'H1: garage filter leaked another garage';
  end if;
  r := public.rented_attendance_month(v_month, null);
  if jsonb_array_length(r->'rows') = 0 then raise exception 'H2: unfiltered month returned no rows'; end if;

  -- ══ I. الحجب عن غير المصرّح ═════════════════════════════════════════
  perform pg_temp.as_user(u_it);
  perform pg_temp.expect_error(
    format('select public.rented_attendance_month(%L,null)', v_month), 'RENTED_ATT_FORBIDDEN');

  -- علامة اكتمال: تُقرأ آلياً من مشغّل الاختبار لإثبات أن الملف وصل إلى آخر سطر ولم يخرج مبكراً.
  -- تُلغى بالـ rollback مع بقية الزرع، فلا أثر لها في قاعدة البيانات.
  insert into public.rented_attendance_months (month, status)
  values (date '1990-01-01', 'draft')
  on conflict (month) do nothing;

  raise notice '✔ كل فحوص حضوريات الآليات المؤجرة نجحت (A–I)';
end $$;

rollback;
