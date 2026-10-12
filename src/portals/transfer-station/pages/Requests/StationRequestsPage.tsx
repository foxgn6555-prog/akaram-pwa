/** طلبات موظفي المحطة التحويلية (00212) — نفس صفحة القسم المشتركة؛ النطاق (قسم المحطة وفروعه) يُفرض في قاعدة البيانات. */
import GarageRequestsPage from '@portals/central-garage/pages/GarageRequestsPage'

export default function StationRequestsPage() {
  return <GarageRequestsPage title="طلبات موظفي المحطة" dept="المحطة التحويلية" testId="station-requests-page" />
}
