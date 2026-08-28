import { AppShell } from '@components/layout/AppShell'
import { PORTALS } from '@lib/constants/portals.constants'

/** بوابة FINANCE — القوقعة فقط (الوحدات من PORTAL_UNITS) */
export default function FinancePortal() {
  return <AppShell portal={PORTALS.FINANCE} />
}
