import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { biometric } from '@sdk/biometric.sdk'
import type { ArchivePunchCursor, UnmatchedUnitDay, UnmatchedUnitPerson } from '@features/integrations/types'
import { archiveDirection, archiveLocalTime } from '@features/integrations/lib/unmatchedArchiveExcel'
import { UNIT_STATUS, unitLocalTime, unitShownTimes } from '@features/integrations/lib/unmatchedUnitExcel'

const field = 'mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm'
const button = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40'
const PAGE = 50
const editable = ['present', 'missing', 'absent', 'leave'] as const
type EditableStatus = typeof editable[number]
function errorMessage(e: unknown) {
  const s = e instanceof Error ? e.message : ''
  if (s.includes('BIO_EDIT_CONFLICT')) return 'تغيّرت البيانات منذ فتحها. أغلق التفاصيل وافتحها مجدداً ثم أعد المحاولة.'
  if (s.includes('BIO_FORBIDDEN')) return 'لا تملك صلاحية التعديل أو تم سحبها.'
  if (s.includes('BIO_ABSENCE_NOT_PAST')) return 'يمكن تسجيل الغياب للأيام الماضية فقط.'
  if (s.includes('BIO_EDIT_NEEDS_REVIEW')) return 'المدة تتجاوز 16 ساعة؛ لا يمكن حفظ حضور ليلي بهذه المدة.'
  if (s.includes('BIO_EDIT_TIMES_REQUIRED')) return 'حالة حاضر تتطلب وقت الدخول والخروج.'
  if (s.includes('BIO_EDIT_TIMES_INVALID')) return 'تحقق من الأوقات وحدد إن كان الخروج في اليوم التالي.'
  return 'تعذر حفظ التعديل. تحقق من البيانات وحاول مجدداً.'
}
function summary(v: Record<string, unknown> | null): string {
  if (!v) return 'الأصل كما هو'
  const entries = [v.display_name ? `الاسم: ${String(v.display_name)}` : '', v.status ? `الحالة: ${UNIT_STATUS[v.status as keyof typeof UNIT_STATUS] ?? String(v.status)}` : '', v.entry_time ? `الدخول: ${String(v.entry_time)}` : '', v.exit_time ? `الخروج: ${String(v.exit_time)}${v.exit_next_day ? ' (اليوم التالي)' : ''}` : ''].filter(Boolean)
  return entries.join(' · ') || '—'
}
export default function UnmatchedUnitPersonPanel({ person, day, canEdit, onBack }: { person: UnmatchedUnitPerson; day: UnmatchedUnitDay; canEdit: boolean; onBack: () => void }) {
  const qc = useQueryClient()
  const [allPunches, setAllPunches] = useState(false)
  const [cursorStack, setCursorStack] = useState<Array<ArchivePunchCursor | null>>([null])
  const [historyCursors, setHistoryCursors] = useState<Array<number | null>>([null])
  const [name, setName] = useState(person.person_name ?? '')
  const [status, setStatus] = useState<EditableStatus | ''>(editable.includes(day.status as EditableStatus) ? day.status as EditableStatus : '')
  const [entry, setEntry] = useState(day.entry?.slice(11, 19) ?? '')
  const [exit, setExit] = useState(day.exit?.slice(11, 19) ?? '')
  const [nextDay, setNextDay] = useState(!!day.exit && day.exit.slice(0, 10) !== day.date)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const current = cursorStack[cursorStack.length - 1]!
  const hcur = historyCursors[historyCursors.length - 1]!
  const edits = useQuery({ queryKey: ['unmatched-unit-edits', person.device_serial, person.pin, day.date], queryFn: () => biometric.unmatchedUnitEdits(person.device_serial, person.pin, day.date, day.date) })
  const history = useQuery({ queryKey: ['unmatched-unit-history', person.device_serial, person.pin, hcur], queryFn: () => biometric.unmatchedUnitHistory(person.device_serial, person.pin, hcur, PAGE + 1) })
  const punches = useQuery({
    queryKey: ['unmatched-unit-source', person.device_serial, person.pin, day.date, allPunches, current],
    queryFn: () => biometric.unmatchedArchivePunches(person.device_serial, person.pin, allPunches ? '' : day.date, allPunches ? '' : day.date, current, PAGE + 1),
  })
  const source = (punches.data ?? []).slice(0, PAGE)
  const events = (history.data ?? []).slice(0, PAGE)
  const refreshAndClose = async () => { await qc.invalidateQueries({ queryKey: ['unmatched-unit-report'] }); await qc.invalidateQueries({ queryKey: ['unmatched-unit-edits'] }); onBack() }
  const saveName = async () => {
    if (!edits.data) return
    setBusy(true); setError('')
    try { await biometric.unmatchedUnitEditName(person.device_serial, person.pin, name, edits.data.person?.revision ?? 0); await refreshAndClose() }
    catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  const saveDay = async () => {
    if (!edits.data || !status) return
    setBusy(true); setError('')
    try { await biometric.unmatchedUnitEditDay(person.device_serial, person.pin, day.date, status, entry || null, exit || null, nextDay, edits.data.days.find(d => d.work_day === day.date)?.revision ?? 0); await refreshAndClose() }
    catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  return <section className="space-y-4" data-testid="unit-person-panel">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">{person.person_name || 'بلا اسم'} · {day.date}</h2><p className="text-sm text-slate-500" dir="ltr">{person.device_serial} · PIN {person.pin}</p></div><button type="button" className={button} onClick={onBack}>العودة للتقرير</button></div>
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">الحالة: <strong>{UNIT_STATUS[day.status]}</strong> · الوقت الأول {unitLocalTime(unitShownTimes(day).first, day.date)} · الوقت الأخير {unitLocalTime(unitShownTimes(day).last, day.date)} · بصمات هذا اليوم الأصلية {day.punch_count}. التعديلات هنا لا تغيّر الحضور الرسمي أو البصمات الأصلية.</div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {edits.isError && <p role="alert" className="text-sm text-red-700">تعذر تحميل التعديلات؛ لا يمكن الحفظ حتى يُعاد فتح التفاصيل.</p>}
    {canEdit && <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-bold">تعديل اسم الوحدة</h3><label className="block text-xs text-slate-600">الاسم<input className={field} value={name} maxLength={200} onChange={e => setName(e.target.value)} data-testid="unit-name" /></label><button type="button" className={button} disabled={busy || !edits.data || !name.trim()} onClick={() => void saveName()}>حفظ الاسم</button></div>
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-bold">تعديل حالة اليوم وأوقاته</h3>
        <label className="block text-xs text-slate-600">الحالة<select className={field} value={status} onChange={e => { const v = e.target.value as EditableStatus | '';  setStatus(v); if (v === 'leave' || v === 'absent') { setEntry(''); setExit(''); setNextDay(false) } }} data-testid="unit-edit-status"><option value="">اختر الحالة</option>{editable.map(s => <option key={s} value={s}>{UNIT_STATUS[s]}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-2"><label className="text-xs text-slate-600">الدخول<input className={field} type="time" step="1" value={entry} disabled={status === 'leave' || status === 'absent'} onChange={e => setEntry(e.target.value)} data-testid="unit-edit-entry" /></label><label className="text-xs text-slate-600">الخروج<input className={field} type="time" step="1" value={exit} disabled={status === 'leave' || status === 'absent'} onChange={e => setExit(e.target.value)} data-testid="unit-edit-exit" /></label></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={nextDay} disabled={status === 'leave' || status === 'absent'} onChange={e => setNextDay(e.target.checked)} /> الخروج صباح اليوم التالي</label>
        <button type="button" className={button} disabled={busy || !edits.data || !status} onClick={() => void saveDay()}>حفظ اليوم</button><p className="text-xs text-slate-500">«مجاز» إجازة يدوية داخل هذه الوحدة فقط.</p>
      </div>
    </div>}
    {!canEdit && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">حسابك للقراءة فقط في هذه الوحدة.</p>}
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">البصمات الأصلية</h3><button type="button" className={button} onClick={() => { setAllPunches(v => !v); setCursorStack([null]) }}>{allPunches ? 'بصمات هذا اليوم' : 'جميع بصمات الشخص'}</button></div>
      <p className="text-xs text-slate-500">{allPunches ? 'كل ما حُفظ لهذا الجهاز والرقم في الأرشيف.' : `بصمات ${day.date} بتوقيت الجهاز. لعرض خروج اليوم التالي اختر جميع البصمات.`}</p>
      {punches.isLoading && <p>جارٍ التحميل…</p>}{punches.isError && <p role="alert" className="text-red-700">تعذر تحميل البصمات.</p>}
      {!punches.isLoading && !punches.isError && !source.length && <p className="text-sm text-slate-500">لا توجد بصمات محفوظة.</p>}
      {!punches.isError && !!source.length && <ul className="divide-y divide-slate-100">{source.map(p => <li className="flex flex-wrap justify-between gap-2 py-2 text-sm" key={p.source_punch_id}><span dir="ltr" className="font-mono" title={p.punched_at}>{archiveLocalTime(p.punched_at, p.original_device?.timezone_offset)}</span><span>{archiveDirection(p.original_punch?.direction)}</span></li>)}</ul>}
      <div className="flex gap-2"><button type="button" className={button} disabled={cursorStack.length === 1 || punches.isFetching} onClick={() => setCursorStack(s => s.slice(0, -1))}>السابق</button><button type="button" className={button} disabled={!punches.data || punches.data.length <= PAGE || punches.isFetching} onClick={() => { const p = source[source.length - 1]; if (p) setCursorStack(s => [...s, { at: p.punched_at, id: p.source_punch_id }]) }}>التالي</button></div>
    </div>
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"><h3 className="font-bold">سجل تعديلات الشخص</h3>
      {history.isLoading && <p>جارٍ التحميل…</p>}{history.isError && <p role="alert" className="text-red-700">تعذر تحميل سجل التعديلات.</p>}
      {!history.isLoading && !history.isError && !events.length && <p className="text-sm text-slate-500">لا توجد تعديلات مسجلة.</p>}
      {!history.isError && !!events.length && <ul className="divide-y divide-slate-100">{events.map(e => <li className="space-y-1 py-3 text-sm" key={e.id}><div className="font-semibold">{e.action === 'name' ? 'تعديل الاسم' : e.action === 'independent' ? 'تأكيد الجهاز كشخص مستقل' : `تعديل يوم ${e.work_day ?? '—'}`} · {e.actor_name}</div><div className="text-slate-500">قبل: {summary(e.old_value)}</div><div>بعد: {summary(e.new_value)}</div><time dir="ltr" className="block text-xs text-slate-500">{new Date(e.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Baghdad' })} بغداد</time></li>)}</ul>}
      <div className="flex gap-2"><button type="button" className={button} disabled={historyCursors.length === 1 || history.isFetching} onClick={() => setHistoryCursors(s => s.slice(0, -1))}>السابق</button><button type="button" className={button} disabled={!history.data || history.data.length <= PAGE || history.isFetching} onClick={() => { const e = events[events.length - 1]; if (e) setHistoryCursors(s => [...s, e.id]) }}>التالي</button></div>
    </div>
  </section>
}
