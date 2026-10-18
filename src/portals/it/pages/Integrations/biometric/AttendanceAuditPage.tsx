/**
 * سجل تعديلات الحضور (00178 → 00283) — بوابة التطوير المركزية
 * ─────────────────────────────────────────────────────
 * كل إجراء تشغيلي على حضور الموظفين (تعديل يوم، إعادة احتساب، استقطاع يدوي، إلغاء استقطاع مقترح، تصدير/اعتماد شهر)
 * يصل إلى هنا تلقائياً من سجل التدقيق مع اسم الموظف والمدقّق والسبب والفرق قبل/بعد. للقراءة فقط.
 * 00283: فترات جاهزة، فلاتر متعددة (إجراءات/موظف/قسم/مدقّق/مصدر)، عدّادات قابلة للنقر، لوحة «إجراءات موظف»،
 *        ترتيب وتصفّح تدريجي، وتصدير Excel باختيار الأعمدة والملخصات.
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useAttendanceAuditNamed } from '@features/hr'
import type { AttendanceAuditRow } from '@features/hr'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { useUiStore } from '@stores/ui.store'
import { field } from '@portals/hr/components/hr-format'
import { ACTION_TONE, AUDIT_ACTION_LABELS, auditDiff } from './attendance-audit.utils'
import { AUDIT_EXPORT_COLUMNS, DEFAULT_AUDIT_COLUMNS, auditSource, exportAttendanceAudit, fmtDateTime, type AuditColumnId } from './attendance-audit.export'

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
type Preset = 'today' | 'week' | 'month' | 'prev_month' | 'quarter'
export function presetRange(p: Preset, now = new Date()): { from: string; to: string } {
  const y = now.getFullYear(), m = now.getMonth()
  if (p === 'today') return { from: isoDay(now), to: isoDay(now) }
  if (p === 'week') { const d = new Date(now); d.setDate(d.getDate() - 6); return { from: isoDay(d), to: isoDay(now) } }
  if (p === 'month') return { from: isoDay(new Date(y, m, 1)), to: isoDay(now) }
  if (p === 'prev_month') return { from: isoDay(new Date(y, m - 1, 1)), to: isoDay(new Date(y, m, 0)) }
  return { from: isoDay(new Date(y, m - 2, 1)), to: isoDay(now) }
}
const PRESETS: Array<{ id: Preset; label: string }> = [{ id: 'today', label: 'اليوم' }, { id: 'week', label: '٧ أيام' }, { id: 'month', label: 'هذا الشهر' }, { id: 'prev_month', label: 'الشهر الماضي' }, { id: 'quarter', label: '٣ أشهر' }]

export interface AuditFilters { actions: string[]; employee: string; department: string; actor: string; source: '' | 'تلقائي' | 'يدوي'; search: string; sort: 'newest' | 'oldest' | 'employee' | 'work_date' }
export const EMPTY_FILTERS: AuditFilters = { actions: [], employee: '', department: '', actor: '', source: '', search: '', sort: 'newest' }

/** تطبيق الفلاتر والترتيب — نقي */
export function applyAuditFilters(rows: AttendanceAuditRow[], f: AuditFilters): AttendanceAuditRow[] {
  const q = f.search.trim()
  const out = rows.filter((r) =>
    (f.actions.length === 0 || f.actions.includes(r.action)) &&
    (!f.employee || r.employee_id === f.employee) &&
    (!f.department || (r.department_name ?? '—') === f.department) &&
    (!f.actor || (r.actor ?? '—') === f.actor) &&
    (!f.source || auditSource(r) === f.source) &&
    (!q || r.full_name.includes(q) || r.employee_number.includes(q) || (r.actor_name ?? '').includes(q) || r.reason.includes(q) || r.work_date.includes(q)),
  )
  const cmp: Record<AuditFilters['sort'], (a: AttendanceAuditRow, b: AttendanceAuditRow) => number> = {
    newest: (a, b) => b.created_at.localeCompare(a.created_at),
    oldest: (a, b) => a.created_at.localeCompare(b.created_at),
    employee: (a, b) => a.full_name.localeCompare(b.full_name, 'ar') || b.created_at.localeCompare(a.created_at),
    work_date: (a, b) => b.work_date.localeCompare(a.work_date) || b.created_at.localeCompare(a.created_at),
  }
  return [...out].sort(cmp[f.sort])
}

