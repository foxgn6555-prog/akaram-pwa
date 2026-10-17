-- 00237 — super_admin يفتح بوابتي الصيانة ومحطة التحويل بلا FORBIDDEN.
-- 28 دالة كانت تتحقق من الدور الفعلي فقط (maintenance / transfer_station) خلافاً لبقية المنصة
-- حيث يُضاف super_admin دائماً. التحقق فيها بوابة دخول فقط (لا تخصيص حسب المستخدم)،
-- لذا تُعاد كتابتها آلياً بإضافة 'super_admin' إلى قائمة الأدوار مع ضمانات صارمة.
do $$
declare
  f text; def text; new_def text; n int := 0;
  fns text[] := array[
    'maintenance_add_part','maintenance_advance_stage','maintenance_approve_readiness','maintenance_assign_technician',
    'maintenance_case_days','maintenance_cases_for_day','maintenance_complete_case','maintenance_confirm_arrival',
    'maintenance_dispatch_vehicle','maintenance_install_issued_part','maintenance_inventory_create','maintenance_inventory_receive',
    'maintenance_issue_inventory','maintenance_purchase_create','maintenance_register_attachment','maintenance_release_technician',
    'maintenance_return_issued_part','maintenance_technicians','maintenance_update_case','maintenance_vehicle_cases',
    'station_confirm_vehicle_arrival','station_dispatch_vehicle','station_movement_days','station_vehicle_movements','station_visits_for_day',
    -- رحلات مدير القطاع (قراءة فقط؛ النتيجة مُقيَّدة بالمستلم نفسه فتعود فارغة للـ super_admin بدل خطأ)
    'manager_vehicle_trip_days','manager_vehicle_trips','manager_vehicle_trips_for_day'];
  r record;
begin
  foreach f in array fns loop
    for r in select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = f loop
      def := pg_get_functiondef(r.oid);
      new_def := replace(replace(def,
        'app.has_role(array[''maintenance''])',      'app.has_role(array[''maintenance'',''super_admin''])'),
        'app.has_role(array[''transfer_station''])', 'app.has_role(array[''transfer_station'',''super_admin''])');
      if f like 'manager\_%' then
        new_def := replace(def, 'app.has_role(array[''department_manager''])', 'app.has_role(array[''department_manager'',''super_admin''])');
      end if;
      if new_def = def then raise exception '00237: لم يُعثر على فحص الدور في %', f; end if;
      -- ضمان: استبدال واحد فقط (بوابة الدخول) ولا اشتقاق أدوار داخل الدالة
      if (length(def) - length(replace(def, 'app.has_role(array[''', ''))) / length('app.has_role(array[''') <> 1
      then raise exception '00237: أكثر من فحص دور في % — راجع يدوياً', f; end if;
      execute new_def;
      n := n + 1;
    end loop;
  end loop;
  if n < 28 then raise exception '00237: المتوقع 28 دالة، أُعيد تعريف %', n; end if;
  raise notice '00237: أُعيد تعريف % دالة', n;
end $$;
