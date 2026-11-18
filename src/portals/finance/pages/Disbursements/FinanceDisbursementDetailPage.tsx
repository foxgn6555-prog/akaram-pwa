/**
 * أمر الصرف — بوابة المالية:
 *  · معتمد ⇒ «صرف من القاصة» (حركة واحدة نهائية بالمبلغ المجمَّد؛ يُحجب بنقص الرصيد برسالة واضحة ولا يُخصم شيء)
 *  · مرفوض ⇒ «إعادة الإرسال» كنسخة جديدة (الشهر يبقى مقفلاً)
 *  الزران مربوطان بصلاحيتي disbursement_pay / disbursement_resubmit (الخادم يحكم أيضاً).
 */
import { useState } from 'react'
import clsx from 'clsx'
import { useParams } from 'react-router'
import { useCanCall } from '@features/permissions/my-permissions'
import { usePayDisbursement, useResubmitDisbursement } from '@features/disbursements/hooks'
import { DisbursementDetailView } from '@features/disbursements/components/DisbursementDetailView'
import { ActionBar, btnOk, btnPrimary } from '@features/disbursements/components/DisbursementUi'
import { PaySheet, ResubmitSheet } from '@features/disbursements/components/DisbursementSheets'
import { fmtMoney } from '@portals/hr/components/hr-format'

export default function FinanceDisbursementDetailPage() {
  const { id } = useParams<{ id: string }>()
  const payGate = useCanCall('disbursement_pay')
  const resubmitGate = useCanCall('disbursement_resubmit')
  const pay = usePayDisbursement()
  const resubmit = useResubmitDisbursement()
  const [sheet, setSheet] = useState<'pay' | 'resubmit' | null>(null)
  const close = () => setSheet(null)
  return (
    <DisbursementDetailView portal="finance" id={id}
      actionBar={(d) => {
        const r = d.request
        if (r.status === 'approved') {
          return (
            <ActionBar>
              <button type="button" className={clsx(btnOk, 'w-full')} disabled={!payGate.allowed || pay.isPending || d.shortfall > 0} title={payGate.title} onClick={() => setSheet('pay')} data-testid="disb-pay">
                {d.shortfall > 0 ? 'الرصيد غير كافٍ للصرف' : <>صرف من القاصة · <bdi dir="ltr">{fmtMoney(r.net_total)}</bdi> د.ع</>}
              </button>
            </ActionBar>
          )
        }
        if (r.status === 'rejected' && !r.resubmitted_id) {
          return (
            <ActionBar>
              <button type="button" className={clsx(btnPrimary, 'w-full')} disabled={!resubmitGate.allowed || resubmit.isPending} title={resubmitGate.title} onClick={() => setSheet('resubmit')} data-testid="disb-resubmit">إعادة الإرسال للمدير المفوض</button>
            </ActionBar>
          )
        }
        return null
      }}
      overlays={(d) => (
        <>
          {sheet === 'pay' && d.request.status === 'approved' && <PaySheet detail={d} busy={pay.isPending} onClose={close} onConfirm={(note) => pay.mutate({ id: d.request.id, note }, { onSuccess: close, onError: close })} />}
          {sheet === 'resubmit' && d.request.status === 'rejected' && <ResubmitSheet detail={d} busy={resubmit.isPending} onClose={close} onConfirm={(note) => resubmit.mutate({ id: d.request.id, note }, { onSuccess: close })} />}
        </>
      )}
    />
  )
}
