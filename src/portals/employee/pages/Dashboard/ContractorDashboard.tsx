/** بوابة المتعهد — الرئيسية (00258): من أنا/منطقتي، حالة إثبات التواجد اليوم، العدد اليوم، سجل أيام الشهر بالأعداد */
import { Link } from 'react-router'
import { CalendarCheck, Camera, MapPin, Users } from 'lucide-react'
import { useContractorMe, useContractorMyMonth } from '@features/contractors/hooks'
import { PARENT_AR, SHIFT_AR, timeAr, zoneLabel } from '@features/contractors/format'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'

export default function ContractorDashboard() {
  const me = useContractorMe(), month = useContractorMyMonth()
  if (me.isLoading) return <LoadingSpinner />
  if (!me.data) return <EmptyState title="لم تُعيَّن بعد متعهداً على منطقة" hint="تسند التطوير المركزية حسابك إلى مسؤول قسم فتُشتق منطقتك تلقائياً — بعدها تظهر وحدات التواجد والصور" />
  const m = me.data
  return (
    <div className="space-y-4" data-testid="contractor-dashboard">
      <ExecPageHeader icon="user" title={m.full_name} subtitle={<>متعهد منطقة <b data-testid="my-area">{m.area_name}</b> · {PARENT_AR[m.parent_sector] ?? m.parent_sector} · شفت {SHIFT_AR[m.shift] ?? m.shift} · مسؤول القسم: <b data-testid="my-manager">{m.manager_name}</b></>} />
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={<Users size={18} />} label="العدد اليوم (أنت + العمال)" value={m.today_headcount ?? '—'} tone="emerald" testId="stat-headcount" to="/employee/attendance" />
        <Stat icon={<CalendarCheck size={18} />} label="أيام مسجّلة هذا الشهر" value={m.month_days} testId="stat-month-days" to="/employee/attendance" />
        <Stat icon={<Users size={18} />} label="مجموع الأعداد هذا الشهر" value={m.month_headcount_total} tone="slate" testId="stat-month-total" to="/employee/attendance" />
        <Stat icon={<Camera size={18} />} label="إرسال الصور" value="→" tone="amber" testId="stat-photos" to="/employee/photos" />
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
            <p className="text-sm font-bold text-amber-900">لم تُثبت تواجدك في موقع عملك اليوم بعد — أثبِت تواجدك (موقع + صور) وسجّل العدد (يشملك أنت). حضورك الرسمي يُحتسب بالبصمة.</p>
            <Link to="/employee/attendance" className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-black text-white">إثبات التواجد الآن</Link>
          </div>
        )}
      </section>
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-black">سجل الشهر</h2>
        {!month.data?.length ? <p className="text-sm text-slate-500">لا أيام بعد.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]" data-testid="month-log">
              <thead><tr className="bg-slate-50 text-slate-600"><th className="px-2 py-1 text-right">اليوم</th><th className="px-2 py-1">إثبات التواجد</th><th className="px-2 py-1">النطاق</th><th className="px-2 py-1">العدد</th><th className="px-2 py-1">العمال</th></tr></thead>
              <tbody>
                {month.data.map((d) => (
                  <tr key={d.log_date} className="border-t" data-testid={`day-${d.log_date}`}>
                    <td className="px-2 py-1 font-bold">{d.log_date}</td>
                    <td className="px-2 py-1 text-center">{d.checked_in ? <span className="font-bold text-emerald-700">✓ {timeAr(d.checkin_at)}</span> : <span className="text-rose-600">—</span>}</td>
                    <td className="px-2 py-1 text-center text-slate-600">{d.checked_in ? zoneLabel(d.in_zone) : '—'}</td>
                    <td className="px-2 py-1 text-center font-black">{d.headcount ?? '—'}</td>
                    <td className="px-2 py-1 text-center text-slate-600">{d.headcount != null ? Math.max(0, d.headcount - 1) : '—'}</td>
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
function Stat({ icon, label, value, tone = 'slate', testId, to }: { icon: React.ReactNode; label: string; value: number | string; tone?: 'slate' | 'emerald' | 'rose' | 'amber'; testId: string; to: string }) {
  const tones = { slate: 'bg-white text-slate-800', emerald: 'bg-emerald-50 text-emerald-800', rose: 'bg-rose-50 text-rose-800', amber: 'bg-amber-50 text-amber-800' }
  return (
    <Link to={to} className={`rounded-2xl border p-3 shadow-sm ${tones[tone]}`} data-testid={testId}>
      <div className="flex items-center justify-between text-xs font-bold opacity-80">{label}{icon}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
    </Link>
  )
}
