/**
 * «قاعدة بيانات الشكاوى» (00180) — السجل الشهري بصيغة الجدول المعتمد
 * ──────────────────────────────────────────────────────────────────
 * صف لكل شكوى بالأعمدة الأربعة عشر: التاريخ، وقت الاستلام، المرسل، المركز البلدي، القاطع، الشفت، المحلة، الشارع،
 * نوع التلكؤ، المصدر، المسؤول، منجز/متأخر، المرفقات، تأكيد الاستلام. فلاتر: شهر (أو فترة)، قاطع، حالة الإنجاز، بحث.
 * تصدير Excel مطابق للجدول (ترويسة خضراء + شعاران). حدّ الشفت ومهلة الإنجاز من إعدادات الشكاوى.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Database, Download, FileSpreadsheet, Settings2 } from 'lucide-react'
import clsx from 'clsx'
import { useComplaintDatabase } from '@features/complaints'
import type { ComplaintDatabaseRow, ComplaintSector } from '@features/complaints'
import { DATABASE_COLUMNS, databaseCell, downloadComplaintDatabaseExcel } from '@features/complaints/lib/database-excel'
import { ComplaintEmpty, ComplaintPageHeader, ComplaintSearch } from '../../components/ComplaintUi'

const COMPLETION_STYLE: Record<ComplaintDatabaseRow['completion'], string> = {
  'منجز': 'bg-emerald-50 text-emerald-700', 'منجز متأخر': 'bg-amber-50 text-amber-800', 'متأخر': 'bg-rose-50 text-rose-700', 'قيد المعالجة': 'bg-sky-50 text-sky-700',
}
const SECTOR_OPTIONS: { value: ComplaintSector | ''; label: string }[] = [{ value: '', label: 'كل القواطع' }, { value: 'karrada', label: 'قاطع الكرادة' }, { value: 'zaafaraniya', label: 'قاطع الزعفرانية' }]
const COMPLETION_OPTIONS: ('' | ComplaintDatabaseRow['completion'])[] = ['', 'منجز', 'منجز متأخر', 'متأخر', 'قيد المعالجة']

const pad = (n: number) => String(n).padStart(2, '0')
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}` }
/** حدود الشهر YYYY-MM → [أول يوم, آخر يوم] */
export function monthRange(ym: string): [string, string] {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(y!, m!, 0).getDate()
  return [`${ym}-01`, `${ym}-${pad(last)}`]
}

