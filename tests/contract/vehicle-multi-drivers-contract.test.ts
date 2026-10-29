/** 00377: سائقون متعددون للآلية (أساسي/احتياطي لكل شفت) + سائقو خروج المحطة من السجل فقط — عقود ثابتة بين الميجريشن والواجهة. */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const mig = readFileSync('supabase/migrations/00322_multi_driver_assignments.sql', 'utf8')

describe('00377 vehicle multi drivers', () => {
  it('الميجريشن: driver_role + فهرس (vehicle, shift, role) + p_drivers + الانطلاق بالدور + إنهاء الاحتياطي', () => {
    expect(mig).toContain("add column if not exists driver_role text not null default 'primary'")
    expect(mig).toContain('drop index if exists public.one_active_vehicle_shift_assignment')
    expect(mig).toContain('one_active_vehicle_shift_role_assignment on public.garage_vehicle_shift_assignments(vehicle_id, shift, driver_role) where ends_at is null')
    expect(mig).toContain('p_drivers jsonb default null')
    for (const code of ['FLEET_DRIVER_ROLE_INVALID', 'FLEET_DRIVER_SLOT_DUPLICATE', 'FLEET_DRIVER_DUPLICATE_IN_SHIFT', 'FLEET_BACKUP_NEEDS_PRIMARY', 'FLEET_PRIMARY_DRIVER_REQUIRED', 'GARAGE_BACKUP_DRIVER_NOT_FOUND', 'FLEET_PRIMARY_CANNOT_BE_REMOVED', 'STATION_DRIVER_KIND_RETIRED'])
      expect(mig).toContain(code)
    expect(mig).toContain("p_manager_id uuid default null, p_driver_role text default 'primary')")
    expect(mig).toContain('create or replace function public.garage_end_vehicle_shift_assignment(p_assignment_id uuid, p_reason text)')
    // ⑤ المزامنة تنقل driver_external_id (إصلاح 00375)
    expect(mig).toMatch(/sync_initial_garage_shift_assignment[\s\S]*new\.driver_external_id/)
    // الحارس يشمل سائق المتعهد
    expect(mig).toMatch(/guard_driver_shift_assignment[\s\S]*a\.driver_external_id = new\.driver_external_id/)
    // حارس الكتابة يُعاد تثبيته على الدالتين ويُفحص
    expect(mig).toContain("perform app.wrap_write_guard('garage_record_shift_departure')")
    expect(mig).toContain("perform app.wrap_write_guard('station_record_exit')")
    expect(mig).toContain('WRITE_GUARD_MISSING')
  })
  it('الواجهة: SDK يمرر p_drivers/p_driver_role، ونموذج المحطة بلا «متعاقد» بالاسم الحر', () => {
    const sdk = readFileSync('src/services/central-garage.sdk.ts', 'utf8')
    expect(sdk).toContain('p_drivers:')
    expect(sdk).toContain('p_driver_role: driverRole')
    expect(sdk).toContain("rpc('garage_end_vehicle_shift_assignment'")
    const st = readFileSync('src/services/station-fleet.sdk.ts', 'utf8')
    expect(st).toContain("export type StationDriverKind = 'employee' | 'external'")
    const form = readFileSync('src/portals/transfer-station/components/StationExitForm.tsx', 'utf8')
    expect(form).not.toContain("'contracted'")
    expect(form).not.toContain('driver-name')
    const errs = readFileSync('src/lib/errors/error.handler.ts', 'utf8')
    for (const code of ['GARAGE_BACKUP_DRIVER_NOT_FOUND', 'FLEET_BACKUP_NEEDS_PRIMARY', 'FLEET_PRIMARY_CANNOT_BE_REMOVED', 'STATION_DRIVER_KIND_RETIRED', 'FLEET_EXTERNAL_DRIVER_NOT_FOUND'])
      expect(errs).toContain(code)
    // صفحة تفاصيل الآلية تعرض لوحة سائقي الشفتات
    expect(readFileSync('src/portals/central-garage/pages/VehicleDetailPage.tsx', 'utf8')).toContain('<ShiftDriversPanel')
  })
})
