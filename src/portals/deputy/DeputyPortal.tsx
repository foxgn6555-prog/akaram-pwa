import { AppShell } from '@components/layout/AppShell'
import { PORTALS } from '@lib/constants/portals.constants'

/** بوابة DEPUTY (معاون المدير المفوض) — القوقعة فقط (الوحدات من PORTAL_UNITS) */
export default function DeputyPortal() {
  return <AppShell portal={PORTALS.DEPUTY} />
}