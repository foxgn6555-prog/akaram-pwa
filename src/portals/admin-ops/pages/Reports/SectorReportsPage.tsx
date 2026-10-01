/** بوابة مسؤول القاطع — التقارير: المتعهدون ومسؤولو الأقسام فقط (حضور العمال، إثبات التواجد، خارج النطاق، الخروجات، إجازات المسؤولين). لا بيانات مالية. مصمم للهاتف. */
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useSectorReports } from '@features/sector-manager/hooks'
import { PARENT_AR, SHIFT_AR, isoDay, pct } from '@features/sector-manager/format'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const PRESETS = [{ k: 7, l: 'آخر 7 أيام' }, { k: 30, l: 'آخر 30 يوماً' }, { k: 90, l: 'آخر 90 يوماً' }]
const ago = (n: number) => { const d = new Date(); d.setDate(d.getDate() - (n - 1)); return isoDay(d) }

export default function SectorReportsPage() {
  const [from, setFrom] = useState(ago(30)), [to, setTo] = useState(isoDay()), [tab, setTab] = useState<'contractors' | 'managers'>('contractors')
  const rep = useSectorReports(from, to)
  const r = rep.data
  return (
    <div className="space-y-4 pb-4" data-testid="sm-reports">
      <header>
        <h1 className="text-lg font-black">التقارير</h1>
        <p className="text-xs text-slate-600">المتعهدون ومسؤولو الأقسام في قواطعك: حضور، تواجد، خروجات، إجازات.</p>
      </header>
      <section className="rounded-2xl border bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => <button key={p.k} type="button" data-testid={`preset-${p.k}`} onClick={() => { setFrom(ago(p.k)); setTo(isoDay()) }} className={`rounded-full border px-3 py-1 text-xs font-bold ${from === ago(p.k) && to === isoDay() ? 'border-slate-900 bg-slate-900 text-white' : 'bg-white'}`}>{p.l}</button>)}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-[11px] font-bold">من<input type="date" data-testid="rep-from" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-10 w-full rounded-xl border px-2 text-sm font-normal" /></label>
          <label className="text-[11px] font-bold">إلى<input type="date" data-testid="rep-to" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 h-10 w-full rounded-xl border px-2 text-sm font-normal" /></label>
        </div>
      </section>
      {rep.isLoading || !r ? <LoadingSpinner /> : (
        <>
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="rep-totals">
            <Kpi label="حضور عمال" value={r.totals.present} tone="emerald" />
            <Kpi label="غياب عمال" value={r.totals.absent} tone="rose" />
            <Kpi label="نسبة الحضور" value={`${pct(r.totals.present, r.totals.present + r.totals.absent)}%`} tone="slate" />
            <Kpi label="إثباتات تواجد" value={r.totals.presence_proofs} tone="sky" />
            <Kpi label="خارج النطاق" value={r.totals.out_of_zone} tone={r.totals.out_of_zone ? 'rose' : 'slate'} />
            <Kpi label="خروجات آليات" value={r.totals.trips} tone="slate" />
          </section>

          <section className="rounded-2xl border bg-white p-3 shadow-sm">
            <h2 className="text-sm font-black">حضور/غياب العمال يومياً</h2>
            <div className="mt-2 h-56" data-testid="chart-attendance">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={r.series} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="d" tickFormatter={(v: string) => v.slice(5)} fontSize={10} interval="preserveStartEnd" />
                  <YAxis fontSize={10} allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="present" name="حاضر" stackId="a" fill="#059669" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="absent" name="غائب" stackId="a" fill="#e11d48" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="rounded-2xl border bg-white p-3 shadow-sm">
            <h2 className="text-sm font-black">إثبات تواجد المتعهدين يومياً</h2>
            <div className="mt-2 h-44" data-testid="chart-proofs">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={r.series} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="d" tickFormatter={(v: string) => v.slice(5)} fontSize={10} interval="preserveStartEnd" />
                  <YAxis fontSize={10} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="proofs" name="إثباتات" stroke="#4f46e5" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-3 shadow-sm">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
              <button type="button" data-testid="tab-contractors" onClick={() => setTab('contractors')} className={`h-9 rounded-lg text-xs font-black ${tab === 'contractors' ? 'bg-white shadow' : 'text-slate-600'}`}>المتعهدون ({r.contractors.length})</button>
              <button type="button" data-testid="tab-managers" onClick={() => setTab('managers')} className={`h-9 rounded-lg text-xs font-black ${tab === 'managers' ? 'bg-white shadow' : 'text-slate-600'}`}>مسؤولو الأقسام ({r.managers.length})</button>
            </div>
            {tab === 'contractors' ? (
              <ul className="mt-3 space-y-2" data-testid="rep-contractors">
                {r.contractors.length === 0 && <li className="text-center text-xs text-slate-500">لا متعهدين.</li>}
                {r.contractors.map((c) => (
                  <li key={c.user_id} className="rounded-xl border p-3 text-sm" data-testid={`rep-c-${c.user_id}`}>
                    <div className="flex items-center justify-between"><b>{c.name}</b><span className="text-[11px] text-slate-500">{c.area} · {PARENT_AR[c.parent_sector]}</span></div>
                    <div className="text-[11px] text-slate-500">مسؤول القسم: {c.manager_name} · {SHIFT_AR[c.shift] ?? c.shift} · {c.workers} عاملاً</div>
                    <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[11px]">
                      <Mini label="حضور" v={c.present} cls="text-emerald-700" /><Mini label="غياب" v={c.absent} cls="text-rose-700" /><Mini label="أيام إثبات" v={`${c.proof_days}/${r.days}`} cls="text-indigo-700" /><Mini label="خارج النطاق" v={c.out_of_zone_days} cls={c.out_of_zone_days ? 'text-rose-700' : 'text-slate-600'} />
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${pct(c.present, c.present + c.absent)}%` }} /></div>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="mt-3 space-y-2" data-testid="rep-managers">
                {r.managers.length === 0 && <li className="text-center text-xs text-slate-500">لا مسؤولي أقسام.</li>}
                {r.managers.map((m) => (
                  <li key={m.user_id} className="rounded-xl border p-3 text-sm" data-testid={`rep-m-${m.user_id}`}>
                    <div className="flex items-center justify-between"><b>{m.name}</b><span className="text-[11px] text-slate-500">{PARENT_AR[m.parent_sector]} · {SHIFT_AR[m.shift] ?? m.shift}</span></div>
                    <div className="text-[11px] text-slate-500">المناطق: {m.areas} · {m.contractors} متعهد</div>
                    <div className="mt-2 grid grid-cols-5 gap-1 text-center text-[11px]">
                      <Mini label="حضور" v={m.present} cls="text-emerald-700" /><Mini label="غياب" v={m.absent} cls="text-rose-700" /><Mini label="خروجات" v={m.trips} cls="text-sky-700" /><Mini label="أيام إجازة" v={m.leave_days} cls="text-amber-700" /><Mini label="زمنيات" v={m.permits} cls="text-slate-700" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
function Kpi({ label, value, tone }: { label: string; value: number | string; tone: 'slate' | 'emerald' | 'rose' | 'sky' }) {
  const t = { slate: 'bg-slate-50 text-slate-800', emerald: 'bg-emerald-50 text-emerald-800', rose: 'bg-rose-50 text-rose-800', sky: 'bg-sky-50 text-sky-800' }[tone]
  return <div className={`rounded-2xl border p-3 ${t}`}><div className="text-[11px] font-bold opacity-80">{label}</div><div className="text-xl font-black">{value}</div></div>
}
function Mini({ label, v, cls }: { label: string; v: number | string; cls: string }) {
  return <div className="rounded-lg bg-slate-50 py-1"><div className={`font-black ${cls}`}>{v}</div><div className="text-[10px] text-slate-500">{label}</div></div>
}
