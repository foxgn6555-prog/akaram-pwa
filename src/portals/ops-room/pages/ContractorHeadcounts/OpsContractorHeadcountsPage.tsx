/**
 * غرفة العمليات — حضوريات العمال (00262)
 * الكشف الشهري بشكل كشف الشركة: صفوف = أيام الشهر، لكل متعهد ثلاثة أعمدة (قاطع · متعهد · متابعة)، مجاميع الشفت الصباحي/المسائي والكلي.
 * فلاتر: المصدر (الجميع/قاطع/متعهد/متابعة)، القاطع الأم، الشهر. تصحيح رقم بسبب إلزامي + تدقيق. اعتماد جهة واحدة للشهر تسري على كل المتعهدين وتقفله. تصدير Excel.
 * لا بيانات مالية هنا — المالية تحسب من الجهة المعتمدة.
 */
import { useMemo, useState } from 'react'
import { useCanCall } from '@features/permissions/my-permissions'
import { Download, Lock, Unlock } from 'lucide-react'
import { useApproveHeadcountMonth, useHeadcountCoverageGaps, useCorrectHeadcount, useHeadcountAudit, useHeadcountMonthStatus, useHeadcountSheet, useReopenHeadcountMonth } from '@features/ops-contractor-headcounts/hooks'
import { buildPivot, workersOf, type Pivot, type PivotContractor } from '@features/ops-contractor-headcounts/pivot'
import { COUNT_SOURCES, COUNT_SOURCE_AR, type CountSource } from '@sdk/ops-contractor-headcounts.sdk'
import { PARENT_AR, SHIFT_AR, dateAr } from '@features/contractors/format'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { useUiStore } from '@stores/ui.store'

const todayBaghdad = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date())
const SRC_TONE: Record<CountSource, string> = { sector_manager: 'bg-sky-50', contractor: 'bg-amber-50', follow_up: 'bg-emerald-50' }

