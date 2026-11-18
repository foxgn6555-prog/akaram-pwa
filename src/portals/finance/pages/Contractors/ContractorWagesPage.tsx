/**
 * أجور المتعهدين — الشؤون المالية (00263 · المتعهدون الجولة الأخيرة) + قواعد البصمة ومسار الصرف
 *  · الحساب من «العدد المعتمد» الذي اعتمدته غرفة العمليات لشهرٍ ما (جهة واحدة: القاطع/المتعهد/المتابعة) — لا قائمة عمال
 *  · لكل متعهد شهرياً: أجر المتعهد اليومي + أجر العامل اليومي (تُحدَّد هنا فقط، تدقيق قبل/بعد، نسخ الشهر السابق)
 *  · لكل يوم عدده المعتمد > 0: عمال اليوم = العدد − 1 ⇒ أجر العمال = (العدد − 1) × أجر العامل، ويُضاف أجر المتعهد لذلك اليوم
 *    مثال: 16 معتمد × 30 يوماً ⇒ 450 × 8,000 = 3,600,000 + 15,000 × 30 = 450,000 ⇒ 4,050,000 (قبل الحجب والاستقطاع)
 *  · قواعد البصمة (المستحق الصافي): يوم المتعهد بلا بصمة (غياب/إجازة معتمدة/بلا سجل حضور) يُحجب بكامله — هو وعماله؛
 *    البصمة الناقصة (دخول بلا خروج أو العكس) تُدفع كالموظفين؛ نقص الدقائق فوق السماح يُستقطع من أجر المتعهد وحده
 *  · «اعتماد وإرسال» ينشئ طلب صرف للمدير المفوض (يعتمده أو يرفضه بسبب) ثم تصرفه المالية من القاصة — أجور الشهر تتجمّد ما دام الطلب قائماً
 *  · الأيام بلا عدد أو بعدد 0 ⇒ لا أجر · الشهر غير المعتمد ⇒ لا مستحق (بانتظار اعتماد غرفة العمليات)
 *  · تفصيل الأيام لكل متعهد · Excel مؤسسي (كشف + تفصيل الأيام) · الأرقام إنكليزية (0-9) دائماً
 */
import { Fragment, useMemo, useState } from 'react'
import { useContractorWagesMonthStatus, useContractorWagesSheet, useCopyPreviousRates, useSetContractorRates } from '@features/contractors/hooks'
import { useContractorWageDaysAdjusted, useContractorWagesAdjusted, useContractorWagesReadiness } from '@features/disbursements/hooks'
import { ContractorWagesSendPanel } from '@features/disbursements/components/ContractorWagesSendPanel'
import { blockReasonLabel, clock, minutesLabel } from '@features/disbursements/format'
import { useCanCall } from '@features/permissions/my-permissions'
import type { ApprovedSource, ContractorWageMonthStatus, ContractorWageRow } from '@sdk/contractors.sdk'
import { disbursements, type ContractorWageAdjustedDay, type ContractorWageAdjustedRow } from '@sdk/disbursements.sdk'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { MonthPicker } from '@portals/hr/components/hr-ui'
import { field, fmtMoney, monthStart } from '@portals/hr/components/hr-format'
import { buildExcelReport } from '@lib/export/excel-report'
import { PARENT_AR, SHIFT_AR } from '@features/contractors/format'
import clsx from 'clsx'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'

export const SOURCE_AR: Record<ApprovedSource, string> = { sector_manager: 'مسؤول القاطع', contractor: 'المتعهد', follow_up: 'المتابعة' }
const parentAr = (p: string) => PARENT_AR[p] ?? p

/** مجاميع الكشف (العدد الموزون، الأيام، المستحقات، من لا أجور له) — قبل الحجب والاستقطاع */
export function summarizeWages(rows: ContractorWageRow[]) {
  return {
    contractors: rows.length,
    paidDays: rows.reduce((s, r) => s + r.paid_days, 0),
    workerDays: rows.reduce((s, r) => s + r.worker_days, 0),
    contractorPay: rows.reduce((s, r) => s + (r.contractor_pay ?? 0), 0),
    workersPay: rows.reduce((s, r) => s + (r.workers_pay ?? 0), 0),
    total: rows.reduce((s, r) => s + (r.total_pay ?? 0), 0),
    missingRates: rows.filter((r) => !r.rates_set).length,
  }
}

