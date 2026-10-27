/**
 * «المُعدّون» (00305 / 00360) — معاون المدير المفوض والمدير المفوض
 *  · لكل موظف سجّل كشوفاً في الشهر (غرفة العمليات / الكراج / مسؤول قاطع / المحطة): المسجَّل، مسودة، قيد القرار، معتمد، مُعاد، ملغى، مبالغ المعتمد
 *  · مقارنة بالشهر السابق (الفرق) ونسبة الاعتماد مما بُتّ فيه
 *  · التجميع بحساب المستخدم لا بالاسم (تغيّر الاسم لا يقسم الموظف) · Excel
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useDisclosurePreparers } from '../unit'
import type { DisclosurePreparers } from '@sdk/disclosures-unit.sdk'
import { buildExcelReport, type ReportColumn } from '@lib/export/excel-report'
import { COMPANY } from '../lib/export-v2'

const num = (n: number | null | undefined, d = 0) => (n == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: d }).format(n))
const pad = (n: number) => String(n).padStart(2, '0')
const curMonth = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}` }

export async function downloadDisclosurePreparersExcel(r: DisclosurePreparers) {
  const cnt = (h: string, k: string): ReportColumn => ({ header: h, key: k, width: 10, align: 'center' })
  await buildExcelReport({
    sheetName: 'المُعدّون', company: COMPANY, companySub: 'وحدة الكشوفات — المُعدّون', title: `الموظفون الذين سجّلوا كشوفاً — ${r.month}`,
    meta: `الشهر ${r.month} · ${r.totals.preparers} موظفاً · ${r.totals.registered} كشفاً مسجَّلاً · معتمد ${r.totals.approved} · مُعاد ${r.totals.returned} · ملغى ${r.totals.cancelled} · الشهر السابق ${r.totals.prev_registered}`,
    fileName: `المعدون-${r.month}.xlsx`,
    columns: [{ header: 'الموظف', key: 'name', width: 28 }, { header: 'الجهة', key: 'unit', width: 16 }, cnt('مسجَّل', 'registered'), cnt('مسودة', 'draft'), cnt('قيد القرار', 'pending'), cnt('معتمد', 'approved'),
      cnt('مُعاد', 'returned'), cnt('ملغى', 'cancelled'), { header: 'نسبة الاعتماد ٪', key: 'rate', width: 12, align: 'center' }, { header: 'مبالغ المعتمد', key: 'amount_approved', width: 16, align: 'center', numFmt: '#,##0' },
      cnt(`الشهر السابق (${r.prev_month})`, 'prev_registered'), cnt('الفرق', 'delta')],
    rows: r.rows.map((x) => ({ ...x, rate: x.approval_rate == null ? '—' : num(x.approval_rate, 1) })),
  })
}

export function DisclosurePreparersTab({ testId = 'disc-preparers' }: { testId?: string }) {
  const [month, setMonth] = useState(curMonth())
  const q = useDisclosurePreparers(month)
  const r = q.data
  const [exporting, setExporting] = useState(false)
  const monthOptions = useMemo(() => {
    const set = new Set<string>([curMonth(), month, ...(r?.months ?? []).map((m) => m.month)])
    return [...set].sort().reverse()
  }, [r, month])
  const inp = 'h-9 rounded-xl border border-slate-300 bg-white px-2 text-xs'
  const Kpi = ({ k, v, tone }: { k: string; v: string | number; tone?: string }) => (
    <div className="rounded-xl border border-slate-100 bg-white p-2"><div className="text-[10px] text-slate-500">{k}</div><div className={clsx('text-lg font-black tabular-nums', tone)}>{v}</div></div>
  )
  return (
    <div className="space-y-3" data-testid={testId}>
      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3 print:hidden">
        <label className="text-[11px] font-bold text-slate-600">الشهر
          <select className={clsx(inp, 'mt-1 block')} value={month} onChange={(e) => setMonth(e.target.value)} data-testid="prep-month" dir="ltr">
            {monthOptions.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <div className="ms-auto flex gap-1">
          <button type="button" className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={!r || exporting} data-testid="prep-excel"
            onClick={() => { if (!r) return; setExporting(true); void downloadDisclosurePreparersExcel(r).finally(() => setExporting(false)) }}>Excel</button>
          <button type="button" className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50" onClick={() => window.print()}>طباعة</button>
        </div>
      </div>
      {q.isLoading && <div className="p-6 text-center text-sm text-slate-500">جارٍ جلب المُعدّين…</div>}
      {q.isError && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">تعذّر جلب البيانات</div>}
      {r && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" data-testid="prep-kpis">
            <Kpi k="موظفون سجّلوا كشوفاً" v={num(r.totals.preparers)} />
            <Kpi k="كشوفات مسجَّلة" v={num(r.totals.registered)} />
            <Kpi k="معتمد" v={num(r.totals.approved)} tone="text-emerald-700" />
            <Kpi k="مُعاد" v={num(r.totals.returned)} tone="text-amber-700" />
            <Kpi k="قيد القرار" v={num(r.totals.pending)} tone="text-sky-700" />
            <Kpi k="ملغى" v={num(r.totals.cancelled)} tone="text-rose-700" />
            <Kpi k={`الشهر السابق (${r.prev_month})`} v={num(r.totals.prev_registered)} tone="text-slate-500" />
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            {r.rows.length === 0 ? <div className="p-6 text-center text-sm text-slate-500" data-testid="prep-empty">لا كشوفات مسجَّلة في هذا الشهر</div> : (
              <table className="w-full text-xs" data-testid="prep-table">
                <thead><tr className="bg-slate-50 text-slate-600">
                  {['#', 'الموظف', 'الجهة', 'مسجَّل', 'مسودة', 'قيد القرار', 'معتمد', 'مُعاد', 'ملغى', 'نسبة الاعتماد', 'مبالغ المعتمد', 'الشهر السابق', 'الفرق'].map((h) => <th key={h} className="whitespace-nowrap px-2 py-2 text-start font-bold">{h}</th>)}
                </tr></thead>
                <tbody>
                  {r.rows.map((x, i) => (
                    <tr key={x.key} className="border-t border-slate-100" data-testid={`prep-row-${x.user_id ?? i}`}>
                      <td className="px-2 py-1.5 tabular-nums text-slate-400">{i + 1}</td>
                      <td className="px-2 py-1.5 font-bold text-slate-800">{x.name}</td>
                      <td className="px-2 py-1.5"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{x.unit}</span></td>
                      <td className="px-2 py-1.5 text-center text-sm font-black tabular-nums">{num(x.registered)}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums text-slate-500">{x.draft || ''}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums text-sky-700">{x.pending || ''}</td>
                      <td className="px-2 py-1.5 text-center font-bold tabular-nums text-emerald-700">{x.approved || ''}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums text-amber-700">{x.returned || ''}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums text-rose-700">{x.cancelled || ''}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{x.approval_rate == null ? '—' : `${num(x.approval_rate, 1)}٪`}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{x.amount_approved ? `${num(x.amount_approved)} د.ع` : '—'}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums text-slate-500">{num(x.prev_registered)}</td>
                      <td className={clsx('px-2 py-1.5 text-center font-bold tabular-nums', x.delta > 0 ? 'text-emerald-700' : x.delta < 0 ? 'text-rose-700' : 'text-slate-400')} dir="ltr">{x.delta > 0 ? `+${x.delta}` : x.delta === 0 ? '0' : x.delta}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t-2 border-slate-200 bg-slate-50 font-black">
                  <td className="px-2 py-2" colSpan={3}>الإجمالي</td>
                  <td className="px-2 py-2 text-center tabular-nums">{num(r.totals.registered)}</td>
                  <td className="px-2 py-2 text-center tabular-nums">{num(r.totals.draft)}</td>
                  <td className="px-2 py-2 text-center tabular-nums">{num(r.totals.pending)}</td>
                  <td className="px-2 py-2 text-center tabular-nums text-emerald-700">{num(r.totals.approved)}</td>
                  <td className="px-2 py-2 text-center tabular-nums text-amber-700">{num(r.totals.returned)}</td>
                  <td className="px-2 py-2 text-center tabular-nums text-rose-700">{num(r.totals.cancelled)}</td>
                  <td className="px-2 py-2 text-center tabular-nums">{r.totals.registered - r.totals.draft - r.totals.pending > 0 ? `${num((100 * r.totals.approved) / (r.totals.registered - r.totals.draft - r.totals.pending), 1)}٪` : '—'}</td>
                  <td className="px-2 py-2 text-center tabular-nums">{num(r.totals.amount_approved)} د.ع</td>
                  <td className="px-2 py-2 text-center tabular-nums">{num(r.totals.prev_registered)}</td>
                  <td className="px-2 py-2 text-center tabular-nums" dir="ltr">{r.totals.registered - r.totals.prev_registered > 0 ? '+' : ''}{r.totals.registered - r.totals.prev_registered}</td>
                </tr></tfoot>
              </table>
            )}
          </div>
          <p className="text-[11px] text-slate-500">الشهر هو شهر الكشف (تاريخ المخالفة) كما في بقية التقارير والاستقطاع. «نسبة الاعتماد» = المعتمد ÷ ما بُتّ فيه (معتمد + مُعاد + ملغى)؛ المسودات وما زال قيد القرار لا تدخل فيها.</p>
        </>
      )}
    </div>
  )
}
