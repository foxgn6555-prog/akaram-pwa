import { AppShell } from '@components/layout/AppShell'
import { PORTALS } from '@lib/constants/portals.constants'

/** بوابة IT — القوقعة فقط (الوحدات من PORTAL_UNITS) */
export default function ItPortal() {
  return <AppShell portal={PORTALS.IT} />
}
