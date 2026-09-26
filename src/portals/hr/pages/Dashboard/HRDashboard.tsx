/**
 * بوابة الموارد البشرية — «الرئيسية»: ملخص حي لبقية الوحدات
 * القوى العاملة (قسم/فرع/شفت) · حركة الشهر (تعيين/إنهاء) · حضور اليوم · إجازات اليوم · رواتب بانتظار المالية · بصمات غير مطابَقة.
 */
import { Link } from 'react-router'
import { useHrDashboard } from '@features/hr'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { StatCard } from '../../components/hr-ui'

export default function HRDashboard() {
  const { data: s, isLoading } = useHrDashboard()
  if (isLoading) return <LoadingSpinner />
  if (!s) return <p className="text-sm text-slate-500">لا صلاحية لعرض لوحة الموارد البشرية</p>
  const total = s.today.present + s.today.late + s.today.absent + s.today.incomplete + s.today.leave

  return (
    <div className="space-y-5" data-testid="hr-dashboard">
      <header><h1 className="text-xl font-black">الموارد البشرية — الرئيسية</h1><p className="text-xs text-slate-500">لمحة حيّة عن الموظفين والحضور والإجازات والرواتب</p></header>

      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">القوى العاملة</h2>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Link to="/hr/employees"><StatCard title="موظفون على الملاك" value={s.employees_active} tone="emerald" testId="d-active" /></Link>
          <Link to="/hr/recruitment"><StatCard title="تعيينات هذا الشهر" value={s.hired_this_month} tone="sky" testId="d-hired" /></Link>
          <Link to="/hr/recruitment"><StatCard title="إنهاءات هذا الشهر" value={s.terminated_this_month} tone="red" testId="d-terminated" /></Link>
          <StatCard title="منتهية خدمتهم (إجمالي)" value={s.employees_terminated} testId="d-terminated-total" />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Breakdown title="حسب القسم" items={s.by_department} testId="d-by-dept" />
        <Breakdown title="حسب الفرع" items={s.by_branch} testId="d-by-branch" />
        <Breakdown title="حسب الشفت" items={s.shifts} testId="d-by-shift" />
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-bold text-slate-700">حضور اليوم {total > 0 && <span className="text-xs text-slate-400">({total} سجلاً)</span>}</h2><Link to="/hr/attendance" className="text-xs font-semibold text-brand-700 hover:underline">الحضور والانصراف ←</Link></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <StatCard title="حاضر" value={s.today.present} tone="emerald" testId="d-present" />
          <StatCard title="متأخر" value={s.today.late} tone="amber" testId="d-late" />
          <StatCard title="غائب" value={s.today.absent} tone="red" testId="d-absent" />
          <StatCard title="بصمة ناقصة" value={s.today.incomplete} tone="violet" testId="d-incomplete" />
          <StatCard title="في إجازة" value={s.leaves_today} tone="sky" testId="d-leaves" />
        </div>
        {total === 0 && <p className="mt-1 text-[11px] text-slate-400">لم يُحتسب حضور اليوم بعد — يُحتسب من البصمات عند «إعادة الاحتساب» أو من غرفة العمليات.</p>}
      </section>

      <section className="grid gap-2 sm:grid-cols-2">
        <Link to="/hr/employees"><StatCard title="رواتب بانتظار تعريف المالية" value={s.salary_pending} tone={s.salary_pending > 0 ? 'amber' : 'slate'} hint="تُدخلها بوابة المالية حصراً — HR ترى الحالة فقط" testId="d-salary-pending" /></Link>
        <Link to="/hr/biometric"><StatCard title="بصمات غير مطابَقة (30 يوماً)" value={s.unmatched_punches} tone={s.unmatched_punches > 0 ? 'amber' : 'slate'} hint="اربط PIN بالموظف من دفتر البصمة" testId="d-unmatched" /></Link>
      </section>
    </div>
  )
}

function Breakdown({ title, items, testId }: { title: string; items: Array<{ name: string; count: number }>; testId: string }) {
  const max = Math.max(1, ...items.map((i) => i.count))
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={testId}>
      <h3 className="text-xs font-bold text-slate-600">{title}</h3>
      <ul className="mt-2 space-y-1.5">
        {items.slice(0, 8).map((i) => (
          <li key={i.name} className="text-xs">
            <div className="flex justify-between"><span>{i.name}</span><span className="font-bold tabular-nums">{i.count}</span></div>
            <div className="mt-0.5 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${(i.count / max) * 100}%` }} /></div>
          </li>
        ))}
        {items.length === 0 && <li className="text-[11px] text-slate-400">لا بيانات</li>}
      </ul>
    </div>
  )
}
