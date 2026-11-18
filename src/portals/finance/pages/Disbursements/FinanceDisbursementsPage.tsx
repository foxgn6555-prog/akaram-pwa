/** أوامر الصرف — بوابة المالية: ما اعتمده المدير المفوض (للصرف) وما رفضه (لإعادة الإرسال) وما بانتظار قراره */
import { DisbursementsListView } from '@features/disbursements/components/DisbursementsListView'

export default function FinanceDisbursementsPage() {
  return <DisbursementsListView portal="finance" />
}
