/** 00238: عقد تصميم بوابة الصيانة — كل وحداتها تستخدم الرأس الموحد (كحلي/ذهبي) بلا رؤوس متدرجة قديمة. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = join(process.cwd(), 'src/portals/maintenance/pages')
const PAGES = ['Dashboard/MaintenanceDashboardPage', 'Purchases/MaintenancePurchasesPage', 'Inventory/MaintenanceInventoryPage', 'VehicleCases/MaintenanceCasesPage', 'Archive/MaintenanceArchivePage']
// 00223: صفحات مشتركة مع الكراج (الرأس الموحد داخل الصفحة المشتركة)
const SHARED = { 'Employees/MaintenanceEmployeesPage': 'GarageEmployeesPage', 'Requests/MaintenanceRequestsPage': 'GarageRequestsPage', 'Procedures/MaintenanceProceduresPage': 'GarageProceduresPage' }

describe('عقد تصميم بوابة الصيانة (00238)', () => {
  it('كل مسار في routes.tsx مغطّى', () => {
    const routes = readFileSync(join(process.cwd(), 'src/portals/maintenance/routes.tsx'), 'utf8')
    for (const m of routes.matchAll(/import\('\.\/pages\/([^']+)'\)/g)) expect([...PAGES, ...Object.keys(SHARED)], m[1]).toContain(m[1])
    for (const [page, shared] of Object.entries(SHARED)) expect(readFileSync(join(dir, `${page}.tsx`), 'utf8'), page).toContain(shared)
  })
  it('كل وحدة تستخدم ExecPageHeader بلا h1 ولا رأس متدرج قديم', () => {
    for (const name of PAGES) {
      const src = readFileSync(join(dir, `${name}.tsx`), 'utf8')
      expect(src, name).toMatch(/<ExecPageHeader icon="[a-z-]+"/)
      expect(src, name).not.toMatch(/<h1\b/)
      expect(src, name).not.toMatch(/<header className="[^"]*bg-gradient-to-l/)
    }
  })
})
