import { useNavigate } from 'react-router'
import { useDbStats, useDbOverview } from '@features/system'
import { formatFileSize } from '@lib/utils/file.utils'
import { formatNumber as fmtNum } from '@lib/utils/format.utils'
import { Icon } from '@components/ui/Icon/Icon'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'

/**
 * وحدة قاعدة البيانات — نظرة عامة:
 * صحة القاعدة + أحجام الجداول + بوابة سجل الأخطاء.
 * البيانات من RPC آمنة (db_overview / db_stats) — بلا وصول مباشر لأي جدول نظام.
 */
export default function DatabaseOverview() {
  const navigate = useNavigate()
  const { data: overview, isLoading: oLoading } = useDbOverview()
  const { data: stats, isLoading: sLoading, refetch, isRefetching } = useDbStats()

  if (oLoading || sLoading) return <LoadingSpinner label="جارٍ قراءة إحصائيات القاعدة…" />

  if (!overview?.allowed) {
    return <EmptyState title="المراقبة محصورة بـ IT والإدارة العليا" hint="راجع أدوارك أو راجع HR" />
  }

  const totalRows = stats?.reduce((sum, s) => sum + s.row_estimate, 0) ?? overview.total_rows ?? 0
  const openErrors = overview.open_errors ?? 0

  return (
    <section aria-labelledby="db-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="db-title" className="text-lg font-bold">قاعدة البيانات — نظرة عامة</h1>
          <p className="text-sm text-slate-500" dir="ltr">
            PostgreSQL {overview.version} · بدء الخدمة: {overview.started_at ? new Date(overview.started_at).toLocaleString('ar') : '—'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void refetch()} disabled={isRefetching}>
            <Icon name="refresh" size={15} />
            {isRefetching ? 'جارٍ التحديث…' : 'تحديث'}
          </Button>
          <Button onClick={() => navigate('/it/database/errors')} data-testid="goto-errors">
            <Icon name="activity" size={15} />
            أخطاء التطبيق {openErrors > 0 && `(${openErrors})`}
          </Button>
        </div>
      </div>

      {/* بطاقات الصحة */}
      <div className="grid gap-4 sm:grid-cols-3" data-testid="db-cards">
        <StatCard icon="database"  label="حجم القاعدة"     value={formatFileSize(overview.db_size_bytes ?? 0)} />
        <StatCard icon="list"      label="الجداول العامة"   value={`${fmtNum(overview.tables_count ?? 0)} جدولاً`} />
        <StatCard icon="bar-chart" label="إجمالي الصفوف"    value={`≈ ${fmtNum(totalRows)}`} />
      </div>

      {/* جدول الجداول */}
      {stats && stats.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-0 sm:min-w-[640px] text-sm" data-testid="db-tables">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-xs text-slate-500">
                <th className="px-4 py-3 text-start font-semibold">الجدول</th>
                <th className="px-4 py-3 text-start font-semibold">الصفوف (تقديري)</th>
                <th className="px-4 py-3 text-start font-semibold">الحجم</th>
                <th className="hidden px-4 py-3 text-start font-semibold md:table-cell">مسح تسلسلي</th>
                <th className="hidden px-4 py-3 text-start font-semibold md:table-cell">مسح فهرسي</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr
                  key={s.table_name}
                  onClick={() => navigate(`/it/database/tables/${s.table_name}`)}
                  className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-brand-50/40"
                  title="عرض تفاصيل الجدول"
                >
                  <td className="px-4 py-3 font-medium" dir="ltr">
                    <span className="inline-flex items-center gap-1.5">
                      {s.table_name}
                      <Icon name="chevron-left" size={13} className="text-slate-300" />
                    </span>
                  </td>
                  <td className="px-4 py-3">{fmtNum(s.row_estimate)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatFileSize(s.total_bytes)}</td>
                  <td className="hidden px-4 py-3 text-slate-500 md:table-cell">{fmtNum(s.seq_scan)}</td>
                  <td className="hidden px-4 py-3 text-slate-500 md:table-cell">{fmtNum(s.idx_scan)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="لا توجد إحصائيات جداول بعد" hint="ستظهر بعد أول عمليات على البيانات" />
      )}
    </section>
  )
}

function StatCard(props: { icon: 'database' | 'list' | 'bar-chart'; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
        <Icon name={props.icon} size={20} />
      </span>
      <div>
        <p className="text-xs text-slate-500">{props.label}</p>
        <p className="text-base font-bold" data-testid="stat-value">{props.value}</p>
      </div>
    </div>
  )
}
