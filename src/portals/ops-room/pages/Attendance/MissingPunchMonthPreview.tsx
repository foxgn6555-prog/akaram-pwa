import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { hr, type MissingPunchPreviewDay } from '@sdk/hr.sdk'

const PAGE_SIZE = 100
const fmt = (v: number | null) => v == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(v)
const listDates = (dates: MissingPunchPreviewDay[], kind: MissingPunchPreviewDay['classification']) => dates.filter((d) => d.classification === kind).map((d) => d.date).join('، ') || '—'

/** معاينة حية فقط: ليست كشفاً مرسلاً أو غرامة معتمدة ولا تكتب في الراتب. */
export function MissingPunchMonthPreview({ month }: { month: string }) {
  const [opened, setOpened] = useState(false)
  const [pageState, setPage] = useState({ month, page: 0 })
  const page = pageState.month === month ? pageState.page : 0
  const query = useQuery({
    queryKey: ['hr', 'missing-punch-month-preview', month, page],
    queryFn: () => hr.missingPunchMonthPreview(month, PAGE_SIZE, page * PAGE_SIZE),
    enabled: opened,
    staleTime: 0,
  })
  const data = query.data
  return (
    <section className="space-y-3 rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm" data-testid="missing-month-preview">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-black">معاينة حساب البصمات الناقصة — {month.slice(0, 7)}</h2>
        <Button size="sm" variant="secondary" onClick={() => setOpened((v) => !v)}>{opened ? 'إخفاء المعاينة' : 'عرض المعاينة'}</Button>
      </div>
      {opened && <>
        <p className="text-xs font-bold text-amber-800">معاينة مباشرة للأدلة المتاحة وليست كشفاً مرسلاً أو غرامة معتمدة؛ لا تُحفظ ولا تخصم من الراتب. قد تتغير بعد استكمال سحب البصمات والمراجعة.</p>
        {query.isLoading ? <LoadingSpinner /> : query.isError ? <p role="alert" className="text-xs text-rose-700">تعذر تحميل المعاينة. تأكد من الشهر وحاول مجدداً.</p> : data && <>
          {!data.month_ended && <p role="status" className="text-xs font-bold text-amber-800">الشهر لم ينتهِ؛ هذه أرقام أولية وليست كشف نهاية الشهر.</p>}
          {data.finance_locked && <p role="status" className="text-xs font-bold text-rose-700">الشهر مقفول مالياً: المعاينة للمراجعة فقط ولا تغيّر الحضور أو الراتب.</p>}
          {data.total_pending_days > 0 && <p role="status" className="text-xs font-bold text-amber-800">توجد شفتات لم تنتهِ بعد؛ لم تُحسب ضمن الأيام.</p>}
          {!data.settings_configured ? <p role="status" className="text-xs font-bold text-rose-700">لم يُضبط الحد والمبلغ في التطوير المركزية؛ تُعرض الأيام بلا مبالغ مفترضة.</p> : <p className="text-xs text-slate-600">الحد: <b dir="ltr">{fmt(data.threshold)}</b> أيام · المبلغ الحالي لكل بلوغ: <b dir="ltr">{fmt(data.fixed_amount)}</b> د.ع · يتكرر الحساب عند كل بلوغ للحد؛ ليست هذه إثباتاً للإعداد التاريخي.</p>}
          <p className="text-xs text-slate-600" data-testid="missing-preview-totals">أيام محسوبة: <b dir="ltr">{fmt(data.total_confirmed_days)}</b> · أيام للمراجعة: <b dir="ltr">{fmt(data.total_review_days)}</b> · إجمالي تقديري: <b dir="ltr">{fmt(data.total_proposed_amount)}</b> د.ع</p>
          <p className="text-xs text-slate-500">الإجازة المعتمدة والحالات الملتبسة خارج الحساب. الأيام الحالية غير الملتقطة تظهر منفصلة؛ السجل قد يكون ناقصاً إذا تعطل السحب أو المجدول، ولا يمكن استعادة تاريخ بلا دليل.</p>
          {data.total_employees === 0 ? <p className="text-xs text-slate-500">لا توجد أدلة مسجلة أو حالات ظاهرة لهذا الشهر.</p> : <>
            <div className="overflow-x-auto"><table className="w-full text-xs" data-testid="missing-preview-table">
              <thead className="bg-slate-50"><tr><th className="p-2 text-start">الموظف / القسم</th><th className="p-2">أيام محسوبة</th><th className="p-2">مرات الحد</th><th className="p-2">مبلغ تقديري (د.ع)</th><th className="p-2 text-start">تفاصيل الأيام</th></tr></thead>
              <tbody>{data.rows.map((row) => <tr key={row.employee_id} className="border-t align-top">
                <td className="p-2"><b>{row.full_name}</b><span className="block text-slate-500" dir="ltr">{row.employee_number}</span><span>{row.department_name ?? '—'} / {row.branch_name ?? '—'}</span></td>
                <td className="p-2 text-center tabular-nums" dir="ltr">{fmt(row.confirmed_days)}{row.current_unrecorded_days > 0 && <span className="block text-amber-700">{fmt(row.current_unrecorded_days)} غير ملتقطة</span>}</td>
                <td className="p-2 text-center tabular-nums" dir="ltr">{fmt(row.threshold_reached)}</td>
                <td className="p-2 text-center tabular-nums" dir="ltr">{fmt(row.proposed_amount)}</td>
                <td className="p-2"><span>محسوبة: <span dir="ltr">{listDates(row.dates, 'confirmed')}</span></span>
                  {row.review_days > 0 && <span className="block text-amber-800">للمراجعة ({fmt(row.review_days)}): <span dir="ltr">{listDates(row.dates, 'review')}</span></span>}
                  {row.excluded_leave_days > 0 && <span className="block text-slate-500">إجازة مستبعدة: <span dir="ltr">{listDates(row.dates, 'leave')}</span></span>}
                  {row.pending_days > 0 && <span className="block text-amber-800">شفت مستمر: <span dir="ltr">{listDates(row.dates, 'pending')}</span></span>}
                </td>
              </tr>)}</tbody>
            </table></div>
            <div className="flex items-center gap-2 text-xs"><Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage({ month, page: page - 1 })}>السابق</Button>
              <span dir="ltr">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data.total_employees)} / {data.total_employees}</span>
              <Button size="sm" variant="secondary" disabled={(page + 1) * PAGE_SIZE >= data.total_employees} onClick={() => setPage({ month, page: page + 1 })}>التالي</Button></div>
          </>}
        </>}
      </>}
    </section>
  )
}
