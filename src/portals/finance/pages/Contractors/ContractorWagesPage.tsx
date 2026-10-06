/**
 * أجور عمال المتعهدين — الشؤون المالية (00188 · المتعهدون الجولة 2)
 *  · كشف شهري: كل عامل مع حضوره (من تسجيل المتعهد بعد بوابة الموقع/الصور) وأجره والمستحق
 *  · الأجر يُحدَّد من المالية فقط: شهري (مبلغ ثابت) أو يومي (× أيام الحضور) مع ملاحظة — كل تعديل في سجل التدقيق (قبل/بعد)
 *  · نسخ أجور الشهر السابق · تجميع حسب المتعهد مع مجاميع · Excel مؤسسي
 *  · الأرقام إنكليزية (0-9) دائماً
 */
import { Fragment, useMemo, useState } from 'react'
import { useContractorWagesSheet, useCopyPreviousWages, useSetContractorWage } from '@features/contractors/hooks'
import type { ContractorWageMode, ContractorWageRow } from '@sdk/contractors.sdk'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { MonthPicker, StatCard } from '@portals/hr/components/hr-ui'
import { field, fmtMoney, monthStart } from '@portals/hr/components/hr-format'
import { buildExcelReport } from '@lib/export/excel-report'
import clsx from 'clsx'

const MODE_LABEL: Record<ContractorWageMode, string> = { monthly: 'شهري', daily: 'يومي' }

/** تجميع الصفوف حسب المتعهد (ثم العامل) مع مجاميع */
export function groupWagesByContractor(rows: ContractorWageRow[]) {
  const map = new Map<string, ContractorWageRow[]>()
  for (const r of rows) map.set(r.contractor_user_id, [...(map.get(r.contractor_user_id) ?? []), r])
  return [...map.entries()].map(([id, g]) => ({
    id, name: g[0]!.contractor_name, area: `${g[0]!.parent_sector} / ${g[0]!.area_name}`, rows: g,
    workers: g.length, present: g.reduce((s, r) => s + r.present_days, 0), payable: g.reduce((s, r) => s + (r.payable ?? 0), 0), missing: g.filter((r) => r.payable == null).length,
  }))
}

export async function downloadContractorWagesExcel(month: string, rows: ContractorWageRow[]) {
  const groups = groupWagesByContractor(rows)
  await buildExcelReport({
    sheetName: 'أجور المتعهدين', company: 'شركة جزيرة الأكارم', companySub: 'الشؤون المالية — أجور عمال المتعهدين', title: `أجور عمال المتعهدين — ${month.slice(0, 7)}`,
    meta: `أُنشئ ${new Date().toLocaleString('ar-IQ-u-nu-latn')} · العملة: دينار عراقي · الأجر الشهري ثابت، اليومي = الأجر × أيام الحضور`,
    orientation: 'landscape', fileName: `أجور-المتعهدين-${month.slice(0, 7)}.xlsx`,
    columns: [
      { header: 'ت', key: 'i', width: 5, align: 'center' }, { header: 'المتعهد', key: 'contractor', width: 22 }, { header: 'القاطع / المنطقة', key: 'area', width: 20 },
      { header: 'العامل', key: 'worker', width: 24 }, { header: 'الهاتف', key: 'phone', width: 13, align: 'center' },
      { header: 'حاضر', key: 'present', width: 8, align: 'center' }, { header: 'غائب', key: 'absent', width: 8, align: 'center' },
      { header: 'نوع الأجر', key: 'mode', width: 10, align: 'center' }, { header: 'الأجر', key: 'wage', width: 14, align: 'center', numFmt: '#,##0' },
      { header: 'المستحق', key: 'payable', width: 14, align: 'center', numFmt: '#,##0' }, { header: 'ملاحظة', key: 'note', width: 26, wrap: true }, { header: 'حدده', key: 'by', width: 16 },
    ],
    rows: rows.map((r, i) => ({ i: i + 1, contractor: r.contractor_name, area: `${r.parent_sector} / ${r.area_name}`, worker: r.full_name + (r.is_active ? '' : ' (مُزال)'), phone: r.phone ?? '', present: r.present_days, absent: r.absent_days,
      mode: r.payable == null ? 'غير محدد' : MODE_LABEL[r.wage_mode], wage: r.wage_mode === 'daily' ? r.daily_wage : r.monthly_wage, payable: r.payable ?? 0, note: r.note ?? '', by: r.set_by_name ?? '' })),
    totalRow: { i: 'الإجمالي', contractor: `${groups.length} متعهد`, worker: `${rows.length} عامل`, present: rows.reduce((s, r) => s + r.present_days, 0), payable: rows.reduce((s, r) => s + (r.payable ?? 0), 0) },
    extraSheets: [{
      sheetName: 'حسب المتعهد', title: 'مجاميع حسب المتعهد', columns: [
        { header: 'المتعهد', key: 'name', width: 24 }, { header: 'القاطع / المنطقة', key: 'area', width: 22 }, { header: 'العمال', key: 'workers', width: 8, align: 'center' },
        { header: 'أيام الحضور', key: 'present', width: 11, align: 'center' }, { header: 'بلا أجر محدد', key: 'missing', width: 12, align: 'center' }, { header: 'المستحق', key: 'payable', width: 16, align: 'center', numFmt: '#,##0' }],
      rows: groups.map((g) => ({ name: g.name, area: g.area, workers: g.workers, present: g.present, missing: g.missing, payable: g.payable })),
      totalRow: { name: 'الإجمالي', workers: rows.length, payable: groups.reduce((s, g) => s + g.payable, 0) },
    }],
  })
}

