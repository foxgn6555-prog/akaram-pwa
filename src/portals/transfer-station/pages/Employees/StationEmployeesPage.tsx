/** موظفو المحطة التحويلية (00211) — نفس صفحة القسم المشتركة؛ النطاق (قسم المحطة وفروعه) يُفرض في قاعدة البيانات. */
import GarageEmployeesPage from '@portals/central-garage/pages/GarageEmployeesPage'

export default function StationEmployeesPage() {
  return <GarageEmployeesPage title="موظفو المحطة" dept="المحطة التحويلية" testId="station-employees-page" />
}