export default function OpsContractorHeadcountsPage() {
  const [month, setMonth] = useState(todayBaghdad().slice(0, 7))
  const [parent, setParent] = useState<'' | 'karrada' | 'zaafaraniya'>('')
  const [source, setSource] = useState<CountSource | 'all'>('all')
  const [edit, setEdit] = useState<{ c: PivotContractor; date: string; source: CountSource; current: number | null } | null>(null)
  const [approveSrc, setApproveSrc] = useState<CountSource | ''>('')
  const [showAudit, setShowAudit] = useState(false)
  const sheet = useHeadcountSheet(month, parent || null)
  const status = useHeadcountMonthStatus(month)
  const audit = useHeadcountAudit(month)
  const approve = useApproveHeadcountMonth(), reopen = useReopenHeadcountMonth()
  const canApprove = useCanCall('ops_contractor_month_approve')
  const gaps = useHeadcountCoverageGaps(month, approveSrc)
  const gapCount = gaps.data?.length ?? 0
  const addToast = useUiStore((s) => s.addToast)
  const pivot = useMemo(() => buildPivot(sheet.data ?? [], source), [sheet.data, source])
  const st = status.data
  const locked = Boolean(st?.is_locked)
  const doApprove = () => {
    if (!approveSrc) return
    const gapMsg = gapCount > 0 ? `\nتحذير: ${gapCount} يوم/متعهد بلا رقم من هذه الجهة رغم وجود رقم من جهة أخرى — هذه الأيام لن تُدفع للمتعهد. الأفضل تصحيحها من الكشف أولاً.` : ''
    const msg = `سيُعتمد شهر ${month} على جهة «${COUNT_SOURCE_AR[approveSrc]}» لكل المتعهدين ويُقفل التسجيل والتصحيح.${st?.month_ended ? '' : '\nتنبيه: الشهر لم ينتهِ بعد.'}${gapMsg}\nمتابعة؟`
    if (!window.confirm(msg)) return
    if (gapCount > 0) approve.mutate({ month, source: approveSrc, force: true }); else approve.mutate({ month, source: approveSrc })
  }
  const doReopen = () => {
    const reason = window.prompt('سبب إعادة فتح الشهر (إلزامي)')?.trim()
    if (!reason) return
    reopen.mutate({ month, reason })
  }
  const exportExcel = async () => {
    try {
      const { exportHeadcountsExcel } = await import('@features/ops-contractor-headcounts/excel')
      await exportHeadcountsExcel(pivot, { month, parent: parent || null, approvedSource: st?.approved_source ?? null, locked })
      addToast({ type: 'success', message: 'صُدّر كشف حضوريات العمال إلى Excel' })
    } catch (e) { addToast({ type: 'error', message: e instanceof Error ? e.message : 'تعذّر التصدير' }) }
  }
  return (
    <div className="space-y-4" data-testid="ops-contractor-headcounts">
      <ExecPageHeader icon="users" title="حضوريات العمال"
        subtitle="الكشف الشهري لأعداد عمال المتعهدين من الجهات الثلاث (القاطع · المتعهد · المتابعة). كل عدد يشمل المتعهد نفسه. التصحيح هنا بسبب إلزامي ويُسجَّل في التدقيق. نهاية الشهر تُعتمد جهة واحدة تسري على كل المتعهدين ويُقفل الشهر؛ المالية تحسب الأجور من الجهة المعتمدة."
        stats={[
          { label: 'متعهدون', value: pivot.contractors.length, tone: 'plain', testId: 'st-contractors' },
          { label: 'مجموع القاطع', value: pivot.grand.sector_manager, tone: 'plain', testId: 'st-grand-sm' },
          { label: 'مجموع المتعهد', value: pivot.grand.contractor, tone: 'plain', testId: 'st-grand-c' },
          { label: 'مجموع المتابعة', value: pivot.grand.follow_up, tone: 'plain', testId: 'st-grand-fu' },
        ]}
        actions={<button type="button" onClick={() => void exportExcel()} className="inline-flex h-9 items-center gap-1 rounded-xl bg-white/15 px-3 text-xs font-black text-white ring-1 ring-white/30" data-testid="export-excel"><Download size={14} />تصدير Excel</button>} />

      <section className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-3 shadow-sm">
        <label className="text-xs font-bold text-slate-600">الشهر</label>
        <input type="month" value={month} max={todayBaghdad().slice(0, 7)} onChange={(e) => setMonth(e.target.value)} className="rounded-xl border px-3 py-2 text-sm" data-testid="month-filter" />
        <select value={parent} onChange={(e) => setParent(e.target.value as typeof parent)} className="rounded-xl border px-3 py-2 text-sm" data-testid="parent-filter">
          <option value="">كل القواطع</option><option value="karrada">قاطع الكرادة</option><option value="zaafaraniya">قاطع الزعفرانية</option>
        </select>
        <div className="flex gap-1" data-testid="source-filter">
          {(['all', ...COUNT_SOURCES] as const).map((s) => (
            <button key={s} type="button" onClick={() => setSource(s)} aria-pressed={source === s} className={`rounded-full px-3 py-1 text-xs font-bold ${source === s ? 'bg-[var(--portal-color)] text-white' : 'border bg-white text-slate-700'}`} data-testid={`source-${s}`}>{s === 'all' ? 'الجميع' : COUNT_SOURCE_AR[s]}</button>
          ))}
        </div>
      </section>

      {st && (
        <section className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3 ${locked ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`} data-testid="month-status">
          <div className="text-xs">
            {locked ? (
              <p className="font-black text-emerald-900"><Lock size={12} className="inline" /> الشهر معتمد ومقفل على جهة «{COUNT_SOURCE_AR[st.approved_source!]}» لكل المتعهدين · اعتمده {st.approved_by_name} في {dateAr(st.approved_at)}</p>
            ) : (
              <p className="font-black text-amber-900"><Unlock size={12} className="inline" /> الشهر مفتوح{st.approved ? ` (أُعيد فتحه: ${st.reopen_reason} · ${st.reopened_by_name})` : ''}{st.month_ended ? ' — انتهى الشهر ويمكن اعتماده' : ' — لم ينتهِ بعد'}</p>
            )}
            <p className="mt-1 text-slate-600">أيام مسجّلة: القاطع {st.days_with_sector_manager} · المتعهد {st.days_with_contractor} · المتابعة {st.days_with_follow_up}</p>
          </div>
          {locked ? (
            <button type="button" onClick={doReopen} disabled={reopen.isPending} className="h-10 rounded-xl border border-rose-300 bg-white px-4 text-xs font-black text-rose-700" data-testid="reopen-btn">إعادة فتح الشهر بسبب</button>
          ) : (
            <div className="flex items-center gap-2">
              <select value={approveSrc} onChange={(e) => setApproveSrc(e.target.value as CountSource | '')} className="h-10 rounded-xl border px-3 text-xs" data-testid="approve-source">
                <option value="">اختر الجهة المعتمدة…</option>
                {COUNT_SOURCES.map((s) => <option key={s} value={s}>{COUNT_SOURCE_AR[s]}</option>)}
              </select>
              <button type="button" onClick={doApprove} disabled={!approveSrc || approve.isPending || gaps.isLoading || !canApprove.allowed} title={canApprove.title} className={`h-10 rounded-xl px-4 text-xs font-black text-white disabled:opacity-40 ${gapCount > 0 ? 'bg-rose-700' : 'bg-emerald-700'}`} data-testid="approve-btn">{gapCount > 0 ? `اعتماد رغم ${gapCount} فجوة` : 'اعتماد الشهر وقفله'}</button>
            </div>
          )}
          {!locked && approveSrc && gapCount > 0 && (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs" data-testid="coverage-gaps">
              <p className="font-black text-rose-900">فجوات التغطية لجهة «{COUNT_SOURCE_AR[approveSrc]}»: {gapCount} يوم/متعهد بلا رقم منها رغم وجود رقم من جهة أخرى — لن تُدفع هذه الأيام إن اعتُمدت الجهة كما هي. صحّحها من الكشف (أي خلية، بسبب) أو اعتمد مع الإقرار.</p>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {gaps.data!.slice(0, 60).map((g) => (
                  <li key={`${g.contractor_user_id}-${g.log_date}`} className="rounded-lg bg-white px-2 py-1 ring-1 ring-rose-100" data-testid={`gap-${g.contractor_user_id}-${g.log_date}`}>
                    <b>{g.contractor_name}</b> · {g.log_date}{g.area_name ? ` · ${g.area_name}` : ''} — القاطع {g.sector_manager_count ?? '—'} · المتعهد {g.contractor_count ?? '—'} · المتابعة {g.follow_up_count ?? '—'}
                  </li>
                ))}
              </ul>
              {gapCount > 60 && <p className="mt-1 text-rose-800">… و{gapCount - 60} أخرى</p>}
            </div>
          )}
        </section>
      )}

      {sheet.isLoading ? <LoadingSpinner /> : pivot.contractors.length === 0 ? <EmptyState title="لا متعهدين في هذا الشهر" hint="لا متعهدين فعّالين ولا أعداد مسجّلة بهذا الفلتر" /> : (
        <SheetTable pivot={pivot} locked={locked} onEdit={(c, date, s, current) => setEdit({ c, date, source: s, current })} />
      )}

      <section className="rounded-2xl border bg-white p-3 shadow-sm">
        <button type="button" onClick={() => setShowAudit((v) => !v)} className="text-xs font-black text-[var(--portal-color)] underline" data-testid="audit-toggle">سجل التدقيق للشهر ({audit.data?.length ?? 0})</button>
        {showAudit && (
          <ul className="mt-2 space-y-1 text-[11px]" data-testid="audit-list">
            {(audit.data ?? []).map((a) => (
              <li key={a.id} className="rounded-lg border p-2">
                <b>{a.actor_name}</b> · {a.action === 'month_approve' ? `اعتمد الشهر على «${COUNT_SOURCE_AR[(a.after_data?.approved_source as CountSource) ?? 'contractor']}»` : a.action === 'month_reopen' ? 'أعاد فتح الشهر' : `صحّح عدد ${COUNT_SOURCE_AR[a.action.replace('ops_correct_', '') as CountSource]} لـ ${a.contractor_name} يوم ${a.log_date}: ${String(a.before_data?.headcount ?? '—')} ← ${String(a.after_data?.headcount ?? '—')}`}
                {a.reason ? ` · السبب: ${a.reason}` : ''} · <span className="text-slate-500">{dateAr(a.created_at)}</span>
              </li>
            ))}
            {!audit.data?.length && <li className="text-slate-400">لا حركات.</li>}
          </ul>
        )}
      </section>

      {edit && <CorrectDialog edit={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function SheetTable({ pivot, locked, onEdit }: { pivot: Pivot; locked: boolean; onEdit: (c: PivotContractor, date: string, s: CountSource, current: number | null) => void }) {
  const span = pivot.sources.length
  const hasMorning = pivot.contractors.some((c) => c.shift === 'morning'), hasEvening = pivot.contractors.some((c) => c.shift === 'evening')
  return (
    <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm" data-testid="sheet-wrap">
      <table className="min-w-max text-[11px]" data-testid="sheet">
        <thead>
          <tr className="bg-slate-800 text-white">
            <th rowSpan={2} className="sticky right-0 z-10 bg-slate-800 px-2 py-1">التاريخ</th>
            {pivot.contractors.map((c) => (
              <th key={c.id} colSpan={span} className="border-r border-slate-600 px-2 py-1 text-center" data-testid={`head-${c.id}`}>
                <div className="font-black">{c.name}{!c.isActive && <span className="ms-1 text-[9px] text-amber-300">(غير فعّال)</span>}</div>
                <div className="text-[9px] font-normal text-slate-300">{c.area} · {PARENT_AR[c.parent]} · {c.shift ? SHIFT_AR[c.shift] ?? c.shift : '—'}</div>
              </th>
            ))}
            {hasMorning && <th colSpan={span} className="border-r border-slate-600 px-2 py-1 text-center">مجموع الصباحي</th>}
            {hasEvening && <th colSpan={span} className="border-r border-slate-600 px-2 py-1 text-center">مجموع المسائي</th>}
            <th colSpan={span} className="px-2 py-1 text-center">المجموع الكلي</th>
          </tr>
          <tr className="bg-slate-100 text-slate-700">
            {pivot.contractors.map((c) => pivot.sources.map((s) => <th key={`${c.id}-${s}`} className={`px-2 py-1 text-center font-bold ${SRC_TONE[s]}`}>{COUNT_SOURCE_AR[s]}</th>))}
            {hasMorning && pivot.sources.map((s) => <th key={`m-${s}`} className={`px-2 py-1 text-center font-bold ${SRC_TONE[s]}`}>{COUNT_SOURCE_AR[s]}</th>)}
            {hasEvening && pivot.sources.map((s) => <th key={`e-${s}`} className={`px-2 py-1 text-center font-bold ${SRC_TONE[s]}`}>{COUNT_SOURCE_AR[s]}</th>)}
            {pivot.sources.map((s) => <th key={`t-${s}`} className={`px-2 py-1 text-center font-bold ${SRC_TONE[s]}`}>{COUNT_SOURCE_AR[s]}</th>)}
          </tr>
        </thead>
        <tbody>
          {pivot.days.map((d) => (
            <tr key={d.date} className="border-t" data-testid={`row-${d.date}`}>
              <td className="sticky right-0 z-10 bg-white px-2 py-1 font-black">{d.date}</td>
              {pivot.contractors.map((c) => pivot.sources.map((s) => {
                const cell = d.cells[c.id]?.[s]
                const v = cell?.value ?? null
                return (
                  <td key={`${c.id}-${s}`} className={`px-1 py-0.5 text-center ${SRC_TONE[s]}`}>
                    <button type="button" disabled={locked} onClick={() => onEdit(c, d.date, s, v)} title={cell?.reason ? `صُحّح: ${cell.reason}` : locked ? 'الشهر مقفل' : 'تصحيح بسبب'}
                      className={`min-w-8 rounded px-1 font-black ${v == null ? 'text-slate-300' : ''} ${cell?.reason ? 'underline decoration-rose-500 decoration-2' : ''} disabled:cursor-not-allowed`} data-testid={`cell-${c.id}-${d.date}-${s}`}>
                      {v ?? '—'}
                    </button>
                  </td>
                )
              }))}
              {hasMorning && pivot.sources.map((s) => <td key={`m-${s}`} className="px-2 py-1 text-center font-black" data-testid={`morning-${d.date}-${s}`}>{d.shiftTotals.morning[s]}</td>)}
              {hasEvening && pivot.sources.map((s) => <td key={`e-${s}`} className="px-2 py-1 text-center font-black" data-testid={`evening-${d.date}-${s}`}>{d.shiftTotals.evening[s]}</td>)}
              {pivot.sources.map((s) => <td key={`t-${s}`} className="px-2 py-1 text-center font-black" data-testid={`total-${d.date}-${s}`}>{d.total[s]}</td>)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 bg-slate-100 font-black">
            <td className="sticky right-0 z-10 bg-slate-100 px-2 py-1">المجموع</td>
            {pivot.contractors.map((c) => pivot.sources.map((s) => <td key={`${c.id}-${s}`} className="px-2 py-1 text-center" data-testid={`ctotal-${c.id}-${s}`}>{pivot.contractorTotals[c.id]?.[s] ?? 0}</td>))}
            {hasMorning && pivot.sources.map((s) => <td key={`m-${s}`} className="px-2 py-1 text-center">{pivot.days.reduce((a, d) => a + d.shiftTotals.morning[s], 0)}</td>)}
            {hasEvening && pivot.sources.map((s) => <td key={`e-${s}`} className="px-2 py-1 text-center">{pivot.days.reduce((a, d) => a + d.shiftTotals.evening[s], 0)}</td>)}
            {pivot.sources.map((s) => <td key={`t-${s}`} className="px-2 py-1 text-center" data-testid={`grand-${s}`}>{pivot.grand[s]}</td>)}
          </tr>
          <tr className="bg-slate-50 text-[10px] text-slate-600">
            <td className="sticky right-0 z-10 bg-slate-50 px-2 py-1">عمال (العدد − 1 لكل يوم مسجّل)</td>
            {pivot.contractors.map((c) => pivot.sources.map((s) => {
              const w = pivot.days.reduce((a, d) => a + (workersOf(d.cells[c.id]?.[s]?.value ?? null) ?? 0), 0)
              return <td key={`${c.id}-${s}`} className="px-2 py-1 text-center" data-testid={`cworkers-${c.id}-${s}`}>{w}</td>
            }))}
            {hasMorning && pivot.sources.map((s) => <td key={`m-${s}`} />)}
            {hasEvening && pivot.sources.map((s) => <td key={`e-${s}`} />)}
            {pivot.sources.map((s) => <td key={`t-${s}`} />)}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function CorrectDialog({ edit, onClose }: { edit: { c: PivotContractor; date: string; source: CountSource; current: number | null }; onClose: () => void }) {
  const correct = useCorrectHeadcount()
  const [val, setVal] = useState(edit.current != null ? String(edit.current) : '')
  const [reason, setReason] = useState('')
  const n = Number(val)
  const valid = val !== '' && Number.isInteger(n) && n >= 0 && n <= 1000 && reason.trim().length >= 3
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="تصحيح عدد" data-testid="correct-dialog">
      <div className="w-full max-w-md rounded-3xl bg-white p-4 shadow-xl">
        <h3 className="font-black">تصحيح عدد {COUNT_SOURCE_AR[edit.source]}</h3>
        <p className="mt-1 text-xs text-slate-600">{edit.c.name} · {edit.c.area} · يوم {edit.date} · الحالي: <b>{edit.current ?? '—'}</b></p>
        <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); if (valid) correct.mutate({ contractorUserId: edit.c.id, date: edit.date, source: edit.source, headcount: n, reason: reason.trim() }, { onSuccess: onClose }) }}>
          <input type="number" inputMode="numeric" min={0} max={1000} value={val} onChange={(e) => setVal(e.target.value)} placeholder="العدد الصحيح (يشمل المتعهد؛ 0 = لا عمل)" className="h-10 w-full rounded-xl border px-3 text-sm" data-testid="correct-value" />
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سبب التصحيح (إلزامي — يُسجَّل في التدقيق ويُبلَّغ صاحب الرقم)" rows={2} className="w-full rounded-xl border px-3 py-2 text-sm" data-testid="correct-reason" />
          <div className="grid grid-cols-2 gap-2">
            <button type="submit" disabled={!valid || correct.isPending} className="h-10 rounded-xl bg-[var(--portal-color)] text-sm font-black text-white disabled:opacity-40" data-testid="correct-save">حفظ التصحيح</button>
            <button type="button" onClick={onClose} className="h-10 rounded-xl border text-sm font-black">إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  )
}
