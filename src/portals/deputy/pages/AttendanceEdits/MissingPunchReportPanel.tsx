import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { useCanI } from '@features/permissions/my-permissions'
import { hr, type MissingPunchPreviewDay, type MissingPunchPreviewRow } from '@sdk/hr.sdk'

const SIZE = 100
const fmt = (n: number | null) => n == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n)
const show = (v: string | null | undefined) => v ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baghdad', dateStyle: 'short', timeStyle: 'short' }).format(new Date(v)) : '—'
const sourceLabel: Record<string, string> = { audit_backfill: 'تصحيح سابق موثق', manual_correction: 'تصحيح موثق', daily_snapshot: 'لقطة يومية', real_arrival: 'بصمة وردت لاحقاً', current: 'حالة حية غير مسجلة' }
const dayLabel: Record<MissingPunchPreviewDay['classification'], string> = { confirmed: 'محسوبة', review: 'للمراجعة', pending: 'لم ينتهِ الشفت', leave: 'إجازة', excluded: 'استبعدها المعاون' }
type Selected = { employee: string; name: string; date: string; revision: number }

/** إعادة التحقق وحفظ الأدلة للمراجعة؛ لا اعتماد ولا خصم في هذه الجولة. */
export function MissingPunchReportPanel({ month }: { month: string }) {
  const [pageState, setPage] = useState({ month, page: 0 })
  const page = pageState.month === month ? pageState.page : 0
  const [selected, setSelected] = useState<Selected | null>(null)
  const [error, setError] = useState('')
  const canRecheck = useCanI('deputy.attendance-edits', 'execute')
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['hr', 'deputy-missing-punch-report', month, page], queryFn: () => hr.deputyMissingPunchReport(month, SIZE, page * SIZE), staleTime: 0 })
  const recheck = useMutation({
    mutationFn: (v: { month: string; revision: number }) => hr.deputyMissingPunchReportRecheck(v.month, v.revision),
    onSuccess: async (_, v) => { setError(''); setSelected(null); setPage({ month: v.month, page: 0 }); await client.invalidateQueries({ queryKey: ['hr', 'deputy-missing-punch-report', v.month] }) },
    onError: () => setError('تعذرت إعادة التحقق. قد يكون الكشف تغيّر أو أُقفل الشهر أو لم تُضبط الإعدادات. حدّث الصفحة وحاول مجدداً.'),
  })
  const data = query.data
  const choose = (r: MissingPunchPreviewRow, d: MissingPunchPreviewDay, revision: number) => setSelected({ employee: r.employee_id, name: r.full_name, date: d.date, revision })
  return <section className="space-y-3 rounded-2xl border border-violet-200 bg-white p-4" data-testid="missing-punch-report">
    <h2 className="text-sm font-black">وارد كشف البصمات الناقصة — <span dir="ltr">{month.slice(0, 7)}</span></h2>
    <p className="text-xs text-amber-800">الكشف المرسل للمراجعة فقط، وليس اعتماداً ولا خصماً من الراتب. الحالات الملتبسة والشفتات غير المكتملة لا تدخل المبلغ. راجع الأدلة في تبويب مراجعة البصمة الناقصة.</p>
    <p className="text-xs text-slate-600">إعادة التحقق تحدّث الكشف وتحفظ أدلته كما هي وقت التحديث، ولا تعتمد الكشف. قد تتغير الأدلة لاحقاً ويجب التحقق مجدداً قبل ربطه بالراتب.</p>
    {query.isLoading ? <LoadingSpinner /> : query.isError ? <p role="alert" className="text-xs text-rose-700">تعذر تحميل الكشف؛ حاول مجدداً.</p> : data && <>
      {!data.automatic_send_scheduled && <p role="alert" className="text-xs font-bold text-rose-700">تنبيه: جدولة إرسال الكشف غير مفعّلة أو غير متاحة؛ راجع التطوير. لا يمكن ضمان الإرسال التلقائي.</p>}
      {!data.exists ? <p className="text-xs text-slate-600">لم يصل كشف لهذا الشهر. ربما لم ينتهِ الشهر أو لم تُضبط الإعدادات أو أُقفل مالياً. تتم المحاولة بعد انتهاء الشهر عندما تعمل الجدولة.</p> : <>
        {!data.has_evidence && <p className="text-xs font-bold text-amber-800">هذه النسخة لم تُحفظ أدلتها بعد؛ اضغط إعادة التحقق لعرض أدلة النسخة.</p>}
        {data.results_changed && <p role="alert" className="text-xs font-bold text-rose-700">تغيّرت نتائج الحساب بعد حفظ النسخة. أعد التحقق قبل المراجعة.</p>}
        {data.evidence_changed && <p role="alert" className="text-xs font-bold text-rose-700">تغيّرت الأدلة منذ حفظ النسخة، حتى إن لم تتغير النتائج. أعد التحقق وراجعها.</p>}
        {data.finance_locked ? <p role="status" className="text-xs text-rose-700">الشهر مقفل مالياً؛ العرض فقط.</p> : <Button size="sm" variant="secondary" disabled={!canRecheck || recheck.isPending} onClick={() => { setError(''); if (window.confirm('إعادة احتساب الكشف وحفظ نسخة جديدة من أدلته للمراجعة؟ لا يحدث اعتماد أو خصم.')) recheck.mutate({ month, revision: data.revision }) }}>إعادة التحقق وتحديث الكشف</Button>}
        {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
        <p className="text-xs text-slate-700">أُرسل <span dir="ltr">{show(data.sent_at)}</span> · النسخة <b dir="ltr">{fmt(data.revision)}</b>{data.rechecked_at && <> · آخر تحقق <span dir="ltr">{show(data.rechecked_at)}</span></>} · الحد <b dir="ltr">{fmt(data.threshold)}</b> · المبلغ لكل بلوغ <b dir="ltr">{fmt(data.fixed_amount)}</b> د.ع.</p>
        <p className="text-xs text-slate-700">أيام محسوبة: <b dir="ltr">{fmt(data.total_confirmed_days)}</b> · للمراجعة: <b dir="ltr">{fmt(data.total_review_days)}</b> · شفتات لم تنتهِ: <b dir="ltr">{fmt(data.total_pending_days)}</b> · الإجمالي التقديري: <b dir="ltr">{fmt(data.total_proposed_amount)}</b> د.ع.</p>
        {data.total_employees === 0 ? <p className="text-xs text-slate-500">لا توجد حالات في الكشف المرسل.</p> : <>
          <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="bg-slate-50"><th className="p-2 text-start">الموظف</th><th className="p-2">الأيام</th><th className="p-2">مرات الحد</th><th className="p-2">المبلغ التقديري</th><th className="p-2 text-start">التواريخ والأدلة المحفوظة</th></tr></thead><tbody>{data.rows.map(r => <tr key={r.employee_id} className="border-t align-top"><td className="p-2"><b>{r.full_name}</b><span dir="ltr" className="block">{r.employee_number}</span>{r.department_name ?? '—'} / {r.branch_name ?? '—'}</td><td className="p-2 text-center" dir="ltr">{fmt(r.confirmed_days)}</td><td className="p-2 text-center" dir="ltr">{fmt(r.threshold_reached)}</td><td className="p-2 text-center" dir="ltr">{fmt(r.proposed_amount)}</td><td className="p-2"><ul className="space-y-1">{r.dates.map(d => <li key={d.date}><span className={d.classification === 'review' || d.classification === 'pending' ? 'text-amber-800' : ''}>{dayLabel[d.classification]}: </span>{data.has_evidence ? <button type="button" className="font-bold text-violet-800 underline" onClick={() => choose(r, d, data.revision)} aria-label={`عرض دليل ${r.full_name} ${d.date}`} dir="ltr">{d.date}</button> : <span dir="ltr">{d.date}</span>}</li>)}</ul></td></tr>)}</tbody></table></div>
          <div className="flex items-center gap-2 text-xs"><Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage({ month, page: page - 1 })}>السابق</Button><span dir="ltr">{page * SIZE + 1}–{Math.min((page + 1) * SIZE, data.total_employees)} / {data.total_employees}</span><Button size="sm" variant="secondary" disabled={(page + 1) * SIZE >= data.total_employees} onClick={() => setPage({ month, page: page + 1 })}>التالي</Button></div>
        </>}
      </>}
    </>}
    {selected && <ReportCaseDialog month={month} selected={selected} close={() => setSelected(null)} />}
  </section>
}