const PAGE = 100
const ACTION_KEYS = Object.keys(AUDIT_ACTION_LABELS) as AttendanceAuditRow['action'][]
const K_GROUPS: Array<{ id: string; label: string; actions: AttendanceAuditRow['action'][] }> = [
  { id: 'edits', label: 'تعديلات أيام', actions: ['edit'] },
  { id: 'resets', label: 'إعادة احتساب', actions: ['reset_auto'] },
  { id: 'deductions', label: 'استقطاعات يدوية', actions: ['deduction_add', 'deduction_delete'] },
  { id: 'waives', label: 'إلغاء/إعادة استقطاع', actions: ['waive', 'unwaive'] },
  { id: 'month', label: 'اعتماد/تصدير شهر', actions: ['confirm', 'reopen', 'export', 'approve'] },
  { id: 'blocked', label: 'تغييرات محجوزة', actions: ['auto_blocked'] },
]

export default function AttendanceAuditPage() {
  const today = new Date()
  const [from, setFrom] = useState(isoDay(new Date(today.getFullYear(), today.getMonth(), 1)))
  const [to, setTo] = useState(isoDay(today))
  const [f, setF] = useState<AuditFilters>(EMPTY_FILTERS)
  const [limit, setLimit] = useState(PAGE)
  const [exportOpen, setExportOpen] = useState(false)
  const toast = useUiStore((s) => s.addToast)
  const patch = (p: Partial<AuditFilters>) => { setF((x) => ({ ...x, ...p })); setLimit(PAGE) }

  const { data: rows = [], isLoading, refetch, isFetching } = useAttendanceAuditNamed({ from, to, limit: 5000 })
  const filtered = useMemo(() => applyAuditFilters(rows, f), [rows, f])
  const shown = filtered.slice(0, limit)

  const counts = useMemo(() => Object.fromEntries(K_GROUPS.map((g) => [g.id, rows.filter((r) => g.actions.includes(r.action)).length])), [rows])
  const options = useMemo(() => {
    const emp = new Map<string, string>(), dep = new Set<string>(), act = new Map<string, string>()
    for (const r of rows) { emp.set(r.employee_id, `${r.full_name} — ${r.employee_number}`); dep.add(r.department_name ?? '—'); act.set(r.actor ?? '—', r.actor_name ?? '—') }
    return { employees: [...emp.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ar')), departments: [...dep].sort(), actors: [...act.entries()] }
  }, [rows])
  const activeCount = (f.actions.length ? 1 : 0) + (f.employee ? 1 : 0) + (f.department ? 1 : 0) + (f.actor ? 1 : 0) + (f.source ? 1 : 0) + (f.search ? 1 : 0)

  // لوحة «إجراءات موظف»
  const focus = useMemo(() => {
    if (!f.employee) return null
    const list = rows.filter((r) => r.employee_id === f.employee).sort((a, b) => b.created_at.localeCompare(a.created_at))
    if (!list.length) return null
    const perAction = new Map<string, number>(); const days = new Set<string>(); const actors = new Set<string>()
    for (const r of list) { perAction.set(r.action, (perAction.get(r.action) ?? 0) + 1); days.add(r.work_date); actors.add(r.actor_name ?? '—') }
    return { first: list[list.length - 1]!, last: list[0]!, total: list.length, days: days.size, actors: [...actors], perAction: [...perAction.entries()].sort((a, b) => b[1] - a[1]) }
  }, [rows, f.employee])

  const filtersLabel = [
    f.actions.length ? `الإجراءات: ${f.actions.map((a) => AUDIT_ACTION_LABELS[a as AttendanceAuditRow['action']]).join('/')}` : '',
    f.employee ? `الموظف: ${options.employees.find((e) => e[0] === f.employee)?.[1] ?? ''}` : '',
    f.department ? `القسم: ${f.department}` : '', f.actor ? `المدقّق: ${options.actors.find((a) => a[0] === f.actor)?.[1] ?? ''}` : '',
    f.source ? `المصدر: ${f.source}` : '', f.search ? `بحث: ${f.search}` : '',
  ].filter(Boolean).join(' · ')

  return (
    <div className="space-y-4" data-testid="it-attendance-audit-page">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-black">سجل تعديلات الحضور</h1>
          <p className="text-xs text-slate-500">كل إجراء من غرفة العمليات على حضور الموظفين يصل هنا تلقائياً مع اسم المدقّق والسبب والفرق قبل/بعد — للقراءة فقط.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold hover:bg-slate-50" onClick={() => void refetch()} disabled={isFetching} data-testid="audit-refresh">
            <Icon name="refresh" className={clsx('h-4 w-4', isFetching && 'animate-spin')} /> تحديث
          </button>
          <button type="button" className="inline-flex h-9 items-center gap-1 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-40" onClick={() => setExportOpen(true)} disabled={filtered.length === 0} data-testid="audit-export-open">
            <Icon name="file-spreadsheet" className="h-4 w-4" /> تصدير Excel ({filtered.length})
          </button>
        </div>
      </div>

      {/* عدّادات قابلة للنقر = فلتر سريع */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {K_GROUPS.map((g) => {
          const active = f.actions.length === g.actions.length && g.actions.every((a) => f.actions.includes(a))
          return (
            <button type="button" key={g.id} onClick={() => patch({ actions: active ? [] : [...g.actions] })} className={clsx('rounded-2xl border p-3 text-start transition', active ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200' : 'border-slate-200 bg-white hover:bg-slate-50')} data-testid={`audit-k-${g.id}`} aria-pressed={active}>
              <p className="text-[11px] text-slate-500">{g.label}</p><p className="text-2xl font-black tabular-nums">{counts[g.id]}</p>
            </button>
          )
        })}
      </div>

      {/* الفلاتر */}
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs"><span className="mb-1 block font-semibold text-slate-600">من</span><input type="date" className={field} value={from} onChange={(e) => setFrom(e.target.value)} data-testid="audit-from" /></label>
          <label className="text-xs"><span className="mb-1 block font-semibold text-slate-600">إلى</span><input type="date" className={field} value={to} onChange={(e) => setTo(e.target.value)} data-testid="audit-to" /></label>
          <div className="flex flex-wrap gap-1" data-testid="audit-presets">
            {PRESETS.map((p) => <button key={p.id} type="button" className="h-9 rounded-xl border border-slate-200 px-2 text-[11px] font-bold hover:bg-slate-50" onClick={() => { const r = presetRange(p.id); setFrom(r.from); setTo(r.to) }} data-testid={`audit-preset-${p.id}`}>{p.label}</button>)}
          </div>
          <label className="text-xs"><span className="mb-1 block font-semibold text-slate-600">الترتيب</span>
            <select className={field} value={f.sort} onChange={(e) => patch({ sort: e.target.value as AuditFilters['sort'] })} data-testid="audit-sort">
              <option value="newest">الأحدث أولاً</option><option value="oldest">الأقدم أولاً</option><option value="employee">حسب الموظف</option><option value="work_date">حسب يوم الحضور</option>
            </select>
          </label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs"><span className="mb-1 block font-semibold text-slate-600">الموظف</span>
            <select className={field} value={f.employee} onChange={(e) => patch({ employee: e.target.value })} data-testid="audit-employee">
              <option value="">كل الموظفين ({options.employees.length})</option>
              {options.employees.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <label className="text-xs"><span className="mb-1 block font-semibold text-slate-600">القسم</span>
            <select className={field} value={f.department} onChange={(e) => patch({ department: e.target.value })} data-testid="audit-department">
              <option value="">كل الأقسام</option>{options.departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="text-xs"><span className="mb-1 block font-semibold text-slate-600">المدقّق</span>
            <select className={field} value={f.actor} onChange={(e) => patch({ actor: e.target.value })} data-testid="audit-actor">
              <option value="">كل المدقّقين</option>{options.actors.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <label className="text-xs"><span className="mb-1 block font-semibold text-slate-600">مصدر التغيير</span>
            <select className={field} value={f.source} onChange={(e) => patch({ source: e.target.value as AuditFilters['source'] })} data-testid="audit-source">
              <option value="">الكل</option><option value="يدوي">يدوي (غرفة العمليات)</option><option value="تلقائي">تلقائي (البصمة)</option>
            </select>
          </label>
          <label className="text-xs"><span className="mb-1 block font-semibold text-slate-600">بحث (موظف / رقم / مدقّق / سبب / يوم)</span><input className={field} value={f.search} onChange={(e) => patch({ search: e.target.value })} placeholder="اسم أو رقم أو كلمة من السبب" data-testid="audit-search" /></label>
        </div>
        <div className="flex flex-wrap items-center gap-1" data-testid="audit-action-chips">
          <span className="me-1 text-[11px] font-semibold text-slate-600">الإجراءات:</span>
          {ACTION_KEYS.map((k) => {
            const on = f.actions.includes(k)
            return <button key={k} type="button" aria-pressed={on} onClick={() => patch({ actions: on ? f.actions.filter((a) => a !== k) : [...f.actions, k] })} className={clsx('rounded-full border px-2 py-0.5 text-[10px] font-bold transition', on ? `${ACTION_TONE[k]} border-current` : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50')} data-testid={`audit-chip-${k}`}>{AUDIT_ACTION_LABELS[k]}</button>
          })}
          {activeCount > 0 && <button type="button" className="ms-auto rounded-full bg-slate-900 px-3 py-1 text-[11px] font-black text-white" onClick={() => patch(EMPTY_FILTERS)} data-testid="audit-clear">مسح الفلاتر ({activeCount}) · يظهر {filtered.length} من {rows.length}</button>}
        </div>
      </div>

      {/* لوحة إجراءات موظف */}
      {focus && (
        <section className="rounded-2xl border border-brand-200 bg-brand-50/40 p-3" data-testid="audit-focus">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-black">إجراءات الموظف: {focus.last.full_name} <span className="text-xs font-normal text-slate-500" dir="ltr">{focus.last.employee_number}</span></h2>
              <p className="text-[11px] text-slate-600">{focus.total} إجراء على {focus.days} يوم حضور · أول إجراء {fmtDateTime(focus.first.created_at)} · آخر إجراء {fmtDateTime(focus.last.created_at)} · المدقّقون: {focus.actors.join('، ')}</p>
            </div>
            <button type="button" className="rounded-xl border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold" onClick={() => patch({ employee: '' })} data-testid="audit-focus-close">إغلاق</button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {focus.perAction.map(([a, n]) => <span key={a} className={clsx('rounded-full px-2 py-0.5 text-[10px] font-bold', ACTION_TONE[a as AttendanceAuditRow['action']])} data-testid={`audit-focus-${a}`}>{AUDIT_ACTION_LABELS[a as AttendanceAuditRow['action']]}: {n}</span>)}
          </div>
        </section>
      )}

      {isLoading ? <LoadingSpinner /> : filtered.length === 0 ? (
        <EmptyState title={rows.length ? 'لا نتائج مطابقة للفلاتر' : 'لا تعديلات في هذه الفترة'} hint={rows.length ? 'خفّف الفلاتر أو امسحها' : 'أي تعديل من غرفة العمليات على الحضور سيظهر هنا فور حدوثه'} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-xs" data-testid="audit-table">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="p-2 text-start">وقت الإجراء</th><th className="p-2 text-start">الإجراء</th><th className="p-2 text-start">الموظف</th>
                <th className="p-2">يوم الحضور</th><th className="p-2 text-start">الفرق</th><th className="p-2 text-start">السبب</th><th className="p-2 text-start">المدقّق</th><th className="p-2">المصدر</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const diff = auditDiff(r.before, r.after)
                return (
                  <tr key={r.id} className="border-t border-slate-100 align-top" data-testid={`audit-row-${r.id}`}>
                    <td className="whitespace-nowrap p-2 tabular-nums text-slate-600">{new Date(r.created_at).toLocaleString('ar-IQ-u-nu-latn', { timeZone: 'Asia/Baghdad', dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="p-2"><button type="button" className={clsx('rounded-full px-2 py-0.5 text-[10px] font-bold', ACTION_TONE[r.action])} onClick={() => patch({ actions: [r.action] })} title="تصفية بهذا الإجراء">{AUDIT_ACTION_LABELS[r.action] ?? r.action}</button></td>
                    <td className="p-2">
                      <button type="button" className="font-bold text-brand-700 hover:underline" onClick={() => patch({ employee: r.employee_id })} title="عرض إجراءات هذا الموظف" data-testid={`audit-emp-${r.id}`}>{r.full_name}</button>
                      <p className="text-[10px] text-slate-500" dir="ltr">{r.employee_number}{r.department_name ? ` · ${r.department_name}` : ''}</p>
                    </td>
                    <td className="whitespace-nowrap p-2 text-center tabular-nums">{r.work_date}</td>
                    <td className="p-2">
                      {diff.length === 0 ? <span className="text-slate-400">—</span> : (
                        <ul className="space-y-0.5">{diff.map((d) => <li key={d.key}><span className="text-slate-500">{d.label}:</span> <span className="tabular-nums">{d.from}</span> <span className="text-slate-400">←</span> <b className="tabular-nums">{d.to}</b></li>)}</ul>
                      )}
                    </td>
                    <td className="max-w-[18rem] p-2 text-slate-700">{r.reason}</td>
                    <td className="p-2 text-slate-700">{r.actor_name ?? '—'}</td>
                    <td className="p-2 text-center text-[10px] text-slate-500">{auditSource(r)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length > shown.length && (
            <div className="flex items-center justify-between border-t p-2 text-[11px] text-slate-600">
              <span>يظهر {shown.length} من {filtered.length}</span>
              <button type="button" className="rounded-xl border border-slate-300 px-3 py-1 font-bold hover:bg-slate-50" onClick={() => setLimit((l) => l + PAGE)} data-testid="audit-more">عرض {Math.min(PAGE, filtered.length - shown.length)} أخرى</button>
            </div>
          )}
        </div>
      )}

      {exportOpen && (
        <ExportDialog
          count={filtered.length}
          onClose={() => setExportOpen(false)}
          onExport={async (o) => {
            try {
              await exportAttendanceAudit(filtered, { ...o, from, to, filtersLabel })
              toast({ type: 'success', message: `صُدِّر ${filtered.length} إجراء إلى Excel` })
              setExportOpen(false)
            } catch (e) { toast({ type: 'error', message: `تعذّر التصدير: ${(e as Error).message}` }) }
          }}
        />
      )}
    </div>
  )
}

/** حوار اختيار الأعمدة والخيارات قبل التصدير */
export function ExportDialog({ count, onClose, onExport }: { count: number; onClose: () => void; onExport: (o: { columns: AuditColumnId[]; diffMode: 'text' | 'detailed'; summarySheets: boolean; chart: boolean }) => Promise<void> }) {
  const [cols, setCols] = useState<AuditColumnId[]>([...DEFAULT_AUDIT_COLUMNS])
  const [diffMode, setDiffMode] = useState<'text' | 'detailed'>('text')
  const [summarySheets, setSummary] = useState(true)
  const [chart, setChart] = useState(true)
  const [busy, setBusy] = useState(false)
  const groups = [...new Set(AUDIT_EXPORT_COLUMNS.map((c) => c.group))]
  const toggle = (id: AuditColumnId) => setCols((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...AUDIT_EXPORT_COLUMNS.map((x) => x.id).filter((x) => x === id || c.includes(x))]))
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-3" role="dialog" aria-modal="true" data-testid="audit-export-dialog">
      <div className="w-full max-w-2xl space-y-3 rounded-2xl bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between">
          <div><h2 className="text-base font-black">تصدير Excel — {count} إجراء</h2><p className="text-[11px] text-slate-500">اختر الأعمدة التي تريدها؛ الترتيب في الملف يتبع ترتيبها هنا. الملف بترويسة الشركة وفلاتر تلقائية وإعداد طباعة A4.</p></div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100" aria-label="إغلاق"><Icon name="x" className="h-4 w-4" /></button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((g) => (
            <fieldset key={g} className="rounded-xl border border-slate-200 p-2">
              <legend className="px-1 text-[11px] font-black text-slate-600">{g}</legend>
              {AUDIT_EXPORT_COLUMNS.filter((c) => c.group === g).map((c) => (
                <label key={c.id} className="flex items-center gap-2 py-0.5 text-xs">
                  <input type="checkbox" checked={cols.includes(c.id)} onChange={() => toggle(c.id)} data-testid={`audit-col-${c.id}`} /> {c.header}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <button type="button" className="rounded-full border px-2 py-0.5 font-bold" onClick={() => setCols([...DEFAULT_AUDIT_COLUMNS])} data-testid="audit-cols-default">الافتراضي</button>
          <button type="button" className="rounded-full border px-2 py-0.5 font-bold" onClick={() => setCols(AUDIT_EXPORT_COLUMNS.map((c) => c.id))} data-testid="audit-cols-all">الكل</button>
          <button type="button" className="rounded-full border px-2 py-0.5 font-bold" onClick={() => setCols([])} data-testid="audit-cols-none">لا شيء</button>
        </div>
        <div className="grid gap-2 rounded-xl bg-slate-50 p-2 text-xs sm:grid-cols-2">
          <label className="flex items-center gap-2"><span className="font-semibold">عمود الفرق:</span>
            <select className="h-8 rounded-lg border px-2" value={diffMode} onChange={(e) => setDiffMode(e.target.value as 'text' | 'detailed')} disabled={!cols.includes('diff')} data-testid="audit-diff-mode">
              <option value="text">نص واحد (قبل ← بعد)</option><option value="detailed">مفصّل: عمود قبل وعمود بعد لكل حقل</option>
            </select>
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={summarySheets} onChange={(e) => setSummary(e.target.checked)} data-testid="audit-opt-summary" /> أوراق ملخص (حسب الإجراء / الموظف / المدقّق)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={chart} onChange={(e) => setChart(e.target.checked)} data-testid="audit-opt-chart" /> ورقة رسم بياني لتوزيع الإجراءات</label>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-xl border px-4 text-xs font-bold">إلغاء</button>
          <button type="button" disabled={busy || cols.length === 0} onClick={async () => { setBusy(true); try { await onExport({ columns: cols, diffMode, summarySheets, chart }) } finally { setBusy(false) } }} className="h-10 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white disabled:opacity-40" data-testid="audit-export-run">{busy ? 'جارٍ التصدير…' : 'تصدير الآن'}</button>
        </div>
      </div>
    </div>
  )
}
