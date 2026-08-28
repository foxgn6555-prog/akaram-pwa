import { AppShell } from '@components/layout/AppShell'
import { PORTALS } from '@lib/constants/portals.constants'

/** بوابة OPS-ROOM (غرفة العمليات) — القوقعة فقط (الوحدات من PORTAL_UNITS) */
export default function OpsRoomPortal() {
  return <AppShell portal={PORTALS.OPS_ROOM} />
}