export default function ContractorWagesPage() {
  const [month, setMonth] = useState(monthStart())
  const { data: rows = [], isLoading } = useContractorWagesSheet(month)
  const setWage = useSetContractorWage()
  const copyPrev = useCopyPreviousWages()
  const [editing, setEditing] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const groups = useMemo(() => groupWagesByContractor(rows), [rows])
  const totals = useMemo(() => ({ workers: rows.length, present: rows.reduce((s, r) => s + r.present_days, 0), payable: rows.reduce((s, r) => s + (r.payable ?? 0), 0), missing: rows.filter((r) => r.payable == null).length }), [rows])

  return (
    <div className="space-y-4" data-testid="contractor-wages-page">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-black text-slate-800">أجور عمال المتعهدين</h1>
          <p className="text-xs text-slate-500">الحضور من تسجيل المتعهد بعد إثبات تواجده في الموقع · الأجر يُحدَّد هنا فقط (شهري ثابت أو يومي × أيام الحضور) ويُسجَّل كل تعديل في سجل التدقيق</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthPicker value={month} onChange={setMonth} testId="cw-month" />
          <Button variant="secondary" size="sm" disabled={copyPrev.isPending} onClick={() => { if (window.confirm('نسخ أجور الشهر السابق لكل عامل لا أجر له في هذا الشهر؟')) copyPrev.mutate({ month }) }} data-testid="cw-copy-prev">نسخ أجور الشهر السابق</Button>
          <Button variant="secondary" size="sm" disabled={exporting || rows.length === 0} onClick={async () => { setExporting(true); try { await downloadContractorWagesExcel(month, rows) } finally { setExporting(false) } }} data-testid="cw-excel">Excel</Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard title="العمال" value={totals.workers} testId="cw-stat-workers" />
        <StatCard title="أيام الحضور" value={totals.present} tone="emerald" />
        <StatCard title="بلا أجر محدد" value={totals.missing} tone={totals.missing ? 'amber' : 'slate'} testId="cw-stat-missing" hint={totals.missing ? 'حدّد الأجر حتى يُحتسب المستحق' : undefined} />
        <StatCard title="إجمالي المستحق" value={fmtMoney(totals.payable)} tone="sky" testId="cw-stat-total" />
      </div>

      {isLoading ? <LoadingSpinner /> : rows.length === 0 ? <EmptyState title="لا عمال متعهدين في هذا الشهر" hint="يظهر هنا كل عامل نشط أو له حضور مسجَّل خلال الشهر" /> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[980px] text-xs" dir="rtl">
            <thead className="bg-slate-50 text-slate-600">
              <tr><th className="p-2 text-start">العامل</th><th className="p-2">الهاتف</th><th className="p-2">حاضر</th><th className="p-2">غائب</th><th className="p-2">نوع الأجر</th><th className="p-2">الأجر</th><th className="p-2">المستحق</th><th className="p-2 text-start">ملاحظة / حدده</th><th className="p-2"></th></tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.id}>
                  <tr className="bg-slate-100/80" data-testid={`cw-group-${g.id}`}>
                    <td className="p-2 font-black text-slate-800" colSpan={2}>{g.name} <span className="font-normal text-slate-500">· {g.area} · {g.workers} عامل</span></td>
                    <td className="p-2 text-center font-bold tabular-nums">{g.present}</td><td className="p-2"></td><td className="p-2"></td><td className="p-2"></td>
                    <td className="p-2 text-center font-black tabular-nums text-sky-800">{fmtMoney(g.payable)}</td>
                    <td className="p-2 text-[11px] text-amber-700" colSpan={2}>{g.missing > 0 ? `${g.missing} بلا أجر محدد` : ''}</td>
                  </tr>
                  {g.rows.map((r) => (
                    <Fragment key={r.worker_id}>
                      <tr className={clsx('border-t border-slate-100', !r.is_active && 'text-slate-400')} data-testid={`cw-row-${r.worker_id}`}>
                        <td className="p-2 font-bold">{r.full_name}{!r.is_active && <span className="ms-1 text-[10px]">(مُزال)</span>}</td>
                        <td className="p-2 text-center tabular-nums" dir="ltr">{r.phone ?? '—'}</td>
                        <td className="p-2 text-center font-bold tabular-nums text-emerald-700">{r.present_days}</td>
                        <td className="p-2 text-center tabular-nums text-red-700">{r.absent_days}</td>
                        <td className="p-2 text-center">{r.payable == null ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">غير محدد</span> : MODE_LABEL[r.wage_mode]}</td>
                        <td className="p-2 text-center tabular-nums">{r.payable == null ? '—' : fmtMoney(r.wage_mode === 'daily' ? r.daily_wage : r.monthly_wage)}</td>
                        <td className="p-2 text-center font-black tabular-nums" data-testid={`cw-payable-${r.worker_id}`}>{r.payable == null ? '—' : fmtMoney(r.payable)}{r.payable != null && r.wage_mode === 'daily' && <span className="block text-[10px] font-normal text-slate-500">{fmtMoney(r.daily_wage)} × {r.present_days} يوم</span>}</td>
                        <td className="p-2 text-[11px] text-slate-600">{r.note && <span className="block">{r.note}</span>}{r.set_by_name && <span className="text-slate-400">{r.set_by_name} · {r.set_at ? new Date(r.set_at).toLocaleDateString('ar-IQ-u-nu-latn') : ''}</span>}</td>
                        <td className="p-2 text-center"><button type="button" className="h-7 rounded-lg border border-slate-300 px-2 text-[11px] font-bold hover:bg-slate-50" onClick={() => setEditing(editing === r.worker_id ? null : r.worker_id)} data-testid={`cw-edit-${r.worker_id}`}>{r.payable == null ? 'تحديد الأجر' : 'تعديل'}</button></td>
                      </tr>
                      {editing === r.worker_id && <WageEditor row={r} month={month} pending={setWage.isPending} onCancel={() => setEditing(null)} onSave={(v) => setWage.mutate({ workerId: r.worker_id, month, ...v }, { onSuccess: () => setEditing(null) })} />}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tbody>
            <tfoot><tr className="border-t-2 border-slate-300 bg-slate-50 font-black"><td className="p-2" colSpan={2}>الإجمالي · {totals.workers} عامل</td><td className="p-2 text-center tabular-nums">{totals.present}</td><td className="p-2" colSpan={3}></td><td className="p-2 text-center tabular-nums text-sky-800" data-testid="cw-total">{fmtMoney(totals.payable)}</td><td colSpan={2}></td></tr></tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

function WageEditor({ row, month, pending, onCancel, onSave }: { row: ContractorWageRow; month: string; pending: boolean; onCancel: () => void; onSave: (v: { mode: ContractorWageMode; amount: number; note: string | null }) => void }) {
  const [mode, setMode] = useState<ContractorWageMode>(row.payable == null ? 'daily' : row.wage_mode)
  const [amount, setAmount] = useState(row.payable == null ? '' : String(mode === 'daily' ? row.daily_wage : row.monthly_wage))
  const [note, setNote] = useState(row.note ?? '')
  const n = Number(amount)
  const valid = amount.trim() !== '' && Number.isFinite(n) && n >= 0
  const preview = mode === 'daily' ? n * row.present_days : n
  return (
    <tr className="bg-sky-50/60" data-testid={`cw-editor-${row.worker_id}`}>
      <td className="p-2" colSpan={9}>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[11px] font-bold text-slate-600">نوع الأجر<select className={clsx(field, 'mt-1 w-32')} value={mode} onChange={(e) => setMode(e.target.value as ContractorWageMode)} data-testid="cw-mode"><option value="daily">يومي (× أيام الحضور)</option><option value="monthly">شهري (ثابت)</option></select></label>
          <label className="text-[11px] font-bold text-slate-600">{mode === 'daily' ? 'أجر اليوم (د.ع)' : 'الأجر الشهري (د.ع)'}<input type="number" min={0} step={250} className={clsx(field, 'mt-1 w-40')} dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="cw-amount" /></label>
          <label className="flex-1 text-[11px] font-bold text-slate-600">ملاحظة (اختيارية)<input className={clsx(field, 'mt-1')} value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} data-testid="cw-note" placeholder="مثال: اتفاق المقاولة رقم …" /></label>
          <div className="text-[11px] text-slate-600">المستحق لشهر {month.slice(0, 7)}: <b className="tabular-nums" data-testid="cw-preview">{valid ? fmtMoney(preview) : '—'}</b>{mode === 'daily' && valid && <span> ({fmtMoney(n)} × {row.present_days} يوم حضور)</span>}</div>
          <Button size="sm" disabled={!valid || pending} onClick={() => onSave({ mode, amount: n, note: note.trim() || null })} data-testid="cw-save">حفظ</Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>إلغاء</Button>
        </div>
      </td>
    </tr>
  )
}
