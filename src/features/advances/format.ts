/** تنسيقات السلف (00191) — أرقام إنكليزية دائماً */
import type { Advance } from '@sdk/advances.sdk'
import { fmtMoney } from '@portals/hr/components/hr-format'

export const fmtDT = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('ar-IQ-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }) : '—')
export const methodDetail = (a: Pick<Advance, 'repayment_method' | 'installments' | 'monthly_amount' | 'percent'>) =>
  a.repayment_method === 'equal' ? `${a.installments ?? '—'} شهراً` : a.repayment_method === 'fixed' ? `${fmtMoney(a.monthly_amount)} د.ع شهرياً` : a.repayment_method === 'percent' ? `${a.percent ?? '—'}% من الراتب` : 'دفعة واحدة'
