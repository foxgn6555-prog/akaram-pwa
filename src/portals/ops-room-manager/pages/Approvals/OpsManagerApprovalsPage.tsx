/**
 * 00400 · موافقات مدير غرفة العمليات — نفس صفحة الموافقات المعتمدة (TeamRequestsPage)
 * بكل أنواعها (إجازات/زمنيات/سلف مع تعديل المبلغ/كشوفات في درج القرار/تعيين/إنهاء خدمة…)
 * والمهام تصل هنا بحسب ما يُسنَد لحسابه في سلاسل الموافقات.
 */
import TeamRequestsPage from '@portals/admin-ops/pages/Requests/TeamRequestsPage'

export default function OpsManagerApprovalsPage() {
  return <TeamRequestsPage title="موافقات مدير غرفة العمليات" />
}
