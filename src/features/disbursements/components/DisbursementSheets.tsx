/**
 * أوراق التأكيد لمسار الصرف (كلها تفتح من أزرار تملكها صفحات البوابتين، وتُغلق بـ Escape أو «رجوع»):
 *  · ApproveSheet — اعتماد المدير المفوض (يصل أمر الصرف للمالية؛ لا خصم قبل الصرف؛ تحذير الرصيد)
 *  · RejectSheet  — رفض بسبب إلزامي (ثلاثة أحرف فأكثر)
 *  · PaySheet     — صرف المالية من القاصة (حركة واحدة نهائية)
 *  · ResubmitSheet — إعادة الإرسال بعد الرفض بملاحظة اختيارية
 */
import { useState, type ReactNode } from 'react'
import clsx from 'clsx'
import type { DisbursementDetail } from '@sdk/disbursements.sdk'
import { iqd, monthTitle } from '../format'
import { AmountBig, Sheet, btnDanger, btnGhost, btnOk, btnPrimary } from './DisbursementUi'

const WHO = (d: DisbursementDetail) => (d.request.kind === 'employee_payroll' ? `${d.request.people_count} موظفاً` : `${d.request.people_count} متعهداً`)
const kindLabel = (d: DisbursementDetail) => d.request.kind_label

