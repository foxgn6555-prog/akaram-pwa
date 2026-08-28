import { useNavigate } from 'react-router'
import { UnitHub, type HubPageLink } from '@components/layout/UnitHub'
import { useDbOverview, useErrorLogs } from '@features/system'
import { formatFileSize } from '@lib/utils/file.utils'
import { formatNumber as fmtNum } from '@lib/utils/format.utils'

import { formatRelative } from '@lib/utils/date.utils'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

/** صفحة وحدة قاعدة البيانات — روابط صفحاتها + تقاريرها المجمعة */
const PAGES: readonly HubPageLink[] = [
  { path: '/it/database/tables', label: 'الجداول والأعمدة', hint: 'استعراض الجداول وبنيتها', icon: 'list' },
  { path: '/it/database/errors', label: 'أخطاء التطبيق', hint: 'سجل الأخطاء وحلّها', icon: 'activity' },
]

export default function DatabaseHub() {
  const navigate = useNavigate()
  const { data: overview, isLoading } = useDbOverview()
  const { data: openErrors } = useErrorLogs({ resolved: false })

  if (isLoading) return <LoadingSpinner label="جارٍ قراءة حالة القاعدة…" />

  const openCount = overview?.open_errors ?? openErrors?.length ?? 0

  return (
    <UnitHub
      title="وحدة قاعدة البيانات"
      description="مراقبة صحة القاعدة والجداول وسجل أخطاء التطبيق — كل صفحات الوحدة أدناه"
      pages={PAGES}
      testId="hub-database"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {/* تقرير: صحة القاعدة */}
        <div className="grid grid-cols-2 gap-3" data-testid="db-stats">
          <MiniStat label="حجم القاعدة" value={formatFileSize(overview?.db_size_bytes ?? 0)} />
          <MiniStat label="الجداول" value={fmtNum(overview?.tables_count ?? 0)} />
          <MiniStat label="إجمالي الصفوف" value={`≈ ${fmtNum(overview?.total_rows ?? 0)}`} />
          <MiniStat label="أخطاء مفتوحة" value={fmtNum(openCount)} danger={openCount > 0} />
        </div>

        {/* تقرير: أحدث الأخطاء */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-500">أحدث الأخطاء المفتوحة</h3>
            <button onClick={() => navigate('/it/database/errors')}
                    className="text-[11px] text-brand-600 hover:underline">عرض الكل ←</button>
          </div>
          {openErrors && openErrors.length > 0 ? (
            <ul className="space-y-1.5" data-testid="db-recent-errors">
              {openErrors.slice(0, 4).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                  <span className="truncate text-xs text-slate-700" dir="auto">{e.message.slice(0, 55)}</span>
                  <span className="shrink-0 text-[10px] text-slate-400">{formatRelative(e.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-xs text-emerald-600">✓ لا أخطاء مفتوحة</p>
          )}
        </div>
      </div>
    </UnitHub>
  )
}

function MiniStat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`text-lg font-bold ${danger ? 'text-red-600' : 'text-slate-800'}`}>{value}</p>
    </div>
  )
}
