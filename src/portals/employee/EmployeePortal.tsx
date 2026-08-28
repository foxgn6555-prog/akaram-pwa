import { AppShell } from '@components/layout/AppShell'
import { PORTALS } from '@lib/constants/portals.constants'

/** بوابة الموظف — القوقعة فقط (الوحدات من PORTAL_UNITS) */
export default function EmployeePortal() {
  return <AppShell portal={PORTALS.EMPLOYEE} />
}
