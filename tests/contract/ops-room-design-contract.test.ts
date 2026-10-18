/** 00241/00242: عقد تصميم غرفة العمليات — كل وحداتها المسجّلة في المسارات تستخدم الرأس الموحد (كحلي/ذهبي) بلا h1 ولا رؤوس متدرجة قديمة (مباشرة أو عبر صفحات مشتركة موحدة). */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = join(process.cwd(), 'src/portals/ops-room/pages')
export const OPS_UNIFIED = ['Dashboard/OpsRoomDashboardPage', 'Attendance/OpsAttendancePage', 'Store/OpsStorePage', 'Campaigns/OpsCampaignsPage', 'CitizenComplaints/OpsCitizenComplaintsPage', 'Advances/OpsAdvancesPage', 'StationDaily/StationDailyReportPage',
  'OperationsData/OperationsDataPage', 'Gps/GpsDataPage', 'Gbs/GbsContainersPage', 'ContractorHeadcounts/OpsContractorHeadcountsPage', 'Leaves/OpsLeavesPage', 'LiveTracking/OpsLiveTrackingPage']
const SHARED = { 'Disclosures/OpsDisclosuresPage': 'DisclosuresUnitPage', '@portals/central-garage/pages/VehiclesDatabasePage': null, '@portals/central-garage/pages/VehicleDetailPage': null, '@portals/central-garage/pages/GarageArchivePage': null } as const

describe('عقد تصميم غرفة العمليات (00241/00242)', () => {
  it('كل وحدة محوَّلة تستخدم ExecPageHeader بلا h1 ولا رأس متدرج قديم', () => {
    for (const name of OPS_UNIFIED) {
      const src = readFileSync(join(dir, `${name}.tsx`), 'utf8')
      expect(src, name).toMatch(/<ExecPageHeader icon="[a-z-]+"/)
      expect(src, name).not.toMatch(/<h1\b/)
      expect(src, name).not.toMatch(/<header className="[^"]*bg-gradient-to-l/)
    }
  })
  it('كل مسار في routes.tsx مغطّى (خاص أو مشترك)', () => {
    const routes = readFileSync(join(process.cwd(), 'src/portals/ops-room/routes.tsx'), 'utf8')
    for (const m of routes.matchAll(/import\('([^']+)'\)/g)) {
      const p = m[1]!.replace(/^\.\/pages\//, '')
      expect([...OPS_UNIFIED, ...Object.keys(SHARED)], p).toContain(p)
    }
  })
  it('الوحدات المشتركة (الكشوفات، قاعدة الآليات، ملف الآلية، أرشيف الكراج) موحدة الرأس أيضاً', () => {
    expect(readFileSync(join(process.cwd(), 'src/features/disclosures/components/DisclosuresUnitPage.tsx'), 'utf8')).toMatch(/<ExecPageHeader\b/)
    for (const f of ['VehiclesDatabasePage', 'VehicleDetailPage', 'GarageArchivePage']) {
      const src = readFileSync(join(process.cwd(), `src/portals/central-garage/pages/${f}.tsx`), 'utf8')
      expect(src, f).toMatch(/<ExecPageHeader icon="[a-z-]+"/)
      expect(src, f).not.toMatch(/<h1\b/)
    }
  })
})
