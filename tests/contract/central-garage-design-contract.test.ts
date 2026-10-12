/** 00225: عقد تصميم بوابة الكراج — كل وحدات الكراج تستخدم الرأس الموحد (كحلي/ذهبي) ولا تحتفظ برؤوس متدرجة قديمة. */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = join(process.cwd(), 'src/portals/central-garage/pages')
const UNIT_PAGES = ['CentralGarageDashboardPage', 'DriversDispatchPage', 'MaintenanceCoordinationPage', 'VehiclesDatabasePage', 'FuelHubPage', 'FuelTypePage', 'GarageReportsPage', 'GarageArchivePage', 'GarageEmployeesPage', 'GarageRequestsPage', 'GarageProceduresPage']

describe('عقد تصميم بوابة الكراج (00225)', () => {
  it('كل وحدة من وحدات الكراج تستخدم ExecPageHeader', () => {
    for (const name of UNIT_PAGES) {
      const src = readFileSync(join(dir, `${name}.tsx`), 'utf8')
      expect(src, name).toMatch(/<ExecPageHeader\b/)
    }
  })
  it('الكشوفات تمر عبر الصفحة المشتركة التي تحمل الرأس الموحد', () => {
    expect(readFileSync(join(dir, 'GarageDisclosuresPage.tsx'), 'utf8')).toMatch(/DisclosuresUnitPage/)
    expect(readFileSync(join(process.cwd(), 'src/features/disclosures/components/DisclosuresUnitPage.tsx'), 'utf8')).toMatch(/<ExecPageHeader\b/)
  })
  it('لا رؤوس صفحات متدرجة قديمة في صفحات الكراج', () => {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.tsx'))) {
      const src = readFileSync(join(dir, f), 'utf8')
      expect(src, f).not.toMatch(/<header className="[^"]*bg-gradient-to-l[^"]*"/)
    }
  })
})
