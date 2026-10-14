/** موظفو الصيانة (00223) — نفس صفحة القسم المشتركة؛ النطاق (قسم الصيانة وفروعه) يُفرض في قاعدة البيانات. */
import GarageEmployeesPage from '@portals/central-garage/pages/GarageEmployeesPage'

export default function MaintenanceEmployeesPage() {
  return <GarageEmployeesPage title="موظفو الصيانة" dept="الصيانة" testId="maintenance-employees-page" />
}
