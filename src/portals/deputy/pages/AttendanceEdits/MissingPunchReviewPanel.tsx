import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { hr, type MissingPunchReviewRow } from '@sdk/hr.sdk'

const SIZE = 50
const show = (v: string | null) => v ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baghdad', dateStyle: 'short', timeStyle: 'short' }).format(new Date(v)) : '—'
const label = (v: 'confirmed' | 'excluded' | null) => v === 'confirmed' ? 'أكدها المعاون كناقصة' : v === 'excluded' ? 'استبعدها المعاون' : 'تحتاج مراجعة'

/** قرار دليل فقط: لا يرسل كشفاً ولا يعتمد أو يخصم راتباً. */
export function MissingPunchReviewPanel({ month }: { month: string }) {
  const [pageState, setPage] = useState({ month, page: 0 })
  const page = pageState.month === month ? pageState.page : 0
  const [selected, setSelected] = useState<MissingPunchReviewRow | null>(null)
  const [reason, setReason] = useState('')
  const [decision, setDecision] = useState<'confirmed' | 'excluded'>('excluded')
  const [error, setError] = useState('')
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['hr', 'missing-punch-reviews', month, page], queryFn: () => hr.deputyMissingPunchReviews(month, SIZE, page * SIZE), staleTime: 0 })
  const save = useMutation({
    mutationFn: (r: MissingPunchReviewRow) => hr.deputyMissingPunchReviewDecide(r.id, decision, reason.trim(), r.evidence_hash),
    onSuccess: async () => {
      setSelected(null); setReason(''); setError('')
      await client.invalidateQueries({ queryKey: ['hr', 'missing-punch-reviews'] })
      await client.invalidateQueries({ queryKey: ['hr', 'missing-punch-month-preview'] })
    },
    onError: () => { setError('تعذر حفظ القرار. قد تكون الأدلة تغيّرت أو أُقفل الشهر؛ أغلق النافذة وحدّث القائمة ثم حاول مجدداً.') },
  })
  const data = query.data
  return <section className="space-y-3 rounded-2xl border border-violet-200 bg-white p-4" data-testid="missing-punch-review">
    <h2 className="text-sm font-black">مراجعة الحالات الملتبسة — {month.slice(0, 7)}</h2>
    <p className="text-xs text-amber-800">وصول بصمتين لا يثبت وحده وجود نقص؛ قد يكون السحب متأخراً. راجع الجهاز والسجلات قبل الحسم وسجّل سبباً واضحاً. قرار الدليل ليس اعتماد كشف ولا ينشئ خصماً.</p>
    <p className="text-xs text-slate-600">تعرض هذه القائمة الحالات الملتبسة المحفوظة فقط. الحالات الحية غير المسجلة تبقى في المعاينة ولا يمكن حسمها هنا. إذا اختلف الدليل الحالي عن الدليل الذي حُسم، تُعرض الحالة للمراجعة مجدداً.</p>
    {query.isLoading ? <LoadingSpinner /> : query.isError ? <p role="alert" className="text-rose-700">تعذر تحميل الحالات. حاول مجدداً.</p> : data && <>
      {data.finance_locked && <p role="status" className="text-xs font-bold text-rose-700">الشهر مقفل مالياً؛ للعرض فقط.</p>}
      {data.total === 0 ? <p className="text-xs text-slate-500">لا توجد حالات ملتبسة محفوظة لهذا الشهر.</p> : <>
        <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="bg-slate-50"><th className="p-2 text-start">الموظف / التاريخ</th><th className="p-2 text-start">البصمات المسجلة</th><th className="p-2 text-start">القرار</th><th className="p-2">مراجعة</th></tr></thead>
          <tbody>{data.rows.map(r => <tr key={r.id} className="border-t align-top"><td className="p-2"><b>{r.full_name}</b> <span dir="ltr">{r.employee_number}</span><span className="block">{r.department_name ?? '—'} / {r.branch_name ?? '—'}</span><span dir="ltr">{r.work_date}</span></td>
            <td className="p-2"><span dir="ltr">{show(r.original_punch)}</span>{r.later_punch && <span dir="ltr" className="block">{show(r.later_punch)}</span>}</td>
            <td className="p-2">{label(r.current_decision)}{!r.current_decision && r.last_decision && <span className="block text-amber-700">تغيّر الدليل بعد القرار السابق</span>}{r.last_reason && <span className="block text-slate-500">آخر سبب: {r.last_reason} · {r.last_actor_name ?? '—'} · <span dir="ltr">{show(r.last_decided_at)}</span></span>}{r.evidence.leave && <span className="block">إجازة معتمدة — مستبعدة</span>}</td>
            <td className="p-2"><Button size="sm" variant="secondary" disabled={data.finance_locked || r.evidence.leave} onClick={() => { setSelected(r); setReason(''); setDecision('excluded'); setError('') }}>مراجعة</Button></td></tr>)}</tbody></table></div>
        <div className="flex items-center gap-2 text-xs"><Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage({ month, page: page - 1 })}>السابق</Button><span dir="ltr">{page * SIZE + 1}–{Math.min((page + 1) * SIZE, data.total)} / {data.total}</span><Button size="sm" variant="secondary" disabled={(page + 1) * SIZE >= data.total} onClick={() => setPage({ month, page: page + 1 })}>التالي</Button></div>
      </>}
    </>}
    {selected && <div role="dialog" aria-modal="true" aria-labelledby="missing-review-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="max-h-[90vh] w-full max-w-xl space-y-3 overflow-auto rounded-xl bg-white p-5 shadow-xl">
      <h3 id="missing-review-title" className="font-black">مراجعة {selected.full_name} — <span dir="ltr">{selected.work_date}</span></h3>
      <p className="text-xs text-amber-800">لا تعتبر تأخر وصول البصمة دليلاً كافياً على النقص. حسم الحالة يجب أن يستند إلى تحقق خارجي؛ هذه الخطوة لا تخصم من الراتب.</p>
      <p className="text-xs">البصمة الأصلية: <span dir="ltr">{show(selected.original_punch)}</span> · البصمة اللاحقة: <span dir="ltr">{show(selected.later_punch)}</span></p>
      <p className="text-xs">نتيجة فحص الشفت: {selected.evidence.context.skipped ?? `${selected.evidence.context.count ?? 0} وقت بصمة مختلف`}.</p>
      <details className="text-xs"><summary>بصمات نافذة الأيام المجاورة للتحقق (بتوقيت بغداد؛ لا تعني كلها الشفت نفسه)</summary><ul className="max-h-40 overflow-auto" dir="ltr">{selected.evidence.punches.map(p => <li key={p.id}>{show(p.at)} — {p.device} — {p.direction} — {p.method} — received {show(p.received_at)}</li>)}</ul></details>
      <label className="block text-xs font-bold">القرار <select className="mt-1 block w-full rounded border p-2" value={decision} onChange={e => setDecision(e.target.value as 'confirmed' | 'excluded')}><option value="excluded">استبعاد الحالة من الحساب</option><option value="confirmed">تأكيدها كناقصة بعد التحقق</option></select></label>
      <label className="block text-xs font-bold">سبب القرار ومصدر التحقق (10 أحرف على الأقل)<textarea className="mt-1 block w-full rounded border p-2" maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label>
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
      <div className="flex gap-2"><Button size="sm" disabled={reason.trim().length < 10 || save.isPending} onClick={() => save.mutate(selected)}>حفظ قرار المراجعة</Button><Button size="sm" variant="secondary" disabled={save.isPending} onClick={() => { setSelected(null); void query.refetch() }}>إلغاء</Button></div>
    </div></div>}
  </section>
}
