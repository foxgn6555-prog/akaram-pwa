/** 00241 (الجزء الأول): عقد تصميم غرفة العمليات — الوحدات المحوَّلة تستخدم الرأس الموحد (كحلي/ذهبي) بلا h1 ولا رؤوس متدرجة قديمة. تُستكمل القائمة في الجزء الثاني. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = join(process.cwd(), 'src/portals/ops-room/pages')
export const OPS_UNIFIED = ['Dashboard/OpsRoomDashboardPage', 'Attendance/OpsAttendancePage', 'Store/OpsStorePage', 'Campaigns/OpsCampaignsPage', 'CitizenComplaints/OpsCitizenComplaintsPage', 'Advances/OpsAdvancesPage', 'StationDaily/StationDailyReportPage']

describe('عقد تصميم غرفة العمليات — الجزء الأول (00241)', () => {
  it('كل وحدة محوَّلة تستخدم ExecPageHeader بلا h1 ولا رأس متدرج قديم', () => {
    for (const name of OPS_UNIFIED) {
      const src = readFileSync(join(dir, `${name}.tsx`), 'utf8')
      expect(src, name).toMatch(/<ExecPageHeader icon="[a-z-]+"/)
      expect(src, name).not.toMatch(/<h1\b/)
      expect(src, name).not.toMatch(/<header className="[^"]*bg-gradient-to-l/)
    }
  })
  it('الوحدات المحوَّلة كلها مسجّلة في مسارات غرفة العمليات', () => {
    const routes = readFileSync(join(process.cwd(), 'src/portals/ops-room/routes.tsx'), 'utf8')
    for (const name of OPS_UNIFIED) expect(routes, name).toContain(`./pages/${name}`)
  })
})
