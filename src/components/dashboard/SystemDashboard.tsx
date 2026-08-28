import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { useDbOverview, useDbStats } from '@features/system'
import { useUsers } from '@features/user-management'
import { useConnectionHistory, useLiveLatency } from '@features/metrics'
import { useIntegrationLogs } from '@features/integrations'
import { ROLE_LABELS, type Role } from '@lib/constants/roles.constants'
import { formatFileSize } from '@lib/utils/file.utils'
import { formatNumber as fmtNum } from '@lib/utils/format.utils'
import { Icon, type IconName } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

/**
 * ═══ لوحة البوابة التقنية — كل الأرقام حقيقية 100% ═══
 *  · سرعة الاتصال: قياس فعلي (performance.now + نداء REST) كل دقيقة
 *  · قاعدة البيانات: db_overview + connection_history
 *  · أداء التطبيق: Performance API (navigation timing حقيقي)
 *  · التوزيعات: users + integration_logs
 */
export default function ITDashboard() {
  const navigate = useNavigate()
  const { data: overview, isLoading: oLoading } = useDbOverview()
  const { data: dbStats } = useDbStats()
  const { data: users } = useUsers()
  const { data: connHistory } = useConnectionHistory()
  const liveLatency = useLiveLatency()
  const { data: logs } = useIntegrationLogs()

  // قياس فعلي عند التحميل + كل دقيقة
  useEffect(() => {
    liveLatency.mutate()
    const timer = window.setInterval(() => liveLatency.mutate(), 60_000)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // آخر قياس فعلي
  const lastSample = connHistory && connHistory.length > 0
    ? connHistory[connHistory.length - 1]
    : null
  const latency = lastSample?.ms ?? 0

  // Performance API حقيقي — وقت تحميل الصفحة الفعلي
  const [navTiming, setNavTiming] = useState<{ dns: number; ttfb: number; dom: number } | null>(null)
  useEffect(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    if (nav) {
      setNavTiming({
        dns: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
        ttfb: Math.round(nav.responseStart - nav.requestStart),
        dom: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
      })
    }
  }, [])

  if (oLoading) return <LoadingSpinner label="جارٍ تجهيز اللوحة…" />

  const userCount = users?.length ?? 0
  const noRoleCount = users?.filter((u) => u.roles.length === 0).length ?? 0
  const openErrorsCount = overview?.open_errors ?? 0

  // توزيع الأدوار (حقيقي)
  const roleCounts = new Map<string, number>()
  for (const u of users ?? []) for (const r of u.roles) roleCounts.set(r, (roleCounts.get(r) ?? 0) + 1)
  const roleData = [...roleCounts.entries()].map(([role, count]) => ({
    name: ROLE_LABELS[role as Role] ?? role,
    value: count,
  }))

  // تكاملات آخر سجلات (نجاح/رفض)
  const integrationStats = [
    { name: 'ناجح', value: logs?.filter((l) => l.status === 'success').length ?? 0 },
    { name: 'مرفوض', value: logs?.filter((l) => l.status === 'rejected').length ?? 0 },
    { name: 'خطأ', value: logs?.filter((l) => l.status === 'error').length ?? 0 },
  ]

  // أعلى الجداول حسب الحجم (حقيقي من db_stats)
  const topTables = (dbStats ?? []).slice(0, 6).map((s) => ({
    name: s.table_name.slice(0, 12),
    حجم: Math.round(s.total_bytes / 1024),
  }))

  // data history للـ connection
  const connData = (connHistory ?? []).map((h) => ({
    time: new Date(h.at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }),
    latency: h.ms,
  }))

  const latencyColor = latency === 0 ? '#94a3b8' : latency < 200 ? '#10b981' : latency < 500 ? '#f59e0b' : '#ef4444'

  // متوسط وحد وأدنى قياس (من التاريخ الفعلي)
  const latencies = (connHistory ?? []).map((c) => c.ms)
  const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0
  const minLatency = latencies.length > 0 ? Math.min(...latencies) : 0
  const maxLatency = latencies.length > 0 ? Math.max(...latencies) : 0

  // النظام: معلومات فعلي
  const dbVersion = overview?.version ?? ''

  return (
    <section aria-labelledby="it-dash-title" className="space-y-5">
      <div>
        <h1 id="it-dash-title" className="text-lg font-bold">لوحة البوابة التقنية</h1>
        <p className="text-sm text-slate-500">كل الأرقام حية من قاعدة البيانات والقياسات الفعلية</p>
      </div>

      {/* ── البطاقات الحية ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="dash-stats">
        <StatCard icon="wifi-off" label="زمن الاستجابة" value={latency > 0 ? `${latency} م.ث` : '…'}
                  tone={latencyColor} />
        <StatCard icon="activity" label="متوسط القياسات" value={avgLatency > 0 ? `${avgLatency} م.ث` : '…'} />
        <StatCard icon="database" label="حجم القاعدة" value={formatFileSize(overview?.db_size_bytes ?? 0)} />
        <StatCard icon="users" label="المستخدمون" value={fmtNum(userCount)} />
        <StatCard icon="alert-triangle" label="أخطاء مفتوحة" value={fmtNum(openErrorsCount)}
                  tone={openErrorsCount > 0 ? '#ef4444' : '#10b981'} />
      </div>

      {/* ── شريط معلومات النظام الحي ── */}
      <div className="flex flex-wrap gap-4 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-2.5 text-[11px] text-slate-500">
        <span>PostgreSQL <b dir="ltr">{dbVersion}</b></span>
        <span>·</span>
        <span>الجداول: <b>{overview?.tables_count ?? 0}</b></span>
        <span>·</span>
        <span>إجمالي الصفوف: ≈ <b>{fmtNum(overview?.total_rows ?? 0)}</b></span>
        <span>·</span>
        <span>قياسات: أدنى <b>{minLatency || '—'}</b> · متوسط <b>{avgLatency || '—'}</b> · أقصى <b>{maxLatency || '—'}</b> م.ث</span>
      </div>

      {/* ── سرعة الاتصال (خطي حي) ── */}
      <ChartCard title="سرعة الاتصال بالخادم — قياس فعلي كل دقيقة" testId="chart-connection"
                 hint={latency > 0 ? `آخر قياس: ${latency} م.ث` : 'جارٍ القياس الأول…'}>
        {connData.length > 1 ? (
          <ResponsiveContainer width="100%" height={220} debounce={1} className="w-full">
            <LineChart data={connData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit=" م.ث" />
              <Tooltip formatter={(v) => [`${v} م.ث`, 'زمن الاستجابة']} />
              <Line type="monotone" dataKey="latency" stroke={latencyColor}
                    strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <ChartPlaceholder text="جارٍ جمع قياسين على الأقل… (يُقاس كل دقيقة تلقائياً)" />
        )}
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── قاعدة البيانات (أعمدة حقيقية) ── */}
        <ChartCard title="حجم الجداول (كيلوبايت — من pg_stat)" testId="chart-db">
          {topTables.length > 0 ? (
            <ResponsiveContainer width="100%" height={220} debounce={1} className="w-full">
              <BarChart data={topTables} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} unit=" KB" />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => [`${v} KB`, 'الحجم']} />
                <Bar dataKey="حجم" fill="#005f8d" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartPlaceholder text="لا بيانات جداول بعد" />
          )}
        </ChartCard>

        {/* ── أداء التطبيق (Performance API حقيقي) ── */}
        <ChartCard title="أداء تحميل التطبيق — Performance API فعلي" testId="chart-perf">
          {navTiming ? (
            <ResponsiveContainer width="100%" height={220} debounce={1} className="w-full">
              <BarChart data={[
                { name: 'DNS', value: navTiming.dns },
                { name: 'الاستجابة الأولى', value: navTiming.ttfb },
                { name: 'DOM جاهز', value: navTiming.dom },
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit=" م.ث" />
                <Tooltip formatter={(v) => [`${v} م.ث`, 'المدة']} />
                <Bar dataKey="value" fill="#ffca00" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartPlaceholder text="Performance API غير متاح في هذا المتصفح" />
          )}
        </ChartCard>

        {/* ── توزيع الأدوار ── */}
        <ChartCard title="توزيع المستخدمين على الأدوار" testId="chart-roles">
          {roleData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220} debounce={1} className="w-full">
              <BarChart data={roleData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" name="عدد المستخدمين" fill="#0f7cb0" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartPlaceholder text="لا مستخدمين بعد" />
          )}
        </ChartCard>

        {/* ── التكاملات ── */}
        <ChartCard title="تكاملات آخر سجلات (بصمة/GPS)" testId="chart-integrations">
          <ResponsiveContainer width="100%" height={220} debounce={1} className="w-full">
            <BarChart data={integrationStats}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" name="عدد النداءات" radius={[4, 4, 0, 0]}>
                {integrationStats.map((_, i) => (
                  <Bar key={i} dataKey="value"
                       fill={['#10b981', '#f59e0b', '#ef4444'][i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── روابط سريعة ── */}
      <div className="grid gap-3 sm:grid-cols-4" data-testid="quick-actions">
        <QuickAction icon="user-plus" title="إنشاء مستخدم" onClick={() => navigate('/it/user-management/create')} />
        <QuickAction icon="layout-grid" title="الهيكل التنظيمي" onClick={() => navigate('/it/user-management/departments')} />
        <QuickAction icon="activity" title="أخطاء التطبيق" hint={`${openErrorsCount} مفتوح`} onClick={() => navigate('/it/database/errors')} />
        <QuickAction icon="database" title="قاعدة البيانات" onClick={() => navigate('/it/database')} />
      </div>

      {/* تنبيه بلا أدوار */}
      {noRoleCount > 0 && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">
          ⚠️ {noRoleCount} مستخدم بلا أي دور
        </p>
      )}
    </section>
  )
}

function ChartCard({ title, testId, hint, children }: {
  title: string
  testId: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={testId}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-700">{title}</h2>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </div>
      <div style={{ width: '100%', minHeight: 220 }}>
        {children}
      </div>
    </div>
  )
}

function ChartPlaceholder({ text }: { text: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-slate-200 text-xs text-slate-400">
      {text}
    </div>
  )
}

function StatCard({ icon, label, value, tone = '#005f8d' }: {
  icon: IconName
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className="mb-2 flex size-9 items-center justify-center rounded-xl"
            style={{ background: `${tone}18`, color: tone }}>
        <Icon name={icon} size={17} />
      </span>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold" data-testid="stat-value">{value}</p>
    </div>
  )
}

function QuickAction({ icon, title, hint, onClick }: { icon: IconName; title: string; hint?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} data-testid={`quick-${icon}`}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-start shadow-sm transition-shadow hover:shadow-md">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
        <Icon name={icon} size={18} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold">{title}</span>
        {hint && <span className="block truncate text-xs text-slate-500">{hint}</span>}
      </span>
    </button>
  )
}
