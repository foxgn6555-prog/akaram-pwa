import { AppShell } from '@components/layout/AppShell'
import { PORTALS } from '@lib/constants/portals.constants'

/** قوقعة بوابة الإعلام — تفاصيل الوحدات تُستكمل في الجولة التالية. */
export default function MediaPortal() {
  return <AppShell portal={PORTALS.MEDIA} />
}
