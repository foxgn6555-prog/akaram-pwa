/** 00239: عقد تصميم بوابتي الموظف (المتعهد) والعمليات الميدانية — الرأس الموحد (كحلي/ذهبي) في كل المسارات، والمشترك عبر صفحات غرفة العمليات الإدارية الموحدة. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(process.cwd(), 'src/portals')
const OWN = ['employee/pages/Dashboard/ContractorDashboard', 'employee/pages/Team/ContractorTeamPage', 'employee/pages/Attendance/ContractorAttendancePage', 'employee/pages/Photos/ContractorPhotosPage', 'employee/pages/Requests/MyRequests',
  'field-ops/pages/Dashboard/FieldOpsDashboard', 'field-ops/pages/Sectors/SectorsPage']
const SHARED = ['admin-ops/pages/Requests/TeamRequestsPage', 'admin-ops/pages/Reports/SectorReportsPage', 'admin-ops/pages/Notify/NotifyPage', 'admin-ops/pages/Procedures/ProceduresPage']

const importsOf = (portal: string) => [...readFileSync(join(root, portal, 'routes.tsx'), 'utf8').matchAll(/import\('(?:\.\/|@portals\/)([^']+)'\)/g)].map((m) => (m[1]!.startsWith('pages/') ? `${portal}/${m[1]}` : m[1]!))

describe('عقد تصميم بوابتي الموظف والميدان (00239)', () => {
  it('كل مسار في البوابتين مغطّى', () => {
    for (const portal of ['employee', 'field-ops']) for (const p of importsOf(portal)) expect([...OWN, ...SHARED], `${portal}: ${p}`).toContain(p)
  })
  it('كل وحدة (خاصة أو مشتركة) تستخدم ExecPageHeader بلا h1', () => {
    for (const name of [...OWN, ...SHARED]) {
      const src = readFileSync(join(root, `${name}.tsx`), 'utf8')
      expect(src, name).toMatch(/<ExecPageHeader icon="[a-z-]+"/)
      expect(src, name).not.toMatch(/<h1\b/)
    }
  })
})
