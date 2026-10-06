/**
 * تقرير الكشوفات (00188 — الجولة B): مدى تاريخ + فلتر نوع/قاطع
 *  · مؤشرات: العدد/المعتمد/المُعاد/الملغى/المبالغ/متوسط زمن القرار
 *  · توزيعات: حسب النوع (أشرطة) · القواطع · العقوبات · الهدف · الشفت · المُعدّون (مع المُعاد لهم)
 *  · المكرِّرون: أكثر الموظفين والآليات مخالفةً
 *  · سلسلة الاستقطاع: بانتظار إعادة التصدير / مُصدَّر / معتمد من المالية / غير مرتبط / مفقود
 *  · Excel متعدد الأوراق + طباعة A4
 *  يُستخدم في غرفة العمليات (كل حسابات غرفة العمليات) وفي بوابتي المعاون والمدير المفوض
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useDisclosureReport, useDisclosureTypes } from '../unit'
import { DISCLOSURE_STATUS_LABEL, PENALTY_LABEL, SHIFT_LABEL, type DisclosureReport } from '@sdk/disclosures-unit.sdk'
import { buildExcelReport, type ReportColumn } from '@lib/export/excel-report'
import { COMPANY } from '../lib/export-v2'

const num = (n: number | null | undefined) => (n == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n))
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const monthRange = (d = new Date()) => ({ from: iso(new Date(d.getFullYear(), d.getMonth(), 1)), to: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) })
const DED_LABEL: Record<string, string> = { awaiting_export: 'بانتظار إعادة التصدير', exported: 'في كشف مُصدَّر', approved: 'معتمد من المالية', missing: 'مفقود (يلزم تدقيق)' }
const TARGET_LABEL: Record<string, string> = { vehicle: 'آلية', employee: 'موظف' }

export async function downloadDisclosureReportExcel(r: DisclosureReport, typeLabel: (k: string) => string) {
  const meta = `المدى: ${r.from} → ${r.to} · ${r.totals.count} كشف · معتمد ${r.totals.approved} · مبالغ معتمدة ${num(r.totals.amount_approved)} د.ع · أُنشئ ${new Date().toLocaleString('ar-IQ-u-nu-latn')}`
  const cnt = (h: string, k: string): ReportColumn => ({ header: h, key: k, width: 10, align: 'center' })
  const amt = (h: string, k: string): ReportColumn => ({ header: h, key: k, width: 16, align: 'center', numFmt: '#,##0' })
  await buildExcelReport({
    sheetName: 'الكشوفات', company: COMPANY, companySub: 'وحدة الكشوفات — تقرير', title: 'تقرير الكشوفات', meta, fileName: `تقرير-الكشوفات-${r.from}-${r.to}.xlsx`, orientation: 'landscape',
    columns: [{ header: 'التاريخ', key: 'log_date', width: 11, align: 'center' }, { header: 'الرقم', key: 'ref_no', width: 10, align: 'center' }, { header: 'الهدف', key: 'target', width: 8, align: 'center' }, { header: 'DB / الرقم الوظيفي', key: 'ident', width: 14, align: 'center' },
      { header: 'الاسم', key: 'name', width: 22 }, { header: 'القاطع / القسم', key: 'sector', width: 16 }, { header: 'النوع', key: 'type', width: 16 }, { header: 'العقوبة', key: 'penalty', width: 10, align: 'center' },
      { header: 'الحالة', key: 'status', width: 10, align: 'center' }, amt('المبلغ', 'amount'), { header: 'حالة الاستقطاع', key: 'ded', width: 18, align: 'center' }, { header: 'المُعدّ', key: 'preparer', width: 16 }],
    rows: r.rows.map((x) => ({ log_date: x.log_date, ref_no: x.ref_no ?? '', target: TARGET_LABEL[x.target_kind] ?? x.target_kind, ident: x.target_kind === 'employee' ? x.employee_number ?? '' : x.db_number, name: x.driver_name, sector: x.sector ?? x.department_name ?? '',
      type: typeLabel(x.violation_type), penalty: x.penalty_type ? PENALTY_LABEL[x.penalty_type as keyof typeof PENALTY_LABEL] ?? x.penalty_type : '', status: DISCLOSURE_STATUS_LABEL[x.status], amount: x.amount ?? 0, ded: x.deduction_state ? DED_LABEL[x.deduction_state] ?? x.deduction_state : '', preparer: x.prepared_by_name ?? '' })),
    totalRow: { log_date: 'الإجمالي', ref_no: `${r.rows.length} كشف`, amount: r.rows.reduce((s, x) => s + (x.amount ?? 0), 0) },
    extraSheets: [
      { sheetName: 'حسب النوع', title: 'توزيع الكشوفات حسب النوع', meta, columns: [{ header: 'النوع', key: 'label', width: 26 }, cnt('العدد', 'count'), cnt('معتمد', 'approved'), amt('المبالغ المعتمدة', 'amount')], rows: r.by_type, totalRow: { label: 'الإجمالي', count: r.totals.count, approved: r.totals.approved, amount: r.totals.amount_approved } },
      { sheetName: 'حسب القاطع', title: 'توزيع الكشوفات حسب القاطع', meta, columns: [{ header: 'القاطع', key: 'sector', width: 26 }, cnt('العدد', 'count'), cnt('معتمد', 'approved'), amt('المبالغ المعتمدة', 'amount')], rows: r.by_sector },
      { sheetName: 'المكرِّرون — موظفون', title: 'أكثر الموظفين مخالفةً', meta, columns: [{ header: 'الرقم الوظيفي', key: 'employee_number', width: 14, align: 'center' }, { header: 'الاسم', key: 'name', width: 26 }, { header: 'القسم', key: 'department', width: 20 }, cnt('العدد', 'count'), cnt('معتمد', 'approved'), amt('المبالغ', 'amount')], rows: r.top_employees },
      { sheetName: 'المكرِّرون — آليات', title: 'أكثر الآليات مخالفةً', meta, columns: [{ header: 'DB', key: 'db_number', width: 12, align: 'center' }, { header: 'السائق', key: 'driver_name', width: 24 }, { header: 'المتعهد', key: 'contractor_name', width: 20 }, cnt('العدد', 'count'), cnt('معتمد', 'approved'), amt('المبالغ', 'amount')], rows: r.top_vehicles },
      { sheetName: 'المُعدّون', title: 'الكشوفات حسب المُعدّ', meta, columns: [{ header: 'المُعدّ', key: 'name', width: 26 }, cnt('العدد', 'count'), cnt('أُعيد له', 'returned')], rows: r.by_preparer },
      { sheetName: 'سلسلة الاستقطاع', title: 'حالة استقطاعات الكشوفات المعتمدة', meta, columns: [{ header: 'البند', key: 'k', width: 34 }, cnt('العدد', 'v')],
        rows: [['كشوف معتمدة بمبلغ', r.deductions.with_amount], ['مُسجَّلة في الحضورية', r.deductions.posted], ['بانتظار إعادة التصدير', r.deductions.awaiting_export], ['في كشف مُصدَّر', r.deductions.exported], ['معتمدة من المالية', r.deductions.approved_by_finance], ['غير مرتبطة باستقطاع', r.deductions.not_linked], ['مفقودة', r.deductions.missing]].map(([k, v]) => ({ k, v })),
        totalRow: { k: 'مجموع المبالغ المُسجَّلة', v: num(r.deductions.amount_posted) } },
    ],
    charts: [
      { title: 'الكشوفات حسب النوع', kind: 'bar', valueLabel: 'عدد', data: r.by_type.slice(0, 12).map((x, i) => ({ label: x.label, value: x.count, color: ['#075985', '#0ea5e9', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316', '#22c55e', '#64748b', '#e11d48', '#0891b2', '#a16207'][i % 12] })) },
      { title: 'الاتجاه الشهري', kind: 'bar', valueLabel: 'كشف', data: r.by_month.map((x) => ({ label: x.month, value: x.count, color: '#075985' })) },
    ],
  })
}

export function DisclosureReportTab({ testId = 'disc-report' }: { testId?: string }) {
  const [range, setRange] = useState(monthRange())
  const [type, setType] = useState('')
  const [sector, setSector] = useState('')
  const types = useDisclosureTypes()
  const typeLabel = (k: string) => types.data?.find((t) => t.key === k)?.label ?? k
  const q = useDisclosureReport({ from: range.from, to: range.to, type: type || null, sector: sector || null })
  const r = q.data
  const sectors = useMemo(() => (r?.by_sector ?? []).map((s) => s.sector).filter((s) => s !== 'غير محدد'), [r])
  const [exporting, setExporting] = useState(false)
  const quick = (k: 'month' | 'prev' | 'quarter' | 'year') => {
    const d = new Date()
    if (k === 'month') setRange(monthRange())
    if (k === 'prev') setRange(monthRange(new Date(d.getFullYear(), d.getMonth() - 1, 1)))
    if (k === 'quarter') setRange({ from: iso(new Date(d.getFullYear(), d.getMonth() - 2, 1)), to: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) })
    if (k === 'year') setRange({ from: `${d.getFullYear()}-01-01`, to: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) })
  }
  const inp = 'h-9 rounded-xl border border-slate-300 bg-white px-2 text-xs'
  return (
    <div className="space-y-3" data-testid={testId}>
      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3 print:hidden">
        <label className="text-[11px] font-bold text-slate-600">من<input type="date" className={clsx(inp, 'mt-1 block')} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} data-testid="rep-from" /></label>
        <label className="text-[11px] font-bold text-slate-600">إلى<input type="date" className={clsx(inp, 'mt-1 block')} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} data-testid="rep-to" /></label>
        <label className="text-[11px] font-bold text-slate-600">النوع<select className={clsx(inp, 'mt-1 block')} value={type} onChange={(e) => setType(e.target.value)} data-testid="rep-type"><option value="">الكل</option>{(types.data ?? []).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></label>
        <label className="text-[11px] font-bold text-slate-600">القاطع<select className={clsx(inp, 'mt-1 block')} value={sector} onChange={(e) => setSector(e.target.value)} data-testid="rep-sector"><option value="">الكل</option>{sectors.map((s) => <option key={s} value={s}>{s}</option>)}{sector && !sectors.includes(sector) && <option value={sector}>{sector}</option>}</select></label>
        <div className="flex flex-wrap gap-1">
          {([['month', 'هذا الشهر'], ['prev', 'الشهر الماضي'], ['quarter', '3 أشهر'], ['year', 'هذه السنة']] as const).map(([k, l]) => <button key={k} type="button" className="h-9 rounded-xl border border-slate-200 px-2 text-[11px] font-bold hover:bg-slate-50" onClick={() => quick(k)} data-testid={`rep-quick-${k}`}>{l}</button>)}
        </div>
        <div className="ms-auto flex gap-1">
          <button type="button" className="h-9 rounded-xl bg-slate-900 px-3 text-xs font-black text-white disabled:opacity-50" disabled={!r || exporting} onClick={async () => { if (!r) return; setExporting(true); try { await downloadDisclosureReportExcel(r, typeLabel) } finally { setExporting(false) } }} data-testid="rep-excel">Excel</button>
          <button type="button" className="h-9 rounded-xl border border-slate-300 px-3 text-xs font-black" disabled={!r} onClick={() => window.print()} data-testid="rep-print">طباعة</button>
        </div>
      </div>
      {q.isError && <div className="rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700" data-testid="rep-error">{(q.error as Error).message.includes('RANGE') ? 'مدى التاريخ غير صالح أو أوسع من سنة' : 'تعذّر تحميل التقرير'}</div>}
      {!r ? (q.isLoading ? <p className="text-xs text-slate-500">جارٍ إعداد التقرير…</p> : null) : (
        <div className="space-y-3" data-testid="rep-body">
          <p className="hidden text-xs font-bold text-slate-700 print:block">{COMPANY} — تقرير الكشوفات {r.from} → {r.to}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {([['إجمالي الكشوفات', r.totals.count, 'bg-slate-900 text-white', 'rep-k-count'], ['معتمدة', r.totals.approved, 'bg-emerald-50 text-emerald-800', 'rep-k-approved'], ['قيد الموافقة', r.totals.pending, 'bg-amber-50 text-amber-800', 'rep-k-pending'],
              ['مُعادة', r.totals.returned, 'bg-rose-50 text-rose-700', 'rep-k-returned'], ['ملغاة', r.totals.cancelled, 'bg-slate-100 text-slate-700', 'rep-k-cancelled'], ['مبالغ معتمدة (د.ع)', num(r.totals.amount_approved), 'bg-sky-50 text-sky-800', 'rep-k-amount'],
              ['متوسط زمن القرار (ساعة)', num(r.totals.avg_decision_hours), 'bg-violet-50 text-violet-800', 'rep-k-hours']] as const).map(([k, v, tone, tid]) => (
              <div key={k} className={clsx('rounded-2xl p-3 text-right shadow-sm', tone)} data-testid={tid}><div className="text-[10px] font-bold opacity-80">{k}</div><div className="text-xl font-black tabular-nums">{v}</div></div>
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Card title="حسب نوع الكشف" testId="rep-by-type">
              {r.by_type.length === 0 ? <Empty /> : r.by_type.map((t) => <Bar key={t.key} label={t.label} value={t.count} max={r.by_type[0]!.count} extra={`معتمد ${t.approved} · ${num(t.amount)} د.ع`} />)}
            </Card>
            <Card title="حسب القاطع" testId="rep-by-sector">
              {r.by_sector.length === 0 ? <Empty /> : r.by_sector.map((s) => <Bar key={s.sector} label={s.sector} value={s.count} max={r.by_sector[0]!.count} extra={`معتمد ${s.approved} · ${num(s.amount)} د.ع`} />)}
            </Card>
            <Card title="أكثر الموظفين مخالفةً" testId="rep-top-employees">
              <Table head={['الرقم', 'الاسم', 'القسم', 'العدد', 'المبالغ']} rows={r.top_employees.map((e) => [e.employee_number ?? '—', e.name, e.department ?? '—', e.count, num(e.amount)])} />
            </Card>
            <Card title="أكثر الآليات مخالفةً" testId="rep-top-vehicles">
              <Table head={['DB', 'السائق', 'المتعهد', 'العدد', 'المبالغ']} rows={r.top_vehicles.map((v) => [v.db_number, v.driver_name ?? '—', v.contractor_name ?? '—', v.count, num(v.amount)])} />
            </Card>
            <Card title="سلسلة الاستقطاع (الكشوفات المعتمدة بمبلغ)" testId="rep-deductions">
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                {([['بمبلغ', r.deductions.with_amount, ''], ['مُسجَّل في الحضورية', r.deductions.posted, 'text-emerald-700'], ['بانتظار إعادة التصدير', r.deductions.awaiting_export, 'text-amber-700'], ['في كشف مُصدَّر', r.deductions.exported, 'text-sky-700'], ['معتمد من المالية', r.deductions.approved_by_finance, 'text-emerald-800'], ['غير مرتبط / مفقود', r.deductions.not_linked + r.deductions.missing, (r.deductions.not_linked + r.deductions.missing) > 0 ? 'text-rose-700' : '']] as const).map(([k, v, c]) => (
                  <div key={k} className="rounded-xl border border-slate-100 p-2"><div className="text-[10px] text-slate-500">{k}</div><div className={clsx('text-lg font-black tabular-nums', c)}>{v}</div></div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">مجموع المبالغ المُسجَّلة: <b className="tabular-nums">{num(r.deductions.amount_posted)}</b> د.ع{(r.deductions.not_linked + r.deductions.missing) > 0 && <span className="ms-2 font-bold text-rose-700">— توجد كشوفات معتمدة بمبلغ بلا استقطاع مرتبط: راجعها</span>}</p>
            </Card>
            <Card title="المُعدّون · العقوبات · الهدف · الشفت" testId="rep-misc">
              <Table head={['المُعدّ', 'العدد', 'أُعيد له']} rows={r.by_preparer.map((p) => [p.name, p.count, p.returned])} />
              <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                {r.by_penalty.map((p) => <span key={p.key} className="rounded-full bg-slate-100 px-2 py-0.5">{p.key === 'none' ? 'بلا عقوبة' : PENALTY_LABEL[p.key as keyof typeof PENALTY_LABEL] ?? p.key}: <b>{p.count}</b></span>)}
                {Object.entries(r.by_target).map(([k, v]) => <span key={k} className="rounded-full bg-sky-50 px-2 py-0.5">{TARGET_LABEL[k] ?? k}: <b>{v}</b></span>)}
                {Object.entries(r.by_shift).map(([k, v]) => <span key={k} className="rounded-full bg-amber-50 px-2 py-0.5">{SHIFT_LABEL[k] ?? k}: <b>{v}</b></span>)}
              </div>
            </Card>
          </div>
          {r.by_month.length > 1 && <Card title="الاتجاه الشهري" testId="rep-trend">{r.by_month.map((m) => <Bar key={m.month} label={m.month} value={m.count} max={Math.max(...r.by_month.map((x) => x.count))} extra={`معتمد ${m.approved} · ${num(m.amount)} د.ع`} />)}</Card>}
        </div>
      )}
    </div>
  )
}

function Card({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-3 print:break-inside-avoid" data-testid={testId}><h3 className="mb-2 text-xs font-black text-slate-700">{title}</h3>{children}</section>
}
function Empty() { return <p className="text-[11px] text-slate-400">لا بيانات في هذا المدى</p> }
function Bar({ label, value, max, extra }: { label: string; value: number; max: number; extra?: string }) {
  const w = max > 0 ? Math.max(3, Math.round((value / max) * 100)) : 0
  return (
    <div className="mb-1.5 text-[11px]">
      <div className="flex items-center justify-between"><span className="font-bold text-slate-700">{label}</span><span className="tabular-nums text-slate-600"><b>{value}</b>{extra ? <span className="ms-1 text-slate-400">· {extra}</span> : null}</span></div>
      <div className="mt-0.5 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-sky-600" style={{ width: `${w}%` }} /></div>
    </div>
  )
}
function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  if (rows.length === 0) return <Empty />
  return (
    <table className="w-full text-[11px]"><thead><tr className="text-slate-500">{head.map((h) => <th key={h} className="p-1 text-start font-bold">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-slate-100">{r.map((c, j) => <td key={j} className={clsx('p-1', j >= 3 && 'tabular-nums')}>{c}</td>)}</tr>)}</tbody></table>
  )
}
