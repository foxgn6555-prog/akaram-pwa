import { useState } from 'react'
import { useIntegrationLogs } from '@features/integrations'
import { useDbOverview } from '@features/system'
import { formatRelative } from '@lib/utils/date.utils'
import { formatFileSize } from '@lib/utils/file.utils'
import { Icon, type IconName } from '@components/ui/Icon/Icon'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import clsx from 'clsx'

/**
 * وحدة التحديثات والمراقبة — نبض النظام الحي:
 *  · صحة القاعدة (حجم/جداول)
 *  · سجل التكاملات الحي (بصمة/GPS): كل دفعة قُبلت أو رُفضت
 *  · إصدار النظام
 */
const PROVIDER_LABELS: Record<string, string> = {
  biometric: 'أجهزة البصمة',
  gps: 'تتبع GPS',
}

const STATUS_STYLES: Record<string, string> = {
  success: 'bg-emerald-100 text-emerald-700',
  error: 'bg-red-100 text-red-700',
  rejected: 'bg-amber-100 text-amber-700',
}

const STATUS_ICONS: Record<string, IconName> = {
  success: 'check-square',
  error: 'alert-triangle',
  rejected: 'x',
}

export default function UpdatesPage() {
  const [providerFilter, setProviderFilter] = useState<string | ''>('')
  const { data: overview } = useDbOverview()
  const { data: logs, isLoading, refetch, isRefetching } = useIntegrationLogs(providerFilter || undefined)

  const successCount = logs?.filter((l) => l.status === 'success').length ?? 0
  const errorCount = logs?.filter((l) => l.status !== 'success').length ?? 0

  return (
    <section aria-labelledby="updates-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="updates-title" className="text-lg font-bold">التحديثات والمراقبة</h1>
          <p className="text-sm text-slate-500">نبض النظام الحي — كل نداء تكامل يُسجل هنا لحظياً</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void refetch()} disabled={isRefetching}
            data-testid="refresh-logs"
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
            <Icon name="refresh" size={14} className={isRefetching ? 'animate-spin' : ''} />
            {isRefetching ? 'جارٍ…' : 'تحديث'}
          </button>
          <select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            data-testid="logs-filter"
            className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm"
          >
            <option value="">كل التكاملات</option>
            <option value="biometric">أجهزة البصمة</option>
            <option value="gps">تتبع GPS</option>
          </select>
        </div>
      </div>

      {/* بطاقات الحالة */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="updates-stats">
        <StatCard icon="database" label="حجم القاعدة" value={formatFileSize(overview?.db_size_bytes ?? 0)} />
        <StatCard icon="list" label="الجداول" value={`${overview?.tables_count ?? 0}`} />
        <StatCard icon="check-square" label="نداءات ناجحة" value={`${successCount}`} tone="emerald" />
        <StatCard icon="alert-triangle" label="أخطاء/رفض" value={`${errorCount}`} tone={errorCount > 0 ? 'red' : 'slate'} />
      </div>

      {/* السجل الحي */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-bold">سجل التكاملات المباشر</h2>
        </div>
        {isLoading ? (
          <LoadingSpinner label="جارٍ قراءة السجل…" />
        ) : logs && logs.length > 0 ? (
          <ul className="divide-y divide-slate-50" data-testid="logs-list">
            {logs.slice(0, 50).map((log) => (
              <li key={log.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className={clsx(
                  'flex size-7 shrink-0 items-center justify-center rounded-lg',
                  STATUS_STYLES[log.status] ?? 'bg-slate-100 text-slate-500',
                )}>
                  <Icon name={STATUS_ICONS[log.status] ?? 'activity'} size={13} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-slate-700">
                    {PROVIDER_LABELS[log.provider] ?? log.provider}
                    {log.endpoint && <span className="text-slate-400" dir="ltr"> · {log.endpoint}</span>}
                  </span>
                  {log.error_note && (
                    <span className="block text-[11px] text-red-600" dir="ltr">{log.error_note}</span>
                  )}
                </span>
                <span className="shrink-0 text-[11px] text-slate-400">{formatRelative(log.created_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-8 text-center text-sm text-slate-400" data-testid="no-logs">
            لا سجلات بعد — ستظهر هنا تلقائياً مع أول دفعة من الأجهزة أو المزودين
          </p>
        )}
      </div>
    </section>
  )
}

function StatCard({ icon, label, value, tone = 'brand' }: {
  icon: IconName
  label: string
  value: string
  tone?: 'brand' | 'emerald' | 'red' | 'slate'
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
    slate: 'bg-slate-100 text-slate-500',
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className={clsx('mb-2 flex size-9 items-center justify-center rounded-xl', tones[tone])}>
        <Icon name={icon} size={17} />
      </span>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  )
}
