import { AppShell } from '@components/layout/AppShell'
import { PORTALS } from '@lib/constants/portals.constants'

/** بوابة FIELD-OPS (العمليات الميدانية) — القوقعة فقط (الوحدات من PORTAL_UNITS) */
export default function FieldOpsPortal() {
  return <AppShell portal={PORTALS.FIELD_OPS} />
}