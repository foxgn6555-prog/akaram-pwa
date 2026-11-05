import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { biometric } from '@sdk/biometric.sdk'
import type { ArchivePeopleFilters, ArchivePersonCursor, ArchivePunchCursor, UnmatchedArchivePerson } from '@features/integrations/types'
import { archiveDirection, archiveLocalTime, buildArchivePeopleWorkbook, buildArchivePunchWorkbook, collectArchivePeople, collectArchivePunches } from '@features/integrations/lib/unmatchedArchiveExcel'
import { downloadWorkbook } from '@features/hr/lib/hrExcel'
import { ExportButton } from '../../components/ExportButton'

const PAGE = 50
const field = 'mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm'
const button = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40'
const message = 'rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm leading-6 text-sky-900'

type Branch = { id: string; name: string }

function ArchivePunches({ person, onBack }: { person: UnmatchedArchivePerson; onBack: () => void }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [range, setRange] = useState({ from: '', to: '' })
  const [history, setHistory] = useState<Array<ArchivePunchCursor | null>>([null])
  const [exportError, setExportError] = useState('')
  const cursor = history[history.length - 1]!
  const query = useQuery({
    queryKey: ['unmatched-archive-punches', person.device_serial, person.pin, range, cursor],
    queryFn: () => biometric.unmatchedArchivePunches(person.device_serial, person.pin, range.from, range.to, cursor, PAGE + 1),
    staleTime: 10_000,
  })
  const rows = (query.data ?? []).slice(0, PAGE)
  const invalid = !!from && !!to && from > to
  const dirty = from !== range.from || to !== range.to
  return <div className="space-y-4" data-testid="archive-punches">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-bold text-slate-900">البصمات الأصلية: {person.device_person_name || 'بلا اسم'}</h2><p className="text-sm text-slate-500" dir="ltr">{person.device_serial} · PIN {person.pin}</p></div>
      <div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={onBack}>العودة للأشخاص</button>
        <ExportButton testId="archive-punches-export" label="تصدير بصمات الفترة" disabled={!query.data || query.isError || !rows.length || dirty} onExport={async () => {
          setExportError('')
          try { const all = await collectArchivePunches(person, range.from, range.to); await downloadWorkbook(await buildArchivePunchWorkbook(person, all, range.from, range.to), `بصمات-الأرشيف-${person.pin}.xlsx`) }
          catch (e) { setExportError(e instanceof Error ? e.message : 'تعذر تصدير البصمات') }
        }} />
      </div>
    </div>
    <p className={message}>هذه النسخ حُفظت أثناء عدم المطابقة وليست بصمات الموظف الجديدة بعد الربط. الأوقات بحسب المنطقة الزمنية المحفوظة للجهاز. إذا لم تكن محفوظة يظهر الوقت بـ UTC. الاتجاه «غير محدد» يعني أن الجهاز لم يحدد دخولاً أو خروجاً؛ لا يُخمَّن الاتجاه.</p>
    <form className="grid items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3" onSubmit={e => { e.preventDefault(); if (!invalid) { setRange({ from, to }); setHistory([null]) } }}>
      <label className="text-xs text-slate-600">من يوم<input type="date" className={field} value={from} onChange={e => setFrom(e.target.value)} data-testid="archive-from" /></label>
      <label className="text-xs text-slate-600">إلى يوم<input type="date" className={field} value={to} onChange={e => setTo(e.target.value)} data-testid="archive-to" /></label>
      <button className={button} type="submit" disabled={invalid}>تطبيق الفترة</button>
      {invalid && <p role="alert" className="text-sm text-red-700 sm:col-span-3">تاريخ البداية يجب ألا يتجاوز النهاية.</p>}
    </form>
    {dirty && !invalid && <p className="text-xs text-slate-500">اضغط «تطبيق الفترة» لتحديث العرض والتصدير.</p>}
    {exportError && <p role="alert" className="text-sm text-red-700">{exportError}</p>}
    {query.isLoading && <p>جارٍ تحميل البصمات…</p>}
    {query.isError && <p role="alert" className="text-red-700">تعذر تحميل البصمات المؤرشفة. تأكد من تطبيق ترحيلات قاعدة البيانات.</p>}
    {!query.isLoading && !query.isError && !rows.length && <p className="rounded-xl bg-white p-4 text-sm text-slate-500">لا توجد بصمات محفوظة في الفترة المحددة.</p>}
    {!query.isError && !!rows.length && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-sm"><thead className="bg-slate-800 text-white"><tr><th className="p-3 text-start">وقت البصمة الأصلي</th><th className="p-3 text-start">اتجاه الجهاز</th><th className="p-3 text-start">طريقة الاستلام</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map(p => <tr key={p.source_punch_id}><td className="p-3 font-mono" dir="ltr" title={`${p.punched_at} · ${p.source_punch_id}`}>{archiveLocalTime(p.punched_at, p.original_device?.timezone_offset)}</td><td className="p-3">{archiveDirection(p.original_punch?.direction)}</td><td className="p-3" dir="ltr">{p.original_punch?.method || '—'}</td></tr>)}</tbody></table></div>}
    <div className="flex gap-2"><button type="button" className={button} disabled={history.length === 1 || query.isFetching} onClick={() => setHistory(h => h.slice(0, -1))}>السابق</button>
      <button type="button" className={button} disabled={!query.data || query.data.length <= PAGE || query.isFetching} onClick={() => { const last = rows[rows.length - 1]; if (last) setHistory(h => [...h, { at: last.punched_at, id: last.source_punch_id }]) }}>التالي</button><span className="self-center text-xs text-slate-500">صفحة {history.length}</span></div>
  </div>
}

export default function UnmatchedArchive({ branches }: { branches: Branch[] }) {
  const [search, setSearch] = useState('')
  const [device, setDevice] = useState('')
  const [branch, setBranch] = useState('')
  const [filters, setFilters] = useState<ArchivePeopleFilters>({})
  const [history, setHistory] = useState<Array<ArchivePersonCursor | null>>([null])
  const [selected, setSelected] = useState<UnmatchedArchivePerson | null>(null)
  const [exportError, setExportError] = useState('')
  const cursor = history[history.length - 1]!
  const query = useQuery({
    queryKey: ['unmatched-archive-people', filters, cursor],
    queryFn: () => biometric.unmatchedArchivePeople(filters, cursor, PAGE + 1),
    staleTime: 10_000,
  })
  const rows = (query.data ?? []).slice(0, PAGE)
  const dirty = search.trim() !== (filters.search ?? '') || device.trim() !== (filters.deviceSerial ?? '') || branch !== (filters.branchId ?? '')
  if (selected) return <ArchivePunches key={JSON.stringify([selected.device_serial, selected.pin])} person={selected} onBack={() => setSelected(null)} />
  return <div className="space-y-4" data-testid="archive-people">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-900">أرشيف غير المطابقين</h2>
      <ExportButton testId="archive-people-export" label="تصدير كل نتائج البحث" disabled={!query.data || query.isError || !rows.length || dirty} onExport={async () => {
        setExportError('')
        try { const all = await collectArchivePeople(filters); await downloadWorkbook(await buildArchivePeopleWorkbook(all, filters, branches), 'أشخاص-أرشيف-البصمة.xlsx') }
        catch (e) { setExportError(e instanceof Error ? e.message : 'تعذر تصدير الأشخاص') }
      }} />
    </div>
    <p className={message}>يشمل الأرشيف أشخاصاً كانوا غير مطابقين، بمن فيهم من رُبطوا لاحقاً؛ ليس كل من يظهر هنا غير مطابق الآن. يبدأ الأرشيف من البيانات المتاحة عند تفعيله، ولا يسترجع تلقائياً من رُبطوا قبله. لا يشمل بصمات الموظف الجديدة بعد الربط.</p>
    <form className="grid items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-4" onSubmit={e => { e.preventDefault(); setFilters({ search: search.trim() || undefined, deviceSerial: device.trim() || undefined, branchId: branch || undefined }); setHistory([null]) }}>
      <label className="text-xs text-slate-600">الاسم أو PIN أو الجهاز<input className={field} value={search} onChange={e => setSearch(e.target.value)} data-testid="archive-search" /></label>
      <label className="text-xs text-slate-600">الرقم التسلسلي للجهاز<input className={field} dir="ltr" value={device} onChange={e => setDevice(e.target.value)} data-testid="archive-device" /></label>
      <label className="text-xs text-slate-600">الفرع عند الأرشفة<select className={field} value={branch} onChange={e => setBranch(e.target.value)} data-testid="archive-branch"><option value="">كل الفروع</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <button className={button} type="submit">بحث</button>
    </form>
    {dirty && <p className="text-xs text-slate-500">اضغط «بحث» لتحديث النتائج والتصدير.</p>}
    {exportError && <p role="alert" className="text-sm text-red-700">{exportError}</p>}
    {query.isLoading && <p>جارٍ تحميل الأرشيف…</p>}
    {query.isError && <p role="alert" className="text-red-700">تعذر تحميل الأرشيف. تأكد من تطبيق ترحيلات قاعدة البيانات.</p>}
    {!query.isLoading && !query.isError && !rows.length && <p className="rounded-xl bg-white p-4 text-sm text-slate-500">لا توجد نتائج مطابقة في الأرشيف.</p>}
    {!query.isError && !!rows.length && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-sm"><thead className="bg-slate-800 text-white"><tr><th className="p-3 text-start">الاسم</th><th className="p-3">PIN</th><th className="p-3 text-start">الجهاز</th><th className="p-3 text-start">الفرع عند الأرشفة</th><th className="p-3">البصمات المؤرشفة</th><th className="p-3">التفاصيل</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map(r => <tr key={JSON.stringify([r.device_serial, r.pin])} data-testid={`archive-person-${r.device_serial}-${r.pin}`}><td className="p-3 font-semibold">{r.device_person_name || 'بلا اسم'}</td><td className="p-3 text-center font-mono" dir="ltr">{r.pin}</td><td className="p-3">{r.device_name || '—'}<span className="block font-mono text-xs text-slate-500" dir="ltr">{r.device_serial}</span></td><td className="p-3">{branches.find(b => b.id === r.branch_id)?.name ?? (r.branch_id ? 'فرع غير متاح' : '—')}</td><td className="p-3 text-center">{r.punch_count}</td><td className="p-3 text-center"><button className={button} type="button" onClick={() => setSelected(r)}>عرض البصمات</button></td></tr>)}</tbody></table></div>}
    <div className="flex gap-2"><button type="button" className={button} disabled={history.length === 1 || query.isFetching} onClick={() => setHistory(h => h.slice(0, -1))}>السابق</button>
      <button type="button" className={button} disabled={!query.data || query.data.length <= PAGE || query.isFetching} onClick={() => { const last = rows[rows.length - 1]; if (last) setHistory(h => [...h, { device: last.device_serial, pin: last.pin }]) }}>التالي</button><span className="self-center text-xs text-slate-500">صفحة {history.length}</span></div>
  </div>
}
