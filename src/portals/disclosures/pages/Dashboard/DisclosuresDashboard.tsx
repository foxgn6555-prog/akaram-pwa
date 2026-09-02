/**
 * لوحة وحدة الكشوفات — تقارير مجمّعة + رسوم بيانية + روابط الوحدات.
 */
import { useNavigate } from 'react-router'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
  PieChart, Pie, Legend,
} from 'recharts'
import { useDisclosureSummary } from '@features/disclosures'
import { VIOLATION_LABELS, type ViolationType } from '@features/disclosures/types'
import { Icon, type IconName } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const COLORS: Record<ViolationType, string> = {
  delay: '#f59e0b',
  absence: '#ef4444',
  collection: '#8b5cf6',
  evasion: '#0f7cb0',
  early_withdrawal: '#f97316',
  load_deficiency: '#14b8a6',
}

export default function DisclosuresDashboard() {
  const navigate = useNavigate()
  const { data: s, isLoading } = useDisclosureSummary()

  const stats = [
    { label: 'إجمالي الكشوفات', value: s?.total ?? 0, icon: 'file-text' as IconName, tone: 'bg-brand-50 text-brand-700' },
    { label: 'كشوفات اليوم', value: s?.today ?? 0, icon: 'calendar' as IconName, tone: 'bg-slate-100 text-slate-700' },
    { label: 'مسودات', value: s?.drafts ?? 0, icon: 'clipboard' as IconName, tone: 'bg-amber-50 text-amber-700' },
    { label: 'مرفوعة للمعاون', value: s?.submitted ?? 0, icon: 'send' as IconName, tone: 'bg-emerald-50 text-emerald-700' },
    { label: 'في الأرشيف المركزي', value: s?.archived ?? 0, icon: 'archive-box' as IconName, tone: 'bg-red-50 text-red-700' },
  ]

  const chartData = (Object.keys(VIOLATION_LABELS) as ViolationType[]).map((k) => ({
    name: VIOLATION_LABELS[k],
    count: s?.by_violation?.[k] ?? 0,
    key: k,
  }))

  // رسم الحالة: مسودة / مرفوعة / مؤرشفة
  const statusData = [
    { name: 'مسودات', value: s?.drafts ?? 0, color: '#f59e0b' },
    { name: 'مرفوعة للمعاون', value: s?.submitted ?? 0, color: '#10b981' },
    { name: 'في الأرشيف المركزي', value: s?.archived ?? 0, color: '#ef4444' },
  ].filter((d) => d.value > 0)

  const units = [
    { path: '/disclosures/statements', label: 'الكشوفات', hint: 'إنشاء وعرض الكشوفات', icon: 'file-text' as IconName },
    { path: '/disclosures/statements/new', label: 'إنشاء كشف', hint: 'كشف تأديبي جديد', icon: 'clipboard' as IconName },
    { path: '/disclosures/archive', label: 'الأرشيف', hint: 'الكشوفات المؤرشفة', icon: 'archive-box' as IconName },
  ]

  return (
    <div className="space-y-5" data-testid="disclosures-dashboard">
      <div>
        <h1 className="text-lg font-bold text-slate-800">وحدة الكشوفات</h1>
        <p className="text-sm text-slate-500">تقارير الكشوفات التأديبية ورسومها البيانية</p>
      </div>

      {isLoading ? (
        <div className="p-8"><LoadingSpinner label="جارٍ تجهيز التقارير…" /></div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="disc-stats">
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

      {/* الرسوم البيانية: أنواع المخالفات (أعمدة) + حالة الكشوفات (حلقي) */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="disc-violation-chart">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
            <Icon name="bar-chart" size={16} className="text-brand-600" />
            توزيع الكشوفات حسب نوع المخالفة
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 16, right: 12, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={56} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(v) => [`${v} كشف`, 'العدد']}
                  cursor={{ fill: 'rgba(0,95,141,0.06)' }}
                />
                <Bar dataKey="count" radius={[7, 7, 0, 0]} maxBarSize={48}>
                  {chartData.map((c) => (
                    <Cell key={c.key} fill={COLORS[c.key]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="disc-status-chart">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
            <Icon name="pie-chart" size={16} className="text-brand-600" />
            حالة الكشوفات
          </h2>
          <div className="h-64">
            {statusData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">
                لا توجد كشوفات بعد
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                  >
                    {statusData.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [`${v} كشف`, 'العدد']} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* روابط الوحدات */}
      <div>
        <h2 className="mb-2 text-sm font-bold text-slate-700">وحدات البوابة</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="disc-units">
          {units.map((u) => (
            <button
              key={u.path}
              onClick={() => navigate(u.path)}
              className="group flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
            >
              <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 group-hover:bg-brand-100">
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