/** صف الكشف + أرقام البصمة لنفس المتعهد (adj = null ⇒ لم تُحمَّل بعد: لا نعرض رقماً مفترضاً) */
export type WageRow = ContractorWageRow & { adj: ContractorWageAdjustedRow | null }
export function mergeWages(rows: ContractorWageRow[], adjusted: ContractorWageAdjustedRow[] | undefined): WageRow[] {
  const by = new Map((adjusted ?? []).map((a) => [a.contractor_user_id, a]))
  return rows.map((r) => ({ ...r, adj: by.get(r.contractor_user_id) ?? null }))
}
/** مجاميع ما بعد قواعد البصمة: الأيام المدفوعة/المحجوبة والمبالغ والصافي */
export function summarizeAdjusted(rows: WageRow[]) {
  const a = rows.map((r) => r.adj).filter((x): x is ContractorWageAdjustedRow => x != null)
  return {
    loaded: a.length,
    payDays: a.reduce((s, x) => s + x.pay_days, 0),
    paidDays: a.reduce((s, x) => s + x.paid_days, 0),
    blockedDays: a.reduce((s, x) => s + x.blocked_days, 0),
    deductionMinutes: a.reduce((s, x) => s + x.deduction_minutes, 0),
    gross: a.reduce((s, x) => s + (x.gross_pay ?? 0), 0),
    blocked: a.reduce((s, x) => s + (x.blocked_pay ?? 0), 0),
    deduction: a.reduce((s, x) => s + (x.deduction_amount ?? 0), 0),
    net: a.reduce((s, x) => s + (x.net_pay ?? 0), 0),
    unlinked: a.filter((x) => !x.fingerprint_linked).length,
  }
}

/** معادلة الصف نصاً (مرئية للمالية وفي Excel): المعادلة الأصلية ثم ما حُجب وما استُقطع بسبب البصمة */
export function wageFormula(r: ContractorWageRow, adj?: ContractorWageAdjustedRow | null) {
  if (!r.approved) return 'بانتظار اعتماد غرفة العمليات'
  if (!r.rates_set) return 'حدِّد الأجور حتى يُحتسب المستحق'
  const base = `${r.worker_days} عامل/يوم × ${fmtMoney(r.worker_daily_wage)} + ${r.paid_days} يوم × ${fmtMoney(r.contractor_daily_wage)}`
  const parts = [base]
  if ((adj?.blocked_pay ?? 0) > 0) parts.push(`− محجوب بالبصمة ${fmtMoney(adj!.blocked_pay)}`)
  if ((adj?.deduction_amount ?? 0) > 0) parts.push(`− استقطاع ${fmtMoney(adj!.deduction_amount)}`)
  return parts.join(' ')
}

const dayStateText = (x: ContractorWageAdjustedDay): string => (x.state === 'blocked' ? 'محجوب' : x.state === 'paid' ? 'مدفوع' : 'لا أجر')

