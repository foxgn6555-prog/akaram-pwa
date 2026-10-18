/** لوحة مسؤول القسم — المؤشرات من متعهد المنطقة (عمال/حضور) وآليات تعمل الآن والطلبات والصور */
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { LiveShareCard } from '@features/live-tracking/LiveShareCard'
import { useManagerProfile, useSectorSummary, useSectors } from '@features/sector'
import { SHIFT_LABELS } from '@features/sector/types'
import { useManagerTeamSummary } from '@features/contractors/hooks'
import { Icon, type IconName } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
type Tone = 'cyan' | 'blue' | 'emerald' | 'amber' | 'violet' | 'rose' | 'slate' | 'teal'
const tones: Record<Tone, string> = {
  cyan: 'border-cyan-200 bg-cyan-50 text-cyan-800', blue: 'border-blue-200 bg-blue-50 text-blue-800', emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  amber: 'border-amber-200 bg-amber-50 text-amber-800', violet: 'border-violet-200 bg-violet-50 text-violet-800', rose: 'border-rose-200 bg-rose-50 text-rose-800',
  slate: 'border-slate-200 bg-slate-100 text-slate-800', teal: 'border-teal-200 bg-teal-50 text-teal-800',
}
export default function ManagerDashboard() {
  const navigate = useNavigate(), summary = useSectorSummary(), profile = useManagerProfile(), sectors = useSectors(), team = useManagerTeamSummary()
  const names = (profile.data?.sectors ?? []).map((id) => sectors.data?.find((s) => s.id === id)?.name ?? `منطقة ${id}`).join(' · ')
  const rows = team.data ?? []
  // 00258: العدد اليومي كما سجّله المتعهد (يشمله) بدل حاضر/غائب
  const headcount = rows.reduce((a, r) => a + (r.today_headcount ?? 0), 0), reported = rows.filter((r) => r.contractor_user_id).length, checkedIn = rows.filter((r) => r.contractor_checked_in).length
  const vehiclesNow = rows.reduce((a, r) => a + r.vehicles_now, 0), contractorsNames = rows.map((r) => r.contractor_name).filter(Boolean).join(' · ')
  const checkinTotal = Math.max(1, reported)
  // 00286: وحدة «مشاركة الموقع» — تفتح بطاقة المشاركة المباشرة في الرئيسية
  const [liveOpen, setLiveOpen] = useState(false)
  const liveRef = useRef<HTMLDivElement>(null)
  const openLive = () => { setLiveOpen(true); setTimeout(() => liveRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }
  const stats: Array<{ label: string; value: string; hint: string; icon: IconName; tone: Tone }> = [
    { label: 'العدد اليوم (المتعهد وعماله)', value: String(headcount), hint: contractorsNames ? `متعهد: ${contractorsNames}` : 'لا متعهد معيّن لمنطقتك بعد', icon: 'users', tone: 'cyan' },
    { label: 'آليات تعمل الآن', value: String(vehiclesNow), hint: 'في مناطق مسؤوليتك', icon: 'truck', tone: 'blue' },
    { label: 'إثبات التواجد اليوم', value: `${checkedIn}/${reported}`, hint: 'متعهدون أثبتوا تواجدهم في الموقع', icon: 'check-square', tone: 'emerald' },
    { label: 'بلاغات الأعطال', value: String(summary.data?.breakdowns ?? 0), hint: 'بلاغ مسجل', icon: 'alert-triangle', tone: 'amber' },
    { label: 'الكتب المرفوعة', value: String(summary.data?.submitted_supply ?? 0), hint: 'إلى معاون المدير', icon: 'send', tone: 'violet' },
    { label: 'الصور الميدانية', value: String(summary.data?.photos ?? 0), hint: 'صورة محفوظة', icon: 'photo', tone: 'rose' },
  ]
  const units: Array<{ path: string; label: string; hint: string; icon: IconName; tone: Tone }> = [
    { path: '#live-share', label: 'مشاركة الموقع', hint: 'بث موقعك المباشر لغرفة العمليات أثناء شفتك فقط', icon: 'map-pin', tone: 'emerald' },
    { path: '/manager/vehicle-trips', label: 'حركة الآليات', hint: 'الاستلام والمحطة والصيانة والعودة', icon: 'truck', tone: 'blue' },
    { path: '/manager/team', label: 'فريقي', hint: 'متعهد المنطقة والعدد اليومي والآليات العاملة الآن', icon: 'users', tone: 'cyan' },
    { path: '/manager/breakdown', label: 'الأعطال', hint: 'بلاغ عطل والعودة إلى العمل', icon: 'alert-triangle', tone: 'amber' },
    { path: '/manager/request', label: 'كتب المستلزمات', hint: 'إنشاء ورفع كتاب رسمي', icon: 'file-text', tone: 'violet' },
    { path: '/manager/complaints', label: 'شكاوى المواطنين', hint: 'الصور قبل وبعد والمعالجة', icon: 'check-square', tone: 'rose' },
    { path: '/manager/photos', label: 'الصور الميدانية', hint: 'رفع وتوثيق صور العمل', icon: 'photo', tone: 'teal' },
    { path: '/manager/archive', label: 'الأرشيف', hint: 'الطلبات والأعطال والصور السابقة', icon: 'archive-box', tone: 'slate' },
  ]
  return (
    <section dir="rtl" className="space-y-6" data-testid="manager-dashboard">
      <ExecPageHeader icon="home" title="بوابة مسؤول القسم" subtitle={<><span className="font-bold text-[#f3d06a]">مركز قيادة القسم الميداني</span> · {profile.data ? `${SHIFT_LABELS[profile.data.shift]}${names ? ` · مناطق المسؤولية: ${names}` : ''}` : 'متابعة الفريق والآليات والطلبات والأعمال الميدانية'}</>} />
      {liveOpen && <div ref={liveRef} id="live-share" data-testid="mgr-live-share"><LiveShareCard /></div>}
      {summary.isLoading || team.isLoading ? <div className="p-8"><LoadingSpinner label="جارٍ تجهيز مؤشرات القسم…" /></div> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6" data-testid="mgr-stats">
            {stats.map((item) => (
              <article key={item.label} className={`rounded-3xl border p-5 shadow-sm ${tones[item.tone]}`}>
                <span className="grid size-11 place-items-center rounded-2xl bg-white/80 shadow-sm"><Icon name={item.icon} size={21} /></span>
                <b className="mt-4 block text-3xl text-slate-950">{item.value}</b>
                <p className="mt-1 text-xs font-black text-slate-700">{item.label}</p>
                <small className="mt-1 block text-[10px] opacity-70">{item.hint}</small>
              </article>
            ))}
          </div>
          <div className="grid gap-5 xl:grid-cols-3">
            <article className="rounded-3xl border bg-white p-6 shadow-sm xl:col-span-2">
              <h2 className="font-black text-slate-900">وحدات العمل</h2>
              <p className="mt-1 text-xs text-slate-500">دخول سريع إلى العمليات اليومية المرتبطة بالقسم</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2" data-testid="mgr-units">
                {units.map((u) => (
                  <button key={u.path} type="button" data-testid={u.path === '#live-share' ? 'mgr-unit-live-share' : undefined} onClick={() => (u.path === '#live-share' ? openLive() : navigate(u.path))} className={`flex items-start gap-3 rounded-2xl border p-4 text-right transition hover:shadow ${tones[u.tone]}`}>
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/80"><Icon name={u.icon} size={18} /></span>
                    <span><b className="block text-sm text-slate-900">{u.label}</b><small className="text-[11px] opacity-80">{u.hint}</small></span>
                  </button>
                ))}
              </div>
            </article>
            <article className="rounded-3xl border bg-white p-6 shadow-sm">
              <h2 className="font-black text-slate-900">حالة الحضور اليوم</h2>
              <p className="mt-1 text-xs text-slate-500">إثبات تواجد المتعهدين في مواقعهم والعدد الذي سجّلوه (يشمل المتعهد)</p>
              <div className="mx-auto mt-7 grid size-44 place-items-center rounded-full" style={{ background: `conic-gradient(#10b981 0 ${(checkedIn / checkinTotal) * 100}%,#f43f5e ${(checkedIn / checkinTotal) * 100}% 100%)` }}>
                <div className="grid size-32 place-items-center rounded-full bg-white text-center"><b className="text-2xl text-slate-900">{Math.round((checkedIn / checkinTotal) * 100)}%</b><small className="text-[11px] text-slate-500">أثبتوا تواجدهم</small></div>
              </div>
              <dl className="mt-6 grid grid-cols-2 gap-3 text-center text-sm"><div className="rounded-2xl bg-emerald-50 p-3"><dt className="text-[11px] text-emerald-700">أثبتوا التواجد</dt><dd className="text-xl font-black text-emerald-800">{checkedIn}</dd></div><div className="rounded-2xl bg-cyan-50 p-3"><dt className="text-[11px] text-cyan-700">العدد المسجّل اليوم</dt><dd className="text-xl font-black text-cyan-800">{headcount}</dd></div></dl>
            </article>
          </div>
        </>
      )}
    </section>
  )
}
