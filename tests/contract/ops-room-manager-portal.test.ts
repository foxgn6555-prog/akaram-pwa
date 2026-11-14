/**
 * 00400 — عقد بوابة «مدير غرفة العمليات»: بوابة معزولة بدور واحد، ووحدة تقارير الوقود
 * قراءة فقط (البوابة + الكتالوج + الترحيل). يمنع أي توسيع مستقبلي صامت لصلاحيات الدور.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PORTAL_DEFINITIONS, PORTALS } from '@/lib/constants/portals.constants'
import { PORTAL_UNITS } from '@/config/portals.config'
import { PERMISSION_CATALOG, PORTAL_ROLE } from '@/config/permission-catalog'

const ROOT = process.cwd()
const MIGRATION = join(ROOT, 'supabase/migrations/20261111120000_ops_room_manager_portal.sql')

describe('🚪 بوابة مدير غرفة العمليات (00400)', () => {
  it('بوابة واحدة بدور واحد فقط — لا تداخل مع غرفة العمليات', () => {
    const def = PORTAL_DEFINITIONS.find((p) => p.id === PORTALS.OPS_ROOM_MANAGER)
    expect(def?.path).toBe('/ops-room-manager')
    expect(def?.allowedRoles).toEqual(['ops_room_manager'])
    expect(PORTAL_ROLE[PORTALS.OPS_ROOM_MANAGER]).toBe('ops_room_manager')
    const opsRoom = PORTAL_DEFINITIONS.find((p) => p.id === PORTALS.OPS_ROOM)
    expect(opsRoom?.allowedRoles).toEqual(['ops_room'])
  })

  it('وحدتان فقط: الموافقات + تقارير الوقود', () => {
    const units = PORTAL_UNITS[PORTALS.OPS_ROOM_MANAGER]
    expect(units.map((u) => u.path)).toEqual([
      '/ops-room-manager',
      '/ops-room-manager/approvals',
      '/ops-room-manager/fuel-reports',
    ])
  })

  it('الكتالوج: قرار الموافقات + تصدير التقرير، والرئيسية عرض فقط', () => {
    const byKey = new Map(PERMISSION_CATALOG.map((u) => [u.key, u]))
    expect(byKey.get('ops-room-manager.approvals')?.actions).toContain('decide')
    expect(byKey.get('ops-room-manager.fuel-reports')?.actions).toEqual(['view', 'export'])
    expect(byKey.get('ops-room-manager')?.actions).toEqual(['view'])
  })

  it('الترحيل يفتح القراءة فقط: بوابة قراءة مستقلة ولا يمسّ بوابة الكتابة', () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    expect(sql).toContain('app.garage_report_actor()')
    // بوابة الكتابة تبقى كما هي: لا يُضاف الدور الجديد إليها في الترحيل
    expect(sql).not.toMatch(/create or replace function app\.require_garage_actor/)
    // الدوال التي تُعاد صياغتها للقراءة فقط: التقرير والملخص ومناطق الفلاتر
    expect(sql).toContain('garage_consumption_report')
    expect(sql).toContain('garage_dashboard_summary')
    expect(sql).toContain('garage_visible_areas')
    // ولا تُمسّ دوال الكتابة
    for (const fn of ['garage_fill_vehicle', 'garage_add_tank_stock', 'garage_request_tank_zero']) {
      expect(sql).not.toContain(fn)
    }
  })
})
