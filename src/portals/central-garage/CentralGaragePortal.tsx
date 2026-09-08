import { AppShell } from '@components/layout/AppShell'
import { PORTALS } from '@lib/constants/portals.constants'

/** قوقعة بوابة الكراج المركزي. */
export default function CentralGaragePortal() {
  return <AppShell portal={PORTALS.CENTRAL_GARAGE} />
}
