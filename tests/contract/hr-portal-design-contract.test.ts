/** 00234: عقد تصميم بوابة الموارد البشرية — كل وحداتها المسجّلة في المسارات تستخدم الرأس الموحد (كحلي/ذهبي) بلا رؤوس قديمة. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = join(process.cwd(), 'src/portals/hr/pages')
const ROUTED = ['Dashboard/HRDashboard', 'Recruitment/Recruitment', 'Employees/EmployeesList', 'Employees/EmployeeDetail', 'Attendance/AttendanceLog', 'Leaves/Leaves', 'Biometric/BiometricLedger', 'Biometric/UnmatchedPeoplePage', 'Org/OrgStructure', 'Behavior/BehaviorReportsPage']

describe('عقد تصميم بوابة الموارد البشرية (00234)', () => {
  it('كل وحدة مسجّلة في مسارات HR موجودة في الاختبار', () => {
    const routes = readFileSync(join(process.cwd(), 'src/portals/hr/routes.tsx'), 'utf8')
    for (const m of routes.matchAll(/import\('\.\/pages\/([^']+)'\)/g)) expect(ROUTED, m[1]).toContain(m[1])
  })
  it('كل وحدة تستخدم ExecPageHeader بأيقونة وعنوان', () => {
    for (const name of ROUTED) {
      const src = readFileSync(join(dir, `${name}.tsx`), 'utf8')
      expect(src, name).toContain("from '@components/executive/ExecPageHeader'")
      expect(src, name).toMatch(/<ExecPageHeader icon="[a-z-]+" title=/)
    }
  })
  it('لا رؤوس h1 يدوية ولا <header> قديمة في وحدات HR', () => {
    for (const name of ROUTED) {
      const src = readFileSync(join(dir, `${name}.tsx`), 'utf8')
      expect(src, name).not.toMatch(/<h1\b/)
      expect(src, name).not.toMatch(/<header\b/)
    }
  })
})
