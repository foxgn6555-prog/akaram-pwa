/** عقود أمان وتشغيل أساس الكراج المركزي. */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/00074_central_garage_core.sql','utf8')
const departuresSql = readFileSync('supabase/migrations/00075_garage_departures.sql','utf8')
const fuelSql = readFileSync('supabase/migrations/00076_fuel_unit_and_refill_date.sql','utf8')
const multiReportSql = readFileSync('supabase/migrations/00078_garage_multi_vehicle_reports.sql','utf8')
const vehicleDetailsSql = readFileSync('supabase/migrations/00079_garage_vehicle_details_and_ownership.sql','utf8')
const sdk = readFileSync('src/services/central-garage.sdk.ts','utf8')

describe('عقد الكراج المركزي', () => {
  it.each(['garage_vehicles','garage_driver_assignments','garage_tanks','garage_inventory_movements','garage_tank_zero_requests'])('يفعل RLS على %s', table => {
    expect(sql).toContain(`alter table public.${table} enable row level security`)
  })

  it('جدول الانطلاق garage_departures مفعّل RLS ومحمي ومكتوب عبر RPC فقط', () => {
    expect(departuresSql).toContain('alter table public.garage_departures enable row level security')
    expect(departuresSql).toContain('uq_garage_open_departure')
    expect(departuresSql).toContain('garage_record_departure')
    expect(departuresSql).toContain('garage_record_return')
    expect(departuresSql).toContain('garage_today_departures')
    expect(departuresSql).not.toMatch(/create policy[^;]+garage_departures[^;]+for (insert|update|delete|all)/is)
  })

  it('لا توجد سياسات كتابة مباشرة لجداول الأعمال', () => {
    expect(sql).not.toMatch(/create policy[^;]+garage_(vehicles|driver_assignments|tanks|inventory_movements|tank_zero_requests)[^;]+for (insert|update|delete|all)/is)
  })

  it('يفرض تفرد DB واللوحة والشاصي', () => {
    expect(sql).toContain('uq_garage_vehicle_db')
    expect(sql).toContain('uq_garage_vehicle_plate')
    expect(sql).toContain('uq_garage_vehicle_chassis')
  })

  it('يحفظ إسناداً حالياً واحداً وسجل تغييرات', () => {
    expect(sql).toContain('uq_garage_current_assignment')
    expect(sql).toContain('where ends_at is null')
    expect(sql).toContain('garage_assign_driver')
  })

  it('يحمي المخزون بقفل صف ومنع التجاوز والعجز', () => {
    expect((sql.match(/for update/g) ?? []).length).toBeGreaterThanOrEqual(5)
    expect(sql).toContain('GARAGE_TANK_CAPACITY_EXCEEDED')
    expect(sql).toContain('GARAGE_TANK_BALANCE_INSUFFICIENT')
  })

  it('التوقيت من الخادم ويلغي الموعد للكاز ويبقيه إلزامياً للمواد الأخرى', () => {
    expect(fuelSql).toContain("(now() at time zone 'Asia/Baghdad')::date")
    expect(fuelSql).toContain('GARAGE_GAS_OIL_REFILL_DATE_NOT_ALLOWED')
    expect(fuelSql).toContain('GARAGE_NEXT_REFILL_DATE_INVALID')
    expect(fuelSql).not.toMatch(/garage_fill_vehicle\([^)]*p_created_at/is)
  })

  it('يقيد وحدة الخزان ويحذف توقيع الإضافة القديم ويشدد صلاحيات التوقيع الجديد', () => {
    expect(fuelSql).toContain("unit in ('liter','kilogram','gallon','barrel','container','piece')")
    expect(fuelSql).toContain('drop function public.garage_add_tank(text,text,numeric,numeric,numeric)')
    expect(fuelSql).toContain('revoke all on function public.garage_add_tank(text,text,text,numeric,numeric,numeric) from public,anon')
    expect(fuelSql).toContain("'consumptionByUnit'")
    expect(fuelSql).toContain("else '[]'::jsonb end")
  })

  it('التصفير يتطلب موافقة التطوير ويحمي من تغير الرصيد', () => {
    expect(sql).toContain("app.has_role(array['it_admin','super_admin'])")
    expect(sql).toContain('GARAGE_TANK_BALANCE_CHANGED')
    expect(sql).toContain("where status = 'pending'")
    expect(sql).toContain("'طلب تصفير خزان في الكراج المركزي'")
    expect(sql).toContain("'/it/central-garage-approvals'")
  })

  it('التقارير محمية وتحدد الفترة والصفحات وتجمع الآلية والخزان والمادة', () => {
    expect(sql).toContain('garage_consumption_report')
    expect(sql).toContain('GARAGE_REPORT_DATE_RANGE_INVALID')
    expect(sql).toContain('GARAGE_REPORT_PAGINATION_INVALID')
    expect(sql).toContain('byVehicle')
    expect(sql).toContain('byTank')
  })

  it('تفاصيل الآلية تدعم التصنيف والملكية المؤجرة بقيود عقد وحقول مؤجر',()=>{expect(vehicleDetailsSql).toContain('vehicle_category text');expect(vehicleDetailsSql).toContain('ownership_type text');expect(vehicleDetailsSql).toContain('garage_vehicle_ownership_details_check');expect(vehicleDetailsSql).toContain('GARAGE_LESSOR_REQUIRED');expect(vehicleDetailsSql).toMatch(/revoke all on function[\s\S]*from public,anon/)})

  it('تقارير الآليات المحددة محمية وتدعم مصفوفة بحد 50 دون تحويل الاختيار الفارغ إلى تقرير شامل',()=>{expect(multiReportSql).toContain('p_vehicle_ids uuid[]');expect(multiReportSql).toContain('cardinality(v_vehicle_ids)>50');expect(multiReportSql).toContain('m.vehicle_id=any(v_vehicle_ids)');expect(multiReportSql).toContain("'selectedVehicles'");expect(multiReportSql).toMatch(/revoke all on function[\s\S]*from public,anon/)})

  it('الأرشفة والاستعادة بسبب إلزامي وتدخلان سجل التدقيق', () => {
    expect(sql).toContain('garage_archive_vehicle')
    expect(sql).toContain('garage_restore_vehicle')
    expect(sql).toContain('GARAGE_RESTORE_REASON_REQUIRED')
    expect(sql).toContain('trg_audit_garage_vehicles')
  })

  it('الصور خاصة ومقيدة بمجلد المستخدم وSDK فقط', () => {
    expect(sql).toContain("values ('garage-vehicles','garage-vehicles',false")
    expect(sql).toContain("auth.uid()::text=(storage.foldername(name))[1]")
    expect(sdk).toContain("supabase.storage.from('garage-vehicles')")
    expect(sdk).toContain('GARAGE_IMAGE_SIGNATURE_INVALID')
  })

  it('سجل الانطلاق يُبنى من الانطلاقة الحالية ويمنع الخروج المزدوج', () => {
    expect(departuresSql).toContain('GARAGE_NO_ACTIVE_ASSIGNMENT')
    expect(departuresSql).toContain('GARAGE_DEPARTURE_ALREADY_OPEN')
    expect(departuresSql).toContain('GARAGE_OPEN_DEPARTURE_NOT_FOUND')
    expect(departuresSql).toContain("(d.departed_at at time zone 'Asia/Baghdad')::date")
    expect(departuresSql).toContain('app.require_garage_actor()')
    expect(departuresSql).toContain('d.returned_at is null')
    expect(sdk).toContain("rpc('garage_today_departures')")
    expect(sdk).toContain("rpc('garage_record_departure'")
    expect(sdk).toContain("rpc('garage_record_return'")
  })
})
