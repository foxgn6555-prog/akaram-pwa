-- 20261110130000_garage_update_vehicle_drivers.sql
--
-- V-01 (تقرير P0): زر «تعديل آلية» معطّل تماماً.
--   الواجهة ترسل 17 معاملاً (`p_driver_external_id`, `p_drivers` زائدان) والدالة تقبل 15
--   ⇒ PostgREST يردّ 404 PGRST202 «الدالة غير موجودة» ⇒ لا يصل الطلب إطلاقاً.
--
-- الإصلاح (أضيق تعديل ممكن): توسيع التوقيع بالمعاملين المذكورين فقط، مع **الحفاظ الحرفي**
-- على جسم الدالة الأصلي (كل التحققات كما هي، ونفس ترتيبها ونفس رسائل الخطأ)، وإضافة
-- معالجة اختيارية للسواقين **تستدعي الدالة القائمة** `garage_set_vehicle_shift_assignment`
-- بدل تكرار منطقها.
--
-- لماذا DROP ثم CREATE وليس CREATE OR REPLACE:
--   `create or replace` بتوقيع مختلف ينشئ **زيادة تحميل** (overload) لا استبدالاً، فيبقى
--   التوقيع القديم 15 معاملاً ⇒ PostgREST قد يرفض الطلب بـ PGRST203 (التباس). لا يوجد أي
--   مستدعٍ داخلي في القاعدة (تم التحقق: 0)، والمستدعي الوحيد هو `centralGarage.updateVehicle`.
--
-- الحماية: الحارس `app.require_fleet_master_actor()` (ops_room + super_admin) يبقى أول سطر.
-- الاختبار: داخل معاملة أُرجعت (rollback) قبل التثبيت — انظر سجل الإصلاحات.

begin;

-- 1) التقاط الصلاحيات القديمة ثم الحذف
drop function if exists public.garage_update_vehicle(
  uuid, text, text, text, text, text, text, text, text, text, date, date, smallint, text, text
);

-- 2) التوقيع الجديد (17 معاملاً) — نفس الترتيب + المعاملان الجديدان في النهاية بقيم افتراضية
create or replace function public.garage_update_vehicle(
  p_vehicle_id uuid,
  p_vehicle_name text,
  p_db_number text,
  p_plate_number text,
  p_chassis_number text,
  p_image_path text default null,
  p_vehicle_category text default 'other',
  p_ownership_type text default 'owned',
  p_lessor_name text default null,
  p_rental_contract_no text default null,
  p_rental_start_date date default null,
  p_rental_end_date date default null,
  p_model_year smallint default null,
  p_vehicle_color text default null,
  p_specifications text default null,
  p_driver_external_id uuid default null,
  p_drivers jsonb default null
)
returns public.garage_vehicles
language plpgsql
security definer
set search_path to 'public', 'app'
as $function$
declare
  u uuid := app.require_fleet_master_actor();
  r public.garage_vehicles;
  d jsonb;
  d_shift text;
  d_role text;
  d_emp uuid;
  d_ext uuid;
  d_sector smallint;
  v_pass int;
  v_reason text := 'تعديل بيانات الآلية';
