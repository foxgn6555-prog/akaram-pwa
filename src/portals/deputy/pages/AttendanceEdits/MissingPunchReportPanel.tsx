import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { hr, type MissingPunchPreviewDay } from '@sdk/hr.sdk'

const SIZE = 100
const fmt = (n: number | null) => n == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n)
const dates = (days: MissingPunchPreviewDay[], kind: MissingPunchPreviewDay['classification']) => days.filter(d => d.classification === kind).map(d => d.date).join('، ') || '—'

/** الوارد للمعاون: قراءة فقط؛ لا يوجد اعتماد أو خصم في هذه الجولة. */
export function MissingPunchReportPanel({ month }: { month: string }) {
  const [pageState, setPage] = useState({ month, page: 0 })
  const page = pageState.month === month ? pageState.page : 0
  const query = useQuery({ queryKey: ['hr', 'deputy-missing-punch-report', month, page], queryFn: () => hr.deputyMissingPunchReport(month, SIZE, page * SIZE), staleTime: 0 })
  const data = query.data
  return <section className="space-y-3 rounded-2xl border border-violet-200 bg-white p-4" data-testid="missing-punch-report">
    <h2 className="text-sm font-black">وارد كشف البصمات الناقصة — <span dir="ltr">{month.slice(0, 7)}</span></h2>
    <p className="text-xs text-amber-800">الكشف المرسل للمراجعة فقط، وليس اعتماداً ولا خصماً من الراتب. الحالات الملتبسة والشفتات غير المكتملة لا تدخل المبلغ. راجع الأدلة في تبويب مراجعة البصمة الناقصة.</p>
    <p className="text-xs text-slate-600">الكشف لقطة وقت الإرسال؛ قد تتغير الأدلة أو الإجازات أو الإعدادات بعده حتى لو لم تتغير المجاميع. لا تعتمد عليه كحساب نهائي قبل إعادة التحقق.</p>
    {query.isLoading ? <LoadingSpinner /> : query.isError ? <p role="alert" className="text-xs text-rose-700">تعذر تحميل الكشف؛ حاول مجدداً.</p> : data && <>
      {!data.automatic_send_scheduled && <p role="alert" className="text-xs font-bold text-rose-700">تنبيه: جدولة إرسال الكشف غير مفعّلة أو غير متاحة؛ راجع التطوير. لا يمكن ضمان الإرسال التلقائي.</p>}
      {!data.exists ? <p className="text-xs text-slate-600">لم يصل كشف لهذا الشهر. ربما لم ينتهِ الشهر أو لم تُضبط الإعدادات أو أُقفل مالياً. تتم المحاولة بعد انتهاء الشهر عندما تعمل الجدولة.</p> : <>
        {data.results_changed && <p role="alert" className="text-xs font-bold text-rose-700">تغيّرت نتائج الحساب بعد الإرسال. اللقطة المعروضة قديمة وتحتاج إعادة احتساب قبل الاعتماد مستقبلاً.</p>}
        <p className="text-xs text-slate-700">أُرسل <span dir="ltr">{new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baghdad', dateStyle: 'short', timeStyle: 'short' }).format(new Date(data.sent_at))}</span> · النسخة <b dir="ltr">{fmt(data.revision)}</b> · الحد <b dir="ltr">{fmt(data.threshold)}</b> · المبلغ لكل بلوغ <b dir="ltr">{fmt(data.fixed_amount)}</b> د.ع.</p>
        <p className="text-xs text-slate-700">أيام محسوبة: <b dir="ltr">{fmt(data.total_confirmed_days)}</b> · للمراجعة: <b dir="ltr">{fmt(data.total_review_days)}</b> · شفتات لم تنتهِ: <b dir="ltr">{fmt(data.total_pending_days)}</b> · الإجمالي التقديري: <b dir="ltr">{fmt(data.total_proposed_amount)}</b> د.ع.</p>
        {data.total_employees === 0 ? <p className="text-xs text-slate-500">لا توجد حالات في الكشف المرسل.</p> : <>
          <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="bg-slate-50"><th className="p-2 text-start">الموظف</th><th className="p-2">الأيام</th><th className="p-2">مرات الحد</th><th className="p-2">المبلغ التقديري</th><th className="p-2 text-start">التواريخ</th></tr></thead><tbody>{data.rows.map(r => <tr key={r.employee_id} className="border-t align-top"><td className="p-2"><b>{r.full_name}</b><span dir="ltr" className="block">{r.employee_number}</span>{r.department_name ?? '—'} / {r.branch_name ?? '—'}</td><td className="p-2 text-center" dir="ltr">{fmt(r.confirmed_days)}</td><td className="p-2 text-center" dir="ltr">{fmt(r.threshold_reached)}</td><td className="p-2 text-center" dir="ltr">{fmt(r.proposed_amount)}</td><td className="p-2">محسوبة: <span dir="ltr">{dates(r.dates, 'confirmed')}</span>{r.review_days > 0 && <span className="block text-amber-800">للمراجعة: <span dir="ltr">{dates(r.dates, 'review')}</span></span>}{r.pending_days > 0 && <span className="block text-amber-800">لم ينتهِ الشفت: <span dir="ltr">{dates(r.dates, 'pending')}</span></span>}{r.excluded_leave_days > 0 && <span className="block">إجازة: <span dir="ltr">{dates(r.dates, 'leave')}</span></span>}{r.excluded_review_days > 0 && <span className="block">استبعدها المعاون: <span dir="ltr">{dates(r.dates, 'excluded')}</span></span>}</td></tr>)}</tbody></table></div>
          <div className="flex items-center gap-2 text-xs"><Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage({ month, page: page - 1 })}>السابق</Button><span dir="ltr">{page * SIZE + 1}–{Math.min((page + 1) * SIZE, data.total_employees)} / {data.total_employees}</span><Button size="sm" variant="secondary" disabled={(page + 1) * SIZE >= data.total_employees} onClick={() => setPage({ month, page: page + 1 })}>التالي</Button></div>
        </>}
      </>}
    </>}
  </section>
}
