import { AppShell } from '@components/layout/AppShell'
import { PORTALS } from '@lib/constants/portals.constants'

/** بوابة ADMIN — القوقعة فقط (الوحدات من PORTAL_UNITS) */
export default function AdminPortal() {
  return <AppShell portal={PORTALS.ADMIN} />
}
