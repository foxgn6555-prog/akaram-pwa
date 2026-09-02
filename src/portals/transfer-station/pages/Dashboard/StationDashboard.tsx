/**
 * لوحة المحطة التحويلية — تقارير مجمّعة من الوحدات والأمور المهمة:
 *  · سجلات اليوم · الإجمالي · بانتظار التدقيق · مُرسل لغرفة العمليات · المؤرشف
 *  · إجمالي الأطنان (اليوم/الفترة)
 *  · روابط سريعة للوحدات + تنبيهات مهمة
 */
import { useNavigate } from 'react-router'
import { useWeightSummary } from '@features/transfer-station'
import { Icon, type IconName } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

interface Stat {
  label: string
  value: string
  icon: IconName
  tone: string
}

export default function StationDashboard() {
  const navigate = useNavigate()
  const { data: s, isLoading } = useWeightSummary()

  const stats: Stat[] = [
    { label: 'سجلات اليوم', value: String(s?.today_records ?? 0), icon: 'scale', tone: 'bg-brand-50 text-brand-700' },
    { label: 'إجمالي السجلات', value: String(s?.total_records ?? 0), icon: 'list', tone: 'bg-slate-100 text-slate-700' },
    { label: 'بانتظار التدقيق', value: String(s?.pending_ops ?? 0), icon: 'file-text', tone: 'bg-amber-50 text-amber-700' },
    { label: 'مُرسل لغرفة العمليات', value: String(s?.submitted_ops ?? 0), icon: 'send', tone: 'bg-emerald-50 text-emerald-700' },
    { label: 'أطنان اليوم', value: `${(s?.today_net_tons ?? 0).toFixed(2)} طن`, icon: 'bar-chart', tone: 'bg-indigo-50 text-indigo-700' },
    { label: 'في الأرشيف المركزي', value: String(s?.archived ?? 0), icon: 'archive-box', tone: 'bg-red-50 text-red-700' },
  ]

  const quick: Array<{ path: string; label: string; hint: string; icon: IconName }> = [
    { path: '/transfer-station/weights', label: 'الأوزان', hint: 'تسجيل ودفاتر الشفتات', icon: 'scale' },
    { path: '/transfer-station/weights/log', label: 'تسجيل الأوزان', hint: 'إدخال سجل جديد', icon: 'clipboard' },
    { path: '/transfer-station/attendance', label: 'الحضورية', hint: 'حضور وانصراف الموظفين', icon: 'calendar' },
    { path: '/transfer-station/saksat', label: 'السكسات الخارجة', hint: 'قيد الإعداد', icon: 'send' },
    { path: '/transfer-station/trips', label: 'النسافات الخارجة', hint: 'قيد الإعداد', icon: 'truck' },
    { path: '/transfer-station/fines', label: 'الغرامات', hint: 'قيد الإنشاء', icon: 'alert-triangle' },
    { path: '/transfer-station/archive', label: 'الأرشيف', hint: 'السجلات والأرشفة المركزية', icon: 'archive-box' },
  ]

  return (
    <div className="space-y-5" data-testid="station-dashboard">
      <div>
        <h1 className="text-lg font-bold text-slate-800">المحطة التحويلية</h1>
        <p className="text-sm text-slate-500">تقارير الوحدات والأمور المهمة</p>
      </div>

      {/* بطاقات إحصائية */}
      {isLoading ? (
        <div className="p-8"><LoadingSpinner label="جارٍ تجهيز التقارير…" /></div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="dash-stats">
          {stats.map((st) => (
            <div key={st.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className={`mb-2 flex size-9 items-center justify-center rounded-xl ${st.tone}`}>
                <Icon name={st.icon} size={18} />
              </span>
              <p className="text-lg font-bold text-slate-800">{st.value}</p>
              <p className="text-[11px] text-slate-500">{st.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* تنبيه مهم */}
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <Icon name="alert-triangle" size={20} className="mt-0.5 shrink-0" />
        <p className="leading-6">
          تذكير: بعد إدخال دفتر الشفت ومراجعته، استخدم <b>«تصدير ← إرسال إلى غرفة العمليات»</b> لتسليمه للتدقيق.
          الحذف من الأرشيف ينقل السجل إلى التطوير المركزية (IT) ويُنبّههم تلقائياً.
        </p>
      </div>

      {/* روابط الوحدات */}
      <div>
        <h2 className="mb-2 text-sm font-bold text-slate-700">وحدات المحطة</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="dash-units">
          {quick.map((q) => (
            <button
              key={q.path}
              onClick={() => navigate(q.path)}
              className="group flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
            >
              <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-100">
                <Icon name={q.icon} size={24} />
              </span>
              <span className="text-sm font-bold text-slate-800">{q.label}</span>
              <span className="text-xs leading-5 text-slate-500">{q.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