function ReportCaseDialog({ month, selected, close }: { month: string; selected: Selected; close: () => void }) {
  const q = useQuery({ queryKey: ['hr', 'deputy-missing-punch-report-case', month, selected.revision, selected.employee, selected.date], queryFn: () => hr.deputyMissingPunchReportCase(month, selected.revision, selected.employee, selected.date), retry: false })
  const c = q.data
  return <div role="dialog" aria-modal="true" aria-labelledby="report-case-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="max-h-[90vh] w-full max-w-xl space-y-3 overflow-auto rounded-xl bg-white p-5 shadow-xl">
    <h3 id="report-case-title" className="font-black">أدلة النسخة المحفوظة — {selected.name} — <span dir="ltr">{selected.date}</span></h3>
    <p className="text-xs text-amber-800">هذه الأدلة كما حُفظت وقت إعادة التحقق، وقد تكون تغيّرت لاحقاً. وجود بصمتين لا يثبت وحده سبب النقص؛ راجع الجهاز والسجلات.</p>
    {q.isLoading ? <LoadingSpinner /> : q.isError ? <p role="alert" className="text-xs text-rose-700">تعذر تحميل الدليل؛ ربما تغيرت النسخة أو حُذف الكشف عند الإقفال. أغلق النافذة وحدّث الصفحة.</p> : c && <>
      <p className="text-xs">المصدر: {sourceLabel[c.source] ?? c.source} · فحص الشفت: {c.evidence.context.skipped ?? `${c.evidence.context.count ?? 0} وقت بصمة مختلف`} {c.evidence.leave && '· إجازة معتمدة'}</p>
      {c.shift && <p className="text-xs">الشفت: {c.shift.shift_name} · <span dir="ltr">{c.shift.start_time?.slice(0, 5)}–{c.shift.end_time?.slice(0, 5)}</span></p>}
      {c.register_id === null && <p className="text-xs font-bold text-amber-800">هذه الحالة حية غير مسجلة؛ لا يمكن حسمها من لوحة مراجعة الحالات المسجلة حالياً.</p>}
      <p className="text-xs">الأصلية: <span dir="ltr">{show(c.evidence.register?.original ?? c.evidence.attendance?.check_in ?? c.evidence.attendance?.check_out)}</span> · اللاحقة المسجلة: <span dir="ltr">{show(c.evidence.register?.later)}</span></p>
      {c.last_decision && <p className="text-xs">آخر قرار مسجل: {c.last_decision.decision === 'confirmed' ? 'تأكيد' : 'استبعاد'} — {c.last_decision.reason} · <span dir="ltr">{show(c.last_decision.decided_at)}</span>. قد لا يكون القرار سارياً إذا تغير الدليل.</p>}
      <p className="text-xs font-bold">بصمات نافذة الأيام المجاورة (بتوقيت بغداد)</p>
      {c.evidence.punches.length ? <ul className="max-h-40 overflow-auto text-xs" dir="ltr">{c.evidence.punches.map(p => <li key={p.id}>{show(p.at)} — {p.device} — {p.direction} — {p.method} — received {show(p.received_at)}</li>)}</ul> : <p className="text-xs text-slate-500">لا توجد بصمات مسجلة في النافذة.</p>}
    </>}
    <Button size="sm" variant="secondary" onClick={close}>إغلاق</Button>
  </div></div>
}
