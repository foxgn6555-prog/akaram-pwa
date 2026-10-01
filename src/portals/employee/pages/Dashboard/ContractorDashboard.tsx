/** بوابة المتعهد — الرئيسية: من أنا/منطقتي، حالة إثبات التواجد اليوم، ملخص الفريق، شبكة حضور الشهر */
import { Link } from 'react-router'
import { CalendarCheck, Camera, MapPin, UserCheck, UserX, Users } from 'lucide-react'
import { useContractorMe, useContractorMonthGrid } from '@features/contractors/hooks'
import { PARENT_AR, SHIFT_AR, daysInMonth, monthKey, timeAr, zoneLabel } from '@features/contractors/format'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'

export default function ContractorDashboard() {
  const me = useContractorMe(), grid = useContractorMonthGrid()
  if (me.isLoading) return <LoadingSpinner />
  if (!me.data) return <EmptyState title="لم تُعيَّن بعد متعهداً على منطقة" hint="تسند التطوير المركزية حسابك إلى مسؤول قسم فتُشتق منطقتك تلقائياً — بعدها تظهر وحدات الفريق والحضور" />
  const m = me.data, month = monthKey(), nDays = daysInMonth(month), today = Number(m.today.slice(8, 10))
  return (
    <div className="space-y-4" data-testid="contractor-dashboard">
      <header className="rounded-2xl border bg-white p-4 shadow-sm">
        <h1 className="text-xl font-black">{m.full_name}</h1>
        <p className="mt-1 text-sm text-slate-600">
          متعهد منطقة <b data-testid="my-area">{m.area_name}</b> · {PARENT_AR[m.parent_sector] ?? m.parent_sector} · شفت {SHIFT_AR[m.shift] ?? m.shift} · مسؤول القسم: <b data-testid="my-manager">{m.manager_name}</b>
        </p>
      </header>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={<Users size={18} />} label="أفراد الفريق" value={m.workers_count} testId="stat-workers" to="/employee/team" />
        <Stat icon={<UserCheck size={18} />} label="حاضرون اليوم" value={m.today_present} tone="emerald" testId="stat-present" to="/employee/attendance" />
        <Stat icon={<UserX size={18} />} label="غائبون اليوم" value={m.today_absent} tone="rose" testId="stat-absent" to="/employee/attendance" />
        <Stat icon={<CalendarCheck size={18} />} label="لم يُسجَّلوا بعد" value={m.today_unmarked} tone={m.today_unmarked ? 'amber' : 'slate'} testId="stat-unmarked" to="/employee/attendance" />
      </section>
      <section className={`rounded-2xl border p-4 ${m.checked_in_today ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`} data-testid="checkin-status">
        {m.checked_in_today ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-black text-emerald-800">✓ أثبتَّ تواجدك في الموقع اليوم الساعة {timeAr(m.checkin_at)}</span>
            <span className="inline-flex items-center gap-1 text-emerald-900"><MapPin size={14} />{zoneLabel(m.in_zone, m.zone_defined)}</span>
            <span className="inline-flex items-center gap-1 text-emerald-900"><Camera size={14} />صورتك وصورة العمال محفوظتان</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-bold text-amber-900">لم تُثبت تواجدك في موقع عملك اليوم بعد — أثبِت تواجدك (موقع + صور) ثم سجّل حضور العمال. حضورك الرسمي يُحتسب بالبصمة.</p>
            <Link to="/employee/attendance" className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-black text-white">إثبات التواجد الآن</Link>
          </div>
        )}
      </section>
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-black">حضور الفريق هذا الشهر</h2>
          <span className="text-xs text-slate-500">حاضر <b className="text-emerald-700">{m.month_present}</b> · غائب <b className="text-rose-700">{m.month_absent}</b> (يوم/عامل)</span>
        </div>
        {!grid.data?.length ? <p className="text-sm text-slate-500">لا عمال بعد — أضفهم من «فريقي».</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]" data-testid="month-grid">
              <thead><tr className="bg-slate-50 text-slate-600">
                <th className="sticky right-0 bg-slate-50 px-2 py-1 text-right">العامل</th>
                {Array.from({ length: nDays }, (_, i) => <th key={i} className={`px-1 py-1 ${i + 1 === today ? 'bg-brand-50 text-brand-700' : ''}`}>{i + 1}</th>)}
                <th className="px-2">ح</th><th className="px-2">غ</th>
              </tr></thead>
              <tbody>
                {grid.data.map((r) => (
                  <tr key={r.worker_id} className="border-t" data-testid={`grid-${r.worker_id}`}>
                    <td className="sticky right-0 whitespace-nowrap bg-white px-2 py-1 font-bold">{r.full_name}</td>
                    {Array.from({ length: nDays }, (_, i) => {
                      const s = r.days[String(i + 1)]
                      return <td key={i} className="px-1 py-1 text-center">
                        {s === 'present' ? <span className="inline-block size-4 rounded bg-emerald-500" title="حاضر" /> : s === 'absent' ? <span className="inline-block size-4 rounded bg-rose-500" title="غائب" /> : <span className="inline-block size-4 rounded bg-slate-100" />}
                      </td>
                    })}
                    <td className="px-2 text-center font-bold text-emerald-700">{r.present_days}</td>
                    <td className="px-2 text-center font-bold text-rose-700">{r.absent_days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
function Stat({ icon, label, value, tone = 'slate', testId, to }: { icon: React.ReactNode; label: string; value: number; tone?: 'slate' | 'emerald' | 'rose' | 'amber'; testId: string; to: string }) {
  const tones = { slate: 'bg-white text-slate-800', emerald: 'bg-emerald-50 text-emerald-800', rose: 'bg-rose-50 text-rose-800', amber: 'bg-amber-50 text-amber-800' }
  return (
    <Link to={to} className={`rounded-2xl border p-3 shadow-sm ${tones[tone]}`} data-testid={testId}>
      <div className="flex items-center justify-between text-xs font-bold opacity-80">{label}{icon}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
    </Link>
  )
}
