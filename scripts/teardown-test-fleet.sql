-- =============================================================================
-- teardown-test-fleet.sql
-- حذف أسطول الاختبار بالكامل (٢٤ آلية + ٢٤ سائقاً + الربط + الزيارات المُولَّدة)
--
-- مُعرِّفات الحذف:
--   garage_vehicles.plate_number   LIKE 'TEST-%'   (TEST-001 .. TEST-024)
--   employees.employee_number      LIKE 'DRV-T%'   (DRV-T01 .. DRV-T24)
--   gps_vehicle_bindings           مرتبطة بالآليات أعلاه
--
-- ⚠️ سبب الترتيب الإلزامي:
--   map_visits.vehicle_id → garage_vehicles(id) هو ON DELETE SET NULL،
--   لذا حذف الآلية أولاً يُنتِج 1915 زيارة يتيمة (vehicle_id = NULL) بدل حذفها.
--   لذلك تُحذف map_visits صراحةً في البداية.
--
--   الجداول التابعة الأخرى (attendance, payslips, requests, hr_leaves, advances,
--   garage_departures, ts_*, gps_zone_*, gps_operational_alerts, geofences)
--   تم التحقق من كونها = 0 صفاً لهذا الأسطول بتاريخ 2026-11-19،
--   لكن نُبقي الحذف الوقائي فيها لسلامة التنفيذ مستقبلاً (كلها idempotent).
--
--   gps_devices / gps_device_positions / gps_device_position_history
--   **لا تُحذف** — أجهزة GPS حقيقية تابعة للمشروع، لا ملك للأسطول التجريبي.
--
-- يُنفَّذ داخل معاملة واحدة: نجاح كامل أو تراجع كامل.
-- =============================================================================

begin;

-- تصفير مهلة MCP ليس ضرورياً: الحذف ~2,000 صف فقط.
set local statement_timeout = '120s';

-- --- التقاط المُعرِّفات مرة واحدة (قبل أي حذف) ------------------------------
create temp table _tf_vehicles on commit drop as
  select id from public.garage_vehicles where plate_number like 'TEST-%';

create temp table _tf_employees on commit drop as
  select id from public.employees where employee_number like 'DRV-T%';

-- --- 1) زيارات الخريطة (قبل الآليات — FK هو SET NULL) ----------------------
delete from public.map_visits v
 where v.vehicle_id in (select id from _tf_vehicles);

-- --- 2) طبقة GPS التشغيلية المرتبطة بالآليات ------------------------------
delete from public.gps_operational_alerts a
 where a.garage_vehicle_id in (select id from _tf_vehicles);

delete from public.gps_zone_events e
 where e.garage_vehicle_id in (select id from _tf_vehicles);

delete from public.gps_zone_presence_state p
 where p.garage_vehicle_id in (select id from _tf_vehicles);

delete from public.gps_vehicle_geofences g
 where g.garage_vehicle_id in (select id from _tf_vehicles);

-- --- 3) الربط بالأجهزة ----------------------------------------------------
delete from public.gps_vehicle_bindings b
 where b.garage_vehicle_id in (select id from _tf_vehicles);

-- --- 4) الجراج ------------------------------------------------------------
delete from public.garage_departures d
 where d.vehicle_id in (select id from _tf_vehicles)
    or d.driver_employee_id in (select id from _tf_employees);

delete from public.garage_driver_assignments x
 where x.vehicle_id in (select id from _tf_vehicles)
    or x.driver_employee_id in (select id from _tf_employees);

delete from public.garage_inventory_movements m
 where m.vehicle_id in (select id from _tf_vehicles);

delete from public.garage_vehicle_shift_assignments s
 where s.vehicle_id in (select id from _tf_vehicles)
    or s.driver_employee_id in (select id from _tf_employees);

-- --- 5) الأنظمة الأخرى المرتبطة بالموظف أو الآلية --------------------------
delete from public.ts_carrier_records c
 where c.vehicle_id in (select id from _tf_vehicles)
    or c.driver_employee_id in (select id from _tf_employees);

delete from public.ts_saksat_records s
 where s.vehicle_id in (select id from _tf_vehicles)
    or s.driver_employee_id in (select id from _tf_employees);

delete from public.sector_breakdowns d
 where d.vehicle_id in (select id from _tf_vehicles);

delete from public.disclosures d
 where d.vehicle_id in (select id from _tf_vehicles)
    or d.employee_id in (select id from _tf_employees);

delete from public.vehicle_maintenance_cases c
 where c.vehicle_id in (select id from _tf_vehicles);

-- --- 6) الآليات -----------------------------------------------------------
update public.garage_vehicles set driver_employee_id = null
 where id in (select id from _tf_vehicles);

delete from public.garage_vehicles g
 where g.id in (select id from _tf_vehicles);

-- --- 7) الموظفون ----------------------------------------------------------
update public.garage_vehicles set driver_employee_id = null
 where driver_employee_id in (select id from _tf_employees);

delete from public.employees e
 where e.id in (select id from _tf_employees);

commit;

-- =============================================================================
-- تحقّق بعد التنفيذ (يجب أن تكون كل القيم 0):
-- =============================================================================
-- select
--   (select count(*) from public.garage_vehicles where plate_number like 'TEST-%') as vehicles,
--   (select count(*) from public.employees      where employee_number like 'DRV-T%') as drivers,
--   (select count(*) from public.gps_vehicle_bindings b
--      where not exists (select 1 from public.garage_vehicles g where g.id=b.garage_vehicle_id)) as orphan_bindings,
--   (select count(*) from public.map_visits where vehicle_id is null) as orphan_visits;
