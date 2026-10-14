/** إجراءات الصيانة (00223) — نفس صفحة القسم المشتركة (تعيين أساسي + إنهاء خدمة عبر الموافقات)؛ النطاق يُفرض في قاعدة البيانات. */
import GarageProceduresPage from '@portals/central-garage/pages/GarageProceduresPage'

export default function MaintenanceProceduresPage() {
  return <GarageProceduresPage title="إجراءات الصيانة" dept="الصيانة" testId="maintenance-procedures-page" />
}
