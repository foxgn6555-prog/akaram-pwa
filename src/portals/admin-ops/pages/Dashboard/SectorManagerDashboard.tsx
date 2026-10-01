/** بوابة مسؤول القاطع — الرئيسية (مصممة للهاتف أولاً): قواطعي، مؤشرات اليوم، الطلبات المعلّقة، مناطقي، فريقي. لا بيانات مالية. */
import { Link } from 'react-router'
import { AlertTriangle, Bell, CheckSquare, MapPin, Send, Truck, UserCheck, UserX, Users } from 'lucide-react'
import { useSectorDashboard, useSectorManagerMe as useSectorMe, useSectorTeam } from '@features/sector-manager/hooks'
import { PARENT_AR, SHIFT_AR, pct } from '@features/sector-manager/format'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'

export default function SectorManagerDashboard() {
  const me = useSectorMe(), dash = useSectorDashboard(), team = useSectorTeam()
  if (me.isLoading || dash.isLoading) return <LoadingSpinner />
  if (!me.data || !dash.data) return <EmptyState title="لم تُسنَد لك قواطع بعد" hint="تسند التطوير المركزية قاطعاً أو أكثر لحسابك — بعدها تظهر الوحدات" />
  const d = dash.data, total = d.present_today + d.absent_today
  return (
    <div className="space-y-4 pb-4" data-testid="sm-dashboard">
      <header className="rounded-2xl border bg-white p-4 shadow-sm">
        <h1 className="text-lg font-black">{me.data.full_name}</h1>
        <p className="mt-1 text-sm text-slate-600">مسؤول <b data-testid="sm-parents">{me.data.parent_names.join(' و')}</b> · {d.areas} منطقة · {d.department_managers} مسؤول قسم · {d.contractors} متعهد</p>
        {!me.data.has_employee && <p className="mt-2 rounded-xl bg-amber-50 p-2 text-[11px] font-bold text-amber-800" data-testid="sm-no-hr">حسابك غير مرتبط بسجل موظف — لن تتمكن من تقديم طلباتك حتى تربطه الموارد البشرية.</p>}
      </header>

      {d.pending_requests > 0 && (
        <Link to="/admin-ops/requests" className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4" data-testid="sm-pending-banner">
          <Bell className="text-amber-700" />
          <div className="flex-1"><div className="font-black text-amber-900">{d.pending_requests} طلب بانتظار قرارك</div><div className="text-[11px] text-amber-800">إجازات وزمنيات من فريقك</div></div>
          <span className="text-xs font-bold text-amber-900">افتح ←</span>
        </Link>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat icon={<UserCheck size={18} />} label="عمال حاضرون" value={d.present_today} tone="emerald" testId="st-present" />
        <Stat icon={<UserX size={18} />} label="عمال غائبون" value={d.absent_today} tone="rose" testId="st-absent" />
        <Stat icon={<MapPin size={18} />} label="متعهدون أثبتوا تواجدهم" value={`${d.presence_proved}/${d.contractors}`} tone={d.presence_proved === d.contractors ? 'emerald' : 'amber'} testId="st-proved" />
        <Stat icon={<AlertTriangle size={18} />} label="خارج النطاق" value={d.out_of_zone} tone={d.out_of_zone ? 'rose' : 'slate'} testId="st-out" />
        <Stat icon={<Truck size={18} />} label="آليات تعمل الآن" value={d.vehicles_now} tone="sky" testId="st-vehicles" />
        <Stat icon={<Users size={18} />} label="مسؤولون في إجازة" value={d.managers_on_leave} tone={d.managers_on_leave ? 'amber' : 'slate'} testId="st-leave" />
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm" data-testid="sm-attendance-ring">
        <div className="flex items-center gap-4">
          <div className="grid size-24 shrink-0 place-items-center rounded-full border-8 border-emerald-500 text-center" style={{ borderColor: total ? undefined : '#e2e8f0' }}>
            <b className="text-xl">{pct(d.present_today, total)}%</b>
          </div>
          <div className="text-sm">
            <div className="font-black">نسبة حضور عمال المتعهدين اليوم</div>
            <div className="text-slate-600">{d.workers} عاملاً مسجلاً · {total} سُجّل اليوم · {d.areas_without_contractor > 0 ? <span className="font-bold text-amber-700">{d.areas_without_contractor} منطقة بلا متعهد</span> : 'كل المناطق لها متعهد'}</div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2">
        <Quick to="/admin-ops/requests" icon={<CheckSquare size={18} />} label="طلبات فريقي" badge={d.pending_requests} />
        <Quick to="/admin-ops/reports" icon={<Users size={18} />} label="التقارير" />
        <Quick to="/admin-ops/notify" icon={<Send size={18} />} label="التبليغ" />
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="font-black">مسؤولو الأقسام</h2>
        {team.isLoading ? <LoadingSpinner /> : (team.data ?? []).length === 0 ? <p className="mt-2 text-xs text-slate-500">لا مسؤولي أقسام في قواطعك بعد.</p> : (
          <ul className="mt-3 space-y-2" data-testid="sm-team">
            {(team.data ?? []).map((m) => (
              <li key={m.manager_user_id} className="rounded-xl border p-3" data-testid={`sm-team-${m.manager_user_id}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-black">{m.manager_name} {m.on_leave_today && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">في إجازة اليوم</span>}</div>
                    <div className="text-[11px] text-slate-500">{PARENT_AR[m.parent_sector]} · {SHIFT_AR[m.shift] ?? m.shift}{m.manager_phone ? ` · ${m.manager_phone}` : ''}</div>
                  </div>
                  <div className="text-left text-[11px] text-slate-600"><div><b className="text-emerald-700">{m.present_today}</b> حاضر · <b className="text-rose-700">{m.absent_today}</b> غائب</div><div>{m.vehicles_now} آلية الآن</div></div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.areas.map((a) => (
                    <span key={a.id} className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${!a.contractor_user_id ? 'border-slate-300 bg-slate-50 text-slate-500' : a.checked_in ? (a.in_zone === false ? 'border-rose-300 bg-rose-50 text-rose-800' : 'border-emerald-300 bg-emerald-50 text-emerald-800') : 'border-amber-300 bg-amber-50 text-amber-800'}`}>
                      {a.name}{a.contractor_name ? ` · ${a.contractor_name}` : ' · بلا متعهد'}{a.contractor_user_id ? (a.checked_in ? (a.in_zone === false ? ' · خارج النطاق' : ' · في الموقع') : ' · لم يُثبت تواجده') : ''}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Stat({ icon, label, value, tone = 'slate', testId }: { icon: React.ReactNode; label: string; value: number | string; tone?: 'slate' | 'emerald' | 'rose' | 'amber' | 'sky'; testId: string }) {
  const tones = { slate: 'bg-slate-50 text-slate-800', emerald: 'bg-emerald-50 text-emerald-800', rose: 'bg-rose-50 text-rose-800', amber: 'bg-amber-50 text-amber-800', sky: 'bg-sky-50 text-sky-800' }
  return (
    <div className={`rounded-2xl border p-3 ${tones[tone]}`} data-testid={testId}>
      <div className="flex items-center gap-2 text-[11px] font-bold opacity-80">{icon}{label}</div>
      <div className="mt-1 text-2xl font-black">{value}</div>
    </div>
  )
}
function Quick({ to, icon, label, badge }: { to: string; icon: React.ReactNode; label: string; badge?: number }) {
  return (
    <Link to={to} className="relative flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border bg-white text-xs font-black shadow-sm">
      {icon}{label}
      {badge ? <span className="absolute -top-1 -left-1 rounded-full bg-rose-600 px-1.5 text-[10px] text-white">{badge}</span> : null}
    </Link>
  )
}
