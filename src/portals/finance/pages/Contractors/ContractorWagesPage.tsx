/**
 * أجور المتعهدين — الشؤون المالية (00263 · المتعهدون الجولة الأخيرة)
 *  · الحساب من «العدد المعتمد» الذي اعتمدته غرفة العمليات لشهرٍ ما (جهة واحدة: القاطع/المتعهد/المتابعة) — لا قائمة عمال
 *  · لكل متعهد شهرياً: أجر المتعهد اليومي + أجر العامل اليومي (تُحدَّد هنا فقط، تدقيق قبل/بعد، نسخ الشهر السابق)
 *  · لكل يوم عدده المعتمد > 0: عمال اليوم = العدد − 1 ⇒ أجر العمال = (العدد − 1) × أجر العامل، ويُضاف أجر المتعهد لذلك اليوم
 *    مثال: 16 معتمد × 30 يوماً ⇒ 450 × 8,000 = 3,600,000 + 15,000 × 30 = 450,000 ⇒ 4,050,000
 *  · الأيام بلا عدد أو بعدد 0 ⇒ لا أجر · الشهر غير المعتمد ⇒ لا مستحق (بانتظار اعتماد غرفة العمليات)
 *  · تفصيل الأيام لكل متعهد · Excel مؤسسي (كشف + تفصيل الأيام) · الأرقام إنكليزية (0-9) دائماً
 */
import { Fragment, useMemo, useState } from 'react'
import { useContractorWageDays, useContractorWagesMonthStatus, useContractorWagesSheet, useCopyPreviousRates, useSetContractorRates } from '@features/contractors/hooks'
import type { ApprovedSource, ContractorWageDay, ContractorWageMonthStatus, ContractorWageRow } from '@sdk/contractors.sdk'
import { contractors } from '@sdk/contractors.sdk'
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

/** مجاميع الكشف (العدد الموزون، الأيام، المستحقات، من لا أجور له) */
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

/** معادلة الصف نصاً (مرئية للمالية وفي Excel) */
export function wageFormula(r: ContractorWageRow) {
  if (!r.approved) return 'بانتظار اعتماد غرفة العمليات'
  if (!r.rates_set) return 'حدِّد الأجور حتى يُحتسب المستحق'
  return `${r.worker_days} عامل/يوم × ${fmtMoney(r.worker_daily_wage)} + ${r.paid_days} يوم × ${fmtMoney(r.contractor_daily_wage)}`
}

