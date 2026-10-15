/** بوابة المتابعة — الرئيسية (00259): نطاقي (مناطق/قاطع كامل)، إحصاءات اليوم، روابط الوحدات */
import { Link } from 'react-router'
import { CalendarCheck, MapPin, Users } from 'lucide-react'
import { useFollowUpMe } from '@features/follow-up/hooks'
import { PARENT_AR } from '@features/contractors/format'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'

export default function FollowUpDashboardPage() {
  const me = useFollowUpMe()
  if (me.isLoading) return <LoadingSpinner />
  if (!me.data) return <EmptyState title="لم يُحدَّد نطاق متابعتك بعد" hint="تسند التطوير المركزية حسابك إلى مناطق محددة أو قاطع كامل — بعدها تظهر وحدات المتابعة" />
  const m = me.data
  const scope = [
    ...m.parent_sectors.map((p) => `${PARENT_AR[p] ?? p} (كامل)`),
    ...m.areas.filter((a) => !m.parent_sectors.includes(a.parent_sector)).map((a) => a.name),
  ]
  return (
    <div className="space-y-4" data-testid="follow-up-dashboard">
      <ExecPageHeader icon="user" title={m.full_name} subtitle={<>المتابعة · نطاقك: <b data-testid="my-scope">{scope.join('، ') || '—'}</b> · {m.areas_count} منطقة · {m.contractors_count} متعهد</>} />
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={<Users size={18} />} label="متعهدون في نطاقك" value={m.contractors_count} testId="stat-contractors" to="/follow-up/workers" />
        <Stat icon={<MapPin size={18} />} label="أثبتوا التواجد اليوم" value={`${m.today_checked_in} / ${m.contractors_count}`} tone={m.today_checked_in >= m.contractors_count ? 'emerald' : 'amber'} testId="stat-checked-in" to="/follow-up/workers" />
        <Stat icon={<CalendarCheck size={18} />} label="أعداد سجّلتها اليوم" value={`${m.today_counted_by_me} / ${m.contractors_count}`} tone={m.today_counted_by_me >= m.contractors_count ? 'emerald' : 'rose'} testId="stat-counted" to="/follow-up/workers" />
        <Stat icon={<MapPin size={18} />} label="مناطق النطاق" value={m.areas_count} tone="slate" testId="stat-areas" to="/follow-up/workers" />
      </section>
      {m.today_counted_by_me < m.contractors_count && !m.month_locked && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4" data-testid="pending-banner">
          <p className="text-sm font-bold text-amber-900">بقي {m.contractors_count - m.today_counted_by_me} متعهد لم تسجّل عددهم اليوم — التسجيل متاح لهذا اليوم فقط ثم يُقفل.</p>
          <Link to="/follow-up/workers" className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-black text-white">متابعة العمال</Link>
        </section>
      )}
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="mb-2 font-black">مناطق نطاقك</h2>
        <ul className="flex flex-wrap gap-2" data-testid="areas-list">
          {m.areas.map((a) => <li key={a.id} className="rounded-full border bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700">{a.name} <span className="text-slate-400">· {PARENT_AR[a.parent_sector] ?? a.parent_sector}</span></li>)}
        </ul>
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