export default function DatabasePage() {
  const [month, setMonth] = useState(thisMonth())
  const [sector, setSector] = useState<ComplaintSector | ''>('')
  const [completion, setCompletion] = useState<'' | ComplaintDatabaseRow['completion']>('')
  const [query, setQuery] = useState('')
  const [exporting, setExporting] = useState(false)
  const [from, to] = useMemo(() => monthRange(month), [month])
  const { data: rows = [], isLoading, isError } = useComplaintDatabase(from, to, sector || null)
  const shown = useMemo(() => {
    const q = query.trim()
    return rows.filter((r) => (!completion || r.completion === completion) && (!q || [r.sender_name, r.municipal_center, r.neighborhood, r.street, r.delay_type, r.handler_name, r.reference_no].some((v) => (v ?? '').includes(q))))
  }, [rows, completion, query])
  const stats = useMemo(() => ({
    total: rows.length, done: rows.filter((r) => r.completion === 'منجز').length, lateDone: rows.filter((r) => r.completion === 'منجز متأخر').length,
    late: rows.filter((r) => r.completion === 'متأخر').length, pending: rows.filter((r) => r.completion === 'قيد المعالجة').length, acked: rows.filter((r) => r.ack_confirmed).length,
  }), [rows])
  const sectorLabel = SECTOR_OPTIONS.find((s) => s.value === sector)?.label ?? 'كل القواطع'
  const doExport = async () => { setExporting(true); try { await downloadComplaintDatabaseExcel(shown, { from, to, sectorLabel }) } finally { setExporting(false) } }

  return (
    <div className="space-y-5" data-testid="complaints-database-page">
      <ComplaintPageHeader icon={Database} eyebrow="السجل الشهري" title="قاعدة بيانات الشكاوى" tone="emerald"
        description="صف لكل شكوى بالأعمدة المعتمدة: التاريخ والوقت والمرسل والمركز والقاطع والشفت والمحلة والشارع ونوع التلكؤ والمصدر والمسؤول والإنجاز والمرفقات وتأكيد الاستلام — مطابق لملف Excel المعتمد."
        action={<div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void doExport()} disabled={exporting || shown.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-emerald-900 shadow-sm disabled:opacity-50" data-testid="db-export"><FileSpreadsheet size={16} />{exporting ? 'جارٍ التصدير…' : 'تصدير Excel'}</button>
          <Link to="/complaints/pages-contact-settings" className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2.5 text-sm font-bold text-white"><Settings2 size={15} />حدّ الشفت والمهلة</Link>
        </div>} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[['الشكاوى', stats.total, 'db-k-total', 'text-slate-900'], ['منجزة', stats.done, 'db-k-done', 'text-emerald-700'], ['منجزة متأخرة', stats.lateDone, 'db-k-latedone', 'text-amber-700'], ['متأخرة', stats.late, 'db-k-late', 'text-rose-700'], ['قيد المعالجة', stats.pending, 'db-k-pending', 'text-sky-700'], ['مؤكَّدة الاستلام', stats.acked, 'db-k-acked', 'text-slate-900']].map(([t, v, id, cls]) => (
          <div key={String(id)} className="rounded-2xl border border-slate-200 bg-white p-3" data-testid={String(id)}><p className="text-[11px] text-slate-500">{t}</p><p className={clsx('text-2xl font-black tabular-nums', cls)}>{v}</p></div>
        ))}
      </div>

      <ComplaintSearch value={query} onChange={setQuery} placeholder="بحث بالمرسل، المركز، المحلة، الشارع، نوع التلكؤ، المسؤول أو المرجع">
        <label className="text-xs font-bold text-slate-600">الشهر<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="ms-2 rounded-xl border bg-white px-3 py-2 text-sm font-normal" data-testid="db-month" /></label>
        <select value={sector} onChange={(e) => setSector(e.target.value as ComplaintSector | '')} className="rounded-xl border bg-white px-3 py-2 text-sm" data-testid="db-sector">{SECTOR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        <select value={completion} onChange={(e) => setCompletion(e.target.value as '' | ComplaintDatabaseRow['completion'])} className="rounded-xl border bg-white px-3 py-2 text-sm" data-testid="db-completion">{COMPLETION_OPTIONS.map((o) => <option key={o} value={o}>{o || 'كل حالات الإنجاز'}</option>)}</select>
      </ComplaintSearch>

      {isLoading ? <p className="text-sm text-slate-500">جارٍ تحميل السجل…</p> : isError ? <p className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">تعذر تحميل قاعدة البيانات — تحقق من الصلاحية ثم أعد المحاولة.</p>
        : shown.length === 0 ? <ComplaintEmpty icon={Download} title="لا شكاوى في هذه الفترة" description="غيّر الشهر أو القاطع أو حالة الإنجاز. تظهر هنا كل الشكاوى المستلمة بعد فرزها." />
        : (
          <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[1200px] text-xs" data-testid="db-table">
              <thead>
                <tr className="bg-[#C6E0A5] text-slate-800">{DATABASE_COLUMNS.map((c) => <th key={c.key} className="border border-slate-300 px-2 py-3 text-center font-black">{c.header}</th>)}</tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.item_id} className="odd:bg-white even:bg-slate-50/60 hover:bg-emerald-50/40" data-testid={`db-row-${r.item_id}`}>
                    {DATABASE_COLUMNS.map((c) => {
                      const v = databaseCell(r, c.key)
                      return (
                        <td key={c.key} className={clsx('border border-slate-200 px-2 py-2 text-center font-semibold tabular-nums', c.key === 'street' && 'text-start')}>
                          {c.key === 'completion' ? <span className={clsx('rounded-full px-2 py-0.5 font-black', COMPLETION_STYLE[r.completion])} title={r.hours_to_complete != null ? `${r.hours_to_complete} ساعة` : ''}>{v}</span>
                            : c.key === 'delay_type' ? <Link to={`/complaints/items/${r.item_id}`} className="text-sky-800 hover:underline">{v}</Link>
                            : c.key === 'ack' ? <span className={r.ack_confirmed ? 'text-emerald-700' : 'text-slate-400'}>{v}</span>
                            : v}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      <p className="text-[11px] text-slate-500">الشفت: قبل حدّ الشفت = الصباحية، بعده = المسائية · الإنجاز: اعتماد خلال المهلة = منجز، بعدها = منجز متأخر، وغير المعتمدة بعد المهلة = متأخر · تأكيد الاستلام = وردت ضمن تقرير أُرسل وتم تسليمه بالبريد · المركز البلدي = منطقة مسؤول القسم المعيَّن على الشكوى (مثال: الكرادة + مسؤول الواثق ⇒ الواثق) · المرسل دائماً «لجنة الاشراف» · المرفقات «صور» بلا عدد.</p>
    </div>
  )
}
