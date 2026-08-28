import { AppShell } from '@components/layout/AppShell'
import { PORTALS } from '@lib/constants/portals.constants'

/** بوابة TRANSFER-STATION (المحطة التحويلية) — القوقعة فقط (الوحدات من PORTAL_UNITS) */
export default function TransferStationPortal() {
  return <AppShell portal={PORTALS.TRANSFER_STATION} />
}