begin
  -- ══ التحققات الأصلية — منقولة حرفياً ══
  if p_ownership_type not in ('owned','rented') then raise exception 'GARAGE_VEHICLE_FIELDS_INVALID'; end if;
  perform app.require_garage_category(p_vehicle_category);
  if p_ownership_type = 'rented' and length(trim(coalesce(p_lessor_name,''))) < 2 then raise exception 'GARAGE_LESSOR_REQUIRED'; end if;
  if length(trim(coalesce(p_vehicle_name,''))) < 2
     or length(trim(coalesce(p_db_number,''))) < 1
     or length(trim(coalesce(p_plate_number,''))) < 1
     or length(trim(coalesce(p_chassis_number,''))) < 3 then raise exception 'GARAGE_VEHICLE_FIELDS_REQUIRED'; end if;
  if p_image_path is not null and p_image_path not like u::text||'/%' then raise exception 'GARAGE_IMAGE_PATH_INVALID'; end if;

  update public.garage_vehicles set
    vehicle_name = trim(p_vehicle_name),
    db_number = trim(p_db_number),
    plate_number = trim(p_plate_number),
    chassis_number = trim(p_chassis_number),
    image_path = coalesce(nullif(trim(coalesce(p_image_path,'')),''), image_path),
    vehicle_category = p_vehicle_category,
    ownership_type = p_ownership_type,
    lessor_name = case when p_ownership_type='rented' then nullif(trim(coalesce(p_lessor_name,'')),'') end,
    rental_contract_no = case when p_ownership_type='rented' then nullif(trim(coalesce(p_rental_contract_no,'')),'') end,
    rental_start_date = case when p_ownership_type='rented' then p_rental_start_date end,
    rental_end_date = case when p_ownership_type='rented' then p_rental_end_date end,
    model_year = p_model_year,
    vehicle_color = nullif(trim(coalesce(p_vehicle_color,'')),''),
    specifications = nullif(trim(coalesce(p_specifications,'')),''),
    updated_at = now()
  where id = p_vehicle_id and archived_at is null
  returning * into r;

  if r.id is null then raise exception 'GARAGE_VEHICLE_NOT_FOUND'; end if;

  -- ══ جديد (V-01): السائقون — تُطبَّق فقط إن أُرسلت ══
  -- بلا `p_drivers` وبلا `p_driver_external_id` ⇒ لا يُمَس أي إسناد (سلوك الواجهة الحالي).
  if p_drivers is not null and jsonb_typeof(p_drivers) = 'array' and jsonb_array_length(p_drivers) > 0 then
    if jsonb_array_length(p_drivers) > 12 then raise exception 'FLEET_DRIVERS_TOO_MANY'; end if;
    -- الأسساء أولاً ثم الاحتياطيون: الاحتياطي يشترط أساسياً قائماً في الشفت نفسه
    for v_pass in 1..2 loop
      for d in select * from jsonb_array_elements(p_drivers) loop
        d_role := coalesce(nullif(d->>'role',''), 'primary');
        if (v_pass = 1 and d_role <> 'primary') or (v_pass = 2 and d_role <> 'backup') then continue; end if;
        d_shift := coalesce(nullif(d->>'shift',''), r.shift);
        d_emp := nullif(d->>'driver_employee_id','')::uuid;
        d_ext := nullif(d->>'driver_external_id','')::uuid;
        d_sector := coalesce(nullif(d->>'sector_id','')::smallint, r.sector_id);
        perform public.garage_set_vehicle_shift_assignment(
          p_vehicle_id => r.id,
          p_shift => d_shift,
          p_driver_employee_id => d_emp,
          p_sector_id => d_sector,
          p_reason => v_reason,
          p_driver_role => d_role,
          p_driver_external_id => d_ext
        );
      end loop;
    end loop;
    -- إسناد الشفت الأساسي يحدّث جدول الآليات؛ نعيد قراءة الصف ليعود محدَّثاً
    select * into r from public.garage_vehicles where id = r.id;
  elsif p_driver_external_id is not null then
    -- المسار القديم: سائق خارجي واحد على الشفت الرئيسي للآلية
    perform public.garage_set_vehicle_shift_assignment(
      p_vehicle_id => r.id,
      p_shift => r.shift,
      p_driver_employee_id => null,
      p_sector_id => r.sector_id,
      p_reason => v_reason,
      p_driver_role => 'primary',
      p_driver_external_id => p_driver_external_id
    );
    select * into r from public.garage_vehicles where id = r.id;
  end if;

  return r;
exception when unique_violation then raise exception 'GARAGE_VEHICLE_IDENTIFIER_DUPLICATE';
end
$function$;

-- 3) الصلاحيات: مطابقة تماماً للقديمة (authenticated + service_role، بلا anon)
-- ملاحظة مقيسة: صلاحيات Supabase الافتراضية تمنح anon تنفيذ الدوال الجديدة تلقائياً
-- (ظهر anon=X فعلاً في الاختبار)، والدالة القديمة لم تكن كذلك ⇒ نسحبها صراحةً.
revoke all on function public.garage_update_vehicle(
  uuid, text, text, text, text, text, text, text, text, text, date, date, smallint, text, text, uuid, jsonb
) from public, anon;
grant execute on function public.garage_update_vehicle(
  uuid, text, text, text, text, text, text, text, text, text, date, date, smallint, text, text, uuid, jsonb
) to authenticated, service_role;

-- 4) تحديث ذاكرة PostgREST المخطّطية
notify pgrst, 'reload schema';

commit;
