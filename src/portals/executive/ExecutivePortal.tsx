import { AppShell } from '@components/layout/AppShell'
import { PORTALS } from '@lib/constants/portals.constants'

/** بوابة EXECUTIVE (المدير التنفيذي) — القوقعة فقط (الوحدات من PORTAL_UNITS) */
export default function ExecutivePortal() {
  return <AppShell portal={PORTALS.EXECUTIVE} />
}