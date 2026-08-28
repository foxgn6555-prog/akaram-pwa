import { AppShell } from '@components/layout/AppShell'
import { PORTALS } from '@lib/constants/portals.constants'

/** بوابة MANAGER — القوقعة فقط (الوحدات من PORTAL_UNITS) */
export default function ManagerPortal() {
  return <AppShell portal={PORTALS.MANAGER} />
}
