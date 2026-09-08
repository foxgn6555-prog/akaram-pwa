/** عقود أمان وتشغيل أساس الكراج المركزي. */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('supabase/migrations/00074_central_garage_core.sql','utf8')
const departuresSql = readFileSync('supabase/migrations/00075_garage_departures.sql','utf8')
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

  it('التوقيت من الخادم والموعد التالي إلزامي ومحكوم بتوقيت بغداد', () => {
    expect(sql).toContain("(now() AT TIME ZONE 'Asia/Baghdad')::date")
    expect(sql).toContain('GARAGE_NEXT_REFILL_DATE_INVALID')
    expect(sql).not.toMatch(/garage_fill_vehicle\([^)]*p_created_at/is)
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
    expect(departuresSql).toContain("(d.departed_at AT TIME ZONE 'Asia/Baghdad')::date")
    expect(sdk).toContain("rpc('garage_today_departures')")
    expect(sdk).toContain("rpc('garage_record_departure'")
    expect(sdk).toContain("rpc('garage_record_return'")
  })
})