export async function downloadContractorWagesExcel(month: string, status: ContractorWageMonthStatus | null, rows: WageRow[], days: { name: string; days: ContractorWageAdjustedDay[] }[] = []) {
  const t = summarizeWages(rows)
  const a = summarizeAdjusted(rows)
  const approvedTxt = status?.approved ? `الجهة المعتمدة: ${SOURCE_AR[status.approved_source!]} · اعتمدها ${status.approved_by_name ?? ''}` : 'الشهر غير معتمد من غرفة العمليات — لا مستحقات'
  await buildExcelReport({
    sheetName: 'أجور المتعهدين', company: 'شركة جزيرة الأكارم', companySub: 'الشؤون المالية — أجور المتعهدين', title: `أجور المتعهدين — ${month.slice(0, 7)}`,
    meta: `أُنشئ ${new Date().toLocaleString('ar-IQ-u-nu-latn')} · ${approvedTxt} · المعادلة: لكل يوم بعدد معتمد > 0: (العدد − 1) × أجر العامل + أجر المتعهد · قواعد البصمة: يوم بلا بصمة (غياب/إجازة/بلا سجل) يُحجب للمتعهد وعماله، والبصمة الناقصة تُدفع، ونقص الدقائق فوق السماح يُستقطع من أجر المتعهد وحده · العملة: دينار عراقي`,
    orientation: 'landscape', fileName: `أجور-المتعهدين-${month.slice(0, 7)}.xlsx`,
    columns: [
      { header: 'ت', key: 'i', width: 5, align: 'center' }, { header: 'المتعهد', key: 'name', width: 24 }, { header: 'الهاتف', key: 'phone', width: 13, align: 'center' },
      { header: 'القاطع', key: 'parent', width: 16 }, { header: 'المنطقة', key: 'area', width: 16 }, { header: 'الوجبة', key: 'shift', width: 8, align: 'center' },
      { header: 'أيام الصرف', key: 'pd', width: 9, align: 'center' }, { header: 'أيام مدفوعة', key: 'paid', width: 9, align: 'center' }, { header: 'أيام محجوبة بالبصمة', key: 'bd', width: 11, align: 'center' },
      { header: 'عامل/يوم', key: 'wd', width: 9, align: 'center' },
      { header: 'أجر المتعهد اليومي', key: 'cw', width: 13, align: 'center', numFmt: '#,##0' }, { header: 'أجر العامل اليومي', key: 'ww', width: 13, align: 'center', numFmt: '#,##0' },
      { header: 'أجور العمال (قبل الحجب)', key: 'wp', width: 15, align: 'center', numFmt: '#,##0' }, { header: 'أجر المتعهد (قبل الحجب)', key: 'cp', width: 14, align: 'center', numFmt: '#,##0' },
      { header: 'أجور محجوبة بالبصمة', key: 'bp', width: 14, align: 'center', numFmt: '#,##0' },
      { header: 'استقطاع نقص الدقائق', key: 'dd', width: 13, align: 'center', numFmt: '#,##0' }, { header: 'دقائق مستقطعة', key: 'dm', width: 10, align: 'center' },
      { header: 'الصافي المستحق', key: 'tp', width: 15, align: 'center', numFmt: '#,##0' },
      { header: 'المعادلة', key: 'f', width: 34, wrap: true }, { header: 'ملاحظة', key: 'note', width: 22, wrap: true }, { header: 'حددها', key: 'by', width: 16 },
    ],
    rows: rows.map((r, i) => ({ i: i + 1, name: r.contractor_name + (r.is_active ? '' : ' (موقوف)') + (r.adj && !r.adj.fingerprint_linked ? ' (بلا رقم بصمة)' : ''), phone: r.contractor_phone ?? '', parent: parentAr(r.parent_sector), area: r.area_name, shift: SHIFT_AR[r.shift] ?? r.shift,
      pd: r.adj?.pay_days ?? r.paid_days, paid: r.adj?.paid_days ?? '', bd: r.adj?.blocked_days ?? '', wd: r.worker_days, cw: r.contractor_daily_wage, ww: r.worker_daily_wage,
      wp: r.workers_pay ?? 0, cp: r.contractor_pay ?? 0, bp: r.adj?.blocked_pay ?? 0, dd: r.adj?.deduction_amount ?? 0, dm: r.adj?.deduction_minutes ?? 0, tp: r.adj?.net_pay ?? 0,
      f: wageFormula(r, r.adj), note: r.note ?? '', by: r.set_by_name ?? '' })),
    totalRow: { i: 'الإجمالي', name: `${t.contractors} متعهد`, pd: a.payDays, paid: a.paidDays, bd: a.blockedDays, wd: t.workerDays, wp: t.workersPay, cp: t.contractorPay, bp: a.blocked, dd: a.deduction, dm: a.deductionMinutes, tp: a.net },
    extraSheets: days.map((d) => ({
      sheetName: d.name.slice(0, 28), title: `تفصيل الأيام — ${d.name} — ${month.slice(0, 7)}`, columns: [
        { header: 'اليوم', key: 'date', width: 13, align: 'center' }, { header: 'العدد المعتمد', key: 'hc', width: 11, align: 'center' }, { header: 'العمال (العدد − 1)', key: 'w', width: 12, align: 'center' },
        { header: 'الحالة', key: 'st', width: 10, align: 'center' }, { header: 'سبب الحجب', key: 'why', width: 16 },
        { header: 'دخول', key: 'in', width: 8, align: 'center' }, { header: 'خروج', key: 'out', width: 8, align: 'center' },
        { header: 'المطلوب (د)', key: 'req', width: 10, align: 'center' }, { header: 'النقص (د)', key: 'sf', width: 9, align: 'center' }, { header: 'السماح (د)', key: 'gr', width: 9, align: 'center' }, { header: 'المستقطع (د)', key: 'dm', width: 10, align: 'center' },
        { header: 'أجر اليوم قبل الحجب', key: 'bp', width: 14, align: 'center', numFmt: '#,##0' }, { header: 'الاستقطاع', key: 'dd', width: 12, align: 'center', numFmt: '#,##0' }, { header: 'أجر اليوم الصافي', key: 'dp', width: 14, align: 'center', numFmt: '#,##0' },
        { header: 'تصحيح غرفة العمليات', key: 'reason', width: 26, wrap: true }],
      rows: d.days.map((x) => ({ date: x.log_date, hc: x.headcount ?? '—', w: x.workers ?? '—', st: dayStateText(x), why: blockReasonLabel(x.block_reason),
        in: x.check_in ? clock(x.check_in) : '', out: x.check_out ? clock(x.check_out) : '', req: x.required_minutes ?? '', sf: x.shortfall_minutes ?? '', gr: x.grace_minutes ?? '', dm: x.deduct_minutes ?? '',
        bp: x.base_pay ?? 0, dd: x.deduction ?? 0, dp: x.day_pay ?? 0, reason: x.edit_reason ?? '' })),
      totalRow: { date: 'الإجمالي', hc: d.days.reduce((s, x) => s + (x.headcount ?? 0), 0), w: d.days.reduce((s, x) => s + (x.workers ?? 0), 0), dm: d.days.reduce((s, x) => s + (x.deduct_minutes ?? 0), 0),
        bp: d.days.reduce((s, x) => s + (x.base_pay ?? 0), 0), dd: d.days.reduce((s, x) => s + (x.deduction ?? 0), 0), dp: d.days.reduce((s, x) => s + (x.day_pay ?? 0), 0) },
    })),
  })
}

