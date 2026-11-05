import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { biometric } from '@sdk/biometric.sdk'
import type { ArchivePersonCursor, UnmatchedUnitDay, UnmatchedUnitFilters, UnmatchedUnitPerson, UnmatchedUnitStatus } from '@features/integrations/types'
import { buildUnitWorkbook, collectUnitRows, UNIT_STATUS, unitCellText, unitLocalTime, unitShownTimes } from '@features/integrations/lib/unmatchedUnitExcel'
import { downloadWorkbook } from '@features/hr/lib/hrExcel'
import { ExportButton } from '../../components/ExportButton'
import UnmatchedUnitPersonPanel from './UnmatchedUnitPersonPanel'
import UnmatchedIndependentConfirm from './UnmatchedIndependentConfirm'

const PAGE = 25
const input = 'mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm'
const button = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40'
const colors: Record<UnmatchedUnitStatus, string> = {
  present: 'bg-emerald-50 text-emerald-800', missing: 'bg-amber-50 text-amber-900', absent: 'bg-rose-50 text-rose-800', leave: 'bg-blue-50 text-blue-800', review: 'bg-slate-50 text-slate-700',
  previous_exit: 'bg-indigo-50 text-indigo-800', pending: 'bg-slate-50 text-slate-700', future: 'bg-slate-50 text-slate-500', unknown: 'bg-slate-100 text-slate-700',
}
const statuses: UnmatchedUnitStatus[] = ['present', 'missing', 'absent', 'leave']
function initialRange() {
  const day = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10)
  const ym = day.slice(0, 7); const [y, m] = ym.split('-').map(Number)
  const end = new Date(Date.UTC(y!, m!, 0)).getUTCDate()
  return { from: `${ym}-01`, to: `${ym}-${String(end).padStart(2, '0')}` }
}
function validRange(from: string, to: string) {
  return !!from && !!to && from <= to && (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) <= 62 * 86_400_000
}

