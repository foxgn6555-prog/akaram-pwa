import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const scope = readFileSync('supabase/migrations/00120_garage_direct_rls_and_file_scope.sql', 'utf8')
const migrations = [
  'supabase/migrations/00117_ops_owned_fleet_and_garage_scope.sql',
  'supabase/migrations/00118_garage_scope_reports_maintenance_notifications.sql',
  'supabase/migrations/00119_garage_fuel_scope_and_cycle_hardening.sql',
  'supabase/migrations/00120_garage_direct_rls_and_file_scope.sql',
].map((path) => readFileSync(path, 'utf8')).join('\n')

describe('تدقيق العزل المباشر للكراجين', () => {
  it('يعزل جداول الحالة والتحديثات والقطع والمرفقات حتى عند تجاوز RPC', () => {
    expect(scope).toContain('maintenance cases scoped read')
    expect(scope).toContain('maintenance updates scoped read')
    expect(scope).toContain('maintenance parts scoped read')
    expect(scope).toContain('maintenance attachments scoped read')
    expect(scope).toContain('app.maintenance_case_allowed')
    expect(scope).toContain("app.has_role(array['central_garage_officer'])and app.garage_vehicle_allowed(c.vehicle_id)")
  })

  it('لا يسمح بقراءة صورة الآلية بمجرد معرفة مسار الملف', () => {
    expect(scope).toContain('garage vehicle images scoped read')
    expect(scope).toContain('v.image_path=storage.objects.name')
    expect(scope).toContain('app.garage_vehicle_allowed(v.id)')
  })

  it('يربط قراءة ملف الصيانة بالحالة المسموح بها', () => {
    expect(scope).toContain('maintenance files scoped read')
    expect(scope).toContain('a.storage_path=storage.objects.name')
    expect(scope).toContain('app.maintenance_case_allowed(a.case_id)')
  })

  it('كل دوال SECURITY DEFINER الجديدة تثبت search_path صراحة', () => {
    const definitions = migrations.match(/security definer/gi) ?? []
    const hardened = migrations.match(/security definer\s+set search_path=/gi) ?? []
    expect(definitions.length).toBeGreaterThan(20)
    expect(hardened).toHaveLength(definitions.length)
  })
})
