/**
 * 00400 · بوابة مدير غرفة العمليات — الرئيسية
 * وحدتان فقط: الموافقات (إجازات/سلف/كشوفات) وتقارير الوقود. لا بيانات ولا صلاحيات أخرى.
 */
import { ArrowLeft, CheckSquare, Fuel } from 'lucide-react'
import { Link } from 'react-router'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { useMyApprovalTasks } from '@features/sector-manager/hooks'
import { useGarageReport } from '@features/central-garage/hooks'
import { garageUnitLabel } from '@features/central-garage/fuel-units'

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date())
const monthAgo = () => {
  const d = new Date(`${today()}T12:00:00+03:00`)
  d.setDate(d.getDate() - 29)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(d)
}
const num = (value: number) => new Intl.NumberFormat('ar-IQ-u-nu-latn', { maximumFractionDigits: 2 }).format(value)

export default function OpsManagerDashboardPage() {
  const tasks = useMyApprovalTasks()
  const report = useGarageReport({ from: monthAgo(), to: today(), page: 1, pageSize: 1 })
  const pending = tasks.data?.length ?? 0
  const leaves = (tasks.data ?? []).filter((t) => t.request_kind === 'leave' || t.request_kind === 'time_permit').length
  const advances = (tasks.data ?? []).filter((t) => t.request_kind === 'advance').length
  const disclosures = (tasks.data ?? []).filter((t) => t.request_kind === 'disclosure').length
  const consumption = report.data?.byUnit ?? []

  return (
    <section dir="rtl" className="space-y-6" data-testid="ops-manager-dashboard">
      <ExecPageHeader
        icon="activity"
        title="مدير غرفة العمليات"
        subtitle="موافقات موظفي غرفة العمليات (إجازات وزمنيات وسلف وكشوفات) وتقارير الوقود الكاملة لبوابات الكراج."
        stats={[
          { label: 'بانتظار قرارك', value: tasks.isLoading ? '…' : tasks.isError ? '—' : pending, tone: pending ? 'red' : 'green', testId: 'opm-pending' },
          { label: 'إجازات وزمنيات', value: leaves },
          { label: 'سلف', value: advances },
          { label: 'كشوفات', value: disclosures },
        ]}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Link to="/ops-room-manager/approvals" data-testid="opm-card-approvals" className="group flex flex-col justify-between rounded-3xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-start justify-between">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#0b3d6b]/10 text-[#0b3d6b]"><CheckSquare /></span>
            <b className={`text-3xl tabular-nums ${pending ? 'text-red-600' : 'text-emerald-600'}`}>{tasks.isLoading ? '…' : pending}</b>
          </div>
          <div className="mt-4">
            <h2 className="text-lg font-black text-slate-900">طلبات الموافقة</h2>
            <p className="mt-1 text-xs text-slate-500">الإجازات والزمنيات والسلف والكشوفات التي وصلت إلى خطوتك في سلسلة الموافقات — الرفض يُنهي الطلب بسبب إلزامي.</p>
          </div>
          <span className="mt-4 inline-flex items-center gap-1 text-xs font-black text-[#0b3d6b]">فتح الموافقات <ArrowLeft size={15} className="transition group-hover:-translate-x-1" /></span>
        </Link>

        <Link to="/ops-room-manager/fuel-reports" data-testid="opm-card-fuel" className="group flex flex-col justify-between rounded-3xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-start justify-between">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-amber-700"><Fuel /></span>
            <b className="text-3xl tabular-nums text-amber-700">{report.isLoading ? '…' : num(report.data?.totalCount ?? 0)}</b>
          </div>
          <div className="mt-4">
            <h2 className="text-lg font-black text-slate-900">تقارير الوقود</h2>
            <p className="mt-1 text-xs text-slate-500">حركات الكاز والهيدروليك والدهن وC-Oil في كل مخازن الكراج والآليات — تقرير شامل وآلية واحدة ومجموعة آليات، مع تصدير Excel وCSV وطباعة مصممة.</p>
            {consumption.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {consumption.map((u) => (
                  <li key={u.unit} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">استهلاك {num(u.consumption)} {garageUnitLabel(u.unit)}</li>
                ))}
              </ul>
            )}
          </div>
          <span className="mt-4 inline-flex items-center gap-1 text-xs font-black text-amber-700">فتح التقارير <ArrowLeft size={15} className="transition group-hover:-translate-x-1" /></span>
        </Link>
      </div>

      <p className="rounded-2xl border border-dashed bg-white/70 p-4 text-[11px] leading-6 text-slate-500">
        هذه البوابة للعرض والقرار فقط: لا تُنشئ حركات وقود ولا تعدّل مخزوناً ولا ترى بيانات الموارد البشرية أو المالية.
        صلاحية الوقود هنا <b>قراءة كاملة لكل الشركة</b> بلا أي كتابة.
      </p>
    </section>
  )
}
