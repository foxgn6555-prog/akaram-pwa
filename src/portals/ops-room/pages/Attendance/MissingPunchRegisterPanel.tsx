import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { fmtTime } from '@portals/hr/components/hr-format'
import { hr } from '@sdk/hr.sdk'

const PAGE_SIZE = 100

/** سجل للمراجعة فقط؛ لا يتضمن غرامات ولا اعتمادات مالية. */
export function MissingPunchRegisterPanel({ month }: { month: string }) {
  const [pageState, setPage] = useState({ month, page: 0 })
  const page = pageState.month === month ? pageState.page : 0
  const query = useQuery({
    queryKey: ['hr', 'missing-punch-register', month, page],
    queryFn: () => hr.missingPunchRegister(month, PAGE_SIZE, page * PAGE_SIZE),
    staleTime: 0,
  })
  const total = query.data?.total ?? 0
  return (
    <section className="space-y-4 rounded-2xl border border-violet-100 bg-white p-4 shadow-sm shadow-violet-100/50" data-testid="missing-punch-register">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-100 pb-3"><h2 className="text-sm font-black text-slate-800">سجل البصمات الناقصة — {month.slice(0, 7)}</h2><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-800">للمراجعة فقط</span></div>
      <p className="text-xs text-slate-600">يعرض النقص المسجّل حتى بعد التصحيح، والحالات الحالية بعد انتهاء الشفت. السجل للمراجعة فقط؛ لم يُنشأ كشف ولم يُفعّل الخصم من الراتب بعد.</p>
      <p className="text-xs text-amber-800">البصمتان المختلفتان أو غياب الشفت أو الإجازة المعتمدة تُعرض للمراجعة، ولا يعني ظهورها اعتماد غرامة. التصحيحات القديمة التي لا تحتوي دليلاً على البصمة الأصلية لا تُخمن.</p>
      {query.data && !query.data.automatic_capture_scheduled && <p role="status" className="text-xs font-bold text-rose-700">التسجيل اليومي التلقائي غير مجدول في قاعدة البيانات؛ أخبر التطوير. تُحفظ التصحيحات اليدوية، لكن السجل التلقائي قد يكون غير مكتمل.</p>}
      {query.isLoading ? <LoadingSpinner /> : query.isError ? <p role="alert" className="text-xs text-rose-700">تعذر تحميل السجل. حاول مجدداً.</p> : total === 0 ? <p className="text-xs text-slate-500">لا توجد حالات مسجّلة لهذا الشهر.</p> : (
        <>
          <p className="text-xs text-slate-600" data-testid="missing-register-total">عدد الحالات للعرض: <b dir="ltr">{total}</b> — تشمل الحالات التي تحتاج مراجعة وليست قيمة غرامة.</p>
          <p className="text-xs text-slate-500">مرّر الجدول أفقياً لعرض تفاصيل الحالات.</p>
          <div className="overflow-x-auto rounded-xl border border-slate-200" role="region" aria-label="جدول البصمات الناقصة" tabIndex={0}>
            <table className="w-full min-w-[720px] text-xs" data-testid="missing-register-table">
              <thead className="bg-slate-50"><tr><th className="p-2 text-start">التاريخ</th><th className="p-2 text-start">الموظف</th><th className="p-2 text-start">القسم / الفرع</th><th className="p-2 text-start">البصمة الحقيقية</th><th className="p-2 text-start">الحالة</th></tr></thead>
              <tbody>{(query.data?.rows ?? []).map((r) => (
                <tr key={`${r.employee_id}-${r.work_date}`} className="border-t border-slate-100">
                  <td className="p-2 tabular-nums" dir="ltr">{r.work_date}</td>
                  <td className="p-2"><b>{r.full_name}</b><span className="block text-slate-500" dir="ltr">{r.employee_number}</span></td>
                  <td className="p-2">{r.department_name ?? '—'} / {r.branch_name ?? '—'}</td>
                  <td className="p-2 tabular-nums" dir="ltr">{fmtTime(r.original_punch)}{r.later_punch && <span className="block text-slate-500">{fmtTime(r.later_punch)}</span>}</td>
                  <td className="p-2">{r.approved_leave ? 'إجازة معتمدة — مستبعدة' : r.deputy_decision === 'confirmed' ? 'أكد المعاون النقص — ليس اعتماد كشف' : r.deputy_decision === 'excluded' ? 'استبعد المعاون الحالة من الحساب' : r.needs_review ? (r.detected_by === 'real_arrival' ? 'وصلت بصمة أخرى بعد حالة ناقصة — راجع سحب الجهاز' : 'البصمات تحتاج مراجعة') : r.correction_audit_id ? `صُحّحت يدوياً — ${r.missing_side === 'in' ? 'دخول' : 'خروج'} ناقص` : r.detected_by === 'current' ? 'ناقصة حالياً — لم تُسجّل باللقطة بعد' : r.current_status === 'incomplete' ? 'ناقصة — مسجّلة' : 'كانت ناقصة — تغيّر الحضور لاحقاً'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage({ month, page: page - 1 })}>السابق</Button>
            <span dir="ltr">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} / {total}</span>
            <Button size="sm" variant="secondary" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage({ month, page: page + 1 })}>التالي</Button>
          </div>
        </>
      )}
    </section>
  )
}
