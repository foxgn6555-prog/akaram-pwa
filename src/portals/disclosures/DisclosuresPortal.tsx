import { AppShell } from '@components/layout/AppShell'
import { PORTALS } from '@lib/constants/portals.constants'

/** بوابة DISCLOSURES (وحدة الكشوفات) — القوقعة (الوحدات من PORTAL_UNITS) */
export default function DisclosuresPortal() {
  return <AppShell portal={PORTALS.DISCLOSURES} />
}
