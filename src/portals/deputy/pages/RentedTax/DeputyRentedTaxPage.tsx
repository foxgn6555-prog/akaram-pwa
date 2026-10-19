/**
 * 00251 — وحدة «ضريبة الآليات المؤجرة» في بوابة معاون المدير المفوض.
 *   من يخضع: السائقون المرتبطون بآليات «مؤجرة» في قاعدة آليات غرفة العمليات (تلقائياً). النسبة العامة 3٪ (قابلة للتعديل هنا فقط)،
 *   نسبة خاصة لموظف أو إعفاء كامل بسبب ومدة اختيارية، وسجل تدقيق. الوعاء = الإجمالي المستحق للشهر (الأيام المدفوعة فقط) — مستقل عن
 *   الغرامات والسلف وبقية الاستقطاعات. التغييرات تسري على التصدير القادم (الكشوف المُصدَّرة لا تُعدَّل بأثر رجعي).
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { Button } from '@components/ui'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { StatCard } from '@portals/hr/components/hr-ui'
import { field, fmtMoney } from '@portals/hr/components/hr-format'
import { useRentedTaxAudit, useRentedTaxOverrideClear, useRentedTaxOverrideSet, useRentedTaxOverview, useRentedTaxPreview, useRentedTaxSetPct, type RentedTaxEmployee } from '@features/hr'

const SOURCE = { auto: { label: 'النسبة العامة', cls: 'bg-slate-100 text-slate-700' }, custom: { label: 'نسبة خاصة', cls: 'bg-amber-100 text-amber-800' }, exempt: { label: 'معفى', cls: 'bg-emerald-100 text-emerald-800' }, none: { label: 'غير مرتبط بآلية مؤجرة', cls: 'bg-slate-50 text-slate-400' } } as const
const ACTION = { pct: 'تعديل النسبة العامة', exempt: 'إعفاء كامل', custom: 'نسبة خاصة', clear: 'إلغاء الاستثناء' } as const
const fmtPct = (n: number | null | undefined) => `${Number(n ?? 0)}٪`
const fmtDate = (d: string | null | undefined) => (d ? d.slice(0, 10) : '—')
const round2 = (n: number) => Math.round(n * 100) / 100

export default function DeputyRentedTaxPage() {
  const q = useRentedTaxOverview()
  const o = q.data
  const [pct, setPct] = useState<string | null>(null)
  const [pctReason, setPctReason] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'auto' | 'custom' | 'exempt'>('all')
  const [editing, setEditing] = useState<RentedTaxEmployee | null>(null)
  const [showAudit, setShowAudit] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const setPctM = useRentedTaxSetPct(); const setOv = useRentedTaxOverrideSet(); const clearOv = useRentedTaxOverrideClear()
  const audit = useRentedTaxAudit(showAudit)
  const preview = useRentedTaxPreview(showPreview ? o?.last_export_month ?? null : null)

  const emps = useMemo(() => o?.employees ?? [], [o])
  const linked = emps.filter((e) => e.linked)
  const counts = { custom: linked.filter((e) => e.source === 'custom').length, exempt: linked.filter((e) => e.source === 'exempt').length, auto: linked.filter((e) => e.source === 'auto').length }
  const lastTaxTotal = round2(linked.reduce((s, e) => s + (e.last_tax ?? 0), 0))
  const qq = search.trim()
  const shown = emps.filter((e) => (filter === 'all' || e.source === filter) && (!qq || e.full_name.includes(qq) || e.employee_number.includes(qq) || (e.vehicles ?? '').includes(qq) || (e.department_name ?? '').includes(qq)))
  const pctValue = pct ?? String(o?.pct ?? 3)

  const savePct = async () => {
    const v = Number(pctValue)
    if (Number.isNaN(v) || v < 0 || v > 100) { window.alert('النسبة بين 0 و100'); return }
    if (pctReason.trim().length < 3) { window.alert('سبب التعديل إلزامي'); return }
    try { await setPctM.mutateAsync({ pct: v, reason: pctReason.trim() }); setPct(null); setPctReason('') } catch { /* toast */ }
  }
  const doClear = async (e: RentedTaxEmployee) => {
    const reason = window.prompt(`إلغاء الاستثناء عن ${e.full_name} — يعود للنسبة العامة ${fmtPct(o?.pct)}.\nالسبب:`)
    if (!reason || reason.trim().length < 3) return
    try { await clearOv.mutateAsync({ employeeId: e.employee_id, reason: reason.trim() }) } catch { /* toast */ }
  }

  return (
    <div className="space-y-4" data-testid="deputy-rented-tax">
      <ExecPageHeader icon="truck" title="ضريبة الآليات المؤجرة" subtitle="استقطاع مستقل من راتب السائقين المرتبطين بآليات مؤجرة: نسبة من الإجمالي المستحق للشهر (الأيام المدفوعة فقط) — لا يتأثر بالغرامات أو السلف أو بقية الاستقطاعات. التعديل والإعفاء من هنا حصراً، ويسري على التصدير القادم"
        stats={[
          { label: 'النسبة العامة', value: fmtPct(o?.pct), tone: 'gold', testId: 'rt-pct' },
          { label: 'سائقون خاضعون', value: counts.auto + counts.custom, tone: 'plain', testId: 'rt-subject' },
          { label: 'معفون / نسبة خاصة', value: `${counts.exempt} / ${counts.custom}`, tone: 'green', testId: 'rt-exceptions' },
          { label: `ضريبة آخر كشف${o?.last_export_month ? ` (${o.last_export_month.slice(0, 7)})` : ''}`, value: fmtMoney(lastTaxTotal), tone: 'plain', testId: 'rt-last-total' },
        ]} />

      {q.isLoading || !o ? <LoadingSpinner /> : (
        <>
          <section className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="rt-stats">
            <StatCard title="آليات مؤجرة فعّالة" value={o.rented_vehicles} tone="slate" hint="من قاعدة آليات غرفة العمليات" testId="rt-k-vehicles" />
            <StatCard title="آليات مؤجرة بلا سائق مرتبط" value={o.rented_vehicles_without_driver} tone={o.rented_vehicles_without_driver ? 'amber' : 'emerald'} hint={o.rented_vehicles_without_driver ? 'لن تُحتسب ضريبة حتى تربط غرفة العمليات السائق' : 'كل الآليات المؤجرة مرتبطة بسائق'} testId="rt-k-nodriver" />
            <StatCard title="بالنسبة العامة" value={counts.auto} tone="sky" testId="rt-k-auto" />
            <StatCard title="آخر تعديل للنسبة" value={fmtDate(o.updated_at)} tone="violet" hint={o.updated_by ?? ''} testId="rt-k-updated" />
          </section>

          <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-amber-200 bg-amber-50/40 p-3 shadow-sm" data-testid="rt-pct-box">
            <div className="text-xs font-bold text-slate-800">النسبة العامة لكل السائقين المرتبطين بآليات مؤجرة</div>
            <label className="text-[11px] text-slate-600">النسبة ٪<input type="number" min={0} max={100} step={0.5} className={clsx(field, 'block w-24')} value={pctValue} onChange={(e) => setPct(e.target.value)} data-testid="rt-pct-input" /></label>
            <label className="min-w-[14rem] flex-1 text-[11px] text-slate-600">سبب التعديل<input className={clsx(field, 'block')} value={pctReason} onChange={(e) => setPctReason(e.target.value)} placeholder="إلزامي" data-testid="rt-pct-reason" /></label>
            <Button size="sm" onClick={() => void savePct()} disabled={pct == null || Number(pct) === o.pct} isLoading={setPctM.isPending} data-testid="rt-pct-save">حفظ النسبة</Button>
            <p className="basis-full text-[11px] text-slate-600">مثال: إجمالي مستحق 1,350,000 (27 يوماً مدفوعاً من 30) × {fmtPct(Number(pctValue))} = <b>{fmtMoney(round2(1350000 * Number(pctValue || 0) / 100))}</b> — أيام الغياب غير المدفوعة لا تدخل في الوعاء، والإجازات المدفوعة تدخل.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <input className={clsx(field, 'w-56')} placeholder="بحث: اسم، رقم، آلية، قسم" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="rt-search" />
            <div className="flex gap-1">{(['all', 'auto', 'custom', 'exempt'] as const).map((f) => <button key={f} type="button" onClick={() => setFilter(f)} className={clsx('rounded-lg px-2.5 py-1 text-[11px] font-black', filter === f ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600')} data-testid={`rt-filter-${f}`}>{f === 'all' ? `الكل (${emps.length})` : `${SOURCE[f].label} (${counts[f]})`}</button>)}</div>
            <div className="ms-auto flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setShowPreview((v) => !v)} disabled={!o.last_export_month} data-testid="rt-preview-toggle">معاينة آخر كشف بالنِّسَب الحالية</Button>
              <Button size="sm" variant="secondary" onClick={() => setShowAudit((v) => !v)} data-testid="rt-audit-toggle">سجل التعديلات</Button>
            </div>
          </div>

          {showPreview && (
            <section className="rounded-2xl border border-sky-200 bg-sky-50/30 p-3" data-testid="rt-preview">
              <h3 className="text-xs font-black text-sky-900">معاينة: كشف {o.last_export_month?.slice(0, 7)} — المخزَّن مقابل ما ستكون عليه الضريبة بالنِّسَب الحالية (تطبَّق فعلياً عند التصدير القادم / إعادة التصدير)</h3>
              {preview.isLoading ? <LoadingSpinner /> : !preview.data?.length ? <p className="mt-2 text-[11px] text-slate-500">لا سائقين خاضعين في هذا الكشف</p> : (
                <table className="mt-2 w-full text-[11px]"><thead><tr className="text-slate-500"><th className="text-start">الموظف</th><th>الإجمالي المستحق</th><th>المخزَّن</th><th>بالنِّسَب الحالية</th><th>الفرق</th></tr></thead>
                  <tbody>{preview.data.map((p) => { const d = round2(p.current_tax - p.stored_tax); return <tr key={p.employee_id} className="border-t border-sky-100 tabular-nums" data-testid={`rt-preview-${p.employee_number}`}><td className="py-1 font-bold">{p.full_name} <span className="text-slate-400">{p.employee_number}</span></td><td className="text-center">{fmtMoney(p.gross_amount)}</td><td className="text-center">{fmtMoney(p.stored_tax)} <span className="text-slate-400">({fmtPct(p.stored_pct)})</span></td><td className="text-center font-bold">{fmtMoney(p.current_tax)} <span className="text-slate-400">({fmtPct(p.current_pct)})</span></td><td className={clsx('text-center font-black', d > 0 ? 'text-rose-700' : d < 0 ? 'text-emerald-700' : 'text-slate-400')}>{d === 0 ? '—' : `${d > 0 ? '+' : ''}${fmtMoney(d)}`}</td></tr> })}</tbody></table>
              )}
            </section>
          )}

          {showAudit && (
            <section className="rounded-2xl border border-slate-200 bg-white p-3" data-testid="rt-audit">
              <h3 className="text-xs font-black">سجل التعديلات</h3>
              {audit.isLoading ? <LoadingSpinner /> : !audit.data?.length ? <p className="mt-2 text-[11px] text-slate-500">لا تعديلات بعد</p> : (
                <ul className="mt-2 divide-y divide-slate-100 text-[11px]">{audit.data.map((a) => <li key={a.id} className="flex flex-wrap items-center gap-2 py-1.5" data-testid="rt-audit-row">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-black">{ACTION[a.action]}</span>
                  {a.full_name && <span className="font-bold">{a.full_name}</span>}
                  <span className="text-slate-600">{a.action === 'pct' ? `${fmtPct(Number(a.before?.pct ?? 0))} ← ${fmtPct(Number(a.after?.pct ?? 0))}` : a.action === 'custom' ? fmtPct(Number(a.after?.pct ?? 0)) : a.action === 'exempt' ? (a.after?.valid_to ? `حتى ${String(a.after.valid_to)}` : 'بلا مدة') : ''}</span>
                  <span className="text-slate-500">— {a.reason}</span>
                  <span className="ms-auto text-slate-400">{a.actor_name ?? ''} · {a.created_at.slice(0, 16).replace('T', ' ')}</span>
                </li>)}</ul>
              )}
            </section>
          )}

          {emps.length === 0 ? <EmptyState title="لا سائقين مرتبطين بآليات مؤجرة" hint="تظهر الأسماء تلقائياً عندما تربط غرفة العمليات سائقاً بآلية «مؤجرة» في قاعدة الآليات" /> : (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid="rt-table">
              <div className="overflow-x-auto"><table className="w-full min-w-[56rem] text-xs">
                <thead className="bg-slate-50 text-[11px] text-slate-600"><tr><th className="px-3 py-2 text-start">السائق</th><th className="px-2 py-2 text-start">الآلية المؤجرة</th><th className="px-2 py-2">الحالة</th><th className="px-2 py-2">النسبة الفعّالة</th><th className="px-2 py-2">آخر كشف</th><th className="px-2 py-2 text-start">الاستثناء</th><th className="px-2 py-2">إجراء</th></tr></thead>
                <tbody>{shown.map((e) => (
                  <tr key={e.employee_id} className={clsx('border-t border-slate-100', !e.linked && 'bg-slate-50/60 text-slate-500')} data-testid={`rt-row-${e.employee_number}`}>
                    <td className="px-3 py-2"><div className="font-bold">{e.full_name}</div><div className="text-[10px] text-slate-500">{e.employee_number}{e.department_name ? ` · ${e.department_name}` : ''}{!e.has_salary && <span className="ms-1 rounded bg-amber-100 px-1 font-bold text-amber-800">بلا ملف راتب</span>}</div></td>
                    <td className="px-2 py-2 text-[11px]">{e.vehicles ?? <span className="text-slate-400">لم يعد مرتبطاً — الاستثناء محفوظ بلا أثر</span>}</td>
                    <td className="px-2 py-2 text-center"><span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-black', SOURCE[e.source].cls)} data-testid={`rt-source-${e.employee_number}`}>{SOURCE[e.source].label}</span></td>
                    <td className="px-2 py-2 text-center text-sm font-black tabular-nums" data-testid={`rt-rate-${e.employee_number}`}>{e.linked ? fmtPct(e.pct) : '—'}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-[11px]">{e.last_month ? <><b>{fmtMoney(e.last_tax)}</b> <span className="text-slate-400">({fmtPct(e.last_pct)} من {fmtMoney(e.last_gross)} · {e.last_month.slice(0, 7)})</span></> : <span className="text-slate-400">لم يُصدَّر بعد</span>}</td>
                    <td className="px-2 py-2 text-[11px]">{e.override ? <><span className="font-bold">{e.override.reason}</span><div className="text-[10px] text-slate-500">من {e.override.valid_from}{e.override.valid_to ? ` حتى ${e.override.valid_to}` : ' — بلا مدة'} · {e.override.by ?? ''}</div></> : <span className="text-slate-300">—</span>}</td>
                    <td className="px-2 py-2"><div className="flex justify-center gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setEditing(e)} data-testid={`rt-edit-${e.employee_number}`}>{e.override ? 'تعديل' : 'إعفاء / نسبة خاصة'}</Button>
                      {e.override && <Button size="sm" variant="secondary" onClick={() => void doClear(e)} isLoading={clearOv.isPending} data-testid={`rt-clear-${e.employee_number}`}>إلغاء</Button>}
                    </div></td>
                  </tr>
                ))}</tbody>
              </table></div>
              {!shown.length && <p className="p-4 text-center text-xs text-slate-500">لا نتائج</p>}
            </section>
          )}
          <p className="text-[11px] text-slate-500">ملاحظة: ربط السائق بالآلية ونوع ملكيتها (مملوكة/مؤجرة) من اختصاص غرفة العمليات في قاعدة بيانات الآليات؛ هذه الوحدة تحدد النسبة والاستثناءات فقط. الضريبة تظهر في كشف المالية وقسيمة الموظف كسطر مستقل، ولا تدخل في مراجعة الاستقطاعات الشهرية.</p>
        </>
      )}

      {editing && <OverrideDialog e={editing} globalPct={o?.pct ?? 3} busy={setOv.isPending} onClose={() => setEditing(null)}
        onSave={async (mode, p, reason, validTo) => { try { await setOv.mutateAsync({ employeeId: editing.employee_id, mode, pct: p, reason, validTo }); setEditing(null) } catch { /* toast */ } }} />}
    </div>
  )
}

function OverrideDialog({ e, globalPct, busy, onClose, onSave }: { e: RentedTaxEmployee; globalPct: number; busy: boolean; onClose: () => void; onSave: (mode: 'exempt' | 'custom', pct: number | null, reason: string, validTo: string | null) => Promise<void> }) {
  const [mode, setMode] = useState<'exempt' | 'custom'>(e.override?.mode ?? 'exempt')
  const [pct, setPct] = useState(String(e.override?.pct ?? globalPct))
  const [reason, setReason] = useState(e.override?.reason ?? '')
  const [validTo, setValidTo] = useState(e.override?.valid_to ?? '')
  const v = Number(pct)
  const bad = reason.trim().length < 3 || (mode === 'custom' && (Number.isNaN(v) || v < 0 || v > 100))
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3" role="dialog" aria-modal="true" data-testid="rt-dialog">
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-black">استثناء ضريبة الآلية المؤجرة — {e.full_name}</h2><button type="button" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-slate-100" onClick={onClose} aria-label="إغلاق" data-testid="rt-dialog-close"><Icon name="x" size={16} /></button></div>
        <p className="mb-3 text-[11px] text-slate-500">{e.vehicles ?? 'غير مرتبط بآلية مؤجرة حالياً'} · النسبة العامة {globalPct}٪</p>
        <div className="mb-3 flex gap-1 rounded-xl bg-slate-100 p-0.5">{(['exempt', 'custom'] as const).map((m) => <button key={m} type="button" onClick={() => setMode(m)} className={clsx('flex-1 rounded-lg px-2 py-1.5 text-[11px] font-black', mode === m ? 'bg-white text-slate-900 shadow' : 'text-slate-500')} data-testid={`rt-mode-${m}`}>{m === 'exempt' ? 'إعفاء كامل (0٪)' : 'نسبة خاصة'}</button>)}</div>
        {mode === 'custom' && <label className="mb-3 block text-[11px] text-slate-600">النسبة الخاصة ٪<input type="number" min={0} max={100} step={0.5} className={clsx(field, 'block w-28')} value={pct} onChange={(x) => setPct(x.target.value)} data-testid="rt-dialog-pct" /></label>}
        <label className="mb-3 block text-[11px] text-slate-600">السبب (إلزامي)<textarea className={clsx(field, 'block min-h-[4rem]')} value={reason} onChange={(x) => setReason(x.target.value)} data-testid="rt-dialog-reason" /></label>
        <label className="mb-3 block text-[11px] text-slate-600">ساري حتى (اختياري — بعده يعود للنسبة العامة تلقائياً)<input type="date" className={clsx(field, 'block w-44')} value={validTo} onChange={(x) => setValidTo(x.target.value)} data-testid="rt-dialog-valid-to" /></label>
        <div className="flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={onClose}>إلغاء</Button><Button size="sm" disabled={bad} isLoading={busy} onClick={() => void onSave(mode, mode === 'custom' ? v : null, reason.trim(), validTo || null)} data-testid="rt-dialog-save">حفظ</Button></div>
      </div>
    </div>
  )
}