export default function ContractorWagesPage() {
  const [month, setMonth] = useState(monthStart())
  const { data: status = null } = useContractorWagesMonthStatus(month)
  const { data: sheet = [], isLoading } = useContractorWagesSheet(month)
  const adjustedQ = useContractorWagesAdjusted(month)
  const readinessQ = useContractorWagesReadiness(month)
  const sendGate = useCanCall('finance_contractor_wages_close')
  const setRates = useSetContractorRates()
  const copyPrev = useCopyPreviousRates()
  const [editing, setEditing] = useState<string | null>(null)
  const [openDays, setOpenDays] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const rows = useMemo(() => mergeWages(sheet, adjustedQ.data), [sheet, adjustedQ.data])
  const t = useMemo(() => summarizeWages(rows), [rows])
  const a = useMemo(() => summarizeAdjusted(rows), [rows])
  const adjReady = !adjustedQ.isLoading && !adjustedQ.isError && rows.every((r) => r.adj)
  // أجور الشهر مجمَّدة ما دام لشهر المتعهدين طلب صرف قائم (الخادم يرفض التعديل أيضاً)
  const frozen = readinessQ.data?.active_request != null
  const frozenTitle = frozen ? 'أجور الشهر مجمَّدة: له طلب صرف قائم — تُعدَّل بعد رفضه فقط' : undefined

  const exportExcel = async () => {
    setExporting(true)
    try {
      const days = await Promise.all(rows.map(async (r) => ({ name: r.contractor_name, days: await disbursements.contractorWageDays(r.contractor_user_id, month) })))
      await downloadContractorWagesExcel(month, status, rows, days)
    } finally { setExporting(false) }
  }

  return (
    <div className="space-y-4" data-testid="contractor-wages-page">
      <ExecPageHeader icon="users" title="أجور المتعهدين" stats={[
        { label: 'المتعهدون', value: t.contractors, tone: 'plain', testId: 'cw-stat-contractors' },
        { label: 'أيام مدفوعة', value: adjReady ? a.paidDays : '—', tone: 'green', testId: 'cw-stat-days' },
        { label: 'أيام محجوبة بالبصمة', value: adjReady ? a.blockedDays : '—', tone: adjReady && a.blockedDays > 0 ? 'gold' : 'plain', testId: 'cw-stat-blocked' },
        { label: 'عامل/يوم', value: t.workerDays, tone: 'plain', testId: 'cw-stat-worker-days' },
        { label: t.missingRates ? 'بلا أجور محددة — حدِّد الأجور حتى يُحتسب المستحق' : 'بلا أجور محددة', value: t.missingRates, tone: t.missingRates ? 'gold' : 'plain', testId: 'cw-stat-missing' },
        { label: 'صافي المستحق بعد البصمة (د.ع)', value: adjReady ? fmtMoney(a.net) : '—', tone: 'gold', testId: 'cw-stat-total' },
      ]} subtitle={<>المستحق يُحتسب من العدد الذي اعتمدته غرفة العمليات للشهر: لكل يوم بعدد &gt; 0 ⇒ (العدد − 1) × أجر العامل + أجر المتعهد · اليوم بلا بصمة للمتعهد يُحجب له ولعماله، ونقص الدقائق فوق السماح يُستقطع من أجره وحده · الأجور تُحدَّد هنا فقط ويُسجَّل كل تعديل في سجل التدقيق</>} actions={<div className="flex flex-wrap items-center gap-2">
          <MonthPicker value={month} onChange={setMonth} testId="cw-month" />
          <Button variant="secondary" size="sm" disabled={copyPrev.isPending || frozen} title={frozenTitle} onClick={() => { if (window.confirm('نسخ أجور الشهر السابق لكل متعهد لا أجور له في هذا الشهر؟')) copyPrev.mutate({ month }) }} data-testid="cw-copy-prev">نسخ أجور الشهر السابق</Button>
          <Button variant="secondary" size="sm" disabled={exporting || rows.length === 0 || !adjReady} onClick={() => void exportExcel()} data-testid="cw-excel">Excel</Button>
        </div>} />

      {status && (
        <div className={clsx('rounded-2xl border p-3 text-xs', status.approved ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900')} data-testid="cw-month-status">
          {status.approved
            ? <>الشهر معتمد من غرفة العمليات · الجهة المعتمدة: <b>{SOURCE_AR[status.approved_source!]}</b>{status.approved_by_name && <> · اعتمدها {status.approved_by_name}</>}{status.approved_at && <> · {new Date(status.approved_at).toLocaleDateString('ar-IQ-u-nu-latn')}</>}</>
            : <>الشهر غير معتمد بعد من غرفة العمليات ({status.month_ended ? 'انتهى الشهر وبانتظار اعتماد جهة العدّ' : 'الشهر لم ينتهِ بعد'}) — يمكنك تحديد الأجور الآن، ويُحتسب المستحق تلقائياً بعد الاعتماد</>}
        </div>
      )}

      <ContractorWagesSendPanel month={month} readiness={readinessQ.data} loading={readinessQ.isLoading} error={readinessQ.isError} onRetry={() => void readinessQ.refetch()}
        noPermission={!sendGate.allowed} gateTitle={sendGate.title} />

      {adjustedQ.isError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-900" role="alert" data-testid="cw-adjusted-error">
          تعذّر تحميل أرقام البصمة — لا تُعرض مبالغ مفترضة. <button type="button" className="font-black underline" onClick={() => void adjustedQ.refetch()}>إعادة المحاولة</button>
        </div>
      )}
      {adjReady && a.unlinked > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" data-testid="cw-unlinked">
          {a.unlinked} متعهد بلا رقم بصمة في ملفه الوظيفي — يُضاف الرقم من الموارد البشرية قبل إرسال الأجور.
        </div>
      )}

      {isLoading ? <LoadingSpinner /> : rows.length === 0 ? <EmptyState title="لا متعهدين في هذا الشهر" hint="يظهر هنا كل متعهد مُعيَّن أو له أعداد مسجَّلة خلال الشهر" /> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[1250px] text-xs" dir="rtl">
            <thead className="bg-slate-50 text-slate-600">
              <tr><th className="p-2 text-start">المتعهد</th><th className="p-2">القاطع / المنطقة</th><th className="p-2">أيام الصرف</th><th className="p-2">عامل/يوم</th><th className="p-2">أجر المتعهد اليومي</th><th className="p-2">أجر العامل اليومي</th><th className="p-2">قبل الحجب</th><th className="p-2">محجوب بالبصمة</th><th className="p-2">استقطاع نقص الدقائق</th><th className="p-2">الصافي المستحق</th><th className="p-2 text-start">ملاحظة / حددها</th><th className="p-2"></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.contractor_user_id}>
                  <tr className={clsx('border-t border-slate-100', !r.is_active && 'text-slate-400')} data-testid={`cw-row-${r.contractor_user_id}`}>
                    <td className="p-2 font-bold">{r.contractor_name}{!r.is_active && <span className="ms-1 text-[10px]">(موقوف)</span>}{r.adj && !r.adj.fingerprint_linked && <span className="ms-1 rounded bg-amber-100 px-1 text-[10px] font-black text-amber-800" title="لا رقم بصمة في ملف الموظف المرتبط بهذا المتعهد" data-testid={`cw-nofp-${r.contractor_user_id}`}>بلا رقم بصمة</span>}<span className="block text-[10px] font-normal text-slate-500" dir="ltr">{r.contractor_phone ?? ''}</span></td>
                    <td className="p-2 text-center">{parentAr(r.parent_sector)} / {r.area_name}<span className="block text-[10px] text-slate-500">{SHIFT_AR[r.shift] ?? r.shift}</span></td>
                    <td className="p-2 text-center font-bold tabular-nums" data-testid={`cw-days-${r.contractor_user_id}`}>
                      {r.adj ? <><span className="text-emerald-700" data-testid={`cw-paid-days-${r.contractor_user_id}`}>{r.adj.paid_days}</span><span className="font-normal text-slate-500"> / {r.adj.pay_days}</span></> : <span className="text-slate-400">{r.paid_days}</span>}
                      {(r.adj?.blocked_days ?? 0) > 0 && <span className="ms-1 rounded bg-amber-100 px-1 text-[10px] font-black text-amber-800" title="أيام بلا بصمة (غياب/إجازة/بلا سجل حضور): لا تُدفع للمتعهد ولا لعماله" data-testid={`cw-blocked-${r.contractor_user_id}`}>{r.adj!.blocked_days} محجوب</span>}
                      {(r.uncovered_days ?? 0) > 0 && <span className="ms-1 rounded bg-rose-100 px-1 text-[10px] font-black text-rose-800" title="أيام فيها رقم من جهة أخرى ولا رقم من الجهة المعتمدة — غير مدفوعة؛ تُصحَّح من غرفة العمليات بإعادة فتح الشهر" data-testid={`cw-uncovered-${r.contractor_user_id}`}>+{r.uncovered_days} غير مغطى</span>}
                    </td>
                    <td className="p-2 text-center tabular-nums">{r.worker_days}</td>
                    <td className="p-2 text-center tabular-nums">{r.rates_set ? fmtMoney(r.contractor_daily_wage) : <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">غير محدد</span>}</td>
                    <td className="p-2 text-center tabular-nums">{r.rates_set ? fmtMoney(r.worker_daily_wage) : '—'}</td>
                    <td className="p-2 text-center tabular-nums" data-testid={`cw-gross-${r.contractor_user_id}`}>{r.adj?.gross_pay == null ? '—' : fmtMoney(r.adj.gross_pay)}</td>
                    <td className={clsx('p-2 text-center tabular-nums', (r.adj?.blocked_pay ?? 0) > 0 && 'font-bold text-amber-700')} data-testid={`cw-blocked-pay-${r.contractor_user_id}`}>{r.adj?.blocked_pay == null ? '—' : fmtMoney(r.adj.blocked_pay)}</td>
                    <td className={clsx('p-2 text-center tabular-nums', (r.adj?.deduction_amount ?? 0) > 0 && 'font-bold text-red-700')} data-testid={`cw-deduction-${r.contractor_user_id}`}>{r.adj?.deduction_amount == null ? '—' : fmtMoney(r.adj.deduction_amount)}{(r.adj?.deduction_minutes ?? 0) > 0 && <span className="block text-[10px] font-normal text-slate-500">{minutesLabel(r.adj!.deduction_minutes)}</span>}</td>
                    <td className="p-2 text-center font-black tabular-nums text-sky-800" data-testid={`cw-payable-${r.contractor_user_id}`}>{r.adj?.net_pay == null ? '—' : fmtMoney(r.adj.net_pay)}<span className="block text-[10px] font-normal text-slate-500" data-testid={`cw-formula-${r.contractor_user_id}`}>{wageFormula(r, r.adj)}</span></td>
                    <td className="p-2 text-[11px] text-slate-600">{r.note && <span className="block">{r.note}</span>}{r.set_by_name && <span className="text-slate-400">{r.set_by_name} · {r.set_at ? new Date(r.set_at).toLocaleDateString('ar-IQ-u-nu-latn') : ''}</span>}</td>
                    <td className="p-2 text-center whitespace-nowrap">
                      <button type="button" disabled={frozen} title={frozenTitle} className="h-7 rounded-lg border border-slate-300 px-2 text-[11px] font-bold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => setEditing(editing === r.contractor_user_id ? null : r.contractor_user_id)} data-testid={`cw-edit-${r.contractor_user_id}`}>{r.rates_set ? 'تعديل الأجور' : 'تحديد الأجور'}</button>
                      <button type="button" className="ms-1 h-7 rounded-lg border border-slate-300 px-2 text-[11px] font-bold hover:bg-slate-50" onClick={() => setOpenDays(openDays === r.contractor_user_id ? null : r.contractor_user_id)} data-testid={`cw-days-btn-${r.contractor_user_id}`}>الأيام</button>
                    </td>
                  </tr>
                  {editing === r.contractor_user_id && !frozen && <RatesEditor row={r} month={month} pending={setRates.isPending} onCancel={() => setEditing(null)} onSave={(v) => setRates.mutate({ contractorId: r.contractor_user_id, month, ...v }, { onSuccess: () => setEditing(null) })} />}
                  {openDays === r.contractor_user_id && <DaysDetail contractorId={r.contractor_user_id} month={month} />}
                </Fragment>
              ))}
            </tbody>
            <tfoot><tr className="border-t-2 border-slate-300 bg-slate-50 font-black"><td className="p-2" colSpan={2}>الإجمالي · {t.contractors} متعهد</td><td className="p-2 text-center tabular-nums">{adjReady ? `${a.paidDays} / ${a.payDays}` : '—'}</td><td className="p-2 text-center tabular-nums">{t.workerDays}</td><td className="p-2" colSpan={2}></td><td className="p-2 text-center tabular-nums">{adjReady ? fmtMoney(a.gross) : '—'}</td><td className="p-2 text-center tabular-nums text-amber-700">{adjReady ? fmtMoney(a.blocked) : '—'}</td><td className="p-2 text-center tabular-nums text-red-700">{adjReady ? fmtMoney(a.deduction) : '—'}</td><td className="p-2 text-center tabular-nums text-sky-800" data-testid="cw-total">{adjReady ? fmtMoney(a.net) : '—'}</td><td colSpan={2}></td></tr></tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

