import { AppShell } from '@components/layout/AppShell'
import { PORTALS } from '@lib/constants/portals.constants'

/** بوابة ADMIN-OPS (العمليات الإدارية) — القوقعة فقط (الوحدات من PORTAL_UNITS) */
export default function AdminOpsPortal() {
  return <AppShell portal={PORTALS.ADMIN_OPS} />
}