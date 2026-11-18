/**
 * معاينة طلب الصرف وقراره — بوابة المدير المفوض:
 *  اعتماد (تصل المالية بإشعار؛ لا خصم قبل صرفها) أو رفض بسبب إلزامي (يعود للمالية؛ الشهر يبقى مقفلاً).
 *  الزران مربوطان بصلاحية disbursement_decide (الخادم يحكم أيضاً).
 */
import { useState } from 'react'
import clsx from 'clsx'
import { useParams } from 'react-router'
import { useCanCall } from '@features/permissions/my-permissions'
import { useDecideDisbursement } from '@features/disbursements/hooks'
import { DisbursementDetailView } from '@features/disbursements/components/DisbursementDetailView'
import { ActionBar, btnDangerOutline, btnPrimary } from '@features/disbursements/components/DisbursementUi'
import { ApproveSheet, RejectSheet } from '@features/disbursements/components/DisbursementSheets'

export default function AdminDisbursementDetailPage() {
  const { id } = useParams<{ id: string }>()
  const decideGate = useCanCall('disbursement_decide')
  const decide = useDecideDisbursement()
  const [sheet, setSheet] = useState<'approve' | 'reject' | null>(null)
  const close = () => setSheet(null)
  return (
    <DisbursementDetailView portal="admin" id={id}
      actionBar={(d) => d.request.status !== 'pending_approval' ? null : (
        <ActionBar>
          <button type="button" className={clsx(btnPrimary, 'flex-[2]')} disabled={!decideGate.allowed || decide.isPending} title={decideGate.title} onClick={() => setSheet('approve')} data-testid="disb-approve">اعتماد الصرف</button>
          <button type="button" className={clsx(btnDangerOutline, 'flex-1')} disabled={!decideGate.allowed || decide.isPending} title={decideGate.title} onClick={() => setSheet('reject')} data-testid="disb-reject">رفض</button>
        </ActionBar>
      )}
      overlays={(d) => d.request.status !== 'pending_approval' ? null : (
        <>
          {sheet === 'approve' && <ApproveSheet detail={d} busy={decide.isPending} onClose={close} onConfirm={() => decide.mutate({ id: d.request.id, approve: true }, { onSuccess: close })} />}
          {sheet === 'reject' && <RejectSheet detail={d} busy={decide.isPending} onClose={close} onConfirm={(reason) => decide.mutate({ id: d.request.id, approve: false, note: reason }, { onSuccess: close })} />}
        </>
      )}
    />
  )
}