type Branch = { id: string; name: string }
function Permissions({ onBack }: { onBack: () => void }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const q = useQuery({ queryKey: ['unmatched-unit-permissions'], queryFn: () => biometric.unmatchedUnitPermissions() })
  const setPermission = async (id: string, value: boolean) => {
    setBusy(id); setError('')
    try { await biometric.unmatchedUnitSetPermission(id, value); await qc.invalidateQueries({ queryKey: ['unmatched-unit-permissions'] }) }
    catch { setError('تعذر تغيير صلاحية الحساب. تحقق من الصلاحية وحاول مجدداً.') }
    finally { setBusy('') }
  }
  return <section className="space-y-4" data-testid="unit-permissions"><div className="flex flex-wrap justify-between gap-2"><h2 className="text-lg font-bold">صلاحيات حسابات الموارد البشرية</h2><button className={button} type="button" onClick={onBack}>العودة للتقرير</button></div>
    <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">التطوير المركزي يملك التعديل دائماً. كل حساب HR يقرأ، ويمكن للتطوير منحه التعديل أو إعادته للقراءة فقط داخل هذه الوحدة.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}{q.isLoading && <p>جارٍ تحميل الحسابات…</p>}{q.isError && <p role="alert" className="text-red-700">تعذر تحميل الصلاحيات.</p>}
    {!q.isLoading && !q.isError && !q.data?.length && <p>لا توجد حسابات موارد بشرية.</p>}
    {!q.isError && !!q.data?.length && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-sm"><thead className="bg-slate-800 text-white"><tr><th className="p-3 text-start">الحساب</th><th className="p-3 text-start">البريد</th><th className="p-3">الصلاحية</th><th className="p-3">تغيير</th></tr></thead><tbody>{q.data.map(u => <tr key={u.user_id} className="border-t"><td className="p-3">{u.display_name}</td><td className="p-3" dir="ltr">{u.email ?? '—'}</td><td className="p-3 text-center">{u.can_edit ? 'تعديل' : 'قراءة فقط'}</td><td className="p-3 text-center"><button type="button" className={button} disabled={!!busy} onClick={() => void setPermission(u.user_id, !u.can_edit)}>{u.can_edit ? 'قراءة فقط' : 'السماح بالتعديل'}</button></td></tr>)}</tbody></table></div>}
  </section>
}

export default function UnmatchedUnitWorkspace({ mode, branches }: { mode: 'grid' | 'details'; branches: Branch[] }) {
  const [draft, setDraft] = useState<UnmatchedUnitFilters>(() => initialRange())
  const [filters, setFilters] = useState<UnmatchedUnitFilters>(() => initialRange())
  const [history, setHistory] = useState<Array<ArchivePersonCursor | null>>([null])
  const [selected, setSelected] = useState<{ person: UnmatchedUnitPerson; day: UnmatchedUnitDay } | null>(null)
  const [showPermissions, setShowPermissions] = useState(false)
  const [showIndependent, setShowIndependent] = useState(false)
  const [exportError, setExportError] = useState('')
  const cursor = history[history.length - 1]!
  const access = useQuery({ queryKey: ['unmatched-unit-access'], queryFn: () => biometric.unmatchedUnitAccess(), staleTime: 10_000 })
  const report = useQuery({ queryKey: ['unmatched-unit-report', filters, cursor], queryFn: () => biometric.unmatchedUnitReport(filters, cursor, PAGE + 1), enabled: validRange(filters.from, filters.to), staleTime: 10_000 })
  const rows = (report.data ?? []).slice(0, PAGE)
  const dirty = JSON.stringify(draft) !== JSON.stringify(filters)
  const branchName = (id: string | null) => id ? (branches.find(b => b.id === id)?.name ?? 'فرع غير متاح') : '—'
  const open = (person: UnmatchedUnitPerson, day: UnmatchedUnitDay) => setSelected({ person, day })
  if (showIndependent && access.data?.can_edit) return <UnmatchedIndependentConfirm onBack={() => setShowIndependent(false)} />
  if (showPermissions && access.data?.can_manage) return <Permissions onBack={() => setShowPermissions(false)} />
  if (selected) return <UnmatchedUnitPersonPanel key={JSON.stringify([selected.person.device_serial, selected.person.pin, selected.day.date])} person={selected.person} day={selected.day} canEdit={!!access.data?.can_edit} onBack={() => setSelected(null)} />
  return <section className="space-y-4" data-testid="unit-workspace">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">{mode === 'grid' ? 'شبكة الدخول والخروج' : 'التفاصيل اليومية'}</h2><p className="text-xs text-slate-500">كل جهاز مع رقم البصمة سجل مستقل في الأرشيف.</p></div><div className="flex flex-wrap gap-2">
      {access.data?.can_edit && <button type="button" className={button} onClick={() => setShowIndependent(true)}>تأكيد رقم مكرر</button>}
      {access.data?.can_manage && <button type="button" className={button} onClick={() => setShowPermissions(true)}>صلاحيات HR</button>}
      <ExportButton testId="unit-report-export" label={mode === 'grid' ? 'تصدير شبكة الدخول والخروج' : 'تصدير التفاصيل اليومية'} disabled={!report.data || report.isError || !rows.length || dirty} onExport={async () => {
        setExportError('')
        try { const all = await collectUnitRows(filters); await downloadWorkbook(await buildUnitWorkbook(all, filters, branches, mode), `${mode === 'grid' ? 'دخول-وخروج' : 'تفاصيل-يومية'}-${filters.from}_${filters.to}.xlsx`) }
        catch (e) { setExportError(e instanceof Error ? e.message : 'تعذر التصدير') }
      }} />
    </div></div>
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm leading-6 text-sky-900">الأوقات المعروضة دون حالة هي أول وآخر بصمة فقط ولا تُحتسب حضوراً أو ساعات. التعديل هنا لا يغيّر الحضور الرسمي.</div>
    <form className="grid items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3 lg:grid-cols-7" onSubmit={e => { e.preventDefault(); if (validRange(draft.from, draft.to)) { setFilters(draft); setHistory([null]); setExportError('') } }}>
      <label className="text-xs text-slate-600">من يوم<input type="date" className={input} value={draft.from} onChange={e => setDraft(d => ({ ...d, from: e.target.value }))} data-testid="unit-from" /></label>
      <label className="text-xs text-slate-600">إلى يوم<input type="date" className={input} value={draft.to} onChange={e => setDraft(d => ({ ...d, to: e.target.value }))} data-testid="unit-to" /></label>
      <label className="text-xs text-slate-600">الفرع<select className={input} value={draft.branch ?? ''} onChange={e => setDraft(d => ({ ...d, branch: e.target.value || undefined }))}><option value="">كل الفروع</option>{branches.map(b => <option value={b.id} key={b.id}>{b.name}</option>)}</select></label>
      <label className="text-xs text-slate-600">الجهاز (الرقم التسلسلي)<input className={input} dir="ltr" value={draft.device ?? ''} onChange={e => setDraft(d => ({ ...d, device: e.target.value || undefined }))} /></label>
      <label className="text-xs text-slate-600">الاسم<input className={input} value={draft.name ?? ''} onChange={e => setDraft(d => ({ ...d, name: e.target.value || undefined }))} /></label>
      <label className="text-xs text-slate-600">PIN<input className={input} dir="ltr" value={draft.pin ?? ''} onChange={e => setDraft(d => ({ ...d, pin: e.target.value || undefined }))} /></label>
      <label className="text-xs text-slate-600">الحالة<select className={input} value={draft.status ?? ''} onChange={e => setDraft(d => ({ ...d, status: (e.target.value || undefined) as UnmatchedUnitStatus | undefined }))}><option value="">كل الحالات</option>{statuses.map(s => <option value={s} key={s}>{UNIT_STATUS[s]}</option>)}</select></label>
      <button type="submit" className={button} disabled={!validRange(draft.from, draft.to)}>تطبيق الفلاتر</button>
      {!validRange(draft.from, draft.to) && <p role="alert" className="text-sm text-red-700 sm:col-span-2">اختر فترة صحيحة لا تزيد على 63 يوماً.</p>}
    </form>
    {dirty && <p className="text-xs text-slate-500">اضغط «تطبيق الفلاتر» لتحديث العرض والتصدير.</p>}
    {filters.status && <p className="text-xs text-slate-500">{mode === 'grid' ? 'تظهر جميع أيام الأشخاص الذين لديهم الحالة المختارة في الفترة.' : 'تظهر الأيام التي تحمل الحالة المختارة فقط.'}</p>}
    {access.isError && <p role="alert" className="text-red-700">تعذر التحقق من صلاحيات الوحدة؛ التعديل متوقف.</p>}
    {exportError && <p role="alert" className="text-red-700">{exportError}</p>}
    {report.isLoading && <p>جارٍ تحميل التقرير…</p>}
    {report.isError && <p role="alert" className="text-red-700">تعذر تحميل التقرير. تحقق من تطبيق ترحيلات قاعدة البيانات.</p>}
    {!report.isLoading && !report.isError && !rows.length && <p className="rounded-xl bg-white p-4 text-sm text-slate-500">لا توجد نتائج لهذه الفلاتر.</p>}
    {!report.isError && !!rows.length && mode === 'grid' && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-xs" data-testid="unit-grid"><thead className="bg-slate-800 text-white"><tr><th className="sticky start-0 z-10 bg-slate-800 p-3 text-start">الاسم · PIN · الجهاز</th>{rows[0]?.days.map(d => <th key={d.date} className="min-w-36 p-2">{d.date}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map(r => <tr key={JSON.stringify([r.device_serial, r.pin])}><td className="sticky start-0 z-10 min-w-48 bg-white p-3"><strong>{r.person_name || 'بلا اسم'}</strong><span className="block font-mono" dir="ltr">{r.pin} · {r.device_serial}</span><span className="block text-slate-500">{r.device_name || '—'} · {branchName(r.branch_id)}</span></td>{r.days.map(d => <td className={`p-1 ${colors[d.status]}`} key={d.date}><button type="button" className="min-h-20 w-full whitespace-pre-line rounded-md p-2 text-center hover:ring-2 hover:ring-slate-400" onClick={() => open(r, d)} aria-label={`${r.person_name || r.pin} ${d.date} ${UNIT_STATUS[d.status]}`}>{unitCellText(d)}{d.manual && <span className="block text-[10px]">تعديل يدوي</span>}</button></td>)}</tr>)}</tbody></table></div>}
    {!report.isError && !!rows.length && mode === 'details' && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-sm" data-testid="unit-details"><thead className="bg-slate-800 text-white"><tr><th className="p-3 text-start">الاسم · الجهاز</th><th className="p-3">PIN</th><th className="p-3">اليوم</th><th className="p-3">الحالة</th><th className="p-3">الوقت الأول</th><th className="p-3">الوقت الأخير</th><th className="p-3">البصمات</th><th className="p-3">فتح</th></tr></thead><tbody>{rows.flatMap(r => r.days.filter(d => !filters.status || d.status === filters.status).map(d => <tr key={JSON.stringify([r.device_serial, r.pin, d.date])} className="border-t"><td className="p-3">{r.person_name || 'بلا اسم'}<span className="block text-xs text-slate-500">{r.device_name || '—'} · {r.device_serial} · {branchName(r.branch_id)}</span></td><td className="p-3 text-center font-mono" dir="ltr">{r.pin}</td><td className="p-3 text-center" dir="ltr">{d.date}</td><td className={`p-3 text-center ${colors[d.status]}`}>{UNIT_STATUS[d.status]}{d.manual && ' · يدوي'}</td><td className="p-3 text-center">{unitLocalTime(unitShownTimes(d).first, d.date)}</td><td className="p-3 text-center">{unitLocalTime(unitShownTimes(d).last, d.date)}</td><td className="p-3 text-center">{d.punch_count}</td><td className="p-3 text-center"><button type="button" className={button} onClick={() => open(r, d)}>فتح اليوم</button></td></tr>))}</tbody></table></div>}
    <div className="flex gap-2"><button type="button" className={button} disabled={history.length === 1 || report.isFetching} onClick={() => setHistory(h => h.slice(0, -1))}>السابق</button><button type="button" className={button} disabled={!report.data || report.data.length <= PAGE || report.isFetching} onClick={() => { const last = rows[rows.length - 1]; if (last) setHistory(h => [...h, { device: last.device_serial, pin: last.pin }]) }}>التالي</button><span className="self-center text-xs text-slate-500">صفحة الأشخاص {history.length}</span></div>
  </section>
}
