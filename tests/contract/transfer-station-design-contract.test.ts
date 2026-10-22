/** 00232: عقد تصميم بوابة المحطة التحويلية — كل وحداتها تستخدم الرأس الموحد (كحلي/ذهبي) بلا رؤوس قديمة. */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = join(process.cwd(), 'src/portals/transfer-station/pages')
const UNIT_PAGES = ['Dashboard/StationDashboard', 'Weights/WeightsPage', 'Saksat/SaksatPage', 'Carrier/CarrierPage', 'VehicleMovements/StationVehicleMovementsPage', 'Fines/FinesPage', 'Archive/StationArchivePage']
const SHARED = { 'Employees/StationEmployeesPage': 'GarageEmployeesPage', 'Requests/StationRequestsPage': 'GarageRequestsPage', 'Procedures/StationProceduresPage': 'GarageProceduresPage', 'Disclosures/StationDisclosuresPage': 'DisclosuresUnitPage' }
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))

describe('عقد تصميم بوابة المحطة التحويلية (00232)', () => {
  it('كل وحدة من وحدات المحطة تستخدم ExecPageHeader', () => {
    for (const name of UNIT_PAGES) expect(readFileSync(join(dir, `${name}.tsx`), 'utf8'), name).toMatch(/<ExecPageHeader\b/)
  })
  it('وحدات الموظفين/الطلبات/الإجراءات/الكشوفات تمر عبر الصفحات المشتركة ذات الرأس الموحد', () => {
    for (const [page, shared] of Object.entries(SHARED)) expect(readFileSync(join(dir, `${page}.tsx`), 'utf8'), page).toContain(shared)
  })
  it('لا رؤوس h1 عادية ولا رؤوس متدرجة قديمة في صفحات المحطة', () => {
    for (const f of walk(dir).filter((x) => x.endsWith('.tsx'))) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).not.toMatch(/<h1 className="[^"]*text-slate-800/)
      expect(src, f).not.toMatch(/<header className="[^"]*bg-gradient-to-l/)
    }
  })
})
