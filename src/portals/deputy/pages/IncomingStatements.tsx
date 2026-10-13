/**
 * وارد الكشوفات — معاون المدير المفوض (00170)
 * الكشوفات المرفوعة من وحدة الكشوفات في غرفة العمليات: تحديد المبلغ + اعتماد (→ المدير المفوض) أو إعادة بسبب.
 */
import { ApproverDisclosuresPage } from '@features/disclosures/components/ApproverDisclosuresPage'

export default function IncomingStatements() {
  return <ApproverDisclosuresPage testId="deputy-statements" title="وارد الكشوفات" subtitle="الكشوفات المرفوعة من غرفة العمليات — حدّد المبلغ واعتمد لينتقل الكشف إلى المدير المفوض، أو أعده مع السبب" />
}
