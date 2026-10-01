/**
 * ⚓ عقد بوابتي مسؤول القاطع (00160) والعمليات الميدانية (00161):
 * الوحدات ↔ المسارات متطابقة، الشريط مقفول على عدد ثابت، ولا أي وحدة/مسار مالي في أيٍّ منهما.
 */
import { describe, expect, it } from 'vitest'
import { PORTAL_UNITS } from '@config/portals.config'
import { PORTALS } from '@lib/constants/portals.constants'
import { customRoutes as adminOpsRoutes } from '@portals/admin-ops/routes'
import { customRoutes as fieldOpsRoutes } from '@portals/field-ops/routes'

const FINANCE_PATH = /(finance|salary|wage|payroll|invoice|deduction|مالي)/i
const check = (portal: string, prefix: string, routes: { path?: string }[], count: number, labels: string[]) => {
  const units = PORTAL_UNITS[portal as keyof typeof PORTAL_UNITS]
  it(`${prefix}: ${count} وحدات ثابتة بالترتيب`, () => { expect(units).toHaveLength(count); expect(units.map((u) => u.labelKey)).toEqual(labels) })
  it(`${prefix}: كل وحدة لها route وكل route له وحدة`, () => {
    const unitPaths = units.map((u) => u.path.replace(prefix, '').replace(/^\//, ''))
    const routePaths = routes.map((r) => r.path ?? '')
    expect([...unitPaths].sort()).toEqual([...routePaths].sort())
  })
  it(`${prefix}: لا وحدة ولا مسار مالي`, () => {
    for (const u of units) { expect(u.path).not.toMatch(FINANCE_PATH); expect(u.labelKey).not.toMatch(FINANCE_PATH) }
    for (const r of routes) expect(r.path ?? '').not.toMatch(FINANCE_PATH)
  })
}
describe('⚓ عقد بوابة مسؤول القاطع', () => check(PORTALS.ADMIN_OPS, '/admin-ops', adminOpsRoutes, 5, ['nav.dashboard', 'nav.sm_team_requests', 'nav.sm_reports', 'nav.sm_notify', 'nav.my_requests']))
describe('⚓ عقد بوابة العمليات الميدانية', () => check(PORTALS.FIELD_OPS, '/field-ops', fieldOpsRoutes, 6, ['nav.dashboard', 'nav.sm_team_requests', 'nav.fo_sectors', 'nav.sm_reports', 'nav.sm_notify', 'nav.my_requests']))
