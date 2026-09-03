import { AppShell } from '@components/layout/AppShell'
import { PORTALS } from '@lib/constants/portals.constants'

/** بوابة الشكاوى — قوقعة عرض فقط؛ الوصول للبيانات مستقبلاً يكون عبر طبقة SDK حصراً. */
export default function ComplaintsPortal() {
  return <AppShell portal={PORTALS.COMPLAINTS} />
}