function RatesEditor({ row, month, pending, onCancel, onSave }: { row: ContractorWageRow; month: string; pending: boolean; onCancel: () => void; onSave: (v: { contractorDaily: number; workerDaily: number; note: string | null }) => void }) {
  const [cw, setCw] = useState(row.rates_set ? String(row.contractor_daily_wage) : '')
  const [ww, setWw] = useState(row.rates_set ? String(row.worker_daily_wage) : '')
  const [note, setNote] = useState(row.note ?? '')
  const c = Number(cw), w = Number(ww)
  const valid = cw.trim() !== '' && ww.trim() !== '' && Number.isFinite(c) && Number.isFinite(w) && c >= 0 && w >= 0
  const preview = row.worker_days * w + row.paid_days * c
  return (
    <tr className="bg-sky-50/60" data-testid={`cw-editor-${row.contractor_user_id}`}>
      <td className="p-2" colSpan={12}>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[11px] font-bold text-slate-600">أجر المتعهد اليومي (د.ع)<input type="number" min={0} step={250} className={clsx(field, 'mt-1 w-40')} dir="ltr" value={cw} onChange={(e) => setCw(e.target.value)} data-testid="cw-contractor-wage" /></label>
          <label className="text-[11px] font-bold text-slate-600">أجر العامل اليومي (د.ع)<input type="number" min={0} step={250} className={clsx(field, 'mt-1 w-40')} dir="ltr" value={ww} onChange={(e) => setWw(e.target.value)} data-testid="cw-worker-wage" /></label>
          <label className="flex-1 text-[11px] font-bold text-slate-600">ملاحظة (اختيارية)<input className={clsx(field, 'mt-1')} value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} data-testid="cw-note" placeholder="مثال: عقد المقاولة رقم …" /></label>
          <div className="text-[11px] text-slate-600">قبل الحجب والاستقطاع لشهر {month.slice(0, 7)}: <b className="tabular-nums" data-testid="cw-preview">{valid && row.approved ? fmtMoney(preview) : '—'}</b>{valid && row.approved && <span> ({row.worker_days} عامل/يوم × {fmtMoney(w)} + {row.paid_days} يوم × {fmtMoney(c)})</span>}{!row.approved && <span className="text-amber-700"> · يُحتسب بعد اعتماد غرفة العمليات</span>}</div>
          <Button size="sm" disabled={!valid || pending} onClick={() => onSave({ contractorDaily: c, workerDaily: w, note: note.trim() || null })} data-testid="cw-save">حفظ</Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>إلغاء</Button>
        </div>
      </td>
    </tr>
  )
}

