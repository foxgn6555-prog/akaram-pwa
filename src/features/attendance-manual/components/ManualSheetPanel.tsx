/**
 * كشف الحضور اليدوي ليوم (الحسابات المخوّلة صراحةً على التفعيل أو غرفة العمليات):
 *   شريط الأيام (المنجز/المعلّق) → قائمة موظفي النطاق بحسب الهيكل التنظيمي → «حاضر / غائب» لكل موظف → حفظ يطبَّق فوراً.
 *   · لا حالة افتراضية: كل موظف يُسجَّل له صراحةً، والمتبقّون يبقون «بانتظار الكشف» (لا غياب ولا استقطاع).
 *   · تعديل مُدخَل محفوظ يحتاج سبباً، والإجازة/الراحة/حسابك/تعديل آخر مقفلة بسببها.
 *   · التعديلات غير المحفوظة تبقى عند التحديث الخلفي، ويُحذَّر قبل مغادرة اليوم بها.
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { Overlay } from '@features/attendance-edits/components/AttendanceEditShared'
import {
  MANUAL_ENTRY_LABELS, MANUAL_LOCK_LABELS, MANUAL_STATE_LABELS, attendanceManualErrorMessage, fmtManualDate, fmtManualDay, fmtManualTime,
  useManualSheet, useManualSheetSave, type ManualEntryStatus, type ManualSheetEmployee,
} from '@features/attendance-manual'
import { Banner, MiniStat, fieldCls } from './shared'

type RowFilter = 'all' | 'pending' | 'present' | 'absent' | 'locked'
const FILTERS: ReadonlyArray<readonly [RowFilter, string]> = [['all', 'الكل'], ['pending', 'بانتظار'], ['present', 'حاضر'], ['absent', 'غائب'], ['locked', 'مقفل']]
const NAME_PREVIEW = 10
const canRecordRow = (r: ManualSheetEmployee): boolean => r.state === 'open' && r.has_shift

export function ManualSheetPanel({ activationId }: { activationId: string }) {
  const [date, setDate] = useState<string | null>(null)
  const [draft, setDraft] = useState<Readonly<Record<string, ManualEntryStatus>>>({})
  const [note, setNote] = useState('')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<RowFilter>('all')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const query = useManualSheet(activationId, date)
  const save = useManualSheetSave()
  const sheet = query.data

  const rows = useMemo(() => sheet?.employees ?? [], [sheet])
  const canReview = sheet?.can_review === true
  const isReviewable = (r: ManualSheetEmployee): boolean => canReview && r.state === 'other' && r.source === 'manual'
  const statusOf = (r: ManualSheetEmployee): ManualEntryStatus | null => draft[r.id] ?? (isReviewable(r) ? null : r.entry)
  const openRows = rows.filter(canRecordRow)
  const reviewRows = rows.filter((r) => r.state === 'other')
  const editableRows = rows.filter((r) => canRecordRow(r) || isReviewable(r))
  const dirtyRows = editableRows.filter((r) => draft[r.id] !== undefined)
  const editedRows = dirtyRows.filter((r) => r.entry !== null || r.state === 'other')
  const needsNote = editedRows.length > 0
  const noteOk = !needsNote || note.trim().length >= 3
  const counts = {
    open: openRows.length,
    present: editableRows.filter((r) => statusOf(r) === 'present').length,
    absent: editableRows.filter((r) => statusOf(r) === 'absent').length,
    pending: openRows.filter((r) => statusOf(r) === null).length + reviewRows.filter((r) => draft[r.id] === undefined).length,
  }
  const locked = !!sheet?.lock
  // أثناء الانتقال بين الأيام تُعرض بيانات اليوم السابق مؤقتاً: لا تحديد ولا حفظ حتى يصل اليوم الجديد (كي لا يُنسب اختيار ليوم آخر)
  const stale = query.isPlaceholderData
  const canEdit = !!sheet?.date && !locked && !stale

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (needle && !`${r.name} ${r.number}`.toLowerCase().includes(needle)) return false
      const reviewable = canReview && r.state === 'other' && r.source === 'manual'
      const editable = canRecordRow(r) || reviewable
      const st = editable ? (draft[r.id] ?? (reviewable ? null : r.entry)) : null
      if (filter === 'pending') return editable && st === null
      if (filter === 'present') return editable && st === 'present'
      if (filter === 'absent') return editable && st === 'absent'
      if (filter === 'locked') return !editable
      return true
    })
  }, [rows, draft, q, filter, canReview])
  const remainingVisible = visible.filter((r) => canRecordRow(r) && statusOf(r) === null)

  const pick = (r: ManualSheetEmployee, status: ManualEntryStatus) => {
    const reviewable = isReviewable(r)
    if (!canEdit || (!canRecordRow(r) && !reviewable)) return
    setDraft((d) => {
      const n = { ...d }
      // إدخال المُراجع ليس مرجعاً صالحاً لحسم التعارض؛ لا بد من اختيار صريح مع سبب.
      // للصف العادي: العودة إلى المحفوظ أو النقر على الاختيار الجديد نفسه يلغي المسودة.
      if (!reviewable && (status === r.entry || (n[r.id] === status && r.entry === null))) delete n[r.id]
      else if (reviewable && n[r.id] === status) delete n[r.id]
      else n[r.id] = status
      return n
    })
  }
  const markRemaining = (status: ManualEntryStatus) => {
    if (!canEdit) return
    setDraft((d) => { const n = { ...d }; for (const r of remainingVisible) n[r.id] = status; return n })
  }
  const resetDraft = () => { setDraft({}); setNote('') }
  const dirtyCount = dirtyRows.length
  const selectDate = (d: string) => {
    if (d === sheet?.date) return
    if (dirtyCount > 0 && !window.confirm('لديك تغييرات غير محفوظة في كشف هذا اليوم — الانتقال إلى يوم آخر يتجاهلها. متابعة؟')) return
    resetDraft(); setDate(d)
  }

  const doSave = () => {
    if (!sheet?.date || dirtyRows.length === 0 || !noteOk) return
    save.mutate(
      { activation: activationId, date: sheet.date, entries: dirtyRows.map((r) => ({ employee_id: r.id, status: draft[r.id]! })), note: note.trim() || null },
      { onSuccess: () => { resetDraft(); setConfirmOpen(false) }, onError: () => setConfirmOpen(false) },
    )
  }

  if (query.isLoading && !sheet) return <LoadingSpinner />
  if (query.isError && !sheet) {
    return <Banner tone="rose" role="alert" testId="mam-error" action={<Button size="sm" variant="secondary" onClick={() => void query.refetch()}>إعادة المحاولة</Button>}>{attendanceManualErrorMessage(query.error)}</Banner>
  }
  if (!sheet) return null

  const a = sheet.activation
  const absentNames = dirtyRows.filter((r) => draft[r.id] === 'absent').map((r) => r.name)
  const presentDirty = dirtyRows.filter((r) => draft[r.id] === 'present').length

  return (
    <div className={clsx('space-y-4', stale && 'opacity-70 transition-opacity')} data-testid="mam-panel" aria-busy={stale}>
      {a.status === 'active' ? (
        <Banner tone="sky" testId="mam-active-banner">
          البصمة موقوفة منطقياً لـ <b>{a.scope_label}</b> منذ {fmtManualDate(a.starts_on)} — الكشف هو المصدر الوحيد لحضور موظفي هذا النطاق. اليوم بلا كشف يبقى «بانتظار الكشف» (لا غياب ولا استقطاع) ويمنع اعتماد حضورية الشهر.
        </Banner>
      ) : (
        <Banner tone="amber" testId="mam-ended-banner">
          انتهى التفعيل في {fmtManualDate(a.ends_on)} وعادت البصمة — بقيت أيام بانتظار الكشف، أكملها ليمكن اعتماد الشهر.
        </Banner>
      )}

      {reviewRows.length > 0 && (
        <Banner tone="amber" role="alert" testId="mam-review-banner">
          يوجد {reviewRows.length} سجل حضور يدوي غير مطابق لإدخال كشف الحضور. يبقى هذا التعارض مانعاً لاعتماد حضورية الشهر، ولا يُستبدل تلقائياً.
          {canReview
            ? ' راجعه بتحديد حاضر أو غائب مع كتابة سبب المراجعة؛ إذا كان الشهر مقفلاً فأعد فتحه أولاً.'
            : ' تواصل مع مسؤول مخوّل في غرفة العمليات أو الموارد البشرية لمراجعته.'}
        </Banner>
      )}

      {sheet.days.length > 0 ? (
        <nav className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]" aria-label="أيام الكشف" data-testid="mam-days">
          {sheet.days.map((d) => {
            const done = d.total > 0 && d.pending === 0
            const sel = d.date === sheet.date
            return (
              <button key={d.date} type="button" onClick={() => selectDate(d.date)} aria-pressed={sel} aria-current={sel ? 'date' : undefined} data-testid={`mam-day-${d.date}`}
                className={clsx('min-h-12 shrink-0 rounded-xl border px-3 py-1.5 text-center text-xs transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                  sel ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-slate-200 bg-white hover:bg-slate-50')}>
                <span className="block font-black tabular-nums text-slate-800">{fmtManualDay(d.date)}{d.date === sheet.today && <span className="ms-1 text-[10px] font-bold text-brand-700">اليوم</span>}</span>
                <span className={clsx('block text-[10px] font-bold tabular-nums', d.total === 0 ? 'text-slate-400' : done ? 'text-emerald-700' : 'text-amber-700')}>
                  {d.total === 0 ? 'لا مطلوب' : done ? `✓ اكتمل (${d.total})` : `${d.pending} بانتظار`}
                </span>
              </button>
            )
          })}
        </nav>
      ) : null}
      {sheet.from > a.starts_on && <p className="text-[11px] text-slate-500" data-testid="mam-window-hint">الأيام الأقدم من {fmtManualDate(sheet.from)} تُسجَّل عبر غرفة العمليات.</p>}

      {locked && <Banner tone="rose" role="alert" testId="mam-lock">{MANUAL_LOCK_LABELS[sheet.lock!]}</Banner>}

      {!sheet.date ? (
        <Banner tone="amber" testId="mam-no-window">لا يوجد يوم ضمن نافذة تسجيلك لهذا التفعيل. إن بقيت أيام بانتظار الكشف فتواصل مع غرفة العمليات لإكمالها.</Banner>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="mam-stats">
            <MiniStat title="المطلوب تسجيلهم" value={counts.open} testId="mam-stat-open" />
            <MiniStat title="حاضر" value={counts.present} tone="emerald" testId="mam-stat-present" />
            <MiniStat title="غائب" value={counts.absent} tone="rose" testId="mam-stat-absent" />
            <MiniStat title="بانتظار الكشف" value={counts.pending} tone={counts.pending > 0 ? 'amber' : 'slate'} testId="mam-stat-pending" />
          </div>

          <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <input className={clsx(fieldCls, 'max-w-xs flex-1')} value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم أو الرقم الوظيفي…" aria-label="بحث في موظفي الكشف" data-testid="mam-search" />
              <div className="flex flex-wrap gap-1 text-[11px]" role="group" aria-label="تصفية الكشف">
                {FILTERS.map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k} data-testid={`mam-filter-${k}`}
                    className={clsx('min-h-9 rounded-lg px-3 font-bold ring-1 transition', filter === k ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')}>{l}</button>
                ))}
              </div>
            </div>
            {canEdit && (
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 text-xs">
                <span className="text-slate-500">للمتبقّين بلا تسجيل ({remainingVisible.length}):</span>
                <Button size="sm" variant="secondary" disabled={remainingVisible.length === 0} onClick={() => markRemaining('present')} data-testid="mam-all-present">كلهم حاضرون</Button>
                <Button size="sm" variant="secondary" disabled={remainingVisible.length === 0} onClick={() => markRemaining('absent')} data-testid="mam-all-absent">كلهم غائبون</Button>
                {dirtyCount > 0 && <button type="button" className="text-red-600 underline" onClick={resetDraft} data-testid="mam-reset">تراجع عن غير المحفوظ</button>}
              </div>
            )}
          </div>

          {rows.length === 0 ? (
            <Banner tone="slate" testId="mam-empty">لا موظفين مطلوب تسجيلهم في هذا اليوم ضمن هذا النطاق.</Banner>
          ) : (
            <ul className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid="mam-rows">
              {visible.length === 0 && <li className="p-4 text-center text-xs text-slate-500">لا نتائج مطابقة.</li>}
              {visible.map((r) => {
                const reviewable = isReviewable(r)
                return <EmployeeRow key={r.id} r={r} status={statusOf(r)} changed={draft[r.id] !== undefined} editable={canEdit && (r.state === 'open' || reviewable)} reviewable={reviewable} onPick={pick} />
              })}
            </ul>
          )}

          {(sheet.excluded.no_pin > 0 || sheet.excluded.contractors > 0) && (
            <p className="text-[11px] leading-relaxed text-slate-500" data-testid="mam-excluded">
              خارج الكشف في هذا النطاق:{sheet.excluded.no_pin > 0 && <> {sheet.excluded.no_pin} بلا رقم بصمة مسجّل (لا يدخلون الحضور أصلاً)</>}{sheet.excluded.no_pin > 0 && sheet.excluded.contractors > 0 && ' ·'}{sheet.excluded.contractors > 0 && <> {sheet.excluded.contractors} متعهد (يُدفع من الأعداد التي يرسلها)</>}.
            </p>
          )}

          {canEdit && (
            <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 space-y-2 rounded-2xl border border-brand-200 bg-white/95 p-3 shadow-lg backdrop-blur lg:bottom-2" data-testid="mam-savebar">
              {needsNote && (
                <label className="block text-xs font-bold text-slate-700">سبب مراجعة/تعديل {editedRows.length} سجل (إلزامي)
                  <textarea className="mt-1 min-h-[64px] w-full rounded-xl border border-slate-300 p-2 text-sm font-normal" value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: صُحّح بعد مراجعة الموظف" aria-required="true" data-testid="mam-note" />
                </label>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-600" data-testid="mam-dirty">{dirtyCount > 0 ? <>تغييرات غير محفوظة: <b className="tabular-nums">{dirtyCount}</b></> : 'لا تغييرات غير محفوظة'}{counts.pending > 0 && <> · متبقٍ <b className="tabular-nums text-amber-700">{counts.pending}</b> بلا تسجيل</>}</p>
                <Button size="sm" disabled={dirtyCount === 0 || !noteOk || save.isPending} isLoading={save.isPending} onClick={() => setConfirmOpen(true)} data-testid="mam-save">حفظ الكشف</Button>
              </div>
            </div>
          )}
        </>
      )}

      {confirmOpen && (
        <Overlay title={`تأكيد حفظ كشف ${fmtManualDate(sheet.date)}`} onClose={() => setConfirmOpen(false)} testId="mam-confirm">
          <div className="space-y-3 text-xs">
            <p className="leading-relaxed text-slate-600">يُطبَّق الكشف فوراً على حضور هؤلاء الموظفين واستقطاعاتهم، ويُسجَّل باسمك في سجل التدقيق.</p>
            <div className="grid grid-cols-2 gap-2">
              <MiniStat title="حاضر" value={presentDirty} tone="emerald" testId="mam-confirm-present" />
              <MiniStat title="غائب" value={absentNames.length} tone="rose" testId="mam-confirm-absent" />
            </div>
            {absentNames.length > 0 && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 p-2 leading-relaxed text-rose-900" data-testid="mam-confirm-names">
                الغائبون: {absentNames.slice(0, NAME_PREVIEW).join('، ')}{absentNames.length > NAME_PREVIEW ? ` و${absentNames.length - NAME_PREVIEW} آخرين` : ''}
              </p>
            )}
            {counts.pending > 0 && <p className="text-amber-800">توجد {counts.pending} حالة بانتظار إدخال الكشف أو مراجعة سجل يدوي؛ لن يُعتمد الشهر حتى تُحلّ.</p>}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setConfirmOpen(false)} disabled={save.isPending}>رجوع للمراجعة</Button>
              <Button size="sm" isLoading={save.isPending} disabled={save.isPending} onClick={doSave} data-testid="mam-confirm-save">تأكيد الحفظ</Button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  )
}

function EmployeeRow({ r, status, changed, editable, reviewable, onPick }: { r: ManualSheetEmployee; status: ManualEntryStatus | null; changed: boolean; editable: boolean; reviewable: boolean; onPick: (r: ManualSheetEmployee, s: ManualEntryStatus) => void }) {
  const open = r.state === 'open' && r.has_shift
  const noShift = r.state === 'no_shift' || (r.state === 'open' && !r.has_shift)
  const actionable = open || reviewable
  const lockedLabel = noShift ? MANUAL_STATE_LABELS.no_shift : MANUAL_STATE_LABELS[r.state as Exclude<typeof r.state, 'open'>]
  const sub = [r.job_title, r.department].filter(Boolean).join(' · ')
  return (
    <li className={clsx('flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2.5 last:border-0', changed && 'bg-amber-50/60', !open && 'bg-slate-50/60')} data-testid={`mam-row-${r.id}`} data-state={r.state} data-status={status ?? 'none'}>
      <div className="min-w-0 flex-1 basis-48">
        <p className="truncate text-sm font-bold text-slate-900">{r.name} <span className="text-[11px] font-normal text-slate-500">#{r.number}</span></p>
        {sub && <p className="truncate text-[11px] text-slate-500">{sub}</p>}
        {open && r.entry && !changed && (
          <p className="text-[11px] text-slate-500" data-testid={`mam-meta-${r.id}`}>سُجّل «{MANUAL_ENTRY_LABELS[r.entry]}»{r.by ? ` بواسطة ${r.by}` : ''}{r.at ? ` · ${fmtManualTime(r.at)}` : ''}{r.note ? ` — ${r.note}` : ''}</p>
        )}
        {open && r.entry && changed && status && <p className="text-[11px] font-bold text-amber-700" data-testid={`mam-change-${r.id}`}>سيُعدَّل من «{MANUAL_ENTRY_LABELS[r.entry]}» إلى «{MANUAL_ENTRY_LABELS[status]}»</p>}
        {noShift && <p className="text-[11px] font-bold text-amber-800" data-testid={`mam-no-shift-${r.id}`}>لا يمكن تسجيل الحضور لهذا الموظف؛ أَسنِد له شفتاً أولاً.</p>}
        {reviewable && <p className="text-[11px] font-bold text-amber-800" data-testid={`mam-review-${r.id}`}>يوجد سجل حضور يدوي بلا إدخال كشف مطابق. اختر الحالة بعد المراجعة واكتب السبب.</p>}
        {r.punches > 0 && <p className="text-[11px] text-slate-400" data-testid={`mam-punches-${r.id}`}>بصمات واردة من الجهاز (للاطلاع فقط): {r.punches} · {fmtManualTime(r.first_punch)}–{fmtManualTime(r.last_punch)}</p>}
      </div>
      {actionable ? (
        <div className="flex shrink-0 gap-1.5" role="group" aria-label={`${reviewable ? 'مراجعة حضور' : 'حضور'} ${r.name}`}>
          <button type="button" disabled={!editable} onClick={() => onPick(r, 'present')} aria-pressed={status === 'present'} data-testid={`mam-present-${r.id}`}
            className={clsx('min-h-10 min-w-[84px] rounded-xl px-4 text-sm font-black ring-1 transition disabled:cursor-not-allowed disabled:opacity-60', status === 'present' ? 'bg-emerald-600 text-white ring-emerald-600' : 'bg-white text-slate-600 ring-slate-300 hover:bg-emerald-50')}>حاضر</button>
          <button type="button" disabled={!editable} onClick={() => onPick(r, 'absent')} aria-pressed={status === 'absent'} data-testid={`mam-absent-${r.id}`}
            className={clsx('min-h-10 min-w-[84px] rounded-xl px-4 text-sm font-black ring-1 transition disabled:cursor-not-allowed disabled:opacity-60', status === 'absent' ? 'bg-red-600 text-white ring-red-600' : 'bg-white text-slate-600 ring-slate-300 hover:bg-red-50')}>غائب</button>
        </div>
      ) : (
        <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600" data-testid={`mam-locked-${r.id}`}>{lockedLabel}</span>
      )}
    </li>
  )
}
