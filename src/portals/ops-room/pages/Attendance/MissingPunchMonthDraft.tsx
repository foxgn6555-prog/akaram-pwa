import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { useCanI } from '@features/permissions/my-permissions'
import { hr, type MissingPunchPreviewDay } from '@sdk/hr.sdk'
const SIZE = 100
const fmt = (n: number | null) => n == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n)
const dates = (days: MissingPunchPreviewDay[], kind: MissingPunchPreviewDay['classification']) => days.filter(d => d.classification === kind).map(d => d.date).join('، ') || '—'

/** مسودة يدوية إلى أن تُرسل آلياً؛ لا غرامة ولا خصم مالي. */
export function MissingPunchMonthDraft({ month, canSave }: { month: string; canSave: boolean }) {
  const canEdit = useCanI('ops-room.attendance', 'edit')
  const [pageState, setPage] = useState({ month, page: 0 })
  const page = pageState.month === month ? pageState.page : 0
  const [error, setError] = useState('')
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['hr', 'missing-punch-draft', month, page], queryFn: () => hr.missingPunchDraftGet(month, SIZE, page * SIZE), staleTime: 0 })
  const save = useMutation({ mutationFn: () => hr.missingPunchDraftSave(month), onSuccess: async () => {
    setError(''); setPage({ month, page: 0 }); await client.invalidateQueries({ queryKey: ['hr', 'missing-punch-draft', month] })
  }, onError: () => setError('تعذر حفظ المسودة. تأكد من انتهاء الشهر وضبط الحد والمبلغ وعدم قفل المالية، ثم حاول مجدداً.') })
  const data = query.data
  return <section className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-3" data-testid="missing-month-draft">
    <h3 className="text-sm font-black">مسودة كشف البصمات الناقصة — {month.slice(0, 7)}</h3>
    <p className="text-xs text-amber-800">المسودة اليدوية للمراجعة فقط ولا تخصم من الراتب. يُعاد احتسابها عند الإرسال الآلي للمعاون بعد نهاية الشهر. قد تتغير الأدلة أو الإعدادات بعدها؛ الحالات الملتبسة خارج المبالغ.</p>
    <p className="text-xs text-slate-600">عند اختيار إقفال المالية مع الحذف يُحذف الكشف غير المعتمد وكل نسخه؛ لا يُنشأ بسبب ذلك استقطاع.</p>
    {query.isLoading ? <LoadingSpinner /> : query.isError ? <p role="alert" className="text-xs text-rose-700">تعذر تحميل المسودة؛ حاول مجدداً.</p> : data && <>
      {data.exists && data.status === 'sent' ? <p role="status" className="text-xs text-violet-800">أُرسل إلى المعاون للمراجعة ولم يُعتمد أو يُخصم؛ لا يمكن تحديث النسخة المرسلة من هنا.</p> : data.finance_locked ? <p role="status" className="text-xs text-rose-700">الشهر مقفل مالياً؛ لا يمكن حفظ مسودة.</p> : <Button size="sm" variant="secondary" isLoading={save.isPending} disabled={!canSave || !canEdit} title={!canEdit ? 'ليست لديك صلاحية تعديل الحضور' : undefined} onClick={() => { setError(''); if (window.confirm(data.exists ? 'تحديث المسودة من الأدلة والإعدادات الحالية؟ تُحفظ نسخة جديدة ولا يحدث خصم.' : 'حفظ مسودة من الأدلة والإعدادات الحالية؟ لا يحدث إرسال أو خصم.')) save.mutate() }}>{data.exists ? 'تحديث المسودة' : 'حفظ مسودة نهاية الشهر'}</Button>}
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
      {!data.exists ? <p className="text-xs text-slate-500">لا توجد مسودة محفوظة لهذا الشهر.</p> : <>
        <p className="text-xs text-slate-700">نسخة <b dir="ltr">{fmt(data.revision)}</b> · تاريخ الحفظ <span dir="ltr">{new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baghdad', dateStyle: 'short', timeStyle: 'short' }).format(new Date(data.saved_at))}</span> · الحد <b dir="ltr">{fmt(data.threshold)}</b> · المبلغ لكل بلوغ <b dir="ltr">{fmt(data.fixed_amount)}</b> د.ع.</p>
        <p className="text-xs text-slate-700">أيام محسوبة: <b dir="ltr">{fmt(data.total_confirmed_days)}</b> · للمراجعة: <b dir="ltr">{fmt(data.total_review_days)}</b> · الشفتات الجارية: <b dir="ltr">{fmt(data.total_pending_days)}</b> · الإجمالي التقديري: <b dir="ltr">{fmt(data.total_proposed_amount)}</b> د.ع.</p>
        {data.total_employees > 0 && <><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="bg-white"><th className="p-2 text-start">الموظف</th><th className="p-2">الأيام</th><th className="p-2">مرات الحد</th><th className="p-2">المبلغ التقديري</th><th className="p-2 text-start">التواريخ</th></tr></thead><tbody>{data.rows.map(r => <tr key={r.employee_id} className="border-t align-top"><td className="p-2"><b>{r.full_name}</b><span dir="ltr" className="block">{r.employee_number}</span>{r.department_name ?? '—'} / {r.branch_name ?? '—'}</td><td className="p-2 text-center" dir="ltr">{fmt(r.confirmed_days)}</td><td className="p-2 text-center" dir="ltr">{fmt(r.threshold_reached)}</td><td className="p-2 text-center" dir="ltr">{fmt(r.proposed_amount)}</td><td className="p-2">محسوبة: <span dir="ltr">{dates(r.dates, 'confirmed')}</span>{r.review_days > 0 && <span className="block text-amber-800">للمراجعة: <span dir="ltr">{dates(r.dates, 'review')}</span></span>}{r.excluded_leave_days > 0 && <span className="block">إجازة: <span dir="ltr">{dates(r.dates, 'leave')}</span></span>}{r.excluded_review_days > 0 && <span className="block">استبعدها المعاون: <span dir="ltr">{dates(r.dates, 'excluded')}</span></span>}</td></tr>)}</tbody></table></div>
          <div className="flex items-center gap-2 text-xs"><Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage({ month, page: page - 1 })}>السابق</Button><span dir="ltr">{page * SIZE + 1}–{Math.min((page + 1) * SIZE, data.total_employees)} / {data.total_employees}</span><Button size="sm" variant="secondary" disabled={(page + 1) * SIZE >= data.total_employees} onClick={() => setPage({ month, page: page + 1 })}>التالي</Button></div></>}
      </>}
    </>}
  </section>
}
