import { AppShell } from '@components/layout/AppShell'
import { PORTALS } from '@lib/constants/portals.constants'

/** بوابة HR — القوقعة فقط (الوحدات من PORTAL_UNITS) */
export default function HrPortal() {
  return <AppShell portal={PORTALS.HR} />
}