export async function downloadContractorWagesExcel(month: string, status: ContractorWageMonthStatus | null, rows: ContractorWageRow[], days: { name: string; days: ContractorWageDay[] }[] = []) {
  const t = summarizeWages(rows)
  const approvedTxt = status?.approved ? `الجهة المعتمدة: ${SOURCE_AR[status.approved_source!]} · اعتمدها ${status.approved_by_name ?? ''}` : 'الشهر غير معتمد من غرفة العمليات — لا مستحقات'
  await buildExcelReport({
    sheetName: 'أجور المتعهدين', company: 'شركة جزيرة الأكارم', companySub: 'الشؤون المالية — أجور المتعهدين', title: `أجور المتعهدين — ${month.slice(0, 7)}`,
    meta: `أُنشئ ${new Date().toLocaleString('ar-IQ-u-nu-latn')} · ${approvedTxt} · المعادلة: لكل يوم بعدد معتمد > 0: (العدد − 1) × أجر العامل + أجر المتعهد · العملة: دينار عراقي`,
    orientation: 'landscape', fileName: `أجور-المتعهدين-${month.slice(0, 7)}.xlsx`,
    columns: [
      { header: 'ت', key: 'i', width: 5, align: 'center' }, { header: 'المتعهد', key: 'name', width: 24 }, { header: 'الهاتف', key: 'phone', width: 13, align: 'center' },
      { header: 'القاطع', key: 'parent', width: 16 }, { header: 'المنطقة', key: 'area', width: 16 }, { header: 'الوجبة', key: 'shift', width: 8, align: 'center' },
      { header: 'أيام مدفوعة', key: 'paid', width: 10, align: 'center' }, { header: 'عامل/يوم', key: 'wd', width: 10, align: 'center' },
      { header: 'أجر المتعهد اليومي', key: 'cw', width: 14, align: 'center', numFmt: '#,##0' }, { header: 'أجر العامل اليومي', key: 'ww', width: 14, align: 'center', numFmt: '#,##0' },
      { header: 'أجور العمال', key: 'wp', width: 15, align: 'center', numFmt: '#,##0' }, { header: 'أجر المتعهد', key: 'cp', width: 14, align: 'center', numFmt: '#,##0' },
      { header: 'المستحق', key: 'tp', width: 15, align: 'center', numFmt: '#,##0' }, { header: 'المعادلة', key: 'f', width: 34, wrap: true }, { header: 'ملاحظة', key: 'note', width: 22, wrap: true }, { header: 'حددها', key: 'by', width: 16 },
    ],
    rows: rows.map((r, i) => ({ i: i + 1, name: r.contractor_name + (r.is_active ? '' : ' (موقوف)'), phone: r.contractor_phone ?? '', parent: parentAr(r.parent_sector), area: r.area_name, shift: SHIFT_AR[r.shift] ?? r.shift,
      paid: r.paid_days, wd: r.worker_days, cw: r.contractor_daily_wage, ww: r.worker_daily_wage, wp: r.workers_pay ?? 0, cp: r.contractor_pay ?? 0, tp: r.total_pay ?? 0, f: wageFormula(r), note: r.note ?? '', by: r.set_by_name ?? '' })),
    totalRow: { i: 'الإجمالي', name: `${t.contractors} متعهد`, paid: t.paidDays, wd: t.workerDays, wp: t.workersPay, cp: t.contractorPay, tp: t.total },
    extraSheets: days.map((d) => ({
      sheetName: d.name.slice(0, 28), title: `تفصيل الأيام — ${d.name} — ${month.slice(0, 7)}`, columns: [
        { header: 'اليوم', key: 'date', width: 13, align: 'center' }, { header: 'العدد المعتمد', key: 'hc', width: 12, align: 'center' }, { header: 'العمال (العدد − 1)', key: 'w', width: 14, align: 'center' },
        { header: 'أجر المتعهد', key: 'cp', width: 14, align: 'center', numFmt: '#,##0' }, { header: 'أجور العمال', key: 'wp', width: 14, align: 'center', numFmt: '#,##0' }, { header: 'أجر اليوم', key: 'dp', width: 14, align: 'center', numFmt: '#,##0' }, { header: 'تصحيح غرفة العمليات', key: 'reason', width: 26, wrap: true }],
      rows: d.days.map((x) => ({ date: x.log_date, hc: x.headcount ?? '—', w: x.workers ?? '—', cp: x.contractor_pay ?? 0, wp: x.workers_pay ?? 0, dp: x.day_pay ?? 0, reason: x.edit_reason ?? '' })),
      totalRow: { date: 'الإجمالي', hc: d.days.reduce((s, x) => s + (x.headcount ?? 0), 0), w: d.days.reduce((s, x) => s + (x.workers ?? 0), 0), cp: d.days.reduce((s, x) => s + (x.contractor_pay ?? 0), 0), wp: d.days.reduce((s, x) => s + (x.workers_pay ?? 0), 0), dp: d.days.reduce((s, x) => s + (x.day_pay ?? 0), 0) },
    })),
  })
}

