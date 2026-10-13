/** 00240: عقد تصميم بوابة مسؤول القسم — كل وحداتها المسجّلة في المسارات تستخدم الرأس الموحد (كحلي/ذهبي) بلا h1 ولا رؤوس متدرجة قديمة. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = join(process.cwd(), 'src/portals/manager/pages')
const PAGES = ['Dashboard/ManagerDashboard', 'Team/TeamPage', 'Request/NewRequestPage', 'Breakdown/BreakdownPage', 'Photos/PhotosPage', 'Archive/ArchivePage',
  'Complaints/AssignedComplaintsPage', 'Complaints/ComplaintTicketPage', 'Complaints/ComplaintsGuidancePage', 'VehicleTrips/VehicleTripsPage', 'Gbs/GbsContainersPage',
  'Leaves/TeamLeavesPage', 'Support/SupportRequestsPage', 'CitizenComplaints/ManagerCitizenComplaintsPage']

describe('عقد تصميم بوابة مسؤول القسم (00240)', () => {
  it('كل مسار في routes.tsx مغطّى', () => {
    const routes = readFileSync(join(process.cwd(), 'src/portals/manager/routes.tsx'), 'utf8')
    for (const m of routes.matchAll(/import\('\.\/pages\/([^']+)'\)/g)) expect(PAGES, m[1]).toContain(m[1])
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
