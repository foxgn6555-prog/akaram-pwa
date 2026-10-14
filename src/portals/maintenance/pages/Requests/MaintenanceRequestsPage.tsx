/** طلبات موظفي الصيانة (00223) — نفس صفحة القسم المشتركة؛ النطاق (قسم الصيانة وفروعه) يُفرض في قاعدة البيانات. */
import GarageRequestsPage from '@portals/central-garage/pages/GarageRequestsPage'

export default function MaintenanceRequestsPage() {
  return <GarageRequestsPage title="طلبات موظفي الصيانة" dept="الصيانة" testId="maintenance-requests-page" />
}
