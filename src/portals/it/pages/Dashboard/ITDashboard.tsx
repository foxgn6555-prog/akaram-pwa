/**
 * بوابة التطوير المركزية — وحدة «الرئيسية» (اللوحة الحية)
 *  · ترحيب ذكي باسم المستخدم ودوره + تاريخ عربي
 *  · مؤشرات المنظومة: قاعدة البيانات · المستخدمون · الفروع · البصمة · GPS
 *    · البوابات الديناميكية · الأرشيف — كلها من مصادر حقيقية (RPC/REST)
 *  · زر «تحديث الآن» + تحديث تلقائي كل دقيقة (قياس latency + إنعاش الاستعلامات)
 *  · الرسوم الحقيقية: الاتصال · حجم الجداول · أداء التحميل · الأدوار · التكاملات
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { useDbOverview, useDbStats, useErrorLogs } from '@features/system'
import { useUsers } from '@features/user-management'
import { useConnectionHistory, useLiveLatency } from '@features/metrics'
import { useIntegrationLogs, useDevices, useVehicles, useProviders } from '@features/integrations'
import { useBranches } from '@features/branches'
import { usePortals } from '@features/portals'
import { useArchiveCounts } from '@features/archive'
import { useAuth } from '@features/auth/hooks/useAuth'
import { ROLE_LABELS } from '@lib/constants/roles.constants'
import { formatFileSize } from '@lib/utils/file.utils'
import { formatNumber as fmtNum } from '@lib/utils/format.utils'
import { formatDate, formatDateTime, formatRelative } from '@lib/utils/date.utils'
import { truncate } from '@lib/utils/string.utils'
import { Icon } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { ChartCard, ChartPlaceholder, QuickAction, StatCard } from './DashboardWidgets'

export default function ITDashboard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: session } = useAuth()
  const { data: overview, isLoading: oLoading } = useDbOverview()
  const { data: dbStats } = useDbStats()
  const { data: users } = useUsers()
  const { data: connHistory } = useConnectionHistory()
  const liveLatency = useLiveLatency()
  const { data: logs } = useIntegrationLogs()
  const { data: openErrors } = useErrorLogs({ resolved: false })
  const { data: branches } = useBranches(true)
  const { data: devices } = useDevices()
  const { data: vehicles } = useVehicles()
  const { data: providers } = useProviders()
  const { data: dynPortals } = usePortals()
  const { data: archivedCounts } = useArchiveCounts()

  // زر «تحديث الآن» + التحديث التلقائي: قياس فعلي + إنعاش كل استعلامات اللوحة
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const refresh = useCallback(() => {
    liveLatency.mutate()
    void queryClient.invalidateQueries()
    setLastRefresh(new Date())
    // liveLatency ثابت الهوية (mutate من TanStack Query) — queryClient ثابت دائماً
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient])

  // قياس فعلي عند التحميل ثم كل دقيقة تلقائياً
  useEffect(() => {
    refresh()
    const timer = window.setInterval(refresh, 60_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  // آخر قياس فعلي + إحصاءاته
  const lastSample = connHistory && connHistory.length > 0 ? connHistory[connHistory.length - 1] : null
  const latency = lastSample?.ms ?? 0
  const latencies = (connHistory ?? []).map((c) => c.ms)
  const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0
  const minLatency = latencies.length > 0 ? Math.min(...latencies) : 0
  const maxLatency = latencies.length > 0 ? Math.max(...latencies) : 0
  const latencyColor = latency === 0 ? '#94a3b8' : latency < 200 ? '#10b981' : latency < 500 ? '#f59e0b' : '#ef4444'

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

  // ── الترحيب الذكي ──
  const now = new Date()
  const hour = now.getHours()
  const greeting = hour >= 5 && hour < 12 ? 'صباح الخير' : hour >= 12 && hour < 17 ? 'نهارك سعيد' : 'مساء الخير'
  const displayName = session?.fullName ?? session?.email ?? 'مستخدم'
  const roleLabel = session ? ROLE_LABELS[session.primaryRole] : ''

  // ── مؤشرات المنظومة (كلها حقيقية) ──
  const userCount = users?.length ?? 0
  const noRoleCount = users?.filter((u) => u.roles.length === 0).length ?? 0
  const openErrorsCount = overview?.open_errors ?? 0
  const activeBranches = branches?.filter((b) => b.is_active).length ?? 0
  const activeDevices = devices?.filter((d) => d.is_active).length ?? 0
  const activeVehicles = vehicles?.filter((v) => v.is_active).length ?? 0
  const activePortals = dynPortals?.filter((p) => p.is_active).length ?? 0
  const archivedTotal = (archivedCounts ?? []).reduce((sum, c) => sum + c.count, 0)
  const recentErrors = (openErrors ?? []).slice(0, 3)

  // توزيع الأدوار (حقيقي)
  const roleCounts = new Map<string, number>()
  for (const u of users ?? []) for (const r of u.roles) roleCounts.set(r, (roleCounts.get(r) ?? 0) + 1)
  const roleData = [...roleCounts.entries()].map(([role, count]) => ({
    name: ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role,
    value: count,
  }))

  // تكاملات آخر سجلات (نجاح/رفض/خطأ)
  const integrationStats = [
    { name: 'ناجح', value: logs?.filter((l) => l.status === 'success').length ?? 0 },
    { name: 'مرفوض', value: logs?.filter((l) => l.status === 'rejected').length ?? 0 },
    { name: 'خطأ', value: logs?.filter((l) => l.status === 'error').length ?? 0 },
  ]

  // أعلى الجداول حسب الحجم (من pg_stat) + تاريخ الاتصال
  const topTables = (dbStats ?? []).slice(0, 6).map((s) => ({
    name: s.table_name.slice(0, 12),
    حجم: Math.round(s.total_bytes / 1024),
  }))
  const connData = (connHistory ?? []).map((h) => ({
    time: new Date(h.at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }),
    latency: h.ms,
  }))

  return (
    <section aria-labelledby="it-dash-title" className="space-y-5">
      {/* ── الترحيب الذكي + شريط التحديث ── */}
      <div className="flex flex-col gap-3 rounded-2xl bg-brand-700 p-5 text-white shadow-md sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 id="it-dash-title" className="text-lg font-bold" data-testid="dash-greeting">
            {greeting}، {displayName}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/80">
            {roleLabel && (
              <span className="rounded-full bg-white/15 px-2 py-0.5 font-bold" data-testid="dash-role">{roleLabel}</span>
            )}
            <span>{formatDate(now, 'EEEE، d MMMM yyyy')}</span>
            <span>· لوحة التطوير المركزية الحية</span>
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-white/80">
          <span>
            آخر تحديث: <b data-testid="last-refresh">{lastRefresh ? formatDateTime(lastRefresh) : '…'}</b>
          </span>
          <button
            onClick={refresh}
            data-testid="refresh-now"
            className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 font-bold text-white transition-colors hover:bg-white/25"
          >
            <Icon name="refresh" size={14} /> تحديث الآن
          </button>
        </div>
      </div>

      {/* ── البطاقات الحية (مؤشرات المنظومة) ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="dash-stats">
        <StatCard icon="wifi-off" label="زمن الاستجابة" value={latency > 0 ? `${latency} م.ث` : '…'} tone={latencyColor} />
        <StatCard icon="database" label="حجم القاعدة" value={formatFileSize(overview?.db_size_bytes ?? 0)} />
        <StatCard icon="users" label="المستخدمون" value={fmtNum(userCount)} onClick={() => navigate('/it/user-management/list')} />
        <StatCard icon="user" label="بلا أدوار" value={fmtNum(noRoleCount)}
                  tone={noRoleCount > 0 ? '#f59e0b' : '#10b981'} onClick={() => navigate('/it/user-management/list')} />
        <StatCard icon="alert-triangle" label="أخطاء مفتوحة" value={fmtNum(openErrorsCount)}
                  tone={openErrorsCount > 0 ? '#ef4444' : '#10b981'} onClick={() => navigate('/it/database/errors')} />
        <StatCard icon="layout-grid" label="الفروع النشطة" value={`${fmtNum(activeBranches)} / ${fmtNum(branches?.length ?? 0)}`}
                  onClick={() => navigate('/it/branches')} />
        <StatCard icon="fingerprint" label="أجهزة البصمة" value={`${fmtNum(activeDevices)} / ${fmtNum(devices?.length ?? 0)}`}
                  onClick={() => navigate('/it/integrations/biometric')} />
        <StatCard icon="truck" label="مركبات GPS" value={`${fmtNum(activeVehicles)} / ${fmtNum(vehicles?.length ?? 0)}`}
                  sub={`مزودون نشطون: ${fmtNum(providers?.filter((p) => p.is_active).length ?? 0)}`}
                  onClick={() => navigate('/it/integrations/gps')} />
        <StatCard icon="pie-chart" label="بوابات ديناميكية" value={`${fmtNum(activePortals)} / ${fmtNum(dynPortals?.length ?? 0)}`} />
        <StatCard icon="folder" label="سجلات مؤرشفة" value={fmtNum(archivedTotal)} onClick={() => navigate('/it/archive')} />
      </div>

      {/* ── شريط معلومات النظام الحي ── */}
      <div className="flex flex-wrap gap-4 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-2.5 text-[11px] text-slate-500">
        <span>PostgreSQL <b dir="ltr">{overview?.version ?? ''}</b></span>
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

      {/* ── آخر الأخطاء المفتوحة ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="recent-errors">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-700">آخر الأخطاء المفتوحة</h2>
          <button onClick={() => navigate('/it/database/errors')}
                  className="text-xs font-bold text-brand-700 hover:underline">
            عرض الكل ←
          </button>
        </div>
        {recentErrors.length === 0 ? (
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">
            لا أخطاء مفتوحة — كل شيء يعمل بكفاءة
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recentErrors.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2 text-xs">
                <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 font-bold text-red-700">{e.error_type}</span>
                <span className="min-w-0 flex-1 truncate text-slate-700">{truncate(e.message, 90)}</span>
                <span className="shrink-0 text-slate-400">{formatRelative(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── روابط سريعة للوحدات ── */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="quick-actions">
        <QuickAction icon="user-plus" title="إنشاء مستخدم" onClick={() => navigate('/it/user-management/create')} />
        <QuickAction icon="users" title="قائمة المستخدمين" onClick={() => navigate('/it/user-management/list')} />
        <QuickAction icon="layout-grid" title="الهيكل التنظيمي" onClick={() => navigate('/it/user-management/departments')} />
        <QuickAction icon="layout-grid" title="فروع الشركة" onClick={() => navigate('/it/branches')} />
        <QuickAction icon="shield" title="مصفوفة الصلاحيات" onClick={() => navigate('/it/permissions')} />
        <QuickAction icon="database" title="قاعدة البيانات" onClick={() => navigate('/it/database')} />
        <QuickAction icon="activity" title="أخطاء التطبيق" hint={`${openErrorsCount} مفتوح`} onClick={() => navigate('/it/database/errors')} />
        <QuickAction icon="wifi-off" title="التكاملات" onClick={() => navigate('/it/integrations')} />
        <QuickAction icon="refresh" title="التحديثات والمراقبة" onClick={() => navigate('/it/updates')} />
        <QuickAction icon="folder" title="الأرشيف" hint={`${fmtNum(archivedTotal)} سجل`} onClick={() => navigate('/it/archive')} />
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

