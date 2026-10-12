/** إجراءات المحطة التحويلية (00213) — نفس صفحة القسم المشتركة (تعيين أساسي + إنهاء خدمة عبر الموافقات)؛ النطاق يُفرض في قاعدة البيانات. */
import GarageProceduresPage from '@portals/central-garage/pages/GarageProceduresPage'

export default function StationProceduresPage() {
  return <GarageProceduresPage title="إجراءات المحطة" dept="المحطة التحويلية" testId="station-procedures-page" />
}