export default function ContractorWagesPage() {
  const [month, setMonth] = useState(monthStart())
  const { data: status = null } = useContractorWagesMonthStatus(month)
  const { data: rows = [], isLoading } = useContractorWagesSheet(month)
  const setRates = useSetContractorRates()
  const copyPrev = useCopyPreviousRates()
  const [editing, setEditing] = useState<string | null>(null)
  const [openDays, setOpenDays] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const t = useMemo(() => summarizeWages(rows), [rows])

  const exportExcel = async () => {
    setExporting(true)
    try {
      const days = await Promise.all(rows.map(async (r) => ({ name: r.contractor_name, days: await contractors.wageDays(r.contractor_user_id, month) })))
      await downloadContractorWagesExcel(month, status, rows, days)
    } finally { setExporting(false) }
  }

  return (
    <div className="space-y-4" data-testid="contractor-wages-page">
      <ExecPageHeader icon="users" title="أجور المتعهدين" stats={[
        { label: 'المتعهدون', value: t.contractors, tone: 'plain', testId: 'cw-stat-contractors' },
        { label: 'أيام مدفوعة', value: t.paidDays, tone: 'green', testId: 'cw-stat-days' },
        { label: 'عامل/يوم', value: t.workerDays, tone: 'plain', testId: 'cw-stat-worker-days' },
        { label: t.missingRates ? 'بلا أجور محددة — حدِّد الأجور حتى يُحتسب المستحق' : 'بلا أجور محددة', value: t.missingRates, tone: t.missingRates ? 'gold' : 'plain', testId: 'cw-stat-missing' },
        { label: 'إجمالي المستحق (د.ع)', value: fmtMoney(t.total), tone: 'gold', testId: 'cw-stat-total' },
      ]} subtitle={<>المستحق يُحتسب من العدد الذي اعتمدته غرفة العمليات للشهر: لكل يوم بعدد &gt; 0 ⇒ (العدد − 1) × أجر العامل + أجر المتعهد · الأيام بلا عدد أو بعدد 0 لا تُدفع · الأجور تُحدَّد هنا فقط ويُسجَّل كل تعديل في سجل التدقيق</>} actions={<div className="flex flex-wrap items-center gap-2">
          <MonthPicker value={month} onChange={setMonth} testId="cw-month" />
          <Button variant="secondary" size="sm" disabled={copyPrev.isPending} onClick={() => { if (window.confirm('نسخ أجور الشهر السابق لكل متعهد لا أجور له في هذا الشهر؟')) copyPrev.mutate({ month }) }} data-testid="cw-copy-prev">نسخ أجور الشهر السابق</Button>
          <Button variant="secondary" size="sm" disabled={exporting || rows.length === 0} onClick={() => void exportExcel()} data-testid="cw-excel">Excel</Button>
        </div>} />

      {status && (
        <div className={clsx('rounded-2xl border p-3 text-xs', status.approved ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900')} data-testid="cw-month-status">
          {status.approved
            ? <>الشهر معتمد من غرفة العمليات · الجهة المعتمدة: <b>{SOURCE_AR[status.approved_source!]}</b>{status.approved_by_name && <> · اعتمدها {status.approved_by_name}</>}{status.approved_at && <> · {new Date(status.approved_at).toLocaleDateString('ar-IQ-u-nu-latn')}</>}</>
            : <>الشهر غير معتمد بعد من غرفة العمليات ({status.month_ended ? 'انتهى الشهر وبانتظار اعتماد جهة العدّ' : 'الشهر لم ينتهِ بعد'}) — يمكنك تحديد الأجور الآن، ويُحتسب المستحق تلقائياً بعد الاعتماد</>}
        </div>
      )}

      {isLoading ? <LoadingSpinner /> : rows.length === 0 ? <EmptyState title="لا متعهدين في هذا الشهر" hint="يظهر هنا كل متعهد مُعيَّن أو له أعداد مسجَّلة خلال الشهر" /> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[1100px] text-xs" dir="rtl">
            <thead className="bg-slate-50 text-slate-600">
              <tr><th className="p-2 text-start">المتعهد</th><th className="p-2">القاطع / المنطقة</th><th className="p-2">أيام مدفوعة</th><th className="p-2">عامل/يوم</th><th className="p-2">أجر المتعهد اليومي</th><th className="p-2">أجر العامل اليومي</th><th className="p-2">أجور العمال</th><th className="p-2">أجر المتعهد</th><th className="p-2">المستحق</th><th className="p-2 text-start">ملاحظة / حددها</th><th className="p-2"></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.contractor_user_id}>
                  <tr className={clsx('border-t border-slate-100', !r.is_active && 'text-slate-400')} data-testid={`cw-row-${r.contractor_user_id}`}>
                    <td className="p-2 font-bold">{r.contractor_name}{!r.is_active && <span className="ms-1 text-[10px]">(موقوف)</span>}<span className="block text-[10px] font-normal text-slate-500" dir="ltr">{r.contractor_phone ?? ''}</span></td>
                    <td className="p-2 text-center">{parentAr(r.parent_sector)} / {r.area_name}<span className="block text-[10px] text-slate-500">{SHIFT_AR[r.shift] ?? r.shift}</span></td>
                    <td className="p-2 text-center font-bold tabular-nums text-emerald-700" data-testid={`cw-days-${r.contractor_user_id}`}>{r.paid_days}{(r.uncovered_days ?? 0) > 0 && <span className="ms-1 rounded bg-rose-100 px-1 text-[10px] font-black text-rose-800" title="أيام فيها رقم من جهة أخرى ولا رقم من الجهة المعتمدة — غير مدفوعة؛ تُصحَّح من غرفة العمليات بإعادة فتح الشهر" data-testid={`cw-uncovered-${r.contractor_user_id}`}>+{r.uncovered_days} غير مغطى</span>}</td>
                    <td className="p-2 text-center tabular-nums">{r.worker_days}</td>
                    <td className="p-2 text-center tabular-nums">{r.rates_set ? fmtMoney(r.contractor_daily_wage) : <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">غير محدد</span>}</td>
                    <td className="p-2 text-center tabular-nums">{r.rates_set ? fmtMoney(r.worker_daily_wage) : '—'}</td>
                    <td className="p-2 text-center tabular-nums">{r.workers_pay == null ? '—' : fmtMoney(r.workers_pay)}</td>
                    <td className="p-2 text-center tabular-nums">{r.contractor_pay == null ? '—' : fmtMoney(r.contractor_pay)}</td>
                    <td className="p-2 text-center font-black tabular-nums text-sky-800" data-testid={`cw-payable-${r.contractor_user_id}`}>{r.total_pay == null ? '—' : fmtMoney(r.total_pay)}<span className="block text-[10px] font-normal text-slate-500" data-testid={`cw-formula-${r.contractor_user_id}`}>{wageFormula(r)}</span></td>
                    <td className="p-2 text-[11px] text-slate-600">{r.note && <span className="block">{r.note}</span>}{r.set_by_name && <span className="text-slate-400">{r.set_by_name} · {r.set_at ? new Date(r.set_at).toLocaleDateString('ar-IQ-u-nu-latn') : ''}</span>}</td>
                    <td className="p-2 text-center whitespace-nowrap">
                      <button type="button" className="h-7 rounded-lg border border-slate-300 px-2 text-[11px] font-bold hover:bg-slate-50" onClick={() => setEditing(editing === r.contractor_user_id ? null : r.contractor_user_id)} data-testid={`cw-edit-${r.contractor_user_id}`}>{r.rates_set ? 'تعديل الأجور' : 'تحديد الأجور'}</button>
                      <button type="button" className="ms-1 h-7 rounded-lg border border-slate-300 px-2 text-[11px] font-bold hover:bg-slate-50" onClick={() => setOpenDays(openDays === r.contractor_user_id ? null : r.contractor_user_id)} data-testid={`cw-days-btn-${r.contractor_user_id}`}>الأيام</button>
                    </td>
                  </tr>
                  {editing === r.contractor_user_id && <RatesEditor row={r} month={month} pending={setRates.isPending} onCancel={() => setEditing(null)} onSave={(v) => setRates.mutate({ contractorId: r.contractor_user_id, month, ...v }, { onSuccess: () => setEditing(null) })} />}
                  {openDays === r.contractor_user_id && <DaysDetail contractorId={r.contractor_user_id} month={month} />}
                </Fragment>
              ))}
            </tbody>
            <tfoot><tr className="border-t-2 border-slate-300 bg-slate-50 font-black"><td className="p-2" colSpan={2}>الإجمالي · {t.contractors} متعهد</td><td className="p-2 text-center tabular-nums">{t.paidDays}</td><td className="p-2 text-center tabular-nums">{t.workerDays}</td><td className="p-2" colSpan={2}></td><td className="p-2 text-center tabular-nums">{fmtMoney(t.workersPay)}</td><td className="p-2 text-center tabular-nums">{fmtMoney(t.contractorPay)}</td><td className="p-2 text-center tabular-nums text-sky-800" data-testid="cw-total">{fmtMoney(t.total)}</td><td colSpan={2}></td></tr></tfoot>
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
      <td className="p-2" colSpan={11}>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[11px] font-bold text-slate-600">أجر المتعهد اليومي (د.ع)<input type="number" min={0} step={250} className={clsx(field, 'mt-1 w-40')} dir="ltr" value={cw} onChange={(e) => setCw(e.target.value)} data-testid="cw-contractor-wage" /></label>
          <label className="text-[11px] font-bold text-slate-600">أجر العامل اليومي (د.ع)<input type="number" min={0} step={250} className={clsx(field, 'mt-1 w-40')} dir="ltr" value={ww} onChange={(e) => setWw(e.target.value)} data-testid="cw-worker-wage" /></label>
          <label className="flex-1 text-[11px] font-bold text-slate-600">ملاحظة (اختيارية)<input className={clsx(field, 'mt-1')} value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} data-testid="cw-note" placeholder="مثال: عقد المقاولة رقم …" /></label>
          <div className="text-[11px] text-slate-600">المستحق لشهر {month.slice(0, 7)}: <b className="tabular-nums" data-testid="cw-preview">{valid && row.approved ? fmtMoney(preview) : '—'}</b>{valid && row.approved && <span> ({row.worker_days} عامل/يوم × {fmtMoney(w)} + {row.paid_days} يوم × {fmtMoney(c)})</span>}{!row.approved && <span className="text-amber-700"> · يُحتسب بعد اعتماد غرفة العمليات</span>}</div>
          <Button size="sm" disabled={!valid || pending} onClick={() => onSave({ contractorDaily: c, workerDaily: w, note: note.trim() || null })} data-testid="cw-save">حفظ</Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>إلغاء</Button>
        </div>
      </td>
    </tr>
  )
}