function Check({ children, tone = 'ok' }: { children: ReactNode; tone?: 'ok' | 'warn' }) {
  return (
    <li className="flex items-start gap-2 text-xs leading-relaxed text-slate-700">
      <i aria-hidden className={clsx('mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full text-[11px] font-black not-italic', tone === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-700')}>{tone === 'ok' ? '✓' : '!'}</i>
      <span>{children}</span>
    </li>
  )
}
const noteField = 'mt-2 min-h-[5.5rem] w-full resize-none rounded-xl border-[1.5px] border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed text-slate-900 outline-none focus:border-[#0b4f8a]'

export function ApproveSheet({ detail, busy, onConfirm, onClose }: { detail: DisbursementDetail; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  const short = detail.shortfall > 0
  return (
    <Sheet title={`اعتماد صرف ${kindLabel(detail)}`} onClose={onClose} busy={busy} testId="disb-approve-sheet">
      <div className="mt-1.5"><AmountBig value={detail.request.net_total} size="xl" /></div>
      <p className="text-xs leading-relaxed text-slate-600">لـ {WHO(detail)} عن شهر {monthTitle(detail.request.period_month)}.</p>
      <ul className="my-3 space-y-2">
        <Check>يصل أمر الصرف إلى الشؤون المالية فوراً بإشعار.</Check>
        <Check>لا يُخصم شيء من القاصة إلا حين تنفّذ المالية الصرف.</Check>
        {short
          ? <Check tone="warn"><b data-testid="disb-approve-shortfall">رصيد القاصة الآن {iqd(detail.balance)} أقل من المبلغ بـ {iqd(detail.shortfall)}</b> — يمكنك الاعتماد، لكن الصرف يتعذّر حتى تُغطّى القاصة.</Check>
          : <Check>الرصيد كافٍ الآن، ويبقى بعد الصرف {iqd(detail.balance_after)}.</Check>}
      </ul>
      <div className="flex gap-2">
        <button type="button" className={clsx(btnOk, 'flex-[2]')} disabled={busy} onClick={onConfirm} data-testid="disb-approve-confirm">{busy ? 'جارٍ الاعتماد…' : 'تأكيد الاعتماد'}</button>
        <button type="button" className={clsx(btnGhost, 'flex-1')} disabled={busy} onClick={onClose} data-testid="disb-approve-cancel">رجوع</button>
      </div>
    </Sheet>
  )
}

export const REJECT_MIN = 3
export function RejectSheet({ detail, busy, onConfirm, onClose }: { detail: DisbursementDetail; busy: boolean; onConfirm: (reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const ok = reason.trim().length >= REJECT_MIN
  return (
    <Sheet title="رفض الطلب وإعادته للمالية" onClose={onClose} busy={busy} testId="disb-reject-sheet">
      <p className="mt-1 text-xs leading-relaxed text-slate-600">{kindLabel(detail)} — {monthTitle(detail.request.period_month)} · {iqd(detail.request.net_total)}</p>
      <label className="mt-3 block text-xs font-black text-slate-700">سبب الرفض <span className="text-red-700">(مطلوب)</span>
        <textarea className={noteField} value={reason} maxLength={600} onChange={(e) => setReason(e.target.value)} placeholder="اكتب سبب الرفض ليراجعه الموظف المالي…" data-testid="disb-reject-reason" aria-required="true" />
      </label>
      <p className="mb-3 mt-1 text-[11px] leading-relaxed text-slate-500">يصل السبب إلى الشؤون المالية في إشعار، وتبقى النسخة المرفوضة محفوظة في سجل الطلب.</p>
      <div className="flex gap-2">
        <button type="button" className={clsx(btnDanger, 'flex-[2]')} disabled={busy || !ok} onClick={() => onConfirm(reason.trim())} data-testid="disb-reject-confirm">{busy ? 'جارٍ الرفض…' : 'تأكيد الرفض'}</button>
        <button type="button" className={clsx(btnGhost, 'flex-1')} disabled={busy} onClick={onClose} data-testid="disb-reject-cancel">رجوع</button>
      </div>
    </Sheet>
  )
}

export function PaySheet({ detail, busy, onConfirm, onClose }: { detail: DisbursementDetail; busy: boolean; onConfirm: (note: string) => void; onClose: () => void }) {
  const [note, setNote] = useState('')
  return (
    <Sheet title={`صرف ${kindLabel(detail)} من القاصة`} onClose={onClose} busy={busy} testId="disb-pay-sheet">
      <div className="mt-1.5"><AmountBig value={detail.request.net_total} size="xl" /></div>
      <p className="text-xs leading-relaxed text-slate-600">لـ {WHO(detail)} عن شهر {monthTitle(detail.request.period_month)}.</p>
      <ul className="my-3 space-y-2">
        <Check>تُسجَّل حركة قاصة واحدة نهائية بنوع «{kindLabel(detail)}» بالمبلغ نفسه — لا تُكرَّر حتى لو ضُغط الزر مرتين.</Check>
        <Check>يُبلَّغ المدير المفوض بإتمام الصرف.</Check>
        <Check>الرصيد بعد الصرف {iqd(detail.balance_after)}.</Check>
      </ul>
      <label className="block text-xs font-black text-slate-700">ملاحظة الصرف <span className="font-bold text-slate-400">(اختيارية)</span>
        <textarea className={clsx(noteField, 'min-h-[3.5rem]')} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} data-testid="disb-pay-note" />
      </label>
      <div className="mt-3 flex gap-2">
        <button type="button" className={clsx(btnOk, 'flex-[2]')} disabled={busy} onClick={() => onConfirm(note)} data-testid="disb-pay-confirm">{busy ? 'جارٍ الصرف…' : 'تأكيد الصرف'}</button>
        <button type="button" className={clsx(btnGhost, 'flex-1')} disabled={busy} onClick={onClose} data-testid="disb-pay-cancel">رجوع</button>
      </div>
    </Sheet>
  )
}

export function ResubmitSheet({ detail, busy, onConfirm, onClose }: { detail: DisbursementDetail; busy: boolean; onConfirm: (note: string) => void; onClose: () => void }) {
  const [note, setNote] = useState('')
  const contractors = detail.request.kind === 'contractor_wages'
  return (
    <Sheet title="إعادة الإرسال للمدير المفوض" onClose={onClose} busy={busy} testId="disb-resubmit-sheet">
      <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-900">
        <b className="font-black">سبب الرفض:</b> <span data-testid="disb-resubmit-reason">{detail.request.decision_note ?? '—'}</span>
      </div>
      <ul className="my-3 space-y-2">
        <Check>{contractors
          ? 'النسخة الجديدة تُحسب من الأجور والبصمة الحالية — صحِّح الأجور اليومية قبل الإرسال إن لزم.'
          : 'الشهر يبقى مقفلاً؛ النسخة الجديدة بالأرقام المعتمدة نفسها وتصل المدير المفوض بإشعار مع ملاحظتك.'}</Check>
        <Check>الطلب المرفوض يبقى محفوظاً في السجل.</Check>
      </ul>
      <label className="block text-xs font-black text-slate-700">ملاحظتك للمدير المفوض <span className="font-bold text-slate-400">(اختيارية)</span>
        <textarea className={clsx(noteField, 'min-h-[4.5rem]')} value={note} maxLength={400} onChange={(e) => setNote(e.target.value)} data-testid="disb-resubmit-note" />
      </label>
      <div className="mt-3 flex gap-2">
        <button type="button" className={clsx(btnPrimary, 'flex-[2]')} disabled={busy} onClick={() => onConfirm(note)} data-testid="disb-resubmit-confirm">{busy ? 'جارٍ الإرسال…' : 'إعادة الإرسال'}</button>
        <button type="button" className={clsx(btnGhost, 'flex-1')} disabled={busy} onClick={onClose} data-testid="disb-resubmit-cancel">رجوع</button>
      </div>
    </Sheet>
  )
}
