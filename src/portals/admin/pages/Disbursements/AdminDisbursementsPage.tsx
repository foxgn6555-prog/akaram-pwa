/** طلبات الصرف — بوابة المدير المفوض: رواتب الموظفين وأجور المتعهدين بعد إقفال الشهر بانتظار قراره */
import { DisbursementsListView } from '@features/disbursements/components/DisbursementsListView'

export default function AdminDisbursementsPage() {
  return <DisbursementsListView portal="admin" />
}
