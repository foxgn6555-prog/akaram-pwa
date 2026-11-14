/**
 * 00400 · تقارير الوقود لمدير غرفة العمليات
 * نفس محرّك تقارير الكراج المركزي (فلاتر + مخططات + Excel/CSV/طباعة مصممة) مع:
 *  · عنوان خاص بالبوابة.
 *  · بلا روابط لصفحة الآلية (غير موجودة في هذه البوابة ⇒ كانت ستُعيد 403).
 */
import GarageReportsPage from '@portals/central-garage/pages/GarageReportsPage'

export default function FuelReportsPage() {
  return (
    <GarageReportsPage
      title="تقارير الوقود — كل بوابات الكراج"
      subtitle="حركات الكاز والهيدروليك والدهن وC-Oil: إضافات المخزون وتعبئة الآليات والتصفير المعتمد، مع مقارنة الخزانات والآليات والتصدير."
      vehicleHrefBase={null}
    />
  )
}