function DaysDetail({ contractorId, month }: { contractorId: string; month: string }) {
  const { data: days = [], isLoading } = useContractorWageDays(contractorId, month)
  return (
    <tr className="bg-slate-50/70" data-testid={`cw-days-${contractorId}-detail`}>
      <td className="p-2" colSpan={11}>
        {isLoading ? <LoadingSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]" dir="rtl">
              <thead className="text-slate-500"><tr><th className="p-1 text-start">اليوم</th><th className="p-1">العدد المعتمد</th><th className="p-1">العمال (العدد − 1)</th><th className="p-1">أجر المتعهد</th><th className="p-1">أجور العمال</th><th className="p-1">أجر اليوم</th><th className="p-1 text-start">تصحيح غرفة العمليات</th></tr></thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.log_date} className={clsx('border-t border-slate-100', d.day_pay == null && 'text-slate-400')}>
                    <td className="p-1 tabular-nums" dir="ltr">{d.log_date}</td>
                    <td className="p-1 text-center tabular-nums">{d.headcount ?? '—'}</td>
                    <td className="p-1 text-center tabular-nums">{d.workers ?? '—'}</td>
                    <td className="p-1 text-center tabular-nums">{d.contractor_pay == null ? '—' : fmtMoney(d.contractor_pay)}</td>
                    <td className="p-1 text-center tabular-nums">{d.workers_pay == null ? '—' : fmtMoney(d.workers_pay)}</td>
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
