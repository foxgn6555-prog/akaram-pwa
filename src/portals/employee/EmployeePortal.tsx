import { AppShell } from '@components/layout/AppShell'
import { PORTALS } from '@lib/constants/portals.constants'

/** بوابة المتعهد — القوقعة فقط (الوحدات من PORTAL_UNITS) */
export default function EmployeePortal() {
  return <AppShell portal={PORTALS.EMPLOYEE} />
}