function DaysDetail({ contractorId, month }: { contractorId: string; month: string }) {
  const { data: days = [], isLoading } = useContractorWageDaysAdjusted(contractorId, month)
  return (
    <tr className="bg-slate-50/70" data-testid={`cw-days-${contractorId}-detail`}>
      <td className="p-2" colSpan={12}>
        {isLoading ? <LoadingSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[11px]" dir="rtl">
              <thead className="text-slate-500"><tr><th className="p-1 text-start">اليوم</th><th className="p-1">العدد المعتمد</th><th className="p-1">العمال (العدد − 1)</th><th className="p-1">الحالة</th><th className="p-1">دخول</th><th className="p-1">خروج</th><th className="p-1">المطلوب</th><th className="p-1">النقص</th><th className="p-1">السماح</th><th className="p-1">قبل الحجب</th><th className="p-1">الاستقطاع</th><th className="p-1">أجر اليوم</th><th className="p-1 text-start">تصحيح غرفة العمليات</th></tr></thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.log_date} className={clsx('border-t border-slate-100', d.state == null && 'text-slate-400', d.state === 'blocked' && 'bg-amber-50/70')} data-testid={`cw-day-${contractorId}-${d.log_date}`} data-state={d.state ?? 'none'}>
                    <td className="p-1 tabular-nums" dir="ltr">{d.log_date}</td>
                    <td className="p-1 text-center tabular-nums">{d.headcount ?? '—'}</td>
                    <td className="p-1 text-center tabular-nums">{d.workers ?? '—'}</td>
                    <td className="p-1 text-center font-bold">{d.state == null ? <span className="font-normal">لا أجر</span> : d.state === 'blocked' ? <span className="text-amber-700">محجوب — {blockReasonLabel(d.block_reason)}</span> : <span className="text-emerald-700">مدفوع</span>}</td>
                    <td className="p-1 text-center tabular-nums" dir="ltr">{d.check_in ? clock(d.check_in) : '—'}</td>
                    <td className="p-1 text-center tabular-nums" dir="ltr">{d.check_out ? clock(d.check_out) : '—'}</td>
                    <td className="p-1 text-center tabular-nums">{d.required_minutes ?? '—'}</td>
                    <td className="p-1 text-center tabular-nums">{d.shortfall_minutes ?? '—'}</td>
                    <td className="p-1 text-center tabular-nums">{d.grace_minutes ?? '—'}</td>
                    <td className="p-1 text-center tabular-nums">{d.base_pay == null ? '—' : fmtMoney(d.base_pay)}</td>
                    <td className={clsx('p-1 text-center tabular-nums', (d.deduction ?? 0) > 0 && 'font-bold text-red-700')}>{d.deduction == null ? '—' : fmtMoney(d.deduction)}{(d.deduct_minutes ?? 0) > 0 && <span className="block text-[10px] font-normal text-slate-500">{minutesLabel(d.deduct_minutes)}</span>}</td>
                    <td className="p-1 text-center font-bold tabular-nums">{d.day_pay == null ? <span className="font-normal">لا أجر</span> : fmtMoney(d.day_pay)}</td>
                    <td className="p-1 text-amber-700">{d.edit_reason ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </td>
    </tr>
  )
}
