import { AppShell } from '@components/layout/AppShell'
import { PORTALS } from '@lib/constants/portals.constants'

/** بوابة MAINTENANCE (الصيانة) — القوقعة فقط (الوحدات من PORTAL_UNITS) */
export default function MaintenancePortal() {
  return <AppShell portal={PORTALS.MAINTENANCE} />
}