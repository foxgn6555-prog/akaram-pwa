/**
 * الكشوفات — المدير المفوض (00170)
 * الاعتماد النهائي (مع إمكانية تعديل المبلغ) → استقطاع تلقائي في حضورية غرفة العمليات · السجل · الملغاة (تصل كإشعار).
 */
import { ApproverDisclosuresPage } from '@features/disclosures/components/ApproverDisclosuresPage'

export default function AdminDisclosures() {
  return <ApproverDisclosuresPage testId="admin-disclosures" title="الكشوفات" subtitle="الاعتماد النهائي للكشوفات بعد المعاون — يمكنك تعديل المبلغ؛ عند الاعتماد يُضاف الاستقطاع تلقائياً إلى حضورية الموظف ويُستقطع من راتبه" />
}
