/**
 * الرئيسية — بوابة مسؤول القسم:
 * ملخص الوحدات (فريق · طلبات · أعطال · صور · حضورية اليوم) + روابط سريعة.
 */
import { useNavigate } from 'react-router'
import { useSectorSummary, useManagerProfile, useSectors } from '@features/sector'
import { SHIFT_LABELS } from '@features/sector/types'
import { Icon, type IconName } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

interface Stat {
  label: string
  value: string
  icon: IconName
  tone: string
}

export default function ManagerDashboard() {
  const navigate = useNavigate()
  const { data: summary, isLoading } = useSectorSummary()
  const { data: profile } = useManagerProfile()
  const { data: sectors } = useSectors()

  const sectorNames = (profile?.sectors ?? [])
    .map((id) => sectors?.find((s) => s.id === id)?.name ?? `قاطع ${id}`)
    .join(' · ')

  const stats: Stat[] = [
    { label: 'عمال فريقي', value: String(summary?.workers ?? 0), icon: 'users', tone: 'bg-brand-50 text-brand-700' },
    { label: 'الآليات', value: String(summary?.vehicles ?? 0), icon: 'truck', tone: 'bg-slate-100 text-slate-700' },
    { label: 'كتب مرفوعة للمعاون', value: String(summary?.submitted_supply ?? 0), icon: 'send', tone: 'bg-emerald-50 text-emerald-700' },
    { label: 'بلاغات الأعطال', value: String(summary?.breakdowns ?? 0), icon: 'alert-triangle', tone: 'bg-amber-50 text-amber-700' },
    { label: 'صور مرفوعة', value: String(summary?.photos ?? 0), icon: 'photo', tone: 'bg-indigo-50 text-indigo-700' },
    { label: 'حضور اليوم', value: `${summary?.present_today ?? 0} حاضر · ${summary?.absent_today ?? 0} غائب`, icon: 'check-square', tone: 'bg-teal-50 text-teal-700' },
  ]

  const units: Array<{ path: string; label: string; hint: string; icon: IconName }> = [
    { path: '/manager/team', label: 'فريقي', hint: 'العمال والآليات حسب القاطع', icon: 'users' },
    { path: '/manager/request', label: 'إنشاء طلب', hint: 'كتاب مستلزمات قاطع رسمي', icon: 'file-text' },
    { path: '/manager/attendance', label: 'حضورية العمال', hint: 'حاضر/غائب لعمال قواطعك', icon: 'calendar' },
    { path: '/manager/breakdown', label: 'عطل آلية', hint: 'بلاغ عطل برقم DB', icon: 'alert-triangle' },
    { path: '/manager/photos', label: 'إرسال صور', hint: 'رفع صور ميدانية', icon: 'photo' },
    { path: '/manager/complaints', label: 'شكاوى المواطنين', hint: 'تذاكر قبل/بعد والمعالجة الميدانية', icon: 'check-square' },
    { path: '/manager/complaints-guidance', label: 'إرشادات الشكاوى', hint: 'شرح التصوير والموقع والتدقيق', icon: 'file-text' },
    { path: '/manager/archive', label: 'الأرشيف', hint: 'الطلبات والأعطال والصور', icon: 'archive-box' },
  ]

  return (
    <div className="space-y-5" data-testid="manager-dashboard">
      <div>
        <h1 className="text-lg font-bold text-slate-800">بوابة مسؤول القسم</h1>
        <p className="text-sm text-slate-500">
          {profile
            ? `${SHIFT_LABELS[profile.shift]}${sectorNames ? ` · قواطعك: ${sectorNames}` : ''}`
            : 'ملخص الوحدات والتقارير'}
        </p>
      </div>

      {isLoading ? (
        <div className="p-8"><LoadingSpinner label="جارٍ تجهيز الملخص…" /></div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="mgr-stats">
          {stats.map((st) => (
            <div key={st.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className={`mb-2 flex size-9 items-center justify-center rounded-xl ${st.tone}`}>
                <Icon name={st.icon} size={18} />
              </span>
              <p className="text-sm font-bold text-slate-800">{st.value}</p>
              <p className="text-[11px] text-slate-500">{st.label}</p>
            </div>
          ))}
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-bold text-slate-700">وحدات البوابة</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="mgr-units">
          {units.map((u) => (
            <button
              key={u.path}
              onClick={() => navigate(u.path)}
              className="group flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
            >
              <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-100">
                <Icon name={u.icon} size={24} />
              </span>
              <span className="text-sm font-bold text-slate-800">{u.label}</span>
              <span className="text-xs leading-5 text-slate-500">{u.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
