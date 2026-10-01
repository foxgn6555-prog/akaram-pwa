/** بوابة العمليات الميدانية — القواطع والمسؤولون: مسؤولو القواطع (من يشغل كل قاطع، حالته، ما ينتظره)، وتحتهم مسؤولو الأقسام ومناطقهم. لا بيانات مالية. */
import { useState } from 'react'
import { Phone } from 'lucide-react'
import { useFieldOpsSectorManagers, useSectorTeam } from '@features/sector-manager/hooks'
import { PARENT_AR, SHIFT_AR, pct } from '@features/sector-manager/format'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

type Parent = 'karrada' | 'zaafaraniya'
export default function SectorsPage() {
  const sms = useFieldOpsSectorManagers(), team = useSectorTeam()
  const [parent, setParent] = useState<Parent>('karrada')
  if (sms.isLoading || team.isLoading) return <LoadingSpinner />
  const managers = (sms.data ?? []).filter((m) => m.parent_sectors.includes(parent))
  const dms = (team.data ?? []).filter((m) => m.parent_sector === parent)
  return (
    <div className="space-y-4 pb-4" data-testid="fo-sectors">
      <header>
        <h1 className="text-lg font-black">القواطع والمسؤولون</h1>
        <p className="text-xs text-slate-600">مسؤول القاطع يرأس مسؤولي أقسام قاطعه، وأنت تعلو الجميع.</p>
      </header>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        {(['karrada', 'zaafaraniya'] as Parent[]).map((k) => (
          <button key={k} type="button" data-testid={`sectors-tab-${k}`} onClick={() => setParent(k)} className={`h-10 rounded-lg text-sm font-black ${parent === k ? 'bg-white shadow' : 'text-slate-600'}`}>{PARENT_AR[k]}</button>
        ))}
      </div>

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-black">مسؤول القاطع</h2>
        {managers.length === 0 ? <p className="mt-2 rounded-xl bg-amber-50 p-2 text-xs font-bold text-amber-800" data-testid="sm-unassigned">لم يُسنَد مسؤول لهذا القاطع بعد — يُسنَد من التطوير المركزية.</p> : (
          <ul className="mt-2 space-y-2" data-testid="fo-sm-list">
            {managers.map((m) => {
              const t = m.present_today + m.absent_today
              return (
                <li key={m.user_id} className="rounded-xl border p-3" data-testid={`fo-sm-${m.user_id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-black">{m.full_name} {m.on_leave_today && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">في إجازة اليوم</span>}</div>
                      <div className="text-[11px] text-slate-500">{m.parent_names.join(' و')} · {m.department_managers} مسؤول قسم · {m.contractors} متعهد{!m.has_employee && ' · غير مرتبط بسجل موظف'}</div>
                    </div>
                    {m.pending_tasks > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-800" data-testid={`fo-sm-pending-${m.user_id}`}>{m.pending_tasks} طلب بانتظاره</span>}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-600">
                    <span><b className="text-emerald-700">{m.present_today}</b> حاضر</span><span><b className="text-rose-700">{m.absent_today}</b> غائب</span><span>{pct(m.present_today, t)}%</span><span>{m.presence_proved}/{m.contractors} أثبتوا التواجد</span>
                    {m.phone && <a href={`tel:${m.phone}`} className="mr-auto flex items-center gap-1 font-bold text-indigo-700"><Phone size={12} />{m.phone}</a>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-black">مسؤولو الأقسام ({dms.length})</h2>
        {dms.length === 0 ? <p className="mt-2 text-xs text-slate-500">لا مسؤولي أقسام في هذا القاطع.</p> : (
          <ul className="mt-2 space-y-2" data-testid="fo-dm-list">
            {dms.map((m) => (
              <li key={m.manager_user_id} className="rounded-xl border p-3" data-testid={`fo-dm-${m.manager_user_id}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-black">{m.manager_name} {m.on_leave_today && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">في إجازة اليوم</span>}</div>
                    <div className="text-[11px] text-slate-500">{SHIFT_AR[m.shift] ?? m.shift}{m.manager_phone ? ` · ${m.manager_phone}` : ''}</div>
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
