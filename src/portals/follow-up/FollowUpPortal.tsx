import { AppShell } from '@components/layout/AppShell'
import { PORTALS } from '@lib/constants/portals.constants'

/** قوقعة بوابة المتابعة (00259). */
export default function FollowUpPortal() {
  return <AppShell portal={PORTALS.FOLLOW_UP} />
}
