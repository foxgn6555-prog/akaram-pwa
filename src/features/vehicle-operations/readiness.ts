import type { MaintenanceCase } from '@sdk/vehicle-operations.sdk'

/** النواقص التي تمنع إعلان/اعتماد الجاهزية — مطابقة لشروط الخادم (00155/00156) */
export function readinessMissing(c: MaintenanceCase): string[] {
  return [
    c.progress !== 100 ? 'نسبة الإنجاز 100%' : null,
    !c.diagnosis ? 'التشخيص (وصف العطل)' : null,
    !c.work_notes ? 'ملاحظات العمل المنجز' : null,
    (c.technician_count ?? (c.assigned_technician ? 1 : 0)) === 0 ? 'تعيين فني واحد على الأقل' : null,
    c.parts_summary?.includes('(لم تُركَّب)') ? 'تأكيد تركيب القطع المصروفة' : null,
  ].filter(Boolean) as string[]
}
