/** بوابة العمليات الميدانية — الرئيسية (للهاتف أولاً): تعلو مسؤولي القواطع؛ مقارنة القاطعين، مؤشرات اليوم، طلبات بانتظار قراري، مسؤولو القواطع. لا بيانات مالية. */
import { Link } from 'react-router'
import { AlertTriangle, Bell, CheckSquare, MapPin, Send, Truck, UserCheck, UserX, Users } from 'lucide-react'
import { useSectorDashboard, useSectorManagerMe } from '@features/sector-manager/hooks'
import { pct } from '@features/sector-manager/format'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'

export default function FieldOpsDashboard() {
  const me = useSectorManagerMe(), dash = useSectorDashboard()
  if (me.isLoading || dash.isLoading) return <LoadingSpinner />
  if (!me.data || !dash.data) return <EmptyState title="تعذّر تحميل اللوحة" hint="تأكد أن حسابك يحمل دور العمليات الميدانية" />
  const d = dash.data, total = d.present_today + d.absent_today
  return (
    <div className="space-y-4 pb-4" data-testid="fo-dashboard">
      <header className="rounded-2xl border bg-white p-4 shadow-sm">
        <h1 className="text-lg font-black">{me.data.full_name}</h1>
        <p className="mt-1 text-sm text-slate-600">العمليات الميدانية · <b data-testid="fo-parents">{me.data.parent_names.join(' و')}</b> · {d.areas} منطقة · {d.sector_managers.length} مسؤول قاطع · {d.department_managers} مسؤول قسم · {d.contractors} متعهد</p>
        {!me.data.has_employee && <p className="mt-2 rounded-xl bg-amber-50 p-2 text-[11px] font-bold text-amber-800" data-testid="fo-no-hr">حسابك غير مرتبط بسجل موظف — لن تتمكن من تقديم طلباتك حتى تربطه الموارد البشرية.</p>}
      </header>

      {d.pending_requests > 0 && (
        <Link to="/field-ops/requests" className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4" data-testid="fo-pending-banner">
          <Bell className="text-amber-700" />
          <div className="flex-1"><div className="font-black text-amber-900">{d.pending_requests} طلب بانتظار قرارك</div><div className="text-[11px] text-amber-800">وصلت إلى دورك في سلسلة الموافقات</div></div>
          <span className="text-xs font-bold text-amber-900">افتح ←</span>
        </Link>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat icon={<UserCheck size={18} />} label="عمال حاضرون" value={d.present_today} tone="emerald" testId="st-present" />
        <Stat icon={<UserX size={18} />} label="عمال غائبون" value={d.absent_today} tone="rose" testId="st-absent" />
        <Stat icon={<MapPin size={18} />} label="متعهدون أثبتوا تواجدهم" value={`${d.presence_proved}/${d.contractors}`} tone={d.presence_proved === d.contractors ? 'emerald' : 'amber'} testId="st-proved" />
        <Stat icon={<AlertTriangle size={18} />} label="خارج النطاق" value={d.out_of_zone} tone={d.out_of_zone ? 'rose' : 'slate'} testId="st-out" />
        <Stat icon={<Truck size={18} />} label="آليات تعمل الآن" value={d.vehicles_now} tone="sky" testId="st-vehicles" />
        <Stat icon={<Users size={18} />} label="نسبة الحضور" value={`${pct(d.present_today, total)}%`} tone="slate" testId="st-rate" />
      </section>

      <section className="space-y-3" data-testid="fo-parents-compare">
        <h2 className="font-black">القواطع اليوم</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {d.parents_detail.map((p) => {
            const t = p.present_today + p.absent_today, rate = pct(p.present_today, t)
            return (
              <div key={p.code} className="rounded-2xl border bg-white p-4 shadow-sm" data-testid={`parent-${p.code}`}>
                <div className="flex items-start justify-between">
                  <div><div className="text-base font-black">قاطع {p.name}</div><div className="text-[11px] text-slate-500">مسؤول القاطع: <b>{p.sector_managers ?? 'غير مُسنَد'}</b></div></div>
                  <div className={`rounded-full px-2 py-1 text-xs font-black ${rate >= 80 ? 'bg-emerald-100 text-emerald-800' : rate >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>{rate}%</div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${rate}%` }} /></div>
                <div className="mt-3 grid grid-cols-3 gap-1 text-center text-[11px]">
                  <Mini label="حاضر" v={p.present_today} cls="text-emerald-700" /><Mini label="غائب" v={p.absent_today} cls="text-rose-700" /><Mini label="آليات الآن" v={p.vehicles_now} cls="text-sky-700" />
                  <Mini label="أثبتوا التواجد" v={`${p.presence_proved}/${p.contractors}`} cls="text-indigo-700" /><Mini label="خارج النطاق" v={p.out_of_zone} cls={p.out_of_zone ? 'text-rose-700' : 'text-slate-600'} /><Mini label="مناطق بلا متعهد" v={p.areas_without_contractor} cls={p.areas_without_contractor ? 'text-amber-700' : 'text-slate-600'} />
                </div>
                <div className="mt-2 text-[11px] text-slate-500">{p.areas} منطقة · {p.department_managers} مسؤول قسم · {p.contractors} متعهد</div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="grid grid-cols-4 gap-2">
        <Quick to="/field-ops/requests" icon={<CheckSquare size={18} />} label="الطلبات" badge={d.pending_requests} />
        <Quick to="/field-ops/sectors" icon={<Users size={18} />} label="القواطع" />
        <Quick to="/field-ops/reports" icon={<Truck size={18} />} label="التقارير" />
        <Quick to="/field-ops/notify" icon={<Send size={18} />} label="التبليغ" />
      </section>
    </div>
  )
}
function Stat({ icon, label, value, tone = 'slate', testId }: { icon: React.ReactNode; label: string; value: number | string; tone?: 'slate' | 'emerald' | 'rose' | 'amber' | 'sky'; testId: string }) {
  const tones = { slate: 'bg-slate-50 text-slate-800', emerald: 'bg-emerald-50 text-emerald-800', rose: 'bg-rose-50 text-rose-800', amber: 'bg-amber-50 text-amber-800', sky: 'bg-sky-50 text-sky-800' }
  return <div className={`rounded-2xl border p-3 ${tones[tone]}`} data-testid={testId}><div className="flex items-center gap-2 text-[11px] font-bold opacity-80">{icon}{label}</div><div className="mt-1 text-2xl font-black">{value}</div></div>
}
function Mini({ label, v, cls }: { label: string; v: number | string; cls: string }) {
  return <div className="rounded-lg bg-slate-50 py-1"><div className={`font-black ${cls}`}>{v}</div><div className="text-[10px] text-slate-500">{label}</div></div>
}
function Quick({ to, icon, label, badge }: { to: string; icon: React.ReactNode; label: string; badge?: number }) {
  return (
    <Link to={to} className="relative flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border bg-white text-xs font-black shadow-sm">
      {icon}{label}{badge ? <span className="absolute -top-1 -left-1 rounded-full bg-rose-600 px-1.5 text-[10px] text-white">{badge}</span> : null}
    </Link>
  )
}
